import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Check, ChevronDown, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, type Me } from '../lib/api.ts';
import { cn } from '../lib/cn.ts';
import { initials, rolesText } from '../lib/format.ts';
import { landingPath, menuFor, pathFor, type NavItem } from '../lib/nav.ts';
import { flatten, keys, queryClient, useLocations, useMe, type FlatLocation } from '../lib/session.ts';
import { applyTheme, prefs, type ThemePreference } from '../lib/storage.ts';
import { NotFoundPage } from '../pages/not-found.tsx';
import { Brand, BrandLogo } from './brand.tsx';
import { IdleGuard } from './idle-guard.tsx';
import { LogoutDialog } from './logout-dialog.tsx';
import { Button } from './ui/button.tsx';
import { Spinner } from './ui/field.tsx';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Sheet, SheetClose } from './ui/overlay.tsx';

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
    // Como en Stitch (S-GEN-12): superficies blancas separadas por sombras
    // suaves; menú lateral a toda la altura y cabecera a su derecha.
    <div className="flex h-full bg-surface-container-lowest dark:bg-surface">
      <IdleGuard limitSeconds={me.data.idleTimeoutSeconds} />
      <SideNav me={me.data} code={active.code} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header me={me.data} locations={all} active={active} />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 tab:p-6 desk:p-8">
          <Outlet />
        </main>
      </div>
      <BottomNav me={me.data} code={active.code} active={active} />
    </div>
  );
}

function Centered() {
  return (
    <div className="flex h-full items-center justify-center bg-surface-container-lowest dark:bg-surface">
      <Spinner />
    </div>
  );
}

function Header({ me, locations, active }: { me: Me; locations: FlatLocation[]; active: FlatLocation }) {
  return (
    <header className="relative z-10 flex h-16 shrink-0 items-center gap-space-md bg-surface-container-lowest px-4 shadow-level-1 tab:px-space-lg dark:bg-surface-container-low">
      <LocationSelector locations={locations} active={active} />
      <div className="flex-1" />
      {/* Espacio reservado: «En vivo» (T-009), notificaciones y «Buscar pacientes» (fase 2). */}
      <div data-slot="header-actions" className="flex items-center gap-space-md" />
      <AccountMenu me={me} />
    </header>
  );
}

/** Cápsula de la sede: código en recuadro monoespaciado y nombre grande. */
function LocationLabel({ location }: { location: FlatLocation }) {
  return (
    <span className="flex min-w-0 items-center gap-space-sm">
      <span className="shrink-0 rounded-sm bg-surface-container-highest px-space-xs py-0.5 font-mono text-code-md text-primary">
        {location.code}
      </span>
      <span className="truncate text-headline-sm text-on-surface">{location.name}</span>
    </span>
  );
}

const capsule = 'flex h-12 min-w-0 items-center gap-space-sm rounded-md bg-surface-container-low px-space-md dark:bg-surface-container-high';

