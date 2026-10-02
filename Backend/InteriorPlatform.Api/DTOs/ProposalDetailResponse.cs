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

    public List<ProposalItemResponse> Items { get; set; } = [];
}
