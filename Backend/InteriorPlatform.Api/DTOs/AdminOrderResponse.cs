using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Admin order list shape: one row per order across all customers, plus the
/// owner identifier and contact email resolved server-side for operations.
/// Only the user id and email leave the server — never password hashes,
/// tokens, or other Identity internals. Status serializes in the default
/// enum representation (number), matching <see cref="OrderResponse"/>.
/// Serialized camelCase by the default JSON options.
/// </summary>
public class AdminOrderResponse
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public string? CustomerEmail { get; set; }

    public OrderStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    public decimal Subtotal { get; set; }

    public int ItemCount { get; set; }
}
