import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests talk to Neon, whose compute may be waking from suspend; 5 s is too tight.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
