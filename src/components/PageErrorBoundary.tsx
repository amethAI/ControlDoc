import React, { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

/**
 * Lightweight per-page error boundary.
 * If a page crashes, shows a contained error card instead of crashing the whole app.
 * The sidebar and navigation remain operational.
 */
class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || String(error) };
  }

  componentDidCatch(error: Error) {
    console.error(`[PageErrorBoundary] Error en ${this.props.pageName || 'página'}:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full shadow-sm text-center">
            <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-800 mb-2">
              Error al cargar {this.props.pageName || 'esta página'}
            </h2>
            <p className="text-sm text-slate-500 mb-3">
              Ocurrió un error inesperado. Podés intentar recargar solo esta sección.
            </p>
            {this.state.errorMessage && (
              <p className="text-xs font-mono bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 mb-4 text-left break-all">
                {this.state.errorMessage}
              </p>
            )}
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default PageErrorBoundary;
