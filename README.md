# KageView 影

**Anime Desktop Streaming App** — Ad-free anime streaming with English & Spanish support.

![KageView](assets/icon.png)

## Features

- 🎬 **Multi-provider streaming** — HiAnime, Gogoanime, AnimePahe with automatic fallback
- 🌐 **Multi-language** — English & Spanish subtitles and dubs
- 📋 **AniList integration** — Track progress, manage watchlist, sync scores
- ⏭️ **Skip intro/outro** — AniSkip API for automatic skip buttons
- 🎨 **Cinematic Shadow UI** — Premium dark design system
- 🖥️ **Cross-platform** — Windows (.exe) and Linux (.AppImage, .deb)

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- npm (comes with Node.js)

### Setup

```bash
git clone https://github.com/your-username/kageview
cd kageview

# Configure AniList credentials
# Edit src/modules/clientData.ts with your AniList app credentials
# Create your app at: https://anilist.co/settings/developer
# Set redirect URI to: kageview://auth

npm install
npm start
```

### AniList App Setup

1. Go to [AniList Developer Settings](https://anilist.co/settings/developer)
2. Create a new client
3. Set redirect URI to `kageview://auth`
4. Copy your `clientId` and `clientSecret`
5. Edit `src/modules/clientData.ts` with your credentials

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launch in development mode with hot reload |
| `npm run build` | Production build |
| `npm run dist:win` | Generate Windows .exe installer |
| `npm run dist:linux` | Generate Linux .AppImage and .deb |
| `npm run typecheck` | TypeScript type checking |

## Tech Stack

- **Runtime**: Electron 28 + Node.js 20
- **UI**: React 18 + TypeScript 5
- **Styles**: Tailwind CSS 3
- **State**: Zustand 4
- **Video**: HLS.js
- **Metadata**: AniList GraphQL API v2
- **Skip Detection**: AniSkip API v2

## Design System — "Cinematic Shadow"

The UI follows a custom design system with:
- Deep dark surfaces (`#0e0e13` base)
- Purple primary accent (`#cb97ff`)
- Pink secondary accent (`#f673b7`)
- Glass morphism effects with backdrop blur
- Glow animations on interactive elements

## License

MIT © Sh4Dow
