using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Lead"/>.
/// </summary>
public class LeadConfiguration : IEntityTypeConfiguration<Lead>
{
    public void Configure(EntityTypeBuilder<Lead> builder)
    {
        builder.HasKey(l => l.Id);

        builder.Property(l => l.Name).IsRequired().HasMaxLength(100);
        builder.Property(l => l.Phone).IsRequired().HasMaxLength(20);
        builder.Property(l => l.Email).HasMaxLength(256);
        builder.Property(l => l.Message).IsRequired().HasMaxLength(2000);
        builder.Property(l => l.Source).HasMaxLength(100);
        builder.Property(l => l.CreatedAt).IsRequired();

        // Enum stored as int in SQL Server (EF Core default for enums).
        builder.Property(l => l.Status).IsRequired();

        // Optional reference to the product of interest. Deleting a product
        // must never cascade-delete leads, so null the reference instead.
        builder.HasOne<Product>()
            .WithMany()
            .HasForeignKey(l => l.InterestedProductId)
            .OnDelete(DeleteBehavior.SetNull);

        // Optional reference to the submitting user. Deleting a user must
        // never delete their leads, so null the reference instead.
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(l => l.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        // Newest-first staff listing.
        builder.HasIndex(l => l.CreatedAt);
        // Staff triage by status.
        builder.HasIndex(l => l.Status);
        // Staff lookup and duplicate spotting by phone. Not unique:
        // repeat submissions must never be rejected.
        builder.HasIndex(l => l.Phone);
    }
}
