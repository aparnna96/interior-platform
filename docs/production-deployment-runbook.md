# Production deployment runbook (Vercel + Railway + AWS RDS SQL Server)

Status: planned sequence. Nothing in this document has been executed. No AWS
account, RDS instance or Railway project exists yet.

This file contains placeholders only (`<LIKE_THIS>`). Never paste a real
password, secret, key or connection string into this file, into Git, into the
Dockerfile, into a chat, or into a screenshot.

Legend: **[verified]** = confirmed in official AWS / Railway / Microsoft docs
while preparing this runbook. **[not verified]** = could not be confirmed;
check it in the console before relying on it.

## 1. Target architecture

| Part | Choice |
| --- | --- |
| Frontend | Angular on Vercel (`https://interior-platform-sigma.vercel.app` is the origin currently allowed by CORS in `appsettings.Production.json`) |
| API | ASP.NET Core, .NET 10, one Dockerfile-based Railway service built from the repository root, Railway region Asia Southeast (Singapore) |
| Database | Amazon RDS for SQL Server Express, Single-AZ, `db.t3.micro`, General Purpose SSD 20 GiB, region `ap-southeast-1` (Singapore). It is orderable there [verified: the instance is running]. The engine version actually deployed is SQL Server 2019 (15.0.x) |
| Link | Railway -> public RDS endpoint, TCP 1433, SQL authentication, TLS enforced by the server and validated by the client |

Railway private networking only connects services inside one Railway project
[verified], so it cannot reach RDS. All API-to-database traffic crosses the
public internet, encrypted with TLS.

## 2. Demo setup vs real-client hardening

Read this before touching anything. The demo setup is **not** ideal
production security.

| Topic | DEMO / INTERNSHIP SETUP | REAL CLIENT / PRODUCTION HARDENING |
| --- | --- | --- |
| Railway plan | Trial, then Hobby. Neither has a stable outbound IP [verified] | Pro plan with Static Outbound IPs: three IPv4 addresses per service, enabled per service and applied after a redeploy. They may be shared with other customers [verified] |
| RDS inbound rule | TCP 1433 open to `0.0.0.0/0` **temporarily**, because the source IP is unknown | TCP 1433 allowed only from the Railway static IPs (plus an admin IP if needed). No `0.0.0.0/0` |
| SQL password | Strong random password is **mandatory** (32+ characters) | Same, stored in a secret manager, with a rotation plan |
| TLS | `rds.force_ssl=1` on the server **mandatory**, `Encrypt=True;TrustServerCertificate=False` in the app | Same |
| Database login | Dedicated application login **mandatory**. The RDS master user is never used by the app | Same, plus runtime login without DDL rights once migrations move to a pre-deploy step |
| Backups | 7-day automated backups, deletion protection | Backup/restore drill, longer retention, documented RPO/RTO. Review Multi-AZ (Express support [not verified]) or a higher edition |
| Payments | Razorpay TEST keys only | Razorpay production account, live keys, webhooks, refund process, review of `docs/payments-test-mode.md` |
| PDF library | QuestPDF Community license comment in code says "non-commercial internship work" | Review QuestPDF licensing for the client's use before go-live |
| Monitoring | Railway logs, RDS console metrics | Alarms (CPU, storage, connections), log retention, uptime monitor on `/health`, cost alerts |
| Expiry | The AWS Free plan ends after at most 6 months or when credits run out. The account is then suspended, data is kept 90 days, then erased [verified] | Paid plan with a spend limit and alerts |

The open `0.0.0.0/0` rule means anyone on the internet can attempt a SQL login.
It is tolerable for throw-away demo data only because of the password, forced
TLS and the least-privilege login. Tighten it before any real client data.

## 3. What is already prepared in the repository

- `Dockerfile` (repository root): .NET 10 SDK build stage, ASP.NET 10 runtime
  stage, `linux-x64` publish, non-root runtime user, DejaVu font for the PDF
  rupee sign, listening port taken from `ASPNETCORE_URLS` at run time.
