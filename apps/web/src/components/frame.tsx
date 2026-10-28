import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Check, ChevronDown, LogOut, MapPin, Menu, Moon, Sun, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, type Me } from '../lib/api.ts';
import { cn } from '../lib/cn.ts';
import { landingPath, menuFor, pathFor, type NavItem } from '../lib/nav.ts';
import { flatten, keys, queryClient, useLocations, useMe, type FlatLocation } from '../lib/session.ts';
import { applyTheme, prefs, type ThemePreference } from '../lib/storage.ts';
import { NotFoundPage } from '../pages/not-found.tsx';
import { Brand } from './brand.tsx';
import { IdleGuard } from './idle-guard.tsx';
import { LogoutDialog } from './logout-dialog.tsx';
import { Button } from './ui/button.tsx';
import { Spinner } from './ui/field.tsx';
import { Dialog, DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from './ui/overlay.tsx';

/**
 * S-GEN-12 Marco. Menú lateral (> 1024 px), riel (600–1024 px) o barra
 * inferior con los 5 primeros destinos y un cajón (< 600 px). El menú sale de
 * los permisos que da el servidor para el contexto activo.
 */
export function Frame({ area, sede }: { area: 'clinic' | 'admin'; sede?: string }) {
  const navigate = useNavigate();
  const me = useMe();
  const locations = useLocations();
  // Ref, no estado: el cambio en curso no debe volver a renderizar.
  const switching = useRef(false);

  // Sesión vencida o MFA pendiente: de vuelta al acceso.
  useEffect(() => {
    const error = me.error;
    if (!error) return;
    if (error.code === 'mfa_enrollment_required') void navigate({ to: '/login', search: { paso: 'inscripcion' }, replace: true });
    else if (error.status === 401) void navigate({ to: '/login', search: { motivo: 'cerrada' }, replace: true });
  }, [me.error, navigate]);

  const all = locations.data ? flatten(locations.data) : [];
  const fromUrl = sede ? all.find((l) => l.code === sede) : undefined;
  const active = all.find((l) => l.id === me.data?.context?.locationId);

  // Cambiar la sede en la URL hace el mismo cambio que el selector (S-GEN-13).
  useEffect(() => {
    if (area !== 'clinic' || !fromUrl || !me.data || me.data.context?.locationId === fromUrl.id || switching.current) return;
    switching.current = true;
    void api
      .selectContext(fromUrl.organizationId, fromUrl.id)
      .then(async () => {
        prefs.setLastLocationId(fromUrl.id);
        await queryClient.invalidateQueries({ queryKey: keys.me });
      })
      .finally(() => {
        switching.current = false;
      });
  }, [area, fromUrl, me.data]);

  useEffect(() => {
    if (area === 'admin' && me.data && !me.data.context) void navigate({ to: '/seleccionar-sede', replace: true });
  }, [area, me.data, navigate]);

  if (me.isPending || locations.isPending) return <Centered />;
  if (!me.data) return <Centered />;
  if (area === 'clinic' && !fromUrl) return <NotFoundPage />;
  if (area === 'clinic' && me.data.context?.locationId !== fromUrl?.id) return <Centered />;
  if (area === 'admin' && !me.data.permissions.includes('admin.access')) return <NotFoundPage />;
  if (!active) return <Centered />;

  return (
    // Como en Stitch (S-GEN-12): menú lateral a toda la altura con la marca
    // arriba; cabecera y contenido a su derecha.
    <div className="flex h-full bg-background">
      <IdleGuard limitSeconds={me.data.idleTimeoutSeconds} />
      <SideNav me={me.data} code={active.code} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header me={me.data} locations={all} active={active} />
        <main className="min-h-0 flex-1 overflow-y-auto px-margin py-space-lg pb-28 tab:pb-space-lg">
          <Outlet />
        </main>
      </div>
      <BottomNav me={me.data} code={active.code} />
    </div>
  );
}

function Centered() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <Spinner />
    </div>
  );
}

function Header({ me, locations, active }: { me: Me; locations: FlatLocation[]; active: FlatLocation }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-space-md border-b border-outline-variant bg-surface-container-lowest px-margin">
      <span className="desk:hidden">
        <Brand compact />
      </span>
      <LocationSelector locations={locations} active={active} />
      <div className="flex-1" />
      <AccountMenu me={me} />
    </header>
  );
}

