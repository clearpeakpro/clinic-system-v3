import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Navigate, Outlet, redirect } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Frame } from './components/frame.tsx';
import { IdleGuard } from './components/idle-guard.tsx';
import { useMe } from './lib/session.ts';
import { AcceptInvitationPage } from './pages/accept-invitation.tsx';
import { AdminCatalogPage, catalogTabOf } from './pages/admin-catalog.tsx';
import { AdminLocationsPage } from './pages/admin-locations.tsx';
import { AdminUsersPage } from './pages/admin-users.tsx';
import { AppointmentsPage } from './pages/appointments.tsx';
import { AppointmentArrivalPage, WalkInArrivalPage } from './pages/arrival.tsx';
import { BootPage } from './pages/boot.tsx';
import { DestinationPage } from './pages/destination.tsx';
import { EncounterPage, type EncounterSection } from './pages/encounter.tsx';
import { LoginPage, type LoginReason } from './pages/login.tsx';
import { NotFoundPage } from './pages/not-found.tsx';
import { PanelPage } from './pages/panel.tsx';
import { PatientPage } from './pages/patient.tsx';
import { PatientsPage } from './pages/patients.tsx';
import { ProfilePage } from './pages/profile.tsx';
import { ResetPasswordPage } from './pages/reset-password.tsx';
import { SelectLocationPage } from './pages/select-location.tsx';

// Rutas (T-004): /, /login, /seleccionar-sede, /app/<SEDE>/<destino> y
// /admin/<destino>. <SEDE> es el código de la sede (p. ej. NOR1).
// T-006a: /admin/usuarios (S-ADM-02) y las páginas públicas
// /invitacion/<token> (S-GEN-09) y /restablecer/<token> (S-GEN-10).
// T-006b: /app/<SEDE>/perfil (S-GEN-21). T-007: /admin/sedes (S-ADM-10).
// T-012: /app/<SEDE>/pacientes y /app/<SEDE>/pacientes/<id> (S-PAC-01 y 05).
// T-014: /app/<SEDE>/citas?fecha=AAAA-MM-DD (S-REC-06 a 09) y el subtítulo del Panel.
// T-017: /app/<SEDE>/llegada/<cita> (S-REC-18), /app/<SEDE>/llegada/sin-cita?paciente=<id>
// (S-REC-19) y /app/<SEDE>/visitas/<id> (S-CLI-04 completa desde T-018).

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage });

const bootRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: BootPage });

interface LoginSearch {
  motivo?: LoginReason;
  paso?: 'inscripcion';
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    ...(search.motivo === 'inactividad' || search.motivo === 'cerrada' ? { motivo: search.motivo } : {}),
    ...(search.paso === 'inscripcion' ? { paso: 'inscripcion' as const } : {}),
  }),
  component: function Login() {
    const { motivo, paso } = loginRoute.useSearch();
    return <LoginPage reason={motivo} step={paso} />;
  },
});

const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitacion/$token',
  component: function Invitation() {
    const { token } = invitationRoute.useParams();
    return <AcceptInvitationPage token={token} />;
  },
});

const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/restablecer/$token',
  component: function Reset() {
    const { token } = resetRoute.useParams();
    return <ResetPasswordPage token={token} />;
  },
});

const selectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/seleccionar-sede',
  component: function Select() {
    const me = useMe();
    return (
      <>
        {me.data ? <IdleGuard limitSeconds={me.data.idleTimeoutSeconds} /> : null}
        <SelectLocationPage />
      </>
    );
  },
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/$sede',
  component: function App() {
    const { sede } = appRoute.useParams();
    return <Frame area="clinic" sede={sede} />;
  },
});

const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: ({ params }) => {
    redirect({ to: '/app/$sede/$destino', params: { sede: params.sede, destino: 'panel' }, throw: true });
  },
});

