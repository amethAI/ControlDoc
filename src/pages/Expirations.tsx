import React, { useState, useEffect } from 'react';
import { Calendar, Filter, Search, AlertTriangle, Clock, CheckCircle, FileText, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

interface ExpirationDoc {
  id: string;
  file_name: string;
  file_url: string;
  expiry_date: string;
  status: string;
  document_types: {
    id: string;
    name: string;
  };
  employees: {
    id: string;
    full_name: string;
    cedula: string;
    position: string;
    club_id: string;
    clubs: {
      name: string;
    };
  };
}

export default function Expirations() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<ExpirationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clubFilter, setClubFilter] = useState<string>('all');
  const [clubs, setClubs] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    fetchData();
  }, [statusFilter, clubFilter]);

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

      // Fetch expirations
      let url = '/api/documents/expirations?';
      if (statusFilter !== 'all') url += `status=${statusFilter}&`;
      if (clubFilter !== 'all') url += `club_id=${clubFilter}&`;

      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Error fetching expirations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = 
      doc.employees.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.employees.cedula.includes(searchTerm) ||
      doc.document_types.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const getStatusBadge = (expiryDate: string) => {
    const end = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          <AlertTriangle className="h-3 w-3" />
          Vencido ({Math.abs(diffDays)} días)
        </span>
      );
    } else if (diffDays <= 30) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
          <Clock className="h-3 w-3" />
          Vence en {diffDays} días
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle className="h-3 w-3" />
          Vigente
        </span>
      );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Control de Vencimientos</h1>
          <p className="text-slate-500 mt-1">Monitorea y gestiona las fechas de expiración de documentos y contratos.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por empleado, cédula o documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          
          <div className="flex gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer"
              >
                <option value="all">Todos los estados</option>
                <option value="vencido">Vencidos</option>
                <option value="proximo_vencer">Próximos a vencer (30 días)</option>
                <option value="vigente">Vigentes</option>
              </select>
            </div>

            {user?.role !== 'Supervisor Interno' && (
              <select
                value={clubFilter}
                onChange={(e) => setClubFilter(e.target.value)}
                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
              >
                <option value="all">Todos los clubes</option>
                {clubs.map(club => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Club</th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4">Fecha Vencimiento</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <Calendar className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                    <p className="text-lg font-medium text-slate-900">No hay documentos</p>
                    <p>No se encontraron documentos con los filtros seleccionados.</p>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{doc.employees.full_name}</div>
                      <div className="text-xs text-slate-500">{doc.employees.cedula}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {doc.employees.clubs?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-slate-700">{doc.document_types.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      {new Date(doc.expiry_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(doc.expiry_date)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={doc.file_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Ver documento"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <a
                          href={`/employees/${doc.employees.id}`}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                        >
                          Ver Perfil
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
