namespace InteriorPlatform.Api.Services;

/// <summary>
/// The one definition of a valid estimate rate, shared by the Admin endpoint
/// and the startup seeder so they can never disagree.
/// </summary>
public static class EstimateRateRules
{
    /// <summary>Upper bound that blocks typos (₹ per sq.ft.).</summary>
    public const decimal MaxRatePerSquareFoot = 100000m;

    /// <summary>Null when the rate is valid, otherwise the reason it is not.</summary>
    public static string? Validate(decimal rate)
    {
        if (rate <= 0 || rate > MaxRatePerSquareFoot)
        {
            return $"Rate must be greater than 0 and at most {MaxRatePerSquareFoot:0} per sq.ft.";
        }

        // Rejected, never silently rounded: the Admin sees exactly what is stored.
        if (decimal.Round(rate, 2) != rate)
        {
            return "Rate can have at most 2 decimal places.";
        }

        return null;
    }
}
