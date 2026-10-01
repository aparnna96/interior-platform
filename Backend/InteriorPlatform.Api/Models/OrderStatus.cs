namespace InteriorPlatform.Api.Models;

/// <summary>
/// Lifecycle of a customer order. New orders always start as
/// <see cref="Pending"/> (set server-side at creation; never client-set).
/// Stored as int in SQL Server. Do not reorder existing members.
/// </summary>
public enum OrderStatus
{
    Pending = 0,
    Confirmed = 1,
    Processing = 2,
    Completed = 3,
    Cancelled = 4
}
