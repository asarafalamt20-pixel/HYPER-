# HYPER v1.4.3

Fixes:
- Uploaded videos are no longer intentionally removed when the app is updated.
- If a Render persistent disk is mounted at `/var/data`, HYPER automatically stores uploads in `/var/data/hyper-uploads`.
- `HYPER_UPLOAD_DIR` can override the upload directory.
- Object-storage support from previous versions remains available.
- Refresh route behavior from v1.4.1/v1.4.2 remains: the current tab/section/watch/channel route is restored on refresh.

Important: Render's normal local filesystem is ephemeral. To keep videos across deployments/restarts, mount a persistent disk or configure S3-compatible object storage.


HYPER v1.6.1-ADS: Added HYPER advertisement overlay system with pre-roll, mid-roll for long videos, skip timer, click/impression event tracking, and ad event database. Real paid ads require an advertiser/ad-network integration.

## v1.6.2 Library & Watch Fixes
- Named Save Files: create multiple personal save files with different names.
- Save As: save any video directly into a named file.
- Unsave: remove videos from Watch Later.
- Watch History: remove one item or clear all history.
- Refresh-safe watch route: current video is restored after refresh, even when it is not in the initial feed response.
- Playback position is remembered per video during the current browser storage lifetime and restored after refresh.

## HYPER Studio — All Setup (v1.7.0)
Studio now includes creator dashboard setup for Dashboard, Content management, Analytics, Earnings/Ads, Audience, Channel Customization, and Studio Settings. Content can be searched, edited, and deleted. Channel name, full name, description and avatar URL can be edited from Studio. Studio preferences are saved locally.
