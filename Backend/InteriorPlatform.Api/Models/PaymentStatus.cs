namespace InteriorPlatform.Api.Models;

/// <summary>
/// Lifecycle of a token payment attempt against a proposal. A new attempt
/// starts as <see cref="Created"/> (a provider order exists); it becomes
/// <see cref="Verified"/> only after the backend validates the provider
/// signature, or <see cref="Failed"/> when server-side verification rejects
/// it. Stored as int in SQL Server. Do not reorder existing members.
/// </summary>
public enum PaymentStatus
{
    Created = 0,
    Verified = 1,
    Failed = 2
}
