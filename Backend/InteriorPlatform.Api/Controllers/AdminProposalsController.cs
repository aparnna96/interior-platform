using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Read-only Admin view over all customer proposals and their token payment
/// attempts. Every endpoint requires the Admin role; Customers and
/// FieldStaff are rejected by authorization before any data is touched.
/// Customer endpoints keep enforcing ownership separately — this controller
/// never widens them. Proposal and payment data is exposed read-only: no
/// editing, deletion, refund, or status-mutation API exists, so none is
/// offered here. Only user ids and emails leave the server — never
/// password hashes, tokens, or provider secrets.
/// </summary>
[ApiController]
[Route("api/admin/proposals")]
[Authorize(Roles = "Admin")]
public class AdminProposalsController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public AdminProposalsController(ApplicationDbContext db)
    {
        _db = db;
    }

    // GET /api/admin/proposals — every proposal, newest first, with the
    // owner and contact email resolved server-side for operations, plus
    // payment state derived from persisted payments (Verified counts only).
    [HttpGet]
    public async Task<ActionResult<IEnumerable<AdminProposalResponse>>> GetProposals()
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var proposals = await (
            from p in _db.Proposals.AsNoTracking()
            join u in _db.Users.AsNoTracking() on p.UserId equals u.Id into owners
            from u in owners.DefaultIfEmpty()
            orderby p.CreatedAt descending
            select new AdminProposalResponse
            {
                Id = p.Id,
                UserId = p.UserId,
                CustomerEmail = u != null ? u.Email : null,
                EstimateId = p.EstimateId,
                Area = p.Area,
                RatePerSquareFoot = p.RatePerSquareFoot,
                EstimatedAmount = p.EstimatedAmount,
                Status = p.Status,
                CreatedAt = p.CreatedAt,
                IsPaymentVerified = _db.Payments.Any(pay =>
                    pay.ProposalId == p.Id &&
                    pay.UserId == p.UserId &&
                    pay.Status == PaymentStatus.Verified),
                PaymentAttemptCount = _db.Payments.Count(pay =>
                    pay.ProposalId == p.Id &&
                    pay.UserId == p.UserId),
            })
            .ToListAsync();

        return Ok(proposals);
    }

    // GET /api/admin/proposals/{id} — one proposal with snapshot lines and
    // payment attempts (newest first), regardless of owner. 404 when the
    // proposal does not exist.
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<AdminProposalDetailResponse>> GetProposal(Guid id)
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var proposal = await _db.Proposals
            .AsNoTracking()
            .Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == id);
        if (proposal is null)
        {
            return NotFound();
        }

        var email = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == proposal.UserId)
            .Select(u => u.Email)
            .FirstOrDefaultAsync();

        var payments = await _db.Payments
            .AsNoTracking()
            .Where(p => p.ProposalId == id && p.UserId == proposal.UserId)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new AdminProposalPaymentResponse
            {
                Id = p.Id,
                Status = p.Status,
                Provider = p.Provider,
                ProviderOrderId = p.ProviderOrderId,
                ProviderPaymentId = p.ProviderPaymentId,
                Amount = p.Amount,
                Currency = p.Currency,
                CreatedAt = p.CreatedAt,
                VerifiedAt = p.VerifiedAt,
            })
            .ToListAsync();

        return Ok(ToDetail(proposal, email, payments));
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

    private static AdminProposalDetailResponse ToDetail(
        Proposal proposal,
        string? customerEmail,
        List<AdminProposalPaymentResponse> payments) => new()
    {
        Id = proposal.Id,
        UserId = proposal.UserId,
        CustomerEmail = customerEmail,
        EstimateId = proposal.EstimateId,
        Width = proposal.Width,
        Length = proposal.Length,
        Area = proposal.Area,
        RatePerSquareFoot = proposal.RatePerSquareFoot,
        EstimatedAmount = proposal.EstimatedAmount,
        Status = proposal.Status,
        CreatedAt = proposal.CreatedAt,
        IsPaymentVerified = payments.Any(p => p.Status == PaymentStatus.Verified),
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
        Payments = payments,
    };
}
