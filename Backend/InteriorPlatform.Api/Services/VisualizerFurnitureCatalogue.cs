namespace InteriorPlatform.Api.Services;

/// <summary>
/// The furniture types the 2D visualizer can place, with their display names
/// and footprints in feet. The server is the source of truth: an estimate
/// request carries only a type key and a quantity, so the client can choose
/// neither names nor dimensions. Keep in sync with the visualizer's
/// <c>furnitureDefs</c> in the Angular app.
/// </summary>
public static class VisualizerFurnitureCatalogue
{
    public sealed record Entry(string Type, string Name, decimal WidthFt, decimal LengthFt);

    private static readonly Dictionary<string, Entry> Entries =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["bed"] = new("bed", "Bed", 6.5m, 5m),
            ["wardrobe"] = new("wardrobe", "Wardrobe", 6m, 2m),
            ["sofa"] = new("sofa", "Sofa", 7m, 3m),
            ["table"] = new("table", "Table", 4m, 2.5m),
            ["chair"] = new("chair", "Chair", 2.5m, 2.5m),
        };

    /// <summary>Looks up a type key (case-insensitive). False when unknown.</summary>
    public static bool TryGet(string? type, out Entry entry)
    {
        if (type is not null && Entries.TryGetValue(type.Trim(), out var found))
        {
            entry = found;
            return true;
        }

        entry = null!;
        return false;
    }
}
