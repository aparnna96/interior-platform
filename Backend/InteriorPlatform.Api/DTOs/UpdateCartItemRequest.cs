using System.ComponentModel.DataAnnotations;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for PUT /api/cart/items/{itemId}. Only the quantity can
/// change; the item and its owning user are resolved server-side.
/// </summary>
public class UpdateCartItemRequest
{
    [Range(1, 99)]
    public int Quantity { get; set; }
}
