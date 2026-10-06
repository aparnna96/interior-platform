using InteriorPlatform.Api.Models;
using System.ComponentModel.DataAnnotations;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for PATCH /api/admin/orders/{id}/status (Admin only). Carries
/// only the new status: the owner, the items, the prices and the timestamps are
/// never accepted here. Nullable so a missing value fails validation instead of
/// silently becoming <see cref="OrderStatus.Pending"/>.
/// </summary>
public class AdminOrderStatusUpdateRequest
{
    [Required]
    public OrderStatus? Status { get; set; }
}
