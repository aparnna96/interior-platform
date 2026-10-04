using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// One persisted token payment attempt for Admin operations. Amount and
/// currency come from the stored record (originally server configuration).
/// Provider order/payment ids are internal references — never Razorpay
/// secrets, JWTs, or other credentials. Status serializes in the default
/// enum representation (number). Serialized camelCase by the default JSON
/// options.
/// </summary>
public class AdminProposalPaymentResponse
{
    public Guid Id { get; set; }

    public PaymentStatus Status { get; set; }

    public string Provider { get; set; } = string.Empty;

    public string? ProviderOrderId { get; set; }

    public string? ProviderPaymentId { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public DateTime? VerifiedAt { get; set; }
}
