import { apiFetch } from '../lib/api';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import { useAuth, useLocale } from '../context/AuthContext';
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
  FileSpreadsheet,
  Printer,
  Copy,
  Upload
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
  contract_start?: string;
  banco?: string;
  cuenta_bancaria?: string;
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
  const { locale } = useLocale();
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
  const [showPsmtPreview, setShowPsmtPreview] = useState(false);
  const [psmtPreviewRows, setPsmtPreviewRows] = useState<{
    no: number; nombre: string; dias: number; doms: number; incap: number;
    bruto: number; desc: number; neto: number;
    dayCodes: string[]; emp: Employee;
  }[]>([]);
  const [popoverCell, setPopoverCell] = useState<{
    employeeId: string; dateStr: string; x: number; y: number;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [selectedCell, setSelectedCell] = useState<{ empId: string; dayIdx: number } | null>(null);
  const selectedCellRef = useRef<{ empId: string; dayIdx: number } | null>(null);
  const daysRef = useRef<Date[]>([]);
  const allEmpsRef = useRef<Employee[]>([]);
  const [downloadingPsmt, setDownloadingPsmt] = useState(false);
  const [downloadingPsmtGlobal, setDownloadingPsmtGlobal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'saving'>('saved');
  const isInitialLoad = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRef = useRef<() => void>(() => {});
  const [capturingScreen, setCapturingScreen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importForm, setImportForm] = useState({
    clubId: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    half: '1' as '1' | '2',
    sheetName: '',
    headerRow: 4,
    nameCol: 2,
    dataStartRow: 5,
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ synced: number; unmatched: string[] } | null>(null);
  const [showPsmtFromProgModal, setShowPsmtFromProgModal] = useState(false);
  const [generatingPsmtFromProg, setGeneratingPsmtFromProg] = useState(false);

  if (user?.role === 'Coordinadora' || user?.role === 'Supervisor Cliente') {
    return (
      <div className="p-8 text-center">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg inline-block">
          No tienes permiso para acceder a esta sección.
        </div>
      </div>
    );
  }

  const isReadOnly = user?.role !== 'Administrador' && user?.role !== 'Super Administrador'
    && user?.role !== 'Supervisor Interno' && user?.role !== 'Supervisora'
    && user?.role !== 'Supervisora Redvolution';
  // Restricted = locked to their own club. Supervisora Redvolution always sees all clubs.
  const isRestricted = user?.role === 'Supervisor Interno'
    || (user?.role === 'Supervisora' && !!user?.club_id);

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

        // Inactivos que aparecen en el mes: los que tienen registros en el período
        // O cuya fecha de baja cae dentro del mes (aunque aún no tengan registros)
        const attEmpIds = new Set(attData.map(a => a.employee_id));
        const inactivosConDias = inactiveData.filter(e => {
          if (attEmpIds.has(e.id)) return true;
          if (!e.termination_date) return false;
          const termDate = new Date(e.termination_date + 'T12:00:00');
          return termDate >= monthStart && termDate <= monthEnd;
        });

        setEmployees(activeData);
        setInactiveEmployees(inactivosConDias);
        setAttendance(attData);
        setRequests(reqData);
      }
    } catch (error) {
      console.error('Error fetching attendance data:', error);
    } finally {
      setLoading(false);
      isInitialLoad.current = false;
    }
  }, [selectedClubId, currentMonth]);

  useEffect(() => {
    apiFetch('/api/clubs')
      .then(res => (res.ok ? res.json() : []))
      .then(data => setClubs(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!popoverCell) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverCell(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popoverCell]);

  const openStatusPopover = (employeeId: string, date: Date, e: React.MouseEvent) => {
    if (isReadOnly) return;
    if (inactiveEmployees.some(emp => emp.id === employeeId)) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverCell({
      employeeId,
      dateStr: format(date, 'yyyy-MM-dd'),
      x: rect.left,
      y: rect.bottom + 4,
    });
  };

  const setStatusDirect = (status: string | null) => {
    if (!popoverCell) return;
    setAttendance(prev => {
      const filtered = prev.filter(
        a => !(a.employee_id === popoverCell.employeeId && a.date === popoverCell.dateStr)
      );
      if (!status) return filtered;
      return [...filtered, { employee_id: popoverCell.employeeId, date: popoverCell.dateStr, status }];
    });
    setPopoverCell(null);
  };

  const handleSave = async () => {
    if (!selectedClubId) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      const attRes = await apiFetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        },
        body: JSON.stringify({
          records: attendance,
          club_id: selectedClubId,
          start_date: format(monthStart, 'yyyy-MM-dd'),
          end_date: format(monthEnd, 'yyyy-MM-dd'),
        })
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
        setSaveStatus('saved');
      } else {
        setSaveStatus('pending');
      }
    } catch (error) {
      setSaveStatus('pending');
      toast.error('Error al guardar datos');
    } finally {
      setSaving(false);
    }
  };

  // Keep ref in sync so auto-save timer always calls the latest version
  handleSaveRef.current = handleSave;

  // Auto-save: 2 seconds after last change
  useEffect(() => {
    if (isInitialLoad.current || loading || isReadOnly) return;
    setSaveStatus('pending');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => handleSaveRef.current(), 2000);
  }, [attendance, requests]);

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

  const markEmployeeAllPresent = (employeeId: string) => {
    const newRecords = days.map(day => ({
      employee_id: employeeId,
      date: format(day, 'yyyy-MM-dd'),
      status: 'presente'
    }));
    setAttendance(prev => {
      const dateSet = new Set(days.map(d => format(d, 'yyyy-MM-dd')));
      const filtered = prev.filter(a => !(a.employee_id === employeeId && dateSet.has(a.date)));
      return [...filtered, ...newRecords];
    });
  };

  const fillAllPresent = () => {
    const dateStrs = days.map(d => format(d, 'yyyy-MM-dd'));
    const newRecords = employees.flatMap(emp =>
      dateStrs.map(dateStr => ({ employee_id: emp.id, date: dateStr, status: 'presente' }))
    );
    setAttendance(prev => {
      const dateSet = new Set(dateStrs);
      const filtered = prev.filter(a => !dateSet.has(a.date));
      return [...filtered, ...newRecords];
    });
  };

  const copyFromPrevDay = (day: Date) => {
    const prevDay = new Date(day);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDateStr = format(prevDay, 'yyyy-MM-dd');
    const currentDateStr = format(day, 'yyyy-MM-dd');

    const prevRecords = attendance.filter(a => a.date === prevDateStr);
    if (prevRecords.length === 0) {
      toast.info('No hay registros del día anterior para copiar.');
      return;
    }

    const newRecords = prevRecords.map(a => ({ ...a, date: currentDateStr }));
    setAttendance(prev => {
      const filtered = prev.filter(a => a.date !== currentDateStr);
      return [...filtered, ...newRecords];
    });
    toast.success(`Copiado desde el ${format(prevDay, 'd MMM', { locale: es })}`);
  };

  // Keep refs in sync with latest render values so keyboard handler doesn't go stale
  selectedCellRef.current = selectedCell;
  daysRef.current = days;
  allEmpsRef.current = [
    ...employees,
    ...inactiveEmployees
  ].sort((a, b) => a.full_name.localeCompare(b.full_name));

  const KEY_STATUS: Record<string, string> = {
    a: 'presente', l: 'libre', p: 'permiso',
    f: 'ausente', i: 'incapacidad', c: 'capacitacion', h: 'feriado',
  };

  useEffect(() => {
    if (isReadOnly) return;
    const handler = (e: KeyboardEvent) => {
      const cell = selectedCellRef.current;
      if (!cell) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      const daysList = daysRef.current;
      const allEmps = allEmpsRef.current;

      const applyStatus = (status: string | null) => {
        const dateStr = format(daysList[cell.dayIdx], 'yyyy-MM-dd');
        setAttendance(prev => {
          const filtered = prev.filter(a => !(a.employee_id === cell.empId && a.date === dateStr));
          return status ? [...filtered, { employee_id: cell.empId, date: dateStr, status }] : filtered;
        });
      };

      if (KEY_STATUS[key]) {
        e.preventDefault();
        applyStatus(KEY_STATUS[key]);
        const next = cell.dayIdx + 1;
        setSelectedCell(next < daysList.length ? { empId: cell.empId, dayIdx: next } : cell);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        applyStatus(null);
        const next = cell.dayIdx + 1;
        setSelectedCell(next < daysList.length ? { empId: cell.empId, dayIdx: next } : cell);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (cell.dayIdx < daysList.length - 1) setSelectedCell({ ...cell, dayIdx: cell.dayIdx + 1 });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (cell.dayIdx > 0) setSelectedCell({ ...cell, dayIdx: cell.dayIdx - 1 });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = allEmps.findIndex(emp => emp.id === cell.empId);
        if (idx < allEmps.length - 1) setSelectedCell({ empId: allEmps[idx + 1].id, dayIdx: cell.dayIdx });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const idx = allEmps.findIndex(emp => emp.id === cell.empId);
        if (idx < allEmps.length - 1) setSelectedCell({ empId: allEmps[idx + 1].id, dayIdx: cell.dayIdx });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = allEmps.findIndex(emp => emp.id === cell.empId);
        if (idx > 0) setSelectedCell({ empId: allEmps[idx - 1].id, dayIdx: cell.dayIdx });
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const next = cell.dayIdx + 1;
        if (next < daysList.length) {
          setSelectedCell({ ...cell, dayIdx: next });
        } else {
          const idx = allEmps.findIndex(emp => emp.id === cell.empId);
          if (idx < allEmps.length - 1) setSelectedCell({ empId: allEmps[idx + 1].id, dayIdx: 0 });
        }
      } else if (e.key === 'Escape') {
        setSelectedCell(null);
        setPopoverCell(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isReadOnly]);

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
    const fechaGeneracion = new Date().toLocaleDateString(locale);

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
          ? `BAJA${emp.termination_date ? ' ' + new Date(emp.termination_date + 'T12:00:00').toLocaleDateString(locale) : ''}`
          : 'Activo'
      };
    });

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(nominaData, { origin: 'A4' } as any);
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
            ? new Date(emp.termination_date + 'T12:00:00').toLocaleDateString(locale)
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

      const ws2 = XLSX.utils.json_to_sheet(liquidacionData, { origin: 'A4' } as any);
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

  const SALARIO_DIA = 25.28;
  const SALARIO_DOM = 33.18;

  const toPsmtCode = (status: string | null | undefined, day: Date): string => {
    if (!status) return '';
    const isSunday = day.getDay() === 0;
    switch (status) {
      case 'presente':
      case 'capacitacion':
      case 'apoyo':
        return isSunday ? 'D' : '1';
      case 'incapacidad': return 'I';
      case 'permiso': return 'P';
      case 'feriado': return 'F';
      default: return '';
    }
  };

  const openPsmtPreview = () => {
    const periodDays = viewHalf === '1' ? firstHalf : secondHalf;
    const rows = employees.map((emp, idx) => {
      const dayCodes = periodDays.map(day => toPsmtCode(getStatus(emp.id, day), day));
      const dias = dayCodes.filter(c => c === '1').length;
      const doms = dayCodes.filter(c => c === 'D').length;
      const incap = dayCodes.filter(c => c === 'I').length;
      const fer50 = dayCodes.filter(c => c === 'F').length;
      const bruto = parseFloat((dias * SALARIO_DIA + doms * SALARIO_DOM + incap * SALARIO_DIA + fer50 * SALARIO_DIA).toFixed(2));
      const ss = parseFloat((bruto * 0.0975).toFixed(4));
      const se = parseFloat((bruto * 0.0125).toFixed(4));
      const desc = parseFloat((ss + se).toFixed(2));
      const neto = parseFloat((bruto - desc).toFixed(2));
      return { no: idx + 1, nombre: emp.full_name, dias, doms, incap, bruto, desc, neto, dayCodes, emp };
    });
    setPsmtPreviewRows(rows);
    setShowPsmtPreview(true);
  };

  const downloadPsmt = async () => {
    if (downloadingPsmt) return;
    setDownloadingPsmt(true);
    try {
      const clubName = clubs.find(c => c.id === selectedClubId)?.name || selectedClubId;
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1;
      const periodoLabel = viewHalf === '1' ? '1RA_Q' : '2DA_Q';

      const res = await apiFetch(
        `/api/payroll/psmt-planilla?clubId=${selectedClubId}&year=${year}&month=${month}&half=${viewHalf}`
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as any).error || 'Error al generar la planilla');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeClub = clubName.replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `PlanillaPSMT_${safeClub}_${periodoLabel}_${format(currentMonth, 'MMyyyy')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setShowPsmtPreview(false);
    } catch {
      toast.error('Error de conexión al generar la planilla');
    } finally {
      setDownloadingPsmt(false);
    }
  };

  const downloadPsmtGlobal = async () => {
    if (downloadingPsmtGlobal) return;
    setDownloadingPsmtGlobal(true);
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1;
      const periodoLabel = viewHalf === '1' ? '1RA_Q' : '2DA_Q';
      const res = await apiFetch(
        `/api/payroll/psmt-planilla-global?year=${year}&month=${month}&half=${viewHalf}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as any).error || 'Error al generar la planilla global');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PlanillaPSMT_GLOBAL_${periodoLabel}_${format(currentMonth, 'MMyyyy')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Error de conexión al generar la planilla global');
    } finally {
      setDownloadingPsmtGlobal(false);
    }
  };

  const MONTHS_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

  const openImportModal = () => {
    const clubName = clubs.find(c => c.id === selectedClubId)?.name?.toUpperCase() ?? '';
    const isCostaVerde = clubName.includes('COSTA') || clubName.includes('VERDE');
    setImportForm({
      clubId: selectedClubId || (clubs[0]?.id ?? ''),
      year: currentMonth.getFullYear(),
      month: currentMonth.getMonth() + 1,
      half: viewHalf === '2' ? '2' : '1',
      sheetName: `${MONTHS_ES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`,
      headerRow: isCostaVerde ? 5 : 4,
      nameCol: 2,
      dataStartRow: isCostaVerde ? 6 : 5,
    });
    setImportFile(null);
    setImportResult(null);
    setShowImportModal(true);
  };

  const handleImportProgramacion = async () => {
    if (!importFile || !importForm.clubId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('clubId', importForm.clubId);
      fd.append('year', String(importForm.year));
      fd.append('month', String(importForm.month));
      fd.append('half', importForm.half);
      fd.append('sheetName', importForm.sheetName);
      fd.append('headerRow', String(importForm.headerRow));
      fd.append('nameCol', String(importForm.nameCol));
      fd.append('dataStartRow', String(importForm.dataStartRow));
      const res = await apiFetch('/api/attendance/import-programacion', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = 'Error al importar';
        try { msg = JSON.parse(text).error || msg; } catch { msg = text.slice(0, 120) || `HTTP ${res.status}`; }
        toast.error(msg);
        return;
      }
      const data = await res.json();
      setImportResult(data);
      toast.success(`${data.synced} marcaciones importadas`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Error al importar');
    } finally {
      setImporting(false);
    }
  };

  const openPsmtFromProgModal = () => {
    const clubName = clubs.find(c => c.id === selectedClubId)?.name?.toUpperCase() ?? '';
    const isCostaVerde = clubName.includes('COSTA') || clubName.includes('VERDE');
    setImportForm({
      clubId: selectedClubId || (clubs[0]?.id ?? ''),
      year: currentMonth.getFullYear(),
      month: currentMonth.getMonth() + 1,
      half: viewHalf === '2' ? '2' : '1',
      sheetName: `${MONTHS_ES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`,
      headerRow: isCostaVerde ? 5 : 4,
      nameCol: 2,
      dataStartRow: isCostaVerde ? 6 : 5,
    });
    setImportFile(null);
    setShowPsmtFromProgModal(true);
  };

  const handleGeneratePsmtFromProg = async () => {
    if (!importFile || !importForm.clubId) return;
    setGeneratingPsmtFromProg(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('clubId', importForm.clubId);
      fd.append('year', String(importForm.year));
      fd.append('month', String(importForm.month));
      fd.append('half', importForm.half);
      fd.append('sheetName', importForm.sheetName);
      fd.append('headerRow', String(importForm.headerRow));
      fd.append('nameCol', String(importForm.nameCol));
      fd.append('dataStartRow', String(importForm.dataStartRow));
      const res = await apiFetch('/api/payroll/psmt-from-programacion', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = 'Error al generar PSMT';
        try { msg = JSON.parse(text).error || msg; } catch { msg = text.slice(0, 120) || `HTTP ${res.status}`; }
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition');
      const fnMatch = cd?.match(/filename="([^"]+)"/);
      a.download = fnMatch?.[1] || 'planilla-psmt.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Planilla PSMT generada y descargada ✓');
      setShowPsmtFromProgModal(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al generar PSMT');
    } finally {
      setGeneratingPsmtFromProg(false);
    }
  };

  const captureGrid = async () => {
    if (!gridRef.current || capturingScreen) return;
    setCapturingScreen(true);
    try {
      const el = gridRef.current;
      const parent = el.parentElement;

      // Temporarily remove overflow clipping so full scrollable content is captured
      if (parent) parent.classList.remove('overflow-hidden');

      const dataUrl = await toPng(el, {
        quality: 1,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: el.scrollWidth,
        height: el.scrollHeight,
        style: { overflow: 'visible' },
      });

      if (parent) parent.classList.add('overflow-hidden');

      const link = document.createElement('a');
      const clubName = clubs.find(c => c.id === selectedClubId)?.name || 'Club';
      link.download = `Asistencia_${clubName}_${getPeriodoLabel().replace(/ /g, '_')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('html-to-image error:', e);
      toast.error('Error al generar la imagen');
    } finally {
      setCapturingScreen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Print-only header */}
      <div className="hidden print:block mb-4">
        <h2 className="text-xl font-bold text-slate-900">Control de Asistencia — {getPeriodoLabel()}</h2>
        {clubs.find(c => c.id === selectedClubId) && (
          <p className="text-sm text-slate-600">{clubs.find(c => c.id === selectedClubId)?.name}</p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
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

          {!isReadOnly && selectedClubId && (
            <button
              onClick={fillAllPresent}
              disabled={loading || employees.length === 0}
              className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors"
              title="Marca a todas las empleadas como Asignada en todos los días del período visible"
            >
              <Check className="h-4 w-4 mr-2" />
              Llenar Período
            </button>
          )}

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


          {['Administrador', 'Super Administrador'].includes(user?.role || '') && viewHalf !== 'full' && (
            <button
              onClick={downloadPsmtGlobal}
              disabled={downloadingPsmtGlobal || loading}
              className="inline-flex items-center px-4 py-2 bg-indigo-700 text-white rounded-lg text-sm font-medium hover:bg-indigo-800 disabled:opacity-50 shadow-sm transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              {downloadingPsmtGlobal ? 'Generando...' : 'PSMT Global'}
            </button>
          )}

          {['Administrador', 'Super Administrador', 'Recursos Humanos', 'Supervisora Redvolution'].includes(user?.role || '') && (
            <button
              onClick={openImportModal}
              className="inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 shadow-sm transition-colors"
            >
              <Upload className="h-4 w-4 mr-2" />
              Importar Programación
            </button>
          )}

          {['Administrador', 'Super Administrador', 'Recursos Humanos', 'Supervisora Redvolution'].includes(user?.role || '') && (
            <button
              onClick={openPsmtFromProgModal}
              className="inline-flex items-center px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 shadow-sm transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              PSMT desde Prog.
            </button>
          )}

          <button
            onClick={captureGrid}
            disabled={capturingScreen || loading}
            className="inline-flex items-center px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 shadow-sm transition-colors"
          >
            <Printer className="h-4 w-4 mr-2" />
            {capturingScreen ? 'Capturando...' : 'Capturar'}
          </button>

          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving || !selectedClubId}
              className={clsx(
                "inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50",
                saveStatus === 'saved' ? "bg-emerald-600 hover:bg-emerald-700 text-white" :
                saveStatus === 'saving' ? "bg-blue-500 text-white" :
                "bg-blue-600 hover:bg-blue-700 text-white"
              )}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : 'Guardar'}
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

      <div ref={gridRef} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:border-0 print:shadow-none">
        <div className="overflow-x-auto attendance-print-wrapper">
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
                          "sticky left-0 z-10 p-2 font-medium text-slate-900 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)] max-w-[150px] group/row",
                          isBaja ? "bg-red-50" : "bg-white"
                        )}>
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="truncate text-[11px]">{emp.full_name}</span>
                              {isBaja && (
                                <span className="inline-block text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200 w-fit leading-none">
                                  BAJA
                                </span>
                              )}
                            </div>
                            {!isReadOnly && !isBaja && (
                              <button
                                onClick={() => markEmployeeAllPresent(emp.id)}
                                className="opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 bg-emerald-500 text-white rounded p-0.5 hover:bg-emerald-600"
                                title="Marcar toda la quincena como Asignada"
                              >
                                <Check className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        {days.map((day, dayIdx) => {
                          const status = getStatus(emp.id, day);
                          const config = status ? STATUS_MAP[status] : null;
                          const isSelected = selectedCell?.empId === emp.id && selectedCell?.dayIdx === dayIdx;
                          const isAfterTermination = isBaja && emp.termination_date
                            ? format(day, 'yyyy-MM-dd') > emp.termination_date
                            : false;

                          return (
                            <td
                              key={day.toString()}
                              onClick={(e) => {
                                if (isReadOnly || isBaja || isAfterTermination) return;
                                e.stopPropagation();
                                setSelectedCell({ empId: emp.id, dayIdx });
                                setPopoverCell(null);
                              }}
                              onDoubleClick={(e) => { if (!isAfterTermination) openStatusPopover(emp.id, day, e); }}
                              className={clsx(
                                "p-0 border-r border-slate-200 transition-all",
                                isAfterTermination ? "cursor-not-allowed bg-red-400/70" : isBaja ? "cursor-default" : "cursor-pointer",
                                !isAfterTermination && isWeekend(day) && !status && "bg-slate-50/50",
                                !isAfterTermination && isSelected && "ring-2 ring-inset ring-blue-500 bg-blue-50"
                              )}
                            >
                              <div className={clsx(
                                "h-8 flex items-center justify-center font-bold text-[10px]",
                                isAfterTermination ? "text-red-700" : config?.color || "text-slate-300"
                              )}>
                                {isAfterTermination ? '' : (config?.short || '-')}
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
                        ? new Date(emp.termination_date + 'T12:00:00').toLocaleDateString(locale)
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

      {!isReadOnly && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-blue-50 rounded-xl border border-blue-200 text-xs">
          <span className="font-semibold text-blue-700 mr-1">Teclas rápidas:</span>
          {[
            { key: 'A', label: 'Asignada' },
            { key: 'L', label: 'Libre' },
            { key: 'P', label: 'Permiso' },
            { key: 'F', label: 'Falta' },
            { key: 'I', label: 'Incapacidad' },
            { key: 'C', label: 'Capacitación' },
            { key: 'H', label: 'Feriado' },
          ].map(({ key, label }) => (
            <span key={key} className="flex items-center gap-1 text-slate-600">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-bold text-slate-800 shadow-sm">{key}</kbd>
              <span className="text-slate-500">{label}</span>
            </span>
          ))}
          <span className="ml-2 text-slate-400">· Flechas para navegar · Delete para borrar · Esc para salir</span>
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

      {/* Popover selección de estado */}
      {popoverCell && (
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-slate-200 p-2 w-52"
          style={{ left: popoverCell.x, top: popoverCell.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="grid grid-cols-2 gap-1">
            {STATUS_ORDER.map(key => {
              const cfg = STATUS_MAP[key];
              const isActive = attendance.find(
                a => a.employee_id === popoverCell.employeeId && a.date === popoverCell.dateStr
              )?.status === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusDirect(key)}
                  className={clsx(
                    "flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    cfg.color,
                    isActive ? "ring-2 ring-offset-1 ring-blue-500" : "hover:brightness-95"
                  )}
                >
                  <span className="font-bold text-[11px] w-5 text-center shrink-0">{cfg.short}</span>
                  <span className="truncate">{cfg.label}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setStatusDirect(null)}
            className="mt-1 w-full text-xs text-slate-400 hover:text-slate-600 py-1.5 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200"
          >
            Borrar estado
          </button>
        </div>
      )}

      {/* Modal Preview Planilla PSMT */}
      {showPsmtPreview && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60" onClick={() => setShowPsmtPreview(false)} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Vista Previa — Planilla PSMT</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Revisá los números antes de descargar. {psmtPreviewRows.length} empleadas · {getPeriodoLabel()}
                  </p>
                </div>
                <button onClick={() => setShowPsmtPreview(false)} className="text-slate-400 hover:text-slate-600">
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="overflow-auto flex-1 px-6 py-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-bold text-slate-600 uppercase">
                      <th className="px-3 py-2 text-left border border-slate-200">#</th>
                      <th className="px-3 py-2 text-left border border-slate-200">Nombre</th>
                      <th className="px-3 py-2 text-center border border-slate-200">Días</th>
                      <th className="px-3 py-2 text-center border border-slate-200">Doms</th>
                      <th className="px-3 py-2 text-center border border-slate-200">Inc</th>
                      <th className="px-3 py-2 text-right border border-slate-200">Bruto</th>
                      <th className="px-3 py-2 text-right border border-slate-200">Desc.</th>
                      <th className="px-3 py-2 text-right border border-slate-200 font-black text-slate-800">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {psmtPreviewRows.map(r => (
                      <tr key={r.emp.id} className="hover:bg-slate-50 border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-400 text-xs border border-slate-100">{r.no}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 border border-slate-100">{r.nombre}</td>
                        <td className="px-3 py-2 text-center border border-slate-100">
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">{r.dias}</span>
                        </td>
                        <td className="px-3 py-2 text-center border border-slate-100">
                          {r.doms > 0
                            ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">{r.doms}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center border border-slate-100">
                          {r.incap > 0
                            ? <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-bold">{r.incap}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600 border border-slate-100">${r.bruto.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-red-500 text-xs border border-slate-100">-${r.desc.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900 border border-slate-100">${r.neto.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-violet-50 font-bold">
                      <td colSpan={5} className="px-3 py-2 text-right text-slate-700 text-xs border border-slate-200">TOTALES</td>
                      <td className="px-3 py-2 text-right text-slate-800 border border-slate-200">
                        ${psmtPreviewRows.reduce((s, r) => s + r.bruto, 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-red-500 text-xs border border-slate-200">
                        -${psmtPreviewRows.reduce((s, r) => s + r.desc, 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-violet-700 border border-slate-200">
                        ${psmtPreviewRows.reduce((s, r) => s + r.neto, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠ Revisá que los números cuadren con tu control manual antes de enviar a PriceSmart.
                  Bonificación, préstamo y otros descuentos quedan vacíos para completar si aplica.
                </p>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
                <button
                  onClick={() => setShowPsmtPreview(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={downloadPsmt}
                  disabled={downloadingPsmt}
                  className="inline-flex items-center px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-60 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  {downloadingPsmt ? 'Generando...' : 'Confirmar y Descargar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Programación Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 rounded-lg">
                  <Upload className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Importar Programación</h3>
                  <p className="text-xs text-slate-500">Cargá el Excel de marcaciones para sincronizar asistencia</p>
                </div>
              </div>
              <button onClick={() => setShowImportModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <CloseIcon className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Club */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Club</label>
                <select
                  value={importForm.clubId}
                  onChange={e => {
                    const id = e.target.value;
                    const name = clubs.find(c => c.id === id)?.name?.toUpperCase() ?? '';
                    const isCV = name.includes('COSTA') || name.includes('VERDE');
                    setImportForm(f => ({ ...f, clubId: id, headerRow: isCV ? 5 : 4, dataStartRow: isCV ? 6 : 5 }));
                  }}
                  className="w-full rounded-lg border-slate-300 text-sm focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Seleccionar club...</option>
                  {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Año / Mes / Quincena */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Año</label>
                  <input
                    type="number"
                    value={importForm.year}
                    onChange={e => setImportForm(f => ({ ...f, year: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mes (1–12)</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={importForm.month}
                    onChange={e => setImportForm(f => ({ ...f, month: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quincena</label>
                  <select
                    value={importForm.half}
                    onChange={e => setImportForm(f => ({ ...f, half: e.target.value as '1' | '2' }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="1">1ra (días 1–15)</option>
                    <option value="2">2da (días 16–fin)</option>
                  </select>
                </div>
              </div>

              {/* Nombre hoja */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nombre de la hoja (pestaña Excel)</label>
                <input
                  type="text"
                  value={importForm.sheetName}
                  onChange={e => setImportForm(f => ({ ...f, sheetName: e.target.value }))}
                  placeholder="Ej: JULIO 2026"
                  className="w-full rounded-lg border-slate-300 text-sm focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              {/* Parámetros técnicos */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fila encabezado</label>
                  <input
                    type="number"
                    value={importForm.headerRow}
                    onChange={e => setImportForm(f => ({ ...f, headerRow: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Col. nombre</label>
                  <input
                    type="number"
                    value={importForm.nameCol}
                    onChange={e => setImportForm(f => ({ ...f, nameCol: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fila inicio datos</label>
                  <input
                    type="number"
                    value={importForm.dataStartRow}
                    onChange={e => setImportForm(f => ({ ...f, dataStartRow: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Archivo */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Archivo Excel (.xlsx)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                />
              </div>

              {/* Resultado */}
              {importResult && (
                <div className={clsx("rounded-lg p-3 text-sm", importResult.synced > 0 ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50 border border-slate-200")}>
                  <p className="font-medium text-slate-800">
                    ✓ {importResult.synced} marcaciones sincronizadas
                  </p>
                  {importResult.unmatched.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-amber-700 font-medium">Sin match ({importResult.unmatched.length}):</p>
                      <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                        {importResult.unmatched.map(n => (
                          <li key={n} className="text-xs text-slate-600">• {n}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                {importResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!importResult && (
                <button
                  onClick={handleImportProgramacion}
                  disabled={importing || !importFile || !importForm.clubId}
                  className="inline-flex items-center px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 transition-colors"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {importing ? 'Importando...' : 'Importar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {showPsmtFromProgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 rounded-lg">
                  <FileSpreadsheet className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Generar PSMT desde Programación</h3>
                  <p className="text-xs text-slate-500">Subí el Excel de programación y descargá la planilla PSMT lista</p>
                </div>
              </div>
              <button onClick={() => setShowPsmtFromProgModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <CloseIcon className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Club */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Club</label>
                <select
                  value={importForm.clubId}
                  onChange={e => {
                    const id = e.target.value;
                    const name = clubs.find(c => c.id === id)?.name?.toUpperCase() ?? '';
                    const isCV = name.includes('COSTA') || name.includes('VERDE');
                    setImportForm(f => ({ ...f, clubId: id, headerRow: isCV ? 5 : 4, dataStartRow: isCV ? 6 : 5 }));
                  }}
                  className="w-full rounded-lg border-slate-300 text-sm focus:ring-violet-500 focus:border-violet-500"
                >
                  <option value="">Seleccionar club...</option>
                  {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Año / Mes / Quincena */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Año</label>
                  <input
                    type="number"
                    value={importForm.year}
                    onChange={e => setImportForm(f => ({ ...f, year: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-violet-500 focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mes (1–12)</label>
                  <input
                    type="number" min={1} max={12}
                    value={importForm.month}
                    onChange={e => setImportForm(f => ({ ...f, month: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-violet-500 focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quincena</label>
                  <select
                    value={importForm.half}
                    onChange={e => setImportForm(f => ({ ...f, half: e.target.value as '1' | '2' }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-violet-500 focus:border-violet-500"
                  >
                    <option value="1">1ra (días 1–15)</option>
                    <option value="2">2da (días 16–fin)</option>
                  </select>
                </div>
              </div>

              {/* Nombre hoja */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nombre de la hoja (pestaña Excel)</label>
                <input
                  type="text"
                  value={importForm.sheetName}
                  onChange={e => setImportForm(f => ({ ...f, sheetName: e.target.value }))}
                  placeholder="Ej: JULIO 2026"
                  className="w-full rounded-lg border-slate-300 text-sm focus:ring-violet-500 focus:border-violet-500"
                />
              </div>

              {/* Parámetros técnicos */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fila encabezado</label>
                  <input
                    type="number"
                    value={importForm.headerRow}
                    onChange={e => setImportForm(f => ({ ...f, headerRow: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-violet-500 focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Col. nombre</label>
                  <input
                    type="number"
                    value={importForm.nameCol}
                    onChange={e => setImportForm(f => ({ ...f, nameCol: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-violet-500 focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fila inicio datos</label>
                  <input
                    type="number"
                    value={importForm.dataStartRow}
                    onChange={e => setImportForm(f => ({ ...f, dataStartRow: Number(e.target.value) }))}
                    className="w-full rounded-lg border-slate-300 text-sm focus:ring-violet-500 focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Archivo */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Archivo Excel de programación (.xlsx)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
                />
              </div>

              <div className="rounded-lg bg-violet-50 border border-violet-200 px-4 py-3 text-xs text-violet-800">
                <strong>Marcas reconocidas:</strong> A = presente · P = permiso · I = incapacidad · F = feriado<br />
                L, X, D, vacío = libre/descanso (no genera código en planilla)
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => setShowPsmtFromProgModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGeneratePsmtFromProg}
                disabled={generatingPsmtFromProg || !importFile || !importForm.clubId}
                className="inline-flex items-center px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-60 transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {generatingPsmtFromProg ? 'Generando...' : 'Generar y Descargar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
