import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, Plus, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Club {
  id: string;
  name: string;
  description: string;
  address: string;
  is_active: number;
}

export default function Clubs() {
  const { user } = useAuth();
  console.log('Clubs Page Loaded - Version 1.0.7');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClub, setNewClub] = useState({ name: '', description: '', address: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchClubs = async () => {
    try {
      const res = await fetch('/api/clubs');
      if (res.ok) {
        const data = await res.json();
        setClubs(data);
      }
    } catch (error) {
      console.error('Error fetching clubs:', error);
    }
  };

  useEffect(() => {
    fetchClubs();
  }, []);

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/clubs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        },
        body: JSON.stringify(newClub)
      });

      if (res.ok) {
        await fetchClubs();
        setIsModalOpen(false);
        setNewClub({ name: '', description: '', address: '' });
      } else {
        const data = await res.json();
        setError(data.error || 'Error al crear el club');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredClubs = clubs.filter(club => {
    const matchesSearch = club.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (user?.role === 'Coordinadora') {
      return matchesSearch && club.id === user.club_id;
    }
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex-1 max-w-lg relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-500 focus:outline-none focus:placeholder-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Buscar club..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3 items-center">
          <span className="text-xs font-bold text-orange-600 mr-2 bg-orange-50 px-2 py-1 rounded">DEBUG: {user?.role || 'Sin Rol'}</span>
          {user?.role === 'Administrador' && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Club
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClubs.map((club) => (
          <div key={club.id} className="bg-white overflow-hidden shadow-sm rounded-xl border border-slate-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <Building2 className="h-6 w-6" />
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  club.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                }`}>
                  {club.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{club.name}</h3>
              <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                {club.description || 'Sin descripción'}
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end">
              <Link to={`/clubes/${club.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                Gestionar
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Nuevo Club */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
            <div className="fixed inset-0 bg-slate-900/50 transition-opacity" onClick={() => setIsModalOpen(false)} />
            
            <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-slate-900">Crear Nuevo Club</h3>
                  <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-500">
                    <X className="h-6 w-6" />
                  </button>
                </div>
                <form onSubmit={handleCreateClub} className="space-y-4">
                  {error && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Nombre del Club</label>
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={newClub.name}
                      onChange={(e) => setNewClub({ ...newClub, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Descripción</label>
                    <textarea
                      className="mt-1 block w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      rows={3}
                      value={newClub.description}
                      onChange={(e) => setNewClub({ ...newClub, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Dirección</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={newClub.address}
                      onChange={(e) => setNewClub({ ...newClub, address: e.target.value })}
                    />
                  </div>
                  <div className="mt-5 sm:mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {isLoading ? 'Creando...' : 'Crear Club'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
