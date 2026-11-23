import type { CatalogPage } from '../types.server';
import type { Tag } from '../db.server';
export type CachedSearch = {
  q: string;
  result: CatalogPage;
  type: string;
  tags: Tag[];
  title: string;
  current: undefined;
};
let cached: { key: string; data: CachedSearch } | null = null;
export function rememberSearch(key: string, data: CachedSearch) {
  if (typeof window !== 'undefined') cached = { key, data };
}
export function takeSearch(key: string) {
  return cached?.key === key ? cached.data : null;
}
