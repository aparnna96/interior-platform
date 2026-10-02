namespace InteriorPlatform.Api.Models;

/// <summary>
/// Lifecycle of a customer proposal. v1 has only <see cref="Draft"/>: the
/// proposal is a frozen snapshot created from one of the customer's saved
/// estimates. Stored as int in SQL Server. Do not reorder existing members.
/// </summary>
public enum ProposalStatus
{
    Draft = 0
}
