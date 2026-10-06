using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using InteriorPlatform.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Frozen customer proposals created from the authenticated customer's saved
/// estimates. The owning user, the source estimate snapshot (dimensions, rate
/// and amount), the furniture lines (product name/price snapshots with
/// server-computed line totals), the initial status
/// (<see cref="ProposalStatus.Draft"/>) and timestamps are all derived
/// server-side — the request carries only the source estimate id, so the
/// client can influence neither ownership nor money. Every lookup is scoped
/// to the current user's proposals, so one customer can never see another
/// customer's proposals. Created proposals never follow later estimate,
/// estimate, product or cart changes.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProposalsController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public ProposalsController(ApplicationDbContext db)
    {
        _db = db;
    }

    // GET /api/proposals — current user's proposals, newest first.
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProposalResponse>>> GetProposals()
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var proposals = await _db.Proposals
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new ProposalResponse
            {
                Id = p.Id,
                EstimateId = p.EstimateId,
                Status = p.Status,
                CreatedAt = p.CreatedAt,
                Area = p.Area,
                EstimatedAmount = p.EstimatedAmount,
            })
            .ToListAsync();

        return Ok(proposals);
    }

    // GET /api/proposals/{id} — one of the current user's proposals with lines.
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProposalDetailResponse>> GetProposal(Guid id)
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var proposal = await _db.Proposals
            .AsNoTracking()
            .Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (proposal is null)
        {
            return NotFound();
        }

        return Ok(ToDetail(proposal, await HasVerifiedPaymentAsync(id, userId)));
    }

    // GET /api/proposals/{id}/pdf — download the client-ready proposal PDF
    // rendered from the persisted snapshot. The PDF is downloadable if and
    // only if the proposal has a verified token payment: customers must
    // additionally own the proposal, while Admin users access any proposal
    // by role. FieldStaff gains nothing — ownership still fails for them.
    // This endpoint re-checks the database on every request: no client
    // state can unlock it. The proposal is never modified and no payment
    // records are created.
    [HttpGet("{id:guid}/pdf")]
    public async Task<IActionResult> DownloadProposalPdf(Guid id)
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isAdmin = User.IsInRole("Admin");
        var proposal = await _db.Proposals
            .AsNoTracking()
            .Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == id && (isAdmin || p.UserId == userId));
        if (proposal is null)
        {
            return NotFound();
        }

        if (!await HasVerifiedPaymentAsync(id, proposal.UserId))
        {
            return Problem(
                title: "Payment verification is required before the proposal PDF can be downloaded.",
                statusCode: StatusCodes.Status403Forbidden);
        }

        var pdf = ProposalPdfGenerator.Generate(proposal);
        return File(pdf, "application/pdf", $"proposal-{proposal.Id}.pdf");
    }

    // POST /api/proposals — snapshot one of the current user's estimates into
    // a Draft proposal. The body carries only the source estimate id: user,
    // dimensions, prices, names, totals, status and timestamps all come from
    // the server. Furniture lines are copied from the source estimate's saved
    // visualizer furniture; the shopping cart is never used as a source.
    [HttpPost]
    public async Task<ActionResult<ProposalDetailResponse>> CreateProposal(
        [FromBody] CreateProposalRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (request.EstimateId == Guid.Empty)
        {
            ModelState.AddModelError(
                nameof(CreateProposalRequest.EstimateId),
                "EstimateId is required.");
            return ValidationProblem(ModelState);
        }

        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        // Ownership is enforced here: another user's estimate (or a missing
        // one) is reported the same way (404) so ids cannot be probed.
        var estimate = await _db.Estimates
            .AsNoTracking()
            .Include(e => e.Items)
            .FirstOrDefaultAsync(e => e.Id == request.EstimateId && e.UserId == userId);
        if (estimate is null)
        {
            return NotFound();
        }

        var now = DateTime.UtcNow;
        var proposal = new Proposal
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            EstimateId = estimate.Id,
            Width = estimate.Width,
            Length = estimate.Length,
            Area = estimate.Area,
            RatePerSquareFoot = estimate.RatePerSquareFoot,
            EstimatedAmount = estimate.EstimatedAmount,
            Status = ProposalStatus.Draft,
            CreatedAt = now,
        };

        // Furniture lines are copied from the saved estimate's visualizer
        // furniture. The shopping cart is never read. Visualizer furniture is
        // not priced ("to be quoted"), so unit price and line total are 0 and
        // the proposal amount stays the area-based estimate.
        foreach (var item in estimate.Items.OrderBy(i => i.FurnitureType, StringComparer.Ordinal))
        {
            proposal.Items.Add(new ProposalItem
            {
                Id = Guid.NewGuid(),
                ProposalId = proposal.Id,
                ProductId = null,
                FurnitureType = item.FurnitureType,
                WidthFt = item.WidthFt,
                LengthFt = item.LengthFt,
                ProductName = item.Name,
                UnitPrice = 0m,
                Quantity = item.Quantity,
                LineTotal = 0m,
            });
        }

        _db.Proposals.Add(proposal);
        await _db.SaveChangesAsync();

        // A just-created proposal cannot have payments yet.
        return CreatedAtAction(nameof(GetProposal), new { id = proposal.Id }, ToDetail(proposal, isPaymentVerified: false));
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

    private static ProposalDetailResponse ToDetail(Proposal proposal, bool isPaymentVerified) => new()
    {
        Id = proposal.Id,
        EstimateId = proposal.EstimateId,
        Width = proposal.Width,
        Length = proposal.Length,
        Area = proposal.Area,
        RatePerSquareFoot = proposal.RatePerSquareFoot,
        EstimatedAmount = proposal.EstimatedAmount,
        Status = proposal.Status,
        CreatedAt = proposal.CreatedAt,
        IsPaymentVerified = isPaymentVerified,
        Items = proposal.Items
            .OrderBy(i => i.FurnitureType ?? i.ProductId, StringComparer.Ordinal)
            .Select(i => new ProposalItemResponse
            {
                Id = i.Id,
                ProductId = i.ProductId,
                FurnitureType = i.FurnitureType,
                WidthFt = i.WidthFt,
                LengthFt = i.LengthFt,
                ProductName = i.ProductName,
                UnitPrice = i.UnitPrice,
                Quantity = i.Quantity,
                LineTotal = i.LineTotal,
            })
            .ToList(),
    };

    /// <summary>
    /// Efficient existence check for the PDF/detail authorization rule: a
    /// verified token payment owned by the same user on the same proposal.
    /// No payment attempts are loaded.
    /// </summary>
    private async Task<bool> HasVerifiedPaymentAsync(Guid proposalId, string userId) =>
        await _db.Payments.AnyAsync(p =>
            p.ProposalId == proposalId &&
            p.UserId == userId &&
            p.Status == PaymentStatus.Verified);
}
