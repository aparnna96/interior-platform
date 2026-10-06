namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Saved estimate shape returned by POST /api/estimates, GET /api/estimates
/// and GET /api/estimates/{id}. All calculated values (Area,
/// RatePerSquareFoot, EstimatedAmount) are server-computed snapshots.
/// <see cref="Models.Estimate.UserId"/> is never exposed. Serialized
/// camelCase by the default JSON options.
/// </summary>
public class EstimateResponse
{
    public Guid Id { get; set; }

    public decimal Width { get; set; }

    public decimal Length { get; set; }

    public decimal Area { get; set; }

    public decimal RatePerSquareFoot { get; set; }

    public decimal EstimatedAmount { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Visualizer furniture saved with this estimate.</summary>
    public List<EstimateItemResponse> Items { get; set; } = [];
}
