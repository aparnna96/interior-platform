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

    /// <summary>Per-line and per-merged-type quantity bounds (matches the DB check).</summary>
    private const int MaxItemQuantity = 99;

    /// <summary>Upper bound on furniture lines accepted in one request.</summary>
    private const int MaxItemLines = 50;

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

        // Visualizer furniture: same type lines are merged, name and
        // footprint come from the server-side catalogue.
        var merged = new Dictionary<string, (VisualizerFurnitureCatalogue.Entry Entry, int Quantity)>(
            StringComparer.OrdinalIgnoreCase);
        foreach (var line in request.Items ?? [])
        {
            VisualizerFurnitureCatalogue.TryGet(line.FurnitureType, out var entry);
            merged[entry.Type] = merged.TryGetValue(entry.Type, out var existing)
                ? (entry, existing.Quantity + line.Quantity)
                : (entry, line.Quantity);
        }

        foreach (var (entry, quantity) in merged.Values.OrderBy(v => v.Entry.Type, StringComparer.Ordinal))
        {
            if (quantity > MaxItemQuantity)
            {
                ModelState.AddModelError(
                    nameof(CreateEstimateRequest.Items),
                    $"At most {MaxItemQuantity} pieces of '{entry.Name}' can be saved.");
                return ValidationProblem(ModelState);
            }

            estimate.Items.Add(new EstimateItem
            {
                Id = Guid.NewGuid(),
                EstimateId = estimate.Id,
                FurnitureType = entry.Type,
                Name = entry.Name,
                WidthFt = entry.WidthFt,
                LengthFt = entry.LengthFt,
                Quantity = quantity,
            });
        }

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
            .Include(e => e.Items)
            .Where(e => e.UserId == userId)
            .OrderByDescending(e => e.CreatedAt)
            .ToListAsync();

        return Ok(estimates.Select(ToResponse).ToList());
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
            .Include(e => e.Items)
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

        var items = request.Items ?? [];
        if (items.Count > MaxItemLines)
        {
            ModelState.AddModelError(
                nameof(CreateEstimateRequest.Items),
                $"At most {MaxItemLines} furniture lines can be saved.");
            valid = false;
        }

        foreach (var line in items)
        {
            if (line is null || !VisualizerFurnitureCatalogue.TryGet(line.FurnitureType, out _))
            {
                ModelState.AddModelError(
                    nameof(CreateEstimateRequest.Items),
                    $"Unknown furniture type '{line?.FurnitureType}'.");
                valid = false;
            }
            else if (line.Quantity < 1 || line.Quantity > MaxItemQuantity)
            {
                ModelState.AddModelError(
                    nameof(CreateEstimateRequest.Items),
                    $"Furniture quantity must be between 1 and {MaxItemQuantity}.");
                valid = false;
            }
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
        Items = e.Items
            .OrderBy(i => i.FurnitureType, StringComparer.Ordinal)
            .Select(i => new EstimateItemResponse
            {
                FurnitureType = i.FurnitureType,
                Name = i.Name,
                WidthFt = i.WidthFt,
                LengthFt = i.LengthFt,
                Quantity = i.Quantity,
            })
            .ToList(),
    };
}
