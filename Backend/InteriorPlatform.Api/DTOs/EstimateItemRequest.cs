namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// One visualizer furniture line in POST /api/estimates: a type key and a
/// quantity only. Name and footprint are resolved server-side.
/// </summary>
public class EstimateItemRequest
{
    /// <summary>Visualizer furniture key: bed, wardrobe, sofa, table or chair.</summary>
    public string FurnitureType { get; set; } = string.Empty;

    /// <summary>Number of pieces, 1-99.</summary>
    public int Quantity { get; set; }
}
