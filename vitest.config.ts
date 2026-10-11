import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    test: {
      projects: [
        { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
        {
          plugins: [
            cloudflareTest({
              remoteBindings: false,
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
            }),
          ],
          test: {
            name: 'integration',
            include: ['tests/integration/**/*.test.ts'],
            setupFiles: ['./tests/integration/setup.ts'],
            testTimeout: 20_000,
          },
        },
      ],
    },
  };
});