- RDS CA trust (Task 18D): the Dockerfile downloads AWS's official
  `ap-southeast-1` CA bundle, verifies its SHA-256 (`ADD --checksum`), splits
  it into its three root certificates and installs them with
  `update-ca-certificates`. This is what lets
  `Encrypt=True;TrustServerCertificate=False` succeed. If the database moves to
  another region, update the Dockerfile URL, hash and certificate count. The
  Docker image builds and runs on Railway from `main` [verified]: the checksum, CA split, font and publish steps all ran, `/health` returns 200, and the rupee sign renders in the generated proposal PDF.
- Production configuration in `appsettings.Production.json`: CORS origin,
  bootstrap estimate rate (it only seeds the first Rate Master row; Admins manage
  the rate in the app afterwards), token payment amount, empty Razorpay placeholders, and
  `REPLACE_WITH_*` placeholders for JWT issuer and audience.
- `/health`: anonymous, constant body, no database check.

## 4. Startup and migration behaviour (read before the first deploy)

Current application behaviour, deliberately **not changed** by this runbook:

- `Program.cs` calls `MigrateAsync()` on every start, then `RoleSeeder`
  (Customer, FieldStaff, Admin) and `ProductSeeder`.
- There is **no retry loop**. If the database is unreachable, the TLS
  handshake fails, or the login fails, the process exits with an exception and
  the service never serves `/health`.
- The API therefore expects the database to be up, reachable and correctly
  configured at the moment the container starts.

Consequences for this deployment:

- Create and verify the database **before** the first Railway deploy.
- Do not stop the RDS instance to save money without stopping the Railway
  service first. A stopped instance can take minutes to hours to start [verified]
  and restarts itself after 7 days [verified].
- Expect short outages during RDS maintenance reboots.
- A health-check timeout shorter than the first migration run can fail the first
  deploy. Give the first boot time [Railway timeout defaults not verified].
- Later tasks, not this one: a bounded startup retry, and running migrations as
  a Railway pre-deploy command (separate container, not retried, 1-3600 second
  timeout [verified]).

## 5. AWS steps (RDS)

### 5.1 Account and free-plan eligibility

1. The AWS Free plan is only for customers who have never had an AWS account
   [verified]. If you already have one, use a Paid plan and expect normal RDS
   charges.
2. Credits: up to $100 at sign-up plus up to $100 for activities. The Free plan
   lasts until credits run out or 6 months after account creation, whichever
   comes first [verified]. AWS pages disagree on credit validity (6 vs 12
   months), so plan for 6.
3. The RDS Free plan covers `db.t3.micro` and `db.t4g.micro` for SQL Server
   Express only [verified].
4. Do not create the account until you are ready to finish the deployment: the
   clock starts at account creation. Write the expiry date in your calendar.
5. A payment method is usually not required at sign-up, but AWS may ask for one
   [verified].
6. Protect the root user with MFA. Work day to day with a non-root identity.

### 5.2 Region and orderability check

1. Preferred region: Asia Pacific (Singapore), `ap-southeast-1`.
2. In the RDS console, start "Create database" and confirm that SQL Server
   Express, `db.t3.micro` is offered there (the deployed instance is SQL Server 2019; 2022 also works if offered). If not, pick the
   nearest region that offers it and remember that the Dockerfile CA URL, hash
   and count then change too. Optional CLI check:
   `aws rds describe-orderable-db-instance-options --engine sqlserver-ex --db-instance-class db.t3.micro --region <REGION>`.
3. Keep the API and the database in the same metro area. Cross-ocean round
   trips multiply across the several queries each request makes [estimate].

### 5.3 Parameter group (create this first)

`rds.force_ssl` is a static parameter, so a reboot is needed if you change it
after creation [verified]. Create and attach the group at creation time.

1. RDS -> Parameter groups -> Create. Family for SQL Server 2019 Express is
   `sqlserver-ex-15.0` (SQL Server 2022 would be `sqlserver-ex-16.0`; use the family the console offers for
   your engine version). The deployed instance still uses the default parameter group, so `rds.force_ssl` is **not** enforced yet: see section 15.
2. Set `rds.force_ssl` = `1`. Save.

### 5.4 Create the instance

