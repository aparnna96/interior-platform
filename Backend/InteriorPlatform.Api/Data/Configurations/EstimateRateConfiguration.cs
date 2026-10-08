using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="EstimateRate"/>.
/// </summary>
public class EstimateRateConfiguration : IEntityTypeConfiguration<EstimateRate>
{
    public void Configure(EntityTypeBuilder<EstimateRate> builder)
    {
        builder.HasKey(r => r.Id);

        // Money precision, matching the estimate/order/proposal tables.
        builder.Property(r => r.RatePerSquareFoot).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(r => r.IsActive).IsRequired();
        builder.Property(r => r.CreatedAt).IsRequired();

        // Matches AspNetUsers.Id (nvarchar(450)). Null for the seeded rate.
        builder.Property(r => r.CreatedByUserId).HasMaxLength(450);

        // Database-level backstop for the "rate is positive" rule.
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_EstimateRates_Rate_Positive",
            "[RatePerSquareFoot] > 0"));

        // Rate history is an audit trail: deleting an Admin user must never
        // silently delete it, so block the delete instead.
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(r => r.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Exactly one active rate. The application also enforces this (it
        // deactivates the old row first); this filtered unique index is the
        // database-level backstop that turns a race between two Admins into
        // a failed insert instead of two active rates.
        builder.HasIndex(r => r.IsActive).IsUnique().HasFilter("[IsActive] = 1");

        // History is listed newest first.
        builder.HasIndex(r => r.CreatedAt);
    }
}
