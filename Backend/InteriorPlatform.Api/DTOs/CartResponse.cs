namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// The authenticated user's cart. Totals are computed server-side from the
/// current product prices. Serialized camelCase by the default JSON options.
/// </summary>
public class CartResponse
{
    public List<CartItemResponse> Items { get; set; } = [];

    /// <summary>Total units across all lines.</summary>
    public int ItemCount { get; set; }

    /// <summary>Sum of line totals across all lines.</summary>
    public int Subtotal { get; set; }
}
