import React, { useState, useEffect, useRef } from 'react';
import { Cake, Upload, Building2, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface BirthdayEmployee {
  id: string;
  full_name: string;
  birth_date: string;
  club_id: string;
  clubs: { name: string } | null;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const getAge = (birthDate: string) => {
  const today = new Date();
  const birth = new Date(birthDate);
  const age = today.getFullYear() - birth.getFullYear();
  const hasPassed = today >= new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  return hasPassed ? age : age - 1;
};

const getDaysUntil = (birthDate: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const birth = new Date(birthDate);
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const isToday = (birthDate: string) => {
  const today = new Date();
  const birth = new Date(birthDate);
  return birth.getMonth() === today.getMonth() && birth.getDate() === today.getDate();
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-PA', { day: '2-digit', month: 'long' });
};

export default function Cumpleanos() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<BirthdayEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === 'Administrador';
  const isCoord = user?.role === 'Coordinadora';

  useEffect(() => {
    fetchBirthdays();
  }, [selectedMonth]);

  const fetchBirthdays = async () => {
    setLoading(true);
    try {
      const url = selectedMonth === 0
        ? '/api/employees/birthdays'
        : `/api/employees/birthdays?month=${selectedMonth}`;
      const res = await apiFetch(url);
      if (res.ok) setEmployees(await res.json());
    } catch {
      toast.error('Error al cargar cumpleaños');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

      // Find header row and column indexes
      let nameCol = -1, dateCol = -1, dataStartRow = 0;
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const row = rows[i].map((c: any) => String(c).toLowerCase().trim());
        const ni = row.findIndex((c: string) => c.includes('nombre'));
        const di = row.findIndex((c: string) => c.includes('fecha') || c.includes('nacimiento') || c.includes('cumplea'));
        if (ni !== -1 && di !== -1) {
          nameCol = ni; dateCol = di; dataStartRow = i + 1;
          break;
        }
      }

      if (nameCol === -1 || dateCol === -1) {
        toast.error('No se encontraron columnas NOMBRE y FECHA DE NACIMIENTO');
        return;
      }

      const records = rows.slice(dataStartRow)
        .filter(row => row[nameCol] && row[dateCol])
        .map(row => {
          let rawDate = row[dateCol];
          let birth_date = '';

          if (rawDate instanceof Date) {
            // JS Date object (when cellDates: true)
            if (!isNaN(rawDate.getTime())) {
              birth_date = `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`;
            }
          } else if (typeof rawDate === 'number') {
            // Excel serial date (fallback)
            const d = XLSX.SSF.parse_date_code(rawDate);
            birth_date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
          } else {
            // String date — try common formats: DD/MM/YYYY, YYYY-MM-DD, DD/MM/YY
            const str = String(rawDate).trim();
            const parts = str.split(/[\/\-\.]/);
            if (parts.length === 3) {
              const [a, b, c] = parts;
              if (c.length === 4) {
                // DD/MM/YYYY
                birth_date = `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
              } else if (a.length === 4) {
                // YYYY-MM-DD
                birth_date = `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
              } else if (c.length === 2) {
                // DD/MM/YY — assume 2000s if ≤ current year's 2-digit, else 1900s
                const currentYY = new Date().getFullYear() % 100;
                const year = parseInt(c) <= currentYY ? `20${c}` : `19${c}`;
                birth_date = `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
              }
            }
          }

          return { name: String(row[nameCol]).trim(), birth_date };
        })
        .filter(r => r.birth_date);

      if (records.length === 0) {
        toast.error('No se encontraron fechas válidas en el archivo');
        return;
      }

      const res = await apiFetch('/api/employees/import-birthdays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
      });

      const result = await res.json();
      if (res.ok) {
        toast.success(`${result.updated} cumpleaños importados correctamente`);
        if (result.notFound?.length > 0) {
          toast.warning(`${result.notFound.length} nombres no encontrados: ${result.notFound.slice(0, 3).join(', ')}${result.notFound.length > 3 ? '...' : ''}`);
        }
        fetchBirthdays();
      } else {
        toast.error(result.error || 'Error al importar');
      }
    } catch (err) {
      toast.error('Error al procesar el archivo');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const todayBirthdays = employees.filter(e => isToday(e.birth_date));
  const sorted = [...employees].sort((a, b) => getDaysUntil(a.birth_date) - getDaysUntil(b.birth_date));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-500 rounded-lg shadow-lg shadow-pink-200">
            <Cake className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Control de Cumpleaños</h2>
            <p className="text-slate-500 text-sm">Cumpleaños del personal por mes</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="pl-10 pr-8 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none appearance-none bg-white"
            >
              <option value={0}>Todos los meses</option>
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          {(isAdmin || isCoord) && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center px-4 py-2 bg-pink-500 text-white rounded-xl text-sm font-semibold hover:bg-pink-600 disabled:opacity-50 shadow-lg shadow-pink-200 transition-all active:scale-95"
              >
                {importing ? (
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Today's birthdays banner */}
      {todayBirthdays.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">🎂</span>
          <div>
            <p className="font-bold text-amber-800">¡Cumpleaños hoy!</p>
            <p className="text-amber-700 text-sm">
              {todayBirthdays.map(e => e.full_name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Club</div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Edad</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Días</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 border-4 border-pink-100 border-t-pink-500 rounded-full animate-spin" />
                      <p className="text-slate-500 text-sm">Cargando...</p>
                    </div>
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Cake className="h-8 w-8 text-slate-300" />
                      <p className="text-slate-500 text-sm">No hay cumpleaños registrados para este mes.</p>
                      {(isAdmin || isCoord) && (
                        <p className="text-slate-400 text-xs">Importá el Excel con las fechas para comenzar.</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                sorted.map(emp => {
                  const today = isToday(emp.birth_date);
                  const days = getDaysUntil(emp.birth_date);
                  const age = getAge(emp.birth_date) + (today ? 0 : 1);
                  return (
                    <tr key={emp.id} className={today ? 'bg-amber-50 hover:bg-amber-100 transition-colors' : 'hover:bg-slate-50/50 transition-colors'}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold border ${today ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {emp.full_name.charAt(0)}
                          </div>
                          <span className="text-sm font-semibold text-slate-800">{emp.full_name}</span>
                          {today && <span className="text-lg">🎂</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {(emp.clubs as any)?.name || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 capitalize">
                        {formatDate(emp.birth_date)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-bold text-slate-700">{age} años</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          today ? 'bg-amber-200 text-amber-800' :
                          days <= 7 ? 'bg-pink-100 text-pink-700' :
                          days <= 30 ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {today ? '¡Hoy!' : `${days}d`}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
