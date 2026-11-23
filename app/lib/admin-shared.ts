export const adminAreas = [
  'catalog',
  'tags',
  'composers',
  'users',
  'pages',
  'preferences',
  'files',
  'contacts',
  'competitions',
  'diagnostics',
  'messages',
  'audit',
] as const;
export type AdminArea = (typeof adminAreas)[number];
export const fields: Record<string, string[]> = {
  catalog: ['title', 'available_at', 'published', 'winner'],
  tags: ['name', 'slug', 'type', 'parent_id', 'rank', 'description', 'rights_warning'],
  composers: ['name', 'slug', 'bio', 'website', 'contact_url', 'private_email', 'notice'],
  users: ['name', 'role', 'disabled'],
  pages: ['slug', 'title', 'body', 'section', 'rank', 'published'],
  preferences: ['key', 'value'],
  files: ['filename', 'rank'],
  contacts: ['status'],
  competitions: ['title', 'description', 'opens_at', 'closes_at', 'year'],
};
