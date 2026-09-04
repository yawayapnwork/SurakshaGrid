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
      <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-xl overflow-hidden text-slate-900 relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-sky-600" />
            <h3 className="font-bold text-lg text-[#0F172A]">Explainable Risk Analysis</h3>
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
              <span className="text-xs text-[#475569] uppercase font-semibold tracking-wider block">
                Composite Risk Score
              </span>
              <span className="text-3xl font-black text-[#0F172A]">{scorePct}%</span>
            </div>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${badge.color}`}>
              {badge.label}
            </span>
          </div>

          {/* Breakdown Progress Bars */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#475569]">
              Factor Breakdown
            </h4>

            {/* Rainfall Impact */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <CloudRain className="w-4 h-4 text-sky-600" /> Rainfall Impact
                </span>
                <span className="font-bold text-sky-600">
                  {Math.round(breakdown.rainfall_impact * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-sky-500 h-full transition-all duration-500"
                  style={{ width: `${breakdown.rainfall_impact * 100}%` }}
                />
              </div>
            </div>

            {/* Flood Proximity */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Droplets className="w-4 h-4 text-cyan-600" /> Flood Corridor Proximity
                </span>
                <span className="font-bold text-cyan-600">
                  {Math.round(breakdown.flood_proximity * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full transition-all duration-500"
                  style={{ width: `${breakdown.flood_proximity * 100}%` }}
                />
              </div>
            </div>

            {/* Elevation Drop */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Mountain className="w-4 h-4 text-emerald-600" /> Low Terrain / Elevation Drop
                </span>
                <span className="font-bold text-emerald-600">
                  {Math.round(breakdown.elevation_drop * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${breakdown.elevation_drop * 100}%` }}
                />
              </div>
            </div>

            {/* Active Report Density */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Users className="w-4 h-4 text-amber-600" /> SOS Report Density
                </span>
                <span className="font-bold text-amber-600">
                  {Math.round(breakdown.report_density * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-500"
                  style={{ width: `${breakdown.report_density * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-colors"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
};
