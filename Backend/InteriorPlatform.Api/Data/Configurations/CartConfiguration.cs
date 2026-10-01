using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Cart"/>.
/// </summary>
public class CartConfiguration : IEntityTypeConfiguration<Cart>
{
    public void Configure(EntityTypeBuilder<Cart> builder)
    {
        builder.HasKey(c => c.Id);

        // Matches AspNetUsers.Id (nvarchar(450)).
        builder.Property(c => c.UserId).IsRequired().HasMaxLength(450);
        builder.Property(c => c.CreatedAt).IsRequired();
        builder.Property(c => c.UpdatedAt).IsRequired();

        // One cart per user.
        builder.HasIndex(c => c.UserId).IsUnique();

        // A cart is private per-user state: deleting the user removes it.
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(c => c.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
