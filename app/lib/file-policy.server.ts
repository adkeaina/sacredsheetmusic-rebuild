export function filePolicy(
  type: string,
  published: number,
  availableAt: number,
  download: boolean,
) {
  const inline = [
    'application/pdf',
    'audio/mpeg',
    'audio/midi',
    'audio/wav',
    'audio/aac',
    'audio/mp4',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ].includes(type);
  return {
    cache:
      published === 1 && availableAt <= Date.now() ? 'public, max-age=300' : 'private, no-store',
    disposition: download || !inline ? 'attachment' : 'inline',
  };
}
