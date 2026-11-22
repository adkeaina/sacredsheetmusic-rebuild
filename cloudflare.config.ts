import { bindings, defineConfig } from 'cf/config';
export default defineConfig({
  accountId: 'd41631b94b54950fb1303d15d52f11fe',
  worker: {
    name: 'sacred-sheet-music-preview', entrypoint: './workers/app.ts',
    compatibilityDate: '2026-11-22', compatibilityFlags: ['nodejs_compat'],
    env: { DB: bindings.d1({ id: '9dfd38b2-ffb0-4e63-b509-dd3558e88ace', name: 'sacred-music-preview' }), FILES: bindings.r2({ name: 'sacred-music-preview-files' }), AUTH_SECRET: bindings.secret(), ADMIN_BOOTSTRAP_TOKEN: bindings.secret(), HOUSEHOLD_SECRET: bindings.secret(), PREVIEW_MODE: bindings.text('true') },
    observability: { enabled: true, traces: { enabled: true, headSamplingRate: 0.1 } },
  },
});
