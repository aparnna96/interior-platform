using System.Globalization;
using InteriorPlatform.Api.Models;
using QuestPDF;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace InteriorPlatform.Api.Services;

/// <summary>
/// Renders a client-ready proposal PDF from the persisted <see cref="Proposal"/>
/// snapshot. Only snapshot fields are read — dimensions, rate and amount from
/// the proposal itself, and name, price, quantity and line totals from its
/// items. Current product, estimate, cart and profile data are never
/// consulted, so the document cannot drift from the stored snapshot.
/// <para/>
/// Nothing is invented: no company address, phone, GST/tax numbers, email,
/// website, customer name, taxes, discounts, fees or legal terms appear,
/// because the proposal model persists none of them.
/// <see cref="Proposal.EstimatedAmount"/> is the authoritative total.
/// </summary>
public static class ProposalPdfGenerator
{
    static ProposalPdfGenerator()
    {
        // QuestPDF requires an explicit license selection. Community covers
        // this project (non-commercial internship work); see
        // https://www.questpdf.com/license for the current terms.
        Settings.License = LicenseType.Community;

        // Use fonts installed on the host (Windows development/production
        // hosts ship Arial/Calibri-class faces covering Latin + ₹). The
        // alternative — bundling font files with the app — can be adopted
        // later if Linux-container hosting needs fully pinned typography.
        Settings.UseSystemFonts = true;
    }

    private static readonly CultureInfo InrCulture = CultureInfo.GetCultureInfo("en-IN");

    private const string Bronze = "#8C6B4A";

