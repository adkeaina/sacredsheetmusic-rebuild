import type { DbEnv } from './db.server';
export type MailInput = {
  userId?: string;
  recipient: string;
  subject: string;
  body: string;
  kind?: string;
  expiresAt?: number;
};
export function mailStatement(env: DbEnv, input: MailInput, ifChanged = false) {
  const id = crypto.randomUUID();
  return {
    id,
    statement: env.DB.prepare(
      'INSERT INTO mail_outbox(id,user_id,recipient,subject,body,kind,status,created_at,expires_at) ' +
        (ifChanged ? 'SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1' : 'VALUES(?,?,?,?,?,?,?,?,?)'),
    ).bind(
      id,
      input.userId || null,
      input.recipient,
      input.subject,
      input.body,
      input.kind || 'transactional',
      'captured',
      Date.now(),
      input.expiresAt || null,
    ),
  };
}
export async function enqueueMail(env: DbEnv, input: MailInput) {
  const mail = mailStatement(env, input);
  await mail.statement.run();
  return mail.id;
}
