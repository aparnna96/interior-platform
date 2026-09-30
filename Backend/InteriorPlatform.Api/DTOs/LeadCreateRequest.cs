using System.ComponentModel.DataAnnotations;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for POST /api/leads (public; anonymous and authenticated).
/// Only customer-supplied enquiry data is accepted: Id, UserId, Status and
/// CreatedAt are all set server-side and cannot be chosen by the client.
/// </summary>
public class LeadCreateRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [StringLength(20)]
    public string Phone { get; set; } = string.Empty;

    [StringLength(256)]
    [EmailAddress(ErrorMessage = "Email must be a valid email address.")]
    public string? Email { get; set; }

    [Required]
    [StringLength(2000)]
    public string Message { get; set; } = string.Empty;

    /// <summary>Optional reference to an active product (Products.Id slug).</summary>
    public string? InterestedProductId { get; set; }

    [StringLength(100)]
    public string? Source { get; set; }
}
