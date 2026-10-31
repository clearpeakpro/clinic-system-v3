import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Cifrado de campos en la aplicación (ADR 0026; T-012). Hoy solo los detalles
// del referido del paciente; después, el número de miembro del seguro, la
// identificación y las notas de cobertura. La interfaz es asíncrona para que
// la implementación con AWS KMS (fase 4) entre sin cambiar a quien la usa. En
// desarrollo y pruebas se usa la local, con FIELD_ENCRYPTION_KEY.
//
// Cada valor va atado a su organización, tabla, columna y fila (AAD): no se
// puede copiar a otra fila u organización sin que falle al descifrar. Los
// valores cifrados nunca se escriben en logs ni en la auditoría.

/** Dónde vive el valor: forma parte del AAD. */
export interface FieldContext {
  organizationId: string;
  table: string;
  column: string;
  recordId: string;
}

export interface FieldCipher {
  encrypt(plaintext: string, context: FieldContext): Promise<string>;
  decrypt(sealed: string, context: FieldContext): Promise<string>;
}

/** Prefijo de los valores de la implementación local: versión y proveedor de la clave. */
const LOCAL_PREFIX = 'v1:local:';

const aad = (c: FieldContext) => Buffer.from(`${c.organizationId}:${c.table}:${c.column}:${c.recordId}`);

/** Implementación local, AES-256-GCM: «v1:local:<iv>.<tag>.<cifrado>» en base64url. */
export function createLocalFieldCipher(secret: string): FieldCipher {
  if (secret.length < 32) throw new Error('FIELD_ENCRYPTION_KEY debe tener al menos 32 caracteres');
  const key = createHash('sha256').update(`clinic-field-v1:${secret}`).digest();
  return {
    encrypt(plaintext, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(aad(context));
      const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return Promise.resolve(`${LOCAL_PREFIX}${[iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')}`);
    },
    decrypt(sealed, context) {
      if (!sealed.startsWith(LOCAL_PREFIX)) return Promise.reject(new Error('valor cifrado con formato desconocido'));
      const [iv, tag, data, ...rest] = sealed.slice(LOCAL_PREFIX.length).split('.');
      if (!iv || !tag || data === undefined || rest.length > 0) return Promise.reject(new Error('valor cifrado con formato desconocido'));
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        decipher.setAAD(aad(context));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Promise.resolve(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'));
      } catch {
        // Sin detalles: el mensaje nunca lleva el valor.
        return Promise.reject(new Error('no se pudo descifrar el valor'));
      }
    },
  };
}
