import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  SWAP_SCRIPT,
  bundlePathFromExe,
  compareVersions,
  feedLocation,
  installBlockReason,
  isNewer,
  parseLatestMac,
  releaseNotesFromBody,
} from '../macUpdaterCore';

const SHA = `${'A'.repeat(86)}==`;
const MB = 1024 * 1024;

const yml = (over: { version?: string; zip?: string; sha?: string; size?: number } = {}) => {
  const version = over.version ?? '1.5.0';
  return `version: ${version}
files:
  - url: KageView-${version}-mac.dmg
    sha512: ${'B'.repeat(86)}==
    size: ${190 * MB}
  - url: ${over.zip ?? `KageView-${version}-mac.zip`}
    sha512: ${over.sha ?? SHA}
    size: ${over.size ?? 190 * MB}
path: KageView-${version}-mac.zip
sha512: ${SHA}
releaseDate: '2026-09-30T00:00:00.000Z'
`;
};

describe('parseLatestMac', () => {
  it('lee la versión y el .zip (ignorando el .dmg)', () => {
    expect(parseLatestMac(yml())).toEqual({ version: '1.5.0', file: 'KageView-1.5.0-mac.zip', sha512: SHA, size: 190 * MB });
  });

  it('acepta comillas y saltos de línea de Windows', () => {
    const text = yml().replace(/\n/g, '\r\n').replace('version: 1.5.0', "version: '1.5.0'");
    expect(parseLatestMac(text)?.version).toBe('1.5.0');
  });

  it('rechaza lo dudoso', () => {
    expect(parseLatestMac('')).toBeNull();
    expect(parseLatestMac('no es yaml')).toBeNull();
    expect(parseLatestMac(yml({ version: '1.5' }))).toBeNull();
    expect(parseLatestMac(yml({ version: '1.5.0-beta' }))).toBeNull();
    expect(parseLatestMac(yml({ sha: 'corta' }))).toBeNull();
    expect(parseLatestMac(yml({ sha: `${'A'.repeat(86)}!!` }))).toBeNull();
    expect(parseLatestMac(yml({ size: 1000 }))).toBeNull();          // demasiado pequeño para ser la app
    expect(parseLatestMac(yml({ size: 5000 * MB }))).toBeNull();     // demasiado grande
  });

  it('solo acepta el nombre exacto del .zip: nada de rutas ni otros servidores', () => {
    for (const zip of [
      '../KageView-1.5.0-mac.zip',
      '/tmp/KageView-1.5.0-mac.zip',
      'https://evil.example/KageView-1.5.0-mac.zip',
      'KageView-1.5.0-mac.zip.exe',
      'KageView-9.9.9-mac.zip',            // otra versión distinta de la anunciada
      'Otra-1.5.0-mac.zip',
      'KageView-1.5.0-mac.zip;rm -rf ~',
    ]) {
      expect(parseLatestMac(yml({ zip }))).toBeNull();
    }
  });

  it('sin .zip (solo .dmg) no hay actualización automática', () => {
    const onlyDmg = yml().replace(/  - url: KageView-1\.5\.0-mac\.zip[\s\S]*?size: \d+\n/, '');
    expect(parseLatestMac(onlyDmg)).toBeNull();
  });
});

describe('versiones', () => {
  it('compara numéricamente, no como texto', () => {
    expect(compareVersions('1.9.9', '1.10.0')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('1.4', '1.4.0')).toBeNull();
    expect(compareVersions('1.4.0', 'latest')).toBeNull();
  });

  it('solo actualiza a versiones más nuevas', () => {
    expect(isNewer('1.4.1', '1.5.0')).toBe(true);
    expect(isNewer('1.4.1', '1.4.1')).toBe(false);
    expect(isNewer('1.5.0', '1.4.1')).toBe(false);   // nunca se "actualiza" hacia atrás
    expect(isNewer('1.4.1', 'x.y.z')).toBe(false);
  });
});

