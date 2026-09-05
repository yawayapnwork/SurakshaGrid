import { DispatchAssignment, RescueUnit, SOSReport } from '@/types';

export const N8N_WEBHOOK_BASE_URL = (
  process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || 'https://yayaworks.app.n8n.cloud/webhook'
).replace(/\/+$/, '');

export interface N8nLiveTelemetry {
  rainfall_intensity: number;
  raw_mm: number;
  source: string;
  timestamp: string;
  wind_speed_kmh?: number;
  wind_direction?: string;
  pressure_hpa?: number;
  humidity_percent?: number;
  soil_saturation_percent?: number;
}

export interface N8nRescueUnitPayload {
  id: string;
  name: string;
  unit_type: 'BOAT' | 'AMBULANCE' | 'DRONE';
  coordinates: [number, number];
  status: 'AVAILABLE' | 'DISPATCHED' | 'MAINTENANCE';
}

export interface N8nSOSAlertPayload {
  id: string;
  latitude: number;
  longitude: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL_TRAPPED';
  status: 'PENDING' | 'ASSIGNED' | 'RESOLVED';
  trust_score: number;
  voice_transcript?: string;
  created_at: string;
}

export interface N8nDashboardSyncResult {
  telemetry: N8nLiveTelemetry | null;
  dispatchQueue: DispatchAssignment[];
  rescueUnits: RescueUnit[];
  sosReports: SOSReport[];
  syncedAt: string;
}

const DEFAULT_FETCH_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch live meteorological telemetry from n8n webhook feed
 */
export async function fetchN8nLiveTelemetry(): Promise<N8nLiveTelemetry | null> {
  try {
    const url = `${N8N_WEBHOOK_BASE_URL}/surakshagrid-telemetry`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      rainfall_intensity: Number(data.rainfall_intensity ?? data.intensity ?? 0),
      raw_mm: Number(data.raw_mm ?? data.rainfall_mm ?? 0),
      source: String(data.source || 'n8n Workflow (yayaworks.app.n8n.cloud)'),
      timestamp: String(data.timestamp || new Date().toISOString()),
      wind_speed_kmh: data.wind_speed_kmh ? Number(data.wind_speed_kmh) : undefined,
      wind_direction: data.wind_direction ? String(data.wind_direction) : undefined,
      pressure_hpa: data.pressure_hpa ? Number(data.pressure_hpa) : undefined,
      humidity_percent: data.humidity_percent ? Number(data.humidity_percent) : undefined,
      soil_saturation_percent: data.soil_saturation_percent ? Number(data.soil_saturation_percent) : undefined,
    };
  } catch (err) {
    console.warn('n8n Telemetry webhook unavailable or timed out:', err);
    return null;
  }
}

/**
 * Fetch live rescue unit assignments / dispatch queue from n8n webhook feed
 */
export async function fetchN8nDispatchQueue(): Promise<DispatchAssignment[]> {
  try {
    const url = `${N8N_WEBHOOK_BASE_URL}/surakshagrid-dispatch-queue`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.assignments || data.data || [];
    return items.map((item: Record<string, unknown>) => ({
      sos_id: String(item.sos_id || item.sosId || ''),
      rescue_unit_id: String(item.rescue_unit_id || item.unitId || ''),
      unit_name: String(item.unit_name || item.unitName || 'n8n Rescue Unit'),
      eta_seconds: Number(item.eta_seconds || item.etaSeconds || 300),
      cost: Number(item.cost || 5.0),
      assigned_at: String(item.assigned_at || item.assignedAt || new Date().toISOString()),
    }));
  } catch (err) {
    console.warn('n8n Dispatch Queue webhook unavailable or timed out:', err);
    return [];
  }
}

/**
 * Fetch active SOS alerts & incidents from n8n webhook feed
 */
export async function fetchN8nSOSAlerts(): Promise<SOSReport[]> {
  try {
    const url = `${N8N_WEBHOOK_BASE_URL}/surakshagrid-sos-alerts`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.reports || data.data || [];
    return items.map((item: Record<string, unknown>) => {
      const coords: [number, number] = Array.isArray(item.coordinates)
        ? (item.coordinates as [number, number])
        : [Number(item.longitude || item.lon || 80.27), Number(item.latitude || item.lat || 13.08)];
      return {
        id: String(item.id || item.sos_id || ''),
        location: { type: 'Point', coordinates: coords },
        status: (item.status as SOSReport['status']) || 'PENDING',
        severity: (item.severity as SOSReport['severity']) || 'HIGH',
        trust_score: Number(item.trust_score ?? item.trustScore ?? 0.85),
        photo_url: item.photo_url ? String(item.photo_url) : null,
        visual_confidence_score: item.visual_confidence_score ? Number(item.visual_confidence_score) : null,
        voice_transcript: item.voice_transcript ? String(item.voice_transcript) : null,
        created_at: String(item.created_at || item.createdAt || new Date().toISOString()),
      };
    });
  } catch (err) {
    console.warn('n8n SOS Alerts webhook unavailable or timed out:', err);
    return [];
  }
}

/**
 * Perform unified single-pass poll of all n8n endpoints
 */
export async function fetchN8nFullDashboardSync(): Promise<N8nDashboardSyncResult> {
  const [telemetry, dispatchQueue, sosReports] = await Promise.all([
    fetchN8nLiveTelemetry(),
    fetchN8nDispatchQueue(),
    fetchN8nSOSAlerts(),
  ]);

  const rescueUnits: RescueUnit[] = dispatchQueue.map((dq) => ({
    id: dq.rescue_unit_id,
    name: dq.unit_name,
    unit_type: dq.unit_name.toLowerCase().includes('boat') ? 'BOAT' : dq.unit_name.toLowerCase().includes('drone') ? 'DRONE' : 'AMBULANCE',
    current_location: { type: 'Point', coordinates: [80.25, 13.05] },
    status: 'DISPATCHED',
  }));

  return {
    telemetry,
    dispatchQueue,
    rescueUnits,
    sosReports,
    syncedAt: new Date().toISOString(),
  };
}
