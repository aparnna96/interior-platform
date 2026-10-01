using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Order"/>.
/// </summary>
public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.HasKey(o => o.Id);

        // Matches AspNetUsers.Id (nvarchar(450)).
        builder.Property(o => o.UserId).IsRequired().HasMaxLength(450);
        builder.Property(o => o.CreatedAt).IsRequired();
        builder.Property(o => o.UpdatedAt).IsRequired();

        // Enum stored as int in SQL Server (EF Core default for enums).
        builder.Property(o => o.Status).IsRequired();

        // Sensible money precision.
        builder.Property(o => o.Subtotal).HasColumnType("decimal(18,2)").IsRequired();

        // Orders are financial history: deleting a user must never silently
        // delete their orders, so block the delete instead (Restrict).
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(o => o.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Owner's order history, newest first.
        builder.HasIndex(o => o.UserId);
        builder.HasIndex(o => o.CreatedAt);
    }
}
