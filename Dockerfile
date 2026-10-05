# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Interior Platform API - production image (ASP.NET Core / .NET 10).
#
# Build context: the repository root (the Dockerfile sits at the root so a
# platform such as Railway finds it by default). .dockerignore keeps the
# Angular frontend, tests, local settings and build output out of the context.
#
# Target: linux/amd64 (Railway). No secrets or connection strings are baked
# in. The container reads all configuration from environment variables at run
# time:
#   ConnectionStrings__DefaultConnection, Jwt__Secret, Jwt__Issuer,
#   Jwt__Audience, Razorpay__KeyId, Razorpay__KeySecret, ...
# and the listening address from ASPNETCORE_URLS (e.g. http://+:$PORT).
# ---------------------------------------------------------------------------

# ---- build stage ----------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first, with only the project file, so the NuGet layer is cached until
# the package references change.
COPY Backend/InteriorPlatform.Api/InteriorPlatform.Api.csproj Backend/InteriorPlatform.Api/
RUN dotnet restore Backend/InteriorPlatform.Api/InteriorPlatform.Api.csproj -r linux-x64

COPY Backend/InteriorPlatform.Api/ Backend/InteriorPlatform.Api/
# Framework-dependent, RID-specific publish: only the linux-x64 QuestPDF native
# libraries (libQuestPdfSkia.so / libqpdf.so) are copied, not the Windows/macOS
# ones. No apphost: the container starts the app with "dotnet <dll>".
RUN dotnet publish Backend/InteriorPlatform.Api/InteriorPlatform.Api.csproj \
    -c Release -r linux-x64 --self-contained false --no-restore \
    -o /app/publish /p:UseAppHost=false

# ---- runtime stage --------------------------------------------------------
# Debian-based (glibc) image, deliberately not Alpine/musl and not chiseled:
# QuestPDF's linux-x64 natives link only libc, libm, libgcc_s and libstdc++
# (all present in this image), and the ICU data the app relies on
# (CultureInfo "en-IN" in the PDF generator) ships with it.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final

# The image has no fonts, and ProposalPdfGenerator sets
# Settings.UseSystemFonts = true. DejaVu Sans is one small font package
# (no recommended packages) that provides a system fallback face covering the
# rupee sign (U+20B9) used for every amount in the PDF.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Trust the AWS RDS root CAs so SqlClient can validate the RDS server
# certificate with Encrypt=True;TrustServerCertificate=False.
# - Source: AWS's official regional bundle for ap-southeast-1 (three root CAs:
#   RSA4096 G1, RSA2048 G1, ECC384 G1), the region planned for the database.
#   AWS documents these as the trust anchors for RDS server certificates.
# - Pinned: ADD --checksum fails the build if the downloaded bytes differ, so
#   nothing unverified is ever trusted. When AWS publishes a new bundle (or the
#   database moves to another region), update the URL, the hash AND the
#   expected certificate count below (the build fails if the count differs):
#     https://truststore.pki.rds.amazonaws.com/<region>/<region>-bundle.pem
# - Installed into the normal OS trust store (update-ca-certificates), which is
#   what .NET on Linux reads via OpenSSL. Only root CAs are installed, as AWS
#   advises; server certificates are not pinned because RDS rotates them.
# - Build-time only: no credentials, endpoint or connection string involved.
ADD --checksum=sha256:3c696020a3b7c6721085d182211c28024ab01873ade35dcc7eeebb89c20ee979 \
    https://truststore.pki.rds.amazonaws.com/ap-southeast-1/ap-southeast-1-bundle.pem \
    /tmp/rds-ca-bundle.pem
RUN set -eu \
    && csplit -s -z -f /usr/local/share/ca-certificates/aws-rds-ca- -b '%02d.crt' \
        /tmp/rds-ca-bundle.pem '/-----BEGIN CERTIFICATE-----/' '{*}' \
    && rm -f /tmp/rds-ca-bundle.pem \
    && n=$(find /usr/local/share/ca-certificates -name 'aws-rds-ca-*.crt' | wc -l) \
    && [ "$n" -eq 3 ] \
    && update-ca-certificates

WORKDIR /app
COPY --from=build /app/publish .

# Run as the non-root user that the base image provides.
USER $APP_UID

# The listening port is NOT fixed here. Set ASPNETCORE_URLS at run time, e.g.
#   ASPNETCORE_URLS=http://+:$PORT
# ASPNETCORE_URLS takes precedence over the base image's default
# ASPNETCORE_HTTP_PORTS (8080), which only applies when nothing else is set.
ENTRYPOINT ["dotnet", "InteriorPlatform.Api.dll"]
