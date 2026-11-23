export function normalizeSearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w === 'oh' ? 'o' : w))
    .join(' ');
}
export const indexSourceSql = `SELECT a.id,a.title,a.description,a.code,a.voicing,a.hymn,c.name||' '||COALESCE((SELECT group_concat(cc.name,' ') FROM credits cr JOIN composers cc ON cc.id=cr.composer_id WHERE cr.arrangement_id=a.id),'') AS composer,COALESCE(group_concat(t.name,' '),'') AS tags FROM arrangements a JOIN composers c ON c.id=a.composer_id LEFT JOIN arrangement_tags at ON at.arrangement_id=a.id LEFT JOIN tags t ON t.id=at.tag_id`;
export type IndexSource = {
  id: string;
  title: string;
  description: string;
  code: string;
  voicing: string;
  hymn: string;
  composer: string;
  tags: string;
};
export function indexValues(a: IndexSource) {
  return [
    a.id,
    normalizeSearch(a.title),
    normalizeSearch(a.composer),
    normalizeSearch(a.tags + ' ' + a.voicing),
    normalizeSearch(a.description + ' ' + a.hymn),
    normalizeSearch(a.code),
  ];
}
