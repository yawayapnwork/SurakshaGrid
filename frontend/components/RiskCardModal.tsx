'use client';

import React from 'react';
import { AlertCircle, CloudRain, Droplets, Mountain, Users, X } from 'lucide-react';
import { RiskFeatureProperties } from '@/types';

interface RiskCardModalProps {
  properties: RiskFeatureProperties | null;
  onClose: () => void;
}

export const RiskCardModal: React.FC<RiskCardModalProps> = ({ properties, onClose }) => {
  if (!properties) return null;

  const { risk_score, breakdown } = properties;
  const scorePct = Math.round(risk_score * 100);

  const getRiskBadge = (score: number) => {
    if (score >= 0.75) return { label: 'CRITICAL HAZARD', color: 'bg-red-500/20 text-red-400 border-red-500/50' };
    if (score >= 0.5) return { label: 'HIGH RISK', color: 'bg-orange-500/20 text-orange-400 border-orange-500/50' };
    if (score >= 0.25) return { label: 'MODERATE RISK', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50' };
    return { label: 'LOW RISK', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' };
  };

  const badge = getRiskBadge(risk_score);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-100 relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-sky-400" />
            <h3 className="font-bold text-lg text-white">Explainable Risk Analysis</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Main Score Banner */}
          <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider block">
                Composite Risk Score
              </span>
              <span className="text-3xl font-black text-white">{scorePct}%</span>
            </div>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${badge.color}`}>
              {badge.label}
            </span>
          </div>

          {/* Breakdown Progress Bars */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Factor Breakdown
            </h4>

            {/* Rainfall Impact */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <CloudRain className="w-4 h-4 text-sky-400" /> Rainfall Impact
                </span>
                <span className="font-bold text-sky-400">
                  {Math.round(breakdown.rainfall_impact * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-sky-500 h-full transition-all duration-500"
                  style={{ width: `${breakdown.rainfall_impact * 100}%` }}
                />
              </div>
            </div>

            {/* Flood Proximity */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Droplets className="w-4 h-4 text-cyan-400" /> Flood Corridor Proximity
                </span>
                <span className="font-bold text-cyan-400">
                  {Math.round(breakdown.flood_proximity * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full transition-all duration-500"
                  style={{ width: `${breakdown.flood_proximity * 100}%` }}
                />
              </div>
            </div>

            {/* Elevation Drop */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Mountain className="w-4 h-4 text-emerald-400" /> Low Terrain / Elevation Drop
                </span>
                <span className="font-bold text-emerald-400">
                  {Math.round(breakdown.elevation_drop * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${breakdown.elevation_drop * 100}%` }}
                />
              </div>
            </div>

            {/* Active Report Density */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Users className="w-4 h-4 text-amber-400" /> SOS Report Density
                </span>
                <span className="font-bold text-amber-400">
                  {Math.round(breakdown.report_density * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-500"
                  style={{ width: `${breakdown.report_density * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
};
