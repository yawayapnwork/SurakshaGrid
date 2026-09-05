import { useCallback, useEffect, useState } from 'react';
import {
  fetchN8nFullDashboardSync,
  N8nDashboardSyncResult,
  N8nLiveTelemetry,
} from '@/services/n8nApi';
import { DispatchAssignment, RescueUnit, SOSReport } from '@/types';

export type N8nSyncStatus = 'idle' | 'syncing' | 'live' | 'fallback' | 'error';

export interface UseN8nLiveFeedReturn {
  syncStatus: N8nSyncStatus;
  isLive: boolean;
  lastSyncedAt: string | null;
  telemetry: N8nLiveTelemetry | null;
  dispatchQueue: DispatchAssignment[];
  rescueUnits: RescueUnit[];
  sosReports: SOSReport[];
  error: string | null;
  refetch: () => Promise<void>;
}

export function useN8nLiveFeed(
  enabled: boolean = true,
  pollIntervalMs: number = 15000
): UseN8nLiveFeedReturn {
  const [syncStatus, setSyncStatus] = useState<N8nSyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<N8nLiveTelemetry | null>(null);
  const [dispatchQueue, setDispatchQueue] = useState<DispatchAssignment[]>([]);
  const [rescueUnits, setRescueUnits] = useState<RescueUnit[]>([]);
  const [sosReports, setSosReports] = useState<SOSReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!enabled) return;

    setSyncStatus((prev) => (prev === 'idle' ? 'syncing' : prev));

    try {
      const result: N8nDashboardSyncResult = await fetchN8nFullDashboardSync();

      const hasN8nData =
        Boolean(result.telemetry) ||
        result.dispatchQueue.length > 0 ||
        result.sosReports.length > 0;

      if (hasN8nData) {
        setTelemetry(result.telemetry);
        setDispatchQueue(result.dispatchQueue);
        setRescueUnits(result.rescueUnits);
        setSosReports(result.sosReports);
        setLastSyncedAt(result.syncedAt);
        setSyncStatus('live');
        setError(null);
      } else {
        // n8n endpoints responded empty or unconfigured — gracefully fall back
        setSyncStatus('fallback');
      }
    } catch (err) {
      console.warn('Error syncing with n8n webhooks, switching to fallback mode:', err);
      setSyncStatus('fallback');
      setError(err instanceof Error ? err.message : 'n8n Webhook Sync Failed');
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    poll();
    const interval = setInterval(poll, pollIntervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [enabled, poll, pollIntervalMs]);

  return {
    syncStatus,
    isLive: syncStatus === 'live',
    lastSyncedAt,
    telemetry,
    dispatchQueue,
    rescueUnits,
    sosReports,
    error,
    refetch: poll,
  };
}
