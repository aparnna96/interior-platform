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
/// Admin proposal/payment read rules (Task 15D). SQLite in-memory is used
/// for relational fidelity. These tests never touch the real SQL Server
/// database.
/// Role enforcement itself lives in [Authorize(Roles = "Admin")] and is
/// verified declaratively below; the ASP.NET Core pipeline (not direct
/// controller calls) applies it, exactly like the existing controllers.
/// </summary>
public sealed class AdminProposalsControllerTests
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

    private static AdminProposalsController AdminProposalsFor(ApplicationDbContext db, string? userId)
    {
        var controller = new AdminProposalsController(db);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(userId) },
        };
        return controller;
    }

    private static async Task<Proposal> SeedProposalAsync(
        ApplicationDbContext db, string userId, DateTime createdAt)
    {
        var estimate = new Estimate
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Width = 12m,
            Length = 15m,
            Area = 180m,
            RatePerSquareFoot = 1500m,
            EstimatedAmount = 270000m,
            CreatedAt = createdAt,
        };
        var proposal = new Proposal
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            EstimateId = estimate.Id,
            Width = 12m,
            Length = 15m,
            Area = 180m,
            RatePerSquareFoot = 1500m,
            EstimatedAmount = 270000m,
            Status = ProposalStatus.Draft,
            CreatedAt = createdAt,
            Items =
            [
                new ProposalItem
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
        db.Estimates.Add(estimate);
        db.Proposals.Add(proposal);
        await db.SaveChangesAsync();
        return proposal;
    }

    private static async Task<Payment> SeedPaymentAsync(
        ApplicationDbContext db, Proposal proposal, PaymentStatus status, DateTime createdAt)
    {
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            ProposalId = proposal.Id,
            UserId = proposal.UserId,
            Amount = 500m,
            Currency = "INR",
            Status = status,
            Provider = "Razorpay",
            ProviderOrderId = $"order-{Guid.NewGuid():N}",
            ProviderPaymentId = status == PaymentStatus.Verified ? $"pay-{Guid.NewGuid():N}" : null,
            CreatedAt = createdAt,
            VerifiedAt = status == PaymentStatus.Verified ? createdAt : null,
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return payment;
    }

    [Fact]
    public void AdminProposalsController_RequiresAdminRole()
    {
        var attribute = typeof(AdminProposalsController).GetCustomAttributes(
            typeof(AuthorizeAttribute), inherit: true)
            .OfType<AuthorizeAttribute>()
            .Single();
        Assert.Equal("Admin", attribute.Roles);
    }

    [Fact]
    public async Task GetProposals_ReturnsEveryCustomersProposalsNewestFirst()
    {
        using var test = new TestDb();
        var older = await SeedProposalAsync(test.Db, UserA, new DateTime(2026, 9, 1, 10, 0, 0, DateTimeKind.Utc));
        await Task.Delay(20);
        var newer = await SeedProposalAsync(test.Db, UserB, new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc));

        var result = await AdminProposalsFor(test.Db, "admin-user").GetProposals();
        var list = Assert.IsType<List<AdminProposalResponse>>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(2, list.Count);
        Assert.Equal(newer.Id, list[0].Id);
        Assert.Equal(UserB, list[0].UserId);
        Assert.Equal(EmailB, list[0].CustomerEmail);
        Assert.Equal(older.Id, list[1].Id);
        Assert.Equal(UserA, list[1].UserId);
        Assert.Equal(EmailA, list[1].CustomerEmail);
        Assert.All(list, p => Assert.Equal(ProposalStatus.Draft, p.Status));
        Assert.All(list, p => Assert.Equal(180m, p.Area));
        Assert.All(list, p => Assert.Equal(270000m, p.EstimatedAmount));
    }

    [Fact]
    public async Task GetProposals_ReportsPaymentVerificationState()
    {
        using var test = new TestDb();
        var verified = await SeedProposalAsync(test.Db, UserA, new DateTime(2026, 9, 1, 10, 0, 0, DateTimeKind.Utc));
        await SeedPaymentAsync(test.Db, verified, PaymentStatus.Verified, new DateTime(2026, 9, 2, 10, 0, 0, DateTimeKind.Utc));
        var pending = await SeedProposalAsync(test.Db, UserB, new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc));
        await SeedPaymentAsync(test.Db, pending, PaymentStatus.Created, new DateTime(2026, 10, 2, 10, 0, 0, DateTimeKind.Utc));
        var untouched = await SeedProposalAsync(test.Db, UserA, new DateTime(2026, 11, 1, 10, 0, 0, DateTimeKind.Utc));

        var result = await AdminProposalsFor(test.Db, "admin-user").GetProposals();
        var list = Assert.IsType<List<AdminProposalResponse>>(
            Assert.IsType<OkObjectResult>(result.Result).Value);
        var byId = list.ToDictionary(p => p.Id);

        Assert.True(byId[verified.Id].IsPaymentVerified);
        Assert.Equal(1, byId[verified.Id].PaymentAttemptCount);
        Assert.False(byId[pending.Id].IsPaymentVerified);
        Assert.Equal(1, byId[pending.Id].PaymentAttemptCount);
        Assert.False(byId[untouched.Id].IsPaymentVerified);
        Assert.Equal(0, byId[untouched.Id].PaymentAttemptCount);
    }

    [Fact]
    public async Task GetProposal_ReturnsDetailWithOwnerSnapshotsAndPayments()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA, DateTime.UtcNow);
        var failed = await SeedPaymentAsync(
            test.Db, proposal, PaymentStatus.Failed, new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc));
        var verified = await SeedPaymentAsync(
            test.Db, proposal, PaymentStatus.Verified, new DateTime(2026, 10, 2, 10, 0, 0, DateTimeKind.Utc));

        var result = await AdminProposalsFor(test.Db, "admin-user").GetProposal(proposal.Id);
        var detail = Assert.IsType<AdminProposalDetailResponse>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(proposal.Id, detail.Id);
        Assert.Equal(UserA, detail.UserId);
        Assert.Equal(EmailA, detail.CustomerEmail);
        Assert.Equal(proposal.EstimateId, detail.EstimateId);
        Assert.Equal(12m, detail.Width);
        Assert.Equal(15m, detail.Length);
        Assert.Equal(180m, detail.Area);
        Assert.Equal(1500m, detail.RatePerSquareFoot);
        Assert.Equal(270000m, detail.EstimatedAmount);
        Assert.Equal(ProposalStatus.Draft, detail.Status);
        Assert.True(detail.IsPaymentVerified);

        var item = Assert.Single(detail.Items);
        Assert.Equal("aria-3s-sofa", item.ProductId);
        Assert.Equal("Aria 3-Seater Fabric Sofa", item.ProductName);
        Assert.Equal(42999m, item.UnitPrice);
        Assert.Equal(2, item.Quantity);
        Assert.Equal(85998m, item.LineTotal);

        Assert.Equal(2, detail.Payments.Count);
        // Newest first.
        Assert.Equal(verified.Id, detail.Payments[0].Id);
        Assert.Equal(PaymentStatus.Verified, detail.Payments[0].Status);
        Assert.Equal("Razorpay", detail.Payments[0].Provider);
        Assert.Equal(500m, detail.Payments[0].Amount);
        Assert.Equal("INR", detail.Payments[0].Currency);
        Assert.NotNull(detail.Payments[0].ProviderOrderId);
        Assert.NotNull(detail.Payments[0].VerifiedAt);
        Assert.Equal(failed.Id, detail.Payments[1].Id);
        Assert.Equal(PaymentStatus.Failed, detail.Payments[1].Status);
        Assert.Null(detail.Payments[1].VerifiedAt);
    }

    [Fact]
    public async Task GetProposal_OnlyFailedOrCreatedPayments_ReportsUnverified()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA, DateTime.UtcNow);
        await SeedPaymentAsync(test.Db, proposal, PaymentStatus.Created, new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc));
        await SeedPaymentAsync(test.Db, proposal, PaymentStatus.Failed, new DateTime(2026, 10, 2, 10, 0, 0, DateTimeKind.Utc));

        var result = await AdminProposalsFor(test.Db, "admin-user").GetProposal(proposal.Id);
        var detail = Assert.IsType<AdminProposalDetailResponse>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.False(detail.IsPaymentVerified);
        Assert.Equal(2, detail.Payments.Count);
    }

    [Fact]
    public async Task GetProposal_UsesSnapshotsNotLiveProducts()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA, DateTime.UtcNow);

        // The live catalogue changes after the snapshot was taken.
        var product = await test.Db.Products.SingleAsync(p => p.Id == "aria-3s-sofa");
        product.Name = "Renamed Sofa";
        product.Price = 1;
        await test.Db.SaveChangesAsync();

        var result = await AdminProposalsFor(test.Db, "admin-user").GetProposal(proposal.Id);
        var detail = Assert.IsType<AdminProposalDetailResponse>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        var item = Assert.Single(detail.Items);
        Assert.Equal("Aria 3-Seater Fabric Sofa", item.ProductName);
        Assert.Equal(42999m, item.UnitPrice);
    }

    [Fact]
    public async Task GetProposal_MissingProposal_Returns404()
    {
        using var test = new TestDb();

        Assert.IsType<NotFoundResult>(
            (await AdminProposalsFor(test.Db, "admin-user").GetProposal(Guid.NewGuid())).Result);
    }

    [Fact]
    public async Task UnauthenticatedAccess_IsRejected()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA, DateTime.UtcNow);

        Assert.IsType<UnauthorizedResult>((await AdminProposalsFor(test.Db, null).GetProposals()).Result);
        Assert.IsType<UnauthorizedResult>((await AdminProposalsFor(test.Db, null).GetProposal(proposal.Id)).Result);
        Assert.Equal(1, await test.Db.Proposals.CountAsync());
    }

    [Fact]
    public void AdminProposalResponses_ExposeNoSecrets()
    {
        foreach (var type in new[]
                 {
                     typeof(AdminProposalResponse),
                     typeof(AdminProposalDetailResponse),
                     typeof(AdminProposalPaymentResponse),
                 })
        {
            var names = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Select(p => p.Name)
                .ToList();
            foreach (var banned in new[] { "Password", "Hash", "Secret", "Token", "SecurityStamp", "ConcurrencyStamp", "Signature" })
            {
                Assert.DoesNotContain(names, n => n.Contains(banned, StringComparison.OrdinalIgnoreCase));
            }
        }

        var payload = JsonSerializer.Serialize(new AdminProposalDetailResponse
        {
            Id = Guid.NewGuid(),
            UserId = UserA,
            CustomerEmail = EmailA,
            EstimateId = Guid.NewGuid(),
            Status = ProposalStatus.Draft,
            CreatedAt = DateTime.UtcNow,
            IsPaymentVerified = true,
            Payments =
            [
                new AdminProposalPaymentResponse
                {
                    Id = Guid.NewGuid(),
                    Status = PaymentStatus.Verified,
                    Provider = "Razorpay",
                    ProviderOrderId = "order-test",
                    ProviderPaymentId = "pay-test",
                    Amount = 500m,
                    Currency = "INR",
                    CreatedAt = DateTime.UtcNow,
                    VerifiedAt = DateTime.UtcNow,
                },
            ],
        });
        foreach (var banned in new[] { "PasswordHash", "SecurityStamp", "secret", "KeySecret" })
        {
            Assert.DoesNotContain(banned, payload, StringComparison.OrdinalIgnoreCase);
        }
    }
}
