using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Full Admin proposal shape with snapshot lines and payment attempts.
/// Owner identifier and contact email are resolved server-side; only the
/// user id and email leave the server — never password hashes, tokens, or
/// other Identity internals. Item names/prices come from the persisted
/// proposal snapshots, never the live catalogue. Status serializes in the
/// default enum representation (number), matching
/// <see cref="ProposalDetailResponse"/>. Serialized camelCase by the
/// default JSON options.
/// </summary>
public class AdminProposalDetailResponse
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public string? CustomerEmail { get; set; }

    public Guid EstimateId { get; set; }

    public decimal Width { get; set; }

    public decimal Length { get; set; }

    public decimal Area { get; set; }

    public decimal RatePerSquareFoot { get; set; }

    public decimal EstimatedAmount { get; set; }

    public ProposalStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// True when any persisted payment for this proposal/user is Verified.
    /// </summary>
    public bool IsPaymentVerified { get; set; }

    public List<ProposalItemResponse> Items { get; set; } = [];

    /// <summary>
    /// Persisted payment attempts, newest first. Never Razorpay secrets.
    /// </summary>
    public List<AdminProposalPaymentResponse> Payments { get; set; } = [];
}
