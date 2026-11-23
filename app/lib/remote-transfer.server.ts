import { PART_SIZE } from './storage.server';
export function nextBufferSize(size: number, part: number) {
  return Math.min(PART_SIZE, Math.max(0, size - (part - 1) * PART_SIZE));
}
export function validateRemoteSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 16 * 1024 * 1024)
    throw new Error(
      'Remote imports support files up to 16 MiB in this preview. Download larger files and use the composer uploader (up to 120 MiB).',
    );
}
