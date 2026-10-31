import { describe, expect, it } from 'vitest';
import { notificationText } from '../src/notifications.ts';
import {
  ageLabel,
  ageOn,
  canSchedule,
  createPatientSchema,
  formatPhone,
  normalizePatientCode,
  PATIENT_QUERY_ERRORS,
  parsePatientQuery,
  patientStatusChangeSchema,
  updatePatientSchema,
} from '../src/patients.ts';
import { permissionsFor } from '../src/permissions.ts';

// T-012 (ADR 0030): la búsqueda de pacientes en un solo campo. Datos ficticios.

const ok = (text: string) => {
  const parsed = parsePatientQuery(text);
  if (!parsed.ok) throw new Error(`«${text}» dio ${parsed.error}`);
  return parsed.query;
};
const error = (text: string) => {
  const parsed = parsePatientQuery(text);
  return parsed.ok ? null : parsed.error;
};

describe('búsqueda de pacientes en un solo campo', () => {
  it('8 dígitos MMDDAAAA o una fecha con / o - son la fecha de nacimiento', () => {
    for (const text of ['11241985', '11/24/1985', '11-24-1985', '1/5/1985']) {
      expect(ok(text).birthDate, text).toBe(text === '1/5/1985' ? '1985-01-05' : '1985-11-24');
    }
    expect(ok('02292000').birthDate).toBe('2000-02-29');
  });

  it('una fecha que no existe o con año de 2 dígitos se rechaza', () => {
    for (const text of ['02301985', '13011985', '02291999', '11/24/85', '11-24-85', '00001985', '01011899']) {
      expect(error(text), text).toBe('invalid_date');
    }
    expect(PATIENT_QUERY_ERRORS.invalid_date).toBe('Fecha no válida (use MMDDAAAA)');
  });

  it('otros números (por ejemplo 6 dígitos) se rechazan con un mensaje claro', () => {
    for (const text of ['123456', 'maria 123', '214555']) expect(error(text), text).toBe('invalid_number');
  });

  it('10 dígitos o formato de teléfono son el teléfono', () => {
    for (const text of ['2145550101', '(214) 555-0101', '214-555-0101', '214.555.0101', '+1 214 555 0101', '1-214-555-0101']) {
      expect(ok(text), text).toEqual({ phone: '2145550101', words: [] });
    }
  });

  it('el código o un texto escaneado que lo contenga es búsqueda directa', () => {
    expect(ok('P-000123')).toEqual({ code: 'P-000123', words: [] });
    expect(ok('p-123')).toEqual({ code: 'P-000123', words: [] });
    expect(ok('P000123')).toEqual({ code: 'P-000123', words: [] });
    // La etiqueta escaneada: el código manda sobre lo demás.
    expect(ok('CLINICA|P-000042|11241985')).toEqual({ code: 'P-000042', words: [] });
    expect(normalizePatientCode('Pedro')).toBeNull();
  });

  it('el resto son palabras del nombre, en cualquier orden', () => {
    expect(ok('maria lop')).toEqual({ words: ['maria', 'lop'] });
    expect(ok('  López   MARÍA ')).toEqual({ words: ['López', 'MARÍA'] });
  });

  it('combinaciones: nombre y fecha, nombre y teléfono', () => {
    expect(ok('maria 11241985')).toEqual({ birthDate: '1985-11-24', words: ['maria'] });
    expect(ok('lopez 2145550142')).toEqual({ phone: '2145550142', words: ['lopez'] });
    expect(ok('lopez (214) 555-0142 11/24/1985')).toEqual({ phone: '2145550142', birthDate: '1985-11-24', words: ['lopez'] });
    expect(error('11241985 11251985')).toBe('repeated');
  });

  it('solo por nombre exige al menos 3 letras en total, sin contar espacios', () => {
    for (const text of ['m', 'ma', 'a b', 'á  é']) expect(error(text), text).toBe('name_too_short');
    for (const text of ['mar', 'a bc', 'ana']) expect(ok(text).words.length, text).toBeGreaterThan(0);
    expect(PATIENT_QUERY_ERRORS.name_too_short).toBe(
      'Escriba al menos 3 letras del nombre o use la fecha de nacimiento, el teléfono o el código.',
    );
    // Con fecha, teléfono o código no hay mínimo.
    expect(ok('m 11241985')).toEqual({ birthDate: '1985-11-24', words: ['m'] });
    expect(ok('a 2145550142')).toEqual({ phone: '2145550142', words: ['a'] });
    expect(ok('P-1')).toEqual({ code: 'P-000001', words: [] });
  });

  it('vacío no busca', () => {
    expect(error('   ')).toBe('empty');
    expect(error('¿?')).toBe('empty');
  });
});