describe('feedLocation', () => {
  it('por defecto usa las releases de GitHub del repositorio', () => {
    const l = feedLocation(undefined);
    expect(l.feedUrl).toBe('https://github.com/pedromoorales9/kageview/releases/latest/download/latest-mac.yml');
    expect(l.fileUrl('1.5.0', 'KageView-1.5.0-mac.zip')).toBe(
      'https://github.com/pedromoorales9/kageview/releases/download/v1.5.0/KageView-1.5.0-mac.zip'
    );
  });

  it('el override solo vale para este mismo equipo (127.0.0.1)', () => {
    const l = feedLocation('http://127.0.0.1:8123');
    expect(l.feedUrl).toBe('http://127.0.0.1:8123/latest-mac.yml');
    expect(l.fileUrl('1.5.0', 'a.zip')).toBe('http://127.0.0.1:8123/a.zip');
    for (const bad of [
      'http://evil.example',
      'http://127.0.0.1.evil.example:80',
      'http://127.0.0.1:80/../x',
      'https://127.0.0.1:8123',
      'http://localhost:8123',
      'http://0.0.0.0:8123',
      'http://192.168.1.10:8123',
      '',
    ]) {
      expect(feedLocation(bad).feedUrl).toContain('https://github.com/');
    }
  });
});

describe('releaseNotesFromBody', () => {
  it('se queda solo con las viñetas y quita el formato', () => {
    const body = '## KageView\n\n### Cosas\n- **Panel** nuevo\n* Otra cosa `x`\ntexto suelto\n- Tercera';
    expect(releaseNotesFromBody(body)).toBe('- Panel nuevo\n- Otra cosa x\n- Tercera');
    expect(releaseNotesFromBody('sin viñetas')).toBeNull();
    expect(releaseNotesFromBody(null)).toBeNull();
    expect(releaseNotesFromBody(Array.from({ length: 20 }, (_, i) => `- n${i}`).join('\n'))!.split('\n')).toHaveLength(6);
  });
});

describe('dónde está instalada la app', () => {
  it('localiza el bundle desde el ejecutable', () => {
    expect(bundlePathFromExe('/Applications/KageView.app/Contents/MacOS/KageView')).toBe('/Applications/KageView.app');
    expect(bundlePathFromExe('/Users/yo/Apps/Mi App.app/Contents/MacOS/KageView')).toBe('/Users/yo/Apps/Mi App.app');
    expect(bundlePathFromExe('/usr/bin/node')).toBeNull();
  });

  it('explica por qué no se puede actualizar sola', () => {
    const ok = { isPackaged: true, bundlePath: '/Applications/KageView.app', writable: true };
    expect(installBlockReason(ok)).toBeNull();
    expect(installBlockReason({ ...ok, isPackaged: false })).toMatch(/desarrollo/);
    expect(installBlockReason({ ...ok, bundlePath: null })).toMatch(/localizar/);
    expect(installBlockReason({ ...ok, bundlePath: '/Volumes/KageView 1.5.0/KageView.app' })).toMatch(/imagen de disco/);
    expect(installBlockReason({ ...ok, bundlePath: '/private/var/folders/x/AppTranslocation/ABC/d/KageView.app' })).toMatch(/aislada/);
    expect(installBlockReason({ ...ok, writable: false })).toMatch(/permisos/);
  });
});

