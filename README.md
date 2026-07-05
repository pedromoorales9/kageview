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
| 🔗 **AniList Sync** | Watchlist, progreso de episodios y puntuaciones en tiempo real |
| 📚 **Manga integrado** | Lector de manga con múltiples fuentes y biblioteca personal |
| 📅 **Calendario de emisión** | Vista semanal con cuenta atrás en tiempo real para nuevos episodios |
| 🔔 **Notificaciones** | Aviso nativo de Windows cuando sale un episodio nuevo hoy |
| 🎨 **Cinematic Shadow UI** | Design system oscuro con glows y glassmorphism |
| 🔄 **Auto-updater** | Actualizaciones silenciosas automáticas en segundo plano |
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
| Linux / macOS | — | Próximamente |

> Si ya tienes KageView instalado, la app se actualiza sola en cuanto detecta una nueva versión.

---

## 🛠️ Desarrollo

### Requisitos

- [Node.js 20+](https://nodejs.org/)
- npm 9+
- Credenciales de AniList (ver abajo)

### Instalación

```bash
git clone https://github.com/pedromoorales9/KageView
cd KageView
npm install
```

### Configurar AniList

KageView usa **OAuth Implicit Grant**, así que solo necesita el `clientId` **público** de la app — no se usa ni se incrusta ningún `clientSecret`. Cada usuario inicia sesión con su propia cuenta.

1. Ve a [AniList Developer Settings](https://anilist.co/settings/developer)
2. Crea una nueva aplicación con Redirect URL: `kageview://auth`
3. Copia el `clientId`
4. Crea un archivo `.env` en la raíz (puedes partir de `.env.example`):

```bash
ANILIST_CLIENT_ID=tu_client_id
```

> ⚠️ `.env` está en `.gitignore` y persiste entre builds. El valor se inyecta automáticamente en cada compilación, así que no hay que volver a tocar el código.

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
electron-updater 6   →  Auto-actualizaciones desde GitHub Releases
AniList GraphQL v2   →  Metadatos, autenticación OAuth y sync
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
