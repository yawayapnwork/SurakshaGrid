'use client';

import React, { useState } from 'react';
import { Check, Copy, Download, FileText, X } from 'lucide-react';
import { DispatchAssignment, RescueUnit, SOSReport } from '@/types';

interface ExportAARModalProps {
  isOpen: boolean;
  onClose: () => void;
  sosReports: SOSReport[];
  rescueUnits: RescueUnit[];
  dispatchAssignments: DispatchAssignment[];
  monitoredAreaKm2?: number;
}

export const ExportAARModal: React.FC<ExportAARModalProps> = ({
  isOpen,
  onClose,
  sosReports,
  rescueUnits,
  dispatchAssignments,
  monitoredAreaKm2 = 42.5,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const nowStr = new Date().toLocaleString();

  const totalSos = sosReports.length;
  const criticalCount = sosReports.filter((r) => r.severity === 'CRITICAL_TRAPPED').length;
  const confirmedCount = sosReports.filter((r) => r.trust_score >= 2).length;
  const assignedCount = sosReports.filter((r) => r.status === 'ASSIGNED').length;

  const dispatchedUnits = rescueUnits.filter((u) => u.status === 'DISPATCHED').length;
  const totalUnits = rescueUnits.length;

  const avgEtaSec =
    dispatchAssignments.length > 0
      ? dispatchAssignments.reduce((acc, a) => acc + a.eta_seconds, 0) / dispatchAssignments.length
      : 0;
  const avgEtaMin = (avgEtaSec / 60).toFixed(1);

  // Generate Clean Markdown After-Action Report
  const aarMarkdown = `# SurakshaGrid Emergency Flood Response - After-Action Report (AAR)
**Generated:** ${nowStr}
**Monitored Area:** ${monitoredAreaKm2} km²

---

## 1. Incident Overview & Impact
- **Total SOS Incidents Logged:** ${totalSos}
- **Critical Trapped Citizens:** ${criticalCount}
- **Citizen-Confirmed Reports:** ${confirmedCount}
- **Assigned / Responded Incidents:** ${assignedCount}

---

## 2. Resource Deployment & Optimization
- **Total Rescue Fleet Size:** ${totalUnits} Units
- **Dispatched Rescue Units:** ${dispatchedUnits} Units
- **Solved Dispatch Assignments:** ${dispatchAssignments.length} Matches
- **Average Route ETA:** ${avgEtaMin} Minutes

---

## 3. Dispatched Unit Assignments
${
  dispatchAssignments.length > 0
    ? dispatchAssignments
        .map(
          (a, i) =>
            `${i + 1}. **${a.unit_name}** $\\rightarrow$ Incident \`${a.sos_id.slice(0, 8)}\` (ETA: ${(a.eta_seconds / 60).toFixed(1)} mins, Cost: ${a.cost.toFixed(2)})`
        )
        .join('\n')
    : '_No units dispatched yet._'
}

---

## 4. Key Takeaways & Recommendations
- **OpenCV Water Verification Engine:** Successfully verified visual flood evidence for high-priority dispatching.
- **SciPy Hungarian Dispatch Optimizer:** Computed zero-conflict minimum ETA unit assignments.
- **Digital Twin Event Logging:** All events preserved for chronological replay and post-incident auditing.
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(aarMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([aarMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SurakshaGrid_AAR_${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-5 text-slate-900">
        {/* Modal Header */}
        <div className="shrink-0 flex-shrink-0 flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5 text-slate-500">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <FileText className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 tracking-tight">Incident After-Action Report (AAR)</h3>
              <p className="text-xs text-slate-500">Exportable operational debrief and audit log</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Markdown Content Preview Box */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar bg-slate-50/70 p-5 rounded-xl border border-slate-200/70 font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
          {aarMarkdown}
        </div>

        {/* Modal Footer Actions */}
        <div className="shrink-0 flex-shrink-0 flex items-center justify-end gap-3 pt-2">
          <button
            onClick={handleCopy}
            className="px-4.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-2 transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-1"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied to Clipboard!' : 'Copy Markdown'}
          </button>

          <button
            onClick={handleDownload}
            className="px-4.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 focus-visible:ring-offset-2"
          >
            <Download className="w-4 h-4" />
            Download Report (.md)
          </button>
        </div>
      </div>
    </div>
  );
};
