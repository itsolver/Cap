# IT Solver Cap Self-Hosting Summary

This repository has local deployment changes for running Cap on the 9800X3D Windows PC for IT Solver.

## Public URLs

- Web app: `https://cap.itsolver.au`
- Asset host: `https://cap-assets.itsolver.au`
- External access is through Cloudflare Tunnel.
- LAN access is accelerated through the local Caddy proxy in `infra/lan-proxy`.

## Runtime Stack

Run the stack with:

```powershell
docker compose --env-file .env --profile lan up -d
```

Important services:

- `cap-web`: local Cap web image, built as `cap-web-local`
- `media-server`: FFmpeg processing
- `mysql`: Cap metadata
- `minio`: local S3-compatible object storage
- `cloudflared`: public Cloudflare Tunnel
- `lan-proxy`: Caddy reverse proxy for LAN HTTPS
- `whisper`: local captions/transcription
- `ollama`: local AI titles, summaries and chapters

The `.env` file is required locally and is intentionally not committed. It contains the Cloudflare tunnel token, Cloudflare DNS API token, MinIO credentials, database secrets, Resend key, and other deployment secrets.

## LAN DNS

For fast uploads from LAN devices, resolve both Cap hostnames to the Docker host LAN IP:

```txt
192.168.42.20 cap.itsolver.au cap-assets.itsolver.au
```

This was added to the Windows host file on the 9800X3D PC. The Mac used for uploads also needs the same mapping, or the router should provide a local DNS override for all LAN devices.

Without this override, uploads from inside the LAN hairpin through Cloudflare Tunnel and are much slower.

## Storage

Video objects are stored in the Docker volume-backed MinIO bucket `cap`.

Typical object layout:

```txt
cap/<userId>/<videoId>/result.mp4
cap/<userId>/<videoId>/screenshot/screen-capture.jpg
cap/<userId>/<videoId>/transcription.vtt
```

The local Docker volume is `cap-minio-data`. The MySQL metadata volume is `cap-mysql-data`.

Risk accepted during setup: there is no formal backup process yet, so losing the MySQL Docker volume can lose Cap metadata even if video objects remain in MinIO.

## Features Added

- Replaced the existing compose setup with the self-host public stack.
- Added Cloudflare Tunnel for public web and asset access.
- Added local Caddy LAN proxy with Cloudflare DNS-01 certificates.
- Kept MinIO local and publicly reachable through `cap-assets.itsolver.au`.
- Added local Whisper transcription (`CAP_TRANSCRIPTION_PROVIDER=local-whisper`, `CAP_WHISPER_ASR_URL`). It produces both the caption VTT and the word-level edit transcript from Whisper word timestamps.
- AI generation uses upstream's `openai-compatible` provider pointed at Ollama (`AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`).
- Added drag-and-drop upload to `/dashboard/caps` and `/dashboard/import`, using upstream's `importMediaFile`.
- Desktop default titles such as `GIGABYTE M27U (Area) 2026-11-11 1212` are replaced by the AI title.

Workflows run in-process through the Workflow SDK local world, so no external workflow worker is needed.

## Verified Upload

Test video:

```txt
https://cap.itsolver.au/s/jx95qe1s52ww7xk
```

Verified results:

- Upload was fast over LAN after DNS override.
- Video processed into `result.mp4`.
- Thumbnail was generated.
- Captions were generated with local Whisper.
- Title was generated with local Ollama.
- Final title: `Email Submission and Attachment Instructions`
- DB status: `transcriptionStatus = COMPLETE`
- AI metadata: `aiGenerationStatus = COMPLETE`
- Public caption file returned `200 OK`.

The raw temporary upload object was removed after recovery, leaving only final video, thumbnail, and captions.

## Operational Notes

- After rebuilding `cap-web`, open dashboard tabs may log `Failed to find Server Action` until the browser is hard-refreshed.
- Do not expose MySQL or MinIO admin ports publicly.
- Keep `cap-web` bound to localhost for the direct port mapping; public access should go through Cloudflare Tunnel or the LAN proxy.
- Use the LAN DNS override for local upload speed, and Cloudflare Tunnel for customer access.

## Update Strategy

This checkout started on `main` with `origin` pointing at `https://github.com/CapSoftware/Cap.git`.

Recommended long-term approach:

```powershell
git fetch origin
git switch selfhost-sync
git rebase origin/main
docker compose --env-file .env build cap-web
docker compose --env-file .env --profile lan up -d
```

If a private fork is added later, make that fork the push remote and treat `CapSoftware/Cap` as the upstream fetch remote.