// S-GEN-21 Perfil: para todos, sin permiso extra y fuera del menú lateral.
const appProfileRoute = createRoute({ getParentRoute: () => appRoute, path: 'perfil', component: ProfilePage });

// T-012: /app/<SEDE>/pacientes (S-PAC-01) y /app/<SEDE>/pacientes/<id> (encabezado de S-PAC-05).
const appPatientsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'pacientes',
  component: function Patients() {
    const me = useMe();
    // El backend autoriza siempre; aquí solo se oculta.
    if (me.data && !me.data.permissions.includes('patients.access')) return <NotFoundPage />;
    return <PatientsPage />;
  },
});

const appPatientRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'pacientes/$id',
  component: function Patient() {
    const me = useMe();
    const { sede, id } = appPatientRoute.useParams();
    if (me.data && !me.data.permissions.includes('patients.access')) return <NotFoundPage />;
    return <PatientPage key={id} sede={sede} patientId={id} />;
  },
});

// S-REC-01 Panel: por ahora el título y «{sede} · N citas hoy» (T-014).
const appPanelRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'panel',
  component: function Panel() {
    const me = useMe();
    const { sede } = appPanelRoute.useParams();
    if (me.data && !me.data.permissions.includes('panel.view')) return <NotFoundPage />;
    return <PanelPage sede={sede} />;
  },
});

interface AgendaSearch {
  fecha?: string;
  /** T-015: abre el detalle de esa cita (al tocar un aviso de la campana). */
  cita?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// S-REC-06 Citas. La fecha va en la URL (el historial del navegador funciona);
// la valida el servidor: sin ella, o si no es válida, es hoy en la sede.
const appAppointmentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'citas',
  validateSearch: (search: Record<string, unknown>): AgendaSearch => ({
    ...(typeof search.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.fecha) ? { fecha: search.fecha } : {}),
    ...(typeof search.cita === 'string' && UUID_RE.test(search.cita) ? { cita: search.cita } : {}),
  }),
  component: function Appointments() {
    const me = useMe();
    const { sede } = appAppointmentsRoute.useParams();
    const { fecha, cita } = appAppointmentsRoute.useSearch();
    // El backend autoriza siempre; aquí solo se oculta (Recepción y Proveedor, ADR 0027).
    if (me.data && !me.data.permissions.includes('appointments.access')) return <NotFoundPage />;
    return <AppointmentsPage sede={sede} fecha={fecha} cita={cita} />;
  },
});

// S-REC-18 y 19: solo con appointments.check_in; a los demás, la guarda los lleva al Panel (manual).
function ArrivalGuard({ sede, children }: { sede: string; children: ReactNode }) {
  const me = useMe();
  if (me.data && !me.data.permissions.includes('appointments.check_in')) return <Navigate to="/app/$sede/$destino" params={{ sede, destino: 'panel' }} replace />;
  return children;
}

interface WalkInSearch {
  paciente?: string;
}

const appWalkInRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'llegada/sin-cita',
  validateSearch: (search: Record<string, unknown>): WalkInSearch =>
    typeof search.paciente === 'string' && UUID_RE.test(search.paciente) ? { paciente: search.paciente } : {},
  component: function WalkIn() {
    const { sede } = appWalkInRoute.useParams();
    const { paciente } = appWalkInRoute.useSearch();
    return (
      <ArrivalGuard sede={sede}>
        <WalkInArrivalPage key={paciente ?? 'sin-paciente'} sede={sede} patientId={paciente} />
      </ArrivalGuard>
    );
  },
});

const appArrivalRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'llegada/$cita',
  component: function Arrival() {
    const { sede, cita } = appArrivalRoute.useParams();
    if (!UUID_RE.test(cita)) return <NotFoundPage />;
    return (
      <ArrivalGuard sede={sede}>
        <AppointmentArrivalPage key={cita} sede={sede} appointmentId={cita} />
      </ArrivalGuard>
    );
  },
});

