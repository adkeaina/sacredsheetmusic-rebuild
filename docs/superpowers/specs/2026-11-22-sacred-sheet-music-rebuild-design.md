# Sacred Sheet Music faithful rebuild

Date: 2026-11-22, America/Denver

Status: Draft for user approval. Architecture selected; implementation has not started.

Builder check: a fresh software-engineering reviewer read this design and reported "nothing important left" for planning. This review does not establish implementation feasibility or passing application tests; the stated runtime/media checks remain required.

## Intent and agreed direction

Rebuild the useful functionality of sacredsheetmusic.org in a modern application that is faster, more reliable, accessible, and recognizable to existing users. The user has emphasized usability and reliability, rather than impressing an audience. A public, shareable preview will let the current maintainer evaluate the work.

This is a faithful rebuild, not a new product identity or a substantially different interaction model. Keep familiar navigation, terminology, relationships, and workflows. Make restrained improvements for readability, responsive behavior, accessibility, and the explicitly requested search-as-you-type experience.

The user has no access to the current server, database, domain, or private files. Work from the public site and repository. Use clearly labeled sample data where real catalog access is unavailable. Do not represent the preview as official and do not republish existing music, recordings, artwork, biographies, or files without permission. The user requested REA as an investigation aid, declined visual brainstorming mockups, and has no deadline.

The user selected TypeScript + React on Cloudflare Workers, D1 for structured data, and R2 for files. Target $0 for the preview where feasible; small storage charges are acceptable. No numeric total monthly spending ceiling has been agreed. Paid resource activation is not authorized merely by this document.

## Evidence and its limits

