import { apiFetch } from '../lib/api';
import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  LogOut, 
  Shield,
  Building2,
  CalendarCheck,
  TrendingUp,
  CalendarClock,
  ClipboardList
} from 'lucide-react';
import clsx from 'clsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navigation = [
    ...(user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora' ? [{ name: 'Dashboard', href: '/', icon: LayoutDashboard }] : []),
    ...(user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora' && user?.role !== 'Supervisor Cliente' ? [{ name: 'Empleados', href: '/empleados', icon: Users }] : []),
    { name: 'Vencimientos', href: '/vencimientos', icon: CalendarClock },
    { name: 'Checklist Contratos', href: '/checklist-contratos', icon: ClipboardList },
    ...(user?.role !== 'Supervisor Cliente' && user?.role !== 'Coordinadora' ? [{ name: 'Asistencia', href: '/asistencia', icon: CalendarCheck }] : []),
    ...((user?.role === 'Administrador' || user?.role === 'Supervisor Interno') ? [
      { name: 'Rendimiento', href: '/rendimiento', icon: TrendingUp }
    ] : []),
    ...((user?.role === 'Administrador' || user?.role === 'Coordinadora' || user?.role === 'Supervisor Interno' || user?.role === 'Supervisor Cliente') ? [
      { name: 'Clubes', href: '/clubes', icon: Building2 }
    ] : []),
    ...(user?.role === 'Administrador' ? [
      { name: 'Configuración', href: '/configuracion', icon: Settings }
    ] : [])
  ];

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
              <span className="text-[10px] font-bold tracking-widest uppercase">Sistema v1.0.8</span>
              <button 
                onClick={() => {
                  try {
                    localStorage.clear();
                  } catch (e) {
                    console.warn('localStorage not available', e);
                  }
                  window.location.href = window.location.origin + '?force=' + Date.now();
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
          <div className="flex items-center gap-4">
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
    </div>
  );
}
