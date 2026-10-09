export interface ProductEventInput {
  name: string;
  dedupeKey: string;
  userId: string;
  projectId?: string | null;
  questionId?: string | null;
  observationId?: string | null;
  compareToId?: string | null;
  source?: 'client' | 'server' | 'operator';
  properties?: Record<string, unknown>;
  assisted?: boolean | null;
  now?: Date;
  occurredAt?: Date;
}

/** Include this statement in the same D1 batch as the domain change it describes. */
export function eventStatement(
  env: { DB: D1Database },
  input: ProductEventInput,
): D1PreparedStatement {
  const now = input.now ?? new Date();
  return env.DB.prepare(
    `INSERT OR IGNORE INTO product_events
    (id,dedupe_key,schema_version,name,user_id,project_id,question_id,observation_id,compare_to_id,
     received_at,occurred_at,source,assisted,properties_json)
    SELECT ?,?,1,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)`,
  ).bind(
    crypto.randomUUID(),
    input.dedupeKey,
    input.name,
    input.userId,
    input.projectId ?? null,
    input.questionId ?? null,
    input.observationId ?? null,
    input.compareToId ?? null,
    now.getTime(),
    (input.occurredAt ?? now).getTime(),
    input.source ?? 'server',
    input.assisted == null ? null : Number(input.assisted),
    JSON.stringify(input.properties ?? {}),
    input.userId,
  );
}
