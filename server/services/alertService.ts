import { supabase } from '../db.ts';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import dns from 'dns';
import webpush from 'web-push';

// Forzar a Node.js a preferir IPv4 sobre IPv6 en todas las resoluciones DNS
// Esto soluciona el error ENETUNREACH en servidores como Render que no tienen salida IPv6
dns.setDefaultResultOrder('ipv4first');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@controldoc.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendPushToSubscribers(alertsByClub: Record<string, { club_name: string; docs: any[] }>) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, users!inner(id, club_id, role)');

  if (error || !subscriptions?.length) return;

  const alertedClubIds = new Set(Object.keys(alertsByClub));
  const globalRoles = ['Super Administrador', 'Administrador'];

  for (const sub of subscriptions) {
    const user = (sub as any).users;
    const isGlobal = globalRoles.includes(user.role);
    const hasAlert = isGlobal ? alertedClubIds.size > 0 : alertedClubIds.has(user.club_id);
    if (!hasAlert) continue;

    const relevantClubs = isGlobal
      ? Object.values(alertsByClub)
      : [alertsByClub[user.club_id]].filter(Boolean);

    const totalAlerts = relevantClubs.reduce((sum, c) => sum + c.docs.length, 0);
    const clubNames = relevantClubs.map(c => c.club_name).join(', ');

    const payload = JSON.stringify({
      title: 'ControlDoc — Alerta',
      body: `${totalAlerts} documento${totalAlerts !== 1 ? 's' : ''} por atender en ${clubNames}`,
      url: '/',
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
}

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
        employees!inner(full_name, club_id, contract_type, status),
        document_types!inner(name, has_expiry)
      `)
      .eq('document_types.has_expiry', 1)
      .not('expiry_date', 'is', null)
      .eq('is_current', 1)
      .eq('employees.status', 'activo');

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

    // Fetch active employees to check contract and probationary periods
    const { data: activeEmployees, error: empError } = await supabase
      .from('employees')
      .select('id, full_name, club_id, contract_start, contract_end, contract_type')
      .eq('status', 'activo');

    if (empError) throw empError;

    // We need to fetch clubs separately to get their names
    const { data: clubs } = await supabase.from('clubs').select('id, name');
    const clubMap = new Map(clubs?.map(c => [c.id, c.name]) || []);

    // Agrupar por club
    const alertsByClub: Record<string, any> = {};

    // Track (employee_id + date) combos already added to avoid true duplicates
    const addedAlerts = new Set<string>();

    const addAlert = (clubId: string, clubName: string, employeeId: string, full_name: string, doc_name: string, expiry_date: string) => {
      const key = `${employeeId}|${doc_name}|${expiry_date}`;
      if (addedAlerts.has(key)) return;
      addedAlerts.add(key);
      if (!alertsByClub[clubId]) alertsByClub[clubId] = { club_name: clubName, docs: [] };
      alertsByClub[clubId].docs.push({ full_name, doc_name, expiry_date });
    };

    // Process ALL expiring documents (including contracts — previously excluded by mistake)
    if (expiringDocs && expiringDocs.length > 0) {
      for (const doc of expiringDocs) {
        // Skip inactive employees (extra guard in case the join filter doesn't apply)
        if ((doc.employees as any).status && (doc.employees as any).status !== 'activo') continue;

        const clubId = (doc.employees as any).club_id;
        const clubName = clubMap.get(clubId) || 'Desconocido';
        addAlert(
          clubId, clubName,
          doc.employee_id,
          (doc.employees as any).full_name,
          (doc.document_types as any).name,
          doc.expiry_date
        );
      }
    }

    // Process expiring contracts and probationary periods from employees table
    if (activeEmployees && activeEmployees.length > 0) {
      const targetThreshold = isTest ? new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000) : thresholdDate;
      const todayStr = today.toISOString().split('T')[0];

      for (const emp of activeEmployees) {
        const clubId = emp.club_id;
        const clubName = clubMap.get(clubId) || 'Desconocido';

        // contract_end: alert only for finite contracts within window [today - 15d, threshold]
        if (emp.contract_end && emp.contract_type?.toLowerCase() !== 'indefinido') {
          const contractEnd = new Date(emp.contract_end + 'T12:00:00');
          const fifteenDaysAgo = new Date(today);
          fifteenDaysAgo.setDate(today.getDate() - 15);
          if (contractEnd >= fifteenDaysAgo && contractEnd <= targetThreshold) {
            addAlert(clubId, clubName, emp.id, emp.full_name, 'Terminación de Contrato', emp.contract_end);
          }
        }

        // Probationary period: contract_start + 3 months, within window [today - 15d, threshold]
        if (emp.contract_start) {
          const probatorioEnd = new Date(emp.contract_start + 'T12:00:00');
          probatorioEnd.setMonth(probatorioEnd.getMonth() + 3);
          const fifteenDaysAgo = new Date(today);
          fifteenDaysAgo.setDate(today.getDate() - 15);
          if (probatorioEnd >= fifteenDaysAgo && probatorioEnd <= targetThreshold) {
            addAlert(clubId, clubName, emp.id, emp.full_name, 'Terminación de Periodo Probatorio', probatorioEnd.toISOString().split('T')[0]);
          }
        }
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

    let transporter: any = null;
    let resend: Resend | null = null;
    let useResend = false;
    let useBrevo = false;
    
    // Si tenemos clave de Brevo (Sendinblue), la usamos
    if (process.env.BREVO_API_KEY) {
      console.log('Usando Brevo API para enviar correos (permite múltiples destinatarios sin dominio)...');
      useBrevo = true;
    }
    // Si tenemos clave de Resend, la usamos
    else if (process.env.RESEND_API_KEY) {
      console.log('Usando Resend API para enviar correos...');
      resend = new Resend(process.env.RESEND_API_KEY);
      useResend = true;
    }
    // Si tenemos credenciales reales configuradas para SMTP
    else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      console.log('Usando credenciales reales SMTP para enviar correos...');
      
      const host = process.env.EMAIL_HOST || "smtp.office365.com";
      const isGmail = host.includes('gmail.com');
      
      let transportConfig: any = {
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 20000,
      };

      if (isGmail) {
        // Configuracion optima y nativa para Gmail
        transportConfig.service = 'gmail';
        transportConfig.host = 'smtp.gmail.com';
        transportConfig.port = 465;
        transportConfig.secure = true;
        transportConfig.family = 4; // Forzar IPv4 para evitar ENETUNREACH en Render
      } else {
        const port = parseInt(process.env.EMAIL_PORT || "587");
        transportConfig.host = host;
        transportConfig.port = port;
        transportConfig.secure = port === 465;
        transportConfig.tls = {
          ciphers: 'SSLv3',
          rejectUnauthorized: false
        };
        transportConfig.family = 4;
      }
      
      transporter = nodemailer.createTransport(transportConfig);
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
    let lastError = '';

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
        if (useBrevo) {
          const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'api-key': process.env.BREVO_API_KEY as string,
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              sender: { name: 'Sistema PSMT', email: process.env.EMAIL_USER || 'alertaspsmt@gmail.com' },
              to: toEmails.split(',').map(e => ({ email: e.trim() })),
              subject: `⚠️ Alerta de Vencimiento - ${clubData.club_name}`,
              htmlContent: htmlContent
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(`Brevo API Error: ${JSON.stringify(errData)}`);
          }
          console.log(`Correo enviado con éxito a ${toEmails} via Brevo.`);
          sentCount++;
        } else if (useResend && resend) {
          const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'Sistema PSMT <onboarding@resend.dev>',
            to: toEmails.split(',').map(e => e.trim()),
            subject: `⚠️ Alerta de Vencimiento - ${clubData.club_name}`,
            html: htmlContent,
          });

          if (error) {
            throw new Error(`Resend API Error: ${error.message}`);
          }
          console.log(`Correo enviado con éxito a ${toEmails} via Resend. ID: ${data?.id}`);
          sentCount++;
        } else {
          const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || (process.env.EMAIL_USER ? `"Sistema PSMT" <${process.env.EMAIL_USER}>` : '"Sistema PSMT" <alertas@psmt.com>'),
            to: toEmails,
            subject: `⚠️ Alerta de Vencimiento - ${clubData.club_name}`,
            html: htmlContent,
          });
          console.log(`Correo enviado con éxito a ${toEmails} via SMTP. MessageId: ${info.messageId}`);
          
          sentCount++;

          if (!process.env.EMAIL_USER) {
            const url = nodemailer.getTestMessageUrl(info);
            if (url) previewUrls.push(url as string);
          }
        }
      } catch (sendErr: any) {
        console.error(`Error al enviar correo a ${toEmails}:`, sendErr);
        lastError = sendErr.message || String(sendErr);
      }
    }

    // ── HR Email ────────────────────────────────────────────────────────────────
    // Send contract terminations, probationary periods and upcoming birthdays to HR
    const { data: hrRecipients } = await supabase
      .from('alert_recipients')
      .select('email')
      .eq('club_id', 'hr');

    if (hrRecipients && hrRecipients.length > 0) {
      const hrEmails = Array.from(new Set(hrRecipients.map((r: any) => r.email))).join(', ');

      // Collect HR-relevant entries from all clubs
      const hrDocs: { full_name: string; doc_name: string; expiry_date: string; club_name: string }[] = [];
      for (const clubId in alertsByClub) {
        const clubData = alertsByClub[clubId];
        for (const doc of clubData.docs) {
          if (
            doc.doc_name === 'Terminación de Contrato' ||
            doc.doc_name === 'Terminación de Periodo Probatorio'
          ) {
            hrDocs.push({ ...doc, club_name: clubData.club_name });
          }
        }
      }

      // Fetch upcoming birthdays (today + next 7 days)
      const { data: allEmpsBirthday } = await supabase
        .from('employees')
        .select('full_name, birth_date, club_id')
        .eq('status', 'activo')
        .not('birth_date', 'is', null);

      const upcomingBirthdays: { full_name: string; birth_date: string; club_name: string }[] = [];
      if (allEmpsBirthday) {
        for (const emp of allEmpsBirthday) {
          const birth = new Date(emp.birth_date);
          const thisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
          const diffDays = Math.ceil((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 7) {
            upcomingBirthdays.push({
              full_name: emp.full_name,
              birth_date: emp.birth_date,
              club_name: clubMap.get(emp.club_id) || 'Desconocido'
            });
          }
        }
      }

      if (hrDocs.length > 0 || upcomingBirthdays.length > 0) {
        let hrHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #7c3aed; color: white; padding: 20px; text-align: center;">
              <h2 style="margin: 0;">📋 Resumen de Recursos Humanos</h2>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">PSMT — ${today.toISOString().split('T')[0]}</p>
            </div>
            <div style="padding: 20px;">
        `;

        if (hrDocs.length > 0) {
          hrHtml += `
            <h3 style="color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">⚠️ Vencimientos de Contrato y Periodo Probatorio</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="background-color: #f8fafc;">
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; text-align: left;">Empleado</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; text-align: left;">Club</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; text-align: left;">Alerta</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; text-align: left;">Fecha</th>
                </tr>
              </thead>
              <tbody>
          `;
          for (const doc of hrDocs) {
            hrHtml += `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${doc.full_name}</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${doc.club_name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${doc.doc_name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #dc2626; font-weight: bold;">${doc.expiry_date}</td>
              </tr>
            `;
          }
          hrHtml += `</tbody></table>`;
        }

        if (upcomingBirthdays.length > 0) {
          hrHtml += `
            <h3 style="color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">🎂 Cumpleaños próximos (próximos 7 días)</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f8fafc;">
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; text-align: left;">Empleado</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; text-align: left;">Club</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; text-align: left;">Fecha</th>
                </tr>
              </thead>
              <tbody>
          `;
          for (const emp of upcomingBirthdays) {
            const birth = new Date(emp.birth_date);
            hrHtml += `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${emp.full_name}</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${emp.club_name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${birth.toLocaleDateString('es-PA', { day: '2-digit', month: 'long' })}</td>
              </tr>
            `;
          }
          hrHtml += `</tbody></table>`;
        }

        hrHtml += `
            </div>
            <div style="background-color: #f8fafc; padding: 15px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0;">
              Este es un mensaje automático del Sistema de Gestión PSMT — Recursos Humanos.
            </div>
          </div>
        `;

        try {
          if (useBrevo) {
            await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_API_KEY as string, 'content-type': 'application/json' },
              body: JSON.stringify({
                sender: { name: 'Sistema PSMT', email: process.env.EMAIL_USER || 'alertaspsmt@gmail.com' },
                to: hrEmails.split(',').map((e: string) => ({ email: e.trim() })),
                subject: `📋 Resumen RRHH — ${today.toISOString().split('T')[0]}`,
                htmlContent: hrHtml
              })
            });
          } else if (useResend && resend) {
            await resend.emails.send({
              from: process.env.EMAIL_FROM || 'Sistema PSMT <onboarding@resend.dev>',
              to: hrEmails.split(',').map((e: string) => e.trim()),
              subject: `📋 Resumen RRHH — ${today.toISOString().split('T')[0]}`,
              html: hrHtml,
            });
          } else if (transporter) {
            await transporter.sendMail({
              from: process.env.EMAIL_FROM || `"Sistema PSMT" <${process.env.EMAIL_USER}>`,
              to: hrEmails,
              subject: `📋 Resumen RRHH — ${today.toISOString().split('T')[0]}`,
              html: hrHtml,
            });
          }
          sentCount++;
          console.log(`Correo RRHH enviado a ${hrEmails}`);
        } catch (hrErr: any) {
          console.error('Error al enviar correo RRHH:', hrErr.message);
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────────

    if (sentCount === 0) {
       return { success: false, error: `No se pudo enviar el correo. Detalle técnico: ${lastError || 'Verifique credenciales y destinatarios.'}` };
    }

    // Send push notifications in parallel (non-blocking — email success is enough)
    sendPushToSubscribers(alertsByClub).catch(err => console.error('Push send error:', err));

    return {
      success: true,
      previewUrls,
      isRealEmail: !!process.env.EMAIL_USER || useResend || useBrevo
    };
  } catch (error) {
    console.error('Error sending alerts:', error);
    return { success: false, error: 'Error al enviar alertas' };
  }
}

