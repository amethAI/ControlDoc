import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Search, Filter } from 'lucide-react';

export default function LogAuditoria() {
  const logs = [
    { id: '1', date: '2023-10-25 14:30', user: 'Admin General', action: 'Creación de empleado', entity: 'Juan Pérez (8-888-8888)', club: 'David' },
    { id: '2', date: '2023-10-25 15:15', user: 'Coordinadora David', action: 'Carga de documento', entity: 'Carnet Blanco - Juan Pérez', club: 'David' },
    { id: '3', date: '2023-10-26 09:00', user: 'Admin General', action: 'Actualización de club', entity: 'Costa Verde', club: 'Costa Verde' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/configuracion" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h2 className="text-2xl font-bold text-slate-800">Log de Auditoría</h2>
        </div>
        <button className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50">
          <Filter className="h-4 w-4 mr-2 text-slate-500" />
          Filtros
        </button>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex-1 max-w-md relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Buscar acción, usuario o entidad..."
            />
          </div>
        </div>
        
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-white">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fecha y Hora</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuario</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Acción</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Entidad Afectada</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Club</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {log.date}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                  {log.user}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {log.entity}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {log.club}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
