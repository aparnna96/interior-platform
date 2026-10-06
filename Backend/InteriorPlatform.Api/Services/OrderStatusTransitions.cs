using InteriorPlatform.Api.Models;

namespace InteriorPlatform.Api.Services;

/// <summary>
/// The only order status moves an Admin may make. One place owns the rules:
/// the API enforces them, and the admin detail response lists the allowed next
/// statuses so the UI never has to copy them.
/// <code>
/// Pending -> Confirmed -> Processing -> Completed
///    \____________\____________\______> Cancelled
/// </code>
/// Completed and Cancelled are final: a finished or cancelled order is never
/// reopened, which keeps the order history trustworthy.
/// </summary>
public static class OrderStatusTransitions
{
    private static readonly IReadOnlyDictionary<OrderStatus, OrderStatus[]> Allowed =
        new Dictionary<OrderStatus, OrderStatus[]>
        {
            [OrderStatus.Pending] = [OrderStatus.Confirmed, OrderStatus.Cancelled],
            [OrderStatus.Confirmed] = [OrderStatus.Processing, OrderStatus.Cancelled],
            [OrderStatus.Processing] = [OrderStatus.Completed, OrderStatus.Cancelled],
            [OrderStatus.Completed] = [],
            [OrderStatus.Cancelled] = [],
        };

    /// <summary>Statuses an order in <paramref name="from"/> may move to (never itself).</summary>
    public static IReadOnlyList<OrderStatus> NextFor(OrderStatus from) =>
        Allowed.TryGetValue(from, out var next) ? next : [];

    /// <summary>True when moving from <paramref name="from"/> to <paramref name="to"/> is a legal change.</summary>
    public static bool CanMove(OrderStatus from, OrderStatus to) => NextFor(from).Contains(to);

    /// <summary>True for statuses that end the order's lifecycle.</summary>
    public static bool IsFinal(OrderStatus status) => NextFor(status).Count == 0;
}