/** S-GEN-13: solo texto con 0–1 sedes; menú con 2 o más. Siempre aterriza en el inicio de la nueva sede. */
function LocationSelector({ locations, active }: { locations: FlatLocation[]; active: FlatLocation }) {
  const navigate = useNavigate();
  if (locations.length < 2) {
    return (
      <div className={capsule} data-testid="location-current">
        <LocationLabel location={active} />
      </div>
    );
  }

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
        className={cn(capsule, 'hover:bg-surface-container')}
        aria-label={`Sede activa: ${active.name}. Cambiar de sede`}
      >
        <LocationLabel location={active} />
        <ChevronDown aria-hidden className="size-5 shrink-0 text-outline" />
      </DropdownTrigger>
      <DropdownContent align="start">
        {locations.map((l) => (
          <DropdownItem key={l.id} onSelect={() => void choose(l)}>
            <span className="rounded-sm bg-surface-container-highest px-space-xs font-mono text-code-sm text-primary">{l.code}</span>
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

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-body-md-medium text-on-primary"
    >
      {initials(name)}
    </span>
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
  const roles = rolesText(me.roles);
  return (
    <>
      <DropdownMenu>
        <DropdownTrigger
          aria-label="Menú de cuenta"
          className="flex min-h-touch items-center gap-space-sm rounded-md px-space-xs hover:bg-surface-container-low"
        >
          <Avatar name={me.name} />
          <span className="hidden max-w-56 flex-col text-left tab:flex">
            <span className="truncate text-body-lg-medium text-on-surface">{me.name}</span>
            {roles ? <span className="truncate text-body-md text-on-surface-variant">{roles}</span> : null}
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
        'flex items-center transition-colors',
        variant === 'side' || variant === 'drawer' ? 'h-12 shrink-0 gap-space-sm rounded-md px-space-md text-body-md' : '',
        variant === 'rail' ? 'min-h-16 shrink-0 flex-col justify-center gap-space-xs rounded-md px-space-xs text-center text-caption' : '',
        variant === 'bottom' ? 'h-full min-w-0 flex-1 flex-col justify-center gap-0.5 text-caption font-medium' : '',
        variant === 'bottom'
          ? selected
            ? 'text-primary'
            : 'text-on-surface-variant hover:text-on-surface'
          : selected
            ? 'bg-primary-container font-medium text-on-primary-container'
            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
      )}
    >
      <Icon aria-hidden className={cn('shrink-0', variant === 'bottom' ? 'size-6' : 'size-5')} />
      <span
        className={
          variant === 'side' || variant === 'drawer'
            ? 'truncate'
            : variant === 'bottom'
              ? 'w-full truncate px-0.5 text-center'
              : 'line-clamp-2 max-w-full'
        }
      >
        {item.label}
      </span>
    </Link>
  );
}

function sections(me: Me) {
  const items = menuFor(me.permissions);
  return { clinic: items.filter((i) => i.section === 'clinic'), admin: items.filter((i) => i.section === 'admin') };
}

function SectionLabel({ children }: { children: string }) {
  return <p className="px-space-md pt-space-sm pb-space-xs text-caption tracking-wider text-on-surface-variant uppercase">{children}</p>;
}

function SideNav({ me, code }: { me: Me; code: string }) {
  const { clinic, admin } = sections(me);
  return (
    <>
      {/* Escritorio: 240 px, «Clínica operativa» arriba y «Administración» al pie (Stitch). */}
      <aside className="relative z-20 hidden w-60 shrink-0 flex-col overflow-y-auto bg-surface-container-lowest shadow-level-1 desk:flex dark:bg-surface-container-low">
        <div className="flex h-16 shrink-0 items-center px-space-md">
          <Brand variant="nav" />
        </div>
        <nav aria-label="Navegación principal" className="flex flex-1 flex-col justify-between gap-space-md pb-space-md">
          {clinic.length > 0 ? (
            <div className="flex flex-col">
              <SectionLabel>Clínica operativa</SectionLabel>
              <div className="flex flex-col gap-space-xs px-space-sm">
                {clinic.map((item) => <NavLink key={item.id} item={item} code={code} variant="side" />)}
              </div>
            </div>
          ) : null}
          {admin.length > 0 ? (
            <div className="flex flex-col">
              <SectionLabel>Administración</SectionLabel>
              <div className="flex flex-col gap-space-xs px-space-sm">
                {admin.map((item) => <NavLink key={item.id} item={item} code={code} variant="side" />)}
              </div>
            </div>
          ) : null}
        </nav>
      </aside>
      {/* Tableta: riel de 96 px con el logo arriba. */}
      <aside className="relative z-20 hidden w-24 shrink-0 flex-col overflow-y-auto bg-surface-container-lowest shadow-level-1 tab:flex desk:hidden dark:bg-surface-container-low">
        <div className="flex h-16 shrink-0 items-center justify-center">
          <BrandLogo />
        </div>
        <nav aria-label="Navegación principal" className="flex flex-col gap-space-xs p-space-xs">
          {clinic.map((item) => <NavLink key={item.id} item={item} code={code} variant="rail" />)}
          {admin.length > 0 && clinic.length > 0 ? <hr className="mx-space-sm my-space-xs border-outline-variant" /> : null}
          {admin.map((item) => <NavLink key={item.id} item={item} code={code} variant="rail" />)}
        </nav>
      </aside>
    </>
  );
}

function BottomNav({ me, code, active }: { me: Me; code: string; active: FlatLocation }) {
  const [drawer, setDrawer] = useState(false);
  const { clinic, admin } = sections(me);
  const all = [...clinic, ...admin];
  const roles = rolesText(me.roles);
  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch bg-surface-container-lowest px-2 shadow-level-2-up tab:hidden dark:bg-surface-container-low"
      >
        {all.length >= 2 ? all.slice(0, 5).map((item) => <NavLink key={item.id} item={item} code={code} variant="bottom" />) : null}
        <button
          type="button"
          aria-label="Menú"
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium text-on-surface-variant hover:text-on-surface"
          onClick={() => { setDrawer(true); }}
        >
          <Menu aria-hidden className="size-6" />
          Menú
        </button>
      </nav>
      <Sheet open={drawer} onOpenChange={setDrawer} title="Menú">
        <div className="flex items-center justify-between gap-space-sm pb-space-sm">
          <div className="flex min-w-0 items-center gap-space-sm">
            <Avatar name={me.name} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-body-md-medium text-on-surface">{me.name}</span>
              <span className="truncate text-caption text-on-surface-variant">
                {roles ? `${roles} · ` : ''}
                {active.name}
              </span>
            </div>
          </div>
          <SheetClose asChild>
            <Button variant="text" className="w-12 px-0 text-on-surface-variant" aria-label="Cerrar menú">
              <X aria-hidden className="size-5" />
            </Button>
          </SheetClose>
        </div>
        <div className="flex flex-col gap-space-xs" onClick={() => { setDrawer(false); }}>
          {clinic.length > 0 ? <SectionLabel>Clínica operativa</SectionLabel> : null}
          {clinic.map((item) => <NavLink key={item.id} item={item} code={code} variant="drawer" />)}
          {admin.length > 0 ? <SectionLabel>Administración</SectionLabel> : null}
          {admin.map((item) => <NavLink key={item.id} item={item} code={code} variant="drawer" />)}
        </div>
      </Sheet>
    </>
  );
}
