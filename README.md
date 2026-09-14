# HYPER — Real Income / Monetization Infrastructure

This version keeps the existing HYPER UI/model and adds a production-oriented monetization ledger and payout layer.

## What is real now
- Video ads use Google IMA/VAST in production when `HYPER_VAST_AD_TAG_URL` is set. The Google sample tag is disabled by default (`HYPER_ADS_TEST=false`).
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


## Admin menu visibility
The HYPER Admin option is shown inside Account & Channel only for the configured Admin email (`asarafalamt20@gmail.com`) or a server-marked `is_admin` account. Other users do not see the Admin option, and server-side admin authorization still protects `/api/admin/*`.

## HYPER Support System (v1.9.1)
- Settings → Help & feedback now opens a real support ticket system.
- User can create tickets with category, subject and message, see previous tickets, chat/reply, and close tickets.
- HYPER Admin → Support Inbox has search, status filter, ticket threads, reply, resolve and close controls.
- New ticket/user reply creates an Admin notification; Admin reply/status change creates a user notification with the existing red notification dot.
- Support messages are stored in PostgreSQL tables `support_tickets` and `support_messages`.
- This version uses text messages only; attachments can be added later with the upload/storage system.


## v2.0.1 transfer/language fixes
- Upload progress now shows live percentage during each chunk.
- Paused uploads get a Resume Upload button and retry automatically on page visibility/refresh.
- Download progress shows percentage when the video server allows browser progress (XHR/CORS).
- Settings now includes Language selection.
- Upload form includes Video Language and watch page includes Video Language selector.


## v2.0.4 Fixes
- Fixed resumable upload endpoint path (`/api/uploads/...`, not `/api/api/uploads/...`).
- Persisted upload File/thumbnail blobs in IndexedDB for refresh resume.
- Upload progress is periodically persisted.
- Delete removes matching upload task(s) from IndexedDB and stops active upload requests.
- Duplicate upload tasks are merged by fingerprint.
- Expanded language translation for app UI, including nested/static navigation text and categories.

## Render-only media storage

HYPER stores uploaded media under `/var/data/hyper-uploads` when the Render Persistent Disk is mounted. The Blueprint now mounts a 10 GB Render Persistent Disk at `/var/data`, so video files remain available after redeploy/restart on Render. This does not use a separate storage website.

Important: Render Persistent Disks are not available on the Free web service plan. Use a Render plan that supports persistent disks. If the service stays on Free, uploaded files can still disappear after redeploy/restart even though the video record remains in the database.


## Cloudinary video storage (v2.2.0)
Set these Render environment variables: CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET. Create an unsigned video upload preset in Cloudinary. Optional deletion cleanup uses CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET. Video bytes upload directly from the browser to Cloudinary using chunked Content-Range uploads; Render stores only metadata in Postgres.

## HYPER video ads + earning (easy setup)

This build now has a real video-ad integration path using the Google IMA SDK. During development it uses Google's test VAST tag; test ads do **not** generate revenue.

### 1. Production ads
For real monetized ads, add the approved production VAST ad tag to Render. The production build is configured to use the real tag and not the Google sample tag.

### 2. Start real earning
Create/approve a Google Ad Manager video monetization setup and obtain your production VAST ad tag URL. Then set these Render environment variables:

- `HYPER_ADS_ENABLED=true`
- `HYPER_ADS_TEST=false`
- `HYPER_VAST_AD_TAG_URL=<your production VAST ad tag URL>`

Redeploy the server. Replace the test tag with the production tag only after the ad account/tag is approved. Do not click or generate your own ad impressions.

### 3. Creator split already in HYPER
Verified revenue settlement is recorded by the existing monetization ledger as **Creator 70% / HYPER Admin 30%**. The ad player logs impression/complete/error events; actual money credit still has to come from verified ad-network settlement, not from client-side self-reported events.

### 4. Payout
After verified revenue is settled into HYPER Studio, creators can see balance/earnings there. Live creator payouts require the existing RazorpayX payout configuration.


HYPER v2.3.2: AWS/S3 dependency removed. Use Cloudinary for permanent video uploads and Render for the Node backend.


## Video ads and replay
- A production VAST ad tag is required for real advertiser ads. Set `HYPER_VAST_AD_TAG_URL` to the approved tag from your ad provider/Google Ad Manager.
- `HYPER_ADS_TEST=false` is the default so the app does not mistake Google's sample ad for real monetization.
- A fresh ad opportunity is requested when a viewer starts a video again from the beginning. Pause/resume in the middle does not trigger another ad.

## Faster uploads
- Cloudinary uploads use 20 MiB resumable chunks instead of 4 MiB, reducing HTTP round-trips on large videos.
- Failed chunks retry automatically and uploads can resume from the last committed chunk.
