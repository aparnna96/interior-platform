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
/// Public interior enquiry submission. Anonymous and authenticated visitors
/// can submit; no role is required. Server owns Id, UserId, Status and
/// CreatedAt — none are accepted from the client.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class LeadsController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public LeadsController(ApplicationDbContext db)
    {
        _db = db;
    }

    // POST /api/leads — public, anonymous or authenticated.
    [HttpPost]
    [AllowAnonymous]
    public async Task<ActionResult<LeadResponse>> CreateLead(
        [FromBody] LeadCreateRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AddFieldErrors(request) || !ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        // Optional product reference must resolve to an ACTIVE product.
        // Never leak database/EF exceptions for a bad reference.
        string? productId = NormalizeOptional(request.InterestedProductId);
        if (productId is not null)
        {
            var productActive = await _db.Products
                .AsNoTracking()
                .AnyAsync(p => p.Id == productId && p.IsActive);
            if (!productActive)
            {
                ModelState.AddModelError(
                    nameof(LeadCreateRequest.InterestedProductId),
                    "InterestedProductId must reference an active product.");
                return ValidationProblem(ModelState);
            }
        }

        var lead = new Lead
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Phone = request.Phone,
            Email = NormalizeOptional(request.Email),
            Message = request.Message,
            InterestedProductId = productId,
            UserId = ResolveUserId(),
            Status = LeadStatus.New,
            Source = NormalizeOptional(request.Source),
            CreatedAt = DateTime.UtcNow,
        };

        _db.Leads.Add(lead);
        await _db.SaveChangesAsync();

        // No GET-by-id endpoint exists yet, so there is no Location target;
        // return 201 with the created lead body.
        return StatusCode(StatusCodes.Status201Created, ToResponse(lead));
    }

    /// <summary>
    /// Rejects whitespace-only values that [Required] alone would accept.
    /// Returns false and records ModelState errors when invalid.
    /// </summary>
    private bool AddFieldErrors(LeadCreateRequest request)
    {
        var valid = true;

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            ModelState.AddModelError(nameof(LeadCreateRequest.Name), "Name is required.");
            valid = false;
        }

        if (string.IsNullOrWhiteSpace(request.Phone))
        {
            ModelState.AddModelError(nameof(LeadCreateRequest.Phone), "Phone is required.");
            valid = false;
        }

        if (string.IsNullOrWhiteSpace(request.Message))
        {
            ModelState.AddModelError(nameof(LeadCreateRequest.Message), "Message is required.");
            valid = false;
        }

        if (request.Email is not null && string.IsNullOrWhiteSpace(request.Email))
        {
            ModelState.AddModelError(nameof(LeadCreateRequest.Email), "Email must be a valid email address.");
            valid = false;
        }

        if (request.Source is not null && request.Source.Length > 0 &&
            string.IsNullOrWhiteSpace(request.Source))
        {
            ModelState.AddModelError(nameof(LeadCreateRequest.Source), "Source must not be blank.");
            valid = false;
        }

        if (request.InterestedProductId is not null &&
            request.InterestedProductId.Length > 0 &&
            string.IsNullOrWhiteSpace(request.InterestedProductId))
        {
            ModelState.AddModelError(
                nameof(LeadCreateRequest.InterestedProductId),
                "InterestedProductId must not be blank.");
            valid = false;
        }

        return valid;
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;

    /// <summary>
    /// Derives the submitting user from the authenticated identity only.
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

    private static LeadResponse ToResponse(Lead l) => new()
    {
        Id = l.Id,
        Name = l.Name,
        Phone = l.Phone,
        Email = l.Email,
        Message = l.Message,
        InterestedProductId = l.InterestedProductId,
        Source = l.Source,
        Status = l.Status,
        CreatedAt = l.CreatedAt,
    };
}
