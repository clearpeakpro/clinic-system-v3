# 0030. Búsqueda de pacientes en un solo campo, duplicados y aviso del Propietario

- **Estado:** Aceptada
- **Fecha:** 2026-10-30
- **Relacionadas:** [ADR 0007](0007-busqueda-pacientes.md) (búsqueda parcial y sin tildes), [ADR 0026](0026-cifrado-campos-busqueda.md) (qué se cifra), [ADR 0027](0027-acceso-clinico-propietario-administrador.md) (el Propietario se asigna roles clínicos) y [ADR 0019](0019-operaciones-criticas.md) (códigos y outbox).
- **Implementación:** [T-012](../tasks/T-012-pacientes-busqueda-alta.md).

## Contexto

El manual (S-PAC-01) y Stitch tienen cinco campos de búsqueda: Nombre, Apellido, Fecha de nacimiento, Teléfono y Código. En recepción es más rápido escribir en un solo campo lo que se sabe del paciente. Además, al preparar T-012 había que decidir:
- cuándo un alta es un posible duplicado;
- adónde llevan los resultados antes de que exista el perfil;
- qué dice el aviso a los Administradores cuando el Propietario cambia sus roles clínicos.

## Decisión

### Búsqueda en un solo campo
**Cambio decidido frente a Stitch y al manual:** un solo campo en la pantalla Pacientes y en «Buscar pacientes» de la cabecera. El campo interpreta lo que se escribe:

| Lo que se escribe | Se busca como |
| --- | --- |
| 8 dígitos (MMDDAAAA, por ejemplo `11241985`) o una fecha con `/` o `-` (`11/24/1985`) | Fecha de nacimiento |
| 10 dígitos o formato de teléfono (`(214) 555-0142`) | Teléfono |
| `P-000123` o un texto escaneado que lo contenga | Búsqueda directa por código; lo demás se ignora |
| El resto | Palabras del nombre completo, en cualquier orden, parciales y sin tildes ni mayúsculas |

- **Combinaciones con «Y»:** «maria 11241985» busca por nombre y fecha; «lopez 2145550142», por nombre y teléfono.
- **Errores:**
  - una fecha inexistente da «Fecha no válida (use MMDDAAAA)»;
  - no se aceptan años de 2 dígitos;
  - los números de otra longitud (por ejemplo 6 dígitos) se rechazan.
- **Mínimo de 3 letras:** para no recorrer la lista completa de pacientes, una búsqueda **solo por nombre** exige al menos 3 letras en total, sin contar espacios. Con menos, dice «Escriba al menos 3 letras del nombre o use la fecha de nacimiento, el teléfono o el código.».
  - Las búsquedas por fecha, teléfono o código no tienen ese mínimo.
  - Se valida en la web y en el servidor.
- **Orden por relevancia:** primero la coincidencia exacta de fecha o código, después el nombre y, a igualdad, el más reciente.
- **Resultados:** de 20 en 20, con el total.
- **Solo al pulsar Enter o «Buscar»**, nunca en vivo.
- **Auditoría:** cada búsqueda se audita con el criterio como HMAC, nunca con sus valores.

### Posible paciente existente
- **Bloquea el alta:** misma fecha de nacimiento y nombre completo parecido (similitud de trigramas ≥ 0.6, sin tildes ni mayúsculas). Se ofrecen «Abrir existente» y «Crear de todos modos».
- **El mismo teléfono por sí solo no es un duplicado:** una familia puede compartirlo.
  - Si coincide con otro paciente de nombre distinto, el alta sigue adelante.
  - Se muestra una nota informativa que no bloquea: «Este teléfono ya está registrado en otro paciente (P-000123)».

### Perfil antes de T-013
`/app/<SEDE>/pacientes/<id>` existe desde T-012 con solo el encabezado de S-PAC-05:
- nombre, código, fecha de nacimiento · edad · teléfono, y estado;
- su lectura se audita;
- T-013 añade las pestañas.

### Aviso a los Administradores (excepción del ADR 0027)
- **Título:** «El Propietario cambió sus roles clínicos».
- **Cuerpo:** «Sedes: NOR1, NOR2. Puede revisarlo en Administración › Usuarios.».
- **Sin nombres de personas:** solo los códigos de las sedes afectadas. El detalle y el motivo quedan en la auditoría.

### Textos de privacidad
- Ningún texto de la interfaz afirma cumplimiento de HIPAA ni de otras normas. Stitch los tenía («Cumplimiento HIPAA», «Expediente protegido por norma HIPAA», «Privacidad y Seguridad HIPAA») y no se construyen.
- Donde hace falta un aviso, es neutro: «Las búsquedas y consultas de pacientes quedan registradas.».

## Consecuencias

- **El interpretador es `parsePatientQuery()`** de `packages/shared/src/patients.ts`. Lo usan la web, para avisar antes de buscar, y la API, que valida otra vez.
- **El umbral de similitud** está en `apps/api/src/patients.ts` (`DUPLICATE_SIMILARITY`). La prueba de `packages/db/test/patients.test.ts` comprueba los dos casos:
  - «Maria Lopez» frente a «María López García» lo supera;
  - una madre y su hijo, no.
- **El selector de paciente de Citas** (S-REC-12, T-015) usará el mismo campo.
