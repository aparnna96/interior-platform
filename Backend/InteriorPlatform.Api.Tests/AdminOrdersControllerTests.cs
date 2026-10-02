using InteriorPlatform.Api.Controllers;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
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
/// Admin order read rules (Task 15C). SQLite in-memory is used for relational
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
}
