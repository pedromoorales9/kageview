import { useEffect, useState } from 'react';

type UpdaterState =
  | { status: 'idle' }
  | { status: 'available'; version: string; releaseNotes: string | null }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export function UpdaterModal() {
  const [state, setState] = useState<UpdaterState>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electron) return;
    window.electron.onUpdater((data) => {
      if (data.type === 'available') {
        setState({
          status: 'available',
          version: data.version ?? '?',
          releaseNotes: data.releaseNotes ?? null,
        });
        setDismissed(false);
      } else if (data.type === 'progress') {
        setState({ status: 'downloading', percent: data.percent ?? 0 });
      } else if (data.type === 'downloaded') {
        setState({ status: 'downloaded', version: data.version ?? '?' });
      } else if (data.type === 'error') {
        setState({ status: 'error', message: data.message ?? 'Error desconocido' });
      }
    });
    return () => window.electron?.removeUpdaterListener();
  }, []);

  if (state.status === 'idle' || dismissed) return null;

  // Parsear release notes como lista de items
  const parseChangelog = (notes: string | null): string[] => {
    if (!notes) return [
      'Mejoras de rendimiento y estabilidad',
      'Corrección de errores en providers',
      'Nuevas funcionalidades'
    ];
    return notes
      .split('\n')
      .filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'))
      .map(l => l.replace(/^[-*]\s*/, '').trim())
      .slice(0, 4);
  };

  const changelog = state.status === 'available'
    ? parseChangelog(state.releaseNotes)
    : [];

  const dotColors = ['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-primary'];

  return (
    // Overlay sobre toda la app
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-md p-6">
      {/* Glow de fondo */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-secondary/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Card principal */}
      <div className="relative w-full max-w-2xl rounded-xl overflow-hidden border border-outline-variant/15 shadow-2xl"
           style={{ background: 'rgba(25, 25, 31, 0.6)', backdropFilter: 'blur(24px)' }}>

        {/* Barra superior gradiente */}
        <div className="h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary opacity-50" />

        <div className="p-8 md:p-12">

          {/* Header */}
          <div className="mb-8 relative">
            {/* Icono flotante decorativo */}
            <div className="absolute -top-16 -right-16 opacity-10 pointer-events-none select-none">
              <span className="material-symbols-outlined text-primary"
                    style={{ fontSize: '160px', fontVariationSettings: "'wght' 100" }}>
                system_update_alt
              </span>
            </div>

            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary font-headline text-[10px] font-bold tracking-[0.2em] uppercase mb-4">
              System Alert
            </span>

            {state.status === 'available' && (
              <>
                <h2 className="text-4xl md:text-5xl font-black font-headline tracking-tighter text-on-surface leading-tight">
                  NUEVA TRANSMISIÓN<br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                    DETECTADA
                  </span>
                </h2>
                <p className="mt-4 text-on-surface-variant font-body text-lg font-light">
                  Versión <span className="text-secondary font-mono">v{state.version}</span> lista para despliegue.
                </p>
              </>
            )}

            {state.status === 'downloading' && (
              <>
                <h2 className="text-4xl font-black font-headline tracking-tighter text-on-surface">
                  DESCARGANDO...
                </h2>
                <p className="mt-4 text-on-surface-variant text-lg font-light">
                  Instalando actualización en segundo plano.
                </p>
              </>
            )}

            {state.status === 'downloaded' && (
              <>
                <h2 className="text-4xl font-black font-headline tracking-tighter text-on-surface">
                  LISTO PARA<br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                    INSTALAR
                  </span>
                </h2>
                <p className="mt-4 text-on-surface-variant text-lg font-light">
                  v{state.version} descargada. Reinicia para aplicar.
                </p>
              </>
            )}

            {state.status === 'error' && (
              <>
                <h2 className="text-4xl font-black font-headline tracking-tighter text-error">
                  ERROR DE<br/>ACTUALIZACIÓN
                </h2>
                <p className="mt-4 text-on-surface-variant text-sm font-mono">
                  {state.message}
                </p>
              </>
            )}
          </div>

          {/* Changelog — solo cuando hay update disponible */}
          {state.status === 'available' && changelog.length > 0 && (
            <div className="mb-10 p-6 rounded-lg bg-surface-container-low border border-outline-variant/10">
              <h3 className="font-headline text-xs font-bold tracking-[0.1em] text-on-surface-variant uppercase mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">terminal</span>
                Novedades
              </h3>
              <ul className="space-y-4">
                {changelog.map((item, i) => (
                  <li key={i} className="flex items-start gap-4 group">
                    <div className={`mt-1 w-2 h-2 rounded-full flex-none ${dotColors[i % dotColors.length]} group-hover:scale-125 transition-transform duration-300`} />
                    <p className="text-on-surface text-sm">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Barra de progreso */}
          {state.status === 'downloading' && (
            <div className="mb-10">
              <div className="flex justify-between text-xs text-on-surface-variant mb-2">
                <span>Descargando...</span>
                <span className="text-primary font-bold">{state.percent}%</span>
              </div>
              <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-300"
                  style={{
                    width: `${state.percent}%`,
                    boxShadow: '0 0 10px rgba(203,151,255,0.5)'
                  }}
                />
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex flex-col items-center gap-6">

            {state.status === 'available' && (
              <button
                onClick={() => {
                  const isMac = navigator.userAgent.toLowerCase().includes('mac os');
                  if (isMac) {
                    window.open('https://github.com/pedromoorales9/KageView/releases/latest');
                    setDismissed(true);
                  } else {
                    setState({ status: 'downloading', percent: 0 });
                    window.electron.updaterDownload();
                  }
                }}
                className="group relative w-full py-5 rounded-full font-headline font-extrabold text-sm tracking-[0.1em] text-on-primary-fixed flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #cb97ff, #c185fd)',
                  boxShadow: '0 0 20px 2px rgba(203, 151, 255, 0.2)'
                }}
              >
                {(() => {
                  const isMac = navigator.userAgent.toLowerCase().includes('mac os');
                  return isMac ? 'DESCARGAR MANUALMENTE' : 'INICIALIZAR ACTUALIZACIÓN';
                })()}
                <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">
                  {navigator.userAgent.toLowerCase().includes('mac os') ? 'open_in_new' : 'bolt'}
                </span>
              </button>
            )}

            {state.status === 'downloaded' && (
              <button
                onClick={() => window.electron.updaterInstall()}
                className="group relative w-full py-5 rounded-full font-headline font-extrabold text-sm tracking-[0.1em] text-on-primary-fixed flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #cb97ff, #c185fd)',
                  boxShadow: '0 0 20px 2px rgba(203, 151, 255, 0.2)'
                }}
              >
                REINICIAR E INSTALAR
                <span className="material-symbols-outlined text-lg group-hover:rotate-12 transition-transform">
                  restart_alt
                </span>
              </button>
            )}

            {state.status !== 'downloading' && state.status !== 'downloaded' && (
              <div className="flex items-center gap-8">
                <button
                  onClick={() => setDismissed(true)}
                  className="text-on-surface-variant font-headline text-[11px] font-bold tracking-[0.15em] uppercase hover:text-primary transition-colors"
                >
                  {state.status === 'error' ? 'Cerrar' : 'Actualizar después'}
                </button>
                {state.status === 'available' && (
                  <>
                    <div className="w-1 h-1 rounded-full bg-outline-variant" />
                    <button
                      onClick={() => window.open('https://github.com/pedromoorales9/KageView/releases/latest')}
                      className="text-on-surface-variant font-headline text-[11px] font-bold tracking-[0.15em] uppercase hover:text-secondary transition-colors"
                    >
                      Ver Changelog completo
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer decorativo */}
        <div className="px-8 pb-4 flex justify-between items-center opacity-20">
          <span className="text-[9px] font-mono text-on-surface-variant tracking-widest">
            KAGEVIEW_UPDATE_SIGNAL
          </span>
          <div className="flex gap-2">
            <div className="w-8 h-[2px] bg-primary" />
            <div className="w-4 h-[2px] bg-outline-variant" />
            <div className="w-2 h-[2px] bg-outline-variant" />
          </div>
        </div>
      </div>
    </div>
  );
}
