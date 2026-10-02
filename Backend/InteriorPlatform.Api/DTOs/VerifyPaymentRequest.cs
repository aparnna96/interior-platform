using System.ComponentModel.DataAnnotations;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for POST /api/payments/verify. Carries only the Razorpay
/// Checkout values plus our local payment id. Amount, ownership, status and
/// verification outcome are never accepted here — the backend derives all of
/// them from persisted state and configuration.
/// </summary>
public class VerifyPaymentRequest
{
    /// <summary>Our local payment record id.</summary>
    public Guid PaymentId { get; set; }

    /// <summary>Razorpay order id from Checkout.</summary>
    [Required]
    public string RazorpayOrderId { get; set; } = string.Empty;

    /// <summary>Razorpay payment id from Checkout.</summary>
    [Required]
    public string RazorpayPaymentId { get; set; } = string.Empty;

    /// <summary>Razorpay signature from Checkout.</summary>
    [Required]
    public string RazorpaySignature { get; set; } = string.Empty;
}
