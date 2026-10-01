namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// A single cart line. Prices and totals always use the current
/// <c>Product.Price</c> — no price is snapshotted. <c>Slug</c> carries the
/// product slug (<c>Products.Id</c>) for frontend routing. Serialized
/// camelCase by the default JSON options.
/// </summary>
public class CartItemResponse
{
    public Guid Id { get; set; }

    public string ProductId { get; set; } = string.Empty;

    public string Slug { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public int Price { get; set; }

    public int Quantity { get; set; }

    public int LineTotal { get; set; }

    public string ImageUrl { get; set; } = string.Empty;

    /// <summary>
    /// False when the referenced product has since become inactive.
    /// Inactive items are kept (never auto-deleted) so the frontend can
    /// explain the item is unavailable.
    /// </summary>
    public bool IsAvailable { get; set; }
}
