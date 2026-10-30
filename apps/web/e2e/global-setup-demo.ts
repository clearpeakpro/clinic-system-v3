import { startStack } from './global-setup.ts';

// Guion de la demo (T-010): la base de datos se prepara con pnpm demo:reset.
export default function globalSetup() {
  return startStack({ demoReset: true });
}
