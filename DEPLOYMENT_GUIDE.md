# Guía de Despliegue a Producción - ControlDoc

Esta aplicación está diseñada para ser escalable y segura en un entorno de producción real. Para que funcione de forma permanente (sin que se "duerma" o se borren datos), sigue estos pasos.

## 1. Base de Datos: Supabase (Gratis y Escalable)
Ya hemos configurado la aplicación para usar **Supabase** (PostgreSQL en la nube). Esto garantiza que los datos no se borren nunca.

1. Crea una cuenta en [Supabase](https://supabase.com/).
2. Crea un nuevo proyecto llamado `ControlDoc`.
3. Ve a la sección **SQL Editor** y pega el contenido del archivo `supabase_schema.sql` (que se encuentra en la raíz de este proyecto) para crear las tablas necesarias.
4. Ve a **Project Settings > API** y copia la `URL` y la `anon key`.

## 2. Hosting del Servidor: Railway o Render
Necesitas un lugar donde el "cerebro" (Express) de la app corra 24/7.

### Opción Recomendada: Railway
1. Crea una cuenta en [Railway.app](https://railway.app/).
2. Conecta tu repositorio de GitHub (o sube el código).
3. En la pestaña **Variables**, agrega las siguientes:
   - `VITE_SUPABASE_URL`: (Tu URL de Supabase)
   - `VITE_SUPABASE_ANON_KEY`: (Tu anon key de Supabase)
   - `EMAIL_HOST`: `smtp.gmail.com`
   - `EMAIL_PORT`: `587`
   - `EMAIL_USER`: (Tu correo de Gmail)
   - `EMAIL_PASS`: (Tu contraseña de aplicación de Google)
   - `NODE_ENV`: `production`

## 3. Hosting del Frontend: Vercel
Vercel es el mejor lugar para la parte visual de la app.

1. Conecta tu repositorio a [Vercel](https://vercel.com/).
2. Configura las mismas variables de entorno que en Railway.
3. Vercel detectará automáticamente que es un proyecto de Vite y lo publicará.

## 4. Alertas de Correo (Gmail)
Para que las alertas de vencimiento funcionen:
1. Ve a tu cuenta de Google > Seguridad.
2. Activa la "Verificación en dos pasos".
3. Busca "Contraseñas de aplicaciones" y crea una para "ControlDoc".
4. Usa esa contraseña de 16 caracteres en la variable `EMAIL_PASS`.

---

**Nota:** Con esta configuración, tu aplicación podrá ser usada desde cualquier país, los datos estarán seguros en la nube de Supabase y no tendrás problemas de "carga infinita" por inactividad del servidor.
