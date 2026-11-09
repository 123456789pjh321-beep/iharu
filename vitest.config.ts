import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['tests/**/*.test.ts'],
  // Vercel runs this suite with Production env vars present. Integration tests
  // inject disposable databases/delivery fakes; no test may open a live runtime.
  env: { APP_DATABASE_URL: '', AUTH_DATABASE_URL: '', MIGRATION_DATABASE_URL: '',
    REALTIME_SUPABASE_URL: '', REALTIME_PUBLISHABLE_KEY: '', REALTIME_SIGNING_JWK: '',
    PUSH_VAPID_PUBLIC_KEY: '', PUSH_VAPID_PRIVATE_KEY: '', PUSH_CRON_SECRET: '',
    WORKER_DATABASE_URL: '', BETTER_AUTH_SECRET: '', APP_ORIGIN: '' },
} });

