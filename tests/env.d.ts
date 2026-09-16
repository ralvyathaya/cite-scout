declare module 'cloudflare:test' {
  interface ProvidedEnv extends CloudflareBindings {
    TEST_MARKER?: string;
  }
}
