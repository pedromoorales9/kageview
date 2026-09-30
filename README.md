<div align="center">

<img src="assets/icon.png" alt="KageView" width="120" />

# 影 KageView

**App de escritorio para streaming de anime y lectura de manga — sin anuncios, sin cuentas, en español.**

[![Version](https://img.shields.io/badge/version-1.2.0-cb97ff?style=flat-square&labelColor=0e0e13)](https://github.com/pedromoorales9/kageview/releases/latest)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-cb97ff?style=flat-square&labelColor=0e0e13)](https://www.gnu.org/licenses/gpl-3.0)
[![Electron](https://img.shields.io/badge/Electron-28-47c4ff?style=flat-square&labelColor=0e0e13)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-18-f673b7?style=flat-square&labelColor=0e0e13)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-cb97ff?style=flat-square&labelColor=0e0e13)](https://typescriptlang.org)
[![Platform](https://img.shields.io/badge/Platform-Windows-be83fa?style=flat-square&labelColor=0e0e13)]()

<br/>

*"Mientras otros veían anime, yo construí el lugar donde verlo."*

<br/>

[**⬇️ Descargar**](#-descarga) · [**✨ Features**](#-features) · [**🔌 Providers**](#-providers) · [**🛠️ Desarrollo**](#️-desarrollo) · [**📋 Changelog**](#-changelog)

</div>

---

## ✨ Features

| Feature | Descripción |
|---------|-------------|
| 🚫 **Sin anuncios** | Bloqueador multicapa de popups, overlays y dominios de publicidad |
| 📺 **Player integrado** | HLS nativo, velocidad, pantalla completa, skip intro/outro automático |
| ⏭️ **Auto-play** | Cuenta atrás de 5 segundos para reproducir el siguiente episodio |
| ⚡ **Fallback automático** | Si un provider falla, el siguiente entra solo sin interrumpir |
| ⭐ **Proveedor favorito** | Marca tu provider preferido de anime y manga — siempre carga primero |
| 👥 **Cuentas, amigos y chat** | Registro propio (Supabase): tus listas, foto de perfil, amigos, qué están viendo ahora y mensajería en tiempo real (con anime compartido) |
| 📚 **Manga integrado** | Lector de manga con múltiples fuentes y biblioteca personal |
| 📅 **Calendario de emisión** | Vista semanal con cuenta atrás en tiempo real para nuevos episodios |
| 🔔 **Notificaciones** | Aviso nativo de Windows cuando sale un episodio nuevo hoy |
| 🎨 **Cinematic Shadow UI** | Design system oscuro con glows y glassmorphism |
| 🔄 **Auto-updater** | Avisa de cada versión nueva y se actualiza sola, en Windows y en macOS |
| 🎮 **Discord Rich Presence** | Muestra el anime y episodio que estás viendo en tu perfil de Discord (opcional) |
| 💾 **Preferencias persistentes** | Idioma, providers, skips y ajustes se conservan entre sesiones |

---

## 🔌 Providers

### Anime

KageView conecta múltiples fuentes y cambia automáticamente si una falla. Puedes marcar tu favorito desde Ajustes — ese provider siempre será el primero en intentarse.

| Provider | Idioma | Sub | Dub | Estado |
|----------|--------|-----|-----|--------|
| 🟢 AnimeFLV | 🇪🇸 Español | ✅ | ✅ | Activo |
| 🟢 JKAnime | 🇪🇸 Español | ✅ | ✅ | Activo |
| 🟢 AnimeAV1 | 🇪🇸 Español | ✅ | ✅ | Activo |

### Manga

| Provider | Idioma | Tipo | Estado |
|----------|--------|------|--------|
| 🟢 MangaDex | 🌐 Multi | Manga / Manhwa / Manhua | Activo |
| 🟢 MangaOni | 🇪🇸 Español | Manga / Manhwa / Manhua | Activo |
| 🟢 InManga | 🇪🇸 Español | Manga | Activo |
| 🟢 ManhwaWeb | 🇪🇸 Español | Manhwa | Activo |

> Los providers en inglés (HiAnime, Gogoanime) están desactivados por ahora.

---

## ⬇️ Descarga

| Sistema | Archivo | |
|---------|---------|--|
| Windows 10/11 | `KageView-Setup-1.2.0.exe` | [**Descargar →**](https://github.com/pedromoorales9/kageview/releases/latest) |
| macOS 11+ (Apple Silicon e Intel) | `KageView-x.x.x-mac.dmg` | [**Descargar →**](https://github.com/pedromoorales9/kageview/releases/latest) |
| Linux | — | Próximamente |

> En Windows la app se actualiza sola. En macOS, al haber una versión nueva te avisa y te lleva a la página de descargas.

### 🍎 Instalar en macOS

1. Abre `KageView-x.x.x-mac.dmg` y **arrastra KageView a Aplicaciones**.
2. La **primera vez**, macOS mostrará un aviso porque la app aún no está firmada con un Developer ID de Apple. Es normal; se autoriza una sola vez:
   - **macOS 15 (Sequoia) o posterior:** intenta abrir KageView → *Ajustes del Sistema → Privacidad y seguridad* → baja hasta el aviso de KageView y pulsa **Abrir igualmente**.
   - **macOS 14 o anterior:** en *Aplicaciones*, **clic derecho sobre KageView → Abrir → Abrir**.
3. Si macOS dijera que la app "está dañada", abre la Terminal y ejecuta: `xattr -dr com.apple.quarantine /Applications/KageView.app`

**Actualizaciones:** a partir de la 1.5.0, KageView se actualiza sola también en Mac (avisa al abrir; basta pulsar *Inicializar actualización* y *Reiniciar e instalar*). No hace falta volver a autorizarla. Si la app no está en *Aplicaciones* (o macOS la ejecuta aislada), el aviso te lo explica y ofrece descargar a mano.

---

## 🛠️ Desarrollo

### Requisitos

- [Node.js 20+](https://nodejs.org/)
- npm 9+
- (Opcional) Un proyecto de [Supabase](https://supabase.com) para las cuentas (ver abajo)

### Instalación

```bash
git clone https://github.com/pedromoorales9/KageView
cd KageView
npm install
```

### Configurar las cuentas (Supabase)

Las cuentas, listas, amigos y el "viendo ahora" viven en **Supabase**. AniList solo se usa como catálogo público (tendencias, búsqueda, fichas): ya **no** hace falta cuenta ni credenciales de AniList.

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Sigue la guía **[`supabase/README.md`](supabase/README.md)** (aplicar el SQL, configurar el correo y la URL de redirección `kageview://auth-callback`).
3. Crea un `.env` en la raíz (parte de `.env.example`):

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=tu_anon_key_publica
```

> 🔐 La `anon key` es **pública por diseño** (va dentro de la app); los datos los protegen las políticas RLS de `supabase/migrations`, cubiertas por `npm test`. **Nunca** pongas la clave `service_role` en la app ni en el `.env`.
> Sin estas variables la app funciona igualmente (catálogo y reproducción), pero sin cuentas.

Para probar la interfaz sin proyecto de Supabase existe un backend en memoria **solo para desarrollo** con usuarios de ejemplo:

```bash
KAGEVIEW_BACKEND=mock npm start
```

> En modo *mock* puedes entrar como `kage@demo.dev` (owner) o `sora@demo.dev` (admin), contraseña `demo1234`, para probar el **panel de administración** (Ajustes → Administración). En producción, ver «Administración» en [`supabase/README.md`](supabase/README.md).

### Discord Rich Presence (opcional)

Crea una aplicación en el [Discord Developer Portal](https://discord.com/developers/applications)
y añade su Application ID al `.env`:

```bash
DISCORD_CLIENT_ID=tu_application_id
```

Sin él, la función queda desactivada silenciosamente. Se puede apagar
en cualquier momento desde **Ajustes → Integraciones**.

### Lanzar en desarrollo

```bash
npm start
```

### Tests

Los parsers de providers (la parte más frágil: dependen del HTML de sitios
de terceros) y el title matcher tienen tests con fixtures:

```bash
npm test
```

### Compilar instalador Windows

```bash
npm run dist:win
```

El instalador se genera en `release/build/KageView-Setup-x.x.x.exe`.

### Compilar instalador macOS

```bash
npm run dist:mac
```

Genera `release/build/KageView-x.x.x-mac.dmg`: un único instalador **universal** (Apple Silicon + Intel) con ventana de instalación propia (fondo, tarjetas y flecha "arrastra a Aplicaciones"). Necesita el `.env` con las claves públicas de Supabase, que se incrustan en la build.

- **Iconos y fondo del instalador:** se generan con `npm run assets:build` (`scripts/make-icons.js` recorta el logo y crea `build/icon.icns`; `scripts/make-dmg-background.js` renderiza `scripts/dmg-background.html` a `build/dmg-background.tiff`). Solo hay que repetirlo si cambian `assets/icon.png` o el diseño del fondo.
- **Firma:** sin certificado, la app se firma *ad-hoc* (necesario para arrancar en Apple Silicon) y los usuarios deben autorizarla la primera vez (ver arriba). Con una cuenta de [Apple Developer Program](https://developer.apple.com/programs/) (99 $/año) se elimina ese paso: define `CSC_LINK` + `CSC_KEY_PASSWORD` (certificado *Developer ID Application*) y las credenciales de notarización `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, y el mismo `npm run dist:mac` firma con *hardened runtime* y notariza. La actualización automática **no** depende de ello: en Mac usa un actualizador propio (`src/main/macUpdater.ts`) que descarga el `.zip` de la release, comprueba su SHA-512 (de `latest-mac.yml`) y sustituye la app al reiniciar. **Al publicar una release hay que subir también `KageView-x.y.z-mac.zip` y `latest-mac.yml`** (además del `.dmg`). Ver `electron-builder.config.js`.
- **Publicar:** sube a la release de GitHub el `.dmg` y `latest-mac.yml`.

---

## 🧱 Tech Stack

```
Electron 28          →  Runtime de escritorio + IPC
React 18             →  UI framework
TypeScript 5         →  Tipado estático
Tailwind CSS 3       →  Estilos con design tokens
Zustand 4            →  Estado global
HLS.js               →  Streaming HLS nativo
electron-store 8     →  Persistencia local cifrada
electron-updater 6   →  Auto-actualizaciones (Windows) desde GitHub Releases; en macOS, actualizador propio
AniList GraphQL v2   →  Catálogo público de anime (sin cuenta)
Supabase            →  Cuentas, listas, amigos y "viendo ahora" (RLS + Realtime)
AniSkip API v2       →  Timestamps de intro/outro
fastest-levenshtein  →  Title matching fuzzy entre providers
Discord IPC nativo   →  Rich Presence sin dependencias (src/main/discordRpc.ts)
Vitest               →  Tests de parsers de providers y title matcher
```

---

## 🎨 Design System — Cinematic Shadow

```css
--background:               #0e0e13;  /* Base canvas */
--primary:                  #cb97ff;  /* Morado — acción principal */
--secondary:                #f673b7;  /* Rosa — acento */
--surface-container:        #19191f;  /* Cards */
--surface-container-highest:#25252c;  /* Hover states */
--on-surface:               #f8f5fd;  /* Texto principal */
--on-surface-variant:       #acaab1;  /* Texto secundario */
```

**Tipografía:** Plus Jakarta Sans (headlines) + Inter (body)

---

## 📁 Estructura del proyecto

```
src/
├── main/                    # Proceso principal Electron
│   ├── main.ts              # Entry point, IPC handlers, store
│   ├── preload.ts           # Bridge seguro main ↔ renderer
│   ├── menu.ts              # Menú de aplicación
│   └── updater.ts           # Auto-updater logic
├── modules/
│   ├── providers/           # Providers de anime
│   │   ├── IProvider.ts     # Interfaz común
│   │   ├── registry.ts      # Registro + fallback automático
│   │   ├── animeflv.ts      # AnimeFLV
│   │   ├── jkanime.ts       # JKAnime
│   │   └── animeav1.ts      # AnimeAV1
│   ├── manga/               # Providers de manga
│   │   ├── index.ts         # Registro de manga providers
│   │   ├── types.ts         # Modelos de datos
│   │   └── providers/       # MangaDex, MangaOni, InManga, ManhwaWeb
│   ├── anilist/             # GraphQL client + queries
│   ├── aniskip.ts           # Skip intro/outro timestamps
│   ├── store.ts             # Zustand global store
│   └── cache.ts             # Persistencia via electron-store
└── renderer/
    ├── pages/               # Discover, Library, Search, Manga, Calendar, Settings
    ├── components/          # Sidebar, Player, Modal, Cards, MangaReader
    └── hooks/               # useAniList, useProvider, useAnimeInfo
```

---

## 📋 Changelog

### v1.5.0 — Actualizaciones automáticas en macOS
- **Auto-actualización en Mac** — KageView avisa de cada versión nueva y se actualiza sola, igual que en Windows: *Inicializar actualización* → *Reiniciar e instalar*. La descarga se verifica (SHA-512, identificador, versión y firma) antes de sustituir la app, y si algo falla se restaura la anterior
- Sin necesidad de certificado de Apple: usa un actualizador propio (`src/main/macUpdater.ts`) porque `electron-updater` en macOS exige Developer ID
- **Importante:** quien tenga una versión anterior en Mac debe instalar esta a mano una vez (desde el `.dmg`); a partir de aquí se actualizará sola
- Cada release de Mac publica ahora `.dmg`, `.zip` y `latest-mac.yml`

### v1.4.1 — Panel de administración v2 y corrección de Servicios
- **Corregido:** activar/desactivar servicios en el panel fallaba con «sesión caducada» aunque la sesión estuviera bien (era un permiso de la base de datos, mal explicado). Ahora funciona y, si falta un permiso, el mensaje lo dice claro
- **Nuevo menú lateral** con Resumen, Anuncios, Servicios, Usuarios, Equipo y Registro
- **Resumen** con gráfica de registros por día (7/30/90 días), actividad reciente del equipo y aviso si hay servicios apagados
- **Usuarios** — búsqueda y moderación: se puede **suspender** a alguien (conserva su cuenta pero no puede escribir mensajes, enviar solicitudes, publicar «viendo ahora» ni editar su perfil). Nunca a un admin ni al owner. Sin mostrar correos
- **Registro de actividad** — todo lo que hace el equipo queda anotado (quién, qué y cuándo) y nadie puede editarlo ni borrarlo
- **Anuncios** — plantillas (nueva versión, mantenimiento, servicio caído…), **segmentación** por sistema (macOS/Windows/Linux) y por «versiones anteriores a X», filtros por estado, búsqueda y duplicar
- **Servicios** — desde cuándo está apagado cada uno, motivos rápidos y «Reactivar todos»
- Requiere aplicar `supabase/migrations/20261001000005_admin_v2.sql`

### v1.4.0 — Panel de administración y anuncios para todos
- **Roles y panel de administración** — nuevos roles *owner* y *admin* (Ajustes → Administración, solo visible para el equipo) con insignia en el perfil. La autorización la impone la base de datos (RLS), no la interfaz; el rol no se puede cambiar desde la app
- **Anuncios para todos los usuarios** — banner descartable o ventana emergente, con tipo (información, novedad, evento, aviso, mantenimiento), enlace, programación, caducidad, borradores y reenvío. Los ve todo el mundo, incluso sin sesión
- **Servicios apagables** — desactiva AnimeFLV, MangaDex… para todos con el motivo visible cuando una página se cae
- **Equipo y resumen** — el owner nombra o quita administradores; cifras agregadas de usuarios y actividad (sin ver listas ni mensajes)
- Se retira el panel de desarrollador antiguo (contraseña + token de GitHub). Requiere aplicar `supabase/migrations/20261001000004_admin.sql`

### v1.3.0 — Rediseño para macOS, cuentas, amigos e instalador .dmg
- **Rediseño completo "Luna de sangre"** — nueva identidad a partir del logo: tinta con matiz vino, luna carmesí y sakura. Ventana nativa de macOS (semáforos integrados, *vibrancy*), barra lateral estilo Finder, barra superior de cristal con búsqueda ⌘K, héroe cinematográfico con lluvia de pétalos y nueva intro
- **Cuentas propias (Supabase)** — registro con correo y contraseña, foto de perfil, listas (Viendo, Completado, Por ver…) y recuperación de contraseña. AniList pasa a ser solo el catálogo público: ya no hace falta cuenta de AniList
- **Amigos y "viendo ahora"** — solicitudes de amistad, búsqueda de usuarios, ver la lista de un amigo y qué está viendo en tiempo real. Privacidad por usuario (ocultar actividad y/o lista). **Chat entre amigos** con mensajes en tiempo real, no leídos, avisos y tarjetas de anime compartido. Seguridad verificada con 60+ tests sobre Postgres (`npm test`)
- **Instalador para macOS** — `.dmg` universal (Apple Silicon + Intel) con ventana de instalación propia e icono nuevo con transparencia
- **Reproductor** — corregido YourUpload (Referer del CDN) y ampliada la lista de bloqueo de publicidad y trackers
- **Rendimiento** — sin animaciones infinitas en reposo (de ~40 % de CPU/GPU a 0 %), modales sin desenfoque de fondo, DevTools solo bajo demanda
- **Iconos sin conexión** — la fuente de iconos va incluida en la app (antes se descargaba de Google Fonts)

### v1.2.0 — Discord Rich Presence, prefs persistentes y tests
- **Discord Rich Presence real** — muestra el anime y episodio que estás viendo en tu perfil de Discord. Implementación IPC nativa sin dependencias (el paquete `discord-rpc` estaba declarado pero nunca cableado; se eliminó). Opcional vía `DISCORD_CLIENT_ID` y toggle en Ajustes → Integraciones
- **Preferencias persistentes** — idioma, providers, favoritos y skips ya no se pierden al cerrar la app: se guardan en electron-store y se restauran al arrancar
- **Tests de parsers y matcher** — suite de Vitest para los parsers de los 3 providers de anime y el title matcher (`npm test`), portada de la versión nativa de macOS

### v1.1.0 — MangaOni, UI responsive y login propio
- **Nuevo provider de manga: MangaOni** (manga-oni.com) — manga, manhwa y manhua en español, con filtro de contenido +18
- **MangaDex restaurado** — corregido el bloqueo por User-Agent que rompía API y portadas
- **ManhwaWeb** — portadas arregladas (referer correcto de su CDN)
- **Lista de episodios estilo Crunchyroll** — cuadrícula de miniaturas con orden ascendente/descendente y carga por lotes (soporta series enormes como One Piece sin congelar)
- **Buscador de episodios** dentro del modal de anime (por número o título)
- **UI responsive** — las cuadrículas y filas se adaptan al ancho de la ventana
- **Login con tu propia cuenta (OAuth Implicit Grant)** — la app ya no incrusta ningún `clientSecret`; cada usuario entra con su cuenta y el token se guarda solo en su equipo
- **Optimización de rendimiento** — menos `backdrop-blur` por tarjeta, memoización y render por lotes para evitar tirones
- Credenciales movidas a `.env` (inyección en build) para que persistan entre actualizaciones

### v1.0.9 — Proveedor favorito
- Selector de proveedor favorito en Ajustes para **anime** y **manga**
- El provider marcado con ⭐ siempre carga primero
- La sección de Manga se actualiza automáticamente al cambiar el favorito

### v1.0.8 — Fix calendario
- Corregido el bug que mostraba nombres de día incorrectos en el calendario (Mar en columna Mié, etc.)

### v1.0.7 — Auto-play y controles
- Skip intro/outro funciona ahora en todos los providers (modo iframe incluido)
- Cuenta atrás de 5 segundos para reproducir el siguiente episodio automáticamente
- Controles y cuenta atrás visibles en pantalla completa
- Carrusel de episodios con scroll horizontal en el modal de anime
- Página Descubrir con carrusel paginado: Tendencia, Temporada, Valorados, Recomendados

### v1.0.6 — Modal renovado
- Rediseño completo del carrusel de episodios en el modal
- Coexistencia correcta entre episodios y animes relacionados
- Fix: clic en anime relacionado ahora navega correctamente

### v1.0.5 — AnimeAV1 + Calendario global
- Nuevo provider AnimeAV1 como fuente de contingencia secundaria
- Calendario semanal de emisión impulsado por GraphQL de AniList

### v1.0.4 — Calendario y notificaciones
- Vista semanal de episodios con cuenta atrás en tiempo real
- Notificaciones nativas de Windows para nuevos episodios
- Ícono animado en esquina inferior con menú de opciones

### v1.0.3 — Ad-blocker y navegación
- Bloqueador multicapa: popups, overlays y dominios de publicidad a nivel de red
- Botón "Siguiente episodio" en pantalla de error
- Controles de navegación visibles en modo iframe

### v1.0.0–1.0.2 — Lanzamiento inicial
- Primera versión para Windows
- Integración AniList OAuth, progreso y puntuaciones
- Sistema de auto-actualizaciones desde GitHub Releases

---

## ⚠️ Aviso legal

KageView no aloja ningún contenido. Actúa únicamente como cliente que enlaza a contenido disponible en sitios de terceros. Todo el contenido es responsabilidad de dichos sitios. El desarrollador no se hace responsable del uso del contenido enlazado.

---

## 🤝 Contribuir

1. Abre un [Issue](../../issues)
2. Haz fork del repositorio
3. Crea una rama: `git checkout -b fix/nombre-del-fix`
4. Commit: `git commit -m "fix: descripción"`
5. Pull Request

---

<div align="center">

**GPL-3.0 © 2026 [Sh4Dow]

*Hecho con ♥ y demasiadas horas de madrugada.*

*"Mientras otros veían anime, yo construí el lugar donde verlo."*

</div>
