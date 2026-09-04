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
    if (score >= 0.75) return { label: 'CRITICAL HAZARD', color: 'bg-red-50 text-red-700 border-red-200' };
    if (score >= 0.5) return { label: 'HIGH RISK', color: 'bg-orange-50 text-orange-700 border-orange-200' };
    if (score >= 0.25) return { label: 'MODERATE RISK', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'LOW RISK', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  const badge = getRiskBadge(risk_score);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200/80 w-full max-w-md rounded-2xl shadow-lg overflow-hidden text-slate-900 relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4.5 h-4.5 text-slate-500" />
            <h3 className="font-semibold text-[15px] text-slate-900 tracking-tight">Explainable Risk Analysis</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Main Score Banner */}
          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-xs text-slate-500 uppercase font-semibold tracking-wider block">
                Composite Risk Score
              </span>
              <span className="text-3xl font-semibold text-slate-900">{scorePct}%</span>
            </div>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${badge.color}`}>
              {badge.label}
            </span>
          </div>

          {/* Breakdown Progress Bars */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Factor Breakdown
            </h4>

            {[
              { icon: CloudRain, label: 'Rainfall Impact', value: breakdown.rainfall_impact },
              { icon: Droplets, label: 'Flood Corridor Proximity', value: breakdown.flood_proximity },
              { icon: Mountain, label: 'Low Terrain / Elevation Drop', value: breakdown.elevation_drop },
              { icon: Users, label: 'SOS Report Density', value: breakdown.report_density },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Icon className="w-4 h-4 text-slate-400" /> {label}
                  </span>
                  <span className="font-semibold text-slate-900">{Math.round(value * 100)}%</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-slate-900 h-full transition-all duration-500"
                    style={{ width: `${value * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 focus-visible:ring-offset-2"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
};
