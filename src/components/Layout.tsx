import { apiFetch } from '../lib/api';
import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import AiAssistant from './AiAssistant';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Shield,
  Building2,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Info,
  Cake,
  Bell,
  BellOff,
  BellRing,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { usePushNotifications } from '../hooks/usePushNotifications';

type NavItem = { name: string; href: string; icon: React.ElementType; group: string };

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(true);
  const push = usePushNotifications();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isRRHH = user?.role === 'Recursos Humanos';
  const isAsistenteRRHH = user?.role === 'Asistente RRHH';
  const isSuperAdmin = user?.role === 'Super Administrador';
  const isAdmin = user?.role === 'Administrador' || isSuperAdmin;
  const isKAM = user?.role === 'KAM Redvolution';

  const navigation: NavItem[] = [
    ...(user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora' && !isAsistenteRRHH
      ? [{ name: 'Dashboard', href: '/', icon: LayoutDashboard, group: 'Principal' }]
      : []),
    ...(user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora' && user?.role !== 'Supervisor Cliente'
      ? [{ name: 'Empleados', href: '/empleados', icon: Users, group: 'Gestión' }]
      : []),
    { name: 'Check List', href: '/vencimientos', icon: CalendarClock, group: 'Gestión' },
    { name: 'Check List 1 Año', href: '/checklist-contratos', icon: ClipboardList, group: 'Gestión' },
    ...((isAdmin || isKAM || user?.role === 'Supervisor Interno' || user?.role === 'Coordinadora' || user?.role === 'Supervisor Cliente' || isRRHH)
      ? [{ name: 'Cumpleaños', href: '/cumpleanos', icon: Cake, group: 'Gestión' }]
      : []),
    ...(user?.role !== 'Supervisor Cliente' && user?.role !== 'Coordinadora'
      ? [{ name: 'Asistencia', href: '/asistencia', icon: CalendarCheck, group: 'Gestión' }]
      : []),
    ...((isAdmin || isKAM || user?.role === 'Coordinadora' || user?.role === 'Supervisor Interno' || user?.role === 'Supervisor Cliente' || isRRHH || isAsistenteRRHH)
      ? [{ name: 'Clubes', href: '/clubes', icon: Building2, group: 'Gestión' }]
      : []),
    ...(isAdmin ? [{ name: 'Roles y Permisos', href: '/roles', icon: Info, group: 'Sistema' }] : []),
    ...(isAdmin ? [{ name: 'Configuración', href: '/configuracion', icon: Settings, group: 'Sistema' }] : []),
  ];

  const groupOrder = ['Principal', 'Gestión', 'Sistema'];
  const grouped = groupOrder.reduce<Record<string, NavItem[]>>((acc, group) => {
    const items = navigation.filter(n => n.group === group);
    if (items.length) acc[group] = items;
    return acc;
  }, {});

  const currentPage =
    navigation.find(
      n => location.pathname === n.href || (n.href !== '/' && location.pathname.startsWith(n.href))
    )?.name || 'ControlDoc';

  const initials = user?.name
    ? user.name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  React.useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await apiFetch('/api/health');
        setIsOnline(res.ok);
      } catch {
        setIsOnline(false);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#eef2fb] flex overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={clsx(
          'z-50 flex w-64 shrink-0 flex-col bg-[#0d1b3e] print:hidden',
          'fixed inset-y-0 left-0 transition-transform duration-300 ease-in-out',
          'md:sticky md:top-0 md:h-screen md:transition-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 shadow-sm shadow-blue-900/40">
              <Shield className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <p className="text-[15px] font-bold tracking-tight text-white">ControlDoc</p>
              <p className="text-[9px] font-semibold text-blue-300/50 leading-none mt-0.5 uppercase tracking-widest">
                Sistema PSMT
              </p>
            </div>
          </div>
          <button
            className="md:hidden flex h-7 w-7 items-center justify-center rounded-lg text-white/30 hover:bg-white/10 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-4">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-2">
              <p className="px-3 pb-1.5 pt-3 text-[9px] font-bold uppercase tracking-[0.1em] text-white/20 first:pt-0">
                {group}
              </p>
              <div className="space-y-0.5">
                {items.map(item => {
                  const isActive =
                    location.pathname === item.href ||
                    (item.href !== '/' && location.pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={clsx(
                        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12.5px] font-medium transition-all duration-150',
                        isActive
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/30'
                          : 'text-white/45 hover:bg-white/[0.08] hover:text-white'
                      )}
                    >
                      <item.icon
                        className={clsx(
                          'h-[17px] w-[17px] shrink-0 transition-colors',
                          isActive ? 'text-white' : 'text-white/35 group-hover:text-white/70'
                        )}
                      />
                      <span className="flex-1 truncate">{item.name}</span>
                      {isActive && (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/50" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/[0.07] p-3">
          {/* Version + refresh */}
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">
              v1.2.4
            </span>
            <button
              onClick={async () => {
                if ('serviceWorker' in navigator) {
                  const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
                  await Promise.all(regs.map(r => r.unregister()));
                }
                if ('caches' in window) {
                  const keys = await caches.keys().catch(() => [] as string[]);
                  await Promise.all(keys.map(k => caches.delete(k)));
                }
                try { localStorage.clear(); } catch (_) {}
                window.location.href = window.location.origin + '?v=' + Date.now();
              }}
              className="text-[9px] text-white/20 underline decoration-white/15 hover:text-white/50"
            >
              Refrescar
            </button>
          </div>

          {/* User card */}
          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.07] px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">{user?.name}</p>
              <p className="truncate text-[10px] text-white/40">{user?.role}</p>
              {user?.country && (
                <p className="text-[9px] font-semibold text-blue-300/70 mt-0.5">🌎 {user.country}</p>
              )}
              {(isSuperAdmin || isKAM) && (
                <p className="text-[9px] font-semibold text-amber-400/80">🌐 Global</p>
              )}
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="mt-1.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium text-white/35 hover:bg-white/[0.07] hover:text-white/80"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex min-h-screen flex-1 min-w-0 flex-col overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-black/[0.06] bg-white/90 px-4 backdrop-blur-md sm:px-6 print:hidden">
          {/* Mobile hamburger */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-[15px] font-bold text-slate-900">{currentPage}</h1>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Server status */}
            <div className="hidden items-center gap-1.5 rounded-full border border-black/[0.06] bg-slate-50 px-3 py-1.5 sm:flex">
              <div
                className={clsx(
                  'h-1.5 w-1.5 rounded-full',
                  isOnline ? 'animate-pulse bg-emerald-500' : 'bg-red-500'
                )}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {isOnline ? 'Conectado' : 'Desconectado'}
              </span>
            </div>

            {/* Push notifications */}
            {push.status !== 'unsupported' && (
              <button
                onClick={push.toggle}
                disabled={push.loading || push.status === 'denied'}
                title={
                  push.status === 'subscribed'
                    ? 'Desactivar notificaciones'
                    : push.status === 'denied'
                    ? 'Notificaciones bloqueadas en el navegador'
                    : 'Activar notificaciones push'
                }
                className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  push.status === 'subscribed'
                    ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    : push.status === 'denied'
                    ? 'cursor-not-allowed text-slate-300'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                )}
              >
                {push.status === 'subscribed' ? (
                  <BellRing className="h-[18px] w-[18px]" />
                ) : push.status === 'denied' ? (
                  <BellOff className="h-[18px] w-[18px]" />
                ) : (
                  <Bell className="h-[18px] w-[18px]" />
                )}
              </button>
            )}

            {/* User avatar */}
            <div className="flex h-9 w-9 cursor-default items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white shadow-sm">
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 print:p-2 print:overflow-visible">
          <Outlet />
        </main>
      </div>

      <AiAssistant />
    </div>
  );
}
