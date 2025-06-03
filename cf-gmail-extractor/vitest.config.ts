import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      bindings: {
        LOG_LEVEL: 'debug'
      },
      kvNamespaces: ['STORAGE']
    }
  }
});