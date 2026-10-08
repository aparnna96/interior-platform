using InteriorPlatform.Api.Controllers;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using InteriorPlatform.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Admin order read rules (Task 15C) and status changes. SQLite in-memory is used for relational
/// fidelity. These tests never touch the real SQL Server database.
/// Role enforcement itself lives in [Authorize(Roles = "Admin")] and is
/// verified declaratively below; the ASP.NET Core pipeline (not direct
/// controller calls) applies it, exactly like the existing controllers.
/// </summary>
public sealed class AdminOrdersControllerTests
{
    private const string UserA = "user-a";
    private const string UserB = "user-b";
    private const string EmailA = "a@test.local";
    private const string EmailB = "b@test.local";

    private sealed class TestDb : IDisposable
    {
        public ApplicationDbContext Db { get; }

        private readonly SqliteConnection _connection;

        public TestDb()
        {
            _connection = new SqliteConnection("DataSource=:memory:");
            _connection.Open();
            Db = new ApplicationDbContext(
                new DbContextOptionsBuilder<ApplicationDbContext>()
                    .UseSqlite(_connection)
                    .Options);
            Db.Database.EnsureCreated();

            Db.Users.AddRange(
                new ApplicationUser { Id = UserA, UserName = EmailA, Email = EmailA },
                new ApplicationUser { Id = UserB, UserName = EmailB, Email = EmailB });
            Db.Products.Add(new Product
            {
                Id = "aria-3s-sofa",
                Name = "Aria 3-Seater Fabric Sofa",
                Category = "Sofas",
                Room = "Living Room",
                Price = 42999,
                Material = "Test Material",
                Finish = "Test Finish",
                Blurb = "aria-3s-sofa blurb.",
                Description = "aria-3s-sofa description.",
                Dimensions = "10 x 10 x 10 cm",
                ImageUrl = "https://example.com/aria-3s-sofa.jpg",
                Details = ["aria-3s-sofa detail"],
                IsActive = true,
            });
            Db.SaveChanges();
        }

        public void Dispose()
        {
            Db.Dispose();
            _connection.Dispose();
        }
    }

