export function timestamp(value: string) {
  const parts = value.trim().replace(',', '.').split(':');
  if (parts.length > 3 || parts.some((s) => !/^\d+(\.\d+)?$/.test(s)))
    throw new Error('Use seconds or an hours:minutes:seconds timestamp.');
  return parts.reduce((n, s) => n * 60 + Number(s), 0);
}
export function parseIntervals(value: string): number[][] {
  if (!value.trim()) return [];
  const parts = value.split(',');
  if (parts.length > 50) throw new Error('Use at most 50 intervals.');
  return parts.map((p) => {
    const pair = p.trim().split('-');
    if (pair.length !== 2) throw new Error('Use intervals such as 12-18, 30-42.');
    const a = timestamp(pair[0]),
      b = timestamp(pair[1]);
    if (a >= b || b > 86400)
      throw new Error('Each interval must end after it starts and within 24 hours.');
    return [a, b];
  });
}
export function legacyIntervals(params: URLSearchParams, kind: string) {
  const starts = params.getAll(kind + '_start'),
    ends = params.getAll(kind + '_end');
  if (starts.length !== ends.length || starts.length > 50) return '';
  return starts.map((s, i) => timestamp(s) + '-' + timestamp(ends[i])).join(', ');
}
