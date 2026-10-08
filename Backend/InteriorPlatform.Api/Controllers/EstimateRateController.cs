using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// The rate new estimates use. Public and read-only: the estimate preview is
/// available to visitors who are not logged in, and the rate is already shown
/// there. The response carries no user information. The authoritative
/// calculation still happens on the server when an estimate is saved, so
/// this value only drives the on-screen preview.
/// </summary>
[ApiController]
[Route("api/estimate-rate")]
public class EstimateRateController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public EstimateRateController(ApplicationDbContext db)
    {
        _db = db;
    }

    // GET /api/estimate-rate — the active rate. 503 when none is configured,
    // so the client shows "unavailable" instead of guessing a number.
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<EstimateRateResponse>> GetActiveRate()
    {
        var rate = await _db.EstimateRates
            .AsNoTracking()
            .Where(r => r.IsActive)
            .Select(r => new EstimateRateResponse
            {
                RatePerSquareFoot = r.RatePerSquareFoot,
                UpdatedAt = r.CreatedAt,
            })
            .FirstOrDefaultAsync();

        if (rate is null)
        {
            return Problem(
                title: "The estimate rate is not available right now.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return Ok(rate);
    }
}
