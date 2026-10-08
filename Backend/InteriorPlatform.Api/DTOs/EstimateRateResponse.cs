namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// The rate new estimates use (GET /api/estimate-rate). Public: the rate is
/// already shown to every visitor in the estimate preview. Carries no user
/// information.
/// </summary>
public class EstimateRateResponse
{
    /// <summary>₹ per sq.ft.</summary>
    public decimal RatePerSquareFoot { get; set; }

    /// <summary>UTC time this rate was set.</summary>
    public DateTime UpdatedAt { get; set; }
}
