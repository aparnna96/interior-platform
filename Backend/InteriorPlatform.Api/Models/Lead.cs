namespace InteriorPlatform.Api.Models;

/// <summary>
/// Interior enquiry lead (database foundation milestone).
///
/// Captures a customer enquiry with contact information and an optional
/// reference to the product of interest. Both <see cref="InterestedProductId"/>
/// and <see cref="UserId"/> are nullable so anonymous submissions stay valid.
/// <see cref="CreatedAt"/> is always set from server-side application code
/// (UTC) — never supplied by a public request.
/// There is intentionally no InterestedDesign, address, budget, WhatsApp,
/// assignment, or transition-timestamp data in this milestone.
/// </summary>
public class Lead
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Primary contact channel (also used for the later WhatsApp handoff).</summary>
    public string Phone { get; set; } = string.Empty;

    public string? Email { get; set; }

    /// <summary>Free-text requirement description.</summary>
    public string Message { get; set; } = string.Empty;

    /// <summary>Optional reference to the product of interest (Products.Id slug).</summary>
    public string? InterestedProductId { get; set; }

    /// <summary>Optional reference to the submitting user. Null for anonymous leads.</summary>
    public string? UserId { get; set; }

    public LeadStatus Status { get; set; } = LeadStatus.New;

    /// <summary>Optional short tag recording where the lead came from.</summary>
    public string? Source { get; set; }

    /// <summary>Server-set UTC submission time.</summary>
    public DateTime CreatedAt { get; set; }
}
