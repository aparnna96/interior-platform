using InteriorPlatform.Api.Configuration;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Customer-owned saved room estimates. The owning user, the area, the rate
/// and the amount are all derived server-side — the request carries only
/// room dimensions, so the client can influence neither ownership nor money.
/// Every lookup is scoped to the current user's estimates, so one customer
/// can never see another customer's estimates.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class EstimatesController : ControllerBase
{
    /// <summary>Upper bound blocking absurd dimensions (rooms are in feet).</summary>
    private const decimal MaxDimensionFt = 1000m;

    private readonly ApplicationDbContext _db;
    private readonly decimal _demoRatePerSquareFoot;

    public EstimatesController(ApplicationDbContext db, IOptions<EstimateOptions> options)
    {
        _db = db;
        _demoRatePerSquareFoot = options.Value.DemoRatePerSquareFoot;
        if (_demoRatePerSquareFoot <= 0)
        {
            throw new InvalidOperationException(
                "Estimates:DemoRatePerSquareFoot must be a positive value.");
        }
    }

    // POST /api/estimates — persist a server-calculated estimate.
    [HttpPost]
    public async Task<ActionResult<EstimateResponse>> CreateEstimate(
        [FromBody] CreateEstimateRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AddFieldErrors(request) || !ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var now = DateTime.UtcNow;
        var area = request.Width * request.Length;
        var estimate = new Estimate
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Width = request.Width,
            Length = request.Length,
            Area = area,
            RatePerSquareFoot = _demoRatePerSquareFoot,
            EstimatedAmount = area * _demoRatePerSquareFoot,
            CreatedAt = now,
        };

        _db.Estimates.Add(estimate);
        await _db.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetEstimate),
            new { id = estimate.Id },
            ToResponse(estimate));
    }

    // GET /api/estimates — current user's estimates, newest first.
    [HttpGet]
    public async Task<ActionResult<IEnumerable<EstimateResponse>>> GetEstimates()
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var estimates = await _db.Estimates
            .AsNoTracking()
            .Where(e => e.UserId == userId)
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => new EstimateResponse
            {
                Id = e.Id,
                Width = e.Width,
                Length = e.Length,
                Area = e.Area,
                RatePerSquareFoot = e.RatePerSquareFoot,
                EstimatedAmount = e.EstimatedAmount,
                CreatedAt = e.CreatedAt,
            })
            .ToListAsync();

        return Ok(estimates);
    }

    // GET /api/estimates/{id} — one of the current user's estimates.
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<EstimateResponse>> GetEstimate(Guid id)
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var estimate = await _db.Estimates
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);
        if (estimate is null)
        {
            return NotFound();
        }

        return Ok(ToResponse(estimate));
    }

    /// <summary>
    /// Authoritative dimension validation. Dimensions must be finite,
    /// positive and within a sane bound; anything else is a 400.
    /// (Non-finite JSON numbers never reach here: System.Text.Json rejects
    /// NaN/Infinity for decimal during deserialization with a 400.)
    /// </summary>
    private bool AddFieldErrors(CreateEstimateRequest request)
    {
        var valid = true;

        if (!IsValidDimension(request.Width))
        {
            ModelState.AddModelError(
                nameof(CreateEstimateRequest.Width),
                $"Width must be greater than 0 and at most {MaxDimensionFt} ft.");
            valid = false;
        }

        if (!IsValidDimension(request.Length))
        {
            ModelState.AddModelError(
                nameof(CreateEstimateRequest.Length),
                $"Length must be greater than 0 and at most {MaxDimensionFt} ft.");
            valid = false;
        }

        return valid;
    }

    private static bool IsValidDimension(decimal value) =>
        value > 0 && value <= MaxDimensionFt;

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

    private static EstimateResponse ToResponse(Estimate e) => new()
    {
        Id = e.Id,
        Width = e.Width,
        Length = e.Length,
        Area = e.Area,
        RatePerSquareFoot = e.RatePerSquareFoot,
        EstimatedAmount = e.EstimatedAmount,
        CreatedAt = e.CreatedAt,
    };
}
