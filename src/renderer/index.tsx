import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

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
            background: '#0e0e13',
            color: '#ff6e84',
            padding: 40,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            height: '100vh',
            overflow: 'auto',
          }}
        >
          <div style={{ color: '#cb97ff', fontSize: 22, marginBottom: 16 }}>
            KageView — Error de arranque
          </div>
          <div style={{ color: '#f673b7', marginBottom: 8 }}>{err.message}</div>
          <div style={{ color: '#acaab1', fontSize: 12 }}>{err.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
