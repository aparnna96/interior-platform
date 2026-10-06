using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="EstimateItem"/>.
/// </summary>
public class EstimateItemConfiguration : IEntityTypeConfiguration<EstimateItem>
{
    public void Configure(EntityTypeBuilder<EstimateItem> builder)
    {
        builder.HasKey(i => i.Id);

        builder.Property(i => i.FurnitureType).IsRequired().HasMaxLength(50);
        builder.Property(i => i.Name).IsRequired().HasMaxLength(100);
        builder.Property(i => i.Quantity).IsRequired();
        builder.Property(i => i.WidthFt).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(i => i.LengthFt).HasColumnType("decimal(18,2)").IsRequired();

        // Database-level backstop for the 1-99 quantity rule.
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_EstimateItems_Quantity_Range",
            "[Quantity] >= 1 AND [Quantity] <= 99"));

        // Lines belong to their estimate: deleting the estimate removes them.
        builder.HasOne(i => i.Estimate)
            .WithMany(e => e.Items)
            .HasForeignKey(i => i.EstimateId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(i => i.EstimateId);
    }
}
