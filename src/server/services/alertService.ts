import { supabase } from '../db.js';
import nodemailer from 'nodemailer';

export async function sendExpirationAlerts(isTest = false) {
  try {
    // Umbral de días (por ahora 30, idealmente vendría de una tabla de settings)
    const thresholdDays = 30;
    const today = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(today.getDate() + thresholdDays);
    
    const thresholdStr = thresholdDate.toISOString().split('T')[0];

    // Buscar documentos que vencen pronto (o ya vencieron)
    let query = supabase
      .from('employee_documents')
      .select(`
        *,
        employees!inner(full_name, club_id),
        document_types!inner(name)
      `)
      .not('expiry_date', 'is', null)
      .eq('is_current', 1);

    // Si no es una prueba, filtramos por fecha. 
    // Si es prueba, traemos algunos para verificar el formato del correo.
    if (!isTest) {
      query = query.lte('expiry_date', thresholdStr);
    } else {
      // En prueba traemos los que vencen en los próximos 90 días para asegurar que haya datos
      const testThreshold = new Date();
      testThreshold.setDate(today.getDate() + 90);
      query = query.lte('expiry_date', testThreshold.toISOString().split('T')[0]);
    }

    const { data: expiringDocs, error } = await query;

    if (error) throw error;

    // We need to fetch clubs separately to get their names
    const { data: clubs } = await supabase.from('clubs').select('id, name');
    const clubMap = new Map(clubs?.map(c => [c.id, c.name]) || []);

    // Agrupar por club
    const alertsByClub: Record<string, any> = {};
    
    if (expiringDocs && expiringDocs.length > 0) {
      for (const doc of expiringDocs) {
        const clubId = (doc.employees as any).club_id;
        const clubName = clubMap.get(clubId) || 'Desconocido';
        
        if (!alertsByClub[clubId]) {
          alertsByClub[clubId] = {
            club_name: clubName,
            docs: []
          };
        }
        alertsByClub[clubId].docs.push({
          ...doc,
          full_name: (doc.employees as any).full_name,
          doc_name: (doc.document_types as any).name
        });
      }
    }

    if (isTest) {
      // En prueba, asegurarnos de enviar a todos los clubes que tienen destinatarios configurados
      const { data: allRecipients } = await supabase.from('alert_recipients').select('club_id');
      const clubsWithRecipients = new Set(allRecipients?.map(r => r.club_id));
      
      for (const rawClubId of clubsWithRecipients) {
        const clubId = rawClubId || 'global';
        if (!alertsByClub[clubId]) {
          alertsByClub[clubId] = {
            club_name: clubId === 'global' ? 'Global' : (clubMap.get(clubId) || 'Desconocido'),
            docs: [{
              full_name: 'Empleado de Prueba',
              doc_name: 'Documento de Prueba',
              expiry_date: new Date().toISOString().split('T')[0]
            }]
          };
        }
      }
    }

    if (Object.keys(alertsByClub).length === 0) {
      return { success: false, error: isTest ? 'No hay destinatarios configurados para enviar la prueba.' : 'No hay alertas pendientes hoy.' };
    }

    let transporter;
    
    // Si tenemos credenciales reales configuradas
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      console.log('Usando credenciales reales para enviar correos...');
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || "smtp.office365.com",
        port: parseInt(process.env.EMAIL_PORT || "587"),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          ciphers: 'SSLv3'
        },
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 10000,
        family: 4 // Force IPv4 to prevent ENETUNREACH issues on some hosts like Render
      } as any);
    } else {
      // Si no hay credenciales, usamos Ethereal (simulador)
      console.log('No hay credenciales reales. Creando cuenta de prueba en Ethereal...');
      try {
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false, 
          auth: {
            user: testAccount.user, 
            pass: testAccount.pass, 
          },
          connectionTimeout: 10000,
        });
        console.log('Cuenta de prueba creada con éxito.');
      } catch (err) {
        console.error('Error creando cuenta Ethereal:', err);
        return { success: false, error: 'Error al conectar con el servidor de correos de prueba.' };
      }
    }

    const previewUrls: string[] = [];
    let sentCount = 0;

    // Enviar correos por club
    for (const clubId in alertsByClub) {
      const clubData = alertsByClub[clubId];
      console.log(`Procesando club: ${clubData.club_name}`);

      
      // Fetch club-specific recipients
      const { data: clubRecipients } = await supabase
        .from('alert_recipients')
        .select('email')
        .eq('club_id', clubId);
        
      // Fetch global recipients (e.g., supervisors/coordinators)
      const { data: globalRecipients } = await supabase
        .from('alert_recipients')
        .select('email')
        .eq('club_id', 'global');
        
      const allRecipients = [
        ...(clubRecipients || []),
        ...(globalRecipients || [])
      ];

      if (allRecipients.length === 0) continue;

      const toEmails = Array.from(new Set(allRecipients.map(r => r.email))).join(', ');

      let htmlContent = `
        <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
            <h2 style="margin: 0;">⚠️ Alerta de Vencimiento de Documentos</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Club ${clubData.club_name}</p>
          </div>
          <div style="padding: 20px;">
            <p>Hola,</p>
            <p>El siguiente personal del <strong>Club ${clubData.club_name}</strong> tiene documentos próximos a vencer o ya vencidos:</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
              <thead>
                <tr style="background-color: #f8fafc; text-align: left;">
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Empleado</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Documento</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Vencimiento</th>
                </tr>
              </thead>
              <tbody>
      `;

      for (const doc of clubData.docs) {
        htmlContent += `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${doc.full_name}</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${doc.doc_name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #dc2626; font-weight: bold;">${doc.expiry_date}</td>
          </tr>
        `;
      }

      htmlContent += `
              </tbody>
            </table>
            <p style="margin-top: 20px; color: #64748b; font-size: 14px;">Por favor, solicite la renovación lo antes posible.</p>
          </div>
          <div style="background-color: #f8fafc; padding: 15px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0;">
            Este es un mensaje automático del Sistema de Gestión PSMT.
          </div>
        </div>
      `;

      console.log(`Enviando correo a: ${toEmails}`);
      try {
        const info = await transporter.sendMail({
          from: process.env.EMAIL_FROM || (process.env.EMAIL_USER ? `"Sistema PSMT" <${process.env.EMAIL_USER}>` : '"Sistema PSMT" <alertas@psmt.com>'),
          to: toEmails,
          subject: `⚠️ Alerta de Vencimiento - ${clubData.club_name}`,
          html: htmlContent,
        });
        console.log(`Correo enviado con éxito a ${toEmails}. MessageId: ${info.messageId}`);
        
        sentCount++;

        if (!process.env.EMAIL_USER) {
          const url = nodemailer.getTestMessageUrl(info);
          if (url) previewUrls.push(url as string);
        }
      } catch (sendErr) {
        console.error(`Error al enviar correo a ${toEmails}:`, sendErr);
      }
    }

    if (sentCount === 0) {
       return { success: false, error: 'No se pudo enviar ningún correo. Verifique la configuración de destinatarios y credenciales.' };
    }

    return { 
      success: true, 
      previewUrls, 
      isRealEmail: !!process.env.EMAIL_USER 
    };
  } catch (error) {
    console.error('Error sending alerts:', error);
    return { success: false, error: 'Error al enviar alertas' };
  }
}
