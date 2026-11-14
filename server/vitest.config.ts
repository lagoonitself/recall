import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests talk to Neon, whose compute may be waking from suspend; 5 s is too tight.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration suites share one test database (and the job queue), so run files one at a time.
    fileParallelism: false,
  },
});
