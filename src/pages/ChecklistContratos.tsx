import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { FileSpreadsheet, Download, Plus, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface EmployeeChecklist {
  id: string;
  full_name: string;
  cedula: string;
  contract_type: string;
  contract_start: string;
  contract_end: string;
  documents: any[];
  isManual?: boolean;
  carta_ingreso?: string;
  carnet_verde?: string;
  carnet_blanco?: string;
  aviso_css?: string;
}

export default function ChecklistContratos() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeChecklist[]>([]);
  const [manualRows, setManualRows] = useState<EmployeeChecklist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChecklistData = async () => {
      try {
        // Fetch employees with 1 year contract
        const res = await apiFetch('/api/employees?status=activo');
        if (res.ok) {
          const data = await res.json();
          const oneYearEmployees = data.filter((emp: any) => emp.contract_type === '1 año');
          
          // Fetch documents for these employees to get carnet dates, etc.
          const employeesWithDocs = await Promise.all(
            oneYearEmployees.map(async (emp: any) => {
              const docsRes = await apiFetch(`/api/employees/${emp.id}/documents`);
              let documents = [];
              if (docsRes.ok) {
                documents = await docsRes.json();
              }
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

    fetchChecklistData();
  }, []);

  const getDocDate = (docs: any[], typeName: string) => {
    const doc = docs.find(d => d.document_types?.name?.includes(typeName));
    if (!doc || !doc.expiry_date) return '';
    return new Date(doc.expiry_date).toLocaleDateString('es-PA', {
      day: '2-digit',
      month: 'short',
      year: '2-digit'
    }).replace('.', '');
  };

  const hasDoc = (docs: any[], typeName: string) => {
    const doc = docs.find(d => d.document_types?.name?.includes(typeName));
    return doc ? 'SÍ' : 'NO';
  };

  const addManualRow = () => {
    const newRow: EmployeeChecklist = {
      id: `manual-${Date.now()}`,
      full_name: '',
      cedula: '',
      contract_type: '1 año',
      contract_start: '',
      contract_end: '',
      documents: [],
      isManual: true,
      carta_ingreso: 'NO',
      carnet_verde: '',
      carnet_blanco: '',
      aviso_css: ''
    };
    setManualRows([...manualRows, newRow]);
  };

  const updateManualRow = (id: string, field: keyof EmployeeChecklist, value: string) => {
    setManualRows(manualRows.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const removeManualRow = (id: string) => {
    setManualRows(manualRows.filter(row => row.id !== id));
  };

  const exportToExcel = () => {
    const allData = [...employees, ...manualRows];
    
    const dataToExport = allData.map((emp, index) => {
      let contractStartStr = '';
      let probatoryEndStr = '';
      let contractEndStr = '';

      if (emp.isManual) {
        contractStartStr = emp.contract_start ? new Date(emp.contract_start).toLocaleDateString('es-PA') : '';
        contractEndStr = emp.contract_end ? new Date(emp.contract_end).toLocaleDateString('es-PA') : '';
        // Try to calculate probatory period if start date is valid YYYY-MM-DD
        if (emp.contract_start && emp.contract_start.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const date = new Date(emp.contract_start);
          date.setMonth(date.getMonth() + 3);
          probatoryEndStr = date.toLocaleDateString('es-PA');
        }
      } else {
        contractStartStr = emp.contract_start ? new Date(emp.contract_start).toLocaleDateString('es-PA') : '';
        contractEndStr = emp.contract_end ? new Date(emp.contract_end).toLocaleDateString('es-PA') : '';
        if (emp.contract_start) {
          const date = new Date(emp.contract_start);
          date.setMonth(date.getMonth() + 3);
          probatoryEndStr = date.toLocaleDateString('es-PA');
        }
      }

      return {
        'No.': index + 1,
        'NOMBRE': emp.full_name,
        'CÉDULA': emp.cedula,
        'CARTA DE INGRESO': emp.isManual ? emp.carta_ingreso : hasDoc(emp.documents, 'Carta de ingreso'),
        'CARNET VERDE': emp.isManual ? (emp.carnet_verde ? new Date(emp.carnet_verde).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '') : '') : getDocDate(emp.documents, 'Carnet Verde'),
        'CARNET BLANCO': emp.isManual ? (emp.carnet_blanco ? new Date(emp.carnet_blanco).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '') : '') : getDocDate(emp.documents, 'Carnet Blanco'),
        'FECHA DE AVISO CSS': emp.isManual ? (emp.aviso_css ? new Date(emp.aviso_css).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '') : '') : getDocDate(emp.documents, 'Aviso de entrada'),
        'FECHA DE INICIO DE CONTRATO': contractStartStr,
        'FECHA DE TERMINACION DE PERIODO PROBATORIO': probatoryEndStr,
        'FECHA DE TERMINACIÓN DE CONTRATO': contractEndStr,
        'TIPO DE CONTRATOS': emp.contract_type || '1 año'
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Checklist 1 Año');
    XLSX.writeFile(wb, 'Checklist_Contratos_1_Ano.xlsx');
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Cargando datos...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Checklist: Contratos de 1 Año</h2>
          <p className="text-sm text-slate-500 mt-1">Lista de personal activo con contrato definido por 1 año.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={addManualRow}
            className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar Fila Manual
          </button>
          <button
            onClick={exportToExcel}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-[#E50000] text-white">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs border-r border-red-700">No.</th>
              <th scope="col" className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs border-r border-red-700">NOMBRE</th>
              <th scope="col" className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs border-r border-red-700">CÉDULA</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">CARTA DE INGRESO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">CARNET VERDE</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">CARNET BLANCO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">FECHA DE AVISO CSS</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">FECHA DE INICIO DE CONTRATO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">FECHA DE TERMINACION DE PERIODO PROBATORIO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">FECHA DE TERMINACIÓN DE CONTRATO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">TIPO DE CONTRATOS</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">ACCIONES</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {employees.length === 0 && manualRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                  No se encontraron empleados con contrato de 1 año.
                </td>
              </tr>
            ) : (
              <>
                {/* Database Rows */}
                {employees.map((emp, index) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 border-r border-slate-200 text-center">{index + 1}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900 border-r border-slate-200">{emp.full_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 border-r border-slate-200">{emp.cedula}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200 font-medium text-blue-600">{hasDoc(emp.documents, 'Carta de ingreso')}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200">{getDocDate(emp.documents, 'Carnet Verde')}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200">{getDocDate(emp.documents, 'Carnet Blanco')}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200">{getDocDate(emp.documents, 'Aviso de entrada')}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200">
                      {emp.contract_start ? new Date(emp.contract_start).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '') : ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200">
                      {emp.contract_start ? (() => {
                        const date = new Date(emp.contract_start);
                        date.setMonth(date.getMonth() + 3);
                        return date.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '');
                      })() : ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200">
                      {emp.contract_end ? new Date(emp.contract_end).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '') : ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-slate-500 uppercase border-r border-slate-200">{emp.contract_type}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-slate-500"></td>
                  </tr>
                ))}
                
                {/* Manual Rows */}
                {manualRows.map((row, index) => (
                  <tr key={row.id} className="bg-blue-50 hover:bg-blue-100 transition-colors">
                    <td className="px-2 py-2 whitespace-nowrap text-slate-500 border-r border-slate-200 text-center">
                      {employees.length + index + 1}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                      <input 
                        type="text" 
                        value={row.full_name} 
                        onChange={(e) => updateManualRow(row.id, 'full_name', e.target.value)}
                        placeholder="Nombre..."
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                      <input 
                        type="text" 
                        value={row.cedula} 
                        onChange={(e) => updateManualRow(row.id, 'cedula', e.target.value)}
                        placeholder="Cédula..."
                        className="w-24 bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200 text-center">
                      <select 
                        value={row.carta_ingreso} 
                        onChange={(e) => updateManualRow(row.id, 'carta_ingreso', e.target.value)}
                        className="bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="SÍ">SÍ</option>
                        <option value="NO">NO</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                      <input 
                        type="date" 
                        value={row.carnet_verde} 
                        onChange={(e) => updateManualRow(row.id, 'carnet_verde', e.target.value)}
                        className="w-32 bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                      <input 
                        type="date" 
                        value={row.carnet_blanco} 
                        onChange={(e) => updateManualRow(row.id, 'carnet_blanco', e.target.value)}
                        className="w-32 bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                      <input 
                        type="date" 
                        value={row.aviso_css} 
                        onChange={(e) => updateManualRow(row.id, 'aviso_css', e.target.value)}
                        className="w-32 bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                      <input 
                        type="date" 
                        value={row.contract_start} 
                        onChange={(e) => updateManualRow(row.id, 'contract_start', e.target.value)}
                        className="w-32 bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200 text-center text-slate-500">
                      {row.contract_start ? (() => {
                        const date = new Date(row.contract_start);
                        date.setMonth(date.getMonth() + 3);
                        return date.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '');
                      })() : 'Auto'}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                      <input 
                        type="date" 
                        value={row.contract_end} 
                        onChange={(e) => updateManualRow(row.id, 'contract_end', e.target.value)}
                        className="w-32 bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                      <input 
                        type="text" 
                        value={row.contract_type} 
                        onChange={(e) => updateManualRow(row.id, 'contract_type', e.target.value)}
                        className="w-24 bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center uppercase"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center">
                      <button 
                        onClick={() => removeManualRow(row.id)}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                        title="Eliminar fila manual"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
