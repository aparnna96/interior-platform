using InteriorPlatform.Api.Models;
using System.ComponentModel.DataAnnotations;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for PATCH /api/leads/{id}/status (FieldStaff/Admin only).
/// Carries only the new status; every other Lead field is immutable here.
/// Nullable so a missing value fails validation instead of silently
/// becoming <see cref="LeadStatus.New"/>.
/// </summary>
public class LeadStatusUpdateRequest
{
    [Required]
    public LeadStatus? Status { get; set; }
}