The inspected source is [rdp/sacredsheetmusic.org](https://github.com/rdp/sacredsheetmusic.org), commit `aee05fb18aef1b603de2006beeb11a75704481f4`. Its README documents Rails 2.3.8/MySQL. The source includes application overrides and bundled Substruct code; important routes also live in `lib/substruct.rb`, not just `config/routes.rb`.

Source evidence includes:

- `app/controllers/music_controller.rb`: searching, filtering, browsing, bookmarks, comments, downloads, statistics, competitions, and results.
- `app/views/_main_yes_no_box.rhtml`, `_boxed_categories.rhtml`, and `app/views/music/*`: public navigation, lists, song pages, and relationships.
- `app/controllers/accounts_controller.rb` and `app/models/product.rb`: composer registration, account editing, and ownership roles.
- `app/controllers/admin/*` plus inherited Substruct actions: song, category, user, content, preference, image, and file management.
- `app/models/download.rb`: 120 MiB file maximum. `app/models/image.rb`: 10 MiB image maximum.
- The upload save handler renders PDF pages and converts supported WAV/AAC inputs to MP3 synchronously. This is a design concern; it is not proof of the production slowdown's cause.
- The search handler combines SQL results, tag expansion, in-memory matching, and individual product lookups. Some browse paths allow exceptionally large pages. Those patterns inform the replacement; production profiling remains unavailable.
- `db/schema.rb` describes items/arrangements, tags, files, comments, content, users, and sessions. `db/seeds.rb` has no real catalog data. Old tests are behavioral clues, not an authoritative passing specification; some contradict current handlers.

HTTP/HTTPS web fetches failed from this environment. REA 6.10.1 was invoked through its documented CLI using an owned headless Chrome profile. Its bounded browser scenario attempted the homepage, observed an HTTP-to-HTTPS upgrade, and then `net::ERR_BLOCKED_BY_CLIENT`; it recorded no initial DOM or screenshots. The upgrade does not establish a server-side redirect. Browser cleanup was reported complete. See [research record](../../research/2026-11-22-repository-and-rea-findings.md) and [retained diagnostic](../../research/rea-http-navigation.json).

Therefore neither current live styling nor certificate configuration nor production registration settings have been fully verified. Reconstruct the source-defined behavior independently, record uncertainty, and compare representative live pages when access is possible. A preview can be delivered while this is unavailable, but must be described as source-based, with visual parity unverified. Do not claim verified production parity without that comparison.

## Goals

1. Preserve every useful music-site feature found in the application and its relevant inherited code; include composer and administrative workflows in the implementation, not only visitor screens.
2. Preserve recognizable desktop composition and familiar links while supporting phones, keyboards, screen readers, and zoom.
3. Make search update as the user types, without needing Enter, with relevant results and predictable state.
4. Avoid depending on the old server for normal use of the preview.
5. Keep catalog queries bounded and media work out of ordinary page requests.
6. Support a public HTTPS preview, reproducible local setup, deployment documentation, and meaningful end-to-end verification.
7. Provide an explicit feature parity register showing evidence, implementation, test coverage, and remaining differences.

## Non-goals and anti-goals

- Taking over the live domain, connecting to an unavailable production database, importing real users, or migrating unauthorized files is not part of this release.
- The preview must not send messages to the existing maintainer or composers, reuse their mail credentials, ad IDs, analytics IDs, or sponsors, or imply their endorsement.
- Do not introduce a new visual identity, new navigation hierarchy, AI search service, paid search engine, subscription model, or unrelated social features.
- Never weaken password security, permissions, or file validation to fit a free quota.
- A collection of disconnected mock screens, success messages without persisted effects, or a browser-only catalog is not completion.
- Do not reproduce vulnerabilities, arbitrary controller dispatch, emailed passwords, unsafe remote downloads, or shell-based request handling as compatibility behavior.

## Approaches considered

| Approach | Benefits | Tradeoffs | Decision |
| --- | --- | --- | --- |
| TypeScript/React + Cloudflare Workers + D1 + R2 | Coherent low-cost stack, SQL data, inexpensive file storage and no R2 internet egress charge | Workers CPU/runtime constraints; media processing and secure authentication need validation; email sending and larger workloads may require paid Workers | Selected by user to minimize recurring cost |
| TypeScript/Next.js + Vercel with database, storage, and email services | Convenient full-stack deployment and preview workflow | Several service quotas and bills; a free frontend does not establish a free full application | Considered, not selected |
| TypeScript or Rust + AWS | Flexible infrastructure and processing options | More operational work and usage billing; introductory credits do not establish a permanent free deployment | Considered, not selected |

Rust is not needed for the initial application. Revisit a specialized processor only if measurements establish a reason. The Cloudflare choice is selected; framework and library details below are the assistant's proposed implementation decisions.

## Feature parity register and scope

Create a machine-readable or Markdown register during implementation, with one row per route/action or user-visible behavior. Every row records source location, status (`implemented`, `sample data`, `deployment prerequisite`, `unverified`, or `inactive legacy`), replacement route, and verification. Do not quietly drop source behaviors. A deployment prerequisite is not a completed live integration.

| Area | Required behavior |
| --- | --- |
| Home and categories | Home content, recent additions and randomized discovery; hierarchical categories and breadcrumbs; Original Songs and All Songs; category descriptions, counts, subcategories, and sticky type filter |
| Search | Query title, song code, composer, hymn/original identity, topics, voicing/instruments, and description; preserve punctuation tolerance and useful aliases such as O/Oh; show exact category matches and related arrangements; explicit submit remains functional |
| Catalog lists | Familiar score thumbnails, labels, composers, ratings/new/winner markers, pagination, useful grouping of arrangements, stable ordering within a browsing session, and filtered counts |
| Arrangement | Background, lyrics when available, composer notices/attribution, ordered score pages and enlargement, file view/print/download, HTML audio, MIDI attachment/playback compatibility, optional YouTube, external original page, related arrangements/categories/composers, and bookmark status |
| Composer | Biography, website/contact link, arrangement list, views/download/referral statistics, composer-level notices, and discoverability through categories/search |
| Bookmarks | Anonymous save list on this browser, add/remove, persistence across reloads, and return to music without requiring registration |
| Comments | Existing positive/constructive review flow; private email field, optional rating/difficulty values, duplicate handling and spam controls; comments persist and reach the replacement notification mechanism |
| Competition | Configurable opening/closing dates and content; submissions and winner markers, randomized eligible entries, already-voted state, household/session/account duplicate restriction, public points and peer-review results, private composer feedback, post-close comments that do not change final standings |
| Accounts | Public composer self-registration, username/password login/logout, own profile/password editing and reset, and admin-assisted linking of an existing composer name; no self-claim of another composer's catalog |
| Composer editing | Original-work and arrangement forms, title/code generation, lyrics/description, existing metadata groups and hierarchy, source/video links, multiple files and images, ordering/replacement/deletion, and edit/delete own music |
| Administration | Catalog search/list/edit/duplicate/new-same-author, availability controls, category CRUD/order/alphabetization, composer/account/role management, content/page/section editing, preferences, FAQ/contact management, image/file library, statistics, and source-defined catalog problem checks |
| Maintenance and communications | Preview regeneration, duplicate/missing-file and metadata diagnostics, tag synchronization, safe cache invalidation/rebuild, composer statistics messages and announcement composition; protect maintenance actions as administrator-only |
| Supporting pages | About, upload/self-upload instructions, resources, contact/feedback, competition instructions, relevant FAQ/content pages, and helpful not-found behavior |
| Auxiliary playback | Preserve the repository's bounded YouTube skip/mute interval utility and its meaningful inputs as an auxiliary compatibility route |

The repository includes inherited checkout, tax, shipping, payments, affiliates, and promotions. The public layout comments out store/cart links and the song view explicitly rejects paid songs. Proposal: classify those inherited commerce features as inactive legacy, document their evidence, and do not add a store to this free music site. This is an assistant scope interpretation for approval, not something the user previously requested to exclude. The parity register must surface contradictory live evidence for reconsideration.

The maintenance transport may change: for example, rebuild cache in an authenticated task instead of exposing a filesystem command over a public URL. Advertising/social integrations get configuration points and ordinary sharing links; the preview ships without third-party trackers or other organizations' integration identities. This is an explicit preview difference.

## Familiar interface and navigation

Use the source-defined white central page, restrained brown/blue text and links, recognizable site title, search at the upper right, left category navigation, thumbnail-based results, and familiar footer destinations. Recreate styling independently using new CSS and appropriately licensed fonts/assets. Do not copy source artwork or music thumbnails by default. Preserve category terminology and order where recoverable; sample categories are visibly sample data when production ordering is unavailable.

Arrangement pages retain the download/metadata sidebar and prominent score area. Preserve the composer upload form's sequence and labels for song information, PDFs/recordings, images, and descriptive tags. Use semantic landmarks and modern layout internally. On small screens stack the same sections and expose the same ordered navigation through an accessible disclosure. Keep every required operation available without hover.

Improve spacing, readable text sizes, focus visibility, touch targets, contrast, error messages and progress feedback. Add labels, alternative text, skip navigation, reduced-motion behavior, descriptive page titles, keyboard-operable score controls, and accessible form errors. Target WCAG 2.2 AA for the application interface. PDF content itself has separate accessibility limits; provide available textual metadata and a direct download.

Preserve public paths or documented aliases, including `/`, `/all`, `/Original`, `/search?q=...`, category paths, `/song/:code`, `/s/:code`, `/about/:name`, `/competition` and its existing aliases, `/music/wishlist`, recent-song and composer-stat routes, account routes, and the useful admin routes. Explicit route definitions replace generic controller/action dispatch. Preserve underscores, punctuation, category names containing slashes, and known song-code variants through an alias table. Source identities absent from sample data cannot magically resolve; show an honest not-found page with search and, where known, a clearly marked link to the original site.

## Search and state

Use React Router in framework mode with server rendering on Workers and TypeScript throughout. Vite builds static assets. Use the Cloudflare CLI (`cf`) for a new project per current Cloudflare guidance; do not introduce a second deployment configuration system just because older guides use Wrangler.

Keep the search input immediate. After 300 ms without another keystroke, request updated results; this timing is an assistant starting value, not a user-selected specification. Pause during IME composition. Cancel obsolete requests and check request identity so an older result can never replace the current query. Keep current results visible during short refreshes, show a delayed loading indication, announce completion politely, preserve focus, and handle failure with retry. Enter performs an immediate ordinary search. No automatic focus movement or navigation while typing.

Live results show arrangement matches and exact category/composer suggestions in the familiar results context. For an explicit submitted search, retain the source's useful exact-tag chooser and single-arrangement redirect when unambiguous. Empty input returns the expected browse state; punctuation-only, short, Unicode, and no-result inputs get useful outcomes rather than errors. Support relevant spelling/normalization aliases explicitly; a typo-tolerant search service is not required for the first implementation.

Use D1 FTS5 over a normalized, denormalized search document joined back to visible arrangements. Rank exact title/code first, title prefix next, then all query terms across title/composer/tags/description. Support safe, bounded token-prefix queries; escape the FTS query language. Preserve OR within a category group and AND between groups where source behavior supports compound filters. Avoid full catalog scans and per-result lookups. Update affected search documents transactionally on publication, metadata change, category/composer rename, deletion, or availability changes. Never leak unpublished records via results, suggestions, counts, or thumbnails.

The URL is authoritative for query, filters, ordering/seed, and page. Replace history while typing; explicit navigation and submitted searches create meaningful history entries. Persist the source's sticky type preference in a first-party cookie, with explicit URL parameters taking precedence. Back/forward and reload restore query, filters, list position, and ordering; opening and returning from a song retains scroll. Use route loaders/fetchers for server state and local component state for temporary interaction; no large global store is required by default.

Default list pages contain 48 items (assistant proposal, close to the source's 50-item search pages), with bounded pagination. All Songs remains accessible across pages. Do not silently truncate to a fixed maximum. Category totals and filter counts must agree with their scoped results. Large score documents progressively load pages; audio and video do not autoplay or download fully on listing pages.

## Data and permissions

Use D1 with versioned SQL migrations and a lightweight typed data layer. Proposed entities:

- Users, credentials through an auth library, roles, composer memberships, sessions, reset/verification tokens.
- Composers and their public/private contact fields; arrangements, hymn identities, multiple composer credits, availability, old IDs, current codes and aliases.
- Hierarchical tags with type/rank and ancestor relationships; arrangement-tag links; composer/category notices and rights warnings.
- File objects, arrangement-file ordering, image/page derivatives, processing state, storage keys, sizes, content types, and provenance/permission metadata.
- Anonymous bookmark sessions and entries; comments and private contact fields; competitions, entries, votes and review aggregates.
- Content pages/sections, preferences, contact submissions, aggregate statistics, processing jobs, mail outbox, and admin audit events.

Keep file bytes in R2, never in D1. Preserve source item/tag IDs in mapping fields for an eventual authorized import, without inheriting its entire commerce schema. Public APIs expose only allowlisted fields; composer email, reset tokens, IP-derived keys, credentials and operational secrets never enter public responses or caches.

Proposed auth library: Better Auth with its username support and a D1-compatible Drizzle adapter, subject to an early runtime compatibility check during implementation. Keep the familiar username/password experience. Use library-supported strong salted hashing, expiring opaque sessions and one-time reset links; never reproduce the old MD5 or emailed-password behavior. Secure HttpOnly SameSite cookies, CSRF/origin validation, server-side ownership checks on every mutation, parameterized SQL, and rate limits are required. Benchmark authentication on the deployed runtime. If secure hashing exceeds free CPU limits, document the measured need for paid Workers; do not lower its work factor to save cost.

Visitors can browse/download/bookmark without login. Public registration creates a new composer and limited composer membership. An existing name produces the familiar request for administrator assistance; no takeover by matching a supplied name/email. Composers edit only their own profile, assigned music and attached files. Administrators manage the whole replacement catalog. Keep a private administrator bootstrap mechanism; never publish a writable admin password in the shareable preview. An isolated sample composer account may be offered for demonstration without administrator rights.

Publication remains available to registered composers as the source allows. Require the submitter to confirm they have permission for submitted materials and retain that attestation; this is a small proposed upload-form addition. Preserve scheduled/disabled state, source-specific required tags, and rights notices. Administrative moderation, takedown and safe file deletion apply to the replacement service.

Anonymous bookmark sessions are cookie-bound and server-persisted, matching the source's browser-specific model. Do not imply cross-device synchronization. Bind removal to its owning session. Competition duplicate prevention preserves the source's session/account/household intent using competition-scoped keyed IP hashes and transactional uniqueness checks; explain that IPs are an imperfect household proxy. Do not publicly reveal another household member's comment as the old error message can. Keep competition feedback private where the source does. Freeze closing-time eligibility in server logic; post-close feedback never changes final scores. Preserve source scoring/peer-review definitions in regression fixtures, including the 80-character peer-review rule, account-based peer review, eligible ratings, deadline and 4.0 results threshold.

## Files and media processing

Preserve source maximums: 120 MiB per file, 10 MiB per image, with multiple attachments. Do not proxy full files into Worker memory or a page request. Issue ownership-scoped, short-lived uploads to private staging keys, reserve/check quotas, and finalize only after verifying stored size, allowed content signature, and the uploader's ownership. Stream when inspecting bytes. Deliver trusted public files through a controlled R2/CDN path with suitable content disposition, range support, ETag, and versioned keys. Do not serve staged/unpublished files publicly. Count view/download/referral events with clearly defined semantics; range requests and reloads must not multiply one logical download count.

PDF, MP3, MIDI, WAV, AAC/M4A and source-supported image formats need explicit compatibility tests. Additional benign notation attachments may be offered as downloads with safe attachment headers. Reject executable/active web uploads; video uploads retain the source's instruction to use a YouTube link. Encrypted, malformed, oversized, or unsupported files get actionable errors and preserve entered song metadata.

Proposed low-cost processing path: lazy-load PDF.js and an isolated browser worker for previews, and lazy-load single-thread ffmpeg.wasm only when a WAV/AAC conversion is needed. Generate preview derivatives during upload with progress/cancellation and store them with the completed file set; never load these libraries during ordinary search. Validate derivative types/dimensions server-side. Single-thread media processing avoids imposing cross-origin isolation that could interfere with third-party video embeds. Library and codec licenses must be retained.

This processing choice is the assistant's proposal and has a feasibility gate: test representative multi-page/scanned/120-MiB-boundary inputs, low-memory failures, mobile uploads, cancellation, and MP3 conversion before relying on it. Preserve a recoverable draft when processing fails. The user must not be told a file is published if required processing failed. A persistent job record supports idempotent retry and administrator regeneration. The implementation plan must establish a working processor for admin regeneration and client-incompatible inputs; if browser processing cannot meet the supported cases, present a measured, priced server-processing alternative for agreement. Do not silently drop conversion, reduce the source size limit, or claim complete parity while this gate is unresolved.

Remote PDF/audio import is an administrator-only compatibility operation with URL validation, private/local address rejection, redirect revalidation, size/time limits, signature checks, and attribution/rights records. Do not enable the old unrestricted link-fetch/shell behavior. Server-side media processing must be isolated from the request path if selected after the feasibility gate.

Delete attachment links transactionally and garbage-collect only unreferenced objects after a recovery window. Shared file references, interrupted multipart uploads, cancelled jobs, and failed database finalization need explicit handling and tests.

## Email, content and preview boundaries

The application needs registration/profile notices, reset links, comment/competition feedback, contact submissions, composer statistics messages, and announcement composition. Use an outbox abstraction, idempotent delivery, retries, send status, and redacted logs. Preserve data after provider failures and never show 'sent' when only queued or captured. Keep marketing/announcements separate from transactional delivery; use consent and an appropriate configured provider for live bulk announcements.

Assistant proposal for the initial independent preview: capture emails in a private administrator/test outbox instead of sending to arbitrary addresses or the original site's contacts. Make this explicit near affected actions and in preview documentation. Automated tests can follow captured reset links through a private test interface; no public reset-token inbox. Public registration/login/upload must persist, but an unconfigured email action must report its captured/unavailable-delivery state honestly. This is a deliberate preview integration difference, not a claim of live email parity.

A production-like preview with real delivery requires a sender domain the user controls and a configured email provider. Cloudflare's arbitrary-recipient Email Sending currently requires Workers Paid and includes 3,000 messages/month, then $0.35 per 1,000. The provider is beta; verify access before selecting it for live delivery. Do not activate paid plans or purchase a domain automatically. Native Cloudflare free forwarding to verified destinations is not a replacement for arbitrary-user account recovery.

Sample content includes clearly fictional composer identities, varied original arrangement metadata, hierarchical tags, related versions, comments, private feedback, competitions in each lifecycle state, content pages, and owned/permitted PDF/image/audio fixtures. Use about 36 curated sample arrangements plus a separate generated 10,000-arrangement performance dataset. Never present sample totals, ratings, downloads or test contests as real activity. Sample source links can point to original public pages without copying their files. Preserve attribution and a provenance manifest for every shipped media asset.

The preview has a visible independent-rebuild/sample-data notice and a contact/about explanation. Use `noindex` for the preview and omit it only for a later authorized production launch. The application does not need a connection to the original site to function. Imported production data, account claim approvals and mail recipients are separate future migration work.

## Reliability, deployment and costs

Deploy static assets separately from bounded Worker handlers. Render meaningful initial HTML, fetch only requested result pages, cache public immutable files and navigation/catalog fragments appropriately, and invalidate by catalog version or affected entities after writes. Never cache private session responses publicly. Loading and failure states retain entered fields and currently usable content.

Use an explicit request timeout strategy, indexed queries, atomic D1 batches where required, idempotent mutations, structured redacted logs, a minimal health endpoint and a database readiness check. An email, counter or processing failure must not make catalog reading unavailable. Last-known public content can be served when safe; do not claim full offline support. Protect processing/admin routes and rate-limit expensive public endpoints.

Deliver repeatable commands for install, local emulated D1/R2 development, migrate, seed sample data, check, test, build, deploy, and deployment smoke tests. Pin compatible stable versions at implementation time. Keep environment bindings and secrets documented with a checked-in example, never real keys. Use separate test/preview resources. Prefer an existing authorized Cloudflare connection when deployment begins; only request a missing login if it actually blocks deployment. A provider subdomain is sufficient for the shareable HTTPS preview.

Document versioned releases, code rollback and forward-compatible database migrations. Include a tested export/restore procedure for D1 metadata and a separate R2 file backup/restore plan; D1 recovery does not protect R2 files. Prefer object versioning in application keys and delayed deletion. Automated backup frequency/retention and an off-provider destination must be chosen and priced before adoption as the real site. The preview's sample data must be recoverable from its seed and original fixture assets.

Current cost references, checked 2026-11-22:

| Component | Free allowance / starting rate | Constraint |
| --- | --- | --- |
| Workers | 100,000 dynamic requests/day; static asset requests free/unlimited; paid starts at $5/month | Free CPU budget 10 ms/invocation; secure auth and server rendering must be measured |
| D1 | 5 million rows read/day, 100,000 written/day, 5 GB total free storage | 500 MB per free database; indexes and search count toward usage/storage |
| R2 Standard | 10 GB-month, 1 million Class A and 10 million Class B operations/month | Extra storage $0.015/GB-month; requests charged beyond allowances; internet egress free |
| Email Sending | Arbitrary-recipient delivery on paid Workers, with 3,000/month included | Requires configured sender domain and service access; bulk announcements need an appropriate provider |

Approximate R2 storage-only charges after its free allowance: 50 GB = $0.60/month, 100 GB = $1.35/month, 500 GB = $7.35/month. These exclude processing, requests, email, backups, domains, taxes, and other service costs. R2 is usage-billed: a budget alert is not a hard account-wide spending cap. Enforce application upload quotas and account-wide storage reservations; report usage and estimated cost to the administrator. Choose a conservative configurable preview aggregate quota (assistant proposal: 1 GiB of newly uploaded data in addition to fixed fixtures) and 1 GiB/user until a different operational budget is agreed. This limits aggregate usage without reducing the 120 MiB per-file limit. No paid upgrade is automatic.

Free plan quotas can interrupt service and do not establish a production uptime guarantee. The target is reliable architecture and measured behavior, not an unverified promise of permanent $0 hosting for the real catalog. An early performance/auth/media feasibility report must show whether the free preview fits before selecting any paid component.

## Verification and acceptance

Maintain a readable parity register and test the whole browser-to-Worker-to-D1/R2 flow. Tests should check visible and persisted outcomes and failures, not just the existence of pages.

1. Browse home/categories, nested categories, original/all songs, composer and recent lists; paginate and use old public links, including punctuation and slash-containing categories.
2. Type without Enter; results update after the debounce; rapid typing cannot show stale results; clear/change filters; Enter still works; IME, keyboard and screen-reader status work; query/filter/page/scroll survive reload and back/forward.
3. Open a song, navigate score pages/enlargement, play/pause audio, exercise MIDI support, print/download an owned fixture, follow related arrangements/composer/source links, and return to the previous list state.
4. Add/remove anonymous bookmarks across reloads and verify isolation from a second browser session.
5. Submit valid/invalid/duplicate comments and ratings; verify persisted public/private fields, spam controls, and captured/delivered notification states.
6. Exercise competition pre-open, open, closed, and results states with a controlled clock; score calculations, peer feedback privacy, duplicate prevention and post-close feedback must match documented rules.
7. Register a new composer, reject an attempted existing-name claim, log in/out, edit a profile/password and complete reset using the private test outbox. Verify composer A cannot read or change composer B's private data or files.
8. Create/edit/delete originals and arrangements; validate tags, generate codes, upload/replace/order files and images, convert/render supported input types, recover from cancellation/failure, regenerate derivatives, and verify search invalidation.
9. Exercise administrator catalog/category/user/content/preference/FAQ/file tools, duplication, source diagnostics, statistical reports and preview announcement composition. Verify unauthorized requests are rejected server-side.
10. Test missing/corrupt files, unknown routes, unavailable database, storage failure, outbox failure, oversized and unsupported uploads, quota exhaustion, invalid remote imports, and interrupted finalization; never lose already-saved metadata or expose staged objects.
11. Check mobile/desktop layouts, 320 CSS px reflow, 200% zoom, keyboard-only operation, focus restoration, contrast and automated accessibility, followed by manual review of key pages.
12. Build and deploy, then run public HTTPS smoke flows and isolated persisted-data checks against preview bindings. Verify no original-site dependency, no embedded secrets and no public administrative credentials.

Performance targets are acceptance goals, not current results: on the generated 10,000-arrangement dataset, p95 search API latency <=500 ms under a documented 10-concurrent-reader scenario; visible live results <=1 second after the final keystroke under the same recorded network conditions, including debounce; representative mobile lab LCP <=2.5 s and CLS <=0.1; ordinary input interaction <=200 ms. Record region, device, connection throttling, cold/warm runs, dataset and sample counts. Do not load-test the original site. Measure Worker CPU separately for free-plan admission; sample-data speed alone does not establish real-catalog performance or guaranteed uptime.

Before claiming completion, every required feature area has an implemented and verified replacement or an explicitly approved preview integration exception. Live email prerequisites and unverified live-site visuals remain prominently documented. No feature is marked complete merely because a later milestone is planned.

## Work size and delivery sequence

This is a full application rebuild. Implement in reviewable stages, with one eventual complete feature set:

1. Evidence/parity register, route/data mapping, and runtime/auth/search/media feasibility checks.
2. Faithful public shell, catalog/search/state, song previews and bookmarks with owned fixtures.
3. Persistent accounts, composer editing/uploads, comments and competitions.
4. Administrative/content/maintenance/statistics/communications workflows and compatibility routes.
5. Accessibility, performance/failure verification, deployable documentation, public preview and handoff.

Stages are sequencing, not permission to omit the later functionality. The implementation plan follows design approval.

## Assistant decisions to review

- React Router full-stack framework, URL-led state and indexed D1 FTS5 search; exact compatible package versions left to implementation.
- Initial 300 ms search debounce, 48-result pagination and stable browsing order.
- Browser-first PDF/audio processing with an explicit feasibility gate and no hidden reduction of supported uploads.
- Maintained username/password auth; secure reset links replace emailed passwords.
- Open new-composer registration with ownership enforcement; existing-profile linking stays administrator-assisted.
- Explicitly captured/private email delivery for the $0 preview; real delivery requires a configured sender/provider and potentially paid Workers.
- Inactive bundled commerce excluded pending contrary evidence; source music features, competitions, admin and auxiliary playback remain included.
- Independent styling/owned fixture assets; no third-party tracker identities in the preview.
- Proposed preview upload quotas and sample/performance dataset sizes.

## Remaining operational prerequisites

No further product answer is required to plan the sample-data preview if the proposals above are approved. Cloudflare authentication, service availability, an administrator bootstrap secret and a sender domain/provider for real delivery must be resolved when those integrations are exercised. A production migration later needs the maintainer's database export, authorized files, actual traffic/storage figures, URL inventory and current policies. The unknown media/runtime feasibility results must be resolved by implementation checks; a materially different or paid architecture returns for agreement.

## Primary references

- [Public source at inspected commit](https://github.com/rdp/sacredsheetmusic.org/tree/aee05fb18aef1b603de2006beeb11a75704481f4)
- [REA browser scenario contract](https://github.com/morluto/rea/blob/main/docs/guides/web/browser-scenario-contract.md)
- [REA guidance](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md)
- [Cloudflare React Router framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
- [D1 supported SQL and FTS5](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [limits](https://developers.cloudflare.com/d1/platform/limits/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Email service](https://developers.cloudflare.com/email-service/) and [pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) and [username support](https://better-auth.com/docs/plugins/username)
- [PDF.js](https://mozilla.github.io/pdf.js/) and [ffmpeg.wasm](https://ffmpegwasm.netlify.app/docs/overview/)
