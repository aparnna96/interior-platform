namespace InteriorPlatform.Api.Models;

/// <summary>
/// A single snapshot line inside a <see cref="Proposal"/>. Proposal lines come
/// from the source estimate's saved visualizer furniture
/// (<see cref="EstimateItem"/>), never from the shopping cart. For those lines
/// <see cref="ProductId"/> is null, <see cref="FurnitureType"/> and the
/// footprint are set, and the prices are 0 because visualizer furniture is
/// "to be quoted". Lines created before this change reference a catalogue
/// product (<see cref="ProductId"/> is the Products.Id slug) with price
/// snapshots, so historical proposals never depend on the current
/// <c>Product.Name</c> or <c>Product.Price</c>.
/// </summary>
public class ProposalItem
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    public Guid ProposalId { get; set; }

    /// <summary>
    /// Referenced product slug (Products.Id) for legacy catalogue lines;
    /// null for visualizer furniture lines.
    /// </summary>
    public string? ProductId { get; set; }

    /// <summary>Visualizer furniture key (e.g. "sofa"); null for catalogue lines.</summary>
    public string? FurnitureType { get; set; }

    /// <summary>Footprint width in feet for visualizer lines; null otherwise.</summary>
    public decimal? WidthFt { get; set; }

    /// <summary>Footprint length in feet for visualizer lines; null otherwise.</summary>
    public decimal? LengthFt { get; set; }

    /// <summary>Display name snapshot (product name or furniture name).</summary>
    public string ProductName { get; set; } = string.Empty;

    /// <summary>Price snapshot. 0 for unpriced visualizer furniture.</summary>
    public decimal UnitPrice { get; set; }

    /// <summary>Units of the item. Always 1-99.</summary>
    public int Quantity { get; set; }

    /// <summary>UnitPrice * Quantity, computed server-side. Decimal money.</summary>
    public decimal LineTotal { get; set; }

    public Proposal Proposal { get; set; } = null!;

    public Product? Product { get; set; }
}
