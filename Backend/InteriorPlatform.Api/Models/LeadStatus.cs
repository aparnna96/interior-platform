namespace InteriorPlatform.Api.Models;

/// <summary>
/// Lifecycle of an interior enquiry lead. Minimal by design:
/// newly submitted, being handled by staff, completed/closed.
/// Stored as int in SQL Server. Do not reorder existing members.
/// </summary>
public enum LeadStatus
{
    New = 0,
    InProgress = 1,
    Closed = 2
}
