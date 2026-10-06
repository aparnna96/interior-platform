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
/// Razorpay TEST-mode (or, when Payments:Mode=Demo, simulated) token payments against the authenticated customer's
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

    /// <summary>Provider identifier for simulated (Payments:Mode=Demo) payments.</summary>
    private const string DemoProvider = "Demo";

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

        var demo = _payments.Value.IsDemo;
        var provider = demo ? DemoProvider : RazorpayProvider;

        // Demo mode has no external gateway and therefore no key id.
        var keyId = demo ? string.Empty : _gateway.KeyId;
        if (!demo && string.IsNullOrWhiteSpace(keyId))
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
                && p.Provider == provider
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
            Provider = provider,
            CreatedAt = now,
        };

        if (demo)
        {
            // No provider call: the order id is a server-generated,
            // clearly-labelled demo reference.
            payment.ProviderOrderId = $"demo_order_{Guid.NewGuid():N}";
            _db.Payments.Add(payment);
            await _db.SaveChangesAsync();
            return StatusCode(StatusCodes.Status201Created, ToCreateResponse(payment, keyId));
        }

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

        // Demo payments never carry a provider signature: they can only be
        // settled through the demo confirm endpoint, never by this one.
        if (string.Equals(payment.Provider, DemoProvider, StringComparison.Ordinal))
        {
            return Problem(
                title: "Demo payments are confirmed through the demo confirmation step.",
                statusCode: StatusCodes.Status400BadRequest);
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

    // POST /api/payments/demo/confirm — Payments:Mode=Demo only. Marks the
    // caller's own open demo payment Verified without any gateway. In every
    // other mode this endpoint does not exist (404), so a production
    // deployment running Razorpay can never be unlocked through it.
    // Ownership follows the usual convention (another user's payment is a
    // 404), only Demo-provider payments qualify, and the body carries nothing
    // but our local payment id.
    [HttpPost("demo/confirm")]
    public async Task<ActionResult<VerifyPaymentResponse>> ConfirmDemoPayment(
        [FromBody] DemoConfirmPaymentRequest request)
    {
        if (!_payments.Value.IsDemo)
        {
            return NotFound();
        }

        if (!ModelState.IsValid || request.PaymentId == Guid.Empty)
        {
            ModelState.AddModelError(nameof(DemoConfirmPaymentRequest.PaymentId), "PaymentId is required.");
            return ValidationProblem(ModelState);
        }

        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var payment = await _db.Payments
            .FirstOrDefaultAsync(p => p.Id == request.PaymentId
                && p.UserId == userId
                && p.Provider == DemoProvider);
        if (payment is null)
        {
            return NotFound();
        }

        if (payment.Status == PaymentStatus.Verified)
        {
            return Ok(ToVerifyResponse(payment));
        }

        // One verified token payment per proposal, same rule as the real flow.
        if (await _db.Payments.AnyAsync(p =>
                p.ProposalId == payment.ProposalId && p.Status == PaymentStatus.Verified))
        {
            return Problem(
                title: "This proposal already has a verified token payment.",
                statusCode: StatusCodes.Status409Conflict);
        }

        payment.ProviderPaymentId = $"demo_pay_{Guid.NewGuid():N}";
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
