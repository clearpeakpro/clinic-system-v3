import { createRootRoute, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router';
import { Frame } from './components/frame.tsx';
import { IdleGuard } from './components/idle-guard.tsx';
import { useMe } from './lib/session.ts';
import { BootPage } from './pages/boot.tsx';
import { DestinationPage } from './pages/destination.tsx';
import { LoginPage, type LoginReason } from './pages/login.tsx';
import { NotFoundPage } from './pages/not-found.tsx';
import { SelectLocationPage } from './pages/select-location.tsx';

// Rutas (T-004): /, /login, /seleccionar-sede, /app/<SEDE>/<destino> y
// /admin/<destino>. <SEDE> es el código de la sede (p. ej. NOR1).

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

const adminDestinationRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '$destino',
  component: function AdminDestination() {
    const { destino } = adminDestinationRoute.useParams();
    return <DestinationPage section="admin" segment={destino} />;
  },
});

const routeTree = rootRoute.addChildren([
  bootRoute,
  loginRoute,
  selectRoute,
  appRoute.addChildren([appIndexRoute, appDestinationRoute]),
  adminRoute.addChildren([adminIndexRoute, adminDestinationRoute]),
]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
