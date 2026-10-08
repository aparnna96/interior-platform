namespace InteriorPlatform.Api.Models;

/// <summary>
/// One entry in the Admin-managed estimate rate history (₹ per sq.ft.).
/// Rows are append-only: changing the rate adds a new row and deactivates the
/// previous one, so the history of what customers were quoted is never lost.
/// Exactly one row is active at a time (enforced by a filtered unique index).
/// New estimates read the active row; existing estimates and proposals keep
/// the rate they were created with.
/// </summary>
public class EstimateRate
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    /// <summary>₹ per sq.ft. Always greater than zero, at most 2 decimals.</summary>
    public decimal RatePerSquareFoot { get; set; }

    /// <summary>True for the single rate that new estimates use.</summary>
    public bool IsActive { get; set; }

    /// <summary>Server-set UTC time the rate was created.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Admin who set the rate (AspNetUsers.Id). Null for the rate seeded from
    /// configuration at startup. Never accepted from the client.
    /// </summary>
    public string? CreatedByUserId { get; set; }
}
