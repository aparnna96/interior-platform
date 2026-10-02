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
/// product, cart or visualizer changes.
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

        return Ok(ToDetail(proposal));
    }

    // GET /api/proposals/{id}/pdf — download the client-ready proposal PDF
    // rendered from the persisted snapshot. Draft proposals may download;
    // payment gating arrives in a later milestone. The proposal is never
    // modified and no payment records are created.
    [HttpGet("{id:guid}/pdf")]
    public async Task<IActionResult> DownloadProposalPdf(Guid id)
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

        var pdf = ProposalPdfGenerator.Generate(proposal);
        return File(pdf, "application/pdf", $"proposal-{proposal.Id}.pdf");
    }

    // POST /api/proposals — snapshot one of the current user's estimates into
    // a Draft proposal. The body carries only the source estimate id: user,
    // dimensions, prices, names, totals, status and timestamps all come from
    // the server. Furniture lines snapshot the current user's cart at creation
    // time (product name + current price, line totals computed server-side);
    // the cart itself is left untouched.
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
            .FirstOrDefaultAsync(e => e.Id == request.EstimateId && e.UserId == userId);
        if (estimate is null)
        {
            return NotFound();
        }

        // Snapshot source: the customer's current cart (selected furniture).
        // An absent or empty cart still yields a valid dimension-only draft.
        var cartItems = await _db.CartItems
            .AsNoTracking()
            .Include(i => i.Cart)
            .Where(i => i.Cart.UserId == userId)
            .OrderBy(i => i.ProductId)
            .ToListAsync();

        Dictionary<string, Product> products = new();
        if (cartItems.Count > 0)
        {
            var productIds = cartItems.Select(i => i.ProductId).Distinct().ToList();
            products = await _db.Products
                .AsNoTracking()
                .Where(p => productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id);

            // Every line must still resolve to an active product. Validate all
            // lines before creating anything: no partial proposals. Missing
            // and inactive products are reported the same way (400) so a
            // stale cart cannot leak catalog state — same choice as orders.
            foreach (var item in cartItems)
            {
                if (!products.TryGetValue(item.ProductId, out var product) || !product.IsActive)
                {
                    ModelState.AddModelError(
                        "Cart",
                        $"Product '{item.ProductId}' is no longer available.");
                    return ValidationProblem(ModelState);
                }
            }
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

        foreach (var item in cartItems)
        {
            var product = products[item.ProductId];
            var unitPrice = (decimal)product.Price;
            var lineTotal = unitPrice * item.Quantity;
            proposal.Items.Add(new ProposalItem
            {
                Id = Guid.NewGuid(),
                ProposalId = proposal.Id,
                ProductId = product.Id,
                ProductName = product.Name,
                UnitPrice = unitPrice,
                Quantity = item.Quantity,
                LineTotal = lineTotal,
            });
        }

        _db.Proposals.Add(proposal);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetProposal), new { id = proposal.Id }, ToDetail(proposal));
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

    private static ProposalDetailResponse ToDetail(Proposal proposal) => new()
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
        Items = proposal.Items
            .OrderBy(i => i.ProductId)
            .Select(i => new ProposalItemResponse
            {
                Id = i.Id,
                ProductId = i.ProductId,
                ProductName = i.ProductName,
                UnitPrice = i.UnitPrice,
                Quantity = i.Quantity,
                LineTotal = i.LineTotal,
            })
            .ToList(),
    };
}
