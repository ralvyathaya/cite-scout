import { writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import { geoAnalysisSchema } from '../src/shared/geo-analysis';
mkdirSync('docs/schemas', { recursive: true });
writeFileSync(
  'docs/schemas/geo-analysis.schema.json',
  `${JSON.stringify(z.toJSONSchema(geoAnalysisSchema), null, 2)}\n`,
);