    private static ClaimsPrincipal PrincipalFor(string? userId) =>
        userId is null
            ? new ClaimsPrincipal(new ClaimsIdentity())
            : new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId)], "Test"));

    private static AdminOrdersController AdminOrdersFor(ApplicationDbContext db, string? userId)
    {
        var controller = new AdminOrdersController(db);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(userId) },
        };
        return controller;
    }

    private static async Task<Order> SeedOrderAsync(
        ApplicationDbContext db, string userId, DateTime createdAt, decimal subtotal = 85998m)
    {
        var order = new Order
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Status = OrderStatus.Pending,
            CreatedAt = createdAt,
            UpdatedAt = createdAt,
            Subtotal = subtotal,
            Items =
            [
                new OrderItem
                {
                    Id = Guid.NewGuid(),
                    ProductId = "aria-3s-sofa",
                    ProductName = "Aria 3-Seater Fabric Sofa",
                    UnitPrice = 42999m,
                    Quantity = 2,
                    LineTotal = 85998m,
                },
            ],
        };
        // Keep the row consistent with the asserted subtotal.
        order.Subtotal = order.Items.Sum(i => i.LineTotal);
        db.Orders.Add(order);
        await db.SaveChangesAsync();
        return order;
    }

    [Fact]
    public void AdminOrdersController_RequiresAdminRole()
    {
        var attribute = typeof(AdminOrdersController).GetCustomAttributes(
            typeof(AuthorizeAttribute), inherit: true)
            .OfType<AuthorizeAttribute>()
            .Single();
        Assert.Equal("Admin", attribute.Roles);
    }

    [Fact]
    public async Task GetOrders_ReturnsEveryCustomersOrdersNewestFirst()
    {
        using var test = new TestDb();
        var older = await SeedOrderAsync(test.Db, UserA, new DateTime(2026, 9, 1, 10, 0, 0, DateTimeKind.Utc));
        await Task.Delay(20);
        var newer = await SeedOrderAsync(test.Db, UserB, new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc));

        var result = await AdminOrdersFor(test.Db, "admin-user").GetOrders();
        var list = Assert.IsType<List<AdminOrderResponse>>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(2, list.Count);
        Assert.Equal(newer.Id, list[0].Id);
        Assert.Equal(UserB, list[0].UserId);
        Assert.Equal(EmailB, list[0].CustomerEmail);
        Assert.Equal(older.Id, list[1].Id);
        Assert.Equal(UserA, list[1].UserId);
        Assert.Equal(EmailA, list[1].CustomerEmail);
        Assert.All(list, o => Assert.Equal(OrderStatus.Pending, o.Status));
        Assert.All(list, o => Assert.Equal(85998m, o.Subtotal));
        Assert.All(list, o => Assert.Equal(2, o.ItemCount));
    }

    [Fact]
    public async Task GetOrder_ReturnsDetailWithOwnerAndSnapshotItems()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);

        var result = await AdminOrdersFor(test.Db, "admin-user").GetOrder(order.Id);
        var detail = Assert.IsType<AdminOrderDetailResponse>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(order.Id, detail.Id);
        Assert.Equal(UserA, detail.UserId);
        Assert.Equal(EmailA, detail.CustomerEmail);
        Assert.Equal(OrderStatus.Pending, detail.Status);
        Assert.Equal(85998m, detail.Subtotal);
        var item = Assert.Single(detail.Items);
        Assert.Equal("aria-3s-sofa", item.ProductId);
        Assert.Equal("Aria 3-Seater Fabric Sofa", item.ProductName);
        Assert.Equal(42999m, item.UnitPrice);
        Assert.Equal(2, item.Quantity);
        Assert.Equal(85998m, item.LineTotal);
    }

    [Fact]
    public async Task GetOrder_ShowsTheDeliveryDetailsStoredOnTheOrder()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);
        var stored = await test.Db.Orders.SingleAsync(o => o.Id == order.Id);
        stored.DeliveryFullName = "Asha Menon";
        stored.DeliveryPhone = "9876543210";
        stored.DeliveryAddressLine1 = "12 MG Road";
        stored.DeliveryAddressLine2 = "Near City Mall";
        stored.DeliveryCity = "Kochi";
        stored.DeliveryState = "Kerala";
        stored.DeliveryPincode = "682016";
        stored.DeliveryNotes = "Call before delivery.";
        await test.Db.SaveChangesAsync();

        var detail = Assert.IsType<AdminOrderDetailResponse>(
            Assert.IsType<OkObjectResult>((await AdminOrdersFor(test.Db, "admin-user").GetOrder(order.Id)).Result).Value);

        var d = Assert.IsType<DeliveryDetailsResponse>(detail.Delivery);
        Assert.Equal("Asha Menon", d.FullName);
        Assert.Equal("9876543210", d.Phone);
        Assert.Equal("12 MG Road", d.AddressLine1);
        Assert.Equal("Near City Mall", d.AddressLine2);
        Assert.Equal("Kochi", d.City);
        Assert.Equal("Kerala", d.State);
        Assert.Equal("682016", d.Pincode);
        Assert.Equal("Call before delivery.", d.DeliveryNotes);
    }

    [Fact]
    public async Task GetOrder_OrderWithoutDeliveryDetails_ReturnsNullDelivery()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);

        var detail = Assert.IsType<AdminOrderDetailResponse>(
            Assert.IsType<OkObjectResult>((await AdminOrdersFor(test.Db, "admin-user").GetOrder(order.Id)).Result).Value);
        Assert.Null(detail.Delivery);
    }

    [Fact]
    public async Task UpdateStatus_KeepsTheDeliveryDetailsOnTheReturnedOrder()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);
        var stored = await test.Db.Orders.SingleAsync(o => o.Id == order.Id);
        stored.DeliveryFullName = "Asha Menon";
        stored.DeliveryPhone = "9876543210";
        stored.DeliveryAddressLine1 = "12 MG Road";
        stored.DeliveryCity = "Kochi";
        stored.DeliveryState = "Kerala";
        stored.DeliveryPincode = "682016";
        await test.Db.SaveChangesAsync();

        var result = await AdminOrdersFor(test.Db, "admin-user")
            .UpdateStatus(order.Id, new AdminOrderStatusUpdateRequest { Status = OrderStatus.Confirmed });
        var detail = Assert.IsType<AdminOrderDetailResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(OrderStatus.Confirmed, detail.Status);
        Assert.Equal("Asha Menon", detail.Delivery!.FullName);
        Assert.Equal("682016", detail.Delivery.Pincode);
    }

    [Fact]
    public void OnlyTheAdminRoleCanReachAdminOrders_FieldStaffAndCustomerCannot()
    {
        // The delivery address is personal data, so the role rule must stay exactly "Admin".
        var attribute = typeof(AdminOrdersController).GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
            .OfType<AuthorizeAttribute>().Single();
        Assert.Equal("Admin", attribute.Roles);
        Assert.DoesNotContain("FieldStaff", attribute.Roles!);
        Assert.DoesNotContain("Customer", attribute.Roles!);
    }

    [Fact]
    public async Task GetOrder_MissingOrder_Returns404()
    {
        using var test = new TestDb();

        Assert.IsType<NotFoundResult>(
            (await AdminOrdersFor(test.Db, "admin-user").GetOrder(Guid.NewGuid())).Result);
    }

    [Fact]
    public async Task UnauthenticatedAccess_IsRejected()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);

        Assert.IsType<UnauthorizedResult>((await AdminOrdersFor(test.Db, null).GetOrders()).Result);
        Assert.IsType<UnauthorizedResult>((await AdminOrdersFor(test.Db, null).GetOrder(order.Id)).Result);
        Assert.Equal(1, await test.Db.Orders.CountAsync());
    }

    [Fact]
    public void AdminOrderResponses_ExposeNoSecrets()
    {
        foreach (var type in new[] { typeof(AdminOrderResponse), typeof(AdminOrderDetailResponse) })
        {
            var names = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Select(p => p.Name)
                .ToList();
            foreach (var banned in new[] { "Password", "Hash", "Secret", "Token", "SecurityStamp", "ConcurrencyStamp" })
            {
                Assert.DoesNotContain(names, n => n.Contains(banned, StringComparison.OrdinalIgnoreCase));
            }
        }

        var payload = JsonSerializer.Serialize(new AdminOrderDetailResponse
        {
            Id = Guid.NewGuid(),
            UserId = UserA,
            CustomerEmail = EmailA,
            Status = OrderStatus.Pending,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Subtotal = 85998m,
        });
        foreach (var banned in new[] { "PasswordHash", "SecurityStamp", "secret", "token" })
        {
            Assert.DoesNotContain(banned, payload, StringComparison.OrdinalIgnoreCase);
        }
    }

    // ── status changes ────────────────────────────────────────────────

    private static AdminOrderDetailResponse Updated(ActionResult<AdminOrderDetailResponse> result) =>
        Assert.IsType<AdminOrderDetailResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);

    private static async Task<AdminOrderDetailResponse> MoveAsync(
        ApplicationDbContext db, Guid id, OrderStatus to) =>
        Updated(await AdminOrdersFor(db, "admin-user")
            .UpdateStatus(id, new AdminOrderStatusUpdateRequest { Status = to }));

    [Fact]
    public void UpdateStatus_IsAdminOnlyThroughTheControllerAttribute()
    {
        // The class-level [Authorize(Roles = "Admin")] covers the new endpoint; it must
        // not be loosened with an [AllowAnonymous] or a wider role on the method.
        var method = typeof(AdminOrdersController).GetMethod(nameof(AdminOrdersController.UpdateStatus))!;
        Assert.Empty(method.GetCustomAttributes(typeof(AllowAnonymousAttribute), inherit: true));
        Assert.DoesNotContain(
            method.GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true).OfType<AuthorizeAttribute>(),
            a => a.Roles != "Admin");
        Assert.Contains(
            method.GetCustomAttributes(typeof(HttpPatchAttribute), inherit: true).OfType<HttpPatchAttribute>(),
            a => a.Template == "{id:guid}/status");
    }

    [Fact]
    public void AdminOrderStatusUpdateRequest_ExposesOnlyStatus()
    {
        var names = typeof(AdminOrderStatusUpdateRequest)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToList();
        Assert.Equal(["Status"], names);
    }

    [Fact]
    public async Task UpdateStatus_WalksTheHappyPath_AndStampsUpdatedAt()
    {
        using var test = new TestDb();
        var created = new DateTime(2026, 9, 1, 10, 0, 0, DateTimeKind.Utc);
        var order = await SeedOrderAsync(test.Db, UserA, created);

        foreach (var step in new[] { OrderStatus.Confirmed, OrderStatus.Processing, OrderStatus.Completed })
        {
            var detail = await MoveAsync(test.Db, order.Id, step);
            Assert.Equal(step, detail.Status);
            Assert.True(detail.UpdatedAt > created);
            Assert.Equal(created, detail.CreatedAt);
        }

        var stored = await test.Db.Orders.AsNoTracking().SingleAsync();
        Assert.Equal(OrderStatus.Completed, stored.Status);
        Assert.Equal(created, stored.CreatedAt);
    }

    [Theory]
    [InlineData(OrderStatus.Pending)]
    [InlineData(OrderStatus.Confirmed)]
    [InlineData(OrderStatus.Processing)]
    public async Task UpdateStatus_AnOpenOrderCanBeCancelled(OrderStatus startingAt)
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);
        order.Status = startingAt;
        await test.Db.SaveChangesAsync();

        var detail = await MoveAsync(test.Db, order.Id, OrderStatus.Cancelled);

        Assert.Equal(OrderStatus.Cancelled, detail.Status);
        Assert.Empty(detail.AllowedNextStatuses);
    }

    [Theory]
    [InlineData(OrderStatus.Pending, OrderStatus.Processing)]
    [InlineData(OrderStatus.Pending, OrderStatus.Completed)]
    [InlineData(OrderStatus.Confirmed, OrderStatus.Pending)]
    [InlineData(OrderStatus.Confirmed, OrderStatus.Completed)]
    [InlineData(OrderStatus.Processing, OrderStatus.Confirmed)]
    [InlineData(OrderStatus.Completed, OrderStatus.Pending)]
    [InlineData(OrderStatus.Completed, OrderStatus.Cancelled)]
    [InlineData(OrderStatus.Cancelled, OrderStatus.Pending)]
    [InlineData(OrderStatus.Cancelled, OrderStatus.Confirmed)]
    public async Task UpdateStatus_IllegalMoves_Return409AndChangeNothing(OrderStatus from, OrderStatus to)
    {
        using var test = new TestDb();
        var when = new DateTime(2026, 9, 1, 10, 0, 0, DateTimeKind.Utc);
        var order = await SeedOrderAsync(test.Db, UserA, when);
        order.Status = from;
        await test.Db.SaveChangesAsync();

        var result = await AdminOrdersFor(test.Db, "admin-user")
            .UpdateStatus(order.Id, new AdminOrderStatusUpdateRequest { Status = to });

        var problem = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
        var stored = await test.Db.Orders.AsNoTracking().SingleAsync();
        Assert.Equal(from, stored.Status);
        Assert.Equal(when, stored.UpdatedAt);
    }

    [Fact]
    public async Task UpdateStatus_RepeatingTheCurrentStatus_SucceedsWithoutTouchingTheOrder()
    {
        using var test = new TestDb();
        var when = new DateTime(2026, 9, 1, 10, 0, 0, DateTimeKind.Utc);
        var order = await SeedOrderAsync(test.Db, UserA, when);
        await MoveAsync(test.Db, order.Id, OrderStatus.Confirmed);
        var afterFirst = (await test.Db.Orders.AsNoTracking().SingleAsync()).UpdatedAt;

        await Task.Delay(20);
        var again = await MoveAsync(test.Db, order.Id, OrderStatus.Confirmed);

        Assert.Equal(OrderStatus.Confirmed, again.Status);
        Assert.Equal(afterFirst, (await test.Db.Orders.AsNoTracking().SingleAsync()).UpdatedAt);
    }

    [Fact]
    public async Task UpdateStatus_RejectsMissingOrUnknownStatus_With400()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);
        var controller = AdminOrdersFor(test.Db, "admin-user");

        foreach (var bad in new OrderStatus?[] { null, (OrderStatus)99, (OrderStatus)(-1) })
        {
            var result = await controller.UpdateStatus(order.Id, new AdminOrderStatusUpdateRequest { Status = bad });
            var problem = Assert.IsType<ObjectResult>(result.Result);
            Assert.True(
                problem.StatusCode == StatusCodes.Status400BadRequest ||
                (problem.StatusCode is null && problem.Value is ValidationProblemDetails),
                $"Expected 400 for {bad}, got {problem.StatusCode}.");
        }

        Assert.Equal(OrderStatus.Pending, (await test.Db.Orders.AsNoTracking().SingleAsync()).Status);
    }

    [Fact]
    public async Task UpdateStatus_MissingOrder_Returns404()
    {
        using var test = new TestDb();

        var result = await AdminOrdersFor(test.Db, "admin-user")
            .UpdateStatus(Guid.NewGuid(), new AdminOrderStatusUpdateRequest { Status = OrderStatus.Confirmed });

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task UpdateStatus_Unauthenticated_Returns401AndChangesNothing()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);

        var result = await AdminOrdersFor(test.Db, null)
            .UpdateStatus(order.Id, new AdminOrderStatusUpdateRequest { Status = OrderStatus.Confirmed });

        Assert.IsType<UnauthorizedResult>(result.Result);
        Assert.Equal(OrderStatus.Pending, (await test.Db.Orders.AsNoTracking().SingleAsync()).Status);
    }

    [Fact]
    public async Task UpdateStatus_NeverTouchesItemsTotalsOrOwner()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);

        await MoveAsync(test.Db, order.Id, OrderStatus.Confirmed);

        var stored = await test.Db.Orders.AsNoTracking().Include(o => o.Items).SingleAsync();
        Assert.Equal(UserA, stored.UserId);
        Assert.Equal(85998m, stored.Subtotal);
        var item = Assert.Single(stored.Items);
        Assert.Equal(2, item.Quantity);
        Assert.Equal(42999m, item.UnitPrice);
    }

    [Fact]
    public async Task UpdateStatus_IsVisibleToTheCustomerOnTheirOwnOrder()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);
        await MoveAsync(test.Db, order.Id, OrderStatus.Confirmed);

        var customer = new OrdersController(test.Db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = PrincipalFor(UserA) },
            },
        };
        var result = await customer.GetOrder(order.Id);
        var detail = Assert.IsType<OrderDetailResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(OrderStatus.Confirmed, detail.Status);
    }

    [Fact]
    public async Task GetOrder_ListsOnlyTheMovesTheServerAllows()
    {
        using var test = new TestDb();
        var order = await SeedOrderAsync(test.Db, UserA, DateTime.UtcNow);

        var pending = Assert.IsType<AdminOrderDetailResponse>(Assert.IsType<OkObjectResult>(
            (await AdminOrdersFor(test.Db, "admin-user").GetOrder(order.Id)).Result).Value);
        Assert.Equal([OrderStatus.Confirmed, OrderStatus.Cancelled], pending.AllowedNextStatuses);

        await MoveAsync(test.Db, order.Id, OrderStatus.Cancelled);
        var cancelled = Assert.IsType<AdminOrderDetailResponse>(Assert.IsType<OkObjectResult>(
            (await AdminOrdersFor(test.Db, "admin-user").GetOrder(order.Id)).Result).Value);
        Assert.Empty(cancelled.AllowedNextStatuses);
    }

    [Fact]
    public void Transitions_FinalStatesHaveNoWayOut_AndNobodyMovesToThemselves()
    {
        foreach (var status in Enum.GetValues<OrderStatus>())
        {
            Assert.DoesNotContain(status, OrderStatusTransitions.NextFor(status));
        }

        Assert.True(OrderStatusTransitions.IsFinal(OrderStatus.Completed));
        Assert.True(OrderStatusTransitions.IsFinal(OrderStatus.Cancelled));
        Assert.False(OrderStatusTransitions.IsFinal(OrderStatus.Pending));
        Assert.False(OrderStatusTransitions.CanMove(OrderStatus.Completed, OrderStatus.Cancelled));
    }
}
