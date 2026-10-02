using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Full proposal shape with snapshot lines. Status serializes in the default
/// enum representation (number), matching <see cref="OrderDetailResponse"/>.
/// Serialized camelCase by the default JSON options.
/// </summary>
public class ProposalDetailResponse
{
    public Guid Id { get; set; }

    public Guid EstimateId { get; set; }

    public decimal Width { get; set; }

    public decimal Length { get; set; }

    public decimal Area { get; set; }

    public decimal RatePerSquareFoot { get; set; }

    public decimal EstimatedAmount { get; set; }

    public ProposalStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Read-only availability derived server-side: true only when the
    /// proposal has a payment with <see cref="PaymentStatus.Verified"/>.
    /// The PDF endpoint enforces the same rule independently on every
    /// request — this flag is a display hint, never an authorization.
    /// </summary>
    public bool IsPaymentVerified { get; set; }

    public List<ProposalItemResponse> Items { get; set; } = [];
}
