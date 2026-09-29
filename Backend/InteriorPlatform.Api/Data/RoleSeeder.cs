using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace InteriorPlatform.Api.Data;

/// <summary>
/// Seeds the three application roles (Customer, FieldStaff, Admin).
/// Idempotent: existing roles are never recreated.
/// </summary>
public static class RoleSeeder
{
    public static readonly string[] Roles = ["Customer", "FieldStaff", "Admin"];

    public static async Task SeedAsync(IServiceProvider services)
    {
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in Roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                var result = await roleManager.CreateAsync(new IdentityRole(role));
                if (!result.Succeeded)
                {
                    var errors = string.Join("; ", result.Errors.Select(e => e.Description));
                    throw new InvalidOperationException($"Failed to seed role '{role}': {errors}");
                }
            }
        }
    }
}
