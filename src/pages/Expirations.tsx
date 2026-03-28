import React, { useState, useEffect } from 'react';
import { Filter, Search, FileSpreadsheet } from 'lucide-react';
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
  documents: {
    carta_ingreso: { exists: boolean; file_url?: string };
    carnet_verde: { expiry_date: string | null; file_url: string } | null;
    carnet_blanco: { expiry_date: string | null; file_url: string } | null;
    aviso_css: { expiry_date: string | null; file_url: string } | null;
  };
}

export default function Expirations() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<ChecklistEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clubFilter, setClubFilter] = useState<string>('all');
  const [clubs, setClubs] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    fetchData();
  }, [clubFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch clubs for filter
      if (user?.role !== 'Supervisor Interno') {
        const clubsRes = await apiFetch('/api/clubs');
        if (clubsRes.ok) {
          const clubsData = await clubsRes.json();
          setClubs(clubsData.filter((c: any) => c.id !== 'global'));
        }
      }

      // Fetch checklist
      let url = '/api/reports/checklist?';
      if (user?.role === 'Supervisor Interno') {
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
    const matchesSearch = 
      emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.cedula.includes(searchTerm);
    return matchesSearch;
  });

  const groupedEmployees = filteredEmployees.reduce((acc, emp) => {
    const clubName = emp.club_name || 'Sin Club';
    if (!acc[clubName]) {
      acc[clubName] = [];
    }
    acc[clubName].push(emp);
    return acc;
  }, {} as Record<string, ChecklistEmployee[]>);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    // Format as DD-MMM-YY (e.g., 30-Jul-28)
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: '2-digit' };
    return date.toLocaleDateString('es-ES', options).replace(/ /g, '-').replace('.', '');
  };

  const getCellColorClass = (expiryDate: string | null) => {
    if (!expiryDate) return '';
    
    const end = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'bg-red-100 text-red-800 font-medium';
    if (diffDays <= 30) return 'bg-amber-100 text-amber-800 font-medium';
    return 'bg-emerald-100 text-emerald-800 font-medium';
  };

  const exportToExcel = () => {
    const dataToExport = filteredEmployees.map((emp, index) => ({
      'No.': index + 1,
      'NOMBRE': emp.full_name,
      'CÉDULA': emp.cedula,
      'CARTA DE INGRESO': emp.documents.carta_ingreso.exists ? 'SI' : 'NO',
      'CARNET VERDE': formatDate(emp.documents.carnet_verde?.expiry_date || null),
      'CARNET BLANCO': formatDate(emp.documents.carnet_blanco?.expiry_date || null),
      'FECHA DE AVISO CSS': formatDate(emp.documents.aviso_css?.expiry_date || null),
      'FECHA DE INICIO DE CONTRATO': formatDate(emp.contract_start),
      'FECHA DE TERMINACION DE PERIODO PROBATORIO': formatDate(emp.probatorio_end),
      'FECHA DE TERMINACIÓN DE CONTRATO': formatDate(emp.contract_end),
      'TIPO DE CONTRATOS': emp.contract_type,
      'CANTIDAD DE CONTRATOS': emp.contratos_count
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
        </div>
        <button
          onClick={exportToExcel}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium shadow-sm"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar a Excel
        </button>
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
            {user?.role !== 'Supervisor Interno' && (
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
                  <td colSpan={12} className="px-6 py-12 text-center">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : filteredEmployees.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-slate-500">
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
                      <th colSpan={12} className="px-4 py-3 text-lg tracking-wider uppercase">
                        CHECK LIST {clubName}
                      </th>
                    </tr>
                    <tr className="bg-slate-200 text-slate-800 border-b border-slate-300">
                      <th className="px-3 py-3 border-r border-slate-300">No.</th>
                      <th className="px-4 py-3 border-r border-slate-300 text-left">NOMBRE</th>
                      <th className="px-4 py-3 border-r border-slate-300">CÉDULA</th>
                      <th className="px-4 py-3 border-r border-slate-300">CARTA DE<br/>INGRESO</th>
                      <th className="px-4 py-3 border-r border-slate-300">CARNET<br/>VERDE</th>
                      <th className="px-4 py-3 border-r border-slate-300">CARNET<br/>BLANCO</th>
                      <th className="px-4 py-3 border-r border-slate-300">FECHA DE<br/>AVISO CSS</th>
                      <th className="px-4 py-3 border-r border-slate-300">FECHA DE<br/>INICIO DE<br/>CONTRATO</th>
                      <th className="px-4 py-3 border-r border-slate-300">FECHA DE<br/>TERMINACION DE<br/>PERIODO<br/>PROBATORIO</th>
                      <th className="px-4 py-3 border-r border-slate-300">FECHA DE<br/>TERMINACIÓN DE<br/>CONTRATO</th>
                      <th className="px-4 py-3 border-r border-slate-300">TIPO DE<br/>CONTRATOS</th>
                      <th className="px-4 py-3">CANTIDAD DE<br/>CONTRATOS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {employeesInClub.map((emp, index) => (
                      <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 border-r border-slate-200 font-medium">{index + 1}</td>
                        <td className="px-4 py-2 border-r border-slate-200 text-left font-bold text-slate-800">
                          <a href={`/employees/${emp.id}`} className="hover:text-blue-600 hover:underline">
                            {emp.full_name}
                          </a>
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200 font-medium">{emp.cedula}</td>
                        <td className="px-4 py-2 border-r border-slate-200 font-bold">
                          {emp.documents.carta_ingreso.exists ? (
                            <a href={emp.documents.carta_ingreso.file_url || '#'} target="_blank" rel="noopener noreferrer" className="text-slate-800 hover:text-blue-600">SI</a>
                          ) : (
                            <span className="text-slate-400">NO</span>
                          )}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-200 ${getCellColorClass(emp.documents.carnet_verde?.expiry_date || null)}`}>
                          {emp.documents.carnet_verde ? (
                            <a href={emp.documents.carnet_verde.file_url || '#'} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {formatDate(emp.documents.carnet_verde.expiry_date)}
                            </a>
                          ) : ''}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-200 ${getCellColorClass(emp.documents.carnet_blanco?.expiry_date || null)}`}>
                          {emp.documents.carnet_blanco ? (
                            <a href={emp.documents.carnet_blanco.file_url || '#'} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {formatDate(emp.documents.carnet_blanco.expiry_date)}
                            </a>
                          ) : ''}
                        </td>
                        <td className={`px-4 py-2 border-r border-slate-200 ${getCellColorClass(emp.documents.aviso_css?.expiry_date || null)}`}>
                          {emp.documents.aviso_css ? (
                            <a href={emp.documents.aviso_css.file_url || '#'} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {formatDate(emp.documents.aviso_css.expiry_date)}
                            </a>
                          ) : ''}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200">{formatDate(emp.contract_start)}</td>
                        <td className="px-4 py-2 border-r border-slate-200">{formatDate(emp.probatorio_end)}</td>
                        <td className={`px-4 py-2 border-r border-slate-200 ${getCellColorClass(emp.contract_end)}`}>
                          {formatDate(emp.contract_end)}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200 font-medium">{emp.contract_type}</td>
                        <td className="px-4 py-2 font-medium">{emp.contratos_count}</td>
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
