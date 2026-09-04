'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class MapErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MapLibre GL Error Boundary caught an exception:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 bg-slate-100 flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl max-w-md w-full p-6 text-slate-900 shadow-lg space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-[15px] text-slate-900 tracking-tight">WebGL / Map Engine Error</h3>
              <p className="text-xs text-slate-500 mt-1">
                {this.state.error?.message || 'OpenFreeMap vector tile canvas lost WebGL context.'}
              </p>
            </div>
            <button
              onClick={this.handleReload}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-b from-slate-800 to-slate-950 hover:from-slate-700 hover:to-slate-900 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 focus-visible:ring-offset-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Map Canvas
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
