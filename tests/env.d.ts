import type { D1Migration } from 'cloudflare:test';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends CloudflareBindings {
    TEST_MARKER?: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