| Setting | Value |
| --- | --- |
| Creation method | Standard create |
| Engine | Microsoft SQL Server |
| Edition | Express Edition |
| Version | SQL Server 2019 as deployed (2022 also works if offered), latest minor |
| Licence | License Included |
| Template | Free tier / Dev-Test if offered, otherwise the smallest |
| DB instance identifier | `<RDS_INSTANCE_ID>` |
| Master username | `<RDS_MASTER_USER>` (not an obvious name) |
| Master password | Generate `<RDS_MASTER_PASSWORD>` (see 7.1). Store it in a password manager only |
| Instance class | `db.t3.micro` |
| Storage | General Purpose SSD, 20 GiB (the RDS minimum [verified]). For the demo, consider turning storage autoscaling off to cap cost |
| Availability | Single-AZ (no standby) |
| VPC / subnet group | Default VPC with its default subnet group. Public subnets with an internet gateway are needed for public access [verified] |
| Public access | **Yes** (demo). Needs VPC DNS hostnames and DNS resolution enabled [verified] |
| Security group | A new dedicated group, see 5.5 |
| Port | 1433 |
| Parameter group | The group from 5.3 |
| Certificate authority | Keep the default `rds-ca-rsa2048-g1` [verified default]. The region's RSA2048 root is in the Dockerfile bundle |
| Automated backups | Enabled, retention **7 days** (console default is 7 [verified]) |
| Deletion protection | **On** |
| Optional features | Leave Performance Insights, enhanced monitoring and similar off unless needed (cost impact not verified) |

Notes:

- SQL Server instances are created without your application database. You
  create it afterwards (5.6) [verified].
- RDS does not give shell access, but normal SQL clients work [verified].
- The master user is `db_owner` on all user databases [verified]. That is why
  the application must not use it.

### 5.5 Security group

Create a group named `<RDS_SG_NAME>` with **one** inbound rule: TCP 1433.

- DEMO (temporary): source `0.0.0.0/0` so Railway Trial/Hobby can connect.
  Record this as technical debt. Add a calendar date to remove it.
- Your admin machine also needs access to run the SQL in section 6. The demo
  rule already covers it. In a hardened setup, add only `<YOUR_ADMIN_IP>/32`.
- PRODUCTION: replace with the three Railway static outbound IPs
  (`<RAILWAY_STATIC_IP_1..3>/32`), after enabling Static Outbound IPs on the
  service (Pro plan) and redeploying it [verified]. If you move the Railway
  service to another region, the IPs change [verified].
- Never open other ports. Leave outbound at the default.

### 5.6 After the instance is "Available"

1. Copy the endpoint (`<RDS_ENDPOINT>`, a DNS name). Always connect by DNS name,
   never by IP [verified].
2. Confirm the parameter group shows "in-sync" (no pending reboot) and
   `rds.force_ssl` is applied.
3. Connect with an admin tool (SSMS, Azure Data Studio or `sqlcmd`) using the
   master login. To validate TLS properly from Windows, import the AWS CA
   bundle (prefer the `.p7b` format for SSMS) [verified]. A one-off
   "trust server certificate" checkbox in an interactive admin tool is a
   tooling convenience only. It must never appear in the application's
   connection string.
4. Prove encryption is on for your session [verified query]:

```sql
SELECT ENCRYPT_OPTION FROM sys.dm_exec_connections WHERE session_id = @@SPID;
-- expect: TRUE
```

## 6. SQL setup (run manually as the master user, placeholders only)

The RDS master account is for database setup and administration. The
application never uses it.

Permissions reasoning: the current migration chain, scripted offline with
`dotnet ef migrations script` and inspected (no database involved), contains
only `CREATE TABLE` (18), foreign keys (21), `CREATE [UNIQUE] INDEX` (31) and
`__EFMigrationsHistory` inserts (8). There is no `ALTER`, `DROP`, dynamic SQL,
system-procedure call, login/user creation or `CREATE DATABASE`. So
`db_ddladmin` + `db_datareader` + `db_datawriter` on this one database should be
enough. That has **not** been proven against a live RDS instance [not verified].
The script does not show everything EF Core does at runtime (for example, its
own migration-lock and history-table existence checks), so treat the role list
as the expected minimum, not a guarantee.
If the first start fails with a permission error, the documented fallback is
`db_owner` on this single database only (never a server-level role).

