import React from 'react';
import { User, Building2, FileText, Calendar } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export default function EmployeeProfile() {
  const { user } = useAuth();
  const [employee, setEmployee] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiFetch('/api/employee/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setEmployee(d.employee))
      .finally(() => setLoading(false));
  }, []);

  const initials = user?.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() ?? '?';

  if (loading) return (
    <div className="flex h-64 items-center justify-center text-slate-400 text-sm">Cargando...</div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Avatar + name */}
      <div className="rounded-2xl bg-[#0d1b3e] p-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-[22px] font-bold text-white">
          {initials}
        </div>
        <h1 className="text-[17px] font-bold text-white">{employee?.full_name ?? user?.name}</h1>
        <p className="mt-1 text-[11px] text-white/45">{employee?.position}</p>
      </div>

      {/* Info cards */}
      <div className="rounded-2xl bg-white border border-black/[0.06] overflow-hidden">
        {[
          { icon: Building2, label: 'Club', value: employee?.clubs?.name ?? '—' },
          { icon: FileText,  label: 'Cédula', value: employee?.cedula ?? '—' },
          { icon: User,      label: 'Tipo de contrato', value: employee?.contract_type ?? '—' },
          {
            icon: Calendar,
            label: 'Vencimiento de contrato',
            value: employee?.contract_end
              ? format(parseISO(employee.contract_end), "d 'de' MMMM yyyy", { locale: es })
              : 'Indefinido',
          },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.04] last:border-none">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <Icon className="h-4 w-4 text-slate-500" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
              <p className="text-[13px] font-semibold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-[10.5px] text-slate-400">
        Para actualizar tus datos personales, contactá a Recursos Humanos.
      </p>
    </div>
  );
}
