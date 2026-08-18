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
  Wifi,
  WifiOff,
  Menu,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { usePushNotifications } from '../hooks/usePushNotifications';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isRRHH = user?.role === 'Recursos Humanos';
  const isAsistenteRRHH = user?.role === 'Asistente RRHH';
  const isSuperAdmin = user?.role === 'Super Administrador';
  const isAdmin = user?.role === 'Administrador' || isSuperAdmin;
  const isKAM = user?.role === 'KAM Redvolution';

  const navigation = [
    ...(user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora' && !isAsistenteRRHH ? [{ name: 'Dashboard', href: '/', icon: LayoutDashboard }] : []),
    ...(user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora' && user?.role !== 'Supervisor Cliente' ? [{ name: 'Empleados', href: '/empleados', icon: Users }] : []),
    { name: 'Check List', href: '/vencimientos', icon: CalendarClock },
    { name: 'Check List 1 Año', href: '/checklist-contratos', icon: ClipboardList },
    ...((isAdmin || isKAM || user?.role === 'Supervisor Interno' || user?.role === 'Coordinadora' || user?.role === 'Supervisor Cliente' || isRRHH) ? [
      { name: 'Cumpleaños', href: '/cumpleanos', icon: Cake }
    ] : []),
    ...(user?.role !== 'Supervisor Cliente' && user?.role !== 'Coordinadora' ? [{ name: 'Asistencia', href: '/asistencia', icon: CalendarCheck }] : []),
    ...((isAdmin || isKAM || user?.role === 'Coordinadora' || user?.role === 'Supervisor Interno' || user?.role === 'Supervisor Cliente' || isRRHH || isAsistenteRRHH) ? [
      { name: 'Clubes', href: '/clubes', icon: Building2 }
    ] : []),
    ...(isAdmin ? [{ name: 'Roles y Permisos', href: '/roles', icon: Info }] : []),
    ...(isAdmin ? [{ name: 'Configuración', href: '/configuracion', icon: Settings }] : [])
  ];

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const push = usePushNotifications();
  const [isOnline, setIsOnline] = React.useState(true);

  React.useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await apiFetch('/api/health');
        setIsOnline(res.ok);
      } catch (e) {
        setIsOnline(false);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const initials = user?.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div className="min-h-screen flex" style={{ background: '#060e1e' }}>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={clsx(
          'w-64 flex flex-col print:hidden shrink-0',
          'fixed md:static inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
        style={{
          background: '#0b1629',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight">ControlDoc</span>
              <p className="text-[10px] text-blue-400/80 font-medium -mt-0.5">Sistema PSMT</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 flex flex-col gap-0.5 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
                style={isActive ? {
                  background: 'rgba(59,130,246,0.18)',
                  border: '1px solid rgba(59,130,246,0.25)',
                } : {
                  border: '1px solid transparent',
                }}
              >
                <item.icon
                  className={clsx('h-4 w-4 shrink-0', isActive ? 'text-blue-400' : 'text-slate-500')}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
          {/* User card */}
          <div
            className="flex items-center gap-3 p-3 rounded-xl mb-2"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-md shadow-blue-500/25">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate leading-tight">{user?.name}</p>
              <p className="text-[11px] text-slate-400 truncate leading-tight">{user?.role}</p>
              {user?.country && <p className="text-[10px] text-blue-400 font-semibold mt-0.5">🌎 {user.country}</p>}
              {(isSuperAdmin || isKAM) && <p className="text-[10px] text-amber-400 font-semibold mt-0.5">🌐 Global</p>}
            </div>
          </div>

          {/* Version + refresh row */}
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[10px] text-slate-600 font-semibold tracking-wider uppercase">v1.4.1</span>
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
              className="text-[10px] text-slate-600 hover:text-slate-300 transition-colors underline decoration-slate-700"
            >
              Refrescar
            </button>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium text-slate-400 rounded-xl hover:text-red-400 transition-all duration-150"
            style={{ border: '1px solid transparent' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.15)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = '';
              (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible min-w-0 w-full">
        {/* Header */}
        <header
          className="h-16 flex items-center justify-between px-8 shrink-0 print:hidden"
          style={{
            background: 'rgba(6,14,30,0.8)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-3">
            {/* Hamburger — solo mobile */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="text-base font-semibold text-white">
              {navigation.find(n => location.pathname === n.href || (n.href !== '/' && location.pathname.startsWith(n.href)))?.name || 'ControlDoc'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Push notifications */}
            {push.status !== 'unsupported' && (
              <button
                onClick={push.toggle}
                disabled={push.loading || push.status === 'denied'}
                title={
                  push.status === 'subscribed' ? 'Desactivar notificaciones'
                  : push.status === 'denied' ? 'Notificaciones bloqueadas'
                  : 'Activar notificaciones push'
                }
                className={clsx(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                  push.status === 'subscribed'
                    ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20'
                    : push.status === 'denied'
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                )}
              >
                {push.status === 'subscribed' ? <BellRing className="h-4 w-4" /> : push.status === 'denied' ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </button>
            )}

            {/* Server status */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {isOnline ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400">Activo</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-red-400">Desconectado</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8 print:p-2 print:overflow-visible">
          <Outlet />
        </main>
      </div>

      <AiAssistant />
    </div>
  );
}
