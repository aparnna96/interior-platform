using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Response for POST /api/payments/verify. Reports the persisted payment
/// outcome only. Status serializes in the default enum representation
/// (number), matching <see cref="OrderResponse"/>. Serialized camelCase by
/// the default JSON options.
/// </summary>
public class VerifyPaymentResponse
{
    public Guid PaymentId { get; set; }

    public Guid ProposalId { get; set; }

    public PaymentStatus Status { get; set; }

    public DateTime? VerifiedAt { get; set; }
}
