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
  const [localEdits, setLocalEdits] = useState<Record<string, any>>({});
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
    const doc = docs.find(d => d.document_types?.name?.toLowerCase()?.includes(typeName.toLowerCase()) && d.is_current === 1);
    if (!doc || !doc.expiry_date) return '';
    return new Date(doc.expiry_date).toLocaleDateString('es-PA', {
      day: '2-digit',
      month: 'short',
      year: '2-digit'
    }).replace('.', '');
  };

  const hasDoc = (docs: any[], typeName: string) => {
    const doc = docs.find(d => d.document_types?.name?.toLowerCase()?.includes(typeName.toLowerCase()) && d.is_current === 1);
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
      const res = await apiFetch(`/api/employees/${id}/checklist`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        },
        body: JSON.stringify({ [field]: value })
      });

      if (!res.ok) {
        console.error('Error saving checklist field');
      }
    } catch (error) {
      console.error('Error saving checklist field:', error);
    }
  };

  const getVal = (emp: EmployeeChecklist, field: string) => {
    if (localEdits[emp.id] && localEdits[emp.id][field] !== undefined) {
      return localEdits[emp.id][field];
    }
    
    if (emp.isManual) {
      if (field === 'full_name') return emp.full_name;
      if (field === 'cedula') return emp.cedula;
      if (field === 'contract_start') return emp.contract_start || '';
      if (field === 'carta_ingreso') return emp.carta_ingreso || 'NO';
      if (field === 'carnet_verde') return emp.carnet_verde || '';
      if (field === 'carnet_blanco') return emp.carnet_blanco || '';
      if (field === 'aviso_css') return emp.aviso_css || '';
    }

    if (field === 'full_name') return emp.full_name;
    if (field === 'cedula') return emp.cedula;
    if (field === 'contract_start') return emp.contract_start ? emp.contract_start.split('T')[0] : '';
    
    if (field === 'carta_ingreso') return hasDoc(emp.documents, 'Carta de ingreso') === 'SÍ' ? 'SÍ' : 'NO';
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

  const exportToExcel = () => {
    const allData = [...employees, ...manualRows];
    
    const dataToExport = allData.map((emp, index) => {
      let contractStartStr = getVal(emp, 'contract_start');
      let probatoryEndStr = '';

      if (contractStartStr && contractStartStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const date = new Date(`${contractStartStr}T12:00:00`);
        date.setMonth(date.getMonth() + 3);
        probatoryEndStr = date.toLocaleDateString('es-PA');
      }

      const formatDateForExcel = (dateStr: string) => {
        if (!dateStr) return '';
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '');
        }
        return dateStr;
      };

      return {
        'No.': index + 1,
        'NOMBRE': getVal(emp, 'full_name'),
        'CÉDULA': getVal(emp, 'cedula'),
        'CARTA DE INGRESO': getVal(emp, 'carta_ingreso'),
        'CARNET VERDE': formatDateForExcel(getVal(emp, 'carnet_verde')),
        'CARNET BLANCO': formatDateForExcel(getVal(emp, 'carnet_blanco')),
        'FECHA DE AVISO CSS': formatDateForExcel(getVal(emp, 'aviso_css')),
        'FECHA DE INICIO DE CONTRATO': formatDateForExcel(contractStartStr),
        'FECHA DE TERMINACION DE PERIODO PROBATORIO': probatoryEndStr,
        'FECHA DE TERMINACION DE CONTRATO': formatDateForExcel(getVal(emp, 'contract_end')),
        'TIPO DE CONTRATOS': getVal(emp, 'contract_type')
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
              <th scope="col" className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs border-r border-red-700 min-w-[250px]">NOMBRE</th>
              <th scope="col" className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs border-r border-red-700">CÉDULA</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">CARTA DE INGRESO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">CARNET VERDE</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">CARNET BLANCO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">FECHA DE AVISO CSS</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">FECHA DE INICIO DE CONTRATO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">FECHA DE TERMINACION DE PERIODO PROBATORIO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs border-r border-red-700">FECHA DE TERMINACION DE CONTRATO</th>
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">TIPO DE CONTRATOS</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {employees.length === 0 && manualRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  No se encontraron empleados con contrato de 1 año.
                </td>
              </tr>
            ) : (
              <>
                {/* Database Rows */}
                {employees.map((emp, index) => {
                  let probatoryEndStr = '';
                  const contractStartStr = getVal(emp, 'contract_start');
                  if (contractStartStr && contractStartStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const date = new Date(`${contractStartStr}T12:00:00`);
                    date.setMonth(date.getMonth() + 3);
                    probatoryEndStr = date.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '');
                  }

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500 border-r border-slate-200 text-center">{index + 1}</td>
                      <td className="px-2 py-2 border-r border-slate-200">
                        <input 
                          type="text" value={getVal(emp, 'full_name')} onChange={(e) => handleEdit(emp.id, 'full_name', e.target.value)}
                          onBlur={(e) => handleSave(emp.id, 'full_name', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs" placeholder="Nombre..."
                        />
                      </td>
                      <td className="px-2 py-2 border-r border-slate-200">
                        <input 
                          type="text" value={getVal(emp, 'cedula')} onChange={(e) => handleEdit(emp.id, 'cedula', e.target.value)}
                          onBlur={(e) => handleSave(emp.id, 'cedula', e.target.value)}
                          className="w-24 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs" placeholder="Cédula..."
                        />
                      </td>
                      <td className="px-2 py-2 border-r border-slate-200 text-center">
                        <select 
                          value={getVal(emp, 'carta_ingreso')} 
                          onChange={(e) => {
                            handleEdit(emp.id, 'carta_ingreso', e.target.value);
                            handleSave(emp.id, 'carta_ingreso', e.target.value);
                          }}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        >
                          <option value="SÍ">SÍ</option>
                          <option value="NO">NO</option>
                        </select>
                      </td>
                      <td className="px-2 py-2 border-r border-slate-200">
                        <input 
                          type="date" value={getVal(emp, 'carnet_verde')} onChange={(e) => handleEdit(emp.id, 'carnet_verde', e.target.value)}
                          onBlur={(e) => handleSave(emp.id, 'carnet_verde', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-2 border-r border-slate-200">
                        <input 
                          type="date" value={getVal(emp, 'carnet_blanco')} onChange={(e) => handleEdit(emp.id, 'carnet_blanco', e.target.value)}
                          onBlur={(e) => handleSave(emp.id, 'carnet_blanco', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-2 border-r border-slate-200">
                        <input 
                          type="date" value={getVal(emp, 'aviso_css')} onChange={(e) => handleEdit(emp.id, 'aviso_css', e.target.value)}
                          onBlur={(e) => handleSave(emp.id, 'aviso_css', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-2 border-r border-slate-200">
                        <input 
                          type="date" value={getVal(emp, 'contract_start')} onChange={(e) => handleEdit(emp.id, 'contract_start', e.target.value)}
                          onBlur={(e) => handleSave(emp.id, 'contract_start', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200">
                        {probatoryEndStr}
                      </td>
                      <td className="px-2 py-2 border-r border-slate-200">
                        <input 
                          type="date" value={getVal(emp, 'contract_end')} onChange={(e) => handleEdit(emp.id, 'contract_end', e.target.value)}
                          onBlur={(e) => handleSave(emp.id, 'contract_end', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-2 border-slate-200">
                        <select 
                          value={getVal(emp, 'contract_type')} 
                          onChange={(e) => {
                            handleEdit(emp.id, 'contract_type', e.target.value);
                            handleSave(emp.id, 'contract_type', e.target.value);
                          }}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="Definido">Definido</option>
                          <option value="Indefinido">Indefinido</option>
                          <option value="Servicios Profesionales">Servicios Profesionales</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
                
                {/* Manual Rows */}
                {manualRows.map((row, index) => {
                  let probatoryEndStr = '';
                  const contractStartStr = getVal(row, 'contract_start');
                  if (contractStartStr && contractStartStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const date = new Date(`${contractStartStr}T12:00:00`);
                    date.setMonth(date.getMonth() + 3);
                    probatoryEndStr = date.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '');
                  }

                  return (
                    <tr key={row.id} className="bg-blue-50 hover:bg-blue-100 transition-colors">
                      <td className="px-2 py-2 whitespace-nowrap text-slate-500 border-r border-slate-200 text-center">
                        {employees.length + index + 1}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                        <input 
                          type="text" 
                          value={getVal(row, 'full_name')} 
                          onChange={(e) => handleEdit(row.id, 'full_name', e.target.value)}
                          placeholder="Nombre..."
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                        <input 
                          type="text" 
                          value={getVal(row, 'cedula')} 
                          onChange={(e) => handleEdit(row.id, 'cedula', e.target.value)}
                          placeholder="Cédula..."
                          className="w-24 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200 text-center">
                        <select 
                          value={getVal(row, 'carta_ingreso')} 
                          onChange={(e) => handleEdit(row.id, 'carta_ingreso', e.target.value)}
                          className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        >
                          <option value="SÍ">SÍ</option>
                          <option value="NO">NO</option>
                        </select>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                        <input 
                          type="date" 
                          value={getVal(row, 'carnet_verde')} 
                          onChange={(e) => handleEdit(row.id, 'carnet_verde', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                        <input 
                          type="date" 
                          value={getVal(row, 'carnet_blanco')} 
                          onChange={(e) => handleEdit(row.id, 'carnet_blanco', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                        <input 
                          type="date" 
                          value={getVal(row, 'aviso_css')} 
                          onChange={(e) => handleEdit(row.id, 'aviso_css', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                        <input 
                          type="date" 
                          value={getVal(row, 'contract_start')} 
                          onChange={(e) => handleEdit(row.id, 'contract_start', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200">
                        {probatoryEndStr}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap border-r border-slate-200">
                        <input 
                          type="date" 
                          value={getVal(row, 'contract_end')} 
                          onChange={(e) => handleEdit(row.id, 'contract_end', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap border-slate-200">
                        <div className="flex items-center justify-between gap-2">
                          <select 
                            value={getVal(row, 'contract_type')} 
                            onChange={(e) => handleEdit(row.id, 'contract_type', e.target.value)}
                            className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-xs"
                          >
                            <option value="">Seleccionar...</option>
                            <option value="Definido">Definido</option>
                            <option value="Indefinido">Indefinido</option>
                            <option value="Servicios Profesionales">Servicios Profesionales</option>
                          </select>
                          <button 
                            onClick={() => removeManualRow(row.id)} 
                            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                            title="Eliminar fila"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
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
  );
}
