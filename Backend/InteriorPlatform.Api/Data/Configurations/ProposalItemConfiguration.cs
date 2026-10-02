using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="ProposalItem"/>.
/// </summary>
public class ProposalItemConfiguration : IEntityTypeConfiguration<ProposalItem>
{
    public void Configure(EntityTypeBuilder<ProposalItem> builder)
    {
        builder.HasKey(i => i.Id);

        // Matches Products.Id slug (see ProductConfiguration).
        builder.Property(i => i.ProductId).IsRequired().HasMaxLength(100);
        builder.Property(i => i.ProductName).IsRequired().HasMaxLength(200);
        builder.Property(i => i.Quantity).IsRequired();

        // Sensible money precision.
        builder.Property(i => i.UnitPrice).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(i => i.LineTotal).HasColumnType("decimal(18,2)").IsRequired();

        // Database-level backstop for the 1-99 quantity rule (quantities are
        // copied from the already-validated cart).
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_ProposalItems_Quantity_Range",
            "[Quantity] >= 1 AND [Quantity] <= 99"));

        // Lines belong to their proposal: deleting the proposal removes them.
        builder.HasOne(i => i.Proposal)
            .WithMany(p => p.Items)
            .HasForeignKey(i => i.ProposalId)
            .OnDelete(DeleteBehavior.Cascade);

        // Historical lines must survive product changes. Physical product
        // deletion is already unsupported (soft-delete via IsActive);
        // Restrict additionally blocks deleting a referenced product row.
        // Display always comes from the ProductName/UnitPrice snapshots.
        builder.HasOne(i => i.Product)
            .WithMany()
            .HasForeignKey(i => i.ProductId)
            .OnDelete(DeleteBehavior.Restrict);

        // Proposal-scoped line lookups.
        builder.HasIndex(i => i.ProposalId);
        builder.HasIndex(i => i.ProductId);
    }
}
