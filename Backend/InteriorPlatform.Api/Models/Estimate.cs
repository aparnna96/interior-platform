namespace InteriorPlatform.Api.Models;

/// <summary>
/// A customer-owned saved interior room estimate. Area, rate and amount are
/// computed server-side at creation time — never supplied by the client.
/// <see cref="CreatedAt"/> is always set from server-side application code
/// (UTC). There is intentionally no payment, proposal, PDF, approval or
/// status data in this milestone.
/// </summary>
public class Estimate
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    /// <summary>Owner (AspNetUsers.Id). Never accepted from the client.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Room width in feet. Always greater than zero.</summary>
    public decimal Width { get; set; }

    /// <summary>Room length in feet. Always greater than zero.</summary>
    public decimal Length { get; set; }

    /// <summary>Width × Length in sq.ft., computed server-side.</summary>
    public decimal Area { get; set; }

    /// <summary>Illustrative rate snapshot in ₹ per sq.ft.</summary>
    public decimal RatePerSquareFoot { get; set; }

    /// <summary>Area × RatePerSquareFoot, computed server-side.</summary>
    public decimal EstimatedAmount { get; set; }

    /// <summary>Server-set UTC creation time.</summary>
    public DateTime CreatedAt { get; set; }
}
