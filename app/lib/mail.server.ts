import { run, type DbEnv } from './db.server';
export type MailInput = {
  userId?: string;
  recipient: string;
  subject: string;
  body: string;
  kind?: string;
  expiresAt?: number;
};
export async function enqueueMail(env: DbEnv, input: MailInput) {
  const id = crypto.randomUUID();
  await run(
    env,
    'INSERT INTO mail_outbox(id,user_id,recipient,subject,body,kind,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',
    [
      id,
      input.userId || null,
      input.recipient,
      input.subject,
      input.body,
      input.kind || 'transactional',
      'captured',
      Date.now(),
      input.expiresAt || null,
    ],
  );
  return id;
}
