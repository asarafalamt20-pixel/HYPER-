# HYPER — YouTube-style video app

This is a ready starter for a YouTube-like video sharing app using Node.js + Express + PostgreSQL. It includes Home, Shorts, Search, Watch, Subscribe, Like, Comments API, Login/Register API and video upload API.

## GitHub
Create a new repository, upload every file in this folder, and push.

## Render
Use the included `render.yaml` Blueprint, or create a Web Service manually:
- Build: `npm install`
- Start: `npm start`
- Environment: `DATABASE_URL`, `JWT_SECRET`

The app listens on `0.0.0.0` and Render supplies the PORT. Render can auto-deploy after Git pushes.

## WebIntoApp
After Render gives the app an `onrender.com` URL, put that URL into WebIntoApp to wrap the website as an Android app. You can also use WebIntoApp's HTML-to-App flow for the `public` website files.

## Production warning
This starter stores uploaded videos on the web service filesystem. For a real public video platform, move video files to Cloudinary, Amazon S3, Cloudflare R2 or similar object storage/CDN; keep PostgreSQL for app data. Render web-service filesystem is not a YouTube-scale media store.
