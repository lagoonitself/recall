import { defineConfig, triggers } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'recall-keepalive',
    entrypoint: 'src/index.ts',
    compatibilityDate: '2025-01-01',
    triggers: [
      triggers.scheduled({
        schedule: '*/10 * * * *',
      }),
    ],
  },
});