```sql
-- 1. Connect to the master database as the RDS master user.
CREATE DATABASE [<DATABASE_NAME>];
GO

-- 2. Dedicated application login (server level). The password comes from your
--    password manager. Avoid the characters ; = ' " and leading/trailing
--    spaces, because the same password is embedded in a connection string.
CREATE LOGIN [<APP_LOGIN>]
    WITH PASSWORD = N'<APP_PASSWORD>',
         CHECK_POLICY = ON,
         CHECK_EXPIRATION = OFF,
         DEFAULT_DATABASE = [<DATABASE_NAME>];
GO

-- 3. Database user and least-privilege roles, in the application database only.
USE [<DATABASE_NAME>];
GO
CREATE USER [<APP_USER>] FOR LOGIN [<APP_LOGIN>] WITH DEFAULT_SCHEMA = dbo;
ALTER ROLE db_datareader ADD MEMBER [<APP_USER>];
ALTER ROLE db_datawriter ADD MEMBER [<APP_USER>];
ALTER ROLE db_ddladmin   ADD MEMBER [<APP_USER>];
GO

-- 4. Fallback ONLY if startup migrations fail with a permission error:
-- ALTER ROLE db_owner ADD MEMBER [<APP_USER>];
```

Then test the application login (not the master) from your admin tool against
`<DATABASE_NAME>` with `Encrypt=True` and the trust store configured. Make sure
it connects and can create and drop a scratch table (clean it up afterwards).

Later (hardening): once migrations run as a separate pre-deploy step, give the
runtime login only reader/writer and use a second, DDL-capable login for the
migration step.

## 7. Secrets, variables and the connection string

### 7.1 Generating values (never commit or share them)

- SQL passwords: 32+ random characters from letters, digits, `-`, `_`, `.`.
  SQL Server also requires complexity (upper, lower, digit).
- `Jwt__Secret`: 48+ random bytes, base64. For example, PowerShell 7:
  `[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))`,
  or `openssl rand -base64 48`. Use a different value from any dev secret.
- Changing `Jwt__Secret`, `Jwt__Issuer` or `Jwt__Audience` invalidates all
  issued tokens (users log in again).

### 7.2 Railway variables (names only; values are entered in the Railway UI)

