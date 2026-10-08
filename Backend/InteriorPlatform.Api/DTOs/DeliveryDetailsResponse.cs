using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Delivery details stored on an order. Null on orders created before
/// checkout collected them.
/// </summary>
public class DeliveryDetailsResponse
{
    public string FullName { get; set; } = string.Empty;

    /// <summary>The 10 digit mobile number, digits only.</summary>
    public string Phone { get; set; } = string.Empty;

    public string AddressLine1 { get; set; } = string.Empty;

    public string? AddressLine2 { get; set; }

    public string City { get; set; } = string.Empty;

    public string State { get; set; } = string.Empty;

    public string Pincode { get; set; } = string.Empty;

    public string? DeliveryNotes { get; set; }

    /// <summary>The order's delivery details, or null for an order created before checkout collected them.</summary>
    public static DeliveryDetailsResponse? From(Order order) =>
        order.DeliveryFullName is null
            ? null
            : new DeliveryDetailsResponse
            {
                FullName = order.DeliveryFullName,
                Phone = order.DeliveryPhone ?? string.Empty,
                AddressLine1 = order.DeliveryAddressLine1 ?? string.Empty,
                AddressLine2 = order.DeliveryAddressLine2,
                City = order.DeliveryCity ?? string.Empty,
                State = order.DeliveryState ?? string.Empty,
                Pincode = order.DeliveryPincode ?? string.Empty,
                DeliveryNotes = order.DeliveryNotes,
            };
}