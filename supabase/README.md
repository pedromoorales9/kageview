# Supabase — cuentas, listas, amigos y "viendo ahora"

Esta carpeta contiene todo el backend de KageView: el esquema SQL con sus políticas de seguridad (RLS) y las pruebas que lo verifican.

```
supabase/
├── migrations/
│   ├── 20260929000001_init.sql      tablas, RLS, funciones RPC y Realtime
│   ├── 20260929000002_storage.sql   bucket público `avatars` + políticas
│   └── 20260930000003_chat.sql      mensajes entre amigos (+ RPC y Realtime)
└── tests/rls.test.ts                pruebas de seguridad (Postgres real vía PGlite)
```

## Qué guarda

| Tabla | Contenido | Quién la ve |
|---|---|---|
| `profiles` | usuario, nombre, foto, bio, privacidad | tú, tus amigos y quien te ha enviado una solicitud |
| `library_entries` | tu lista (Viendo, Completado…) con una instantánea del título | tú y tus amigos (si `show_library`) |
| `friendships` | solicitudes y amistades | las dos personas implicadas |
| `activity` | "viendo ahora" (1 fila por usuario) | tú y tus amigos (si `show_activity`) |
| `messages` | chat 1 a 1 (texto o anime compartido) | solo los dos amigos implicados |

Nadie puede **listar** perfiles de desconocidos: la búsqueda va por una función limitada (mínimo 3 letras, máximo 10 resultados). Las solicitudes de amistad solo se crean/aceptan mediante funciones (`send_friend_request`, `respond_friend_request`); no hay `INSERT`/`UPDATE` directo, así que nadie puede auto-aceptarse ni cambiar de destinatario.

## Puesta en marcha (una sola vez)

