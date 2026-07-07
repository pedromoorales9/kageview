// ═══════════════════════════════════════════════════════════
// DiscordRichPresence — cliente IPC de Discord mínimo y nativo.
//
// El paquete `discord-rpc` estaba declarado en package.json pero nunca
// se cableó. Esta es una implementación real y autocontenida (sin
// dependencias externas) que habla el protocolo de framing IPC de
// Discord sobre el transporte local (named pipe en Windows, Unix
// socket en macOS/Linux). Portada de DiscordRichPresence.swift de la
// versión nativa de macOS.
//
// Totalmente opcional: sin `DISCORD_CLIENT_ID` (.env) o con Discord
// cerrado, todas las llamadas son no-ops silenciosos.
// ═══════════════════════════════════════════════════════════

import net from 'net';
import path from 'path';
import { randomUUID } from 'crypto';

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;

// Inyectado en build desde `.env` (igual que ANILIST_CLIENT_ID).
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';

let socket: net.Socket | null = null;
let connected = false;

export function isEnabled(): boolean {
  return CLIENT_ID !== '';
}

function socketPath(index: number): string {
  if (process.platform === 'win32') {
    return `\\\\?\\pipe\\discord-ipc-${index}`;
  }
  const base =
    process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp';
  return path.join(base, `discord-ipc-${index}`);
}

/** Codifica un frame IPC de Discord: header de 8 bytes LE (opcode + longitud) + JSON. */
function encodeFrame(opcode: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function send(opcode: number, payload: unknown): void {
  if (!socket || socket.destroyed) return;
  try {
    socket.write(encodeFrame(opcode, payload));
  } catch {
    cleanup();
  }
}

function cleanup(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.destroy();
    socket = null;
  }
  connected = false;
}

export function connect(): void {
  if (!isEnabled() || socket) return;
  tryConnect(0);
}

/**
 * Discord expone su IPC en discord-ipc-0…9 (la ranura depende de cuántos
 * clientes haya o del orden de arranque). Probar solo la 0 hace que el
 * Rich Presence falle en silencio para muchos usuarios.
 */
function tryConnect(index: number): void {
  if (index > 9) return;
  try {
    const s = net.createConnection(socketPath(index), () => {
      connected = true;
      send(OP_HANDSHAKE, { v: 1, client_id: CLIENT_ID });
    });
    s.on('error', () => {
      if (!connected) {
        // Ranura inexistente/ocupada → probar la siguiente
        s.removeAllListeners();
        s.destroy();
        if (socket === s) socket = null;
        tryConnect(index + 1);
      } else {
        cleanup();
      }
    });
    s.on('close', () => {
      if (socket === s) cleanup();
    });
    socket = s;
  } catch {
    cleanup();
  }
}

export function disconnect(): void {
  cleanup();
}

export function setActivity(details: string, state: string): void {
  if (!isEnabled()) return;
  if (!connected) {
    // Reintento perezoso: Discord pudo abrirse después de arrancar la app.
    connect();
    return;
  }
  send(OP_FRAME, {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity: {
        details,
        state,
        timestamps: { start: Math.floor(Date.now() / 1000) },
        assets: { large_image: 'kageview', large_text: 'KageView' },
      },
    },
    nonce: randomUUID(),
  });
}

export function clear(): void {
  if (!isEnabled() || !connected) return;
  send(OP_FRAME, {
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid },
    nonce: randomUUID(),
  });
}
