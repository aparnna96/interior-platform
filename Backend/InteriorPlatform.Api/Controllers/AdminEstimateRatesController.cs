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
/// Admin-managed Rate Master: the history of the ₹ per sq.ft. rate used for
/// new estimates, and the one write an Admin may make: setting a new rate.
/// Every endpoint requires the Admin role; Customers and FieldStaff are
/// rejected by authorization before any data is touched.
///
/// The history is append-only. There is no edit or delete: setting a rate
/// adds a row and deactivates the previous one, so what customers were quoted
/// is never lost. Existing estimates and proposals keep the rate they were
/// created with; only estimates created afterwards use the new rate.
/// </summary>
[ApiController]
[Route("api/admin/estimate-rates")]
[Authorize(Roles = "Admin")]
public class AdminEstimateRatesController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public AdminEstimateRatesController(ApplicationDbContext db)
    {
        _db = db;
    }

    // GET /api/admin/estimate-rates — the active rate and the full history,
    // newest first, with the setter's email resolved server-side.
    [HttpGet]
    public async Task<ActionResult<IEnumerable<AdminEstimateRateResponse>>> GetRates()
    {
        if (ResolveUserId() is null)
        {
            return Unauthorized();
        }

        var rates = await (
            from r in _db.EstimateRates.AsNoTracking()
            join u in _db.Users.AsNoTracking() on r.CreatedByUserId equals u.Id into setters
            from u in setters.DefaultIfEmpty()
            orderby r.CreatedAt descending
            select new AdminEstimateRateResponse
            {
                Id = r.Id,
                RatePerSquareFoot = r.RatePerSquareFoot,
                IsActive = r.IsActive,
                CreatedAt = r.CreatedAt,
                CreatedByEmail = u != null ? u.Email : null,
            })
            .ToListAsync();

        return Ok(rates);
    }

    // POST /api/admin/estimate-rates — make a new rate the active one.
    // The body carries only the rate: id, active flag, timestamp and the
    // acting Admin are all server-derived. Setting the rate that is already
    // active is a harmless no-op (200, nothing added) so a double click or a
    // retry cannot pollute the history. A race with another Admin that the
    // database catches is a 409 asking the caller to reload.
    [HttpPost]
    public async Task<ActionResult<AdminEstimateRateResponse>> SetRate(
        [FromBody] SetEstimateRateRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var problem = EstimateRateRules.Validate(request.RatePerSquareFoot);
        if (problem is not null)
        {
            ModelState.AddModelError(nameof(SetEstimateRateRequest.RatePerSquareFoot), problem);
            return ValidationProblem(ModelState);
        }

        var email = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.Email)
            .FirstOrDefaultAsync();

        try
        {
            await using var transaction = await _db.Database.BeginTransactionAsync();

            var current = await _db.EstimateRates.Where(r => r.IsActive).ToListAsync();
            if (current.Count == 1 && current[0].RatePerSquareFoot == request.RatePerSquareFoot)
            {
                return Ok(ToResponse(current[0], await EmailOfAsync(current[0].CreatedByUserId)));
            }

            // Deactivate first and save, so the unique index on the active row
            // is never violated by the insert that follows.
            foreach (var old in current)
            {
                old.IsActive = false;
            }

            await _db.SaveChangesAsync();

            var created = new EstimateRate
            {
                Id = Guid.NewGuid(),
                RatePerSquareFoot = request.RatePerSquareFoot,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = userId,
            };
            _db.EstimateRates.Add(created);
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();

            return StatusCode(StatusCodes.Status201Created, ToResponse(created, email));
        }
        catch (DbUpdateException)
        {
            // Another Admin changed the rate at the same moment. Nothing from
            // this request was committed.
            return Problem(
                title: "The rate was changed by someone else. Reload and try again.",
                statusCode: StatusCodes.Status409Conflict);
        }
    }

    private async Task<string?> EmailOfAsync(string? userId) =>
        userId is null
            ? null
            : await _db.Users.AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => u.Email)
                .FirstOrDefaultAsync();

    private static AdminEstimateRateResponse ToResponse(EstimateRate rate, string? email) => new()
    {
        Id = rate.Id,
        RatePerSquareFoot = rate.RatePerSquareFoot,
        IsActive = rate.IsActive,
        CreatedAt = rate.CreatedAt,
        CreatedByEmail = email,
    };

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
}
