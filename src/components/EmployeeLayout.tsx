import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Shield, Home, Files, User, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

const tabs = [
  { name: 'Inicio',      href: '/mi-cuenta',            icon: Home  },
  { name: 'Documentos',  href: '/mi-cuenta/documentos', icon: Files },
  { name: 'Mi Perfil',   href: '/mi-cuenta/perfil',     icon: User  },
];

export default function EmployeeLayout() {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#eef2fb]">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-black/[0.06] bg-[#0d1b3e] px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <span className="text-[14px] font-bold text-white">ControlDoc</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-white/50 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          Salir
        </button>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex h-16 items-center justify-around border-t border-black/[0.06] bg-white print:hidden">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.href ||
            (tab.href !== '/mi-cuenta' && location.pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.name}
              to={tab.href}
              className={clsx(
                'flex flex-1 flex-col items-center gap-1 py-2',
                isActive ? 'text-blue-600' : 'text-slate-400'
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold">{tab.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
