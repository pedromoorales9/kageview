import React from 'react';
import { createRoot } from 'react-dom/client';
// Iconos: fuente incluida en la app (no depende de internet ni de Google Fonts)
import 'material-symbols/outlined.css';
import './index.css';
import App from './App';
import { ToastProvider } from './components/ui/Toast';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div
          style={{
            background: '#09050a',
            color: '#ff8fa8',
            padding: 40,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            height: '100vh',
            overflow: 'auto',
          }}
        >
          <div style={{ color: '#ff8fa8', fontSize: 22, marginBottom: 16 }}>
            KageView — Error de arranque
          </div>
          <div style={{ color: '#ff8fa8', marginBottom: 8 }}>{err.message}</div>
          <div style={{ color: '#bcaab2', fontSize: 12 }}>{err.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Permite que el CSS distinga macOS (vibrancy, semáforos) del resto
document.documentElement.classList.add(`platform-${window.electron?.platform ?? 'web'}`);

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
createRoot(container).render(
  <ErrorBoundary>
    <ToastProvider>
      <App />
    </ToastProvider>
  </ErrorBoundary>
);