/** S-GEN-13: solo texto con 0–1 sedes; menú con 2 o más. Siempre aterriza en el inicio de la nueva sede. */
function LocationSelector({ locations, active }: { locations: FlatLocation[]; active: FlatLocation }) {
  const navigate = useNavigate();
  const label = (
    <span className="flex min-w-0 items-center gap-space-sm">
      <MapPin aria-hidden className="size-5 shrink-0 text-primary" />
      <span className="rounded-sm bg-primary-fixed px-1.5 font-mono text-code-sm text-on-primary-fixed">{active.code}</span>
      <span className="truncate text-body-lg-medium text-on-surface">{active.name}</span>
    </span>
  );
  if (locations.length < 2) return <div className="min-w-0" data-testid="location-current">{label}</div>;

  const choose = async (location: FlatLocation) => {
    if (location.id === active.id) return;
    await api.selectContext(location.organizationId, location.id);
    prefs.setLastLocationId(location.id);
    const fresh = await queryClient.query({ queryKey: keys.me, queryFn: api.me, staleTime: 0 });
    await navigate({ to: landingPath(fresh.permissions, location.code) });
  };

  const multiOrg = new Set(locations.map((l) => l.organizationId)).size > 1;
  return (
    <DropdownMenu>
      <DropdownTrigger
        data-testid="location-selector"
        className="flex min-h-touch min-w-0 items-center gap-space-xs rounded-md px-space-sm hover:bg-surface-container-low"
        aria-label={`Sede activa: ${active.name}. Cambiar de sede`}
      >
        {label}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-on-surface-variant" />
      </DropdownTrigger>
      <DropdownContent align="start">
        {locations.map((l) => (
          <DropdownItem key={l.id} onSelect={() => void choose(l)}>
            <span className="font-mono text-code-sm">{l.code}</span>
            <span className="flex-1">
              {l.name}
              {multiOrg ? <span className="block text-caption text-on-surface-variant">{l.organizationName}</span> : null}
            </span>
            {l.id === active.id ? <Check aria-label="Actual" className="size-4 text-primary" /> : null}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}

/** S-GEN-16 Menú de cuenta. Sin idioma (interfaz solo en español); «Perfil» llega con T-006. */
function AccountMenu({ me }: { me: Me }) {
  const [theme, setTheme] = useState<ThemePreference>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const [logout, setLogout] = useState<null | 'simple' | 'everywhere'>(null);
  const pick = (value: ThemePreference) => {
    prefs.setTheme(value);
    setTheme(applyTheme(value));
  };
  return (
    <>
      <DropdownMenu>
        <DropdownTrigger
          aria-label="Menú de cuenta"
          className="flex min-h-touch items-center gap-space-sm rounded-md px-space-sm hover:bg-surface-container-low"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed">
            <UserRound aria-hidden className="size-5" />
          </span>
          <span className="hidden text-left desk:block">
            <span className="block text-body-md-medium text-on-surface">{me.name}</span>
          </span>
        </DropdownTrigger>
        <DropdownContent>
          <div className="px-space-sm py-space-sm select-none">
            <p className="text-body-md-medium text-on-surface">{me.name}</p>
            <p className="text-caption text-on-surface-variant">{me.email}</p>
          </div>
          <DropdownSeparator />
          <DropdownItem onSelect={() => { pick('light'); }}>
            <Sun aria-hidden className="size-5" /> Tema: Claro {theme === 'light' ? <Check aria-label="Actual" className="ml-auto size-4" /> : null}
          </DropdownItem>
          <DropdownItem onSelect={() => { pick('dark'); }}>
            <Moon aria-hidden className="size-5" /> Tema: Oscuro {theme === 'dark' ? <Check aria-label="Actual" className="ml-auto size-4" /> : null}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onSelect={() => { setLogout('simple'); }}>
            <LogOut aria-hidden className="size-5" /> Cerrar sesión
          </DropdownItem>
          <DropdownItem onSelect={() => { setLogout('everywhere'); }}>
            <LogOut aria-hidden className="size-5" /> Cerrar sesión en todos los dispositivos
          </DropdownItem>
        </DropdownContent>
      </DropdownMenu>
      <LogoutDialog
        open={logout !== null}
        onOpenChange={(open) => { if (!open) setLogout(null); }}
        variant={logout ?? 'simple'}
      />
    </>
  );
}

function useActivePath() {
  return useRouterState({ select: (s) => s.location.pathname });
}

function NavLink({ item, code, variant }: { item: NavItem; code: string; variant: 'side' | 'rail' | 'bottom' | 'drawer' }) {
  const pathname = useActivePath();
  const to = pathFor(item, code);
  const selected = pathname === to || pathname.startsWith(`${to}/`);
  const Icon = item.icon;
  return (
    <Link
      to={to}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'flex items-center rounded-md text-on-surface-variant hover:bg-surface-container-low',
        selected && 'bg-primary/10 text-primary',
        variant === 'side' || variant === 'drawer' ? 'min-h-touch gap-space-md px-space-md text-body-lg' : '',
        variant === 'rail' ? 'min-h-16 flex-col justify-center gap-space-xs px-space-xs text-center text-caption' : '',
        variant === 'bottom' ? 'min-h-16 flex-1 flex-col justify-center gap-space-xs text-caption' : '',
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span className={variant === 'side' || variant === 'drawer' ? 'truncate' : 'line-clamp-2'}>{item.label}</span>
    </Link>
  );
}

function sections(me: Me) {
  const items = menuFor(me.permissions);
  return { clinic: items.filter((i) => i.section === 'clinic'), admin: items.filter((i) => i.section === 'admin') };
}

function SideNav({ me, code }: { me: Me; code: string }) {
  const { clinic, admin } = sections(me);
  return (
    <>
      <nav aria-label="Navegación principal" className="hidden w-[260px] shrink-0 flex-col gap-space-xs overflow-y-auto border-r border-outline-variant bg-surface-container-lowest p-space-md desk:flex">
        <div className="mb-space-md">
          <Brand />
        </div>
        {clinic.map((item) => <NavLink key={item.id} item={item} code={code} variant="side" />)}
        {admin.length > 0 ? (
          <>
            {clinic.length > 0 ? <hr className="my-space-sm border-outline-variant" /> : null}
            <p className="px-space-md pb-space-xs text-caption tracking-wide text-on-surface-variant uppercase">Administración</p>
            {admin.map((item) => <NavLink key={item.id} item={item} code={code} variant="side" />)}
          </>
        ) : null}
      </nav>
      <nav aria-label="Navegación principal" className="hidden w-24 shrink-0 flex-col gap-space-xs overflow-y-auto border-r border-outline-variant bg-surface-container-lowest p-space-xs tab:flex desk:hidden">
        {clinic.map((item) => <NavLink key={item.id} item={item} code={code} variant="rail" />)}
        {admin.length > 0 && clinic.length > 0 ? <div className="h-space-md" /> : null}
        {admin.map((item) => <NavLink key={item.id} item={item} code={code} variant="rail" />)}
      </nav>
    </>
  );
}

function BottomNav({ me, code }: { me: Me; code: string }) {
  const [drawer, setDrawer] = useState(false);
  const { clinic, admin } = sections(me);
  const all = [...clinic, ...admin];
  return (
    <>
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-outline-variant bg-surface-container-lowest tab:hidden">
        {all.length >= 2 ? all.slice(0, 5).map((item) => <NavLink key={item.id} item={item} code={code} variant="bottom" />) : null}
        <Button variant="text" className="min-h-16 flex-col text-caption" aria-label="Menú" onClick={() => { setDrawer(true); }}>
          <Menu aria-hidden className="size-5" />
          Menú
        </Button>
      </nav>
      <Dialog open={drawer} onOpenChange={setDrawer} title="Menú">
        <div className="flex flex-col gap-space-xs" onClick={() => { setDrawer(false); }}>
          {clinic.map((item) => <NavLink key={item.id} item={item} code={code} variant="drawer" />)}
          {admin.length > 0 ? (
            <p className="px-space-md pt-space-sm text-caption tracking-wide text-on-surface-variant uppercase">Administración</p>
          ) : null}
          {admin.map((item) => <NavLink key={item.id} item={item} code={code} variant="drawer" />)}
        </div>
      </Dialog>
    </>
  );
}

