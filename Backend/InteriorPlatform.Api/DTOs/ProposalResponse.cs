using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Proposal list shape: one row per proposal. Status serializes in the
/// default enum representation (number), matching <see cref="OrderResponse"/>.
/// Serialized camelCase by the default JSON options.
/// </summary>
public class ProposalResponse
{
    public Guid Id { get; set; }

    public Guid EstimateId { get; set; }

    public ProposalStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    public decimal Area { get; set; }

    public decimal EstimatedAmount { get; set; }
}
