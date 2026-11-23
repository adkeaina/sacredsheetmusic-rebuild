# SDD ledger — plan: docs/superpowers/plans/2026-11-22-sacred-sheet-music-rebuild.md

Execution authorized by user: Approved now build.
Baseline: documentation-only repository, no pre-existing app or tests. Managed worktree on feat/sacred-music-rebuild.
Pre-flight: Task 1 DB/viewer types → Tasks 2–7 authoritative services; consistent. Task 2 catalog → Task 3 UI and Task 5 edits; indexing on all metadata changes required. Task 4 auth/outbox → Tasks 5–7 checks and notifications; consistent. Task 5 files → Tasks 6–8 stats/admin/smoke; finalize first, publish second.
Ruling: Use cf release-candidate tooling and the compatible Vite plugin 2 release candidate — official cf configuration requires them; application libraries remain stable — build-tool API changes are the cost if wrong.
Task 1: Ruling: Move full auth/media feasibility verification to Tasks 4–5 where the real integration exists — avoid pretending a library import proves the complete pipeline — a late feasibility finding remains a risk and will be surfaced before deployment.
Task 1: complete (commits 55a8113..71fb306, tests: npm test -- foundations →    Duration  80ms (tests 51%, import 26%, worker 12%, transform 11%))
Task 1: complete (commits 55a8113..bb1db50, tests: npm test -- foundations →    Duration  76ms (import 37%, tests 32%, transform 16%, worker 15%, environment 1%))
Task 2: complete (commits bb1db50..a6a0df4, tests: npm test →    Duration  89ms (tests 52%, import 25%, transform 14%, worker 8%))
Task 3: complete (commits a6a0df4..653a20c, tests: npm run test:e2e -- discovery.spec.ts →   4 passed (7.8s))
Task 4: complete (commits 653a20c..b1d05ba, tests: npm run test:e2e -- accounts.spec.ts →   3 passed (6.4s))
Task 5: Ruling: Implement administrator remote import and regeneration with Task 7's administration routes — they require the same administrator checks and diagnostics UI — those operations remain incomplete until Task 7.
Task 5: complete (commits b1d05ba..74a4e53, tests: npm run test:e2e -- editor.spec.ts →   3 passed (4.5s))
Task 6: complete (commits 74a4e53..6f9fb60, tests: npm run test:e2e -- community.spec.ts →   3 passed (3.2s))
Task 7: complete (commits 6f9fb60..b2252f3, tests: npm run test:e2e -- admin.spec.ts →   2 passed (6.0s))
Final review: fresh independent reviewer /root/final_review (gpt-6.2-astra) reviewed 55a8113..b2252f3. Critical notation disposition and 12 Important findings entered one consolidated RED→GREEN fix pass. Declined to judge: none.
Final: Ruling: Restrict remote imports to the preview's own hostname and explicit administrator-configured trusted hostnames — Workers fetch does not pin the separately validated DNS address, so DNS checks alone cannot prove the connection destination — additional import sources require a deliberate administrator preference.
Final: minor (deferred): Home discovery uses a fixed subset and its sample-only count wording can include user submissions.
Final: minor (deferred): Related PDF navigation can retain page/loading/error state from the preceding document; direct full-PDF access remains available.
Final: Ruling: Replace legacy administrator account destruction with audited login deactivation — it revokes access and permits deliberate profile relinking while preserving music, upload accounting, and audit references — personal-data erasure requires a separate retention workflow.

Final: Ruling: Limit administrator remote URL imports to 16 MiB on the free preview — bound request memory and CPU while retaining the 120 MiB multipart composer uploader — larger remote files require downloading and uploading through the composer editor.
Final: fixed active notation disposition and future file visibility — keeps future music private and forces notation downloads RED→GREEN, suite 42/42.
Final: fixed finalization reservation loss — retains a finalization reservation until an unreferenced completed object is reconciled RED→GREEN, suite 42/42.
Final: fixed duplicate quota releases — charges each collected object once under overlapping collectors and never deducts free fixtures RED→GREEN, suite 42/42.
Final: fixed lost PDF failure state — failed PDF processing prevents publication while retaining the score and draft RED→GREEN, suite 42/42 and browser draft recovery.
Final: fixed password session continuity — changing a password preserves the current login and revokes the other session browser test RED→GREEN, suite 42/42.
Final: fixed unsafe composer linking — links an existing unclaimed composer without stealing another account and preserves music RED→GREEN, suite 42/42.
Final: fixed composer discovery and missing search fields — composer pages use real credits and search includes hymn and collaborators RED→GREEN, suite 42/42.
Final: fixed stale taxonomy/index propagation — reconciles parent membership and all search documents in resumable batches RED→GREEN, suite 42/42.
Final: fixed stale live searches and filter clearing — discovery failure/supersession and remembered-cookie browser regressions RED→GREEN, suite 42/42.
Final: fixed partial competition feedback persistence and 4.5 rejection — rolls back feedback if its private notification cannot persist and accepts 4.5 RED→GREEN, suite 42/42.
Final: fixed untrusted import destinations — requires explicitly trusted import sources on every destination RED→GREEN, suite 42/42.
Final: fixed missing stored-object/duplicate attachment diagnostics — finds missing stored objects and duplicate attachments within a song RED→GREEN, suite 42/42.
Final: fixed unsafe legacy account removal — administrator account removal disables access while preserving catalog references RED→GREEN, suite 42/42.
Final: corrected source action inventory and concrete compatibility aliases, manually checked alongside public smoke and route-backed browser workflows.
Final: fixed observed Workers Free CPU resource failures — auth-performance regression RED→GREEN, 25 consecutive authenticated public probes returned 200 without resource errors.
Final: fixed remote final-part negative allocation — remote-transfer test RED→GREEN, owned public PDF imported and verification draft removed.
Final: fixed long search D1 LIKE-pattern failure — actual remote database query failed before correction; literal-prefix replacement and deployed long-query API returned 200 afterward.
Task 8: complete (commits b2252f3..237065d, tests: npm test →    Duration  585ms (import 53%, tests 35%, transform 8%, worker 3%))

Handoff: local browser 20/20; public browser 19 passed, 1 local-only recovery test skipped; typecheck/build passed; final public smoke passed. Public preview deployed at https://sacred-sheet-music-preview.adkeaina.workers.dev. Temporary provisioning Worker/package removed. Synthetic accounts and uploaded test objects collected; 36 sample arrangements, 7 sample/owner composers, 1 private owner, zero reserved bytes and zero tombstones remain. Branch/worktree retained.
