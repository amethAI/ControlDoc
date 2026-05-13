import { apiFetch } from '../lib/api';
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, Filter, Upload, FileSpreadsheet, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import NewEmployeeModal from '../components/NewEmployeeModal';
import BulkUploadModal from '../components/BulkUploadModal';
import BulkEmployeeModal from '../components/BulkEmployeeModal';
import ImportDatesModal from '../components/ImportDatesModal';

interface Employee {
  id: string;
  full_name: string;
  cedula: string;
  position: string;
  status: string;
  club_id: string;
  contract_type?: string;
  termination_reason?: string;
  termination_date?: string;
}

export default function Employees() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('activo');
  const [showMissingContract, setShowMissingContract] = useState(false);
  const [missingContractEmployees, setMissingContractEmployees] = useState<Employee[]>([]);
  const [loadingMissing, setLoadingMissing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isBulkEmployeeModalOpen, setIsBulkEmployeeModalOpen] = useState(false);
  const [isImportDatesModalOpen, setIsImportDatesModalOpen] = useState(false);

  if (user?.role === 'Supervisor Interno' || user?.role === 'Coordinadora' || user?.role === 'Supervisor Cliente') {
    return (
      <div className="p-8 text-center">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg inline-block">
          No tienes permiso para acceder a esta sección.
        </div>
      </div>
    );
  }

  const fetchEmployees = useCallback(async () => {
    if (showMissingContract) return;
    try {
      const isRestricted = user?.role === 'Coordinadora' || user?.role === 'Supervisor Interno';
      let url = isRestricted
        ? `/api/employees?club_id=${user?.club_id}&status=${statusFilter}`
        : `/api/employees?status=${statusFilter}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  }, [user, statusFilter, showMissingContract]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const fetchMissingContract = async () => {
    setLoadingMissing(true);
    try {
      const res = await apiFetch('/api/reports/missing-document?doc_type=Contrato+sellado');
      if (res.ok) {
        const data = await res.json();
        setMissingContractEmployees(data);
      }
    } catch (error) {
      console.error('Error fetching missing contracts:', error);
    } finally {
      setLoadingMissing(false);
    }
  };

  const handleMissingContractTab = () => {
    setShowMissingContract(true);
    setStatusFilter('');
    fetchMissingContract();
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    setShowMissingContract(false);
  };

  const displayEmployees = showMissingContract ? missingContractEmployees : employees;

  const filteredEmployees = displayEmployees.filter(emp =>
    emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.cedula.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex p-1 bg-slate-100 rounded-lg w-fit flex-wrap gap-y-1">
          <button
            onClick={() => handleStatusFilter('activo')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              statusFilter === 'activo' && !showMissingContract
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Activos
          </button>
          <button
            onClick={() => handleStatusFilter('inactivo')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              statusFilter === 'inactivo' && !showMissingContract
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Inactivos (Historial)
          </button>
          <button
            onClick={handleMissingContractTab}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
              showMissingContract
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sin Contrato Sellado
            {showMissingContract && !loadingMissing && (
              <span className="bg-orange-100 text-orange-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {missingContractEmployees.length}
              </span>
            )}
          </button>
          <Link
            to="/checklist-contratos"
            className="px-4 py-1.5 text-sm font-medium rounded-md transition-all text-slate-500 hover:text-slate-700 flex items-center gap-2"
          >
            <ClipboardList className="h-4 w-4" />
            Checklist 1 Año
          </Link>
        </div>

        <div className="flex gap-3">
          {(user?.role === 'Administrador' || user?.role === 'Super Administrador') && (
            <>
              {(user?.role === 'Administrador' || user?.role === 'Super Administrador') && (
                <button 
                  onClick={() => setIsImportDatesModalOpen(true)}
                  className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
                  Importar Fechas
                </button>
              )}
              <button 
                onClick={() => setIsBulkEmployeeModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="h-4 w-4 mr-2 text-slate-500" />
                Carga Masiva Empleados
              </button>
              <button 
                onClick={() => setIsBulkModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Upload className="h-4 w-4 mr-2 text-slate-500" />
                Carga Masiva Docs
              </button>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Empleado
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex-1 max-w-lg relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-500 focus:outline-none focus:placeholder-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Buscar por nombre o cédula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <Filter className="h-4 w-4 mr-2 text-slate-500" />
            Filtros
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Empleado
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Cédula
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Cargo
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Estado
              </th>
              {statusFilter === 'inactivo' ? (
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Motivo de Baja
                </th>
              ) : (
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Docs
                </th>
              )}
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {showMissingContract && loadingMissing ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  Cargando...
                </td>
              </tr>
            ) : filteredEmployees.length > 0 ? (
              filteredEmployees.map((person) => (
                <tr key={person.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium">
                        {person.full_name.charAt(0)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-slate-900">{person.full_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {person.cedula}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {person.position}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      person.status === 'activo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {person.status}
                    </span>
                  </td>
                  {statusFilter === 'inactivo' ? (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {person.termination_reason || 'No especificado'}
                    </td>
                  ) : (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {/* Mock document status indicators */}
                      <div className="flex gap-1">
                        <div className="w-3 h-3 rounded-full bg-slate-400" title="Cargado"></div>
                        <div className="w-3 h-3 rounded-full bg-amber-500" title="Próximo a vencer"></div>
                        <div className="w-3 h-3 rounded-full bg-orange-500" title="Faltante"></div>
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link to={`/empleados/${person.id}`} className="text-blue-600 hover:text-blue-900">
                      Ver Perfil
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  No se encontraron empleados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <NewEmployeeModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchEmployees}
        clubId={undefined}
      />

      <BulkUploadModal 
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={fetchEmployees}
      />

      <BulkEmployeeModal 
        isOpen={isBulkEmployeeModalOpen}
        onClose={() => setIsBulkEmployeeModalOpen(false)}
        onSuccess={fetchEmployees}
        clubId={undefined}
      />

      <ImportDatesModal
        isOpen={isImportDatesModalOpen}
        onClose={() => setIsImportDatesModalOpen(false)}
        onSuccess={fetchEmployees}
      />
    </div>
  );
}
