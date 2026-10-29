import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/schema.ts', './src/auth-schema.ts', './src/identity-schema.ts', './src/ops-schema.ts'],
  out: './migrations',
  migrations: { schema: 'drizzle' },
});
