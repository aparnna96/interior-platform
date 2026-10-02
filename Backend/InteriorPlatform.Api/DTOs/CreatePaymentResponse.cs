namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Response for POST /api/proposals/{proposalId}/payment. Contains only what
/// Angular needs to start Razorpay Checkout: the local payment id, the
/// provider order id, the server-determined amount/currency, and the public
/// Key ID. Never contains secrets, tokens, or internal entity fields.
/// Serialized camelCase by the default JSON options.
/// </summary>
public class CreatePaymentResponse
{
    public Guid PaymentId { get; set; }

    public Guid ProposalId { get; set; }

    public string Provider { get; set; } = string.Empty;

    public string ProviderOrderId { get; set; } = string.Empty;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string ProviderKeyId { get; set; } = string.Empty;
}
