# Sacred Sheet Music Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved faithful, persistent music-site rebuild and a tested public Cloudflare preview.

**Architecture:** React Router renders the familiar interface on Workers. D1 stores catalog, account, community and administration state; R2 holds owned fixtures and submitted files. URL state, bounded indexed search, isolated media processing and explicit preview email capture preserve usability without depending on the original server.

**Tech Stack:** TypeScript, React, React Router framework mode, Vite, Cloudflare Workers/D1/R2, Better Auth, PDF.js, ffmpeg.wasm, Vitest and Playwright. Resolve exact compatible versions from the registry. Use the supported cf toolchain; record build-tool prereleases required by the cf configuration format.

**Spec:** `docs/superpowers/specs/2026-11-22-sacred-sheet-music-rebuild-design.md` (approved by user; user explicitly authorized immediate building).

## Global Constraints

- Faithful UI/navigation/workflows; preserve all useful music-site functionality, including composer/admin/community tools. Inactive commerce classification follows the approved design.
- Independent preview, sample data/owned media, visible unofficial notice, no original-site credentials, no copied unauthorized media, no original-site tracking or mail recipients.
- 300 ms live search debounce; 48-result pagination; explicit submitted search and keyboard navigation continue to work.
- Source file limits: 120 MiB/file and 10 MiB/image; preview aggregate upload quota 1 GiB, with atomic reservation/finalization.
- Private captured-mail preview; secure username/password, opaque sessions, ownership/role checks, CSRF validation and throttling. No public administrator password.
- No paid upgrade, domain purchase or live external messages without separate authorization. Use the existing connected Cloudflare account if sufficient.
- Main application remains usable without the old site. No completion claim until persisted flows and deployed preview have been verified.
- Native execution in this session is selected by the assistant to honor 'now build'; no additional plan approval gate. Final independent review is required by the execution skill.

## Review Focus

1. Rapid/IME typing and out-of-order responses must not replace the current query or steal focus (Task 3).
2. Composer ownership, staged file URLs, private feedback and reset mail must not cross session boundaries (Tasks 4–6).
3. Upload interruption, duplicate finalization and quota races must preserve metadata and avoid unreferenced public files (Task 5).
4. Existing URL punctuation/category slashes, pagination and back navigation must preserve browsing state (Tasks 3 and 8).
5. Contest close-time, duplicate voting and post-close comments must preserve final scores and private reviews (Task 6).

## File responsibilities and shared contracts

- `workers/app.ts`: Worker entry, security headers, React Router request context and scheduled housekeeping.
- `app/root.tsx`, `app/routes.ts`, `app/styles/site.css`: document shell, explicit routes, faithful responsive styling.
- `app/components/{SiteShell,MusicList,SearchBox,ScorePreview,FormFields}.tsx`: reusable accessible UI with no data authority.
- `app/lib/{types,db,auth,security,mail,storage,search,competition}.server.ts`: focused authoritative services.
- `app/routes/{home,catalog,song,bookmarks,composer,accounts,editor,admin,content,competition,resources}.tsx`: loaders/actions and screens by workflow.
- `app/routes/{api-search,api-auth,api-files,api-mutations,health}.ts`: bounded resource endpoints.
- `migrations/*.sql`, `scripts/{seed,fixtures,local-db,deploy,smoke,benchmark}.ts`: schema, repeatable owned data and operations.
- `tests/{search,permissions,uploads,competition}.test.ts`, `tests/e2e/*.spec.ts`: meaningful domain/runtime/browser verification.
- `docs/{feature-parity,operations,verification,asset-provenance}.md`: evidence, setup/deployment/recovery and actual results.

Shared types: `AppEnv` binds `DB: D1Database`, `FILES: R2Bucket`, `ASSETS: Fetcher` and secret/config values; `Viewer` is `{ userId: string; composerId: string | null; role: 'composer' | 'admin' } | null`; `CatalogQuery` is `{ q: string; tag?: string; type?: string; page: number; seed: string }`; `CatalogPage` is `{ items: ArrangementSummary[]; total: number; page: number; pages: number; facets: Facet[]; suggestions: Suggestion[] }`. Server services accept `env` and request/viewer explicitly. No mutable module-level request state.

## Task 1: Runtime, schema and feasibility foundations

**Files:** package/config files; `workers/app.ts`; `app/lib/types.server.ts`; `migrations/0001.sql`; `scripts/local-db.ts`; `docs/feature-parity.md`; `tests/foundations.test.ts`.

**Interfaces:** Produce `getDb(env: AppEnv): D1Database`, `getViewer(request: Request, env: AppEnv): Promise<Viewer>`, schema and generated binding types. Health returns minimal availability, readiness checks the database.

