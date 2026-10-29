// `pnpm dev`: la web arranca después de que la API responda, para que el
// proxy de Vite no registre ECONNREFUSED mientras la API compila y conecta.
// Vale cualquier respuesta HTTP (GET /api/me sin sesión da 401). Si la API no
// responde en 2 minutos, la web arranca igual y lo avisa.

import { setTimeout as sleep } from 'node:timers/promises';

const API = process.env.API_ORIGIN ?? 'http://127.0.0.1:3001';
const TIMEOUT_MS = 120_000;

const start = Date.now();
let announced = false;
for (;;) {
  const up = await fetch(`${API}/api/me`).then(
    () => true,
    () => false,
  );
  if (up) {
    if (announced) console.log('La API ya responde: arranca la web.');
    break;
  }
  if (Date.now() - start > TIMEOUT_MS) {
    console.warn(`La API (${API}) no respondió en ${String(TIMEOUT_MS / 1000)} s: la web arranca igual.`);
    break;
  }
  if (!announced) {
    console.log(`Esperando a que la API responda en ${API}…`);
    announced = true;
  }
  await sleep(500);
}
