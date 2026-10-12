# InteriorPlatform

Interior design and furniture platform for the client "Confident Group". Used as a client demo, so the owner is short on time: keep work focused and reports short.

## Stack and layout

- `Frontend/interior-platform`: Angular 19 (standalone components, signals), Karma + Jasmine tests.
- `Backend/InteriorPlatform.Api`: .NET 10 Web API, EF Core (SQL Server), ASP.NET Identity + JWT, QuestPDF.
- `Backend/InteriorPlatform.Api.Tests`: backend tests.
- `docs/`: `demo-guide.md`, `production-deployment-runbook.md`, `payments-test-mode.md`.
- `.claude/skills/`: design skills (`impeccable`, `design-taste-frontend`), read by both Claude Code and opencode. `CLAUDE.md` imports this file.
- No Playwright or browser-automation setup. Do not add one; the machine is low on memory.

## Environment

- Windows, PowerShell 5.1. Use `;` and `if ($?)`, not `&&`. Avoid reserved variable names (`$pid`, `$args`). Use single-quoted here-strings.
- Machine has about 3.9 GB RAM and is usually low on free memory. Do not run extra processes, browsers or large builds without need.
- Temp files go in `C:\Users\user\AppData\Local\Temp\opencode`. Delete them after use.
- Preserve each file's existing line endings and BOM. Check the BOM at byte level.
- Only stop processes you started yourself.

## Running locally

- API: `dotnet run --launch-profile http` in `Backend/InteriorPlatform.Api` -> `http://localhost:5175`. First build is slow; wait for it before declaring failure.
- Frontend: `npm start` (`ng serve`) in `Frontend/interior-platform` -> `http://localhost:4200`. First bundle takes about 25 s.
- Start one at a time on this machine. Check readiness with `GET /health` on the API and `/` on the frontend.
- The local API uses `Server=.\SQLEXPRESS; Database=InteriorPlatformDb`. On startup it applies pending EF migrations and runs the role, product and estimate-rate seeders, so starting it writes to that database.
- The frontend picks its API from `src/environments/environment.ts` (dev: `http://localhost:5175`) or `environment.prod.ts` (Railway).

## Testing

- Keep verification light. No full-suite runs unless asked.
- Frontend: run only the specs touching the change, for example `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/<path>/**/*.spec.ts`. `npx ng build` is the compile check when a build is needed.
- Backend: `dotnet build`, or `dotnet test` on a targeted filter.
- Some drawer specs in the Admin layout skip themselves when the test browser is 960px wide or more.
- On this machine ChromeHeadless can take over a minute to start, and Karma then drops it ("no message in 30000 ms") before any spec runs. Use a temporary Karma config with a longer `browserNoActivityTimeout` (kept outside the repo) rather than changing the project. `--include` keeps only the last pattern, so run each spec group separately.
- Say what was and was not verified. Label forged-token or stubbed-API browser checks as simulated.

## Git and deployment

- Remote: `https://github.com/aparnna96/interior-platform.git`. Default branch `main`.
- Pushing `main` deploys the frontend to Vercel (project `xerox8/interior-platform`, `https://interior-platform-sigma.vercel.app`) and the API to Railway (`https://interior-platform-production.up.railway.app`). Treat any push to `main` as a production deploy.
- Production CORS allows only `https://interior-platform-sigma.vercel.app`, so Vercel preview URLs cannot call the production API.
- Commit or push only when asked. Stage explicit paths. One commit per request.
- Never force-push. Merge to `main` only with explicit approval.
- `stash@{0}` (wip: admin dashboard stage 3) is redundant but belongs to the owner. Do not drop it.
- Commit messages use conventional style, e.g. `feat(admin): ...`, `docs(admin): ...`.

## Standing rules

- Do not modify the database, install packages, add endpoints, or change CORS or production config without asking.
- Keep secrets, tokens and passwords out of chat and out of files.
- Do not roll back a deploy without asking first.
- No real Admin credentials are available to the agent. Do not guess them. For real-login checks, ask the owner to sign in manually.
- Reports: concise and honest. Do not claim end-to-end verification that was not done.

## Frontend architecture