- [ ] Record route/action inventory from the upstream application and relevant inherited code; classify inactive commerce and operational replacements explicitly.
- [ ] Add foundation tests: migrations create all required entities/FTS; seed visibility excludes drafts; health does not reveal secrets.
- [ ] Run the test before implementation and confirm the expected missing-module/schema failure.
- [ ] Install pinned compatible tooling, create cf/Vite/React Router configuration with observability, and implement schema/emulated bindings.
- [ ] Validate secure auth hashing and supported browser media libraries in the actual runtime; record free-CPU/media limitations without reducing security or file sizes. Escalate material paid architecture changes only with measured evidence.
- [ ] Run `npm run check`, `npm test -- foundations`, `npm run build`; inspect the built Worker and initial SSR response. Commit verified foundations.

## Task 2: Owned fixtures and authoritative catalog services

**Files:** `app/lib/db.server.ts`, `app/lib/search.server.ts`, `scripts/seed.ts`, `scripts/fixtures.ts`, `migrations/*`, `tests/search.test.ts`, `docs/asset-provenance.md`.

**Interfaces:** Produce `queryCatalog(env: AppEnv, query: CatalogQuery): Promise<CatalogPage>`, `getArrangement(env, code): Promise<ArrangementDetail | null>`, `reindexArrangement(env, id): Promise<void>` and seed/fixture commands.

- [ ] Write search assertions for exact-title ranking, O/Oh and punctuation normalization, all-word cross-field matching, grouped filters, Unicode, empty/invalid text, 48-item pagination and unavailable-record isolation.
- [ ] Confirm tests fail, then implement normalized FTS documents, parameterized queries and mutation-driven indexing.
- [ ] Create 36 clearly labeled fictional arrangements/composers, hierarchy, varied formats/comments/contests/pages and original PDF/audio/image fixtures; preserve provenance. Generate a separate 10,000-row benchmark dataset.
- [ ] Run search tests against emulated SQL and verify seed re-runs are idempotent. Commit.

## Task 3: Faithful public interface and live search

**Files:** public route modules, components, styles, `app/routes/api-search.ts`, `tests/e2e/discovery.spec.ts`.

**Interfaces:** Loaders consume catalog services; search endpoint returns `CatalogPage`; `SearchBox` maintains immediate input and debounced URL/results state.

- [ ] Write browser flows for category → filtered results → song → back, fast typing/IME, Enter, failed requests, deep links and anonymous bookmarks; assert actual visible results and restored query/filter/page/scroll.
- [ ] Confirm the initial failure, then implement source-shaped header/category/sidebar/list/footer, responsive reflow, homepage discovery, composer pages, score/audio/download/source/related links and anonymous bookmark persistence.
- [ ] Implement abort/request-identity search protection, polite status, keyboard focus preservation, exact-tag suggestions and explicit-submit behavior. Keep result pages bounded and grouping stable.
- [ ] Exercise keyboard, mobile and desktop flows with Playwright; inspect screenshots rather than relying only on DOM assertions. Commit.

## Task 4: Accounts, private outbox and authorization

**Files:** `app/lib/auth.server.ts`, `app/lib/security.server.ts`, `app/lib/mail.server.ts`, account routes, `tests/permissions.test.ts`, `tests/e2e/accounts.spec.ts`.

**Interfaces:** Produce `requireViewer(request, env): Promise<NonNullable<Viewer>>`, `requireAdmin(request, env)`, `assertOwns(viewer, composerId): void`, `enqueueMail(env, mail): Promise<string>`. Auth handles username registration/login/logout/password changes/reset.

- [ ] Write failures for cross-composer access, existing-name takeover, forged mutation origins, reset-token reuse/expiry and public outbox access; account recovery follows captured mail through a private test harness only.
- [ ] Implement maintained auth adapter with secure credentials/cookies, new-composer role assignment, administrative existing-name linking, rate limits and server-side checks.
- [ ] Implement persisted captured-mail statuses and private administrative outbox; never claim delivery. No live recipients or reusable public administrator secret.
- [ ] Run permission/runtime/account browser tests and measure deployed-compatible auth CPU. Commit.

## Task 5: Composer editor and recoverable file pipeline

**Files:** editor routes, `app/lib/storage.server.ts`, media client workers, file resource endpoints, `tests/uploads.test.ts`, `tests/e2e/editor.spec.ts`.

**Interfaces:** Produce `reserveUpload(env, viewer, input): Promise<UploadTicket>`, `finalizeUpload(env, viewer, ticketId): Promise<FileRecord>`, `saveArrangement(env, viewer, input): Promise<{id:string;code:string}>`; file metadata includes staging/published/failed state and provenance.

