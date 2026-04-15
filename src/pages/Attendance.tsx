import { apiFetch } from '../lib/api';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Calendar as CalendarIcon,
  Check,
  X as CloseIcon,
  Clock,
  AlertCircle,
  Coffee,
  FileSpreadsheet
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  isWeekend
} from 'date-fns';
import { es } from 'date-fns/locale';
import clsx from 'clsx';
import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  full_name: string;
  club_id: string;
  cedula?: string;
  position?: string;
  status?: string;
  termination_date?: string;
  termination_reason?: string;
}

interface AttendanceRecord {
  employee_id: string;
  date: string;
  status: string;
}

interface AttendanceRequest {
  date: string;
  requested_count: number;
}

const STATUS_MAP: Record<string, { label: string, color: string, icon: any, short: string, category: string }> = {
  'presente': { label: 'Asignada', color: 'bg-green-100 text-green-700 border-green-200', icon: Check, short: 'A', category: 'regular' },
  'ausente': { label: 'Ausencia', color: 'bg-red-100 text-red-700 border-red-200', icon: CloseIcon, short: 'F', category: 'ausencia' },
  'permiso': { label: 'Permiso', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock, short: 'P', category: 'permiso' },
  'incapacidad': { label: 'Incapacidad', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertCircle, short: 'I', category: 'incapacidad' },
  'libre': { label: 'Libre', color: 'bg-slate-100 text-slate-500 border-slate-200', icon: Coffee, short: 'L', category: 'libre' },
  'capacitacion': { label: 'Capacitación', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Check, short: 'C', category: 'regular' },
  'apoyo': { label: 'Apoyo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Check, short: 'BK', category: 'apoyo' },
  'feriado': { label: 'Feriado', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Check, short: 'H', category: 'feriado' },
};

const STATUS_ORDER = ['presente', 'libre', 'permiso', 'ausente', 'incapacidad', 'capacitacion', 'apoyo', 'feriado'];

export default function Attendance() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [inactiveEmployees, setInactiveEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [clubs, setClubs] = useState<{id: string, name: string}[]>([]);
  const [selectedClubId, setSelectedClubId] = useState(user?.club_id || '');
  const [viewHalf, setViewHalf] = useState<'1' | '2' | 'full'>('full');

  if (user?.role === 'Coordinadora' || user?.role === 'Supervisor Cliente') {
    return (
      <div className="p-8 text-center">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg inline-block">
          No tienes permiso para acceder a esta sección.
        </div>
      </div>
    );
  }

  const isReadOnly = user?.role !== 'Administrador' && user?.role !== 'Supervisor Interno';
  const isRestricted = user?.role === 'Supervisor Interno';

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstHalf = allDays.filter(d => d.getDate() <= 15);
  const secondHalf = allDays.filter(d => d.getDate() > 15);

  const days = viewHalf === '1' ? firstHalf : viewHalf === '2' ? secondHalf : allDays;

  const fetchData = useCallback(async () => {
    if (!selectedClubId) {
      setEmployees([]);
      setInactiveEmployees([]);
      setAttendance([]);
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const start = format(monthStart, 'yyyy-MM-dd');
      const end = format(monthEnd, 'yyyy-MM-dd');

      const [empRes, inactiveEmpRes, attRes, reqRes] = await Promise.all([
        apiFetch(`/api/employees?club_id=${selectedClubId}&status=activo`),
        apiFetch(`/api/employees?club_id=${selectedClubId}&status=inactivo`),
        apiFetch(`/api/attendance?club_id=${selectedClubId}&start_date=${start}&end_date=${end}`),
        apiFetch(`/api/attendance-requests?club_id=${selectedClubId}&start_date=${start}&end_date=${end}`)
      ]);

      if (empRes.ok && inactiveEmpRes.ok && attRes.ok && reqRes.ok) {
        const activeData: Employee[] = await empRes.json();
        const inactiveData: Employee[] = await inactiveEmpRes.json();
        const attData: AttendanceRecord[] = await attRes.json();
        const reqData: AttendanceRequest[] = await reqRes.json();

        // Solo inactivos que tienen registros de asistencia en el período
        const attEmpIds = new Set(attData.map(a => a.employee_id));
        const inactivosConDias = inactiveData.filter(e => attEmpIds.has(e.id));

        setEmployees(activeData);
        setInactiveEmployees(inactivosConDias);
        setAttendance(attData);
        setRequests(reqData);
      }
    } catch (error) {
      console.error('Error fetching attendance data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedClubId, currentMonth]);

  useEffect(() => {
    apiFetch('/api/clubs').then(res => res.json()).then(setClubs);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = (employeeId: string, date: Date) => {
    if (isReadOnly) return;
    // Los empleados dados de baja no son editables
    if (inactiveEmployees.some(e => e.id === employeeId)) return;

    const dateStr = format(date, 'yyyy-MM-dd');
    const existing = attendance.find(a => a.employee_id === employeeId && a.date === dateStr);

    let nextStatus = 'presente';
    if (existing) {
      const currentIndex = STATUS_ORDER.indexOf(existing.status);
      nextStatus = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
    }

    setAttendance(prev => {
      const filtered = prev.filter(a => !(a.employee_id === employeeId && a.date === dateStr));
      return [...filtered, { employee_id: employeeId, date: dateStr, status: nextStatus }];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const attRes = await apiFetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        },
        body: JSON.stringify({ records: attendance })
      });

      const reqRes = await apiFetch('/api/attendance-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        },
        body: JSON.stringify({
          records: requests.map(r => ({ ...r, club_id: selectedClubId }))
        })
      });

      if (attRes.ok && reqRes.ok) {
        toast.success('Asistencia y solicitudes guardadas correctamente');
      }
    } catch (error) {
      toast.error('Error al guardar datos');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestChange = (date: Date, value: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const count = parseInt(value) || 0;
    setRequests(prev => {
      const filtered = prev.filter(r => r.date !== dateStr);
      return [...filtered, { date: dateStr, requested_count: count }];
    });
  };

  const getRequestedCount = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return requests.find(r => r.date === dateStr)?.requested_count || 0;
  };

  const getActualCount = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return attendance.filter(a => a.date === dateStr && (a.status === 'presente' || a.status === 'capacitacion' || a.status === 'apoyo' || a.status === 'feriado')).length;
  };

  const getStatus = (employee_id: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return attendance.find(a => a.employee_id === employee_id && a.date === dateStr)?.status;
  };

  const markAllPresent = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const newRecords = employees.map(emp => ({
      employee_id: emp.id,
      date: dateStr,
      status: 'presente'
    }));

    setAttendance(prev => {
      const filtered = prev.filter(a => a.date !== dateStr);
      return [...filtered, ...newRecords];
    });
  };

  const calculateBreakdown = (employeeId: string, daysList: Date[]) => {
    const stats = {
      regulares: 0,
      domingos: 0,
      feriados: 0,
      incapacidades: 0,
      apoyo: 0,
      total: 0
    };

    daysList.forEach(day => {
      const status = getStatus(employeeId, day);
      if (!status) return;

      if (status === 'incapacidad') {
        stats.incapacidades++;
      } else if (status === 'apoyo') {
        stats.apoyo++;
        stats.total++;
      } else if (status === 'feriado') {
        stats.feriados++;
        stats.total++;
      } else if (status === 'presente' || status === 'capacitacion') {
        if (isWeekend(day) && day.getDay() === 0) {
          stats.domingos++;
        } else {
          stats.regulares++;
        }
        stats.total++;
      }
    });

    return stats;
  };

  // Lista unificada para la grilla: activos + inactivos con días, orden alfabético
  const allEmployeesForGrid = [
    ...employees,
    ...inactiveEmployees
  ].sort((a, b) => a.full_name.localeCompare(b.full_name));

  const getPeriodoLabel = () => {
    const monthName = format(currentMonth, 'MMMM yyyy', { locale: es });
    const cap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    if (viewHalf === '1') return `1ra Quincena ${cap}`;
    if (viewHalf === '2') return `2da Quincena ${cap}`;
    return `Mes Completo ${cap}`;
  };

  const exportNomina = () => {
    const clubName = clubs.find(c => c.id === selectedClubId)?.name || selectedClubId;
    const periodo = getPeriodoLabel();
    const fechaGeneracion = new Date().toLocaleDateString('es-PA');

    const nominaData = allEmployeesForGrid.map((emp, index) => {
      const bd = calculateBreakdown(emp.id, days);
      const esBaja = emp.status === 'inactivo';
      return {
        'NO.': index + 1,
        'NOMBRE': emp.full_name,
        'CÉDULA': emp.cedula || '',
        'CARGO': emp.position || '',
        'REG': bd.regulares,
        'DOM': bd.domingos,
        'FER': bd.feriados,
        'INC': bd.incapacidades,
        'APO': bd.apoyo,
        'TOTAL': bd.total,
        'ESTADO': esBaja
          ? `BAJA${emp.termination_date ? ' ' + new Date(emp.termination_date + 'T12:00:00').toLocaleDateString('es-PA') : ''}`
          : 'Activo'
      };
    });

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(nominaData, { origin: 'A4' });
    XLSX.utils.sheet_add_aoa(ws1, [
      [`Club: ${clubName}`],
      [`Período: ${periodo}`],
      [`Generado: ${fechaGeneracion}`],
    ], { origin: 'A1' });
    XLSX.utils.book_append_sheet(wb, ws1, 'Nómina');

    if (inactiveEmployees.length > 0) {
      const liquidacionData = inactiveEmployees.map((emp, index) => {
        const bd = calculateBreakdown(emp.id, days);
        return {
          'NO.': index + 1,
          'NOMBRE': emp.full_name,
          'CÉDULA': emp.cedula || '',
          'CARGO': emp.position || '',
          'FECHA DE BAJA': emp.termination_date
            ? new Date(emp.termination_date + 'T12:00:00').toLocaleDateString('es-PA')
            : '',
          'MOTIVO': emp.termination_reason || '',
          'REG': bd.regulares,
          'DOM': bd.domingos,
          'FER': bd.feriados,
          'INC': bd.incapacidades,
          'APO': bd.apoyo,
          'TOTAL': bd.total
        };
      });

      const ws2 = XLSX.utils.json_to_sheet(liquidacionData, { origin: 'A4' });
      XLSX.utils.sheet_add_aoa(ws2, [
        [`Club: ${clubName}`],
        [`Período: ${periodo} — Pendientes de Liquidación`],
        [`Generado: ${fechaGeneracion}`],
      ], { origin: 'A1' });
      XLSX.utils.book_append_sheet(wb, ws2, 'Liquidaciones');
    }

    const safeClub = clubName.replace(/[^a-zA-Z0-9]/g, '_');
    const safePeriodo = periodo.replace(/[^a-zA-Z0-9 ]/g, '').replace(/ /g, '_');
    XLSX.writeFile(wb, `Nomina_${safeClub}_${safePeriodo}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Control de Asistencia</h2>
          <p className="text-slate-500 text-sm">Programación y cumplimiento mensual por club.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewHalf('1')}
              className={clsx("px-3 py-1.5 text-xs font-medium rounded-md transition-all", viewHalf === '1' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              1ra Quincena
            </button>
            <button
              onClick={() => setViewHalf('2')}
              className={clsx("px-3 py-1.5 text-xs font-medium rounded-md transition-all", viewHalf === '2' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              2da Quincena
            </button>
            <button
              onClick={() => setViewHalf('full')}
              className={clsx("px-3 py-1.5 text-xs font-medium rounded-md transition-all", viewHalf === 'full' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              Mes Completo
            </button>
          </div>

          {(!isRestricted || user?.role === 'Supervisor Interno') && (
            <select
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
              disabled={isRestricted}
              className="rounded-lg border-slate-300 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Seleccionar Club</option>
              {clubs.map(club => (
                <option key={club.id} value={club.id}>{club.name}</option>
              ))}
            </select>
          )}

          <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 hover:bg-slate-50 border-r border-slate-300"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div className="px-4 py-2 text-sm font-medium text-slate-700 min-w-[140px] text-center capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </div>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-slate-50 border-l border-slate-300"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>

          {!isReadOnly && (
            <button
              onClick={() => setIsReconcileModalOpen(true)}
              disabled={!selectedClubId}
              className="inline-flex items-center px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50 shadow-sm transition-colors"
            >
              <Clock className="h-4 w-4 mr-2" />
              Cuadrar Mes
            </button>
          )}

          {(!isReadOnly || user?.role === 'Recursos Humanos') && (
            <button
              onClick={exportNomina}
              disabled={!selectedClubId || loading}
              className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Generar Nómina
            </button>
          )}

          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving || !selectedClubId}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          )}
        </div>
      </div>

      {/* Reconciliation Modal */}
      {isReconcileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800">Cuadre de Mes - {format(currentMonth, 'MMMM yyyy', { locale: es })}</h3>
              <button onClick={() => setIsReconcileModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <CloseIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Total Solicitado</p>
                  <p className="text-3xl font-bold text-blue-900">{requests.reduce((sum, r) => sum + r.requested_count, 0)}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">Total Cumplido</p>
                  <p className="text-3xl font-bold text-green-900">{attendance.filter(a => a.status === 'presente' || a.status === 'capacitacion' || a.status === 'apoyo' || a.status === 'feriado').length}</p>
                </div>
              </div>

              <div className={clsx(
                "p-6 rounded-xl border flex items-center justify-between",
                requests.reduce((sum, r) => sum + r.requested_count, 0) === attendance.filter(a => a.status === 'presente' || a.status === 'capacitacion' || a.status === 'apoyo' || a.status === 'feriado').length
                  ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                  : "bg-amber-50 border-amber-100 text-amber-800"
              )}>
                <div>
                  <p className="text-sm font-medium opacity-80">Diferencia Final</p>
                  <p className="text-2xl font-bold">
                    {Math.abs(requests.reduce((sum, r) => sum + r.requested_count, 0) - attendance.filter(a => a.status === 'presente' || a.status === 'capacitacion' || a.status === 'apoyo' || a.status === 'feriado').length)}
                    <span className="text-sm font-normal ml-2">personas</span>
                  </p>
                </div>
                {requests.reduce((sum, r) => sum + r.requested_count, 0) === attendance.filter(a => a.status === 'presente' || a.status === 'capacitacion' || a.status === 'apoyo' || a.status === 'feriado').length ? (
                  <div className="bg-emerald-500 text-white p-2 rounded-full">
                    <Check className="h-6 w-6" />
                  </div>
                ) : (
                  <div className="bg-amber-500 text-white p-2 rounded-full">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600">
                <p>Este cuadre compara la sumatoria de personas solicitadas por las coordinadoras contra el cumplimiento real registrado.</p>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsReconcileModalOpen(false)}
                className="px-6 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-900 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 p-2 text-left font-semibold text-slate-700 border-r border-slate-200 min-w-[150px]">
                  Empleado
                </th>
                {days.map(day => (
                  <th
                    key={day.toString()}
                    className={clsx(
                      "p-1 text-center font-medium border-r border-slate-200 min-w-[30px] group relative",
                      isWeekend(day) ? "bg-slate-100 text-slate-400" : "text-slate-600"
                    )}
                  >
                    <div className="uppercase text-[8px]">{format(day, 'eee', { locale: es })}</div>
                    <div className="text-xs">{format(day, 'd')}</div>
                    {!isWeekend(day) && (
                      <button
                        onClick={() => markAllPresent(day)}
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 text-white rounded-full p-0.5 shadow-sm hover:bg-blue-600"
                        title="Marcar todos como presente"
                      >
                        <Check className="h-2 w-2" />
                      </button>
                    )}
                  </th>
                ))}
                <th className="p-2 text-center font-semibold text-slate-700 bg-slate-100 border-l border-slate-200 min-w-[40px]">
                  TOTAL
                </th>
                <th className="p-2 text-center font-semibold text-slate-700 bg-slate-50 border-l border-slate-200 min-w-[40px]">
                  REG.
                </th>
                <th className="p-2 text-center font-semibold text-slate-700 bg-slate-50 border-l border-slate-200 min-w-[40px]">
                  DOM.
                </th>
                <th className="p-2 text-center font-semibold text-slate-700 bg-slate-50 border-l border-slate-200 min-w-[40px]">
                  FER.
                </th>
                <th className="p-2 text-center font-semibold text-slate-700 bg-slate-50 border-l border-slate-200 min-w-[40px]">
                  INC.
                </th>
                <th className="p-2 text-center font-semibold text-slate-700 bg-slate-50 border-l border-slate-200 min-w-[40px]">
                  APO.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!selectedClubId ? (
                <tr>
                  <td colSpan={days.length + 7} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-slate-50 rounded-full">
                        <CalendarIcon className="h-10 w-10 text-slate-300" />
                      </div>
                      <div className="max-w-xs mx-auto">
                        <p className="font-semibold text-slate-900 text-sm">No hay club seleccionado</p>
                        <p className="text-xs text-slate-500 mt-1">Seleccione un club para gestionar la asistencia.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={days.length + 7} className="p-8 text-center text-slate-400 italic">
                    Cargando datos...
                  </td>
                </tr>
              ) : (
                <>
                  {/* Solicitud Row */}
                  <tr className="bg-blue-50/50 font-bold">
                    <td className="sticky left-0 z-10 bg-blue-50 p-2 text-blue-800 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                      SOLICITUD
                    </td>
                    {days.map(day => (
                      <td key={day.toString()} className="p-0 border-r border-slate-200">
                        <input
                          type="number"
                          min="0"
                          value={getRequestedCount(day) || ''}
                          onChange={(e) => handleRequestChange(day, e.target.value)}
                          className="w-full h-8 text-center bg-transparent border-none focus:ring-1 focus:ring-blue-500 text-blue-700 font-bold text-xs"
                          placeholder="0"
                        />
                      </td>
                    ))}
                    <td className="p-2 text-center bg-blue-100/50 border-l border-slate-200 text-blue-900 font-bold" colSpan={6}>
                      {requests.filter(r => days.some(d => format(d, 'yyyy-MM-dd') === r.date)).reduce((sum, r) => sum + r.requested_count, 0)}
                    </td>
                  </tr>

                  {/* Cumplimiento Row */}
                  <tr className="bg-green-50/30 font-bold">
                    <td className="sticky left-0 z-10 bg-green-50 p-2 text-green-800 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                      CUMPLIMIENTO
                    </td>
                    {days.map(day => (
                      <td key={day.toString()} className="p-1 text-center border-r border-slate-200 text-green-700 text-xs">
                        {getActualCount(day)}
                      </td>
                    ))}
                    <td className="p-2 text-center bg-green-100/30 border-l border-slate-200 text-green-900 font-bold" colSpan={6}>
                      {attendance.filter(a => days.some(d => format(d, 'yyyy-MM-dd') === a.date) && (a.status === 'presente' || a.status === 'capacitacion' || a.status === 'apoyo' || a.status === 'feriado')).length}
                    </td>
                  </tr>

                  {/* Faltantes Row */}
                  <tr className="bg-red-50/30 font-bold border-b-2 border-slate-200">
                    <td className="sticky left-0 z-10 bg-red-50 p-2 text-red-800 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                      FALTANTES
                    </td>
                    {days.map(day => {
                      const diff = getRequestedCount(day) - getActualCount(day);
                      return (
                        <td key={day.toString()} className={clsx(
                          "p-1 text-center border-r border-slate-200 text-xs",
                          diff > 0 ? "text-red-600" : "text-slate-400"
                        )}>
                          {diff > 0 ? diff : 0}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center bg-red-100/30 border-l border-slate-200 text-red-900 font-bold" colSpan={6}>
                      {Math.max(0, requests.filter(r => days.some(d => format(d, 'yyyy-MM-dd') === r.date)).reduce((sum, r) => sum + r.requested_count, 0) - attendance.filter(a => days.some(d => format(d, 'yyyy-MM-dd') === a.date) && (a.status === 'presente' || a.status === 'capacitacion' || a.status === 'apoyo' || a.status === 'feriado')).length)}
                    </td>
                  </tr>

                  {allEmployeesForGrid.map(emp => {
                    const isBaja = emp.status === 'inactivo';
                    const breakdown = calculateBreakdown(emp.id, days);
                    return (
                      <tr key={emp.id} className={clsx("hover:bg-slate-50 transition-colors", isBaja && "bg-red-50/20")}>
                        <td className={clsx(
                          "sticky left-0 z-10 p-2 font-medium text-slate-900 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)] max-w-[150px]",
                          isBaja ? "bg-red-50" : "bg-white"
                        )}>
                          <div className="flex flex-col gap-0.5">
                            <span className="truncate text-[11px]">{emp.full_name}</span>
                            {isBaja && (
                              <span className="inline-block text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200 w-fit leading-none">
                                BAJA
                              </span>
                            )}
                          </div>
                        </td>
                        {days.map(day => {
                          const status = getStatus(emp.id, day);
                          const config = status ? STATUS_MAP[status] : null;

                          return (
                            <td
                              key={day.toString()}
                              onClick={() => handleStatusChange(emp.id, day)}
                              className={clsx(
                                "p-0 border-r border-slate-200 transition-all",
                                isBaja ? "cursor-default" : "cursor-pointer hover:brightness-95",
                                isWeekend(day) && !status && "bg-slate-50/50"
                              )}
                            >
                              <div className={clsx(
                                "h-8 flex items-center justify-center font-bold text-[10px]",
                                config?.color || "text-slate-300"
                              )}>
                                {config?.short || '-'}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-2 text-center font-bold text-slate-900 bg-slate-100 border-l border-slate-200">
                          {breakdown.total}
                        </td>
                        <td className="p-2 text-center font-medium text-slate-600 border-l border-slate-200">
                          {breakdown.regulares}
                        </td>
                        <td className="p-2 text-center font-medium text-slate-600 border-l border-slate-200">
                          {breakdown.domingos}
                        </td>
                        <td className="p-2 text-center font-medium text-slate-600 border-l border-slate-200">
                          {breakdown.feriados}
                        </td>
                        <td className="p-2 text-center font-medium text-slate-600 border-l border-slate-200">
                          {breakdown.incapacidades}
                        </td>
                        <td className="p-2 text-center font-medium text-slate-600 border-l border-slate-200">
                          {breakdown.apoyo}
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel: Pendientes de Liquidación */}
      {inactiveEmployees.length > 0 && !loading && selectedClubId && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex flex-wrap items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <h3 className="text-sm font-semibold text-red-800">Pendientes de Liquidación</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
              {inactiveEmployees.length}
            </span>
            <p className="text-xs text-red-500 ml-auto">
              Empleados dados de baja con días trabajados en el período
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {inactiveEmployees.map(emp => {
              const bd = calculateBreakdown(emp.id, days);
              return (
                <div key={emp.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{emp.full_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Baja: {emp.termination_date
                        ? new Date(emp.termination_date + 'T12:00:00').toLocaleDateString('es-PA')
                        : 'Sin fecha'}
                      {emp.termination_reason && ` · ${emp.termination_reason}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {bd.regulares > 0 && (
                      <span className="px-2 py-1 rounded-md text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                        REG: {bd.regulares}
                      </span>
                    )}
                    {bd.domingos > 0 && (
                      <span className="px-2 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                        DOM: {bd.domingos}
                      </span>
                    )}
                    {bd.feriados > 0 && (
                      <span className="px-2 py-1 rounded-md text-xs font-bold bg-yellow-100 text-yellow-700 border border-yellow-200">
                        FER: {bd.feriados}
                      </span>
                    )}
                    {bd.incapacidades > 0 && (
                      <span className="px-2 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        INC: {bd.incapacidades}
                      </span>
                    )}
                    {bd.apoyo > 0 && (
                      <span className="px-2 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        APO: {bd.apoyo}
                      </span>
                    )}
                    <span className="px-2 py-1 rounded-md text-xs font-bold bg-slate-800 text-white">
                      TOTAL: {bd.total}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-full mb-1">Leyenda:</div>
        {Object.entries(STATUS_MAP).map(([key, config]) => (
          <div key={key} className="flex items-center gap-2">
            <div className={clsx("w-6 h-6 rounded flex items-center justify-center font-bold text-[8px] border", config.color)}>
              {config.short}
            </div>
            <span className="text-xs text-slate-600">{config.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
