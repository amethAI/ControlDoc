import express from 'express';
import { createServer as createViteServer } from 'vite';
import apiRouter from './src/server/routes/index.ts';
import cron from 'node-cron';
import { sendExpirationAlerts } from './src/server/services/alertService.ts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pptxgen from 'pptxgenjs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`);

  app.use(express.json());
  app.use(cors());
  app.use(helmet({ contentSecurityPolicy: false }));

  // Rate limiter for login endpoint
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.' }
  });
  app.use('/api/auth/login', loginLimiter);

  // Security + cache headers
  app.use((req, res, next) => {
    res.set('X-App-Version', '1.0.8');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Generate and download PowerPoint presentation
  app.get('/api/download-presentation', async (req, res) => {
    try {
      // @ts-ignore
      let pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';
      pres.author = 'Equipo ControlDoc';
      pres.company = 'ControlDoc';
      pres.title = 'Presentación Ejecutiva ControlDoc';

      // Define Master Slide for consistent styling
      pres.defineSlideMaster({
        title: 'MASTER_SLIDE',
        background: { color: 'F8FAFC' }, // Light slate background
        objects: [
          { rect: { x: 0, y: 0, w: '100%', h: 0.6, fill: { color: '0F172A' } } }, // Top bar
          { text: { text: 'ControlDoc', options: { x: 0.3, y: 0.15, w: 3, h: 0.3, color: 'FFFFFF', fontSize: 16, bold: true } } },
          { rect: { x: 0, y: 5.2, w: '100%', h: 0.4, fill: { color: 'E2E8F0' } } }, // Bottom bar
          { text: { text: 'Confidencial - Uso Interno | Sistema de Gestión Documental', options: { x: 0.3, y: 5.25, w: 5, h: 0.3, color: '64748B', fontSize: 10 } } },
          { text: { text: 'Pág. ', options: { x: 9.0, y: 5.25, w: 1, h: 0.3, color: '64748B', fontSize: 10 } } }
        ]
      });

      // Helper function to add a standard content slide with an image
      const addFeatureSlide = (title: string, subtitle: string, bulletPoints: any[], imageUrl: string) => {
        let slide = pres.addSlide({ masterName: 'MASTER_SLIDE' });
        slide.addText(title, { x: 0.5, y: 0.9, w: 9, h: 0.6, fontSize: 26, bold: true, color: '0F172A' });
        slide.addText(subtitle, { x: 0.5, y: 1.4, w: 9, h: 0.4, fontSize: 16, color: '38BDF8', bold: true });
        
        // Add bullet points on the left
        slide.addText(bulletPoints, { x: 0.5, y: 2.0, w: 4.5, h: 3, fontSize: 14, color: '334155', bullet: true, lineSpacing: 24 });
        
        // Add image on the right
        try {
          slide.addImage({ path: imageUrl, x: 5.2, y: 1.8, w: 4.3, h: 3.0, sizing: { type: 'cover', w: 4.3, h: 3.0 } });
          // Add a subtle border to the image
          slide.addShape(pres.ShapeType.rect, { x: 5.2, y: 1.8, w: 4.3, h: 3.0, fill: { type: 'none' }, line: { color: 'CBD5E1', width: 1 } });
        } catch (e) {
          console.error("Failed to add image", e);
        }
      };

      // Slide 1: Portada
      let slide1 = pres.addSlide();
      slide1.background = { color: '0F172A' }; // Dark slate
      try {
        slide1.addImage({ path: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80', x: 0, y: 0, w: '100%', h: '100%', sizing: { type: 'cover', w: 10, h: 5.625 } });
        // Add a dark overlay
        slide1.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '0F172A', transparency: 30 } });
      } catch (e) {}
      slide1.addText('ControlDoc', { x: 1, y: 1.8, w: 8, h: 1, fontSize: 54, bold: true, color: 'FFFFFF', align: 'center' });
      slide1.addText('Plataforma Integral de Gestión Operativa', { x: 1, y: 2.8, w: 8, h: 0.5, fontSize: 22, color: '38BDF8', align: 'center' });
      slide1.addText('Automatización, Control y Cumplimiento Normativo', { x: 1, y: 3.5, w: 8, h: 0.5, fontSize: 16, color: 'E2E8F0', align: 'center' });

      // Slide 2: Introducción
      let slide2 = pres.addSlide({ masterName: 'MASTER_SLIDE' });
      slide2.addText('¿Qué es ControlDoc?', { x: 0.5, y: 0.9, w: 9, h: 0.6, fontSize: 28, bold: true, color: '0F172A' });
      slide2.addText('ControlDoc es una solución tecnológica diseñada para centralizar y automatizar la gestión de recursos humanos, sedes operativas y cumplimiento documental. Elimina el trabajo manual, previene riesgos legales por documentos vencidos y ofrece visibilidad en tiempo real de toda la operación.', { x: 0.5, y: 1.6, w: 9, h: 1.2, fontSize: 16, color: '334155', lineSpacing: 24 });
      
      slide2.addShape(pres.ShapeType.rect, { x: 0.5, y: 3.2, w: 2.8, h: 1.5, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, shadow: { type: 'outer', opacity: 0.1 } });
      slide2.addText('Centralización', { x: 0.5, y: 3.4, w: 2.8, h: 0.4, align: 'center', fontSize: 16, bold: true, color: '0F172A' });
      slide2.addText('Toda la información en un solo lugar seguro.', { x: 0.7, y: 3.9, w: 2.4, h: 0.6, align: 'center', fontSize: 12, color: '64748B' });

      slide2.addShape(pres.ShapeType.rect, { x: 3.6, y: 3.2, w: 2.8, h: 1.5, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, shadow: { type: 'outer', opacity: 0.1 } });
      slide2.addText('Automatización', { x: 3.6, y: 3.4, w: 2.8, h: 0.4, align: 'center', fontSize: 16, bold: true, color: '0F172A' });
      slide2.addText('Alertas y procesos que funcionan solos.', { x: 3.8, y: 3.9, w: 2.4, h: 0.6, align: 'center', fontSize: 12, color: '64748B' });

      slide2.addShape(pres.ShapeType.rect, { x: 6.7, y: 3.2, w: 2.8, h: 1.5, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, shadow: { type: 'outer', opacity: 0.1 } });
      slide2.addText('Cumplimiento', { x: 6.7, y: 3.4, w: 2.8, h: 0.4, align: 'center', fontSize: 16, bold: true, color: '0F172A' });
      slide2.addText('Cero multas por documentos vencidos.', { x: 6.9, y: 3.9, w: 2.4, h: 0.6, align: 'center', fontSize: 12, color: '64748B' });

      // Slide 3: Dashboard
      addFeatureSlide(
        '1. Dashboard Principal',
        'Visibilidad total en tiempo real',
        [
          { text: 'Métricas Clave:', options: { bold: true } },
          { text: ' Visualiza el total de empleados, clubes activos y alertas pendientes al instante.' },
          { text: 'Gráficos Interactivos:', options: { bold: true } },
          { text: ' Distribución de empleados por sede y estado de documentos.' },
          { text: 'Alertas Críticas:', options: { bold: true } },
          { text: ' Panel de atención inmediata para documentos vencidos o próximos a vencer.' },
          { text: 'Accesos Rápidos:', options: { bold: true } },
          { text: ' Navegación fluida hacia las áreas más importantes del sistema.' }
        ],
        'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80'
      );

      // Slide 4: Empleados
      addFeatureSlide(
        '2. Gestión de Empleados',
        'Administración integral del talento humano',
        [
          { text: 'Perfiles Completos:', options: { bold: true } },
          { text: ' Datos personales, asignación de club, puesto y estado (Activo/Inactivo).' },
          { text: 'Expediente Digital:', options: { bold: true } },
          { text: ' Carga de contratos, identificaciones, certificados médicos y más.' },
          { text: 'Control de Vencimientos:', options: { bold: true } },
          { text: ' Cada documento tiene fecha de caducidad monitoreada por el sistema.' },
          { text: 'Búsqueda y Filtros:', options: { bold: true } },
          { text: ' Encuentra rápidamente a cualquier colaborador en segundos.' }
        ],
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80'
      );

      // Slide 5: Clubes/Sedes
      addFeatureSlide(
        '3. Gestión de Clubes y Sedes',
        'Control operativo por ubicación',
        [
          { text: 'Directorio de Sedes:', options: { bold: true } },
          { text: ' Registro de todas las ubicaciones físicas de la empresa.' },
          { text: 'Documentación Legal:', options: { bold: true } },
          { text: ' Gestión de licencias de funcionamiento, permisos de protección civil, etc.' },
          { text: 'Asignación de Personal:', options: { bold: true } },
          { text: ' Vinculación directa entre empleados y su lugar de trabajo.' },
          { text: 'Estado Operativo:', options: { bold: true } },
          { text: ' Semáforo de cumplimiento normativo por cada club.' }
        ],
        'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80'
      );

      // Slide 6: Asistencia
      addFeatureSlide(
        '4. Control de Asistencia',
        'Seguimiento preciso de la jornada laboral',
        [
          { text: 'Registro Diario:', options: { bold: true } },
          { text: ' Captura de horas de entrada y salida por empleado.' },
          { text: 'Justificaciones:', options: { bold: true } },
          { text: ' Manejo de faltas, retardos, vacaciones e incapacidades.' },
          { text: 'Reportes Exportables:', options: { bold: true } },
          { text: ' Generación de reportes para cálculo de nómina.' },
          { text: 'Filtros por Fecha y Sede:', options: { bold: true } },
          { text: ' Análisis detallado del ausentismo y puntualidad.' }
        ],
        'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=800&q=80'
      );

      // Slide 7: Alertas
      addFeatureSlide(
        '5. Motor de Alertas y Notificaciones',
        'Prevención proactiva de riesgos',
        [
          { text: 'Evaluación Diaria:', options: { bold: true } },
          { text: ' El sistema revisa automáticamente todos los documentos todos los días.' },
          { text: 'Notificaciones por Correo:', options: { bold: true } },
          { text: ' Envío automático de avisos 30, 15 y 5 días antes del vencimiento.' },
          { text: 'Destinatarios Configurables:', options: { bold: true } },
          { text: ' Define quién recibe qué alerta (ej. Legal recibe licencias, RRHH recibe contratos).' },
          { text: 'Cero Olvidos:', options: { bold: true } },
          { text: ' Elimina la dependencia de hojas de cálculo y recordatorios manuales.' }
        ],
        'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80'
      );

      // Slide 8: Usuarios
      addFeatureSlide(
        '6. Gestión de Usuarios y Roles',
        'Seguridad y control de acceso',
        [
          { text: 'Roles Granulares:', options: { bold: true } },
          { text: ' Administrador, Recursos Humanos, Gerente de Club, Auditor.' },
          { text: 'Permisos Específicos:', options: { bold: true } },
          { text: ' Cada rol tiene acceso restringido solo a lo que necesita ver.' },
          { text: 'Gestión de Credenciales:', options: { bold: true } },
          { text: ' Creación segura de cuentas, reseteo de contraseñas y bloqueo de accesos.' },
          { text: 'Seguridad Empresarial:', options: { bold: true } },
          { text: ' Autenticación robusta para proteger la información confidencial.' }
        ],
        'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80'
      );

      // Slide 9: Auditoría
      addFeatureSlide(
        '7. Log de Auditoría',
        'Trazabilidad y transparencia total',
        [
          { text: 'Registro Inmutable:', options: { bold: true } },
          { text: ' Todo movimiento en el sistema queda registrado.' },
          { text: 'Qué, Quién y Cuándo:', options: { bold: true } },
          { text: ' Detalle exacto de la acción, el usuario responsable y la fecha/hora.' },
          { text: 'Cumplimiento Normativo:', options: { bold: true } },
          { text: ' Facilita las auditorías internas y externas.' },
          { text: 'Prevención de Fraudes:', options: { bold: true } },
          { text: ' Disuade malas prácticas al mantener un historial transparente.' }
        ],
        'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80'
      );

      // Slide 10: Configuración
      addFeatureSlide(
        '8. Configuración del Sistema',
        'Adaptabilidad a las reglas del negocio',
        [
          { text: 'Tipos de Documentos:', options: { bold: true } },
          { text: ' Crea y personaliza los tipos de documentos requeridos por la empresa.' },
          { text: 'Parámetros Globales:', options: { bold: true } },
          { text: ' Ajuste de días de anticipación para las alertas.' },
          { text: 'Catálogos:', options: { bold: true } },
          { text: ' Mantenimiento de listas desplegables (puestos, departamentos, etc.).' },
          { text: 'Personalización:', options: { bold: true } },
          { text: ' El sistema se adapta a la empresa, no la empresa al sistema.' }
        ],
        'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80'
      );

      // Slide 11: Mejoras y Beneficios
      let slide11 = pres.addSlide({ masterName: 'MASTER_SLIDE' });
      slide11.addText('Mejoras y Beneficios Clave', { x: 0.5, y: 0.8, w: 9, h: 0.6, fontSize: 28, bold: true, color: '0F172A' });
      
      const benefits = [
        { title: 'Ahorro de Tiempo', desc: 'Reducción del 80% en tiempo de búsqueda de documentos.', color: '3B82F6' },
        { title: 'Mitigación de Riesgos', desc: 'Cero multas por vencimientos gracias a las alertas automáticas.', color: '10B981' },
        { title: 'Escalabilidad', desc: 'Capacidad para manejar cientos de empleados y múltiples sedes.', color: '8B5CF6' },
        { title: 'Toma de Decisiones', desc: 'Datos precisos y en tiempo real para la gerencia.', color: 'F59E0B' }
      ];

      benefits.forEach((b, i) => {
        const xPos = 0.5 + (i * 2.3);
        slide11.addShape(pres.ShapeType.rect, { x: xPos, y: 1.8, w: 2.1, h: 2.5, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, shadow: { type: 'outer', opacity: 0.1 } });
        slide11.addShape(pres.ShapeType.rect, { x: xPos, y: 1.8, w: 2.1, h: 0.1, fill: { color: b.color } }); // Top accent line
        slide11.addText(b.title, { x: xPos + 0.1, y: 2.2, w: 1.9, h: 0.5, align: 'center', fontSize: 16, bold: true, color: '0F172A' });
        slide11.addText(b.desc, { x: xPos + 0.1, y: 2.8, w: 1.9, h: 1.2, align: 'center', fontSize: 13, color: '64748B' });
      });

      // Slide 12: Conclusión
      let slide12 = pres.addSlide();
      slide12.background = { color: '0F172A' };
      slide12.addText('ControlDoc', { x: 1, y: 1.5, w: 8, h: 1, fontSize: 44, bold: true, color: 'FFFFFF', align: 'center' });
      slide12.addText('El futuro de la gestión operativa es hoy.', { x: 1, y: 2.5, w: 8, h: 0.5, fontSize: 20, color: '38BDF8', align: 'center' });
      
      slide12.addShape(pres.ShapeType.roundRect, { x: 3.5, y: 3.5, w: 3, h: 0.8, fill: { color: '10B981' } });
      slide12.addText('Iniciar Implementación', { x: 3.5, y: 3.5, w: 3, h: 0.8, align: 'center', fontSize: 16, bold: true, color: 'FFFFFF' });

      // Generate the file
      const fileName = 'Presentacion_Ejecutiva_ControlDoc.pptx';
      const filePath = path.join(__dirname, fileName);
      
      await pres.writeFile({ fileName: filePath });
      
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error("Error downloading file:", err);
        }
        // Optionally delete the file after download
        setTimeout(() => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }, 60000);
      });

    } catch (error) {
      console.error('Error generating PPTX:', error);
      res.status(500).send('Error al generar la presentación.');
    }
  });

  // API routes
  app.use('/api', apiRouter);

  // Serve mock uploads
  app.get('/uploads/:filename', (req, res) => {
    const { filename } = req.params;
    const isPdf = filename.toLowerCase().endsWith('.pdf');
    
    // In a real app, we'd serve the file from disk.
    // For this demo, we'll return a placeholder.
    if (isPdf) {
      res.setHeader('Content-Type', 'application/pdf');
      // A very minimal valid PDF that shows "Documento de Prueba"
      const minimalPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/MacRomanEncoding>>endobj\n5 0 obj<</Length 44>>stream\nBT /F1 24 Tf 100 700 Td (Documento de Prueba: ' + filename + ') Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\n0000000223 00000 n\n0000000315 00000 n\ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n408\n%%EOF'
      );
      res.send(minimalPdf);
    } else {
      // Return a placeholder image
      res.redirect(`https://picsum.photos/seed/${filename}/800/1200`);
    }
  });

  // Middleware to disable caching for the SPA entry point
  const noCache = (req: any, res: any, next: any) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
  };

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Explicit fallback for SPA in development
    app.use('*', noCache, async (req: any, res: any, next: any) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) return next();
      
      try {
        let template = fs.readFileSync(path.resolve('index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Serve static files from dist
    const distPath = path.join(process.cwd(), 'dist');
    console.log(`Serving static files from: ${distPath}`);
    
    app.use(express.static(distPath, {
      maxAge: '1h',
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        }
      }
    }));
    
    // Catch-all route for SPA in production
    app.get('*', noCache, (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      console.log(`Serving index.html from: ${indexPath}`);
      res.sendFile(indexPath);
    });
  }

  // Configurar tarea programada (Cron Job)
  // Se ejecuta todos los días a las 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('Ejecutando tarea programada: Alertas de Vencimiento');
    await sendExpirationAlerts(false);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL: Failed to start server:', err);
});
