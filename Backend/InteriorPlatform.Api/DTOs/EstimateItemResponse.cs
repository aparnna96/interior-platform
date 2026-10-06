namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// One furniture line of a saved estimate. Name and footprint come from the
/// server-side visualizer catalogue. Serialized camelCase.
/// </summary>
public class EstimateItemResponse
{
    public string FurnitureType { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public decimal WidthFt { get; set; }

    public decimal LengthFt { get; set; }

    public int Quantity { get; set; }
}
