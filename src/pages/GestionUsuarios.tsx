import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Users, Plus, Search } from 'lucide-react';
import UserModal from '../components/UserModal';
import { useAuth } from '../context/AuthContext';

export default function GestionUsuarios() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const fetchData = async () => {
    try {
      const [usersRes, clubsRes] = await Promise.all([
        fetch('/api/users', {
          headers: { 'x-user-role': currentUser?.role || '' }
        }),
        fetch('/api/clubs')
      ]);
      const usersData = await usersRes.json();
      const clubsData = await clubsRes.json();
      
      if (Array.isArray(usersData)) {
        setUsers(usersData);
      } else {
        console.error('Error fetching users:', usersData);
        setUsers([]);
      }
      
      if (Array.isArray(clubsData)) {
        setClubs(clubsData);
      } else {
        console.error('Error fetching clubs:', clubsData);
        setClubs([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setUsers([]);
      setClubs([]);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getClubName = (clubId: string) => {
    if (!clubId) return 'Todos';
    const club = clubs.find(c => c.id === clubId);
    return club ? club.name : 'Todos';
  };

  const handleEdit = (user: any) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleNew = () => {
    setSelectedUser(null);
    setIsModalOpen(true);
  };

  const filteredUsers = users.filter(user => {
    if (!user) return false;
    const nameMatch = (user.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const emailMatch = (user.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || emailMatch;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/configuracion" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h2 className="text-2xl font-bold text-slate-800">Gestión de Usuarios</h2>
        </div>
        <button 
          onClick={handleNew}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Usuario
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Buscar por nombre o correo..."
            />
          </div>
        </div>
        
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-white">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuario</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rol</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Club Asignado</th>
              <th scope="col" className="relative px-6 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium">
                      {(user.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-slate-900">{user.name || 'Sin nombre'}</div>
                      <div className="text-sm text-slate-500">{user.email || 'Sin correo'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-800">
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {getClubName(user.club_id)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button 
                    onClick={() => handleEdit(user)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  No se encontraron usuarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <UserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchData}
        user={selectedUser}
      />
    </div>
  );
}
