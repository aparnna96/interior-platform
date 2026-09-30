using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using System.Text.Json;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Product"/>.
/// </summary>
public class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasMaxLength(100);

        builder.Property(p => p.Name).IsRequired().HasMaxLength(200);
        builder.Property(p => p.Category).IsRequired().HasMaxLength(32);
        builder.Property(p => p.Room).IsRequired().HasMaxLength(32);
        builder.Property(p => p.Price).IsRequired();
        builder.Property(p => p.Material).IsRequired().HasMaxLength(200);
        builder.Property(p => p.Finish).IsRequired().HasMaxLength(200);
        builder.Property(p => p.Blurb).IsRequired().HasMaxLength(500);
        builder.Property(p => p.Description).IsRequired().HasMaxLength(2000);
        builder.Property(p => p.Dimensions).IsRequired().HasMaxLength(100);
        builder.Property(p => p.ImageUrl).IsRequired().HasMaxLength(2000);

        // Details preserves the frontend string-array concept as a JSON
        // document in a single nvarchar(max) column. A separate table would
        // be overkill for an opaque bullet list that is always read and
        // written whole; JSON keeps the read-only API a single-table query
        // with no joins and no new packages (System.Text.Json is built in).
        var serializerOptions = new JsonSerializerOptions();
        builder.Property(p => p.Details)
            .HasConversion(
                v => JsonSerializer.Serialize(v, serializerOptions),
                v => string.IsNullOrWhiteSpace(v)
                    ? new List<string>()
                    : JsonSerializer.Deserialize<List<string>>(v, serializerOptions) ?? new List<string>())
            .Metadata.SetValueComparer(
                new ValueComparer<List<string>>(
                    (a, b) => (a ?? new List<string>()).SequenceEqual(b ?? new List<string>()),
                    v => v.Aggregate(0, (h, s) => HashCode.Combine(h, s == null ? 0 : s.GetHashCode())),
                    v => v.ToList()));
    }
}
