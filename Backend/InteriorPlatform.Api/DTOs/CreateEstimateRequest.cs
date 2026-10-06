namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for POST /api/estimates. Only room dimensions are accepted:
/// UserId, Area, RatePerSquareFoot, EstimatedAmount and CreatedAt are all
/// derived server-side and cannot be chosen by the client.
/// </summary>
public class CreateEstimateRequest
{
    /// <summary>Room width in feet. Must be within the allowed range.</summary>
    public decimal Width { get; set; }

    /// <summary>Room length in feet. Must be within the allowed range.</summary>
    public decimal Length { get; set; }

    /// <summary>
    /// Furniture placed in the visualizer (type + quantity only). Optional:
    /// omitted or empty saves a dimensions-only estimate.
    /// </summary>
    public List<EstimateItemRequest> Items { get; set; } = [];
}
