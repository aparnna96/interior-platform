namespace InteriorPlatform.Api.Models;

/// <summary>
/// A persistent customer order created from the customer's cart.
/// <see cref="Subtotal"/> and every line total are computed server-side from
/// the current product prices at creation time — never supplied by the
/// client. <see cref="CreatedAt"/>/<see cref="UpdatedAt"/> are always set
/// from server-side application code (UTC).
/// </summary>
public class Order
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    /// <summary>Owner (AspNetUsers.Id). Never accepted from the client.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Always <see cref="OrderStatus.Pending"/> at creation.</summary>
    public OrderStatus Status { get; set; } = OrderStatus.Pending;

    /// <summary>Server-set UTC creation time.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Server-set UTC last-mutation time.</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>Sum of line totals, computed server-side. Decimal money.</summary>
    public decimal Subtotal { get; set; }

    // Delivery details collected at checkout. Nullable so that orders created
    // before checkout existed stay valid; new orders always carry them
    // (POST /api/orders requires them).

    /// <summary>Recipient name (2 to 100 characters).</summary>
    public string? DeliveryFullName { get; set; }

    /// <summary>10 digit Indian mobile number, digits only.</summary>
    public string? DeliveryPhone { get; set; }

    public string? DeliveryAddressLine1 { get; set; }

    public string? DeliveryAddressLine2 { get; set; }

    public string? DeliveryCity { get; set; }

    public string? DeliveryState { get; set; }

    /// <summary>6 digit Indian pincode.</summary>
    public string? DeliveryPincode { get; set; }

    public string? DeliveryNotes { get; set; }

    public List<OrderItem> Items { get; set; } = [];
}