const ENCOUNTER_SECTIONS: readonly EncounterSection[] = ['nursing', 'orders', 'billing'];

// T-018: S-CLI-04 con ?section=nursing|orders|billing (los desconocidos se ignoran).
const appEncounterRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'visitas/$id',
  validateSearch: (search: Record<string, unknown>): { section?: EncounterSection } =>
    ENCOUNTER_SECTIONS.includes(search.section as EncounterSection) ? { section: search.section as EncounterSection } : {},
  component: function Encounter() {
    const me = useMe();
    const { sede, id } = appEncounterRoute.useParams();
    const { section } = appEncounterRoute.useSearch();
    if ((me.data && !me.data.permissions.includes('patients.access')) || !UUID_RE.test(id)) return <NotFoundPage />;
    return <EncounterPage key={id} sede={sede} encounterId={id} section={section} />;
  },
});

const appDestinationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$destino',
  component: function AppDestination() {
    const { destino } = appDestinationRoute.useParams();
    return <DestinationPage section="clinic" segment={destino} />;
  },
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: () => <Frame area="admin" />,
});

const adminIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/',
  beforeLoad: () => {
    redirect({ to: '/admin/$destino', params: { destino: 'usuarios' }, throw: true });
  },
});

const adminUsersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'usuarios',
  component: function AdminUsers() {
    const me = useMe();
    // El backend autoriza siempre; aquí solo se oculta.
    if (me.data && !me.data.permissions.includes('members.manage')) return <NotFoundPage />;
    return <AdminUsersPage />;
  },
});

const adminLocationsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'sedes',
  component: function AdminLocations() {
    const me = useMe();
    if (me.data && !me.data.permissions.includes('locations.manage')) return <NotFoundPage />;
    return <AdminLocationsPage />;
  },
});

// T-011: /admin/catalogos/<pestaña> (S-ADM-13 a 20; T-011b: proveedores-de-laboratorio,
// S-ADM-17); /admin/catalogos abre Tipos de cita.
const adminCatalogIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'catalogos',
  beforeLoad: () => {
    redirect({ to: '/admin/catalogos/$pestana', params: { pestana: 'tipos-de-cita' }, throw: true });
  },
});

const adminCatalogRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'catalogos/$pestana',
  component: function AdminCatalog() {
    const me = useMe();
    const { pestana } = adminCatalogRoute.useParams();
    const tab = catalogTabOf(pestana);
    if (!tab || (me.data && !me.data.permissions.includes('catalog.manage'))) return <NotFoundPage />;
    return <AdminCatalogPage key={tab} tab={tab} />;
  },
});

const adminDestinationRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '$destino',
  component: function AdminDestination() {
    const { destino } = adminDestinationRoute.useParams();
    return <DestinationPage section="admin" segment={destino} />;
  },
});

// /dev/ui (T-005): hoja de componentes, solo en desarrollo. Con
// import.meta.env.DEV en false, Vite elimina la rama y la página no se compila.
const devRoutes = import.meta.env.DEV
  ? [createRoute({ getParentRoute: () => rootRoute, path: '/dev/ui', component: lazyRouteComponent(() => import('./pages/dev-ui.tsx'), 'DevUiPage') })]
  : [];

const routeTree = rootRoute.addChildren([
  bootRoute,
  loginRoute,
  invitationRoute,
  resetRoute,
  selectRoute,
  appRoute.addChildren([
    appIndexRoute,
    appProfileRoute,
    appPatientsRoute,
    appPatientRoute,
    appPanelRoute,
    appAppointmentsRoute,
    appWalkInRoute,
    appArrivalRoute,
    appEncounterRoute,
    appDestinationRoute,
  ]),
  adminRoute.addChildren([adminIndexRoute, adminUsersRoute, adminLocationsRoute, adminCatalogIndexRoute, adminCatalogRoute, adminDestinationRoute]),
  ...devRoutes,
]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
