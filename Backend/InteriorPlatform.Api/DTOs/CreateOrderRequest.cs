using System.ComponentModel.DataAnnotations;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for POST /api/orders: the customer's delivery details.
/// Nothing else is accepted: the owner, products, prices, totals and status
/// all come from the server.
///
/// The exact rules (required fields, trimmed lengths, phone and pincode
/// formats) live in <see cref="Controllers.OrdersController"/>, which trims
/// every value first and then validates it. The only attribute here is a
/// generous size cap that bounds the payload before that check runs.
/// </summary>
public class CreateOrderRequest
{
    /// <summary>Largest raw value accepted before trimming (the real limits are lower).</summary>
    public const int TransportCap = 1000;

    [StringLength(TransportCap)]
    public string? FullName { get; set; }

    /// <summary>Indian mobile: 10 digits, with an optional +91 prefix.</summary>
    [StringLength(TransportCap)]
    public string? Phone { get; set; }

    [StringLength(TransportCap)]
    public string? AddressLine1 { get; set; }

    [StringLength(TransportCap)]
    public string? AddressLine2 { get; set; }

    [StringLength(TransportCap)]
    public string? City { get; set; }

    [StringLength(TransportCap)]
    public string? State { get; set; }

    /// <summary>6 digit pincode.</summary>
    [StringLength(TransportCap)]
    public string? Pincode { get; set; }

    [StringLength(TransportCap)]
    public string? DeliveryNotes { get; set; }
}