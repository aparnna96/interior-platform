using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InteriorPlatform.Api.Data;

/// <summary>
/// Seeds the catalogue products. The Angular catalogue
/// (<c>src/app/catalogue/catalogue-products.ts</c>) is the source of truth:
/// every value below is copied exactly (ids, names, prices, image URLs,
/// details, categories, rooms). No swatch column exists by design.
/// Idempotent: products whose Id already exists are left untouched, so the
/// seed is safe to run on every startup.
/// </summary>
public static class ProductSeeder
{
    private static Product P(
        string id,
        string name,
        string category,
        string room,
        int price,
        string material,
        string finish,
        string blurb,
        string description,
        string dimensions,
        string imageUrl,
        params string[] details) => new()
        {
            Id = id,
            Name = name,
            Category = category,
            Room = room,
            Price = price,
            Material = material,
            Finish = finish,
            Blurb = blurb,
            Description = description,
            Dimensions = dimensions,
            ImageUrl = imageUrl,
            Details = details.ToList(),
            IsActive = true,
        };

    private static string Px(int id) =>
        $"https://images.pexels.com/photos/{id}/pexels-photo-{id}.jpeg?auto=compress&cs=tinysrgb&w=900";

    public static readonly IReadOnlyList<Product> SeedProducts =
    [
        P("aria-3s-sofa", "Aria 3-Seater Fabric Sofa", "Sofas", "Living Room", 42999,
            "Performance Bouclé", "Bouclé · Warm Beige",
            "Deep-seat bouclé sofa on solid wood legs for everyday lounging.",
            "A generous three-seater wrapped in looped wool-blend bouclé. Deep feather-top cushions and tapered solid-wood legs keep it relaxed yet tailored.",
            "220 × 92 × 82 cm", Px(13086783),
            "Bouclé cream upholstery", "7.0 × 3.0 ft · solid wood frame", "Removable, washable covers"),
        P("sona-loveseat", "Sona 2-Seater Loveseat", "Sofas", "Living Room", 28499,
            "Woven Cotton Blend", "Weave · Terracotta",
            "Compact terracotta-weave loveseat sized for apartments.",
            "A compact two-seater in a warm terracotta weave, proportioned for apartments and reading corners without giving up lounge depth.",
            "152 × 86 × 84 cm", Px(1571471),
            "Terracotta woven fabric", "5.0 × 2.8 ft · kiln-dried frame", "High-resilience foam cushions"),
        P("haven-queen-bed", "Haven Queen Storage Bed", "Beds", "Bedroom", 38999,
            "Oak Veneer · Engineered Wood", "Oak · Natural Finish",
            "Queen bed with box storage in a natural oak finish.",
            "A calm queen bed in natural oak with full hydraulic box storage and a softly padded headboard in washed beige cotton.",
            "198 × 160 × 110 cm", Px(271624),
            "Oak veneer · natural finish", "6.5 × 5.0 ft · hydraulic box storage", "Beige cushioned headboard"),
        P("nimbus-king-bed", "Nimbus King Platform Bed", "Beds", "Bedroom", 46999,
            "Solid Wood · Upholstered Headboard", "Oak · Oat Milk",
            "Low-profile king platform bed in oat milk and oak tones.",
            "A low-profile king platform in oat-milk lacquer and solid oak. Silent slatted base means no box spring and no creaks.",
            "208 × 190 × 105 cm", Px(90319),
            "Oat milk + natural oak finish", "6.5 × 6.0 ft · no box spring needed", "Silent slat support system"),
        P("terra-coffee-table", "Terra Solid Wood Coffee Table", "Tables", "Living Room", 12999,
            "Solid Mango Wood", "Solid Wood · Honey",
            "Honey-finish centre table with a lower display shelf.",
            "A solid mango-wood centre table in a warm honey stain, with an open lower shelf for books and a matte, scratch-resistant top.",
            "110 × 60 × 40 cm", Px(7607461),
            "Solid honey-finish wood", "4.0 × 2.5 ft · 16 in height", "Scratch-resistant matte top"),
        P("kraft-study-table", "Kraft Foldable Study Table", "Tables", "Workspace", 9999,
            "Engineered Wood · Oak Finish", "Oak · Natural",
            "Space-saving foldable desk for compact home offices.",
            "A foldable study desk in natural oak that mounts to the wall and folds flat. Full-size work surface rated to 40 kg for daily use.",
            "120 × 60 × 75 cm", Px(373904),
            "Natural oak finish", "4.0 × 2.0 ft · wall-mount foldable", "Load rated up to 40 kg"),
        P("milo-dining-chair", "Milo Dining Chair — Set of 2", "Chairs", "Dining", 14499,
            "Cotton Velvet · Solid Wood", "Velvet · Slate",
            "Pair of slate-velvet dining chairs with tapered wood legs.",
            "A pair of dining chairs in slate cotton-velvet with tapered solid-wood legs. Wipe-clean pile and floor glides included.",
            "48 × 52 × 82 cm (each)", Px(8113029),
            "Slate velvet upholstery · set of 2", "Dining height · tapered wood legs", "Wipe-clean velvet, floor glides"),
        P("oslo-wardrobe", "Oslo 6-Door Wardrobe", "Wardrobes", "Bedroom", 54999,
            "Engineered Wood · Mirror Glass", "Ash · Light, Mirror Shutters",
            "Light-ash wardrobe with mirrored shutters and loft box.",
            "A six-door wardrobe in light ash with full-length mirror shutters, soft-close hinges, and a split locker–drawer–loft interior.",
            "240 × 60 × 210 cm", Px(7061419),
            "Light ash finish + mirror", "6.0 × 2.0 ft · soft-close hinges", "Locker, drawers + loft storage"),
        P("aero-kitchen-island", "Aero Kitchen Island with Storage", "Tables", "Kitchen", 36999,
            "Engineered Wood · Quartz Top", "Matte White · Quartz",
            "Freestanding island with a quartz top and soft-close drawers.",
            "A freestanding kitchen island in matte white with a stain-resistant quartz top, two soft-close drawers and an overhang sized for counter stools.",
            "180 × 90 × 91 cm", Px(2089698),
            "Matte white finish · quartz top", "6.0 × 3.0 ft · 36 in counter height", "Two soft-close drawers"),
        P("walnut-breakfast-counter", "Walnut Breakfast Counter", "Tables", "Kitchen", 21999,
            "Solid Walnut", "Walnut · Oiled",
            "Counter-height walnut table for quick breakfasts and prep.",
            "A counter-height breakfast table in oiled solid walnut. A slim footprint tucks against a wall or divides an open-plan kitchen.",
            "140 × 60 × 92 cm", Px(2001944),
            "Oiled solid walnut", "4.6 × 2.0 ft · counter height", "Food-safe oil finish"),
        P("cove-counter-stool", "Cove Leather Counter Stool — Set of 2", "Chairs", "Kitchen", 15999,
            "Faux Leather · Steel", "Leather · Charcoal",
            "Pair of padded charcoal counter stools with a steel footrest.",
            "Two padded counter stools in charcoal faux leather on a powder-coated steel frame, with a footrest and floor glides.",
            "42 × 45 × 65 cm (each)", Px(1080721),
            "Charcoal faux leather · set of 2", "Counter height · steel frame", "Wipe-clean seat, floor glides"),
        P("hearth-bar-stool", "Hearth Wooden Bar Stool — Set of 2", "Chairs", "Kitchen", 13499,
            "Solid Wood · Cushioned Seat", "Wood · Espresso",
            "Pair of espresso bar stools with a cushioned seat and backrest.",
            "A pair of tall bar stools in espresso-stained solid wood with a cushioned seat, a low backrest and a turned footrest.",
            "40 × 44 × 100 cm (each)", Px(534151),
            "Espresso-stained solid wood · set of 2", "Bar height · cushioned seat", "Turned footrest"),
    ];

    public static async Task SeedAsync(IServiceProvider services)
    {
        var db = services.GetRequiredService<ApplicationDbContext>();
        var ids = SeedProducts.Select(p => p.Id).ToList();
        var existing = await db.Products
            .Where(p => ids.Contains(p.Id))
            .Select(p => p.Id)
            .ToListAsync();
        var missing = SeedProducts.Where(p => !existing.Contains(p.Id)).ToList();
        if (missing.Count == 0)
        {
            return;
        }

        db.Products.AddRange(missing);
        await db.SaveChangesAsync();
    }
}