### 1. Crear el proyecto
En [supabase.com](https://supabase.com) → *New project*. Guarda la contraseña de la base de datos.

### 2. Aplicar el SQL
Dashboard → **SQL Editor** → *New query*: pega y ejecuta, **en este orden**:

1. `migrations/20260929000001_init.sql`
2. `migrations/20260929000002_storage.sql`
3. `migrations/20260930000003_chat.sql`
4. `migrations/20261001000004_admin.sql`  (roles, anuncios y servicios)
5. `migrations/20261001000005_admin_v2.sql`  (registro de auditoría, suspensiones, segmentación de anuncios, usuarios)

> Si ya aplicaste las anteriores, ejecuta **solo la que falte** (cada archivo es independiente de los posteriores). Nunca edites una migración ya aplicada: añade una nueva.

> Alternativa con la CLI: `supabase link --project-ref <ref>` y `supabase db push`.

### 3. Autenticación
Dashboard → **Authentication**:

- **Providers → Email**: activado. Recomendado: *Confirm email* **activado** y longitud mínima de contraseña **8**.
- **Attack Protection**: activa *Leaked password protection* y, si quieres, CAPTCHA.
- **URL Configuration → Redirect URLs**: añade exactamente

  ```
  kageview://auth-callback
  ```

  Sin esto los enlaces de confirmación de correo y de recuperar contraseña no vuelven a la app.
- **Site URL**: puede ser `kageview://auth-callback` (la app no es una web).

### 4. Realtime
Ya lo hace la migración (añade `activity` y `friendships` a la publicación `supabase_realtime`). Compruébalo en **Database → Replication**.

### 5. Conectar la app
Dashboard → **Project Settings → API**. Copia en el `.env` de la raíz del repo:

```bash
SUPABASE_URL=https://xxxx.supabase.co      # "Project URL"
SUPABASE_ANON_KEY=sb_publishable_...        # "Publishable key" (antes "anon public": eyJ...)
```

> 🔐 La *publishable key* (antes `anon`) es pública por diseño y va dentro de la app. **Nunca** copies la *secret key* (`sb_secret_…`) ni la `service_role`.

Reinicia `npm start` (las variables se inyectan al compilar).

## Probar la seguridad

```bash
npm test
```

`supabase/tests/rls.test.ts` ejecuta las migraciones reales sobre un Postgres en memoria (PGlite) con los roles `anon`/`authenticated` y `auth.uid()` simulados, e intenta ataques: leer datos ajenos, auto-aceptar amistades, suplantar usuarios, subir avatares a la carpeta de otro, URLs `javascript:`… Si cambias una política y rompes algo, un test falla.

## Chat

- Solo entre **amigos aceptados**: la regla la impone la base de datos (RLS). Si dejáis de ser amigos, la conversación deja de ser legible (y reaparece si vuelven a serlo).
- El remitente **siempre** es quien escribe (`default auth.uid()` + privilegios por columna): nadie puede escribir "como" otro ni falsear fechas o el estado de lectura.
- No hay `UPDATE`/`DELETE` directos. Marcar como leído (`mark_conversation_read`) y borrar un mensaje propio (`delete_message`, borrado *suave*) van por RPC, así Realtime propaga los cambios.
- Límites: 2000 caracteres, anime compartido < 4 KB y máximo 20 mensajes cada 10 s por remitente.
- **No es cifrado de extremo a extremo**: el contenido queda en texto plano en tu base de datos.

## Administración (owner / admin)

Roles en `profiles.role`: `user` (por defecto), `admin` y `owner` (solo uno). El panel está en **Ajustes → Administración** y solo aparece a `admin`/`owner`.

**Nombrar al owner (una sola vez).** Regístrate en la app con tu correo y, en el **SQL Editor**, ejecuta (cambia el correo):

```sql
update public.profiles
   set role = 'owner'
 where id = (select id from auth.users where email = 'TU_CORREO');
-- debe devolver 1 fila actualizada
```

Después, el owner nombra o quita administradores desde el propio panel (pestaña *Equipo*).

- **Anuncios**: banner (franja descartable) o ventana emergente, con tipo, enlace https opcional, programación y caducidad. Los ve **todo el mundo**, incluso sin sesión. La app los consulta al arrancar, al volver a la ventana y cada 5 minutos.
- **Servicios**: apagar AnimeFLV, MangaDex… para todos, con el motivo visible y desde cuándo.
- **Segmentación** (migración 0005): un anuncio puede ir solo a macOS/Windows/Linux y/o solo a versiones anteriores a una dada (p. ej. «hay una versión nueva» solo a quien aún no la tiene). Lo aplican las apps con esta actualización; las anteriores lo muestran a todos.
- **Usuarios** (migración 0005): búsqueda y paginación (sin correos) y **suspensión**: un usuario suspendido conserva su cuenta y sus datos pero no puede escribir mensajes, enviar solicitudes, publicar «viendo ahora» ni editar su perfil. Nunca se puede suspender a un admin ni al owner.
- **Registro** (migración 0005): todo lo que hace el equipo (anuncios, servicios, suspensiones, cambios de rol) queda anotado con quién y cuándo; nadie puede editarlo ni borrarlo. Lo hecho desde el SQL Editor aparece como «sistema».
- **Resumen**: usuarios, actividad, gráfica de registros por día (7/30/90 días) y avisos de servicios apagados.
- **Seguridad**: la autorización la impone la base de datos (RLS + `is_staff()`), no la interfaz. El rol no se puede cambiar desde el cliente (`role` no tiene privilegio de UPDATE); solo el owner puede llamar a `set_user_role()`. Las cifras (`admin_stats()`) son agregadas: no exponen listas ni mensajes.
- El antiguo panel de desarrollador (contraseña + token de GitHub + `remote-config.json` en gh-pages) se ha retirado. Las versiones ≤ 1.2.x ya instaladas seguirán leyendo ese JSON hasta que se actualicen.

## Cosas a tener en cuenta

- **Enlaces del correo**: la app usa PKCE. El enlace abre `kageview://auth-callback?code=…` y la app canjea el código; los tokens nunca viajan en la URL. Solo funciona en el equipo donde se inició el registro/recuperación.
- **Avatares**: se recortan a 256×256 WebP en el cliente (~20 KB) y se suben a `avatars/<tu_id>/avatar.webp`. El bucket admite JPG/PNG/WebP y 512 KB como máximo.
- **Privacidad**: cada usuario puede ocultar su actividad y/o su lista a los amigos desde **Perfil → Privacidad**.
- **Borrar cuenta**: `delete_my_account()` elimina el usuario y, en cascada, perfil, lista, amistades y actividad.
- **Manga**: la biblioteca de manga sigue siendo local (la tabla ya admite `media_type = 'manga'` para sincronizarla más adelante).
