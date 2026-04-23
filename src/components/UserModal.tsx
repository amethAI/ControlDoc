import { apiFetch } from '../lib/api';
import React, { useState, useEffect } from 'react';
import { X, User, Mail, Shield, Building2, Lock, Eye, EyeOff, Trash2, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user?: any;
}

export default function UserModal({ isOpen, onClose, onSuccess, user }: UserModalProps) {
  const { user: currentUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Coordinadora',
    club_id: '',
    country: ''
  });
  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    apiFetch('/api/clubs').then(res => res.json()).then(setClubs);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShowPassword(false);
      setIsDeleting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        password: user.password || '',
        role: user.role,
        club_id: user.club_id || '',
        country: user.country || ''
      });
    } else {
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'Coordinadora',
        club_id: '',
        country: ''
      });
    }
  }, [user, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = user ? `/api/users/${user.id}` : '/api/users';
      const method = user ? 'PATCH' : 'POST';
      
      const res = await apiFetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': currentUser?.role || '',
          'x-user-id': currentUser?.id || '',
          'x-user-name': currentUser?.name || ''
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success(user ? 'Usuario actualizado con éxito' : 'Usuario creado con éxito');
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.details ? `Error: ${data.details}` : data.error || 'Error al guardar usuario');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    console.log('handleDelete triggered');
    if (!user) return;

    console.log('Deleting user:', user.id);
    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        headers: { 
          'x-user-role': currentUser?.role || '',
          'x-user-id': currentUser?.id || '',
          'x-user-name': currentUser?.name || ''
        }
      });
      console.log('Delete response status:', res.status);

      if (res.ok) {
        toast.success('Usuario eliminado con éxito');
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al eliminar usuario');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Error de red');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-xl font-bold text-slate-800">{user ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Nombre Completo</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej. Juan Pérez"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Correo Electrónico</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="usuario@psmt.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="block w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="********"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Rol</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Shield className="h-4 w-4 text-slate-400" />
              </div>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Administrador">Administrador</option>
                <option value="Supervisor Interno">Supervisor Interno</option>
                <option value="Supervisor Cliente">Supervisor Cliente</option>
                <option value="Coordinadora">Coordinadora</option>
                <option value="Recursos Humanos">Recursos Humanos</option>
              </select>
            </div>
          </div>

          {formData.role === 'Administrador' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">País <span className="text-red-500">*</span></label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Globe className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: Panama, Costa Rica, Colombia..."
                />
              </div>
              <p className="text-xs text-slate-400">Debe coincidir exactamente con el país asignado a los clubes.</p>
            </div>
          )}

          {['Coordinadora', 'Supervisor Interno', 'Supervisor Cliente'].includes(formData.role) && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Club Asignado</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Building2 className="h-4 w-4 text-slate-400" />
                </div>
                <select
                  required
                  value={formData.club_id}
                  onChange={(e) => setFormData({ ...formData, club_id: e.target.value })}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar Club...</option>
                  {clubs.map(club => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="pt-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || isDeleting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shadow-sm"
              >
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
            
            {user && !showConfirmDelete && (
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                disabled={loading || isDeleting}
                className="w-full flex items-center justify-center px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar Usuario
              </button>
            )}

            {showConfirmDelete && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-lg space-y-3">
                <p className="text-sm text-red-800 font-medium text-center">
                  ¿Estás seguro de que deseas eliminar al usuario "{user?.name}"? Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(false)}
                    disabled={isDeleting}
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
