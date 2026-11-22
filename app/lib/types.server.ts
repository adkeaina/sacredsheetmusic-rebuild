import type { InferEnv } from 'cf/config';
import type config from '../../cloudflare.config';
export type AppEnv = InferEnv<typeof config.worker>;
export type Viewer = { userId: string; composerId: string | null; role: 'composer' | 'admin'; name: string } | null;
export type CatalogQuery = { q: string; tag?: string; type?: string; page: number; seed: string };
export type ArrangementSummary = { id: string; code: string; title: string; composer_id: string; composer: string; composer_slug: string; voicing: string; difficulty: string; description: string; original: number; winner: number; created_at: number; thumbnail: string; rating: number | null; tags: string };
export type Facet = { name: string; slug: string; type: string; count: number };
export type Suggestion = { name: string; href: string };
export type CatalogPage = { items: ArrangementSummary[]; total: number; page: number; pages: number; facets: Facet[]; suggestions: Suggestion[] };
declare module 'react-router' { interface AppLoadContext { cloudflare: { env: AppEnv; ctx: ExecutionContext } } }