describe('alta de paciente', () => {
  const base = { firstName: ' María  ', lastName: 'López  García', birthDate: '1985-02-03', phone: '(214) 555-0101', referralSourceId: null, referralDetails: null };

  it('recorta los nombres y deja el teléfono en dígitos', () => {
    expect(createPatientSchema.parse(base)).toMatchObject({ firstName: 'María', lastName: 'López García', phone: '2145550101', forceCreate: false });
  });

  it('rechaza un teléfono corto, nombres vacíos o largos y detalles sin fuente', () => {
    expect(createPatientSchema.safeParse({ ...base, phone: '555-01' }).success).toBe(false);
    expect(createPatientSchema.safeParse({ ...base, firstName: '  ' }).success).toBe(false);
    expect(createPatientSchema.safeParse({ ...base, lastName: 'x'.repeat(101) }).success).toBe(false);
    expect(createPatientSchema.safeParse({ ...base, referralDetails: 'Por una vecina' }).success).toBe(false);
  });
});

describe('formatos', () => {
  it('teléfono y edad', () => {
    expect(formatPhone('2145550101')).toBe('(214) 555-0101');
    expect(formatPhone('12145550101')).toBe('+1 (214) 555-0101');
    expect(formatPhone('5550101')).toBe('5550101');
    expect(ageOn('1985-02-03', '2026-02-02')).toBe(40);
    expect(ageOn('1985-02-03', '2026-02-03')).toBe(41);
    expect(ageLabel(1)).toBe('1 año');
    expect(ageLabel(41)).toBe('41 años');
  });
});

describe('permisos y aviso (T-012)', () => {
  it('solo Recepción crea; Propietario y Administrador siguen sin permisos clínicos', () => {
    expect(permissionsFor(['recepcion']).has('patients.create')).toBe(true);
    for (const role of ['enfermeria', 'proveedor', 'propietario', 'administrador'] as const) {
      expect(permissionsFor([role]).has('patients.create'), role).toBe(false);
    }
    expect(permissionsFor(['propietario', 'administrador']).has('patients.access')).toBe(false);
  });

  it('el aviso a los Administradores lleva las sedes y no nombres', () => {
    expect(notificationText('membership.owner_clinical_roles', 'NOR1, NOR2')).toEqual({
      title: 'El Propietario cambió sus roles clínicos',
      body: 'Sedes: NOR1, NOR2. Puede revisarlo en Administración › Usuarios.',
    });
  });
});

describe('editar, inactivar y reactivar (T-013)', () => {
  it('quién edita qué', () => {
    expect(permissionsFor(['recepcion']).has('patients.edit')).toBe(true);
    expect(permissionsFor(['proveedor']).has('patients.edit')).toBe(false);
    expect(permissionsFor(['proveedor']).has('patients.edit_phone')).toBe(true);
    for (const role of ['enfermeria', 'proveedor', 'recepcion'] as const) {
      expect(permissionsFor([role]).has('patients.edit_birth_date'), role).toBe(false);
      expect(permissionsFor([role]).has('patients.deactivate'), role).toBe(false);
    }
    for (const role of ['propietario', 'administrador'] as const) {
      expect(permissionsFor([role, 'recepcion']).has('patients.edit_birth_date'), role).toBe(true);
      expect(permissionsFor([role, 'recepcion']).has('patients.deactivate'), role).toBe(true);
    }
  });

  it('la fecha de nacimiento exige motivo', () => {
    expect(updatePatientSchema.safeParse({ expectedVersion: 1, birthDate: '1985-02-03' }).success).toBe(false);
    expect(updatePatientSchema.safeParse({ expectedVersion: 1, birthDate: '1985-02-03', birthDateReason: '  ' }).success).toBe(false);
    expect(updatePatientSchema.safeParse({ expectedVersion: 1, birthDate: '1985-02-03', birthDateReason: 'Error de captura' }).success).toBe(true);
  });

  it('sin fuente de referido, los detalles se borran; el teléfono queda en dígitos', () => {
    const parsed = updatePatientSchema.parse({ expectedVersion: 2, phone: '(214) 555-0199', referral: { sourceId: null, details: 'Volante' } });
    expect(parsed.phone).toBe('2145550199');
    expect(parsed.referral).toEqual({ sourceId: null, details: null });
    expect(updatePatientSchema.parse({ expectedVersion: 2, phone: null }).phone).toBeNull();
    expect(updatePatientSchema.safeParse({ expectedVersion: 2, phone: '123' }).success).toBe(false);
  });

  it('inactivar y reactivar exigen motivo; solo se agenda a pacientes activos', () => {
    expect(patientStatusChangeSchema.safeParse({ expectedVersion: 1, reason: '' }).success).toBe(false);
    expect(patientStatusChangeSchema.safeParse({ expectedVersion: 1, reason: 'Registro duplicado' }).success).toBe(true);
    expect(canSchedule({ status: 'active' })).toBe(true);
    expect(canSchedule({ status: 'inactive' })).toBe(false);
  });
});
