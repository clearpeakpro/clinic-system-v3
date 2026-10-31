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

### Búsqueda en la cabecera (cambio del 2026-10-31)
- **Campo en la cabecera:** en lugar de un botón «Buscar pacientes» que abría un panel, hay un campo con la lupa como botón integrado a la derecha. Solo lo ve quien tiene `patients.access`.
- **Mismas reglas que la pantalla Pacientes:** un solo campo, mínimo de 3 letras para el nombre y búsqueda solo con Enter o la lupa.
- **Resultados en un panel bajo el campo:**
  - hasta 8 pacientes, con código, nombre, fecha de nacimiento y edad;
  - al final, «Ver todos los resultados», que abre Pacientes con esa búsqueda, pasada en memoria y nunca en la URL;
  - elegir un paciente abre su perfil;
  - los errores de validación se muestran en el panel.
- **Código:** si se escribe o escanea un código que existe, se abre directamente el perfil.
- **El campo se vacía:** al elegir un paciente, al cerrar el panel (Esc o clic fuera), al cambiar de sede y al cerrar sesión.
- **Tamaños:**
  - escritorio: unos 360 px;
  - tableta: más estrecho, y se ensancha al enfocarlo;
  - teléfono: solo la lupa, que despliega el campo a todo el ancho de la cabecera.
- **Teclado:**
  - atajo «/» para enfocar el campo;
  - patrón combobox con lista de resultados: flechas para moverse, Enter para abrir y Esc para cerrar.

### Posible paciente existente
- **Bloquea el alta:** misma fecha de nacimiento y nombre completo parecido (similitud de trigramas ≥ 0.6, sin tildes ni mayúsculas). Se ofrecen «Abrir existente» y «Crear de todos modos».
- **El mismo teléfono por sí solo no es un duplicado:** una familia puede compartirlo.

### Teléfono compartido (cambio del 2026-10-31)
Sustituye a la nota informativa que aparecía después de crear («Paciente creado. Este teléfono ya está registrado en otro paciente (P-000123).»), que ya no se muestra.
- **Cuándo:** al pulsar «Crear», nunca mientras se escribe, si el teléfono coincide con otro paciente de la organización y **no** hay posible duplicado por nombre + fecha.
- **Diálogo informativo, de tono suave (no de error):**
  - título «Este teléfono ya está registrado en otro paciente»;
  - hasta 3 coincidencias, con código, nombre y fecha de nacimiento (nunca el teléfono);
  - «Volver y corregir»: regresa al formulario con los datos intactos y el foco en el teléfono;
  - «Crear de todos modos» (principal): crea el paciente.
- **Con posible duplicado por nombre + fecha** solo se muestra el aviso fuerte («Abrir existente» / «Crear de todos modos»). Si se fuerza desde ahí, no se pide además confirmar el teléfono.
- **API:** sin duplicado y con el teléfono en otro paciente, el alta responde 409 `phone_shared` con las coincidencias, salvo que llegue `confirmSharedPhone`. `forceCreate` (aviso fuerte) también lo acepta.
- **Auditoría, con el teléfono como HMAC y nunca en claro:**
  - `patient.phone_shared_check`: se mostró el aviso (número e ids de las coincidencias);
  - `patient.phone_shared_create_anyway`: «Crear de todos modos», con el id del paciente nuevo;
  - `patient.phone_shared_back`: «Volver y corregir» (`POST /api/patients/phone-shared/back`, permiso `patients.create`).
- **La edición del teléfono** (S-PAC-11, T-013) usará el mismo diálogo, con «Guardar de todos modos» como botón principal y «Volver y corregir» como secundario (decidido el 2026-10-31).

### Perfil antes de T-013
`/app/<SEDE>/pacientes/<id>` existe desde T-012 con solo el encabezado de S-PAC-05:
- nombre, código, fecha de nacimiento · edad · teléfono, y estado;
- su lectura se audita;
- T-013 añade las pestañas.

**Hecho en T-013 (2026-10-31):** pestañas, «Editar paciente» con el aviso del teléfono compartido («Guardar de todos modos» / «Volver y corregir»; auditoría `patient.phone_shared_check`, `patient.phone_shared_save_anyway` y `patient.phone_shared_back` con el paciente). Los pacientes inactivos no salen en la búsqueda por defecto, salvo por código o con «Incluir inactivos» ([ADR 0009](0009-editar-nacimiento-inactivar.md)).

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
- **El aviso del teléfono compartido** está en `apps/web/src/components/patients/new-patient-dialog.tsx` (`SharedPhoneDialog`). La prueba de `apps/api/test/patients.test.ts` y la E2E cubren madre e hijo con el mismo teléfono, «Volver y corregir» con el teléfono corregido, y nombre + fecha + teléfono a la vez (solo el aviso fuerte).
- **El selector de paciente de Citas** (S-REC-12, T-015) usará el mismo campo.
- **La búsqueda de la cabecera** está en `apps/web/src/components/patients/header-search.tsx`. Su E2E (`apps/web/e2e/patients.spec.ts`) cubre el panel, el teclado, el código escaneado, el campo vacío al cerrar y el teléfono, con axe.
