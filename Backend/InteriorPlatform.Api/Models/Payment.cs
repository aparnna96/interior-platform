namespace InteriorPlatform.Api.Models;

/// <summary>
/// A token payment attempt associated with a <see cref="Proposal"/>.
/// <see cref="Amount"/> and <see cref="Currency"/> are set exclusively from
/// backend configuration at creation time — never from the client.
/// <see cref="Status"/> transitions to <see cref="PaymentStatus.Verified"/>
/// only after server-side provider-signature verification; the client can
/// never set it. No API secrets are stored here.
/// <see cref="CreatedAt"/>/<see cref="VerifiedAt"/> are UTC timestamps set
/// from server-side application code.
/// </summary>
public class Payment
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    /// <summary>The proposal this token payment attempt belongs to.</summary>
    public Guid ProposalId { get; set; }

    /// <summary>Owner (AspNetUsers.Id). Never accepted from the client.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Token amount in major currency units, from configuration.</summary>
    public decimal Amount { get; set; }

    /// <summary>ISO currency code, from configuration (INR in test mode).</summary>
    public string Currency { get; set; } = string.Empty;

    /// <summary>Starts as <see cref="PaymentStatus.Created"/>.</summary>
    public PaymentStatus Status { get; set; } = PaymentStatus.Created;

    /// <summary>Payment provider identifier, e.g. "Razorpay".</summary>
    public string Provider { get; set; } = string.Empty;

    /// <summary>Provider-side order id (Razorpay order id). Set at creation.</summary>
    public string? ProviderOrderId { get; set; }

    /// <summary>Provider-side payment id, stored after verification.</summary>
    public string? ProviderPaymentId { get; set; }

    /// <summary>Provider signature as supplied for verification.</summary>
    public string? ProviderSignature { get; set; }

    /// <summary>Server-set UTC creation time.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Server-set UTC verification time. Null until verified.</summary>
    public DateTime? VerifiedAt { get; set; }

    public Proposal Proposal { get; set; } = null!;
}
