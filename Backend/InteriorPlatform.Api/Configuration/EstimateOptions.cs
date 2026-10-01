namespace InteriorPlatform.Api.Configuration;

/// <summary>
/// Illustrative estimate settings bound from the "Estimates" configuration
/// section (see appsettings.{Environment}.json).
/// </summary>
public sealed class EstimateOptions
{
    public const string SectionName = "Estimates";

    /// <summary>
    /// Current illustrative rate in ₹ per sq.ft. used for new estimates.
    /// This is a DEMO rate for the frontend prototype, not a permanent
    /// business pricing rule. Must be a positive value; startup fails
    /// explicitly otherwise (see Program.cs).
    /// </summary>
    public decimal DemoRatePerSquareFoot { get; set; }
}