- [ ] Pin failures for 120 MiB/10 MiB limits, quota races, duplicate finalization, wrong ownership, MIME mismatch, interrupted uploads and shared-reference deletion.
- [ ] Implement familiar originals/arrangements/tag/image/file forms, persistence, code generation/aliases, owner edits/deletes and reindexing.
- [ ] Implement short-lived scoped direct/staged transfers, streamed validation and atomic quota accounting; prevent public access before finalization. Serve download/range/print with safe metadata and logical counters.
- [ ] Implement lazy PDF.js page processing/enlargement, optional WAV/AAC conversion with ffmpeg.wasm, progress/cancel/retry and persisted recovery. Verify representative scanned/multi-page, boundary-size and mobile failure cases; implement administrator regeneration and safe administrator-only remote import.
- [ ] Run domain and browser file flows, including failures, and inspect resulting D1/R2 state. Resolve feasibility gates before claiming parity. Commit.

## Task 6: Comments, competitions and statistics

**Files:** competition/comment routes/services, `app/lib/competition.server.ts`, statistic services, `tests/competition.test.ts`, `tests/e2e/community.spec.ts`.

**Interfaces:** Produce `submitComment(env, request, input)`, `submitVote(env, request, input)`, `competitionResults(env, competitionId, now): Promise<Results>` and privacy-safe composer statistics.

- [ ] Write fixed-clock tests for pre/open/closed states, one vote per scoped household/session/account, the source rating/80-character peer rule/4.0 threshold, post-close feedback, hidden feedback/email and replayed submissions.
- [ ] Implement transactional validation and aggregates, private feedback notifications, public constructive comments and existing badges/results/list behavior.
- [ ] Track views/downloads/referrals without inflating range requests; expose composer totals and private captured statistics messages.
- [ ] Verify real browser submissions and direct authorization failures; commit.

## Task 7: Administration, content and compatibility coverage

**Files:** admin/content/resource routes, diagnostics/maintenance services, source alias registry, `tests/e2e/admin.spec.ts`, `docs/feature-parity.md`.

**Interfaces:** Admin mutations use the same catalog/file/mail services and require administrator access; each mutation appends an audit event.

- [ ] Test administrator-only catalog/category/order/user-role/content/FAQ/preference/file operations, composer duplication/new-same-author, diagnostics/regeneration and outbox/statistics/announcement composition.
- [ ] Implement source-defined tag propagation, rights warnings, duplicate/missing-data checks, content sections and supporting pages. Keep operational work bounded/idempotent and inaccessible publicly.
- [ ] Implement documented public aliases, source slug normalization and bounded YouTube skip/mute utility. Verify no generic controller dispatch or open redirect.
- [ ] Reconcile every parity row with working behavior/test evidence; mark explicit preview exceptions honestly. Run the relevant browser suite and commit.

## Task 8: Deployment, accessibility, performance and handoff

**Files:** `scripts/deploy.ts`, `scripts/smoke.ts`, `scripts/benchmark.ts`, CI, README, operations/verification reports, remaining browser/accessibility tests.

**Interfaces:** Deployment builds a versioned Worker, applies migrations/seeds only to its isolated preview D1, uploads owned assets and binds R2. It never upgrades the account or changes the original domain.

- [ ] Add replayable install/dev/migrate/seed/check/test/build/deploy/smoke commands, secret examples, administrator bootstrap, rollback and D1/R2 export/restore instructions; demonstrate sample-data recovery.
- [ ] Run unit/runtime and end-to-end suites, typecheck/build, mobile keyboard/zoom/reflow checks and automated accessibility. Inspect screenshots and check links/headers/noindex/private response caching.
- [ ] Benchmark the 10,000-row catalog at 10 concurrent readers; record p95 API latency against 500 ms, visible search against 1 second including debounce, representative mobile LCP 2.5 s/CLS 0.1 and ordinary interaction 200 ms. Record misses rather than invent results.
- [ ] Provision isolated free-tier resources through the existing authorized Cloudflare connection; deploy and test public HTTPS plus persisted account/bookmark/editor/community/admin operations. Configure quotas, not a pretend billing hard cap.
- [ ] Obtain a fresh whole-branch reviewer, resolve actionable findings, rerun affected checks, update verification/parity records and commit.
- [ ] Deliver the tested public preview link, concise setup/operational notes and any materially unresolved limits. Do not mark the full request complete while a required flow or deploy step remains unhandled.

## Self-review

The eight tasks cover the approved spec's public, composer, admin, data/media, communications and operational subsystems in dependency order. Shared query/viewer/service types are defined above and used consistently. Each Review Focus item has a corresponding task-level failure test. Fixture generation belongs with catalog delivery; configuration belongs with the runtime it enables. The plan is shorter than the design and leaves implementation bodies to the builder.
