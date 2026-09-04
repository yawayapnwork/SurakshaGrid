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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-white border border-slate-200/80 rounded-2xl max-w-2xl w-full p-6 text-slate-900 shadow-lg space-y-5 max-h-[85vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-indigo-600">
            <FileText className="w-4.5 h-4.5" />
            <h3 className="font-semibold text-[15px] text-slate-900 tracking-tight">Incident After-Action Report (AAR)</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Markdown Content Preview Box */}
        <div className="flex-1 overflow-y-auto bg-slate-50/70 p-4 rounded-xl border border-slate-200/70 font-mono text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
          {aarMarkdown}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-1"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied to Clipboard!' : 'Copy Markdown'}
          </button>

          <button
            onClick={handleDownload}
            className="px-4 py-2 rounded-lg bg-gradient-to-b from-slate-800 to-slate-950 hover:from-slate-700 hover:to-slate-900 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 focus-visible:ring-offset-2"
          >
            <Download className="w-4 h-4" />
            Download Report (.md)
          </button>
        </div>
      </div>
    </div>
  );
};
