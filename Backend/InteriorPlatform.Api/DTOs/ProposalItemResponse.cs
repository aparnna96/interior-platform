namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// A single proposal line. For visualizer furniture lines ProductId is null
/// and FurnitureType/WidthFt/LengthFt describe the piece (prices are 0, "to
/// be quoted"). Legacy catalogue lines carry ProductId with price snapshots.
/// Serialized camelCase by the default JSON options.
/// </summary>
public class ProposalItemResponse
{
    public Guid Id { get; set; }

    public string? ProductId { get; set; }

    public string? FurnitureType { get; set; }

    public decimal? WidthFt { get; set; }

    public decimal? LengthFt { get; set; }

    public string ProductName { get; set; } = string.Empty;

    public decimal UnitPrice { get; set; }

    public int Quantity { get; set; }

    public decimal LineTotal { get; set; }
}
