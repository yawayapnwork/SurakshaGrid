'use client';

import React, { useState } from 'react';
import { AlertCircle, Loader2, MessageSquareWarning, Send, X } from 'lucide-react';
import { sendSMSAlert } from '@/services/api';
import { SMSAlertPriority } from '@/types';

interface BroadcastSMSModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Reports success/failure to the host page's own toast system instead of building a
   *  separate one — matches how every other panel in the dashboard surfaces errors. */
  onToast: (text: string, type: 'success' | 'info') => void;
  /** Pre-fills the message body, e.g. with the currently selected SOS report's details. */
  defaultMessage?: string;
}

const PRIORITY_OPTIONS: { key: SMSAlertPriority; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'critical', label: 'Critical' },
];

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export const BroadcastSMSModal: React.FC<BroadcastSMSModalProps> = ({
  isOpen,
  onClose,
  onToast,
  defaultMessage = '',
}) => {
  const [numbersInput, setNumbersInput] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [priority, setPriority] = useState<SMSAlertPriority>('high');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const parsedNumbers = numbersInput
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  const invalidNumbers = parsedNumbers.filter((n) => !E164_PATTERN.test(n));
  const canSubmit = parsedNumbers.length > 0 && invalidNumbers.length === 0 && message.trim().length > 0;

  const handleClose = () => {
    setErrorMessage(null);
    onClose();
  };

  const handleSend = async () => {
    if (!canSubmit) return;
    setIsSending(true);
    setErrorMessage(null);

    try {
      const result = await sendSMSAlert(parsedNumbers, message.trim(), priority);
      if (result.failed_count > 0) {
        const failedNumbers = result.results.filter((r) => !r.sent).map((r) => r.to);
        onToast(
          `SMS alert sent to ${result.sent_count}/${result.total} recipient(s). Failed: ${failedNumbers.join(', ')}`,
          'info'
        );
      } else {
        onToast(`SMS alert broadcast to ${result.sent_count} recipient(s).`, 'success');
      }
      handleClose();
    } catch (err) {
      console.error('Failed to broadcast SMS alert:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send SMS alert.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-5 text-slate-900">
        {/* Modal Header */}
        <div className="shrink-0 flex-shrink-0 flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5 text-slate-500">
            <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100">
              <MessageSquareWarning className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 tracking-tight">Broadcast Emergency SMS Alert</h3>
              <p className="text-xs text-slate-500">Targeted cellular broadcast for citizens & response teams</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-900 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5 custom-scrollbar">
          {/* Recipient Phone Numbers */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Recipient Phone Numbers</label>
            <input
              type="text"
              value={numbersInput}
              onChange={(e) => setNumbersInput(e.target.value)}
              placeholder="+919876543210, +14155552671"
              className="w-full bg-white border border-slate-200 focus:border-slate-400 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-all font-mono"
            />
            <p className="text-[10px] text-slate-400">Comma-separated, E.164 format (leading + and country code).</p>
            {invalidNumbers.length > 0 && (
              <p className="text-[10px] text-amber-700">Invalid number(s): {invalidNumbers.join(', ')}</p>
            )}
          </div>

          {/* Message Body */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Alert Message</label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the emergency and required action..."
              maxLength={1600}
              className="w-full bg-white border border-slate-200 focus:border-slate-400 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-all resize-none"
            />
          </div>

          {/* Priority Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Priority Level</label>
            <div className="grid grid-cols-4 gap-2.5">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPriority(opt.key)}
                  className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                    priority === opt.key
                      ? opt.key === 'critical'
                        ? 'bg-red-50 border-red-300 text-red-900 shadow-xs'
                        : 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 flex-shrink-0 flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            onClick={handleClose}
            className="px-4.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs transition-all shadow-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!canSubmit || isSending}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSending ? 'Sending…' : 'Broadcast SMS Alert'}
          </button>
        </div>
      </div>
    </div>
  );
};
