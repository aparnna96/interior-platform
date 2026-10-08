using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Full order shape with snapshot lines. Status serializes in the default
/// enum representation (number), matching <see cref="LeadResponse"/>.
/// Serialized camelCase by the default JSON options.
/// </summary>
public class OrderDetailResponse
{
    public Guid Id { get; set; }

    public OrderStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public decimal Subtotal { get; set; }

    /// <summary>Delivery details, or null for an order created before checkout collected them.</summary>
    public DeliveryDetailsResponse? Delivery { get; set; }

    public List<OrderItemResponse> Items { get; set; } = [];
}