- `AppComponent` holds one `activeView` signal; the Router keeps the URL in sync both ways. `src/app/app-paths.ts` is the single source of truth for views, paths, titles and access levels (`public`, `guest`, `auth`, `staff`, `fieldstaff`, `admin`, `adminlogin`). Admin views are prefixed `admin-` (`admin-dashboard`, `admin-products`, `admin-orders`, `admin-proposals`, `admin-rates`, `admin-leads`, `admin-login`). Add new pages there first.
- Guards live in `src/app/auth/auth.guards.ts`. They are display logic only; the API enforces permissions with `[Authorize]`.
- Roles are read from the JWT stored in `localStorage` key `ip.auth.token`. Role claim: `http://schemas.microsoft.com/ws/2008/06/identity/claims/role`.
- After login: `returnUrl` (validated by `safeReturnUrl`) if present, else `landingPathFor(roles)`: Admin `/admin`, FieldStaff `/leads`, others `/`.
- `/login` is intentionally a customer-layout page. The Admin shell appears only for an authenticated Admin on an Admin view.
- Admin login: `/admin/login` (`src/app/admin-login/`, view `admin-login`, access `adminlogin`). `adminGuard` sends visitors and non-Admin roles there, never to `/login`, with a `returnUrl` limited to the Admin area (`safeAdminReturnUrl`). `adminLoginGuard` forwards a signed-in Admin to that `returnUrl` or `/admin`; customers and visitors still see the page. `safeReturnUrl` rejects `/admin/login`.
- Admin area: `ADMIN_AREA_VIEWS` (in `app-paths.ts`) is every `/admin` view including login. It never shows the customer navigation.
- Admin shell: `src/app/admin-layout/`. Active when `auth.isAdmin() && isAdminShellView(activeView)`. `ADMIN_SHELL_VIEWS` is `ADMIN_AREA_VIEWS` minus `admin-login`: `admin-dashboard`, `admin-products`, `admin-orders`, `admin-proposals`, `admin-rates`, `admin-leads`.
- Admin record pages: orders, proposals and leads open at `/admin/orders/:id`, `/admin/proposals/:id` and `/admin/leads/:id` (`ADMIN_RECORD_VIEWS`, `recordId` in `viewForPath`/`pathForView`). The view stays the list view; `AppComponent.routeRecordId` is passed to the page as `recordId` and the page reports opening or closing a record through `recordChange`. A page that is not in the shell (the FieldStaff Leads page) simply ignores both.
- Admin kit: `src/app/shared/admin/` holds `TableState` (client-side search, sort, filter, paging), `th[admSort]`, `app-admin-pager`, `app-badge` with status tones, `app-admin-state` (loading, empty, error, login, denied) and `AdminAttentionService` (sidebar counts, reported by the pages; it makes no requests). `charts/` has hand-built SVG line, bar and donut charts; there is no chart library. Shared `adm-*` classes live in `src/styles.css`, so page stylesheets stay small.
- FieldStaff keep the workspace layout on `/leads` and `/field`. `staffGuard` sends an Admin without the FieldStaff role from `/leads` to `/admin/leads`; `/field` is FieldStaff only.
- Feature folders in `src/app/`: `admin-dashboard`, `admin-layout`, `admin-login`, `admin-orders`, `admin-products`, `admin-proposals`, `admin-rates`, `auth`, `catalogue`, `elevation`, `estimate`, `finishes`, `floor-plan`, `home`, `leads`, `orders`, `proposal`, `register`, `room-visualizer`, `shared`, `whatsapp`.

## Backend

- Controllers: Auth, Products, Cart, Orders, Estimates, EstimateRate, Proposals, Payments, Leads, Verify, AdminOrders, AdminProposals, AdminEstimateRates.
- Roles: Customer, FieldStaff, Admin. Registration only creates Customers.
- Admin accounts are created by SQL insert into `AspNetUserRoles` (runbook section 9.1). That is a database write and needs the owner's go-ahead.
- Estimate rate comes from the Rate Master; `Estimates:DemoRatePerSquareFoot` only seeds the first rate.
- Migrations are in `Backend/InteriorPlatform.Api/Migrations/` and run automatically on startup.

## Features in place

- Customer: Home, Interiors, Furniture catalogue and product pages, Cart, Orders, Account, Register and Login, Estimates, Projects, Proposals, payments (demo mode), checkout delivery details, room visualizer (floor plan, elevation, finishes).
- Field Staff: Leads, Field visualizer.
- Admin: separate login page, workspace shell (breadcrumb, user menu, page jump search, sidebar badges), dashboard (six summary cards, needs-attention list, five SVG charts, recent activity, refresh), and sortable, searchable, paged tables for Products (with a drawer form and image preview), Orders, Proposals, Leads and the Estimate Rate history. Order value on the dashboard is the sum of non-cancelled order subtotals, not money received.
- WhatsApp action exists but is off: no business number is configured in the environment files.

## Known gaps

- No real Admin login has been tested against production data.
- `PaymentsController.VerifyPayment` has no already-verified guard. Payments have no rate limiting. Production payment mode (Demo or Razorpay) is unconfirmed.
- Admins on workspace pages (Visualizer, Estimates, Projects) have no direct Admin link.
- Account page buttons still use old labels (Products, Manage orders, Manage proposals).
- Admin logo spec hard-codes the 52/108/-23 crop values.
- Existing build warnings (NG0913 logo, bundle budgets) are known. The API build also warns about `Microsoft.OpenApi` 2.0.0 (NU1903).

## Future

Skills and further opencode configuration will be added later from the opencode docs (`https://opencode.ai/docs`).
