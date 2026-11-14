import { readFile } from 'node:fs/promises';
import { evaluatePlanEconomics } from '../src/domain/plan-economics';

const path = process.argv[2];
if (!path) throw new Error('Usage: npx tsx scripts/check-plan-economics.ts <scenario.json>');
const report = evaluatePlanEconomics(JSON.parse(await readFile(path, 'utf8')) as unknown);
console.log(JSON.stringify(report, null, 2));
if (!report.ready) process.exitCode = 1;
