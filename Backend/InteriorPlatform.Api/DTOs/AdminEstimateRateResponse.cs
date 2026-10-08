namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// One row of the Admin rate history. Only the setter's email leaves the
/// server — never password hashes, tokens or other account data.
/// </summary>
public class AdminEstimateRateResponse
{
    public Guid Id { get; set; }

    /// <summary>₹ per sq.ft.</summary>
    public decimal RatePerSquareFoot { get; set; }

    /// <summary>True for the single rate new estimates use.</summary>
    public bool IsActive { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Email of the Admin who set the rate; null for the seeded rate.</summary>
    public string? CreatedByEmail { get; set; }
}
