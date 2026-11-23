import { first, rows, run, visible, summarySelect, type DbEnv } from './db.server';
import { mailStatement } from './mail.server';
async function publicItem(env: DbEnv, id: string) {
  const item = await first<{
    id: string;
    title: string;
    code: string;
    private_email: string;
    user_id: string | null;
  }>(
    env,
    `SELECT a.id,a.title,a.code,c.private_email,c.user_id FROM arrangements a JOIN composers c ON c.id=a.composer_id WHERE a.id=? AND ${visible}`,
    [id, Date.now()],
  );
  if (!item) throw new Error('This arrangement is unavailable.');
  return item;
}
export async function addComment(
  env: DbEnv,
  input: {
    arrangementId: string;
    name: string;
    email: string;
    text: string;
    rating: number | null;
    difficulty: number | null;
    userId?: string | null;
  },
) {
  const item = await publicItem(env, input.arrangementId);
  const name = input.name.trim().slice(0, 100);
  const text = input.text.trim();
  if (!name || text.length < 3 || text.length > 10000)
    throw new Error(
      'Please include your name and a constructive comment between 3 and 10,000 characters.',
    );
  for (const n of [input.rating, input.difficulty])
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 5))
      throw new Error('Ratings must be between 1 and 5.');
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    throw new Error('Please enter a valid email address.');
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify([item.id, name, input.email, text, input.rating, input.difficulty]),
    ),
  );
  const dedupe = Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, '0')).join('');
  const statement = env.DB.prepare(
    'INSERT OR IGNORE INTO comments(id,arrangement_id,user_id,name,email,text,rating,difficulty,created_at,dedupe_key) VALUES(?,?,?,?,?,?,?,?,?,?)',
  ).bind(
    crypto.randomUUID(),
    item.id,
    input.userId || null,
    name,
    input.email.slice(0, 254),
    text,
    input.rating,
    input.difficulty,
    Date.now(),
    dedupe,
  );
  const mail = mailStatement(
    env,
    {
      userId: item.user_id || undefined,
      recipient: item.private_email || 'administrator@example.invalid',
      subject: 'Comment on ' + item.title,
      body:
        name +
        ' wrote:\n' +
        text +
        '\nRating: ' +
        (input.rating ?? 'none') +
        '\nReply address: ' +
        input.email,
    },
    true,
  );
  await env.DB.batch([statement, mail.statement]);
  return item;
}
export type VoteInput = {
  competitionId: string;
  arrangementId: string;
  household: string;
  session: string;
  userId: string | null;
  rating: number | null;
  feedback: string;
};
export async function addVote(env: DbEnv, input: VoteInput, now = Date.now()) {
  const contest = await first<{ opens_at: number; closes_at: number }>(
    env,
    'SELECT opens_at,closes_at FROM competitions WHERE id=?',
    [input.competitionId],
  );
  if (!contest || now < contest.opens_at) throw new Error('This competition has not opened.');
  const entry = await first(
    env,
    'SELECT 1 FROM competition_entries WHERE competition_id=? AND arrangement_id=?',
    [input.competitionId, input.arrangementId],
  );
  if (!entry) throw new Error('This song is not entered in that competition.');
  const item = await publicItem(env, input.arrangementId);
  if (input.rating !== null && ![1, 2, 3, 4, 4.5, 5].includes(input.rating))
    throw new Error('Choose a rating from 1 to 5.');
  if (
    input.feedback.length > 10000 ||
    (!input.rating && !input.feedback.trim()) ||
    (input.userId && !input.feedback.trim())
  )
    throw new Error('Please include constructive feedback.');
  const id = crypto.randomUUID();
  const statement = env.DB.prepare(
    'INSERT INTO votes(id,competition_id,arrangement_id,household_key,session_id,user_id,rating,feedback,created_at,counts) VALUES(?,?,?,?,?,?,?,?,?,?)',
  ).bind(
    id,
    input.competitionId,
    input.arrangementId,
    input.household,
    input.session,
    input.userId,
    input.rating,
    input.feedback.trim(),
    now,
    now < contest.closes_at ? 1 : 0,
  );
  const mail = mailStatement(env, {
    userId: item.user_id || undefined,
    recipient: item.private_email || 'administrator@example.invalid',
    subject: 'Private competition feedback: ' + item.title,
    body:
      (now >= contest.closes_at ? 'Post-close feedback (does not affect standings).\n' : '') +
      input.feedback +
      '\nRating: ' +
      (input.rating ?? 'none'),
  });
  try {
    await env.DB.batch([statement, mail.statement]);
  } catch (error) {
    if (String(error).includes('UNIQUE'))
      throw new Error(
        'You or someone in your household already reviewed this song in this competition.',
      );
    throw error;
  }
  return { counts: now < contest.closes_at };
}
export type Standing = {
  id: string;
  code: string;
  title: string;
  composer: string;
  points: number;
  peer_average: number;
  peer_count: number;
};
export async function competitionResults(env: DbEnv, id: string) {
  return rows<Standing>(
    env,
    `SELECT a.id,a.code,a.title,c.name composer,COALESCE(sum(CASE WHEN v.counts=1 AND v.rating IS NOT NULL THEN v.rating END),0) points,COALESCE(avg(CASE WHEN v.counts=1 AND v.rating IS NOT NULL AND (length(v.feedback)>80 OR v.user_id IS NOT NULL) THEN v.rating END),0) peer_average,count(CASE WHEN v.counts=1 AND v.rating IS NOT NULL AND (length(v.feedback)>80 OR v.user_id IS NOT NULL) THEN 1 END) peer_count FROM competition_entries e JOIN arrangements a ON a.id=e.arrangement_id JOIN composers c ON c.id=a.composer_id LEFT JOIN votes v ON v.competition_id=e.competition_id AND v.arrangement_id=a.id JOIN competitions co ON co.id=e.competition_id WHERE e.competition_id=? AND a.published=1 AND a.available_at<=? GROUP BY a.id ORDER BY points DESC,a.title`,
    [id, Date.now()],
  );
}
export async function recordEvent(
  env: DbEnv,
  id: string,
  kind: 'view' | 'download' | 'referral',
  visitor: string,
  now = Date.now(),
) {
  const event = [id, kind, visitor, Math.floor(now / 1800000)].join(':');
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO counted_events(event_key,expires_at) VALUES(?,?)').bind(
      event,
      now + 3600000,
    ),
    env.DB.prepare(
      'INSERT INTO stats(arrangement_id,kind,count) SELECT ?,?,1 WHERE changes()=1 ON CONFLICT(arrangement_id,kind) DO UPDATE SET count=count+1',
    ).bind(id, kind),
  ]);
}