    /// <summary>
    /// Builds the proposal PDF. The proposal's <see cref="Proposal.Items"/>
    /// must already be loaded; nothing is read from the database here.
    /// </summary>
    public static byte[] Generate(Proposal proposal)
    {
        ArgumentNullException.ThrowIfNull(proposal);

        var items = proposal.Items
            .OrderBy(i => i.FurnitureType ?? i.ProductId, StringComparer.Ordinal)
            .ToList();
        var furnitureTotal = items.Sum(i => i.LineTotal);
        // Visualizer furniture is unpriced ("to be quoted"): the table then
        // shows size and quantity instead of a column of zero rupee amounts.
        var hasPricedItems = items.Any(i => i.LineTotal > 0m);

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(2, Unit.Centimetre);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(style => style.FontSize(10).FontColor(Colors.Grey.Darken4));

                page.Header().Column(header =>
                {
                    header.Spacing(4);

                    header.Item().Text("CONFIDENT GROUP")
                        .LetterSpacing(2).FontSize(11).SemiBold().FontColor(Colors.Grey.Darken2);

                    header.Item().Text("INTERIOR PROJECT PROPOSAL")
                        .FontSize(22).Bold().FontColor(Colors.Black);

                    header.Item().Row(row =>
                    {
                        row.RelativeItem().Text(text =>
                        {
                            text.Span("Proposal ID  ").SemiBold();
                            text.Span(proposal.Id.ToString());
                        });
                        row.AutoItem().Text(text =>
                        {
                            text.Span("Date  ").SemiBold();
                            text.Span(FormatDate(proposal.CreatedAt));
                        });
                    });

                    header.Item().LineHorizontal(1).LineColor(Bronze);
                });

                page.Content().PaddingVertical(12).Column(content =>
                {
                    content.Spacing(14);

                    content.Item().Element(container => Section(container, "Project Information", section =>
                    {
                        KeyValues(section, new (string Label, string Value)[]
                        {
                            ("Proposal reference", proposal.Id.ToString()),
                            ("Estimate reference", proposal.EstimateId.ToString()),
                            ("Proposal date", FormatDate(proposal.CreatedAt)),
                            ("Status", proposal.Status.ToString()),
                        });
                    }));

                    content.Item().Element(container => Section(container, "Space Details", section =>
                    {
                        KeyValues(section, new (string Label, string Value)[]
                        {
                            ("Room width", $"{FormatNumber(proposal.Width)} ft"),
                            ("Room length", $"{FormatNumber(proposal.Length)} ft"),
                            ("Area", $"{FormatNumber(proposal.Area)} sq.ft."),
                            ("Rate per square foot", $"{FormatInr(proposal.RatePerSquareFoot)}"),
                            ("Estimated amount", FormatInr(proposal.EstimatedAmount)),
                        });
                    }));

                    content.Item().Element(container => Section(container, "Selected Furniture", section =>
                    {
                        if (items.Count == 0)
                        {
                            section.Text("No furniture items were included in this proposal.")
                                .Italic().FontColor(Colors.Grey.Darken2);
                            return;
                        }

                        section.Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.RelativeColumn(5);
                                columns.ConstantColumn(60);
                                columns.ConstantColumn(95);
                                columns.ConstantColumn(95);
                            });

                            table.Header(header =>
                            {
                                header.Cell().Element(HeaderCell).Text("Item");
                                header.Cell().Element(HeaderCell).AlignRight().Text("Quantity");
                                header.Cell().Element(HeaderCell).AlignRight().Text(hasPricedItems ? "Unit Price" : "Size");
                                header.Cell().Element(HeaderCell).AlignRight().Text(hasPricedItems ? "Amount" : "Pricing");
                            });

                            foreach (var item in items)
                            {
                                table.Cell().Element(BodyCell).Text(item.ProductName);
                                table.Cell().Element(BodyCell).AlignRight().Text(item.Quantity.ToString(CultureInfo.InvariantCulture));
                                if (hasPricedItems)
                                {
                                    table.Cell().Element(BodyCell).AlignRight().Text(FormatInr(item.UnitPrice));
                                    table.Cell().Element(BodyCell).AlignRight().Text(FormatInr(item.LineTotal));
                                }
                                else
                                {
                                    table.Cell().Element(BodyCell).AlignRight().Text(FormatSize(item));
                                    table.Cell().Element(BodyCell).AlignRight().Text("To be quoted");
                                }
                            }

                            static IContainer HeaderCell(IContainer container) => container
                                .Background(Colors.Grey.Lighten3)
                                .PaddingVertical(6).PaddingHorizontal(6)
                                .DefaultTextStyle(style => style.SemiBold().FontColor(Colors.Black));

                            static IContainer BodyCell(IContainer container) => container
                                .BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2)
                                .PaddingVertical(6).PaddingHorizontal(6);
                        });
                    }));

                    content.Item().Element(container => Section(container, "Cost Summary", section =>
                    {
                        section.Column(summary =>
                        {
                            summary.Spacing(2);

                            summary.Item().Row(row =>
                            {
                                row.RelativeItem().Text("Area-based estimate").FontColor(Colors.Grey.Darken2);
                                row.AutoItem().Text(FormatInr(proposal.EstimatedAmount));
                            });

                            if (hasPricedItems)
                            {
                                summary.Item().Row(row =>
                                {
                                    row.RelativeItem().Text($"Furniture total ({items.Count} item{(items.Count == 1 ? string.Empty : "s")})").FontColor(Colors.Grey.Darken2);
                                    row.AutoItem().Text(FormatInr(furnitureTotal));
                                });
                            }
                            else if (items.Count > 0)
                            {
                                var pieces = items.Sum(i => i.Quantity);
                                summary.Item().Row(row =>
                                {
                                    row.RelativeItem().Text($"Furniture ({pieces} piece{(pieces == 1 ? string.Empty : "s")})").FontColor(Colors.Grey.Darken2);
                                    row.AutoItem().Text("To be quoted");
                                });
                            }

                            summary.Item().PaddingTop(4).Row(row =>
                            {
                                row.RelativeItem().Text("Proposal estimated amount").Bold();
                                row.AutoItem().Text(FormatInr(proposal.EstimatedAmount)).Bold().FontSize(12);
                            });
                        });
                    }));

                    content.Item().Text(
                        "This proposal is prepared based on the dimensions, selections and specifications " +
                        "available at the time of preparation. Final pricing may vary based on material selection, " +
                        "finishes, site conditions, measurements and final project confirmation.")
                        .FontSize(9).Italic().FontColor(Colors.Grey.Darken2);
                });

                page.Footer().AlignCenter().Text(text =>
                {
                    text.DefaultTextStyle(style => style.FontSize(8).FontColor(Colors.Grey.Medium));
                    text.Span($"Proposal {proposal.Id}");
                    text.Span("   ·   Page ");
                    text.CurrentPageNumber();
                    text.Span(" of ");
                    text.TotalPages();
                });
            });
        })
        .WithMetadata(new DocumentMetadata
        {
            Title = $"Interior Project Proposal {proposal.Id}",
            // Pin the PDF timestamps to the proposal snapshot date: the bytes
            // then depend only on persisted snapshot data, so regenerating the
            // same proposal always yields the same document.
            CreationDate = proposal.CreatedAt,
            ModifiedDate = proposal.CreatedAt,
        })
        .GeneratePdf();
    }

    private static void Section(IContainer container, string title, Action<IContainer> body)
    {
        container.Column(column =>
        {
            column.Spacing(6);
            column.Item().Text(title.ToUpperInvariant()).FontSize(12).Bold().FontColor(Colors.Black);
            column.Item().LineHorizontal(0.75f).LineColor(Colors.Grey.Lighten2);
            column.Item().Element(body);
        });
    }

    private static void KeyValues(IContainer container, IEnumerable<(string Label, string Value)> rows)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(150);
                columns.RelativeColumn();
            });

            foreach (var (label, value) in rows)
            {
                table.Cell().PaddingVertical(3).Text(label).SemiBold().FontColor(Colors.Grey.Darken2);
                table.Cell().PaddingVertical(3).Text(value);
            }
        });
    }

    private static string FormatInr(decimal value) =>
        "₹" + value.ToString("N2", InrCulture);

    private static string FormatSize(ProposalItem item) =>
        item.WidthFt is { } w && item.LengthFt is { } l
            ? $"{FormatNumber(w)} x {FormatNumber(l)} ft"
            : "-";

    private static string FormatNumber(decimal value) =>
        value.ToString("0.##", CultureInfo.InvariantCulture);

    private static string FormatDate(DateTime value) =>
        value.ToString("dd MMMM yyyy", CultureInfo.InvariantCulture);
}
