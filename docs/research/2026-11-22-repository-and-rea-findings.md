# Repository and REA investigation

Date: 2026-11-22, America/Denver.

The user requested a faithful rebuild from the public site and repository, with REA used for behavioral investigation. This record is research, not an implementation or a claim of production access.

## Source

Repository: https://github.com/rdp/sacredsheetmusic.org

Inspected commit: `aee05fb18aef1b603de2006beeb11a75704481f4`.

A shallow, read-only research checkout was obtained at `/tmp/sacredsheetmusic-upstream-20261122`. The connected GitHub fetch tool failed with a transport error; public raw files and a Git checkout provided the source instead. No original application was run and no real database, credentials or media were imported into the rebuild.

The README describes Rails 2.3.8/MySQL. `db/schema.rb` supplies a historical schema and `db/seeds.rb` contains no catalog seed data. The source has an overridden Substruct route registry at `lib/substruct.rb`, a music controller, composer accounts, public/private feedback, competitions and extensive inherited administrative actions. Large source page limits, SQL/in-memory search composition and synchronous media processing are observed design properties, not measured causes of production failures.

Useful source rules include public composer self-registration, admin-assisted attachment of an existing composer name, ownership-limited composer editing, anonymous cookie/session bookmarks, 120 MiB downloadable files and 10 MiB images. Uploads include PDF rendering and WAV/AAC-to-MP3 conversion. Comments, contest feedback, account notices and statistics use email. Much of the text/navigation content and all actual catalog records require database content not present in the public seed.

The bundled Substruct plugin contains commerce capabilities. The public layout has commented-out cart links, and the music view rejects paid songs. Treat commerce as an explicitly proposed inactive-legacy classification for user review, not a proven statement about every reachable production route.

There is no blanket root license in the inspected checkout. Vendor packages have their own licenses. Reimplement behavior and visual organization independently; do not copy original code, artwork or music files on the assumption that a public repository grants all redistribution rights.

## Live-site access

Web requests to the homepage over HTTP and HTTPS failed from this environment; a direct HTTPS curl request timed out after 20 seconds. These observations do not establish public availability from other locations or prove a hosting, TLS, database or browser-state root cause.

## REA

Official source: https://github.com/morluto/rea

The README, CLI documentation, browser-scenario contract and investigation guidance were inspected. Its guidance directs ordinary source analysis to normal repository tools; use REA for runtime behavior not established by source. No binary disassembler or global agent setup was needed.

The npm release was resolved to `rea-agents@6.10.1`. Its CLI help and schema were inspected using `npx` from `/tmp`, outside the target repository. An explicit owned headless Chrome launch was selected; no user's existing browser profile was attached.

Scenario: navigate to `http://sacredsheetmusic.org/`, wait briefly if navigation succeeds, capture DOM/accessibility/URL and network/page-error events. Command timeout: 15 seconds. No login, clicks, file downloads, form submissions, storage seeds or secrets were used.

Command:

```sh
npx -y rea-agents@6.10.1 capture-browser-scenario /tmp/sacredsheetmusic-rea-http-scenario.json --detail summary --evidence_output /tmp/sacredsheetmusic-rea-http-evidence.json --json
```

Result: exit 1, REA `execution_failure`. Partial observation retained an HTTP request, a browser upgrade to HTTPS, and `net::ERR_BLOCKED_BY_CLIENT` on the HTTPS document. The initial page state was never captured. The browser was provider-owned and REA reported `terminated-owned-process` cleanup. Because capture failed, no successful evidence bundle was written to the requested destination; the diagnostic is preserved separately in [rea-http-navigation.json](rea-http-navigation.json).

This is a bounded failed observation, not successful site reverse engineering. It supplies no rendered layout, performance timings for loaded pages, TLS diagnosis, or proof that the server issued the observed upgrade. No identical retry was made after REA marked the failure nonretryable. When live access becomes possible, compare representative home/category/search/song/account/upload flows against the source-based parity register.

## Design consequences

The preview must be self-contained. Source-defined behavior and layout provide the provisional baseline, with sample data/owned media and independent-rebuild labeling. Runtime/visual parity stays explicitly unverified until live comparison succeeds. Full email delivery requires a verified sender configuration; a private captured-mail preview is a proposed exception that must be stated to the user. Media processing, secure auth CPU usage and storage cost need explicit feasibility checks before promising a fully free deployment.
