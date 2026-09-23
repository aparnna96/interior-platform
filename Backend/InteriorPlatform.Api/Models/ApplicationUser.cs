using Microsoft.AspNetCore.Identity;

namespace InteriorPlatform.Api.Models;

/// <summary>
/// Application user entity. Extends the built-in IdentityUser with
/// application-specific properties (to be added as the domain evolves).
/// </summary>
public class ApplicationUser : IdentityUser
{
}
