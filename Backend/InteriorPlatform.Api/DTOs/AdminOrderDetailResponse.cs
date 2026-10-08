using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Full Admin order shape with snapshot lines, plus the owner identifier
/// and contact email resolved server-side for operations. Only the user id
/// and email leave the server — never password hashes, tokens, or other
/// Identity internals. Status serializes in the default enum representation
/// (number), matching <see cref="OrderDetailResponse"/>. Serialized
/// camelCase by the default JSON options.
/// </summary>
public class AdminOrderDetailResponse
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public string? CustomerEmail { get; set; }

    public OrderStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public decimal Subtotal { get; set; }

    /// <summary>Delivery details, or null for an order created before checkout collected them.</summary>
    public DeliveryDetailsResponse? Delivery { get; set; }

    /// <summary>
    /// Statuses this order may move to next, decided server-side (empty for a
    /// Completed or Cancelled order). The admin UI only offers these.
    /// </summary>
    public List<OrderStatus> AllowedNextStatuses { get; set; } = [];

    public List<OrderItemResponse> Items { get; set; } = [];
}
