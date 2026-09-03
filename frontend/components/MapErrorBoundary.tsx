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
        <div className="w-full h-screen relative bg-slate-950 flex items-center justify-center p-6">
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto border border-red-500/30">
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">WebGL / Map Engine Error</h3>
              <p className="text-xs text-slate-400 mt-1">
                {this.state.error?.message || 'OpenFreeMap vector tile canvas lost WebGL context.'}
              </p>
            </div>
            <button
              onClick={this.handleReload}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-sky-900/30"
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
