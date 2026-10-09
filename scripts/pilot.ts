import { readFileSync } from 'node:fs';
import { z } from 'zod';

// Emit SQL for the operator's authenticated Wrangler session; never connect implicitly.
const [command, inputPath] = process.argv.slice(2);
if (!inputPath || !['enroll', 'decision'].includes(command)) {
  throw new Error('Usage: npx tsx scripts/pilot.ts enroll|decision <private-input.json>');
}
const input: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;
const now = Date.now();
const id = quoted(crypto.randomUUID());
let output: string;
if (command === 'enroll') {
  const value = z
    .object({
      userId: z.string().min(1).max(128),
      role: z.enum(['founder', 'first_marketer']),
      manualCheckAt: z.iso.datetime(),
      authorityConfirmed: z.literal(true),
      exampleVerified: z.literal(true),
      hasThreeQuestionsAndCompetitors: z.literal(true),
      assisted: z.boolean(),
    })
    .strict()
    .parse(input);
  const checked = Date.parse(value.manualCheckAt);
  if (checked > now || checked < now - 30 * 86400000)
    throw new Error('Manual check must be within the past 30 days.');
  const user = quoted(value.userId);
  // One statement makes qualification + cohort cap atomic, including concurrent operators.
  output = `INSERT OR IGNORE INTO pilot_enrollments
    (user_id,qualified_at,manual_check_at,role,authority_confirmed,example_verified)
    SELECT id,${String(now)},${String(checked)},${quoted(value.role)},1,1 FROM users
    WHERE id=${user} AND (SELECT count(*) FROM pilot_enrollments)<10;
INSERT OR IGNORE INTO product_events
    (id,dedupe_key,name,user_id,received_at,occurred_at,source,assisted,properties_json)
    SELECT ${id},${quoted(`pilot_qualified:${value.userId}`)},'pilot_qualified',user_id,${String(now)},qualified_at,'operator',${String(Number(value.assisted))},'{"policyVersion":"pilot-v2-1"}'
    FROM pilot_enrollments WHERE user_id=${user};
SELECT user_id,trial_state,policy_version FROM pilot_enrollments WHERE user_id=${user};`;
} else {
  const value = z
    .object({
      userId: z.string().min(1).max(128),
      interviewId: z.uuid(),
      observationId: z.uuid(),
      compareToId: z.uuid().optional(),
      decision: z.enum(['investigate', 'change', 'defer', 'no_action']),
      confirmed: z.boolean(),
      assisted: z.boolean(),
      interviewedAt: z.iso.datetime(),
    })
    .strict()
    .parse(input);
  if (Date.parse(value.interviewedAt) > now) throw new Error('Interview cannot be in the future.');
  output = `INSERT OR IGNORE INTO product_events
    (id,dedupe_key,name,user_id,project_id,question_id,observation_id,compare_to_id,received_at,occurred_at,source,assisted,properties_json)
    SELECT ${id},${quoted(`decision_reported:${value.interviewId}`)},'decision_reported',p.user_id,p.id,s.prompt_id,s.id,${value.compareToId ? quoted(value.compareToId) : 'NULL'},${String(now)},${String(Date.parse(value.interviewedAt))},'operator',${String(Number(value.assisted))},${quoted(JSON.stringify({ outcome: value.decision, confirmed: value.confirmed }))}
    FROM scan_results s JOIN projects p ON p.id=s.project_id
    WHERE s.id=${quoted(value.observationId)} AND p.user_id=${quoted(value.userId)} AND s.evidence_version='v2'
    ${value.compareToId ? `AND EXISTS(SELECT 1 FROM scan_results other WHERE other.id=${quoted(value.compareToId)} AND other.project_id=p.id AND other.prompt_id=s.prompt_id)` : ''};
SELECT id,name FROM product_events WHERE dedupe_key=${quoted(`decision_reported:${value.interviewId}`)};`;
}
console.log(output);
