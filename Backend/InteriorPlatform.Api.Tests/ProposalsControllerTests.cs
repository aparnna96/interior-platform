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
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Proposal foundation rules (Task 13A). SQLite in-memory is used for
/// relational fidelity (FKs). These tests never touch SQL Server.
/// Proposals snapshot one of the customer's saved estimates (dimensions,
/// rate, amount) plus the customer's current cart furniture lines
/// (product name + current price, server-computed line totals).
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
        await AddToCartAsync(test.Db, UserA, SofaId, 2);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        Assert.NotEqual(Guid.Empty, proposal.Id);
        Assert.Equal(estimate.Id, proposal.EstimateId);
        Assert.Equal(ProposalStatus.Draft, proposal.Status);
        Assert.NotEqual(default, proposal.CreatedAt);

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
    public async Task CreatedProposal_SnapshotsProductNameAndPrice_WithServerLineTotals()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddToCartAsync(test.Db, UserA, SofaId, 2);
        await AddToCartAsync(test.Db, UserA, ChairId, 1);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        Assert.Equal(2, proposal.Items.Count);

        var sofa = Assert.Single(proposal.Items, i => i.ProductId == SofaId);
        Assert.Equal(SofaName, sofa.ProductName);
        Assert.Equal((decimal)SofaPrice, sofa.UnitPrice);
        Assert.Equal(2, sofa.Quantity);
        Assert.Equal(2 * (decimal)SofaPrice, sofa.LineTotal);

        var chair = Assert.Single(proposal.Items, i => i.ProductId == ChairId);
        Assert.Equal(ChairName, chair.ProductName);
        Assert.Equal((decimal)ChairPrice, chair.UnitPrice);
        Assert.Equal(1, chair.Quantity);
        Assert.Equal((decimal)ChairPrice, chair.LineTotal);

        // Every line total is UnitPrice * Quantity, computed server-side.
        Assert.All(proposal.Items, i => Assert.Equal(i.UnitPrice * i.Quantity, i.LineTotal));
    }

    [Fact]
    public async Task ProposalHistory_SurvivesProductChanges()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddToCartAsync(test.Db, UserA, SofaId, 1);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        var product = test.Db.Products.Single(p => p.Id == SofaId);
        product.Name = "Renamed Sofa";
        product.Price = 1;
        product.IsActive = false;
        await test.Db.SaveChangesAsync();

        var reloaded = await ProposalsFor(test.Db, UserA).GetProposal(proposal.Id);
        var detail = Assert.IsType<ProposalDetailResponse>(
            Assert.IsType<OkObjectResult>(reloaded.Result).Value);
        var item = Assert.Single(detail.Items);
        Assert.Equal(SofaName, item.ProductName);
        Assert.Equal((decimal)SofaPrice, item.UnitPrice);
        Assert.Equal((decimal)SofaPrice, item.LineTotal);
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
    public async Task ProposalHistory_SurvivesCartChanges()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddToCartAsync(test.Db, UserA, SofaId, 1);

        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));
        Assert.Single(proposal.Items);

        // Later visualizer/cart edits (add + clear) must not mutate history.
        await AddToCartAsync(test.Db, UserA, ChairId, 3);
        var cart = await CartFor(test.Db, UserA).GetCart();
        var cartResponse = Assert.IsType<CartResponse>(
            Assert.IsType<OkObjectResult>(cart.Result).Value);
        foreach (var cartLine in cartResponse.Items)
        {
            var stored = await test.Db.CartItems.SingleAsync(i => i.Id == cartLine.Id);
            test.Db.CartItems.Remove(stored);
        }
        await test.Db.SaveChangesAsync();

        var reloaded = await ProposalsFor(test.Db, UserA).GetProposal(proposal.Id);
        var detail = Assert.IsType<ProposalDetailResponse>(
            Assert.IsType<OkObjectResult>(reloaded.Result).Value);
        var item = Assert.Single(detail.Items);
        Assert.Equal(SofaId, item.ProductId);
        Assert.Equal(SofaName, item.ProductName);
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
        await AddToCartAsync(test.Db, UserA, SofaId, 3);

        var created = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        var result = await ProposalsFor(test.Db, UserA).GetProposal(created.Id);
        var detail = Assert.IsType<ProposalDetailResponse>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(created.Id, detail.Id);
        Assert.Equal(estimate.Id, detail.EstimateId);
        Assert.Equal(ProposalStatus.Draft, detail.Status);
        var item = Assert.Single(detail.Items);
        Assert.Equal(SofaId, item.ProductId);
        Assert.Equal(SofaName, item.ProductName);
        Assert.Equal((decimal)SofaPrice, item.UnitPrice);
        Assert.Equal(3, item.Quantity);
        Assert.Equal(3 * (decimal)SofaPrice, item.LineTotal);
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
