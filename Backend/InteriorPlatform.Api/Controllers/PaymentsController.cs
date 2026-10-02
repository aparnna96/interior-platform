using InteriorPlatform.Api.Configuration;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using InteriorPlatform.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Razorpay TEST-mode token payments against the authenticated customer's
/// proposals. The backend is the sole authority for the token amount
/// (configuration), proposal ownership (claims + persisted state), payment
/// status transitions, and signature verification (Key Secret, server-side
/// only). The request bodies carry no money, no ownership and no outcomes —
/// Razorpay Checkout values are verified, never trusted.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PaymentsController : ControllerBase
{
    /// <summary>Provider identifier persisted on every payment attempt.</summary>
    private const string RazorpayProvider = "Razorpay";

    private readonly ApplicationDbContext _db;
    private readonly IOptions<PaymentsOptions> _payments;
    private readonly IOptions<RazorpayOptions> _razorpay;
    private readonly IRazorpayPaymentGateway _gateway;

    public PaymentsController(
        ApplicationDbContext db,
        IOptions<PaymentsOptions> payments,
        IOptions<RazorpayOptions> razorpay,
        IRazorpayPaymentGateway gateway)
    {
        _db = db;
        _payments = payments;
        _razorpay = razorpay;
        _gateway = gateway;
    }

    // POST /api/proposals/{proposalId}/payment — create (or reuse) the token
    // payment order for one of the current user's proposals. The body carries
    // nothing: amount and currency come from backend configuration, so the
    // client can influence neither. Retries reuse an open Created attempt;
    // a Verified proposal is rejected instead of double-charging.
    [HttpPost("/api/proposals/{proposalId:guid}/payment")]
    public async Task<ActionResult<CreatePaymentResponse>> CreatePayment(Guid proposalId)
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        // Defensive re-check (startup already validates these): never mint a
        // payment order from bad configuration.
        var tokenAmount = _payments.Value.TokenAmount;
        var currency = _payments.Value.Currency;
        if (tokenAmount <= 0 || string.IsNullOrWhiteSpace(currency))
        {
            return Problem(
                title: "Payments are not configured correctly.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        var keyId = _gateway.KeyId;
        if (string.IsNullOrWhiteSpace(keyId))
        {
            return Problem(
                title: "Payments are not available. Razorpay credentials are missing.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        // Ownership is enforced here: another user's proposal (or a missing
        // one) is reported the same way (404) so ids cannot be probed.
        var proposal = await _db.Proposals
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == proposalId && p.UserId == userId);
        if (proposal is null)
        {
            return NotFound();
        }

        // Case C: one verified token payment per proposal — never another.
        if (await _db.Payments.AnyAsync(p =>
                p.ProposalId == proposalId && p.Status == PaymentStatus.Verified))
        {
            return Problem(
                title: "This proposal already has a verified token payment.",
                statusCode: StatusCodes.Status409Conflict);
        }

        // Case B: an open Created attempt already holds a provider order —
        // hand it back instead of minting unlimited orders on retry.
        var existing = await _db.Payments
            .AsNoTracking()
            .Where(p => p.ProposalId == proposalId
                && p.UserId == userId
                && p.Status == PaymentStatus.Created
                && p.ProviderOrderId != null)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync();
        if (existing is not null)
        {
            return Ok(ToCreateResponse(existing, keyId));
        }

        // Razorpay takes the smallest currency unit (paise for INR).
        // Decimal-only arithmetic: floating point must never touch money.
        var paiseValue = tokenAmount * 100m;
        if (paiseValue != decimal.Truncate(paiseValue)
            || paiseValue <= 0
            || paiseValue > long.MaxValue)
        {
            return Problem(
                title: "Payments are not configured correctly.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
        var paise = (long)paiseValue;

        var now = DateTime.UtcNow;
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            ProposalId = proposalId,
            UserId = userId,
            Amount = tokenAmount,
            Currency = currency,
            Status = PaymentStatus.Created,
            Provider = RazorpayProvider,
            CreatedAt = now,
        };

        // The external order is created BEFORE the local transaction opens:
        // there is no distributed atomicity across Razorpay and SQL Server,
        // so the network call is kept outside the database transaction. A
        // provider failure leaves no local record behind.
        RazorpayOrderResult order;
        try
        {
            order = await _gateway.CreateOrderAsync(paise, currency, payment.Id.ToString("N"));
        }
        catch (InvalidOperationException ex)
        {
            return Problem(
                title: ex.Message,
                statusCode: StatusCodes.Status500InternalServerError);
        }
        catch (RazorpayGatewayException ex)
        {
            return Problem(
                title: ex.Message,
                statusCode: StatusCodes.Status502BadGateway);
        }

        payment.ProviderOrderId = order.OrderId;

        await using var transaction = await _db.Database.BeginTransactionAsync();
        _db.Payments.Add(payment);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return StatusCode(StatusCodes.Status201Created, ToCreateResponse(payment, keyId));
    }

    // POST /api/payments/verify — verify a Checkout result against the
    // persisted attempt. Only the HMAC signature (computed server-side with
    // the Key Secret) can flip a payment to Verified. Already-verified
    // payments succeed idempotently so dropped responses stay retry-safe.
    [HttpPost("verify")]
    public async Task<ActionResult<VerifyPaymentResponse>> VerifyPayment(
        [FromBody] VerifyPaymentRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (request.PaymentId == Guid.Empty)
        {
            ModelState.AddModelError(nameof(VerifyPaymentRequest.PaymentId), "PaymentId is required.");
            return ValidationProblem(ModelState);
        }

        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        // Ownership follows the existing convention: another user's payment
        // (or a missing one) is a 404 so ids cannot be probed.
        var payment = await _db.Payments
            .FirstOrDefaultAsync(p => p.Id == request.PaymentId && p.UserId == userId);
        if (payment is null)
        {
            return NotFound();
        }

        if (payment.Status == PaymentStatus.Verified)
        {
            return Ok(ToVerifyResponse(payment));
        }

        // The order id must be the one this attempt created — a Checkout
        // result for any other order cannot settle this record. The status
        // is left untouched so the open attempt stays retryable.
        if (!string.Equals(payment.ProviderOrderId, request.RazorpayOrderId, StringComparison.Ordinal))
        {
            ModelState.AddModelError(
                nameof(VerifyPaymentRequest.RazorpayOrderId),
                "The Razorpay order does not match this payment.");
            return ValidationProblem(ModelState);
        }

        var keySecret = _razorpay.Value.KeySecret;
        if (string.IsNullOrWhiteSpace(keySecret))
        {
            return Problem(
                title: "Payment verification is not available. Razorpay credentials are missing.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        var valid = RazorpaySignatureVerifier.Verify(
            keySecret,
            request.RazorpayOrderId,
            request.RazorpayPaymentId,
            request.RazorpaySignature);
        if (!valid)
        {
            // Definitive failure for these Checkout values: close this
            // attempt so a fresh one can be created (Case D). Never Verified.
            payment.Status = PaymentStatus.Failed;
            await _db.SaveChangesAsync();
            return Problem(
                title: "Payment signature verification failed.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        payment.ProviderPaymentId = request.RazorpayPaymentId;
        payment.ProviderSignature = request.RazorpaySignature;
        payment.Status = PaymentStatus.Verified;
        payment.VerifiedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(ToVerifyResponse(payment));
    }

    /// <summary>
    /// Derives the acting user from the authenticated identity only.
    /// The JWT carries the user id in the "sub" claim, mapped by the JWT
    /// handler to <see cref="ClaimTypes.NameIdentifier"/>. Null when the
    /// request is anonymous or the claim is unexpectedly missing — client
    /// data is never trusted here.
    /// </summary>
    private string? ResolveUserId()
    {
        if (User?.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        return User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
    }

    private static CreatePaymentResponse ToCreateResponse(Payment payment, string keyId) => new()
    {
        PaymentId = payment.Id,
        ProposalId = payment.ProposalId,
        Provider = payment.Provider,
        ProviderOrderId = payment.ProviderOrderId ?? string.Empty,
        Amount = payment.Amount,
        Currency = payment.Currency,
        ProviderKeyId = keyId,
    };

    private static VerifyPaymentResponse ToVerifyResponse(Payment payment) => new()
    {
        PaymentId = payment.Id,
        ProposalId = payment.ProposalId,
        Status = payment.Status,
        VerifiedAt = payment.VerifiedAt,
    };
}
