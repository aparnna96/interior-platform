namespace InteriorPlatform.Api.Configuration;

/// <summary>
/// Illustrative estimate settings bound from the "Estimates" configuration
/// section (see appsettings.{Environment}.json).
/// </summary>
public sealed class EstimateOptions
{
    public const string SectionName = "Estimates";

    /// <summary>
    /// Bootstrap rate in ₹ per sq.ft. Only used to seed the first
    /// <c>EstimateRates</c> row when that table is empty; afterwards the
    /// Admin-managed Rate Master is the source of truth and this value is
    /// ignored. Must be a positive value; startup fails explicitly otherwise
    /// (see Program.cs).
    /// </summary>
    public decimal DemoRatePerSquareFoot { get; set; }
}
