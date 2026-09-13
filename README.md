# HYPER v1.4.3

Fixes:
- Uploaded videos are no longer intentionally removed when the app is updated.
- If a Render persistent disk is mounted at `/var/data`, HYPER automatically stores uploads in `/var/data/hyper-uploads`.
- `HYPER_UPLOAD_DIR` can override the upload directory.
- Object-storage support from previous versions remains available.
- Refresh route behavior from v1.4.1/v1.4.2 remains: the current tab/section/watch/channel route is restored on refresh.

Important: Render's normal local filesystem is ephemeral. To keep videos across deployments/restarts, mount a persistent disk or configure S3-compatible object storage.
