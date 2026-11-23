import { it, expect } from 'vitest';
import { nextBufferSize, validateRemoteSize } from '../app/lib/remote-transfer.server';
it('finishes small and partial final remote parts without a negative allocation', () => {
  expect(nextBufferSize(4279, 1)).toBe(4279);
  expect(nextBufferSize(4279, 2)).toBe(0);
  expect(nextBufferSize(8388641, 2)).toBe(33);
  expect(nextBufferSize(8388641, 3)).toBe(0);
});
it('provides an actionable upload alternative above the free preview import budget', () => {
  expect(() => validateRemoteSize(16777216)).not.toThrow();
  expect(() => validateRemoteSize(16777217)).toThrow('composer uploader');
});
