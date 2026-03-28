import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { FileSpreadsheet, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface EmployeeChecklist {
  id: string;
  full_name: string;
  cedula: string;
  contract_type: string;
  contract_start: string;
  contract_end: string;
  documents: any[];
}

export default function ChecklistContratos() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeChecklist[]>([]);
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

  const exportToExcel = () => {
    const dataToExport = employees.map((emp, index) => ({
      'No.': index + 1,
      'NOMBRE': emp.full_name,
      'CÉDULA': emp.cedula,
      'CARTA DE INGRESO': hasDoc(emp.documents, 'Carta de ingreso'),
      'CARNET VERDE': getDocDate(emp.documents, 'Carnet Verde'),
      'CARNET BLANCO': getDocDate(emp.documents, 'Carnet Blanco'),
      'FECHA DE AVISO CSS': getDocDate(emp.documents, 'Aviso de entrada'),
      'FECHA DE INICIO DE CONTRATO': emp.contract_start ? new Date(emp.contract_start).toLocaleDateString('es-PA') : '',
      'FECHA DE TERMINACION DE PERIODO PROBATORIO': '', // Calculate if needed
      'FECHA DE TERMINACIÓN DE CONTRATO': emp.contract_end ? new Date(emp.contract_end).toLocaleDateString('es-PA') : '',
      'TIPO DE CONTRATOS': emp.contract_type || '1 año'
    }));

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
        <button
          onClick={exportToExcel}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </button>
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
              <th scope="col" className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">TIPO DE CONTRATOS</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {employees.length > 0 ? (
              employees.map((emp, index) => (
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
                    {/* Probatory period is usually 3 months from start */}
                    {emp.contract_start ? (() => {
                      const date = new Date(emp.contract_start);
                      date.setMonth(date.getMonth() + 3);
                      return date.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '');
                    })() : ''}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200">
                    {emp.contract_end ? new Date(emp.contract_end).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '') : ''}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-slate-500 uppercase">{emp.contract_type}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  No se encontraron empleados con contrato de 1 año.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
