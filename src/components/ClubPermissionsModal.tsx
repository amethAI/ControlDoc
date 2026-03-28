import React, { useState, useEffect } from 'react';
import { X, Shield, User, Check } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

interface ClubPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  clubName: string;
}

export default function ClubPermissionsModal({ isOpen, onClose, clubId, clubName }: ClubPermissionsModalProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/users', {
        headers: { 'x-user-role': currentUser?.role || '' }
      });
      if (res.ok) {
        const data = await res.json();
        // Filtrar Administrador y Supervisor Cliente (tienen acceso global)
        const filteredUsers = data.filter((u: any) => u.role !== 'Administrador' && u.role !== 'Supervisor Cliente');
        setUsers(filteredUsers);
      }
    } catch (error) {
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = async (userId: string, newPermission: 'edit' | 'view' | 'none') => {
    const originalUsers = [...users];
    const userToUpdate = originalUsers.find(u => u.id === userId);
    if (!userToUpdate) return;

    let newRole = userToUpdate.role;
    let newClubId = userToUpdate.club_id;

    if (newPermission === 'none') {
      // Si se quita el acceso y era de este club, se le quita el club
      if (newClubId === clubId) {
        newClubId = null;
      }
    } else {
      newClubId = clubId;
      newRole = newPermission === 'edit' ? 'Supervisor Interno' : 'Coordinadora';
    }

    // Optimistic update
    setUsers(users.map(u => {
      if (u.id === userId) {
        return { ...u, role: newRole, club_id: newClubId };
      }
      return u;
    }));

    try {
      const res = await apiFetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': currentUser?.role || '',
        },
        body: JSON.stringify({
          name: userToUpdate.name,
          email: userToUpdate.email,
          role: newRole,
          club_id: newClubId
        })
      });

      if (!res.ok) {
        throw new Error('Error al actualizar');
      }
      toast.success('Permisos actualizados correctamente');
    } catch (error) {
      toast.error('Error al actualizar permisos');
      setUsers(originalUsers); // Revertir en caso de error
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Permisos del Club</h3>
              <p className="text-sm text-slate-500">{clubName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 mb-4">
                Asigna qué usuarios pueden editar (Supervisor Interno) o solo ver (Coordinadora) la información de este club.
              </p>
              
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuario</th>
                      <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Permiso en este club</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {users.map((u) => {
                      const isAssignedToThisClub = u.club_id === clubId;
                      const currentPermission = isAssignedToThisClub 
                        ? (u.role === 'Supervisor Interno' ? 'edit' : 'view') 
                        : 'none';

                      return (
                        <tr key={u.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium text-sm">
                                {(u.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="ml-3">
                                <div className="text-sm font-medium text-slate-900">{u.name}</div>
                                <div className="text-xs text-slate-500">{u.email}</div>
                                {!isAssignedToThisClub && u.club_id && (
                                  <div className="text-xs text-amber-600 mt-0.5">Asignado a otro club</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="inline-flex rounded-md shadow-sm" role="group">
                              <button
                                type="button"
                                onClick={() => handlePermissionChange(u.id, 'none')}
                                className={`px-4 py-2 text-xs font-medium border rounded-l-lg ${
                                  currentPermission === 'none' 
                                    ? 'bg-slate-100 text-slate-800 border-slate-300 z-10' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                Sin acceso
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePermissionChange(u.id, 'view')}
                                className={`px-4 py-2 text-xs font-medium border-t border-b ${
                                  currentPermission === 'view' 
                                    ? 'bg-blue-50 text-blue-700 border-blue-300 z-10' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                Puede Ver
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePermissionChange(u.id, 'edit')}
                                className={`px-4 py-2 text-xs font-medium border rounded-r-lg ${
                                  currentPermission === 'edit' 
                                    ? 'bg-green-50 text-green-700 border-green-300 z-10' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                Puede Editar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-6 py-8 text-center text-slate-500">
                          No hay usuarios disponibles para asignar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
