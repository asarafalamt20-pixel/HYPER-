# HYPER — Real Income / Monetization Infrastructure

This version keeps the existing HYPER UI/model and adds a production-oriented monetization ledger and payout layer.

## What is real now
- Creator wallet with balance, lifetime earnings and paid-out totals.
- Fixed revenue split: Creator 70% / HYPER Admin 30%.
- Verified ad-revenue ledger with provider/event IDs to prevent duplicate crediting.
- Studio Earnings page with revenue and payout history.
- Creator payout-account record using a RazorpayX fund-account ID.
- Withdrawal API with balance locking, minimum withdrawal, idempotency key and RazorpayX payout call.
- Admin-only endpoints to enable monetization and credit verified ad-network settlements.
- HYPER Admin Revenue Dashboard at `/admin` showing total gross, creator 70%, HYPER Admin 30%, creator-wise revenue and daily revenue.

## Important: real money requires external approvals/accounts
The code cannot create advertising revenue by itself. HYPER must have an approved real ad network/publisher account and a business payout account with funds available for creator payouts.

RazorpayX payouts require account activation/KYC and the payout API requires the required setup/allowlisting. Use TEST mode first, then switch to LIVE credentials only after validation.

### Environment variables
Copy `.env.example` to your deployment environment and set:
- `HYPER_MONETIZATION_ENABLED=true` only after HYPER is ready to monetize.
- `HYPER_ADMIN_KEY` to a long random secret.
- `HYPER_CREATOR_SHARE_PERCENT=70` (kept for compatibility; this build enforces the fixed 70/30 split).
- `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER` for live payouts.

Never expose Razorpay secrets in browser/Studio JavaScript.

## Admin revenue settlement
When the real ad provider reports a verified settlement, an HYPER backend/admin job should call:
`POST /api/admin/monetization/revenue`
with header `X-HYPER-ADMIN-KEY` and JSON such as:
```json
{
  "user_id": 123,
  "video_id": 456,
  "provider": "your-ad-network",
  "external_event_id": "unique-settlement-id",
  "gross_paise": 12500,
  "impressions": 25000
}
```
The server calculates the fixed 70% creator / 30% HYPER split and credits the creator wallet exactly once per external event ID. The HYPER 30% is recorded in `ad_revenue_ledger.hyper_paise` and shown in the Admin Revenue Dashboard.

To enable a creator:
`POST /api/admin/monetization/enable`
with the same admin header and `{ "user_id": 123, "enabled": true, "creator_share_percent": 70 }`.

## Payout flow
1. Creator's verified ad revenue is credited to the HYPER wallet.
2. Creator saves their RazorpayX fund-account ID in Studio Earnings.
3. Creator requests a payout after reaching the minimum balance.
4. HYPER server creates a RazorpayX payout with an idempotency key.
5. HYPER records provider payout ID/status in the database.

The payout provider still needs the appropriate KYC, beneficiary validation, API/IP allowlisting and available business-account funds.

## Deployment
Use the same GitHub/Render project and replace the existing files with this version. Run the normal `npm install`/build and start command. Database tables are created automatically on startup.

## HYPER Admin money view
Open `https://YOUR-HYPER-DOMAIN/admin` and enter `HYPER_ADMIN_KEY`. The dashboard is protected by the server-side admin key and shows:
- Total verified gross ad revenue
- Creator share (70%)
- HYPER Admin share (30%)
- Ad impressions
- Creator-wise 70/30 breakdown
- Daily revenue history

The Admin 30% shown by HYPER is an accounting/ledger share. The actual cash settlement into HYPER's bank/provider account is controlled by the ad network/payment provider and its settlement cycle.


## Same-email HYPER Admin
Set `HYPER_ADMIN_EMAIL` to the exact email used for the HYPER account. That HYPER login becomes the Admin login; no separate Admin email/password is needed. The Admin page is `/admin`. Do not expose admin credentials or API secrets in frontend code.
