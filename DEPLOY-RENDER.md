# HYPER v2.3.1 — Full-stack Render deployment

This project is a **Node/Express full-stack app**. Do not deploy it with Cloudflare Pages as static files; the browser needs the Express `/api/*` backend.

## 1) Put this project in GitHub
Upload all files in this folder to a new GitHub repository.

## 2) Create the backend on Render
Create a **Web Service** from the GitHub repository.

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- The included `render.yaml` can also be used as a Blueprint.

## 3) Required environment variables
Set these in Render:

- `DATABASE_URL` — PostgreSQL connection string (Render Postgres is recommended)
- `JWT_SECRET` — a long random secret
- `NODE_ENV=production`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_UPLOAD_PRESET`
- `CLOUDINARY_API_KEY` (if server-side Cloudinary operations are needed)
- `CLOUDINARY_API_SECRET` (if server-side Cloudinary operations are needed)

For production ads, add your approved VAST ad tag as:

- `HYPER_ADS_ENABLED=true`
- `HYPER_ADS_TEST=false`
- `HYPER_VAST_AD_TAG_URL=<your approved production VAST tag>`

Until a real approved ad tag is configured, HYPER uses Google's IMA sample VAST tag for testing. Test ads do not generate real revenue.

## 4) Test
After deployment open:

`https://YOUR-RENDER-DOMAIN/api/health`

It should return JSON containing `ok: true`.

Then open the main Render URL. Account creation, login, upload, settings, comments, likes, library and the `/api/*` routes all run from the same domain, so the previous Cloudflare `Server error 404` caused by missing `/api` routes is avoided.

## 5) Monetization
The app already contains the HYPER Studio ledger and a 70% creator / 30% HYPER accounting split. Actual ad revenue must come from an approved ad provider and verified revenue events; demo/test ad impressions are not payable revenue.
