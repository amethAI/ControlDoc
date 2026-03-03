import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Building2, Users, Search, Plus } from 'lucide-react';
import NewEmployeeModal from '../components/NewEmployeeModal';

interface Club {
  id: string;
  name: string;
  description: string;
  address: string;
  is_active: number;
}

interface Employee {
  id: string;
  full_name: string;
  cedula: string;
  position: string;
  status: string;
}

export default function ClubDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchClubData = async () => {
    if (user?.role === 'Coordinadora' && id !== user.club_id) {
      setLoading(false);
      return;
    }
    try {
      const [clubRes, empRes] = await Promise.all([
        fetch(`/api/clubs/${id}`),
        fetch(`/api/employees?club_id=${id}&status=activo`)
      ]);

      if (clubRes.ok && empRes.ok) {
        const clubData = await clubRes.json();
        const empData = await empRes.json();
        setClub(clubData);
        setEmployees(empData);
      }
    } catch (error) {
      console.error('Error fetching club details:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClubData();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando club...</div>;

  if (user?.role === 'Coordinadora' && id !== user.club_id) {
    return (
      <div className="p-8 text-center">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg inline-block">
          No tienes permiso para ver los detalles de este club.
        </div>
        <div className="mt-4">
          <Link to="/clubes" className="text-blue-600 hover:underline">Volver a Clubes</Link>
        </div>
      </div>
    );
  }

  if (!club) return <div className="p-8 text-center text-red-500">Club no encontrado</div>;

  const filteredEmployees = employees.filter(emp => 
    emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.cedula.includes(searchTerm)
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/clubes" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h2 className="text-2xl font-bold text-slate-800">Detalle del Club</h2>
        </div>
        <div className="flex gap-3">
          {user?.role === 'Administrador' && (
            <button className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50">
              Editar Club
            </button>
          )}
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-8 items-start">
          <div className="h-24 w-24 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-12 w-12" />
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Nombre del Club</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{club.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Estado</p>
              <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                club.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
              }`}>
                {club.is_active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-slate-500">Descripción</p>
              <p className="mt-1 text-slate-900">{club.description || 'Sin descripción'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-slate-900 flex items-center">
            <Users className="h-5 w-5 mr-2 text-slate-500" />
            Empleados del Club ({employees.length})
          </h3>
          {user?.role === 'Administrador' && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo Empleado
            </button>
          )}
        </div>

        <div className="flex-1 max-w-lg relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Buscar empleado en este club..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Empleado</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cédula</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cargo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((person) => (
                  <tr key={person.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium text-sm">
                          {person.full_name.charAt(0)}
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-slate-900">{person.full_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{person.cedula}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{person.position}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        person.status === 'activo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {person.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link to={`/empleados/${person.id}`} className="text-blue-600 hover:text-blue-900">
                        Ver Perfil
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron empleados en este club.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewEmployeeModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchClubData}
        clubId={id!}
      />
    </div>
  );
}
