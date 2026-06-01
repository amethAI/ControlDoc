import React, { useEffect, useState, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Download, Search, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

interface EmployeeChecklist {
  id: string;
  full_name: string;
  cedula: string;
  contract_type: string;
  contract_start: string;
  contract_end: string;
  club_id: string;
  documents: any[];
  isManual?: boolean;
  carta_ingreso?: string;
  carnet_verde?: string;
  carnet_blanco?: string;
  aviso_css?: string;
  contrato_sellado?: string;
}

interface Club {
  id: string;
  name: string;
  country: string | null;
}

export default function ChecklistContratos() {
  const { user } = useAuth();
  const canEdit = user?.role === 'Administrador' || user?.role === 'Super Administrador' || user?.role === 'Supervisor Interno';
  const [employees, setEmployees] = useState<EmployeeChecklist[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [localEdits, setLocalEdits] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [empRes, clubsRes] = await Promise.all([
          apiFetch('/api/employees?status=activo'),
          apiFetch('/api/clubs'),
        ]);

        if (clubsRes.ok) {
          const clubsData = await clubsRes.json();
          setClubs(clubsData);
          // Pre-select first club for club-scoped roles
          if (user?.role === 'Supervisor Interno' && user.club_id) {
            setSelectedClubId(user.club_id);
          } else if (Array.isArray(clubsData) && clubsData.length > 0) {
            setSelectedClubId(clubsData[0].id);
          }
        }

        if (empRes.ok) {
          const data = await empRes.json();
          const employeesWithDocs = await Promise.all(
            data.map(async (emp: any) => {
              const docsRes = await apiFetch(`/api/employees/${emp.id}/documents`);
              let documents: any[] = [];
              if (docsRes.ok) documents = await docsRes.json();
              return { ...emp, documents };
            })
          );
          setEmployees(employeesWithDocs);
        }
      } catch (error) {
        console.error('Error fetching checklist data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const selectedClub = clubs.find(c => c.id === selectedClubId);
  const clubName = selectedClub?.name?.toUpperCase() || '';

  const getDocDate = (docs: any[], typeName: string) => {
    const doc = docs.find(d => d.document_types?.name?.toLowerCase()?.includes(typeName.toLowerCase()) && d.is_current === 1);
    if (!doc || !doc.expiry_date) return '';
    return new Date(doc.expiry_date).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '');
  };

  const hasDoc = (docs: any[], typeName: string) => {
    const doc = docs.find(d => d.document_types?.name?.toLowerCase()?.includes(typeName.toLowerCase()) && d.is_current === 1);
    return doc ? 'SÍ' : 'NO';
  };

  const handleEdit = (id: string, field: string, value: any) => {
    setLocalEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  const handleSave = async (id: string, field: string, value: any) => {
    if (id.startsWith('manual-')) return;
    try {
      await apiFetch(`/api/employees/${id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
    } catch (error) {
      console.error('Error saving checklist field:', error);
    }
  };

  const getVal = (emp: EmployeeChecklist, field: string) => {
    if (localEdits[emp.id]?.[field] !== undefined) return localEdits[emp.id][field];
    if (field === 'full_name') return emp.full_name;
    if (field === 'cedula') return emp.cedula;
    if (field === 'contract_start') return emp.contract_start ? emp.contract_start.split('T')[0] : '';
    if (field === 'contract_end') return emp.contract_end ? emp.contract_end.split('T')[0] : '';
    if (field === 'contract_type') return emp.contract_type || '';
    if (field === 'carta_ingreso') return hasDoc(emp.documents, 'Carta de ingreso') === 'SÍ' ? 'SÍ' : 'NO';
    if (field === 'contrato_sellado') return hasDoc(emp.documents, 'Contrato sellado') === 'SÍ' ? 'SÍ' : 'NO';
    if (field === 'carnet_verde') {
      const doc = emp.documents.find(d => d.document_types?.name?.toLowerCase()?.includes('carnet verde') && d.is_current === 1);
      return doc?.expiry_date ? doc.expiry_date.split('T')[0] : '';
    }
    if (field === 'carnet_blanco') {
      const doc = emp.documents.find(d => d.document_types?.name?.toLowerCase()?.includes('carnet blanco') && d.is_current === 1);
      return doc?.expiry_date ? doc.expiry_date.split('T')[0] : '';
    }
    if (field === 'aviso_css') {
      const doc = emp.documents.find(d => {
        const name = d.document_types?.name?.toLowerCase() || '';
        return (name.includes('aviso de entrada') || name.includes('afiliación css')) && d.is_current === 1;
      });
      return doc?.expiry_date ? doc.expiry_date.split('T')[0] : '';
    }
    return '';
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '');
    }
    return dateStr;
  };

  const getProbatoryEnd = (contractStartStr: string) => {
    if (!contractStartStr || !contractStartStr.match(/^\d{4}-\d{2}-\d{2}$/)) return '';
    const date = new Date(`${contractStartStr}T12:00:00`);
    date.setMonth(date.getMonth() + 3);
    return date.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '');
  };

  const getProbatoryColor = (contractStartStr: string) => {
    if (!contractStartStr || !contractStartStr.match(/^\d{4}-\d{2}-\d{2}$/)) return '';
    const date = new Date(`${contractStartStr}T12:00:00`);
    date.setMonth(date.getMonth() + 3);
    const today = new Date();
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'bg-red-100 text-red-700';
    if (diffDays <= 30) return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  // Filter employees: by selected club + contract type "Definido 1 año" + search term
  const filteredEmployees = employees
    .filter(emp => {
      const contractType = localEdits[emp.id]?.contract_type ?? emp.contract_type;
      const matchesClub = !selectedClubId || emp.club_id === selectedClubId;
      const matchesSearch = !searchTerm ||
        emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.cedula.includes(searchTerm);
      return contractType === 'Definido 1 año' && matchesClub && matchesSearch;
    });

  const exportToExcel = () => {
    const dataToExport = filteredEmployees.map((emp, index) => {
      const contractStartStr = getVal(emp, 'contract_start');
      return {
        'No.': index + 1,
        'NOMBRE': getVal(emp, 'full_name'),
        'CÉDULA': getVal(emp, 'cedula'),
        'CARTA DE INGRESO': getVal(emp, 'carta_ingreso'),
        'CARNET VERDE': formatDateDisplay(getVal(emp, 'carnet_verde')),
        'CARNET BLANCO': formatDateDisplay(getVal(emp, 'carnet_blanco')),
        'FECHA DE AVISO CSS': formatDateDisplay(getVal(emp, 'aviso_css')),
        'FECHA DE INICIO DE CONTRATO': formatDateDisplay(contractStartStr),
        'FECHA DE TERMINACION DE PERIODO PROBATORIO': getProbatoryEnd(contractStartStr),
        'FECHA DE TERMINACION DE CONTRATO': formatDateDisplay(getVal(emp, 'contract_end')),
        'TIPO DE CONTRATOS': getVal(emp, 'contract_type'),
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Checklist 1 Año');
    XLSX.writeFile(wb, `Checklist_${clubName || 'Contratos'}_1_Año.xlsx`);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Cargando datos...</div>;
  }

  return (
    <div className="space-y-4">
      {/* ── Filters row ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {/* Search by name/cedula */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por empleado o cédula..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-64"
            />
          </div>

          {/* Club filter */}
          {user?.role !== 'Supervisor Interno' && clubs.length > 0 && (
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter className="h-4 w-4 text-slate-400" />
              </div>
              <select
                value={selectedClubId}
                onChange={e => setSelectedClubId(e.target.value)}
                className="pl-9 pr-8 py-2 border border-blue-400 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium text-slate-700"
              >
                <option value="">Todos los clubs</option>
                {clubs.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={exportToExcel}
          disabled={filteredEmployees.length === 0}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </button>
      </div>

      {/* ── Checklist table ─────────────────────────────────────────── */}
      <div ref={tableRef} className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">

        {/* Logo + Title header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          {/* Redvolution logo */}
          <div className="flex items-center select-none">
            <span className="text-2xl font-black tracking-tight" style={{ color: '#e11d48' }}>RED</span>
            <span className="text-2xl font-black tracking-tight text-slate-500">VOLUTION</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Check List</p>
            <p className="text-xs text-slate-400">Contratos Definido 1 Año</p>
          </div>
        </div>

        {/* Club title banner */}
        {clubName && (
          <div className="bg-red-600 px-6 py-3 text-center">
            <h2 className="text-white font-black text-lg tracking-widest uppercase">
              CHECK LIST {clubName}
            </h2>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-[#1a2e5a] text-white">
              <tr>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider border-r border-blue-900 whitespace-nowrap">No.</th>
                <th className="px-3 py-3 text-left font-bold uppercase tracking-wider border-r border-blue-900 min-w-[180px]">NOMBRE</th>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider border-r border-blue-900 whitespace-nowrap">CÉDULA</th>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider border-r border-blue-900 whitespace-nowrap">CARTA DE<br/>INGRESO</th>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider border-r border-blue-900 whitespace-nowrap">CARNET<br/>VERDE</th>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider border-r border-blue-900 whitespace-nowrap">CARNET<br/>BLANCO</th>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider border-r border-blue-900 whitespace-nowrap">FECHA DE<br/>AVISO CSS</th>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider border-r border-blue-900 whitespace-nowrap">INICIO DE<br/>CONTRATO</th>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider border-r border-blue-900 whitespace-nowrap">FIN PERÍODO<br/>PROBATORIO</th>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider border-r border-blue-900 whitespace-nowrap">FIN DE<br/>CONTRATO</th>
                <th className="px-3 py-3 text-center font-bold uppercase tracking-wider whitespace-nowrap">TIPO DE<br/>CONTRATO</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-10 text-center text-slate-400">
                    {selectedClubId
                      ? 'No hay empleados con contrato "Definido 1 año" en este club.'
                      : 'No hay empleados con contrato "Definido 1 año".'}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, index) => {
                  const contractStartStr = getVal(emp, 'contract_start');
                  const probatoryEnd = getProbatoryEnd(contractStartStr);
                  const probatoryColor = getProbatoryColor(contractStartStr);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-center text-slate-500 border-r border-slate-100">{index + 1}</td>
                      <td className="px-2 py-1 border-r border-slate-100">
                        <input
                          readOnly={!canEdit}
                          type="text"
                          value={getVal(emp, 'full_name')}
                          onChange={e => handleEdit(emp.id, 'full_name', e.target.value)}
                          onBlur={e => handleSave(emp.id, 'full_name', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs min-w-[160px]"
                        />
                      </td>
                      <td className="px-2 py-1 border-r border-slate-100">
                        <input
                          readOnly={!canEdit}
                          type="text"
                          value={getVal(emp, 'cedula')}
                          onChange={e => handleEdit(emp.id, 'cedula', e.target.value)}
                          onBlur={e => handleSave(emp.id, 'cedula', e.target.value)}
                          className="w-24 bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1 border-r border-slate-100 text-center">
                        <select
                          disabled={!canEdit}
                          value={getVal(emp, 'carta_ingreso')}
                          onChange={e => { handleEdit(emp.id, 'carta_ingreso', e.target.value); handleSave(emp.id, 'carta_ingreso', e.target.value); }}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs text-center"
                        >
                          <option value="SÍ">SÍ</option>
                          <option value="NO">NO</option>
                        </select>
                      </td>
                      <td className="px-2 py-1 border-r border-slate-100">
                        <input
                          readOnly={!canEdit}
                          type="date"
                          value={getVal(emp, 'carnet_verde')}
                          onChange={e => { handleEdit(emp.id, 'carnet_verde', e.target.value); handleSave(emp.id, 'carnet_verde', e.target.value); }}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1 border-r border-slate-100">
                        <input
                          readOnly={!canEdit}
                          type="date"
                          value={getVal(emp, 'carnet_blanco')}
                          onChange={e => { handleEdit(emp.id, 'carnet_blanco', e.target.value); handleSave(emp.id, 'carnet_blanco', e.target.value); }}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1 border-r border-slate-100">
                        <input
                          readOnly={!canEdit}
                          type="date"
                          value={getVal(emp, 'aviso_css')}
                          onChange={e => { handleEdit(emp.id, 'aviso_css', e.target.value); handleSave(emp.id, 'aviso_css', e.target.value); }}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1 border-r border-slate-100">
                        <input
                          readOnly={!canEdit}
                          type="date"
                          value={contractStartStr}
                          onChange={e => { handleEdit(emp.id, 'contract_start', e.target.value); handleSave(emp.id, 'contract_start', e.target.value); }}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs"
                        />
                      </td>
                      <td className={`px-3 py-2 text-center whitespace-nowrap border-r border-slate-100 font-semibold rounded-sm ${probatoryColor}`}>
                        {probatoryEnd}
                      </td>
                      <td className="px-2 py-1 border-r border-slate-100">
                        <input
                          readOnly={!canEdit}
                          type="date"
                          value={getVal(emp, 'contract_end')}
                          onChange={e => { handleEdit(emp.id, 'contract_end', e.target.value); handleSave(emp.id, 'contract_end', e.target.value); }}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={getVal(emp, 'contract_type')}
                          onChange={e => { handleEdit(emp.id, 'contract_type', e.target.value); handleSave(emp.id, 'contract_type', e.target.value); }}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="Definido">Definido</option>
                          <option value="Definido 1 año">Definido 1 año</option>
                          <option value="Indefinido">Indefinido</option>
                          <option value="Servicios Profesionales">Servicios Profesionales</option>
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {filteredEmployees.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {filteredEmployees.length} empleado{filteredEmployees.length !== 1 ? 's' : ''} con contrato definido 1 año
              {clubName ? ` — ${selectedClub?.name}` : ''}
            </span>
            <span className="text-[10px] font-black tracking-tight">
              <span style={{ color: '#e11d48' }}>RED</span>
              <span className="text-slate-400">VOLUTION</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
