# Sacred Sheet Music — independent rebuild preview

A TypeScript / React Router application on Cloudflare Workers, D1 and private R2. This project is unofficial. Its fictional catalog and original demonstration scores are not the original website's catalog. Do not import music, identities or account data without authorization.

## Local development

Requires Node 24+, npm, and Chrome or Playwright Chromium.

```sh
npm ci
cp .env.example .dev.vars
# Replace the three placeholder secrets with independent random values.
npm run db:setup
npm run seed
npm run dev
```

Open http://127.0.0.1:5173. Register a composer to try publishing music. Email is captured privately; no mail is delivered. `npm run seed` preserves existing records and provisions the owned fixtures plus the pinned FFmpeg runtime. `scripts/fixtures.ts` regenerates the owned notation/audio; it additionally needs a local ffmpeg executable.

```sh
npm run check
npm test
npx playwright install chromium  # when Chrome is unavailable
npm run test:e2e
npm run build
```

Browser tests use the local server by default. `PREVIEW_URL` selects an existing deployment. Remote account reset tests that inspect local D1 are local-only; use the private preview outbox for a remote reset. Never publish traces or browser storage state containing login/reset tokens.

## Deployment

See [operations](docs/operations.md) and [verification](docs/verification.md). Configure isolated resources in `cloudflare.config.ts`; the checked-in IDs identify this preview only. Deploy with the supported cf CLI (`npm run deploy`) after authentication, or use `npx tsx scripts/deploy.ts` with `CLOUDFLARE_API_TOKEN` scoped to Workers, D1 and R2 edits. The latter uploads a prebuilt application and never changes the account plan or original domain. It expects current migrations, seeds, file objects and secrets to be provisioned first. `npx tsx scripts/provision.ts` handles those using the same token. `npm run build` must precede deployment.

The free Workers tier, D1 and R2 allowances are suitable for a demonstration, subject to Cloudflare quotas. The app reserves at most 1 GiB of uploaded preview files globally and per composer. This is an application limit, not a billing hard cap. R2 billing details may still be required. No live bulk email or paid plan is enabled.

## Project records

- [Approved design](docs/superpowers/specs/2026-11-22-sacred-sheet-music-rebuild-design.md)
- [Repository and REA research](docs/research/2026-11-22-repository-and-rea-findings.md)
- [Feature register](docs/feature-parity.md)
- [Asset provenance](docs/asset-provenance.md)

The source site could not be loaded in the research environment. Repository-derived behavior is implemented independently; live visual and complete production-data parity cannot be asserted. Migrating the actual site requires its maintainer's database, file inventory, permissions and account recovery strategy.
