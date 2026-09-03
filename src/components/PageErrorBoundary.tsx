import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
  isChunkError: boolean;
}

class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error: Error): State {
    const msg = error?.message || String(error);
    const isChunkError =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk');
    return { hasError: true, errorMessage: msg, isChunkError };
  }

  componentDidCatch(error: Error) {
    console.error(`[PageErrorBoundary] Error en ${this.props.pageName || 'página'}:`, error);
  }

  handleRetry = async () => {
    if (this.state.isChunkError) {
      // Clear SW caches and unregister so the reload fetches fresh assets
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      window.location.reload();
    } else {
      this.setState({ hasError: false, isChunkError: false });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div
            className="max-w-md w-full rounded-2xl p-8 text-center"
            style={{
              background: '#0D1528',
              border: '1px solid rgba(255,255,255,.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,.4)',
            }}
          >
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.25)' }}
            >
              <AlertTriangle className="h-7 w-7" style={{ color: '#FCA5A5' }} />
            </div>
            <h2 className="text-[16px] font-bold mb-2" style={{ color: 'rgba(255,255,255,.9)', fontFamily: "'Outfit', sans-serif" }}>
              Error al cargar {this.props.pageName || 'esta página'}
            </h2>
            <p className="text-[12.5px] mb-4" style={{ color: 'rgba(255,255,255,.4)' }}>
              {this.state.isChunkError
                ? 'Hay una nueva versión disponible. Recargá para obtenerla.'
                : 'Ocurrió un error inesperado. Podés intentar recargar.'}
            </p>
            {this.state.errorMessage && !this.state.isChunkError && (
              <p
                className="text-[11px] font-mono rounded-xl p-3 mb-4 text-left break-all"
                style={{
                  background: 'rgba(239,68,68,.08)',
                  color: '#FCA5A5',
                  border: '1px solid rgba(239,68,68,.15)',
                }}
              >
                {this.state.errorMessage}
              </p>
            )}
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}
            >
              <RefreshCw className="h-4 w-4" />
              {this.state.isChunkError ? 'Recargar página' : 'Reintentar'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default PageErrorBoundary;
