# Verification and handoff — 23 November 2026

Public independent preview: **https://sacred-sheet-music-preview.adkeaina.workers.dev**

This is an independently implemented demonstration, with fictional metadata and original sample scores/audio. It is not an official replacement or a copy of the production catalog. The original site was unavailable to the research browser; repository analysis and REA investigation are documented in [research](research/2026-11-22-repository-and-rea-findings.md). A real migration still requires the maintainer's authorization, database, file inventory and rights review.

## Stack and deployment

TypeScript, React Router with server rendering, Cloudflare Workers, indexed D1 catalog and private R2 storage. Public requests use HTTPS. This deployment uses isolated preview resources; the original domain and hosting were not changed. No paid Workers plan or live email provider was enabled. Application storage reservations are limited to 1 GiB globally and per composer, with 120 MiB files and 10 MiB images. These are application limits, not billing guarantees. Remote URL imports are limited to 16 MiB and explicitly trusted hosts; larger files use the multipart composer uploader.

[README](../README.md) contains local setup and testing commands. [Operations](operations.md) covers secrets, administrator bootstrap, repeatable provisioning/deployment, cleanup, backups and rollback. The preview administrator's randomly generated credentials are stored only in the local ignored `.cloudflare/operator.json`; do not share this file or browser state. Private mail, password reset and confirmation links are captured in the administrator outbox, never delivered externally.

## Evidence

| Check                                           | Result                                                                            | Scope                                                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type generation / TypeScript / production build | Passed                                                                            | `npm run check`, `npm run build`                                                                                                                                                           |
| Unit and persistence suite                      | 42 tests passed, 11 files                                                         | `npm test`; includes search, permissions, storage recovery, quotas, comments, competition and review regressions                                                                           |
| Local browser suite                             | 20 tests passed                                                                   | Discovery/live search, accounts/recovery, composer publishing/edit/delete, multipart retry/privacy, PDF processing, WAV conversion, bookmarks, community, administration and accessibility |
| Public browser suite                            | 19 tests passed                                                                   | Same main flows against deployed HTTPS; local-D1 recovery harness excluded                                                                                                                 |
| Accessibility                                   | Zero axe WCAG A/AA violations on five public screens                              | Includes WCAG 2.1/2.2 checks, 320 px reflow and keyboard skip navigation; automated checks do not replace assistive-technology review                                                      |
| Indexed catalog benchmark                       | p50 69 ms; p95 132 ms                                                             | 10,000 synthetic records, 100 requests, 10 concurrent readers, isolated local production workerd/D1; excludes public network latency                                                       |
| Mobile browser lab                              | LCP 924 ms; CLS 0.0965; visible search 796 ms; longest observed interaction 40 ms | Chrome 390×844, 4× CPU slowdown, 1.6 Mbps down / 750 kbps up, 150 ms additional latency; one lab run, not field Core Web Vitals                                                            |
| Large scanned score                             | Published and removed successfully                                                | 125,737,142 bytes (119.912 MiB), 15 parts, two scanned pages, thumbnail and page navigation, eight subsequent Range responses with status 206                                              |
| File boundaries                                 | Exact cap accepted, over-cap rejected                                             | Unit validation complements the actual near-cap transfer; no claim that every possible PDF/media file parses                                                                               |
| Remote URL import                               | Owned PDF imported successfully and test draft removed                            | Preview's own HTTPS sample, permission/provenance required; final-part allocation regression covered                                                                                       |
| Authenticated free-tier requests                | 25 consecutive responses with status 200                                          | Catalog/admin/maintenance probes after addressing observed Worker CPU-limit errors                                                                                                         |
| Public smoke/privacy                            | Passed                                                                            | Health/readiness, public routes, nonempty search, noindex and anonymous denial of private administration                                                                                   |

Browser test logs and traces remain ignored local artifacts because they may contain account/reset tokens. The local-only recovery test is explicitly skipped on a remote target, and local/remote trace directories are separate. Remote tests allow 90 seconds for full multi-request upload workflows; the latency benchmark remains independently bounded.

The tracked CI workflow installs dependencies, provisions an isolated local sample database, runs checks/unit/browser tests, and builds. It has been configured but no remote CI run is claimed.

## Reliability and security findings addressed

The independent final reviewer examined the complete implementation through the administration commit. Its Critical and Important findings were resolved in one consolidated author fix pass, with regression coverage: notation files always download safely; future releases remain private; interrupted R2/D1 finalization retains reservations and reconciles; per-object charges prevent duplicate quota release; malformed/encrypted PDFs retain recoverable drafts; password changes preserve the current session while revoking others; composer identity linking is atomic; composer credits/hymns participate in discovery; taxonomy changes use resumable jobs; live search suppresses stale responses and exposes retries; competition feedback and notifications persist atomically and accept 4.5; imports use explicit trusted hosts; source aliases and stored-object diagnostics have concrete implementations. Source account destruction is replaced with audited deactivation.

Deployment testing also exposed real Workers Free CPU-limit errors. Immutable authentication configuration is reused, viewer lookup is request-scoped, anonymous public files bypass authentication, and administrator lists/outbox use bounded projections and pagination. Password hashing was not weakened. Subsequent authenticated probes completed without resource errors; this is bounded verification, not an uptime guarantee. Long searches now use literal prefix/substring comparisons instead of D1's limited LIKE patterns; the database error was reproduced on the actual deployment before the correction.

## Decisions and known limits

1. Official Cloudflare configuration required compatible release-candidate `cf`/Vite tooling. Application libraries remain stable; future build-tool API changes may require maintenance.
2. Full authentication/media feasibility checks moved from the foundation task to their real integrations. That exposed integration limits later, which were tested and corrected before handoff.
3. Administrator import/regeneration moved to the administration task to share authorization and diagnostics. Both are implemented.
4. URL imports require explicit trusted HTTPS hosts because a separate DNS lookup cannot pin the actual fetch destination. Adding a source requires administrator configuration.
5. Account destruction became audited deactivation to preserve music, accounting and audit references. Personal-data erasure needs a deliberate retention workflow.
6. Remote imports are capped at 16 MiB to bound free-tier request resources. Larger files require downloading and using the 120 MiB multipart uploader.

Two minor review findings remain deferred: home discovery uses a fixed subset and sample-count wording can include later user submissions; navigating related PDFs can retain the preceding document's page/loading/error state (the full-PDF link remains available).

No live visual or complete production-data parity, load-tested production capacity, field performance, external email delivery, or original-catalog migration is claimed. Free-tier limits can still reject abusive or excessive traffic. The maintainer should validate real catalog behavior and operational needs before replacing the existing service.
