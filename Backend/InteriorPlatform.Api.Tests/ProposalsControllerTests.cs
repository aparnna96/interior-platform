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
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Proposal foundation rules (Task 13A). SQLite in-memory is used for
/// relational fidelity (FKs). These tests never touch SQL Server.
/// Proposals snapshot one of the customer's saved estimates (dimensions,
/// rate, amount) plus the furniture saved with that estimate from the
/// visualizer. The shopping cart is never a proposal source.
/// </summary>
public sealed class ProposalsControllerTests
{
    private const string UserA = "user-a";
    private const string UserB = "user-b";
    private const string SofaId = "aria-3s-sofa";
    private const string ChairId = "milo-dining-chair";
    private const string SofaName = "Aria 3-Seater Fabric Sofa";
    private const string ChairName = "Milo Dining Chair";
    private const int SofaPrice = 42999;
    private const int ChairPrice = 14499;

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
                new ApplicationUser { Id = UserA, UserName = "a@test.local" },
                new ApplicationUser { Id = UserB, UserName = "b@test.local" });
            Db.Products.AddRange(
                TestProduct(SofaId, SofaName, SofaPrice),
                TestProduct(ChairId, ChairName, ChairPrice));
            Db.SaveChanges();
        }

        public void Dispose()
        {
            Db.Dispose();
            _connection.Dispose();
        }
    }

    private static Product TestProduct(string id, string name, int price) => new()
    {
        Id = id,
        Name = name,
        Category = "Sofas",
        Room = "Living Room",
        Price = price,
        Material = "Test Material",
        Finish = "Test Finish",
        Blurb = $"{id} blurb.",
        Description = $"{id} description.",
        Dimensions = "10 x 10 x 10 cm",
        ImageUrl = $"https://example.com/{id}.jpg",
        Details = [$"{id} detail"],
        IsActive = true,
    };

    private static ClaimsPrincipal PrincipalFor(string? userId) =>
        userId is null
            ? new ClaimsPrincipal(new ClaimsIdentity())
            : new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId)], "Test"));

    private static ProposalsController ProposalsFor(ApplicationDbContext db, string? userId)
    {
        var controller = new ProposalsController(db);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(userId) },
        };
        return controller;
    }

    private static CartController CartFor(ApplicationDbContext db, string? userId)
    {
        var controller = new CartController(db);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(userId) },
        };
        return controller;
    }

    private static async Task<Estimate> SeedEstimateAsync(
        ApplicationDbContext db, string userId,
        decimal width = 12m, decimal length = 15m, decimal rate = 2000m)
    {
        var area = width * length;
        var estimate = new Estimate
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Width = width,
            Length = length,
            Area = area,
            RatePerSquareFoot = rate,
            EstimatedAmount = area * rate,
            CreatedAt = DateTime.UtcNow,
        };
        db.Estimates.Add(estimate);
        await db.SaveChangesAsync();
        return estimate;
    }

    /// <summary>Adds a visualizer furniture line (server catalogue values) to a saved estimate.</summary>
    private static async Task AddFurnitureAsync(
        ApplicationDbContext db, Estimate estimate, string type, int quantity)
    {
        Assert.True(VisualizerFurnitureCatalogue.TryGet(type, out var entry));
        db.EstimateItems.Add(new EstimateItem
        {
            Id = Guid.NewGuid(),
            EstimateId = estimate.Id,
            FurnitureType = entry.Type,
            Name = entry.Name,
            WidthFt = entry.WidthFt,
            LengthFt = entry.LengthFt,
            Quantity = quantity,
        });
        await db.SaveChangesAsync();
    }

    private static async Task AddToCartAsync(
        ApplicationDbContext db, string userId, string productId, int quantity)
    {
        var result = await CartFor(db, userId).AddItem(new AddCartItemRequest
        {
            ProductId = productId,
            Quantity = quantity,
        });
        Assert.IsType<OkObjectResult>(result.Result);
    }

    private static ProposalDetailResponse CreatedProposal(ActionResult<ProposalDetailResponse> result)
    {
        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(StatusCodes.Status201Created, created.StatusCode);
        return Assert.IsType<ProposalDetailResponse>(created.Value);
    }

    private static async Task<Payment> SeedPaymentAsync(
        ApplicationDbContext db, Guid proposalId, string userId, PaymentStatus status, string orderId)
    {
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            ProposalId = proposalId,
            UserId = userId,
            Amount = 500m,
            Currency = "INR",
            Status = status,
            Provider = "Razorpay",
            ProviderOrderId = orderId,
            CreatedAt = DateTime.UtcNow,
            VerifiedAt = status == PaymentStatus.Verified ? DateTime.UtcNow : null,
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return payment;
    }

    private static async Task<ProposalDetailResponse> GetDetailAsync(
        ApplicationDbContext db, string userId, Guid proposalId)
    {
        var result = await ProposalsFor(db, userId).GetProposal(proposalId);
        return Assert.IsType<ProposalDetailResponse>(
            Assert.IsType<OkObjectResult>(result.Result).Value);
    }

    [Fact]
    public void ProposalsController_RequiresAuthorization()
    {
        Assert.True(typeof(ProposalsController).GetCustomAttributes(
            typeof(AuthorizeAttribute), inherit: true).Any());
    }

    [Fact]
    public void CreateProposalRequest_ExposesOnlyEstimateId()
    {
        // The client must have nowhere to put ownership, prices, names,
        // totals, status or timestamps.
        var names = typeof(CreateProposalRequest)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .OrderBy(n => n)
            .ToList();
        Assert.Equal(["EstimateId"], names);
    }

    [Fact]
    public void ProposalStatus_HasOnlyDraft()
    {
        var values = Enum.GetValues<ProposalStatus>();
        Assert.Equal([ProposalStatus.Draft], values);
        Assert.Equal(0, (int)ProposalStatus.Draft);
    }

    [Fact]
    public async Task CreateProposal_FromOwnEstimate_CreatesDraftSnapshot()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddFurnitureAsync(test.Db, estimate, "sofa", 2);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        Assert.NotEqual(Guid.Empty, proposal.Id);
        Assert.Equal(estimate.Id, proposal.EstimateId);
        Assert.Equal(ProposalStatus.Draft, proposal.Status);
        Assert.NotEqual(default, proposal.CreatedAt);
        Assert.False(proposal.IsPaymentVerified);

        var stored = await test.Db.Proposals.SingleAsync();
        Assert.Equal(UserA, stored.UserId);
        Assert.Equal(estimate.Id, stored.EstimateId);
        Assert.Equal(ProposalStatus.Draft, stored.Status);
    }

    [Fact]
    public async Task CreateProposal_OtherUsersEstimate_Returns404()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);

        var result = await ProposalsFor(test.Db, UserB)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id });

        Assert.IsType<NotFoundResult>(result.Result);
        Assert.Equal(0, await test.Db.Proposals.CountAsync());
    }

    [Fact]
    public async Task CreateProposal_MissingEstimate_Returns404()
    {
        using var test = new TestDb();

        var result = await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = Guid.NewGuid() });

        Assert.IsType<NotFoundResult>(result.Result);
        Assert.Equal(0, await test.Db.Proposals.CountAsync());
    }

    [Fact]
    public async Task UnauthenticatedAccess_IsRejected()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);

        Assert.IsType<UnauthorizedResult>((await ProposalsFor(test.Db, null)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id })).Result);
        Assert.IsType<UnauthorizedResult>((await ProposalsFor(test.Db, null).GetProposals()).Result);
        Assert.IsType<UnauthorizedResult>((await ProposalsFor(test.Db, null).GetProposal(Guid.NewGuid())).Result);
        Assert.Equal(0, await test.Db.Proposals.CountAsync());
    }

    [Fact]
    public async Task CreatedProposal_SnapshotsEstimateValues()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA, width: 12m, length: 15m, rate: 2000m);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        Assert.Equal(12m, proposal.Width);
        Assert.Equal(15m, proposal.Length);
        Assert.Equal(180m, proposal.Area);
        Assert.Equal(2000m, proposal.RatePerSquareFoot);
        Assert.Equal(180m * 2000m, proposal.EstimatedAmount);
    }

    [Fact]
    public async Task CreatedProposal_CopiesEstimateFurniture_UnpricedWithFootprint()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddFurnitureAsync(test.Db, estimate, "sofa", 2);
        await AddFurnitureAsync(test.Db, estimate, "chair", 4);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        Assert.Equal(2, proposal.Items.Count);

        var sofa = Assert.Single(proposal.Items, i => i.FurnitureType == "sofa");
        Assert.Null(sofa.ProductId);
        Assert.Equal("Sofa", sofa.ProductName);
        Assert.Equal(2, sofa.Quantity);
        Assert.Equal(7m, sofa.WidthFt);
        Assert.Equal(3m, sofa.LengthFt);

        var chair = Assert.Single(proposal.Items, i => i.FurnitureType == "chair");
        Assert.Equal("Chair", chair.ProductName);
        Assert.Equal(4, chair.Quantity);

        // Visualizer furniture is "to be quoted": no invented prices, and the
        // proposal amount stays the area-based estimate.
        Assert.All(proposal.Items, i =>
        {
            Assert.Equal(0m, i.UnitPrice);
            Assert.Equal(0m, i.LineTotal);
        });
        Assert.Equal(estimate.EstimatedAmount, proposal.EstimatedAmount);
    }

    [Fact]
    public async Task CreateProposal_IgnoresCartContents()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddFurnitureAsync(test.Db, estimate, "bed", 1);
        await AddToCartAsync(test.Db, UserA, SofaId, 3);
        await AddToCartAsync(test.Db, UserA, ChairId, 2);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        // Only the estimate's visualizer furniture appears; no cart product.
        var line = Assert.Single(proposal.Items);
        Assert.Equal("bed", line.FurnitureType);
        Assert.DoesNotContain(proposal.Items, i => i.ProductId is not null);

        // The e-commerce cart is left exactly as it was.
        Assert.Equal(2, await test.Db.CartItems.CountAsync());
        Assert.Equal(5, await test.Db.CartItems.SumAsync(i => i.Quantity));
    }

    [Fact]
    public async Task CreateProposal_CartOnly_YieldsDimensionOnlyProposal()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddToCartAsync(test.Db, UserA, SofaId, 1);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        Assert.Empty(proposal.Items);
        Assert.Equal(0, await test.Db.ProposalItems.CountAsync());
    }

    [Fact]
    public async Task CreateProposal_ForbidsOtherUsersEstimateFurniture()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddFurnitureAsync(test.Db, estimate, "sofa", 1);

        var result = await ProposalsFor(test.Db, UserB)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id });

        Assert.IsType<NotFoundResult>(result.Result);
        Assert.Equal(0, await test.Db.ProposalItems.CountAsync());
    }

    [Fact]
    public async Task ProposalHistory_SurvivesEstimateFurnitureChanges()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddFurnitureAsync(test.Db, estimate, "sofa", 1);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        // Later edits to the saved estimate's furniture must not mutate history.
        test.Db.EstimateItems.RemoveRange(test.Db.EstimateItems);
        await AddFurnitureAsync(test.Db, estimate, "wardrobe", 5);

        var detail = await GetDetailAsync(test.Db, UserA, proposal.Id);
        var item = Assert.Single(detail.Items);
        Assert.Equal("sofa", item.FurnitureType);
        Assert.Equal(1, item.Quantity);
    }

    [Fact]
    public async Task ProposalHistory_SurvivesCartChanges()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddFurnitureAsync(test.Db, estimate, "sofa", 1);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));
        Assert.Single(proposal.Items);

        await AddToCartAsync(test.Db, UserA, ChairId, 3);
        test.Db.CartItems.RemoveRange(test.Db.CartItems);
        await test.Db.SaveChangesAsync();

        var detail = await GetDetailAsync(test.Db, UserA, proposal.Id);
        var item = Assert.Single(detail.Items);
        Assert.Equal("sofa", item.FurnitureType);
        Assert.Equal("Sofa", item.ProductName);
    }

    [Fact]
    public async Task LegacyCatalogueProposalLines_StillReadable()
    {
        // Proposals created before this change hold product snapshot lines.
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        var legacy = new Proposal
        {
            Id = Guid.NewGuid(),
            UserId = UserA,
            EstimateId = estimate.Id,
            Width = estimate.Width,
            Length = estimate.Length,
            Area = estimate.Area,
            RatePerSquareFoot = estimate.RatePerSquareFoot,
            EstimatedAmount = estimate.EstimatedAmount,
            Status = ProposalStatus.Draft,
            CreatedAt = DateTime.UtcNow,
            Items =
            [
                new ProposalItem
                {
                    Id = Guid.NewGuid(),
                    ProductId = SofaId,
                    ProductName = SofaName,
                    UnitPrice = SofaPrice,
                    Quantity = 2,
                    LineTotal = 2 * (decimal)SofaPrice,
                },
            ],
        };
        test.Db.Proposals.Add(legacy);
        await test.Db.SaveChangesAsync();

        var detail = await GetDetailAsync(test.Db, UserA, legacy.Id);
        var item = Assert.Single(detail.Items);
        Assert.Equal(SofaId, item.ProductId);
        Assert.Null(item.FurnitureType);
        Assert.Equal(2 * (decimal)SofaPrice, item.LineTotal);
    }
    [Fact]
    public async Task ProposalHistory_SurvivesEstimateChanges()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA, width: 10m, length: 10m, rate: 2000m);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        var storedEstimate = test.Db.Estimates.Single(e => e.Id == estimate.Id);
        storedEstimate.Width = 99m;
        storedEstimate.Length = 99m;
        storedEstimate.Area = 9801m;
        storedEstimate.RatePerSquareFoot = 1m;
        storedEstimate.EstimatedAmount = 9801m;
        await test.Db.SaveChangesAsync();

        var reloaded = await ProposalsFor(test.Db, UserA).GetProposal(proposal.Id);
        var detail = Assert.IsType<ProposalDetailResponse>(
            Assert.IsType<OkObjectResult>(reloaded.Result).Value);
        Assert.Equal(10m, detail.Width);
        Assert.Equal(10m, detail.Length);
        Assert.Equal(100m, detail.Area);
        Assert.Equal(2000m, detail.RatePerSquareFoot);
        Assert.Equal(100m * 2000m, detail.EstimatedAmount);
    }

    [Fact]
    public async Task GetProposals_ReturnsOnlyOwnProposalsNewestFirst()
    {
        using var test = new TestDb();
        var firstEstimate = await SeedEstimateAsync(test.Db, UserA, width: 10m, length: 10m);
        var first = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = firstEstimate.Id }));

        var otherEstimate = await SeedEstimateAsync(test.Db, UserB);
        CreatedProposal(await ProposalsFor(test.Db, UserB)
            .CreateProposal(new CreateProposalRequest { EstimateId = otherEstimate.Id }));

        await Task.Delay(20);
        var secondEstimate = await SeedEstimateAsync(test.Db, UserA, width: 12m, length: 12m);
        var second = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = secondEstimate.Id }));

        var listResult = await ProposalsFor(test.Db, UserA).GetProposals();
        var list = Assert.IsType<List<ProposalResponse>>(
            Assert.IsType<OkObjectResult>(listResult.Result).Value);

        Assert.Equal(2, list.Count);
        Assert.Equal(second.Id, list[0].Id);
        Assert.Equal(first.Id, list[1].Id);
        Assert.True(list[0].CreatedAt >= list[1].CreatedAt);
        Assert.All(list, p => Assert.Equal(ProposalStatus.Draft, p.Status));
    }

    [Fact]
    public async Task GetProposal_OwnProposal_ReturnsDetailWithItems()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddFurnitureAsync(test.Db, estimate, "sofa", 3);

        var created = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        var result = await ProposalsFor(test.Db, UserA).GetProposal(created.Id);
        var detail = Assert.IsType<ProposalDetailResponse>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(created.Id, detail.Id);
        Assert.Equal(estimate.Id, detail.EstimateId);
        Assert.Equal(ProposalStatus.Draft, detail.Status);
        var item = Assert.Single(detail.Items);
        Assert.Equal("sofa", item.FurnitureType);
        Assert.Equal("Sofa", item.ProductName);
        Assert.Equal(3, item.Quantity);
        Assert.Equal(0m, item.LineTotal);
    }

    [Fact]
    public async Task GetProposal_OtherUsersProposal_Returns404()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        Assert.IsType<NotFoundResult>((await ProposalsFor(test.Db, UserB).GetProposal(proposal.Id)).Result);
    }

    [Fact]
    public async Task GetProposal_WithoutPayment_ReportsPaymentUnverified()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        var detail = await GetDetailAsync(test.Db, UserA, proposal.Id);

        Assert.False(detail.IsPaymentVerified);
    }

    [Fact]
    public async Task GetProposal_WithCreatedPayment_ReportsPaymentUnverified()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));
        await SeedPaymentAsync(test.Db, proposal.Id, UserA, PaymentStatus.Created, "order-test-created");

        var detail = await GetDetailAsync(test.Db, UserA, proposal.Id);

        Assert.False(detail.IsPaymentVerified);
    }

    [Fact]
    public async Task GetProposal_WithVerifiedPayment_ReportsPaymentVerified()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));
        await SeedPaymentAsync(test.Db, proposal.Id, UserA, PaymentStatus.Verified, "order-test-verified");

        var detail = await GetDetailAsync(test.Db, UserA, proposal.Id);

        Assert.True(detail.IsPaymentVerified);
    }

    [Fact]
    public async Task GetProposal_VerifiedPaymentOnAnotherProposal_ReportsPaymentUnverified()
    {
        using var test = new TestDb();
        var estimateA = await SeedEstimateAsync(test.Db, UserA);
        var proposalA = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimateA.Id }));
        var estimateB = await SeedEstimateAsync(test.Db, UserA);
        var proposalB = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimateB.Id }));
        await SeedPaymentAsync(test.Db, proposalB.Id, UserA, PaymentStatus.Verified, "order-test-other");

        var detail = await GetDetailAsync(test.Db, UserA, proposalA.Id);

        Assert.False(detail.IsPaymentVerified);
    }

    [Fact]
    public async Task GetProposal_MissingProposal_Returns404()
    {
        using var test = new TestDb();

        Assert.IsType<NotFoundResult>(
            (await ProposalsFor(test.Db, UserA).GetProposal(Guid.NewGuid())).Result);
    }

    [Fact]
    public async Task CreateProposal_EmptyEstimateId_Returns400()
    {
        using var test = new TestDb();

        var result = await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = Guid.Empty });

        var bad = Assert.IsType<ObjectResult>(result.Result);
        Assert.True(
            bad.StatusCode == StatusCodes.Status400BadRequest ||
            (bad.StatusCode is null && bad.Value is ValidationProblemDetails),
            $"Expected 400, got {bad.StatusCode}.");
        Assert.Equal(0, await test.Db.Proposals.CountAsync());
    }
}
