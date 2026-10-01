using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Minimal endpoints for verifying JWT authentication and role-based
/// authorization. No business logic; each action only proves the
/// corresponding [Authorize] policy was satisfied.
/// Development only: <see cref="HideVerifyControllerOutsideDevelopmentConvention"/>
/// (registered in Program.cs) removes these actions from routing outside
/// Development, so the diagnostics are unavailable in Production.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class VerifyController : ControllerBase
{
    [HttpGet("any")]
    [Authorize]
    public IActionResult Any() => Ok(new { Ok = true, Policy = "any" });

    [HttpGet("customer")]
    [Authorize(Roles = "Customer")]
    public IActionResult Customer() => Ok(new { Ok = true, Policy = "Customer" });

    [HttpGet("fieldstaff")]
    [Authorize(Roles = "FieldStaff")]
    public IActionResult FieldStaff() => Ok(new { Ok = true, Policy = "FieldStaff" });

    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public IActionResult Admin() => Ok(new { Ok = true, Policy = "Admin" });
}

/// <summary>
/// Removes <see cref="VerifyController"/> actions from endpoint routing when
/// registered (Program.cs registers it outside Development). With no actions
/// left, the router yields 404 for every /api/verify/* request in Production.
/// </summary>
public sealed class HideVerifyControllerOutsideDevelopmentConvention : IControllerModelConvention
{
    public void Apply(ControllerModel controller)
    {
        if (controller.ControllerType == typeof(VerifyController))
        {
            controller.Actions.Clear();
        }
    }
}
