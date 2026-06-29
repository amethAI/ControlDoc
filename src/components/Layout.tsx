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
  const isSuperAdmin = user?.role === 'Super Administrador';
  const isAdmin = user?.role === 'Administrador' || isSuperAdmin;

  const navigation = [
    ...(user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora' ? [{ name: 'Dashboard', href: '/', icon: LayoutDashboard }] : []),
    ...(user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora' && user?.role !== 'Supervisor Cliente' ? [{ name: 'Empleados', href: '/empleados', icon: Users }] : []),
    { name: 'Check List', href: '/vencimientos', icon: CalendarClock },
    { name: 'Check List 1 Año', href: '/checklist-contratos', icon: ClipboardList },
    ...((isAdmin || user?.role === 'Supervisor Interno' || user?.role === 'Coordinadora' || user?.role === 'Supervisor Cliente' || isRRHH) ? [
      { name: 'Cumpleaños', href: '/cumpleanos', icon: Cake }
    ] : []),
    ...(user?.role !== 'Supervisor Cliente' && user?.role !== 'Coordinadora' ? [{ name: 'Asistencia', href: '/asistencia', icon: CalendarCheck }] : []),
    ...((isAdmin || user?.role === 'Coordinadora' || user?.role === 'Supervisor Interno' || user?.role === 'Supervisor Cliente' || isRRHH) ? [
      { name: 'Clubes', href: '/clubes', icon: Building2 }
    ] : []),
    ...(isAdmin ? [{ name: 'Roles y Permisos', href: '/roles', icon: Info }] : []),
    ...(isAdmin ? [{ name: 'Configuración', href: '/configuracion', icon: Settings }] : [])
  ];

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

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-indigo-950 text-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <Shield className="h-8 w-8 text-blue-500 mr-3" />
          <span className="text-xl font-bold tracking-tight">ControlDoc</span>
        </div>
        
        <div className="flex-1 py-6 flex flex-col gap-1 px-3">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
                            (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                to={item.href}
                className={clsx(
                  'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <item.icon className={clsx('mr-3 h-5 w-5', isActive ? 'text-white' : 'text-slate-400')} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="mb-4 px-2 flex flex-col gap-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] font-bold tracking-widest uppercase">Sistema v1.2.4</span>
              <button
                onClick={async () => {
                  // 1. Unregister all service workers
                  if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
                    await Promise.all(regs.map(r => r.unregister()));
                  }
                  // 2. Clear all browser caches
                  if ('caches' in window) {
                    const keys = await caches.keys().catch(() => [] as string[]);
                    await Promise.all(keys.map(k => caches.delete(k)));
                  }
                  // 3. Clear storage (keep session token so user stays logged in)
                  try { localStorage.clear(); } catch (_) {}
                  // 4. Hard reload bypassing cache
                  window.location.href = window.location.origin + '?v=' + Date.now();
                }}
                className="text-[9px] hover:text-white transition-colors underline decoration-slate-700"
              >
                Refrescar
              </button>
            </div>
          </div>
          <div className="flex items-center mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold">
              {user?.name.charAt(0)}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 truncate">{user?.role}</p>
              {user?.country && (
                <p className="text-[10px] text-blue-400 font-semibold truncate mt-0.5">🌎 {user.country}</p>
              )}
              {isSuperAdmin && (
                <p className="text-[10px] text-amber-400 font-semibold truncate mt-0.5">🌐 Global</p>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-slate-300 rounded-lg hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 text-slate-400" />
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <h1 className="text-xl font-semibold text-slate-800">
            {navigation.find(n => location.pathname === n.href || (n.href !== '/' && location.pathname.startsWith(n.href)))?.name || 'ControlDoc'}
          </h1>
          <div className="flex items-center gap-3">
            {/* Notification bell */}
            {push.status !== 'unsupported' && (
              <button
                onClick={push.toggle}
                disabled={push.loading || push.status === 'denied'}
                title={
                  push.status === 'subscribed' ? 'Desactivar notificaciones'
                  : push.status === 'denied' ? 'Notificaciones bloqueadas en el navegador'
                  : 'Activar notificaciones push'
                }
                className={clsx(
                  'p-2 rounded-full transition-colors',
                  push.status === 'subscribed'
                    ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                    : push.status === 'denied'
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                )}
              >
                {push.status === 'subscribed' ? (
                  <BellRing className="h-5 w-5" />
                ) : push.status === 'denied' ? (
                  <BellOff className="h-5 w-5" />
                ) : (
                  <Bell className="h-5 w-5" />
                )}
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200">
              <div className={clsx("w-2 h-2 rounded-full animate-pulse", isOnline ? "bg-emerald-500" : "bg-red-500")}></div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {isOnline ? "Servidor Activo" : "Servidor Desconectado"}
              </span>
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
      <AiAssistant />
    </div>
  );
}
