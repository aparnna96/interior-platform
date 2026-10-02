using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Proposal"/>.
/// </summary>
public class ProposalConfiguration : IEntityTypeConfiguration<Proposal>
{
    public void Configure(EntityTypeBuilder<Proposal> builder)
    {
        builder.HasKey(p => p.Id);

        // Matches AspNetUsers.Id (nvarchar(450)).
        builder.Property(p => p.UserId).IsRequired().HasMaxLength(450);
        builder.Property(p => p.EstimateId).IsRequired();
        builder.Property(p => p.CreatedAt).IsRequired();

        // Enum stored as int in SQL Server (EF Core default for enums).
        builder.Property(p => p.Status).IsRequired();

        // Money precision, matching the estimate/order tables.
        builder.Property(p => p.RatePerSquareFoot).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(p => p.EstimatedAmount).HasColumnType("decimal(18,2)").IsRequired();

        // Snapshot dimensions/area, matching the estimate tables.
        builder.Property(p => p.Width).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(p => p.Length).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(p => p.Area).HasColumnType("decimal(18,2)").IsRequired();

        // Proposals are customer history: deleting a user must never
        // silently delete their proposals, so block the delete instead.
        // (Same choice as Estimate/Order.)
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Proposals snapshot their source estimate: deleting an estimate
        // that has proposals must be blocked so history stays intact.
        builder.HasOne(p => p.Estimate)
            .WithMany()
            .HasForeignKey(p => p.EstimateId)
            .OnDelete(DeleteBehavior.Restrict);

        // The common queries are one user's proposals (newest first) and
        // lookups by source estimate.
        builder.HasIndex(p => p.UserId);
        builder.HasIndex(p => p.CreatedAt);
        builder.HasIndex(p => p.EstimateId);
    }
}
