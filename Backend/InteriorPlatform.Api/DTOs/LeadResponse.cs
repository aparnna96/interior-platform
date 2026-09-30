using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Public lead shape returned after submission. Mirrors the submitted data
/// plus server-set <see cref="Lead.Id"/>, <see cref="Lead.Status"/> and
/// <see cref="Lead.CreatedAt"/>. <see cref="Lead.UserId"/> is never exposed
/// publicly. Status serializes in the default enum representation (number).
/// </summary>
public class LeadResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? InterestedProductId { get; set; }
    public string? Source { get; set; }
    public LeadStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
}
