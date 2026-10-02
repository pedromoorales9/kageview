// ═══════════════════════════════════════════════════════════
// anilistMock — AniList de mentira SOLO para desarrollo (KAGEVIEW_ANILIST=mock)
//
// Sustituye al proceso real de conexión: «conectar» entra directamente, y las listas
// de anime y manga están en memoria con datos de ejemplo. Se carga con un `require`
// condicional, así que NO entra en la build de producción.
// ═══════════════════════════════════════════════════════════

import { BrowserWindow, ipcMain } from 'electron';
import { FakeAniList } from '../modules/anilist/sync/__tests__/fakeAniList';
import { isAllowedOperation } from './anilistAuthCore';
import type { AniListStatus } from '../modules/anilist/sync/bridge';

export function registerAniListMock(getWindow: () => BrowserWindow | null): void {
  const fake = new FakeAniList();
  fake.connected = false;
  fake.lenient = true;
  fake.viewer = { id: 4242, name: 'lector_demo', avatar: { large: 'https://s4.anilist.co/file/anilistcdn/user/avatar/large/default.png' } };

  // Catálogo y listas de ejemplo (ids reales de AniList)
  const anime = (id: number, romaji: string, english: string | null, episodes: number | null) =>
    fake.addMedia({ id, type: 'ANIME', format: 'TV', title: { romaji, english }, episodes });
  const manga = (id: number, romaji: string, english: string | null, chapters: number | null) =>
    fake.addMedia({ id, type: 'MANGA', format: 'MANGA', title: { romaji, english }, chapters });
  anime(154587, 'Sousou no Frieren', "Frieren: Beyond Journey's End", 28);
  anime(21, 'ONE PIECE', 'One Piece', null);
  anime(269, 'BLEACH', 'Bleach', 366);
  manga(30002, 'Berserk', 'Berserk', 380);
  manga(105398, 'Na Honjaman Level Up', 'Solo Leveling', 200);
  manga(30013, 'ONE PIECE', 'One Piece', null);
  manga(30656, 'Vagabond', 'Vagabond', 327);
  fake.setEntry('ANIME', { mediaId: 154587, status: 'CURRENT', progress: 7, score: 90 });
  fake.setEntry('ANIME', { mediaId: 21, status: 'CURRENT', progress: 1050, score: 85 });
  fake.setEntry('ANIME', { mediaId: 269, status: 'COMPLETED', progress: 366, score: 80 });
  fake.setEntry('MANGA', { mediaId: 30002, status: 'COMPLETED', progress: 380, score: 95 });
  fake.setEntry('MANGA', { mediaId: 105398, status: 'PAUSED', progress: 120, score: 88 });
  fake.setEntry('MANGA', { mediaId: 30656, status: 'PLANNING', progress: 0, score: 0 });

  const status = async (): Promise<AniListStatus> => ({
    configured: true,
    connected: fake.connected,
    user: fake.connected ? { id: fake.viewer.id, name: fake.viewer.name, avatar: fake.viewer.avatar.large } : null,
    expiresAt: Date.now() + 365 * 86400_000,
    persistent: true,
  });
  const broadcast = async () => getWindow()?.webContents.send('anilist-status', await status());
  const fromMain = (e: Electron.IpcMainInvokeEvent) => !!getWindow() && e.sender === getWindow()!.webContents;

  ipcMain.handle('anilist-status', (e) => (fromMain(e) ? status() : null));
  ipcMain.handle('anilist-login', async (e) => {
    if (!fromMain(e)) return { ok: false, error: 'forbidden' };
    setTimeout(async () => { fake.connected = true; await broadcast(); getWindow()?.webContents.send('anilist-login-result', { ok: true }); }, 1200);
    return { ok: true };
  });
  ipcMain.handle('anilist-submit-token', async (e) => {
    if (!fromMain(e)) return { ok: false, error: 'forbidden' };
    fake.connected = true;
    await broadcast();
    return { ok: true };
  });
  ipcMain.handle('anilist-logout', async (e) => {
    if (!fromMain(e)) return false;
    fake.connected = false;
    await broadcast();
    return true;
  });
  ipcMain.handle('anilist-request', async (e, req: { query?: unknown; variables?: unknown }) => {
    if (!fromMain(e)) return { ok: false, status: 0, error: 'forbidden' };
    if (!isAllowedOperation(req?.query, req?.variables)) return { ok: false, status: 0, error: 'not_allowed' };
    await new Promise((r) => setTimeout(r, 250)); // algo de latencia para ver «Sincronizando…»
    return fake.auth(req.query as string, req.variables as Record<string, unknown>);
  });
}
