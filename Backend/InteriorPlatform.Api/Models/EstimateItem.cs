namespace InteriorPlatform.Api.Models;

/// <summary>
/// One furniture line saved with an <see cref="Estimate"/>: a visualizer
/// furniture type with its quantity. <see cref="Name"/> and the footprint are
/// resolved server-side from the visualizer catalogue, never taken from the
/// client. Proposals copy these lines; the shopping cart is never a source.
/// </summary>
public class EstimateItem
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    public Guid EstimateId { get; set; }

    /// <summary>Canonical visualizer furniture key (e.g. "sofa").</summary>
    public string FurnitureType { get; set; } = string.Empty;

    /// <summary>Display name from the visualizer catalogue (e.g. "Sofa").</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Footprint width in feet, from the visualizer catalogue.</summary>
    public decimal WidthFt { get; set; }

    /// <summary>Footprint length in feet, from the visualizer catalogue.</summary>
    public decimal LengthFt { get; set; }

    /// <summary>Number of pieces of this type. Always 1-99.</summary>
    public int Quantity { get; set; }

    public Estimate Estimate { get; set; } = null!;
}
