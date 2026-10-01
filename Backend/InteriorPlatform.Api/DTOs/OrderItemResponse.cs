namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// A single order line. ProductName/UnitPrice are snapshots taken at order
/// time, so history never depends on the current product. Serialized
/// camelCase by the default JSON options.
/// </summary>
public class OrderItemResponse
{
    public Guid Id { get; set; }

    public string ProductId { get; set; } = string.Empty;

    public string ProductName { get; set; } = string.Empty;

    public decimal UnitPrice { get; set; }

    public int Quantity { get; set; }

    public decimal LineTotal { get; set; }
}
