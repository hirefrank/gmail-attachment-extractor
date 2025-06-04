import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      bindings: {
        LOG_LEVEL: 'debug',
        GOOGLE_CLIENT_ID: 'test-client-id',
        GOOGLE_CLIENT_SECRET: 'test-client-secret',
        ENVIRONMENT: 'test'
      },
      kvNamespaces: ['STORAGE'],
      // Enable file API for testing
      modules: true,
      // Set up test-specific globals
      globalAsyncIO: true,
      globalTimers: true,
      globalRandom: true
    }
  }
});