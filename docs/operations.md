# Operating the independent preview

The preview owns its Cloudflare Worker, D1 database and private R2 bucket. It does not use the original site's database or domain. The source site and public repository grant no general permission to republish music.

## Secrets and first administrator

Generate three independent random secrets (for example `openssl rand -hex 32`) in a private `.dev.vars`. Keep that file, deployment session files, browser state, outbox contents and test traces out of version control. Rotate the bootstrap token after the first administrator is created.

1. Register your own composer account using the preview.
2. While signed in, POST JSON `{ "token": "<ADMIN_BOOTSTRAP_TOKEN>" }` to `/api/admin/bootstrap` from the preview origin. Use a local script or browser developer console; never put the token in a URL.
3. The endpoint promotes that account only if there are no administrators. Its update is atomic. Later role changes use the private Users tool.
4. Password recovery links are captured in `/admin/outbox`, visible only to administrators. The preview does not send email. If the sole administrator loses access, use authorized D1 access to promote another registered account; never edit password hashes manually.

## Provision, deploy, roll back

`cloudflare.config.ts` names the isolated resources. Update IDs for another account. `npx tsx scripts/provision.ts` applies each versioned migration once, inserts sample records without replacing existing ones, rebuilds the search index, and uploads permitted fixtures/runtime assets. It requires a scoped `CLOUDFLARE_API_TOKEN`. Running the seed does not reset user data.

Run check/tests/build before deployment, then `npm run deploy` using cf authentication or `npx tsx scripts/deploy.ts` using the scoped token. The API script consumes `.cloudflare/output/v1`, uploads hashed static assets and modules, sets secrets, binds D1/R2, and enables the preview workers.dev hostname. It does not upgrade billing. Keep the deployed version ID with your release notes. Use Cloudflare's Worker version rollback (or redeploy a known commit) for code recovery; database migrations need their own backup and restore strategy. Do not roll back schema blindly after new user writes.

## Backups and recovery

Use Cloudflare D1 export/Time Travel to back up the database before migrations. Export the complete R2 object inventory and copy objects with an authorized S3-compatible tool; preserve object metadata and storage keys. A database-only backup cannot restore missing music files. Encrypt backups that contain private contact/account data, and test restoration into a separate database and bucket before switching bindings. The sample catalog can be recovered into empty resources with migrations plus `scripts/provision.ts`, independently of the original server.

## Files and maintenance

Each upload reserves quota before transfer. Parts are 8 MiB; a file can be 120 MiB and an image 10 MiB. A content signature and declared length are checked before finalization. Unfinished files cannot be fetched publicly. A failed transfer retains the saved song draft; choose the file again to retry. PDF pages render lazily in the browser. First-page thumbnails and optional WAV/AAC-to-MP3 conversion run in the browser and can be regenerated; server requests do not transcode media.

The global and per-composer preview upload allowance is 1 GiB. This is not a Cloudflare billing hard cap. Originals and duplications can share object keys. Removal tombstones references; the Diagnostics maintenance button collects objects only after three days and only when no live reference remains. Expired multipart uploads release reservations. Run maintenance regularly; configure a daily Worker cron for unattended operation if desired. R2's incomplete multipart lifecycle rule should abort abandoned multipart uploads after a day as an additional safeguard.

Taxonomy edits propagate parent selections on song save. A full index rebuild is bounded to 50 songs per administrator request; use Continue until complete after a large import or taxonomy restructure. Diagnostics identifies duplicate titles, missing files/metadata, quota usage, and processing records. Public responses exclude composer email, feedback, IP-derived keys, passwords and operational settings.

## Cost and operational limits

Stay on Workers Free for this demonstration. Check actual account dashboards and current Cloudflare pricing before expanding traffic. Free-tier CPU and request/database quotas can reject traffic; storage quota alone does not protect against all costs or abuse. No paid Workers plan, live email provider, custom domain, or production music migration is configured by this project. Observability should redact query strings and avoid request bodies, cookies, reset links and private mail. Configure account spending notifications where available.

Remote imports are administrator-only and require attribution/permission. They accept public HTTPS hostnames, validate A/AAAA addresses and each redirect, require a bounded content length, use a 60-second timeout, and stream supported PDF/audio files through the same quota/validation pipeline. Prefer direct uploads for servers without a valid content length. The maintainer must review rights and the actual music before publishing.
