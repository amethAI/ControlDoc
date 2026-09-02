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
    ...(user?.country !== 'Costa Rica' ? [{ name: 'Check List 1 Año', href: '/checklist-contratos', icon: ClipboardList, group: 'Gestión' }] : []),
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
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
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
    <div className="min-h-screen flex overflow-x-hidden" style={{ background: '#070B16' }}>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 backdrop-blur-sm md:hidden"
          style={{ background: 'rgba(0,0,0,.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={clsx(
          'z-50 flex shrink-0 flex-col print:hidden',
          'fixed inset-y-0 left-0 transition-transform duration-300 ease-in-out',
          'md:sticky md:top-0 md:h-screen md:transition-none',
          /* Mobile: 256px slide-in | Desktop: 66px always visible */
          'w-64 md:w-[66px]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
        style={{ background: '#0C1120', borderRight: '1px solid rgba(255,255,255,.05)' }}
      >
        {/* Logo mark */}
        <div
          className="flex h-16 shrink-0 items-center justify-between md:justify-center px-5 md:px-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}
        >
          {/* Desktop: shield badge only */}
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              boxShadow: '0 0 20px rgba(59,130,246,.4)',
            }}
          >
            <Shield className="h-[18px] w-[18px] text-white" />
          </div>

          {/* Mobile: wordmark + close button */}
          <div className="flex flex-1 items-center gap-3 pl-3 md:hidden">
            <div>
              <p className="text-[15px] font-bold tracking-tight text-white">ControlDoc</p>
              <p
                className="text-[9px] font-semibold leading-none mt-0.5 uppercase tracking-widest"
                style={{ color: 'rgba(96,165,250,.6)' }}
              >
                Sistema PSMT
              </p>
            </div>
          </div>
          <button
            className="md:hidden flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ color: 'rgba(255,255,255,.3)' }}
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="scrollbar-none flex-1 overflow-y-auto py-4 px-3 md:px-0 md:py-3 space-y-0.5 md:space-y-1 md:flex md:flex-col md:items-center">
          {Object.entries(grouped).map(([group, items], gi) => (
            <div key={group} className={clsx('w-full', gi > 0 && 'mt-3 md:mt-4')}>
              {/* Group label — mobile only */}
              <p
                className="px-3 pb-1.5 pt-3 text-[9px] font-bold uppercase tracking-[0.1em] first:pt-0 md:hidden"
                style={{ color: 'rgba(255,255,255,.2)' }}
              >
                {group}
              </p>
              {/* Separator — desktop only */}
              {gi > 0 && (
                <div
                  className="hidden md:block mx-auto mb-3"
                  style={{ height: 1, width: 32, background: 'rgba(255,255,255,.07)' }}
                />
              )}
              <div className="space-y-0.5 md:space-y-1 md:flex md:flex-col md:items-center">
                {items.map(item => {
                  const isActive =
                    location.pathname === item.href ||
                    (item.href !== '/' && location.pathname.startsWith(item.href));
                  return (
                    <div key={item.name} className="relative group/tip w-full md:w-auto">
                      <Link
                        to={item.href}
                        className={clsx(
                          'flex items-center gap-3 rounded-xl transition-all duration-150',
                          /* Mobile: full-width with label */
                          'px-3 py-2.5 text-[12.5px] font-medium',
                          /* Desktop: 42px square centered icon */
                          'md:h-10 md:w-10 md:p-0 md:justify-center md:rounded-xl',
                          isActive
                            ? 'text-white md:text-blue-400'
                            : 'md:text-white/30 hover:md:text-white/70'
                        )}
                        style={
                          isActive
                            ? {
                                background: 'rgba(59,130,246,.18)',
                                color: '#60A5FA',
                              }
                            : undefined
                        }
                        onMouseEnter={e => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.05)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.background = '';
                          }
                        }}
                      >
                        <item.icon
                          className={clsx(
                            'shrink-0 transition-colors',
                            'h-4 w-4',
                            isActive ? 'text-blue-400' : 'text-white/30 group-hover/tip:text-white/60'
                          )}
                        />
                        <span className="flex-1 truncate md:hidden" style={{ color: isActive ? '#fff' : 'rgba(255,255,255,.45)' }}>
                          {item.name}
                        </span>
                      </Link>

                      {/* Desktop tooltip */}
                      <span
                        className="pointer-events-none absolute left-full top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 md:block"
                        style={{
                          marginLeft: 10,
                          background: '#1E2A3A',
                          border: '1px solid rgba(255,255,255,.08)',
                          boxShadow: '0 4px 12px rgba(0,0,0,.4)',
                        }}
                      >
                        {item.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div
          className="shrink-0 p-3 md:p-2 md:flex md:flex-col md:items-center md:gap-2"
          style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}
        >
          {/* Version — mobile only */}
          <div className="mb-2 flex items-center justify-between px-2 md:hidden">
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.2)' }}>
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
              className="text-[9px] underline"
              style={{ color: 'rgba(255,255,255,.2)' }}
            >
              Refrescar
            </button>
          </div>

          {/* User avatar — both */}
          <div className="relative group/tip md:w-auto">
            {/* Mobile: full card */}
            <div
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 md:hidden"
              style={{ background: 'rgba(255,255,255,.05)' }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-white">{user?.name}</p>
                <p className="truncate text-[10px]" style={{ color: 'rgba(255,255,255,.4)' }}>{user?.role}</p>
                {user?.country && (
                  <p className="text-[9px] font-semibold" style={{ color: 'rgba(96,165,250,.7)' }}>🌎 {user.country}</p>
                )}
                {(isSuperAdmin || isKAM) && (
                  <p className="text-[9px] font-semibold" style={{ color: 'rgba(251,191,36,.8)' }}>🌐 Global</p>
                )}
              </div>
            </div>

            {/* Desktop: avatar badge with online dot */}
            <div className="relative hidden md:flex h-9 w-9 items-center justify-center">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold text-white cursor-default"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}
              >
                {initials}
              </div>
              <span
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2"
                style={{
                  background: isOnline ? '#22C55E' : '#EF4444',
                  borderColor: '#0C1120',
                }}
              />
            </div>

            {/* Desktop tooltip for user */}
            <span
              className="pointer-events-none absolute left-full top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 md:block"
              style={{
                marginLeft: 10,
                background: '#1E2A3A',
                border: '1px solid rgba(255,255,255,.08)',
                boxShadow: '0 4px 12px rgba(0,0,0,.4)',
              }}
            >
              {user?.name}
              <span className="block text-[10px] font-normal" style={{ color: 'rgba(255,255,255,.5)' }}>
                {user?.role}
              </span>
            </span>
          </div>

          {/* Logout */}
          <div className="relative group/tip md:w-auto">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[12px] font-medium transition-all md:h-9 md:w-9 md:p-0 md:justify-center"
              style={{ color: 'rgba(255,255,255,.3)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,.12)';
                (e.currentTarget as HTMLElement).style.color = '#FCA5A5';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = '';
                (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.3)';
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="md:hidden">Cerrar Sesión</span>
            </button>
            <span
              className="pointer-events-none absolute left-full top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 md:block"
              style={{
                marginLeft: 10,
                background: '#1E2A3A',
                border: '1px solid rgba(255,255,255,.08)',
                boxShadow: '0 4px 12px rgba(0,0,0,.4)',
              }}
            >
              Cerrar Sesión
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex min-h-screen flex-1 min-w-0 flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 px-4 sm:px-6 print:hidden"
          style={{
            background: 'rgba(7,11,22,.8)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,.06)',
          }}
        >
          {/* Mobile hamburger */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl md:hidden transition-colors"
            style={{ color: 'rgba(255,255,255,.5)', background: 'rgba(255,255,255,.06)' }}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            <h1
              className="truncate text-[15px] font-semibold"
              style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,.9)' }}
            >
              {currentPage}
            </h1>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Server status */}
            <div
              className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 sm:flex"
              style={{
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <div
                className={clsx('h-1.5 w-1.5 rounded-full', isOnline && 'animate-pulse')}
                style={{ background: isOnline ? '#22C55E' : '#EF4444' }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.4)' }}>
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
                className="flex h-9 w-9 items-center justify-center rounded-xl transition-all"
                style={{
                  background: push.status === 'subscribed' ? 'rgba(59,130,246,.15)' : 'rgba(255,255,255,.05)',
                  color: push.status === 'subscribed' ? '#60A5FA' : push.status === 'denied' ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.4)',
                  cursor: push.status === 'denied' ? 'not-allowed' : 'pointer',
                }}
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
            <div
              className="flex h-9 w-9 cursor-default items-center justify-center rounded-xl text-[11px] font-bold text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}
            >
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="app-content flex-1 overflow-auto p-4 sm:p-6 print:p-2 print:overflow-visible">
          <Outlet />
        </main>
      </div>

      <AiAssistant />
    </div>
  );
}
