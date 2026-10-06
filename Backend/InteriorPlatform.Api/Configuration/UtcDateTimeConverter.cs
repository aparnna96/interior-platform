using System.Text.Json;
using System.Text.Json.Serialization;

namespace InteriorPlatform.Api.Configuration;

/// <summary>
/// Writes every <see cref="DateTime"/> as an unambiguous UTC instant (with a
/// trailing "Z").
///
/// Every timestamp this API stores is created with <c>DateTime.UtcNow</c>, but
/// SQL Server <c>datetime2</c> columns carry no time-zone information, so EF
/// Core returns the values with <see cref="DateTimeKind.Unspecified"/>, which
/// System.Text.Json serialises WITHOUT a "Z". Browsers then read those strings
/// as local time, so the same instant showed up hours apart depending on
/// whether it came from a fresh response (Kind = Utc) or from a list read back
/// from the database.
///
/// Values are therefore treated as UTC when their kind is Unspecified. That is
/// safe here because nothing in the application ever stores local time.
/// </summary>
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => Normalize(reader.GetDateTime());

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        => writer.WriteStringValue(Normalize(value));

    private static DateTime Normalize(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}

/// <summary>Startup wiring for API JSON output. Holds no business logic.</summary>
public static class ApiJsonSetup
{
    /// <summary>
    /// Registers <see cref="UtcDateTimeConverter"/> for controller responses.
    /// System.Text.Json applies a <c>JsonConverter&lt;DateTime&gt;</c> to
    /// <c>DateTime?</c> properties as well.
    /// </summary>
    public static IMvcBuilder AddUtcDateTimes(this IMvcBuilder builder)
    {
        return builder.AddJsonOptions(options =>
            options.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter()));
    }
}
