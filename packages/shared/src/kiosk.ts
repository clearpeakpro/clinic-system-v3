import { z } from 'zod';
import { phoneDigits } from './patients.ts';

// Kiosco de autorregistro (T-020; docs/manual/11_kiosco.md, ADR 0014 y 0031).
// El mismo esquema valida en la tableta y en el servidor. Los textos (español
// e inglés) viven en la web: aquí solo hay claves de error.

/** «¿A qué viene hoy?». El motivo no decide nada clínico: Recepción elige la ruta (ADR 0031). */
export const KIOSK_REASONS = ['sick', 'results', 'injection', 'other'] as const;
export type KioskReason = (typeof KIOSK_REASONS)[number];

export const KIOSK_NAME_MAX = 60;
export const KIOSK_SYMPTOMS_MAX = 500;
/** Vida del código de vinculación (Stitch S-ADM-10: «Vence en 10 minutos»). */
export const KIOSK_PAIRING_MINUTES = 10;
/** Vida del token de la tableta, renovable con el uso (ADR 0014). */
export const KIOSK_TOKEN_DAYS = 90;
/** Inactividad del formulario: aviso a los 50 s y limpieza a los 60 s. */
export const KIOSK_IDLE_SECONDS = 60;
export const KIOSK_IDLE_WARNING_SECONDS = 10;
/** Cuenta regresiva de «Listo» antes de volver al formulario. */
export const KIOSK_DONE_SECONDS = 10;

/** Código de vinculación: 6 caracteres sin los que se confunden (0/O, 1/I/L), mostrado como «K7Q-4M2». */
export const KIOSK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** «k7q 4m2», «K7Q-4M2» → «K7Q4M2»; nulo si no tiene la forma. */
export function normalizeKioskCode(text: string): string | null {
  const code = text.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== 6) return null;
  for (const c of code) if (!KIOSK_CODE_ALPHABET.includes(c)) return null;
  return code;
}

export function formatKioskCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

const name = z
  .string()
  .trim()
  .min(1, 'required')
  .max(80, 'too_long')
  .refine((v) => /\p{L}/u.test(v), 'invalid');

/** Fecha real (sin 31 de febrero), entre 1900 y hoy de la sede (`today`, aaaa-mm-dd). */
export function kioskBirthDateError(value: string, today: string): 'invalid' | 'future' | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'invalid';
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return 'invalid';
  if (value > today) return 'future';
  return null;
}

/**
 * El registro del kiosco (S-KIO-01). La fecha futura la rechaza además el
 * servidor con el día de la sede (`kioskBirthDateError`).
 */
export const kioskCheckinSchema = z.object({
  firstName: name,
  lastName: name,
  birthDate: z.string().refine((v) => kioskBirthDateError(v, '9999-12-31') === null, 'invalid'),
  phone: z
    .string()
    .transform(phoneDigits)
    .pipe(z.string().regex(/^[2-9]\d{9}$/, 'invalid')),
  firstVisit: z.boolean(),
  reason: z.enum(KIOSK_REASONS),
  symptoms: z.string().trim().max(KIOSK_SYMPTOMS_MAX, 'too_long').default(''),
});
export type KioskCheckinInput = z.input<typeof kioskCheckinSchema>;
export type KioskCheckinData = z.output<typeof kioskCheckinSchema>;

/** Vincular la tableta en `/kiosk/<SEDE>` con el código de un solo uso. */
export const kioskLinkSchema = z.object({ locationCode: z.string().trim().min(1).max(10), code: z.string().max(20) });
export type KioskLinkInput = z.input<typeof kioskLinkSchema>;

/** «Vincular kiosco» (S-ADM-10): nombre de la tableta. */
export const createKioskPairingSchema = z.object({ name: z.string().trim().min(1).max(KIOSK_NAME_MAX) });
export type CreateKioskPairingInput = z.input<typeof createKioskPairingSchema>;

/** «Generar nuevo código» o «Revocar»: con la versión leída; revocar exige motivo. */
export const regenerateKioskCodeSchema = z.object({ expectedVersion: z.number().int().min(1) });
export const revokeKioskSchema = z.object({ reason: z.string().trim().min(1).max(500), expectedVersion: z.number().int().min(1) });

export type KioskDeviceStatus = 'pending' | 'active' | 'revoked';

/** Una tableta en Sedes (S-ADM-10). Sin hashes ni tokens. */
export interface KioskDeviceView {
  id: string;
  name: string;
  status: KioskDeviceStatus;
  linkedAt: string | null;
  lastUsedAt: string | null;
  tokenExpiresAt: string | null;
  pairingExpiresAt: string | null;
  revokedAt: string | null;
  version: number;
}

/** Respuesta al generar un código: el código en claro solo aquí, una vez. */
export interface KioskPairing {
  device: KioskDeviceView;
  code: string;
  expiresAt: string;
}

/** Lo único que la tableta sabe de sí misma: su sede (código y nombre). */
export interface KioskSession {
  location: { code: string; name: string };
}

/** Respuesta al enviar: solo que se recibió. Nunca los datos enviados. */
export interface KioskCheckinReceipt {
  received: true;
}
