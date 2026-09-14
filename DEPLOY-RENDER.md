# HYPER v2.3.2 — Render + Cloudinary + Ads

This version is designed for **Render + PostgreSQL + Cloudinary**. AWS/S3 is not required.

## Render
Use a Render **Web Service** from this repository:
- Build: `npm install`
- Start: `npm start`

Required environment variables:
- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_UPLOAD_PRESET`

The app's Cloudinary upload flow uses the cloud name + unsigned upload preset. Do not put a Cloudinary API secret in the browser.

## Cloudinary
Create an unsigned upload preset in Cloudinary:
1. Cloudinary Console → Settings → Upload → Upload presets
2. Add upload preset
3. Set **Signing Mode = Unsigned**
4. Copy the preset name into `CLOUDINARY_UPLOAD_PRESET`
5. Copy your Cloud name into `CLOUDINARY_CLOUD_NAME`

## Ads
The app includes Google IMA test-ad support. Test ads do not pay.
For production, configure:
- `HYPER_ADS_ENABLED=true`
- `HYPER_ADS_TEST=false`
- `HYPER_VAST_AD_TAG_URL=<approved production VAST tag>`

A real ad network account/approval is required before production ad revenue can be earned.

## Test
After Render deploys:
`https://YOUR-RENDER-DOMAIN/api/health`

Expected JSON contains:
`{"ok":true,"service":"HYPER","version":"2.3.2"}`

Then sign in and test video upload. If Cloudinary variables are missing, Hyper will explicitly report that configuration is missing.
