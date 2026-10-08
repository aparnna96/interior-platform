using InteriorPlatform.Api.Configuration;
using InteriorPlatform.Api.Models;
using InteriorPlatform.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace InteriorPlatform.Api.Data;

/// <summary>
/// Seeds the first estimate rate from configuration
/// (<c>Estimates:DemoRatePerSquareFoot</c>) so a deployment keeps quoting the
/// same rate it used before the Rate Master existed. Idempotent and
/// non-destructive: it only inserts when the table has no rows at all, so an
/// Admin-set rate (or an Admin deliberately having none active) is never
/// overridden on a later startup.
/// </summary>
public static class EstimateRateSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        var db = services.GetRequiredService<ApplicationDbContext>();
        if (await db.EstimateRates.AnyAsync())
        {
            return;
        }

        var configured = services.GetRequiredService<IOptions<EstimateOptions>>().Value.DemoRatePerSquareFoot;
        var problem = EstimateRateRules.Validate(configured);
        if (problem is not null)
        {
            throw new InvalidOperationException(
                $"Estimates:DemoRatePerSquareFoot cannot seed the estimate rate. {problem}");
        }

        db.EstimateRates.Add(new EstimateRate
        {
            Id = Guid.NewGuid(),
            RatePerSquareFoot = configured,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = null,
        });

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Another instance may have seeded at the same moment (the unique
            // index on the active row rejects the second insert). Its row
            // stands; any other failure is real and must not be swallowed.
            db.ChangeTracker.Clear();
            if (!await db.EstimateRates.AsNoTracking().AnyAsync(r => r.IsActive))
            {
                throw;
            }
        }
    }
}
