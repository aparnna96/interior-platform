using System.ComponentModel.DataAnnotations;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for POST /api/cart/items. Only product-supplied cart data is
/// accepted: the owning user is always derived from the authenticated
/// identity, never from the client.
/// </summary>
public class AddCartItemRequest
{
    /// <summary>Product slug (Products.Id).</summary>
    [Required]
    public string ProductId { get; set; } = string.Empty;

    [Range(1, 99)]
    public int Quantity { get; set; }
}
