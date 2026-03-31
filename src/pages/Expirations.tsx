import React, { useState, useEffect } from 'react';
import { Filter, Search, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import * as XLSX from 'xlsx';

interface ChecklistEmployee {
  id: string;
  full_name: string;
  cedula: string;
  club_name: string;
  contract_start: string | null;
  contract_end: string | null;
  contract_type: string;
  probatorio_end: string | null;
  contratos_count: number;
  isManual?: boolean;
  documents: {
    carta_ingreso: { exists: boolean; file_url?: string; manualValue?: string };
    carnet_verde: { expiry_date: string | null; file_url: string; manualValue?: string } | null;
    carnet_blanco: { expiry_date: string | null; file_url: string; manualValue?: string } | null;
    aviso_css: { expiry_date: string | null; file_url: string; manualValue?: string } | null;
  };
}

export default function Expirations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = user?.role === 'Administrador' || user?.role === 'Supervisor Interno';
  const [employees, setEmployees] = useState<ChecklistEmployee[]>([]);
  const [manualRows, setManualRows] = useState<ChecklistEmployee[]>([]);
  const [localEdits, setLocalEdits] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clubFilter, setClubFilter] = useState<string>('all');
  const [clubs, setClubs] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    fetchData();
  }, [clubFilter, user, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch clubs for filter
      if (user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora') {
        const clubsRes = await apiFetch('/api/clubs');
        if (clubsRes.ok) {
          const clubsData = await clubsRes.json();
          setClubs(clubsData.filter((c: any) => c.id !== 'global'));
        }
      }

      // Fetch checklist
      let url = '/api/reports/checklist?';
      if (user?.role === 'Supervisor Interno' || user?.role === 'Coordinadora') {
        url += `club_id=${user.club_id}&`;
      } else if (clubFilter !== 'all') {
        url += `club_id=${clubFilter}&`;
      }

      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (error) {
      console.error('Error fetching checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const isOneYear = emp.contract_type?.toLowerCase() !== 'indefinido';
    const matchesSearch = 
      emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.cedula.includes(searchTerm);
    return isOneYear && matchesSearch;
  });

  const groupedEmployees = filteredEmployees.reduce((acc, emp) => {
    const clubName = emp.club_name || 'Sin Club';
    if (!acc[clubName]) {
      acc[clubName] = [];
    }
    acc[clubName].push(emp);
    return acc;
  }, {} as Record<string, ChecklistEmployee[]>);

  // Add manual rows to their respective clubs or a "Manuales" group
  manualRows.forEach(row => {
    const clubName = row.club_name || 'Agregados Manualmente';
    if (!groupedEmployees[clubName]) {
      groupedEmployees[clubName] = [];
    }
    groupedEmployees[clubName].push(row);
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    // If it's a manual string like DD-MMM-YY, return as is
    if (dateString.match(/^\d{2}-[a-zA-Z]{3}-\d{2}$/)) return dateString;
    
    // Fix timezone issue for YYYY-MM-DD
    let dateToParse = dateString;
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateToParse = `${dateString}T12:00:00`;
    }
    
    const date = new Date(dateToParse);
    if (isNaN(date.getTime())) return dateString; // Fallback for manual text
    
    // Format as DD-MMM-YY (e.g., 30-Jul-28)
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: '2-digit' };
    return date.toLocaleDateString('es-ES', options).replace(/ /g, '-').replace('.', '');
  };

  const getCellColorClass = (expiryDate: string | null, isIndefinite: boolean = false) => {
    if (!expiryDate) return '';
    
    if (isIndefinite) return 'bg-slate-100 text-slate-700 font-medium';
    
    let dateToParse = expiryDate;
    if (expiryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateToParse = `${expiryDate}T12:00:00`;
    }
    
    const end = new Date(dateToParse);
    if (isNaN(end.getTime())) return ''; // Don't color manual text that isn't a date
    
    const now = new Date();
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'bg-red-100 text-red-800 font-medium';
    if (diffDays <= 30) return 'bg-amber-100 text-amber-800 font-medium';
    return 'bg-emerald-100 text-emerald-800 font-medium';
  };

  const addManualRow = () => {
    const newRow: ChecklistEmployee = {
      id: `manual-${Date.now()}`,
      full_name: '',
      cedula: '',
      club_name: clubFilter !== 'all' ? (clubs.find(c => c.id === clubFilter)?.name || 'Agregados Manualmente') : 'Agregados Manualmente',
      contract_start: '',
      contract_end: '',
      contract_type: 'Definido',
      probatorio_end: '',
      contratos_count: 1,
      isManual: true,
      documents: {
        carta_ingreso: { exists: false, manualValue: 'NO' },
        carnet_verde: { expiry_date: '', file_url: '', manualValue: '' },
        carnet_blanco: { expiry_date: '', file_url: '', manualValue: '' },
        aviso_css: { expiry_date: '', file_url: '', manualValue: '' }
      }
    };
    setManualRows([...manualRows, newRow]);
  };

  const updateManualRow = (id: string, field: string, value: any) => {
    setManualRows(manualRows.map(row => {
      if (row.id !== id) return row;
      
      if (field.startsWith('doc_')) {
        const docType = field.replace('doc_', '') as keyof typeof row.documents;
        if (docType === 'carta_ingreso') {
           return {
             ...row,
             documents: {
               ...row.documents,
               carta_ingreso: { ...row.documents.carta_ingreso, manualValue: value }
             }
           };
        } else {
           return {
             ...row,
             documents: {
               ...row.documents,
               [docType]: { ...row.documents[docType], expiry_date: value, manualValue: value }
             }
           };
        }
      }
      
      return { ...row, [field]: value };
    }));
  };

  const removeManualRow = (id: string) => {
    setManualRows(manualRows.filter(row => row.id !== id));
  };

  const handleEdit = (id: string, field: string, value: any) => {
    setLocalEdits(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }));
  };

  const handleSave = async (id: string, field: string, value: any) => {
    if (id.startsWith('manual-')) return; // Don't save manual rows to DB

    try {
      // Map field names to the ones expected by the API
      let apiField = field;
      if (field.startsWith('doc_')) {
        apiField = field.replace('doc_', '');
      }

      const res = await apiFetch(`/api/employees/${id}/checklist`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        },
        body: JSON.stringify({ [apiField]: value })
      });

      if (!res.ok) {
        console.error('Error saving checklist field');
      }
    } catch (error) {
      console.error('Error saving checklist field:', error);
    }
  };

  const getVal = (emp: ChecklistEmployee, field: string) => {
    if (field === 'probatorio_end') {
      const currentStart = getVal(emp, 'contract_start');
      if (currentStart) {
        const start = new Date(currentStart);
        // Add 3 months
        start.setMonth(start.getMonth() + 3);
        return start.toISOString().split('T')[0];
      }
      return '';
    }

    if (localEdits[emp.id] && localEdits[emp.id][field] !== undefined) {
      return localEdits[emp.id][field];
    }
    
    if (emp.isManual) {
      if (field === 'full_name') return emp.full_name;
      if (field === 'cedula') return emp.cedula;
      if (field === 'contract_start') return emp.contract_start || '';
      if (field === 'contract_end') return emp.contract_end || '';
      if (field === 'contract_type') return emp.contract_type || '';
      if (field === 'doc_carta_ingreso') return emp.documents.carta_ingreso?.manualValue || 'NO';
      if (field === 'doc_carnet_verde') return emp.documents.carnet_verde?.manualValue || '';
      if (field === 'doc_carnet_blanco') return emp.documents.carnet_blanco?.manualValue || '';
      if (field === 'doc_aviso_css') return emp.documents.aviso_css?.manualValue || '';
    }

    if (field === 'full_name') return emp.full_name;
    if (field === 'cedula') return emp.cedula;
    if (field === 'contract_start') return emp.contract_start ? emp.contract_start.split('T')[0] : '';
    if (field === 'contract_end') return emp.contract_end ? emp.contract_end.split('T')[0] : '';
    if (field === 'contract_type') return emp.contract_type || '';
    
    if (field === 'doc_carta_ingreso') return emp.documents.carta_ingreso?.exists ? 'SÍ' : 'NO';
    if (field === 'doc_carnet_verde') return emp.documents.carnet_verde?.expiry_date ? emp.documents.carnet_verde.expiry_date.split('T')[0] : '';
    if (field === 'doc_carnet_blanco') return emp.documents.carnet_blanco?.expiry_date ? emp.documents.carnet_blanco.expiry_date.split('T')[0] : '';
    if (field === 'doc_aviso_css') return emp.documents.aviso_css?.expiry_date ? emp.documents.aviso_css.expiry_date.split('T')[0] : '';
    
    return '';
  };

  const exportToExcel = () => {
    const allData = [...filteredEmployees, ...manualRows];
    
    const dataToExport = allData.map((emp, index) => ({
      'No.': index + 1,
      'NOMBRE': getVal(emp, 'full_name'),
      'CÉDULA': getVal(emp, 'cedula'),
      'CLUB': emp.club_name,
      'CARTA DE INGRESO': getVal(emp, 'doc_carta_ingreso'),
      'CARNET VERDE': formatDate(getVal(emp, 'doc_carnet_verde')),
      'CARNET BLANCO': formatDate(getVal(emp, 'doc_carnet_blanco')),
      'FECHA DE AVISO CSS': formatDate(getVal(emp, 'doc_aviso_css')),
      'FECHA DE INICIO DE CONTRATO': formatDate(getVal(emp, 'contract_start')),
      'FECHA DE TERMINACION DE PERIODO PROBATORIO': formatDate(getVal(emp, 'probatorio_end')),
      'FECHA DE TERMINACION DE CONTRATO': formatDate(getVal(emp, 'contract_end')),
      'TIPO DE CONTRATOS': getVal(emp, 'contract_type')
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Checklist');
    
    const clubName = clubFilter === 'all' ? 'Todos' : clubs.find(c => c.id === clubFilter)?.name || '';
    XLSX.writeFile(wb, `Checklist_${clubName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Check List de Empleados</h1>
          <p className="text-slate-500 mt-1">Vista consolidada de documentos y fechas de vencimiento.</p>
          {canEdit && (
            <p className="text-xs text-amber-600 mt-1 font-medium">Nota: Las filas agregadas manualmente son temporales y solo sirven para exportar a Excel.</p>
          )}
        </div>
        <div className="flex gap-3">
          {canEdit && (
            <button
              onClick={addManualRow}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Agregar Fila Manual
            </button>
          )}
          <button
            onClick={exportToExcel}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar a Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por empleado o cédula..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          
          <div className="flex gap-2">
            {user?.role !== 'Supervisor Interno' && user?.role !== 'Coordinadora' && (
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select
                  value={clubFilter}
                  onChange={(e) => setClubFilter(e.target.value)}
                  className="pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer appearance-none"
                >
                  <option value="all">Todos los clubes</option>
                  {clubs.map(club => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs whitespace-nowrap">
            {loading ? (
              <tbody>
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : Object.keys(groupedEmployees).length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-slate-500">
                    <p className="text-lg font-medium text-slate-900">No hay datos</p>
                    <p>No se encontraron empleados con los filtros seleccionados.</p>
                  </td>
                </tr>
              </tbody>
            ) : (
              Object.entries(groupedEmployees).map(([clubName, employeesInClub]) => (
                <React.Fragment key={clubName}>
                  <thead className="bg-red-600 text-white font-bold">
                    <tr>
                      <th colSpan={13} className="px-4 py-3 text-lg tracking-wider uppercase">
                        CHECK LIST {clubName}
                      </th>
                    </tr>
                    <tr className="bg-slate-200 text-slate-800 border-b border-slate-300">
                      <th className="px-3 py-3 border-r border-slate-300">No.</th>
                      <th className="px-4 py-3 border-r border-slate-300 text-left min-w-[250px]">NOMBRE</th>
                      <th className="px-4 py-3 border-r border-slate-300">CÉDULA</th>
                      <th className="px-4 py-3 border-r border-slate-300">CARTA DE<br/>INGRESO</th>
                      <th className="px-4 py-3 border-r border-slate-300">CARNET<br/>VERDE</th>
                      <th className="px-4 py-3 border-r border-slate-300">CARNET<br/>BLANCO</th>
                      <th className="px-4 py-3 border-r border-slate-300">FECHA DE<br/>AVISO CSS</th>
                      <th className="px-4 py-3 border-r border-slate-300">FECHA DE<br/>INICIO DE<br/>CONTRATO</th>
                      <th className="px-4 py-3 border-r border-slate-300">FECHA DE<br/>TERMINACION DE<br/>PERIODO<br/>PROBATORIO</th>
                      <th className="px-4 py-3 border-r border-slate-300">FECHA DE<br/>TERMINACION DE<br/>CONTRATO</th>
                      <th className="px-4 py-3 border-r border-slate-300">TIPO DE<br/>CONTRATOS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {employeesInClub.map((emp, index) => (
                      <tr key={emp.id} className={`${emp.isManual ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'} transition-colors`}>
                        <td className="px-3 py-2 border-r border-slate-200 font-medium">{index + 1}</td>
                        
                        <td className="px-2 py-2 border-r border-slate-200">
                          <input disabled={!canEdit}
                            type="text" value={getVal(emp, 'full_name')} onChange={(e) => handleEdit(emp.id, 'full_name', e.target.value)}
                            onBlur={(e) => handleSave(emp.id, 'full_name', e.target.value)}
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs disabled:opacity-75 disabled:cursor-not-allowed" placeholder="Nombre..."
                          />
                        </td>
                        <td className="px-2 py-2 border-r border-slate-200">
                          <input disabled={!canEdit}
                            type="text" value={getVal(emp, 'cedula')} onChange={(e) => handleEdit(emp.id, 'cedula', e.target.value)}
                            onBlur={(e) => handleSave(emp.id, 'cedula', e.target.value)}
                            className="w-20 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs disabled:opacity-75 disabled:cursor-not-allowed" placeholder="Cédula..."
                          />
                        </td>
                        <td className="px-2 py-2 border-r border-slate-200">
                          <select disabled={!canEdit}
                            value={getVal(emp, 'doc_carta_ingreso')} 
                            onChange={(e) => {
                              handleEdit(emp.id, 'doc_carta_ingreso', e.target.value);
                              handleSave(emp.id, 'doc_carta_ingreso', e.target.value);
                            }}
                            className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                          >
                            <option value="SÍ">SÍ</option>
                            <option value="NO">NO</option>
                          </select>
                        </td>
                        <td className={`px-2 py-2 border-r border-slate-200 ${getCellColorClass(getVal(emp, 'doc_carnet_verde'))}`}>
                          <input disabled={!canEdit}
                            type="date" value={getVal(emp, 'doc_carnet_verde')} onChange={(e) => handleEdit(emp.id, 'doc_carnet_verde', e.target.value)}
                            onBlur={(e) => handleSave(emp.id, 'doc_carnet_verde', e.target.value)}
                            className="w-32 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center disabled:opacity-75 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className={`px-2 py-2 border-r border-slate-200 ${getCellColorClass(getVal(emp, 'doc_carnet_blanco'))}`}>
                          <input disabled={!canEdit}
                            type="date" value={getVal(emp, 'doc_carnet_blanco')} onChange={(e) => handleEdit(emp.id, 'doc_carnet_blanco', e.target.value)}
                            onBlur={(e) => handleSave(emp.id, 'doc_carnet_blanco', e.target.value)}
                            className="w-32 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center disabled:opacity-75 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className={`px-2 py-2 border-r border-slate-200 ${getCellColorClass(getVal(emp, 'doc_aviso_css'))}`}>
                          <input disabled={!canEdit}
                            type="date" value={getVal(emp, 'doc_aviso_css')} onChange={(e) => handleEdit(emp.id, 'doc_aviso_css', e.target.value)}
                            onBlur={(e) => handleSave(emp.id, 'doc_aviso_css', e.target.value)}
                            className="w-32 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center disabled:opacity-75 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-2 py-2 border-r border-slate-200">
                          <input disabled={!canEdit}
                            type="date" value={getVal(emp, 'contract_start')} onChange={(e) => handleEdit(emp.id, 'contract_start', e.target.value)}
                            onBlur={(e) => handleSave(emp.id, 'contract_start', e.target.value)}
                            className="w-32 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center disabled:opacity-75 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-center border-r border-slate-200 ${getCellColorClass(getVal(emp, 'probatorio_end'), getVal(emp, 'contract_type')?.toLowerCase() === 'indefinido')}`}>
                          {formatDate(getVal(emp, 'probatorio_end'))}
                        </td>
                        <td className={`px-2 py-2 border-r border-slate-200 ${getCellColorClass(getVal(emp, 'contract_end'), getVal(emp, 'contract_type')?.toLowerCase() === 'indefinido')}`}>
                          <input disabled={!canEdit}
                            type="date" value={getVal(emp, 'contract_end')} onChange={(e) => handleEdit(emp.id, 'contract_end', e.target.value)}
                            onBlur={(e) => handleSave(emp.id, 'contract_end', e.target.value)}
                            className="w-32 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center disabled:opacity-75 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-2 py-2 border-r border-slate-200">
                          <select disabled={!canEdit}
                            value={getVal(emp, 'contract_type')?.toLowerCase() === 'indefinido' ? 'Indefinido' : getVal(emp, 'contract_type')} 
                            onChange={(e) => {
                              handleEdit(emp.id, 'contract_type', e.target.value);
                              handleSave(emp.id, 'contract_type', e.target.value);
                            }}
                            className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                          >
                            <option value="">Seleccionar...</option>
                            <option value="Definido">Definido</option>
                            <option value="Definido 1 año">Definido 1 año</option>
                            <option value="Indefinido">Indefinido</option>
                            <option value="Servicios Profesionales">Servicios Profesionales</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </React.Fragment>
              ))
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