export async function sendMonthlyReport() {
  try {
    const today = new Date();
    const monthLabel = today.toLocaleDateString('es-PA', { month: 'long', year: 'numeric' });

    const { data: clubs } = await supabase.from('clubs').select('id, name');
    const clubMap = new Map((clubs || []).map(c => [c.id, c.name]));

    const { data: employees } = await supabase
      .from('employees')
      .select('id, full_name, club_id, contract_end, contract_type, status')
      .eq('status', 'activo');

    const totalActive = employees?.length || 0;

    // Contracts expiring in the next 12 months grouped by month+club
    const next12 = new Date(today.getFullYear(), today.getMonth() + 12, today.getDate());
    const expiringContracts = (employees || []).filter(e =>
      e.contract_end &&
      e.contract_type?.toLowerCase() !== 'indefinido' &&
      new Date(e.contract_end + 'T12:00:00') >= today &&
      new Date(e.contract_end + 'T12:00:00') <= next12
    );

    // Group by month with club breakdown
    const monthBuckets: Record<string, { label: string; clubs: Record<string, { name: string; employees: string[] }> }> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthBuckets[key] = {
        label: d.toLocaleDateString('es-PA', { month: 'long', year: 'numeric' }),
        clubs: {},
      };
    }

    for (const emp of expiringContracts) {
      const ym = (emp.contract_end as string).substring(0, 7);
      if (!monthBuckets[ym]) continue;
      const clubName = clubMap.get(emp.club_id) || 'Sin club';
      if (!monthBuckets[ym].clubs[emp.club_id]) {
        monthBuckets[ym].clubs[emp.club_id] = { name: clubName, employees: [] };
      }
      monthBuckets[ym].clubs[emp.club_id].employees.push(emp.full_name);
    }

    // Compliance by club
    const { data: expiredDocs } = await supabase
      .from('employee_documents')
      .select('employee_id, employees!inner(club_id, status)')
      .eq('is_current', 1)
      .lt('expiry_date', today.toISOString().split('T')[0])
      .eq('employees.status', 'activo');

    const expiredByClub = new Set<string>();
    for (const doc of expiredDocs || []) {
      expiredByClub.add(`${(doc.employees as any).club_id}:${doc.employee_id}`);
    }

    const employeesByClub: Record<string, { name: string; total: number; withExpired: number }> = {};
    for (const emp of employees || []) {
      if (!employeesByClub[emp.club_id]) {
        employeesByClub[emp.club_id] = { name: clubMap.get(emp.club_id) || 'Sin club', total: 0, withExpired: 0 };
      }
      employeesByClub[emp.club_id].total++;
      if (expiredByClub.has(`${emp.club_id}:${emp.id}`)) employeesByClub[emp.club_id].withExpired++;
    }

    // Build HTML
    let html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <div style="background-color:#1d4ed8;color:white;padding:24px;text-align:center;">
          <h2 style="margin:0;font-size:20px;">📊 Reporte Ejecutivo Mensual</h2>
          <p style="margin:6px 0 0;opacity:.85;text-transform:capitalize;">${monthLabel}</p>
        </div>
        <div style="padding:24px;">

          <!-- KPIs -->
          <table style="width:100%;margin-bottom:24px;">
            <tr>
              <td style="background:#f0f9ff;border-radius:8px;padding:14px;text-align:center;width:50%;">
                <div style="font-size:28px;font-weight:bold;color:#1d4ed8;">${totalActive}</div>
                <div style="font-size:12px;color:#64748b;margin-top:4px;">Empleados Activos</div>
              </td>
              <td style="width:16px;"></td>
              <td style="background:#fef9f0;border-radius:8px;padding:14px;text-align:center;">
                <div style="font-size:28px;font-weight:bold;color:#d97706;">${expiringContracts.length}</div>
                <div style="font-size:12px;color:#64748b;margin-top:4px;">Contratos por Vencer (12 meses)</div>
              </td>
            </tr>
          </table>

          <!-- Proyección de contratos por mes y club -->
          <h3 style="color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-top:0;">
            📅 Proyección de Vencimientos por Club
          </h3>
    `;

    const activeBuckets = Object.entries(monthBuckets).filter(([, b]) => Object.keys(b.clubs).length > 0);
    if (activeBuckets.length === 0) {
      html += `<p style="color:#64748b;font-size:14px;">No hay contratos por vencer en los próximos 12 meses.</p>`;
    } else {
      for (const [, bucket] of activeBuckets) {
        const total = Object.values(bucket.clubs).reduce((s, c) => s + c.employees.length, 0);
        html += `
          <div style="margin-bottom:16px;">
            <div style="font-weight:bold;color:#1e293b;font-size:14px;margin-bottom:6px;text-transform:capitalize;">
              ${bucket.label} — <span style="color:#d97706;">${total} contrato${total !== 1 ? 's' : ''}</span>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left;">Club</th>
                  <th style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left;">Empleados</th>
                </tr>
              </thead>
              <tbody>
        `;
        for (const club of Object.values(bucket.clubs)) {
          html += `
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;">${club.name}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#475569;">${club.employees.join(', ')}</td>
            </tr>
          `;
        }
        html += `</tbody></table></div>`;
      }
    }

    // Compliance by club
    html += `
          <h3 style="color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-top:24px;">
            ✅ Cumplimiento por Club
          </h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:left;">Club</th>
                <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:center;">Empleados</th>
                <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:center;">Con docs vencidos</th>
                <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:center;">Cumplimiento</th>
              </tr>
            </thead>
            <tbody>
    `;

    for (const club of Object.values(employeesByClub).sort((a, b) => a.name.localeCompare(b.name))) {
      const pct = club.total > 0 ? Math.round((club.total - club.withExpired) / club.total * 100) : 100;
      const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
      html += `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${club.name}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;">${club.total}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;color:#ef4444;">${club.withExpired}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:bold;color:${color};">${pct}%</td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
        <div style="background:#f8fafc;padding:15px;text-align:center;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;">
          Reporte automático mensual — Sistema de Gestión ControlDoc PSMT
        </div>
      </div>
    `;

    // Send to global + hr recipients
    const { data: recipients } = await supabase
      .from('alert_recipients')
      .select('email')
      .in('club_id', ['global', 'hr']);

    if (!recipients?.length) {
      console.log('[MONTHLY] No hay destinatarios configurados para el reporte mensual.');
      return { success: false, error: 'Sin destinatarios' };
    }

    const toEmails = Array.from(new Set(recipients.map(r => r.email)));
    const subject = `📊 Reporte Mensual PSMT — ${monthLabel}`;
    const sender = { name: 'Sistema PSMT', email: process.env.EMAIL_USER || 'alertaspsmt@gmail.com' };

    if (process.env.BREVO_API_KEY) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ sender, to: toEmails.map(e => ({ email: e })), subject, htmlContent: html }),
      });
    } else if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({ from: process.env.EMAIL_FROM || 'Sistema PSMT <onboarding@resend.dev>', to: toEmails, subject, html });
    } else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = nodemailer.createTransport({
        service: 'gmail', host: 'smtp.gmail.com', port: 465, secure: true, family: 4,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      await transporter.sendMail({ from: `"Sistema PSMT" <${process.env.EMAIL_USER}>`, to: toEmails.join(', '), subject, html });
    }

    console.log(`[MONTHLY] Reporte mensual enviado a: ${toEmails.join(', ')}`);
    return { success: true };
  } catch (err) {
    console.error('[MONTHLY] Error al enviar reporte mensual:', err);
    return { success: false, error: 'Error al generar el reporte' };
  }
}
