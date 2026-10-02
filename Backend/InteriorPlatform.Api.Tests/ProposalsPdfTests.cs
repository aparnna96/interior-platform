using InteriorPlatform.Api.Controllers;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using InteriorPlatform.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Proposal PDF rules (Task 13C). SQLite in-memory is used for relational
/// fidelity. These tests never touch the real SQL Server database.
/// The PDF is rendered only from the persisted proposal snapshot: later
/// product or estimate edits must not change the generated document, which
/// is verified by byte-equality of the generated PDFs (QuestPDF output is
/// deterministic for identical input on the same host).
/// </summary>
public sealed class ProposalsPdfTests
{
    private const string UserA = "user-a";
    private const string UserB = "user-b";
    private const string SofaId = "aria-3s-sofa";
    private const string ChairId = "milo-dining-chair";
    private const string SofaName = "Aria 3-Seater Fabric Sofa";
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
                TestProduct(ChairId, "Milo Dining Chair", ChairPrice));
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

    private static FileContentResult DownloadedPdf(IActionResult result)
    {
        var file = Assert.IsType<FileContentResult>(result);
        Assert.Equal("application/pdf", file.ContentType);
        Assert.NotNull(file.FileContents);
        Assert.True(file.FileContents.Length > 0, "PDF must be non-empty.");
        return file;
    }

    [Fact]
    public async Task Owner_CanDownloadProposalPdf()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddToCartAsync(test.Db, UserA, SofaId, 2);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        var file = DownloadedPdf(await ProposalsFor(test.Db, UserA).DownloadProposalPdf(proposal.Id));

        Assert.Equal($"proposal-{proposal.Id}.pdf", file.FileDownloadName);
        // PDF magic header: the payload is a real PDF document.
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(file.FileContents, 0, 4));
    }

    [Fact]
    public async Task DownloadPdf_EmptyItemsProposal_ReturnsNonEmptyPdf()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));
        Assert.Empty(proposal.Items);

        DownloadedPdf(await ProposalsFor(test.Db, UserA).DownloadProposalPdf(proposal.Id));
    }

    [Fact]
    public async Task DownloadPdf_Unauthenticated_Returns401()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        Assert.IsType<UnauthorizedResult>(
            await ProposalsFor(test.Db, null).DownloadProposalPdf(proposal.Id));
    }

    [Fact]
    public async Task DownloadPdf_OtherUsersProposal_Returns404()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        Assert.IsType<NotFoundResult>(
            await ProposalsFor(test.Db, UserB).DownloadProposalPdf(proposal.Id));
    }

    [Fact]
    public async Task DownloadPdf_ManyItemsProposal_ReturnsNonEmptyPdf()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddToCartAsync(test.Db, UserA, SofaId, 1);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        var single = DownloadedPdf(
            await ProposalsFor(test.Db, UserA).DownloadProposalPdf(proposal.Id)).FileContents;

        // A large furniture list must paginate instead of overflowing.
        for (var n = 0; n < 59; n++)
        {
            test.Db.ProposalItems.Add(new ProposalItem
            {
                Id = Guid.NewGuid(),
                ProposalId = proposal.Id,
                ProductId = n % 2 == 0 ? SofaId : ChairId,
                ProductName = $"Snapshot Item {n:00}",
                UnitPrice = 1000m + n,
                Quantity = 1 + (n % 3),
                LineTotal = (1000m + n) * (1 + (n % 3)),
            });
        }
        await test.Db.SaveChangesAsync();

        var many = DownloadedPdf(
            await ProposalsFor(test.Db, UserA).DownloadProposalPdf(proposal.Id)).FileContents;

        Assert.True(many.Length > single.Length, "More items must grow the document.");
    }

    [Fact]
    public async Task DownloadPdf_MissingProposal_Returns404()
    {
        using var test = new TestDb();

        Assert.IsType<NotFoundResult>(
            await ProposalsFor(test.Db, UserA).DownloadProposalPdf(Guid.NewGuid()));
    }

    [Fact]
    public async Task GeneratedPdf_UsesProposalSnapshot_DespiteLaterProductChanges()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA);
        await AddToCartAsync(test.Db, UserA, SofaId, 1);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        var before = DownloadedPdf(
            await ProposalsFor(test.Db, UserA).DownloadProposalPdf(proposal.Id)).FileContents;

        // Mutate the live catalogue after the snapshot was taken.
        var product = test.Db.Products.Single(p => p.Id == SofaId);
        product.Name = "Renamed Sofa";
        product.Price = 1;
        product.IsActive = false;
        await test.Db.SaveChangesAsync();

        var after = DownloadedPdf(
            await ProposalsFor(test.Db, UserA).DownloadProposalPdf(proposal.Id)).FileContents;

        Assert.Equal(before, after);
    }

    [Fact]
    public async Task GeneratedPdf_UsesProposalSnapshot_DespiteLaterEstimateChanges()
    {
        using var test = new TestDb();
        var estimate = await SeedEstimateAsync(test.Db, UserA, width: 10m, length: 10m, rate: 2000m);
        var proposal = CreatedProposal(await ProposalsFor(test.Db, UserA)
            .CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id }));

        var before = DownloadedPdf(
            await ProposalsFor(test.Db, UserA).DownloadProposalPdf(proposal.Id)).FileContents;

        // Mutate the live estimate after the snapshot was taken.
        var stored = test.Db.Estimates.Single(e => e.Id == estimate.Id);
        stored.Width = 99m;
        stored.Length = 99m;
        stored.Area = 9801m;
        stored.RatePerSquareFoot = 1m;
        stored.EstimatedAmount = 9801m;
        await test.Db.SaveChangesAsync();

        var after = DownloadedPdf(
            await ProposalsFor(test.Db, UserA).DownloadProposalPdf(proposal.Id)).FileContents;

        Assert.Equal(before, after);
    }

    [Fact]
    public void Generator_DoesNotModifyProposal()
    {
        var proposal = new Proposal
        {
            Id = Guid.NewGuid(),
            UserId = UserA,
            EstimateId = Guid.NewGuid(),
            Width = 12m,
            Length = 15m,
            Area = 180m,
            RatePerSquareFoot = 2000m,
            EstimatedAmount = 360000m,
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

        var pdf = ProposalPdfGenerator.Generate(proposal);

        Assert.NotNull(pdf);
        Assert.True(pdf.Length > 0);
        Assert.Equal(ProposalStatus.Draft, proposal.Status);
        Assert.Equal(360000m, proposal.EstimatedAmount);
        Assert.Single(proposal.Items);
        Assert.Equal(SofaName, proposal.Items[0].ProductName);
    }
}
