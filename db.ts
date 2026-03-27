import { apiFetch } from '../lib/api';
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, Search, Shield } from 'lucide-react';
import AlertRecipientsModal from '../components/AlertRecipientsModal';

export default function DestinatariosAlertas() {
  const [clubs, setClubs] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState<any>(null);

  const fetchData = async () => {
    try {
      const [clubsRes, recipientsRes] = await Promise.all([
        apiFetch('/api/clubs'),
        apiFetch('/api/alert-recipients')
      ]);
      const clubsData = await clubsRes.json();
      const recipientsData = await recipientsRes.json();
      setClubs(clubsData);
      setRecipients(recipientsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getEmailsForClub = (clubId: string) => {
    return recipients.filter(r => r.club_id === clubId).map(r => r.email);
  };

  const handleEdit = (club: any) => {
    setSelectedClub(club);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/configuracion" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h2 className="text-2xl font-bold text-slate-800">Destinatarios de Alertas</h2>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-white">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Club</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Correos Configurados</th>
              <th scope="col" className="relative px-6 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {/* Global Recipients Row */}
            <tr className="bg-slate-50/50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-medium">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="ml-3">
                    <div className="text-sm font-bold text-slate-900">Destinatarios Globales</div>
                    <div className="text-xs text-slate-500">Reciben alertas de TODOS los clubes</div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-2">
                  {getEmailsForClub('global').length > 0 ? (
                    getEmailsForClub('global').map(email => (
                      <span key={email} className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        {email}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400 italic">Sin configurar (Recomendado para Coordinación)</span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button 
                  onClick={() => handleEdit({ id: 'global', name: 'Destinatarios Globales' })}
                  className="text-amber-600 hover:text-amber-900 font-bold"
                >
                  Editar
                </button>
              </td>
            </tr>

            {clubs.map((club) => {
              const emails = getEmailsForClub(club.id);
              return (
                <tr key={club.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-medium">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-slate-900">{club.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {emails.length > 0 ? (
                        emails.map(email => (
                          <span key={email} className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                            {email}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400 italic">Sin configurar</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => handleEdit(club)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedClub && (
        <AlertRecipientsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={fetchData}
          club={selectedClub}
          initialEmails={getEmailsForClub(selectedClub.id)}
        />
      )}
    </div>
  );
}
