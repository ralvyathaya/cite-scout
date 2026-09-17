import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const FORBIDDEN_ARTIFACTS = ['.dev.vars', '.env', '.env.local', '.env.production'];

/**
 * The Cloudflare Vite plugin copies `.dev.vars` into the server build output.
 * Local secrets must never be copied into a deployable artifact, so remove any
 * such file from the build output and fail the build if one survives.
 */
function stripLocalSecrets(): Plugin {
  return {
    name: 'citescout:strip-local-secrets',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const outputs = ['dist/citescout', 'dist/client'];
      const survivors: string[] = [];

      for (const output of outputs) {
        const dir = resolve(process.cwd(), output);
        if (!existsSync(dir)) continue;

        for (const entry of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
          const base = entry.split(/[\\/]/u).pop() ?? '';
          const full = resolve(dir, entry);

          if (FORBIDDEN_ARTIFACTS.includes(base)) {
            rmSync(full, { force: true });
            continue;
          }

          // Defence in depth: a var file renamed by tooling would still carry secrets.
          if (base.endsWith('.vars') || base.endsWith('.dev')) survivors.push(full);
        }
      }

      if (survivors.length > 0) {
        throw new Error(
          `Refusing to build: local secret files reached the artifact: ${survivors.join(', ')}`,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), stripLocalSecrets()],
});
