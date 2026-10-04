using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Admin proposal list shape: one row per proposal across all customers,
/// plus the owner identifier and contact email resolved server-side for
/// operations, plus payment state derived from persisted payments.
/// Only the user id and email leave the server — never password hashes,
/// tokens, or other Identity internals. Status serializes in the default
/// enum representation (number), matching <see cref="ProposalResponse"/>.
/// Serialized camelCase by the default JSON options.
/// </summary>
public class AdminProposalResponse
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public string? CustomerEmail { get; set; }

    public Guid EstimateId { get; set; }

    public decimal Area { get; set; }

    public decimal RatePerSquareFoot { get; set; }

    public decimal EstimatedAmount { get; set; }

    public ProposalStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// True when any persisted payment for this proposal/user is Verified.
    /// </summary>
    public bool IsPaymentVerified { get; set; }

    /// <summary>
    /// Number of persisted payment attempts for this proposal/user.
    /// </summary>
    public int PaymentAttemptCount { get; set; }
}
