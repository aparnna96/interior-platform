using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="CartItem"/>.
/// </summary>
public class CartItemConfiguration : IEntityTypeConfiguration<CartItem>
{
    public void Configure(EntityTypeBuilder<CartItem> builder)
    {
        builder.HasKey(i => i.Id);

        // Matches Products.Id slug (see ProductConfiguration).
        builder.Property(i => i.ProductId).IsRequired().HasMaxLength(100);
        builder.Property(i => i.Quantity).IsRequired();

        // Database-level backstop for the 1-99 quantity rule. Request
        // validation rejects bad values first; this guards direct writes.
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_CartItems_Quantity_Range",
            "[Quantity] >= 1 AND [Quantity] <= 99"));

        // Items belong to their cart: deleting the cart removes them.
        builder.HasOne(i => i.Cart)
            .WithMany(c => c.Items)
            .HasForeignKey(i => i.CartId)
            .OnDelete(DeleteBehavior.Cascade);

        // Products are never cascade-deleted by cart data. Physical product
        // deletion is already unsupported (soft-delete via IsActive);
        // Restrict additionally blocks deleting a referenced product row.
        builder.HasOne(i => i.Product)
            .WithMany()
            .HasForeignKey(i => i.ProductId)
            .OnDelete(DeleteBehavior.Restrict);

        // A product appears at most once per cart; re-adding merges quantity.
        builder.HasIndex(i => new { i.CartId, i.ProductId }).IsUnique();

        // Cart-scoped item lookups.
        builder.HasIndex(i => i.CartId);
    }
}
