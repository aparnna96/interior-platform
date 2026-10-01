using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Estimate"/>.
/// </summary>
public class EstimateConfiguration : IEntityTypeConfiguration<Estimate>
{
    public void Configure(EntityTypeBuilder<Estimate> builder)
    {
        builder.HasKey(e => e.Id);

        // Matches AspNetUsers.Id (nvarchar(450)).
        builder.Property(e => e.UserId).IsRequired().HasMaxLength(450);
        builder.Property(e => e.CreatedAt).IsRequired();

        // Money precision, matching the order tables.
        builder.Property(e => e.RatePerSquareFoot).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(e => e.EstimatedAmount).HasColumnType("decimal(18,2)").IsRequired();

        // Physical dimensions/area in feet and sq.ft. Two decimals resolve
        // 1/100 ft (about 3 mm), beyond any interior-planning need.
        builder.Property(e => e.Width).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(e => e.Length).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(e => e.Area).HasColumnType("decimal(18,2)").IsRequired();

        // Estimates are customer history: deleting a user must never
        // silently delete their estimates, so block the delete instead.
        // (Same choice as Order; contrast Cart, which is ephemeral state.)
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(e => e.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        // The common query is one user's estimates, newest first.
        builder.HasIndex(e => e.UserId);
        builder.HasIndex(e => e.CreatedAt);
    }
}
