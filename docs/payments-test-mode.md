# Payments — Razorpay TEST mode (Task 14A foundation)

Backend-only token-payment foundation for proposals. TEST mode only.
No live payments. No Angular payment UI yet. PDF access is intentionally
NOT gated by payment yet (follow-up task).

## Configuration keys

| Key | Source | Notes |
| --- | ------ | ----- |
| `Payments:TokenAmount` | appsettings.{Environment}.json / env | Decimal major-units amount. **Development/test default only (`500`) — not an official company business rule.** Must be > 0; startup throws otherwise. |
| `Payments:Currency` | appsettings.{Environment}.json / env | ISO code. Omitted → `INR`. Explicitly empty → startup throws. |
| `Razorpay:KeyId` | User Secrets / environment only | Test-mode Key ID. Empty in committed files (placeholder). |
| `Razorpay:KeySecret` | User Secrets / environment only | Test-mode Key Secret. Empty in committed files (placeholder). |

## Providing test credentials (never commit them)

```powershell
# From Backend/InteriorPlatform.Api :
dotnet user-secrets set "Razorpay:KeyId" "rzp_test_..."
dotnet user-secrets set "Razorpay:KeySecret" "..."
```

Or with environment variables (double underscore = section separator):

```powershell
$env:Razorpay__KeyId = "rzp_test_..."
$env:Razorpay__KeySecret = "..."
```

Real credentials must never appear in source code, appsettings files,
tests, Git history, or Angular code. The secret is used server-side only
(Razorpay Basic auth + HMAC signature verification) and is never logged
or returned by any API.

## How it works

- `POST /api/proposals/{proposalId}/payment` (auth) — amount/currency come
  from backend configuration; the body carries nothing. Creates a Razorpay
  TEST order plus a local `Payment` (`Created`). Open `Created` attempts are
  reused on retry; a `Verified` proposal gets `409` (no double charge);
  `Failed` attempts may retry with a new order.
- `POST /api/payments/verify` (auth) — validates
  `{ paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature }`
  against persisted state: ownership, stored order id, then HMAC-SHA256
  signature with the Key Secret. Only success flips the record to
  `Verified` (+ `VerifiedAt` UTC). Already-verified verifies idempotently.
- Missing Razorpay credentials fail payment operations with a clear
  `500` error; they never prevent application startup.
- Razorpay amounts use paise (smallest unit), converted with decimal-only
  arithmetic — no floating point near money.

## Deferred to follow-ups

- Angular Checkout UI (Task 14B+).
- Payment-gated PDF access (`GET /api/proposals/{id}/pdf` is unchanged).
- Proposal status changes beyond `Draft` (persisted truth is
  `Payment.Status == Verified`).
- Live/production payments, webhooks, refunds.
