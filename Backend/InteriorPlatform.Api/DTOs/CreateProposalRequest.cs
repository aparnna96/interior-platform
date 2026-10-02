namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for POST /api/proposals. Only the source estimate id is
/// accepted: UserId, dimensions, prices, names, totals, status and timestamps
/// are all derived server-side and cannot be chosen by the client.
/// </summary>
public class CreateProposalRequest
{
    /// <summary>Source estimate id. Must belong to the authenticated user.</summary>
    public Guid EstimateId { get; set; }
}
