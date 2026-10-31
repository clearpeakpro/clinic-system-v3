import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/schema.ts', './src/auth-schema.ts', './src/identity-schema.ts', './src/ops-schema.ts', './src/notifications-schema.ts', './src/catalog-schema.ts', './src/patients-schema.ts', './src/appointments-schema.ts'],
  out: './migrations',
  migrations: { schema: 'drizzle' },
});