// ─── El script que sustituye la app (se ejecuta DE VERDAD) ──────────
describe.skipIf(process.platform === 'win32')('SWAP_SCRIPT', () => {
  let dir: string;
  let log: string;

  const mkApp = (p: string, marker: string) => {
    fs.mkdirSync(path.join(p, 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(p, 'Contents', 'marker.txt'), marker);
    fs.symlinkSync('marker.txt', path.join(p, 'Contents', 'enlace')); // los symlinks deben sobrevivir
  };
  const marker = (p: string) => fs.readFileSync(path.join(p, 'Contents', 'marker.txt'), 'utf8');

  const runScript = (pid: number, oldApp: string, newApp: string, env: Record<string, string> = {}) =>
    spawnSync('/bin/sh', ['-c', SWAP_SCRIPT, 'sh', String(pid), oldApp, newApp], {
      env: { ...process.env, OPEN_CMD: 'true', KAGEVIEW_UPDATE_LOG: log, ...env },
      encoding: 'utf8',
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-swap-'));
    log = path.join(dir, 'update.log');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sustituye la app, conserva los enlaces y limpia lo temporal', () => {
    const oldApp = path.join(dir, 'KageView.app');
    const stage = path.join(dir, '.kageview-update');
    const newApp = path.join(stage, 'KageView.app');
    mkApp(oldApp, 'vieja');
    mkApp(newApp, 'nueva');

    const r = runScript(999_999, oldApp, newApp); // ese pid no existe → "ya cerró"
    expect(r.status).toBe(0);
    expect(marker(oldApp)).toBe('nueva');
    expect(fs.readlinkSync(path.join(oldApp, 'Contents', 'enlace'))).toBe('marker.txt');
    expect(fs.existsSync(`${oldApp}.kageview-old`)).toBe(false);
    expect(fs.existsSync(stage)).toBe(false);
    expect(fs.readFileSync(log, 'utf8')).toContain('actualización completada');
  });

  it('espera a que la app termine antes de tocar nada', async () => {
    const oldApp = path.join(dir, 'KageView.app');
    const newApp = path.join(dir, '.kageview-update', 'KageView.app');
    mkApp(oldApp, 'vieja');
    mkApp(newApp, 'nueva');

    const child = spawn('sleep', ['2']);
    const t0 = Date.now();
    const done = new Promise<number | null>((resolve) => {
      const p = spawn('/bin/sh', ['-c', SWAP_SCRIPT, 'sh', String(child.pid), oldApp, newApp], {
        env: { ...process.env, OPEN_CMD: 'true', KAGEVIEW_UPDATE_LOG: log },
      });
      p.on('close', resolve);
    });
    await new Promise((r) => setTimeout(r, 800));
    expect(marker(oldApp)).toBe('vieja'); // mientras la app sigue viva, no se cambia
    expect(await done).toBe(0);
    expect(Date.now() - t0).toBeGreaterThan(1500);
    expect(marker(oldApp)).toBe('nueva');
  }, 15_000);

  it('si falta la app nueva no toca la actual', () => {
    const oldApp = path.join(dir, 'KageView.app');
    mkApp(oldApp, 'vieja');
    const r = runScript(999_999, oldApp, path.join(dir, '.kageview-update', 'KageView.app'));
    expect(r.status).toBe(1);
    expect(marker(oldApp)).toBe('vieja');
    expect(fs.readFileSync(log, 'utf8')).toContain('falta la app nueva');
  });

  it('borra restos de una actualización interrumpida', () => {
    const oldApp = path.join(dir, 'KageView.app');
    const newApp = path.join(dir, '.kageview-update', 'KageView.app');
    mkApp(oldApp, 'vieja');
    mkApp(newApp, 'nueva');
    fs.mkdirSync(`${oldApp}.kageview-old`);
    fs.writeFileSync(path.join(`${oldApp}.kageview-old`, 'resto'), 'x');
    expect(runScript(999_999, oldApp, newApp).status).toBe(0);
    expect(marker(oldApp)).toBe('nueva');
    expect(fs.existsSync(`${oldApp}.kageview-old`)).toBe(false);
  });

  it('rutas con espacios y caracteres de shell no ejecutan nada', () => {
    const evil = path.join(dir, 'Mi App $(touch pwned) `touch pwned2` ;touch pwned3.app');
    const stage = path.join(dir, '.kageview-update');
    const newApp = path.join(stage, "KageView 'x'.app");
    mkApp(evil, 'vieja');
    mkApp(newApp, 'nueva');
    const r = runScript(999_999, evil, newApp);
    expect(r.status).toBe(0);
    expect(marker(evil)).toBe('nueva');
    for (const f of ['pwned', 'pwned2', 'pwned3']) {
      expect(fs.existsSync(path.join(dir, f))).toBe(false);
      expect(fs.existsSync(path.join(process.cwd(), f))).toBe(false);
    }
  });
});
