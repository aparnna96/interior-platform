using System.Text.Json;
using InteriorPlatform.Api.Configuration;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Timestamps come back from SQL Server with Kind = Unspecified. Without a
/// converter they serialise with no "Z", and browsers read them as local time
/// (seen as the same order showing two different times in the UI).
/// </summary>
public sealed class UtcDateTimeJsonTests
{
    private sealed record Sample(DateTime At, DateTime? MaybeAt);

    private static JsonSerializerOptions ControllerJsonOptions()
    {
        var services = new ServiceCollection();
        services.AddControllers().AddUtcDateTimes();
        using var provider = services.BuildServiceProvider();
        // Copy so the result stays usable after the provider is disposed.
        return new JsonSerializerOptions(
            provider.GetRequiredService<IOptions<Microsoft.AspNetCore.Mvc.JsonOptions>>().Value.JsonSerializerOptions);
    }

    private static string AtOf(string json) =>
        JsonDocument.Parse(json).RootElement.GetProperty("at").GetString()!;

    [Fact]
    public void Unspecified_kind_values_from_the_database_are_written_as_utc()
    {
        var fromDatabase = new DateTime(2026, 10, 6, 6, 36, 14, DateTimeKind.Unspecified);

        var json = JsonSerializer.Serialize(new Sample(fromDatabase, null), ControllerJsonOptions());

        Assert.EndsWith("Z", AtOf(json));
        Assert.StartsWith("2026-10-06T06:36:14", AtOf(json));
    }

    [Fact]
    public void Utc_kind_values_are_unchanged_and_still_carry_the_z()
    {
        var fresh = new DateTime(2026, 10, 6, 6, 36, 14, DateTimeKind.Utc);

        var json = JsonSerializer.Serialize(new Sample(fresh, null), ControllerJsonOptions());

        Assert.Equal("2026-10-06T06:36:14Z", AtOf(json));
    }

    [Fact]
    public void Fresh_and_read_back_values_for_the_same_instant_serialise_identically()
    {
        var utc = new DateTime(2026, 10, 6, 6, 36, 14, 748, DateTimeKind.Utc);
        var readBack = DateTime.SpecifyKind(utc, DateTimeKind.Unspecified);
        var options = ControllerJsonOptions();

        Assert.Equal(
            AtOf(JsonSerializer.Serialize(new Sample(utc, null), options)),
            AtOf(JsonSerializer.Serialize(new Sample(readBack, null), options)));
    }

    [Fact]
    public void Local_kind_values_are_converted_to_utc()
    {
        var local = new DateTime(2026, 10, 6, 12, 6, 14, DateTimeKind.Local);

        var json = JsonSerializer.Serialize(new Sample(local, null), ControllerJsonOptions());

        Assert.Equal(local.ToUniversalTime(), JsonDocument.Parse(json).RootElement.GetProperty("at").GetDateTime().ToUniversalTime());
        Assert.EndsWith("Z", AtOf(json));
    }

    [Fact]
    public void Nullable_values_are_covered_and_null_stays_null()
    {
        var options = ControllerJsonOptions();
        var withValue = JsonSerializer.Serialize(
            new Sample(DateTime.UtcNow, new DateTime(2026, 10, 6, 7, 0, 0, DateTimeKind.Unspecified)), options);
        var withNull = JsonSerializer.Serialize(new Sample(DateTime.UtcNow, null), options);

        Assert.EndsWith("Z", JsonDocument.Parse(withValue).RootElement.GetProperty("maybeAt").GetString());
        Assert.Equal(JsonValueKind.Null, JsonDocument.Parse(withNull).RootElement.GetProperty("maybeAt").ValueKind);
    }

    [Fact]
    public void Reading_a_utc_string_yields_a_utc_value()
    {
        var parsed = JsonSerializer.Deserialize<Sample>(
            "{\"at\":\"2026-10-06T06:36:14Z\",\"maybeAt\":null}", ControllerJsonOptions());

        Assert.NotNull(parsed);
        Assert.Equal(DateTimeKind.Utc, parsed!.At.Kind);
        Assert.Equal(new DateTime(2026, 10, 6, 6, 36, 14, DateTimeKind.Utc), parsed.At);
    }
}
