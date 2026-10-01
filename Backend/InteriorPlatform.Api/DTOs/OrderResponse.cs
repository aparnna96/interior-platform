using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Order list shape: one row per order. Status serializes in the default
/// enum representation (number), matching <see cref="LeadResponse"/>.
/// Serialized camelCase by the default JSON options.
/// </summary>
public class OrderResponse
{
    public Guid Id { get; set; }

    public OrderStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    public decimal Subtotal { get; set; }

    public int ItemCount { get; set; }
}
