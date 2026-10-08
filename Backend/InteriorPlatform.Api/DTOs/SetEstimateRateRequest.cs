namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for POST /api/admin/estimate-rates. Only the rate is
/// accepted: the id, active flag, timestamp and the acting Admin are all
/// derived server-side.
/// </summary>
public class SetEstimateRateRequest
{
    /// <summary>
    /// ₹ per sq.ft. Validated by <see cref="Services.EstimateRateRules"/>:
    /// greater than 0, at most 100000, at most 2 decimal places.
    /// </summary>
    public decimal RatePerSquareFoot { get; set; }
}
