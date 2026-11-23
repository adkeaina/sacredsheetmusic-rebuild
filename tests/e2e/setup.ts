import { localRuntime } from '../../scripts/local-runtime';
export default async function setup() {
  if (process.env.PREVIEW_URL) return;
  const { mf, db } = await localRuntime();
  try {
    await db.prepare('DELETE FROM rate_limits').run();
  } finally {
    await mf.dispose();
  }
}
