import type { KioskReason } from '@clinic/shared';

// Catálogo de textos del kiosco (T-020; ADR 0031): español e inglés en el
// mismo sitio. Lenguaje sencillo; trato de «usted». El kiosco no menciona los
// consentimientos (se firman en papel en Recepción).

export type KioskLanguage = 'es' | 'en';

export interface KioskTexts {
  languageButton: string;
  languageButtonLabel: string;
  title: string;
  intro: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  month: string;
  day: string;
  year: string;
  months: readonly string[];
  phone: string;
  phoneHint: string;
  firstVisitQuestion: string;
  firstVisitYes: string;
  firstVisitNo: string;
  reasonQuestion: string;
  reasonHint: string;
  reasons: Record<KioskReason, { label: string; help: string }>;
  symptoms: string;
  optional: string;
  symptomsPrivacy: string;
  submit: string;
  submitting: string;
  required: string;
  errors: {
    required: string;
    name: string;
    birthDate: string;
    birthDateFuture: string;
    phone: string;
    tooLong: string;
    choose: string;
  };
  fixErrors: string;
  sendFailed: string;
  rateLimited: string;
  idleTitle: string;
  idleBody: (seconds: number) => string;
  idleContinue: string;
  doneTitle: string;
  doneBody: string;
  doneBack: (seconds: number) => string;
  doneAnother: string;
  // Tableta sin vincular.
  linkTitle: string;
  linkBody: string;
  linkCode: string;
  linkSubmit: string;
  linkInvalid: string;
  linkTooMany: string;
  unavailable: string;
  retry: string;
}

const ES: KioskTexts = {
  languageButton: 'English',
  languageButtonLabel: 'Change language to English',
  title: 'Bienvenido',
  intro: 'Regístrese aquí y tome asiento. Le llamaremos por su nombre.',
  firstName: 'Nombre',
  lastName: 'Apellidos',
  birthDate: 'Fecha de nacimiento',
  month: 'Mes',
  day: 'Día',
  year: 'Año',
  months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  phone: 'Teléfono celular',
  phoneHint: 'Para llamarle o enviarle un mensaje',
  firstVisitQuestion: '¿Es su primera vez en nuestra clínica?',
  firstVisitYes: 'Sí, primera vez',
  firstVisitNo: 'No, ya soy paciente',
  reasonQuestion: '¿A qué viene hoy?',
  reasonHint: 'Elija la opción que mejor describa su visita.',
  reasons: {
    sick: { label: 'Me siento enfermo', help: 'Fiebre, malestar, tos o dolor' },
    results: { label: 'Vengo por resultados', help: 'Revisión de análisis o laboratorio' },
    injection: { label: 'Vengo por una inyección', help: 'Vacuna o medicamento recetado' },
    other: { label: 'Otro motivo', help: 'Certificados médicos u orientación' },
  },
  symptoms: 'Describa brevemente sus síntomas',
  optional: '(opcional)',
  symptomsPrivacy: 'Lo que escriba solo lo verá el personal de la clínica.',
  submit: 'Registrarme',
  submitting: 'Enviando…',
  required: 'obligatorio',
  errors: {
    required: 'Este dato es obligatorio.',
    name: 'Escriba su nombre con letras.',
    birthDate: 'Revise la fecha de nacimiento.',
    birthDateFuture: 'La fecha de nacimiento no puede ser posterior a hoy.',
    phone: 'Ingrese un teléfono de 10 dígitos.',
    tooLong: 'El texto es demasiado largo.',
    choose: 'Elija una opción.',
  },
  fixErrors: 'Revise los datos marcados en rojo.',
  sendFailed: 'No se pudo enviar su registro. Inténtelo de nuevo o pida ayuda en Recepción.',
  rateLimited: 'Demasiados registros seguidos. Pida ayuda en Recepción.',
  idleTitle: '¿Sigue ahí?',
  idleBody: (s) => `Por su privacidad, el formulario se borrará en ${String(s)} s.`,
  idleContinue: 'Seguir aquí',
  doneTitle: '¡Gracias!',
  doneBody: 'Tome asiento. Le llamaremos por su nombre.',
  doneBack: (s) => `Volviendo al inicio en ${String(s)} s`,
  doneAnother: 'Registrar a otra persona',
  linkTitle: 'Vincular esta tableta',
  linkBody: 'Escriba el código que le dio la Administración en Sedes. Vence a los 10 minutos.',
  linkCode: 'Código de vinculación',
  linkSubmit: 'Vincular',
  linkInvalid: 'El código no es válido o ya venció. Pida uno nuevo en Sedes.',
  linkTooMany: 'Demasiados intentos. Espere unos minutos.',
  unavailable: 'El registro no está disponible. Pida ayuda en Recepción.',
  retry: 'Reintentar',
};

const EN: KioskTexts = {
  languageButton: 'Español',
  languageButtonLabel: 'Cambiar el idioma a español',
  title: 'Welcome',
  intro: 'Check in here and take a seat. We will call you by your name.',
  firstName: 'First name',
  lastName: 'Last name',
  birthDate: 'Date of birth',
  month: 'Month',
  day: 'Day',
  year: 'Year',
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  phone: 'Mobile phone',
  phoneHint: 'To call you or send you a text',
  firstVisitQuestion: 'Is this your first visit to our clinic?',
  firstVisitYes: 'Yes, first visit',
  firstVisitNo: 'No, I am a patient',
  reasonQuestion: 'Why are you here today?',
  reasonHint: 'Choose the option that best describes your visit.',
  reasons: {
    sick: { label: 'I feel sick', help: 'Fever, feeling unwell, cough or pain' },
    results: { label: 'I am here for results', help: 'Review of tests or lab work' },
    injection: { label: 'I am here for a shot', help: 'Vaccine or prescribed medication' },
    other: { label: 'Other reason', help: 'Medical certificates or guidance' },
  },
  symptoms: 'Briefly describe your symptoms',
  optional: '(optional)',
  symptomsPrivacy: 'Only clinic staff will see what you write.',
  submit: 'Check in',
  submitting: 'Sending…',
  required: 'required',
  errors: {
    required: 'This field is required.',
    name: 'Please use letters.',
    birthDate: 'Please check the date of birth.',
    birthDateFuture: 'The date of birth cannot be after today.',
    phone: 'Enter a 10-digit phone number.',
    tooLong: 'The text is too long.',
    choose: 'Please choose an option.',
  },
  fixErrors: 'Please check the fields marked in red.',
  sendFailed: 'We could not send your check-in. Please try again or ask the front desk for help.',
  rateLimited: 'Too many check-ins in a row. Please ask the front desk for help.',
  idleTitle: 'Are you still there?',
  idleBody: (s) => `For your privacy, the form will be cleared in ${String(s)} s.`,
  idleContinue: 'I am still here',
  doneTitle: 'Thank you!',
  doneBody: 'Please take a seat. We will call you by your name.',
  doneBack: (s) => `Returning to the start in ${String(s)} s`,
  doneAnother: 'Check in another person',
  linkTitle: 'Link this tablet',
  linkBody: 'Enter the code from the Locations page. It expires after 10 minutes.',
  linkCode: 'Linking code',
  linkSubmit: 'Link',
  linkInvalid: 'The code is not valid or has expired. Ask for a new one.',
  linkTooMany: 'Too many attempts. Please wait a few minutes.',
  unavailable: 'Check-in is not available. Please ask the front desk for help.',
  retry: 'Try again',
};

export const KIOSK_TEXTS: Record<KioskLanguage, KioskTexts> = { es: ES, en: EN };
