namespace InteriorPlatform.Api.Models;

/// <summary>
/// A frozen customer proposal snapshot created from one of the customer's
/// saved estimates. Dimension, rate and amount values are copied from the
/// <see cref="Estimate"/> at creation time and never follow later estimate
/// edits. Furniture/product lines are snapshotted into
/// <see cref="ProposalItem"/> rows from the customer's current cart at
/// creation time: later product, cart or visualizer changes never mutate a
/// created proposal. <see cref="CreatedAt"/> is always set from server-side
/// application code (UTC). There is intentionally no payment, PDF, approval
/// or token data in this milestone.
/// </summary>
public class Proposal
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    /// <summary>Owner (AspNetUsers.Id). Never accepted from the client.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Source estimate snapshot origin. Never accepted beyond its id.</summary>
    public Guid EstimateId { get; set; }

    /// <summary>Room width in feet, copied from the estimate.</summary>
    public decimal Width { get; set; }

    /// <summary>Room length in feet, copied from the estimate.</summary>
    public decimal Length { get; set; }

    /// <summary>Width × Length in sq.ft., copied from the estimate.</summary>
    public decimal Area { get; set; }

    /// <summary>Rate snapshot in ₹ per sq.ft., copied from the estimate.</summary>
    public decimal RatePerSquareFoot { get; set; }

    /// <summary>Area × RatePerSquareFoot, copied from the estimate.</summary>
    public decimal EstimatedAmount { get; set; }

    /// <summary>Always <see cref="ProposalStatus.Draft"/> at creation.</summary>
    public ProposalStatus Status { get; set; } = ProposalStatus.Draft;

    /// <summary>Server-set UTC creation time.</summary>
    public DateTime CreatedAt { get; set; }

    public Estimate Estimate { get; set; } = null!;

    public List<ProposalItem> Items { get; set; } = [];
}