| Variable | Value | Notes |
| --- | --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` | Required. Enables proxy headers, safe error handler, hides `/api/verify/*` |
| `ASPNETCORE_URLS` | `http://+:8080` | Use a fixed port. The `http://+:${PORT}` pattern did not work on this deployment [verified by the first deploy] |
| `PORT` | `8080` | Must match the port in `ASPNETCORE_URLS` |
| `ConnectionStrings__DefaultConnection` | see 7.3 | Startup fails if missing |
| `Jwt__Secret` | `<JWT_SECRET>` | Required |
| `Jwt__Issuer` | `<JWT_ISSUER>` | Required. Must not start with `REPLACE_WITH_` |
| `Jwt__Audience` | `<JWT_AUDIENCE>` | Required. Must not start with `REPLACE_WITH_` |
| `Razorpay__KeyId` | TEST key id | Name only here. Payments fail cleanly if empty |
| `Razorpay__KeySecret` | TEST key secret | Name only here |
| `Payments__Mode` | `Demo` (optional) | Default is `Razorpay`. `Demo` simulates the token payment with no gateway (see `docs/payments-test-mode.md`). Any other value stops the API at startup. Remove it before real use |
| `Cors__AllowedOrigins__0` | `<VERCEL_ORIGIN>` | Only needed if the final Vercel origin differs from the committed one. No wildcards, no trailing path |
| `DOTNET_gcServer` | `0` (optional) | The published app uses Server GC, which can use more memory on small containers [memory effect not verified] |

Already configured in `appsettings.Production.json`, so not needed as
variables: `Estimates:DemoRatePerSquareFoot` (bootstrap only: it seeds the first
estimate rate when the `EstimateRates` table is empty and is ignored afterwards),
`Payments:TokenAmount`, `Payments:Currency`. `Jwt__Issuer` and `Jwt__Audience` placeholders there are
rejected on purpose until you override them.

### 7.3 Connection string shape (placeholders only)

```text
Server=<RDS_ENDPOINT>,1433;Database=<DATABASE_NAME>;User Id=<APP_LOGIN>;Password=<APP_PASSWORD>;Encrypt=True;TrustServerCertificate=False;Connect Timeout=30;ConnectRetryCount=3;ConnectRetryInterval=10
```

- Stored only as the Railway variable `ConnectionStrings__DefaultConnection`.
  (If Railway offers sealed/secret variables, use them [not verified].)
- `Encrypt=True` is the same as `Mandatory` in Microsoft.Data.SqlClient, whose
  defaults are `Encrypt=Mandatory` and `TrustServerCertificate=false`
  [verified]. With these, SqlClient validates the certificate chain, validity
  and server name. The RDS certificate's common name is the instance endpoint
  [verified], and the `Server=` value must be that exact endpoint.
- Do not use `TrustServerCertificate=True`. Microsoft says not to deploy it as a
  production fix [verified]: it encrypts but does not authenticate the server.
- Do not add `Encrypt=Strict` (TDS 8.0): RDS support was not verified.
- `MultipleActiveResultSets` is not needed: the code has no streaming reads.
- The connect-retry settings only soften brief network blips. They are not a
  substitute for a startup retry.

### 7.4 Values that must never be committed

RDS master password, application SQL password, the full connection string,
`Jwt__Secret`, Razorpay keys, AWS access keys or console passwords, Railway
tokens, `.bak` backups, and any screenshot showing them.

## 8. Railway steps

1. Create a Railway project and add a service from the GitHub repository
   `aparnna96/interior-platform`. Railway detects a file named `Dockerfile` at
   the repository root [verified]. No Railway config file is needed. The service deploys from the `main` branch on every push; watch paths are not set, so a frontend-only push also rebuilds the API.
2. Service settings -> region: Asia Southeast (Singapore). Railway's four
   regions are US West, US East, Europe West and Asia Southeast; there is no
   India region [verified].
3. Enter the variables from 7.2 **before** the first build finishes, so the
   first start has a database.
4. Build note: the Dockerfile uses `ADD --checksum` with a URL. That needs
   BuildKit and the `docker/dockerfile:1` syntax [Railway builder support not
   verified]. The build will fail loudly, not silently, if it is unsupported or
   if AWS's bundle changes. It also depends on `truststore.pki.rds.amazonaws.com`
   being reachable at build time.
5. Networking -> Generate Domain. New services are private until you do
   [verified]. Note the URL `<RAILWAY_API_URL>`.
6. Health check: set the path to `/health` if the setting is available
   [not verified]. Leave enough time for the first migration run.
7. Plans: Trial gives a one-time $5 credit that expires in 30 days
   [verified]. Move to Hobby ($5/month, includes $5 of usage) before it ends
   [verified].
8. Watch the deploy logs. The service is healthy when the process stays up and
   `/health` answers.

## 9. Verification sequence (after the first successful start)

Use `<RAILWAY_API_URL>`. Expect production rate limits per client IP:
login 10 per 60 s, register 5 per 60 s, lead submission 5 per 60 s. The
Development overrides do not apply in Production, so pace your tests.

| # | Check | Expected |
| --- | --- | --- |
| 1 | Database: inspect with the master login | `__EFMigrationsHistory` has 8 rows. Identity tables exist. The 3 roles exist. Products are seeded |
| 2 | `GET /health` | 200 `{ "status": "Healthy" }` without login |
| 3 | TLS: `SELECT ENCRYPT_OPTION ...` for the app login's session | `TRUE` |
| 4 | `GET /api/verify/any` | 404 in Production |
| 5 | Auth: `POST /api/auth/register`, then `POST /api/auth/login` | 200, token returned. Password follows ASP.NET Identity defaults (no custom policy found) |
| 6 | Products: `GET /api/products` | Seeded catalogue |
| 7 | Cart: `GET /api/cart`, `POST /api/cart/items`, update, delete | Works with the customer token; 401 without |
| 8 | Orders: `POST /api/orders`, `GET /api/orders` | Order created from the cart in one transaction |
| 9 | Estimate/proposal: `POST /api/estimates`, `POST /api/proposals`, `GET /api/proposals/{id}` | Snapshot values persisted |
| 10 | Payment (TEST keys): `POST /api/proposals/{proposalId}/payment`, then `POST /api/payments/verify` | Payment becomes Verified. Missing keys give a clear 500, not a crash |
| 11 | PDF: `GET /api/proposals/{id}/pdf` | 403 before a verified payment. After it: a `%PDF` file where the rupee sign renders. **This is the first real test of the container's fonts and native libraries** |
| 12 | Leads: `POST /api/leads` (anonymous) | 201, then visible to FieldStaff/Admin via `GET /api/leads` |
| 13 | WhatsApp: the frontend action | Stays hidden while `whatsappBusinessNumber` is empty. Set it in the frontend task |
| 14 | Admin and FieldStaff: see 9.1 | `GET /api/admin/orders`, `/api/admin/proposals`, `GET /api/products/admin`, product write endpoints work for Admin only. `PATCH /api/leads/{id}/status` works for FieldStaff/Admin |
| 15 | Errors: a deliberate bad request | Generic responses, no stack traces, a `traceId` on 500s |
| 16 | CORS: call from the Vercel origin in a browser | Allowed. Any other origin is blocked |

### 9.1 Creating the first Admin / FieldStaff user

Public registration only assigns the `Customer` role (`AuthController`). No
code creates an Admin user. After registering the users in step 5, assign roles
with SQL, as the master user (or a DBA login) in `<DATABASE_NAME>`. Run the
SELECTs first to confirm the standard Identity columns exist (they do on the deployed database [verified]). The application login with `db_datawriter` is enough for the INSERT, so the master user is not needed [verified].

```sql
SELECT Id, Email FROM dbo.AspNetUsers WHERE NormalizedEmail = UPPER(N'<USER_EMAIL>');
SELECT Id, Name  FROM dbo.AspNetRoles;

INSERT INTO dbo.AspNetUserRoles (UserId, RoleId)
SELECT u.Id, r.Id
FROM dbo.AspNetUsers u CROSS JOIN dbo.AspNetRoles r
WHERE u.NormalizedEmail = UPPER(N'<USER_EMAIL>') AND r.NormalizedName = N'ADMIN'; -- or N'FIELDSTAFF'
```

Role claims are written into the token at login, so the user must log in again
after the change. Never put admin credentials in the repository. Register the account through the API (so Identity hashes the password) using a random password kept outside the repository. The account then holds both the Admin and Customer roles, because registration always adds Customer.

## 10. Vercel step

Done for the current deployment: `Frontend/interior-platform/src/environments/environment.prod.ts`
points at the Railway API (`https://interior-platform-production.up.railway.app`).
Keep `Cors__AllowedOrigins__0` matching the Vercel origin (preview URLs are
different origins), then repeat section 9 from the browser.

The app uses real URLs (`/orders`, `/account`, `/admin/orders`, ...). Vercel must
answer every path with `index.html`, otherwise a refresh or a shared link gives a
404. `Frontend/interior-platform/vercel.json` holds that rewrite. Write it
without a UTF-8 byte-order mark: Node cannot parse a BOM-prefixed JSON file, and
the Vercel deployment failed until the BOM was removed.
## 11. Full production end-to-end test

From the deployed Vercel site, with the API on Railway: register, log in, browse
products, add to cart, place an order, create an estimate and proposal, pay with
Razorpay TEST (or the Demo confirmation when `Payments__Mode=Demo`), download the PDF, submit a lead, then log in as FieldStaff and
Admin and work the admin screens. Record anything that fails with its
`traceId`.

## 12. Troubleshooting

| Symptom | Likely cause and action |
| --- | --- |
| Container exits at start with a connection error | The database is unreachable: check the RDS status, the endpoint, the security group rule, public access, and the Railway variable name `ConnectionStrings__DefaultConnection` |
| "certificate chain was issued by an authority that is not trusted" | The image lacks the RDS root CA (wrong region bundle, failed build step) or the database is in a different region than the bundle. Do **not** switch to `TrustServerCertificate=True`; fix the trust |
| Certificate name mismatch | The `Server=` value is not the exact RDS endpoint name (an alias or IP was used) |
| "Login failed for user" | Wrong app password, login not created, or the user lacks access to `<DATABASE_NAME>` |
| Permission denied during migration | Apply the `db_owner` fallback in section 6 for this database, then redeploy |
| Startup error naming `Jwt:Issuer` / `Jwt:Audience` / `Jwt:Secret` | Variable missing or still a `REPLACE_WITH_` placeholder |
| Startup error about `Cors:AllowedOrigins` | The configuration is empty or contains an invalid origin |
| Service up but Railway cannot reach it | The listening port differs from `PORT` (keep both at 8080). Check the logs for the bound address and the `ASPNETCORE_URLS` value |
| HTTP redirect loop | Proxy headers not applied: confirm `ASPNETCORE_ENVIRONMENT=Production` |
| 429 responses while testing | Expected rate limits: wait 60 s |
| PDF shows boxes instead of the rupee sign, or a native-library error | Fonts or libraries missing in the image: capture the log and raise it in the next task |
| Everything fails after some months | The AWS Free plan ended and the account was suspended; upgrade within 90 days |

## 13. Maintenance notes

- CA bundle: when AWS rotates roots or the region changes, update the
  Dockerfile URL, SHA-256 and certificate count together, then rebuild.
- Passwords: rotate the app SQL password by changing the login and the Railway
  variable together, then redeploy.
- Cost: set an AWS budget alert. After moving to the Paid plan, you can set a
  monthly spend limit from $20 [verified].
- Teardown: disable deletion protection, take a final snapshot, then delete the
  instance. Remove the security group rule that opens 1433.
- Backups: an RDS restore creates a new instance with a new endpoint [not
  verified], so a restore means updating the connection string.

## 14. Order of execution (summary)

1. Confirm free-plan eligibility and the region (5.1, 5.2).
2. Parameter group, instance, security group (5.3-5.5).
3. Connect as the master user, verify TLS (5.6).
4. Create database, login, user, roles (6). Test the app login.
5. Create the Railway project and service, region, variables (7, 8).
6. First deploy. Check logs, then section 9 checks 1-4.
7. Register users, assign Admin/FieldStaff (9.1), complete section 9.
8. Frontend API URL and the `vercel.json` rewrite (10), Vercel redeploy, full E2E (11).
9. Record the open items: security group `0.0.0.0/0`, free-plan expiry date,
   TEST payment keys, QuestPDF license review.

## 15. Deployed state and open items

What is running now, and what still needs a decision. No secrets are recorded here.

- **Database security.** `rds.force_ssl` is not enforced (the instance uses the
  default parameter group): create a custom group with `rds.force_ssl=1` and
  reboot. The RDS master password was shared in a chat and must be rotated.
  Confirm deletion protection is on. Storage autoscaling allows up to 1000 GiB:
  consider lowering the cap to limit cost.
- **Payments.** `Payments__Mode=Demo` is set and no Razorpay keys are present.
  Before any real use, remove `Payments__Mode` and add Razorpay TEST keys first,
  then live keys after the account is activated.
- **Deploys.** Railway rebuilds the API on every push to `main` (no watch paths).
- **Test data in production.** Audit accounts (`audit.test@example.invalid`,
  `admin.audit@example.invalid`) and the orders, estimates, proposals, payments
  and leads created while testing. Removing them needs a direct SQL run.
- **Local credential files.** Test passwords live in a local folder outside the
  repository. Delete them once stored elsewhere.
- **Order status.** Admins move an order along Pending, Confirmed, Processing,
  Completed (or Cancelled from any open state) with
  `PATCH /api/admin/orders/{id}/status`. Completed and Cancelled are final.
  Illegal moves return 409; the detail response lists `allowedNextStatuses` and
  the admin screen offers only those.