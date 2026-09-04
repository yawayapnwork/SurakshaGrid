import { DispatchAssignment, EventLog, FloodZoneCollection, LiveAnalyticsStats, RiskGridCollection, SOSReport } from '@/types';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

export async function fetchSimulatedRiskScores(
  rainfall: number = 0,
  simId?: string,
  mode: 'simulated' | 'live' = 'simulated'
): Promise<RiskGridCollection> {
  let url = `${API_BASE_URL}/api/v1/risk-scores/simulate?rainfall=${rainfall}&mode=${mode}`;
  if (simId) {
    url += `&sim_id=${encodeURIComponent(simId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch risk scores: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSimulatedFloodZones(rainfall: number = 0, simId?: string): Promise<FloodZoneCollection> {
  let url = `${API_BASE_URL}/api/v1/flood-zones/simulate?rainfall=${rainfall}`;
  if (simId) {
    url += `&sim_id=${encodeURIComponent(simId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch flood zones: ${res.statusText}`);
  }
  return res.json();
}

const OFFICER_SESSION_HEADERS = {
  'Content-Type': 'application/json',
  'X-Officer-Session': process.env.NEXT_PUBLIC_OFFICER_SESSION_KEY || 'surakshagrid-officer-active-session',
};

export async function triggerOptimizeDispatch(simId?: string): Promise<DispatchAssignment[]> {
  const res = await fetch('/api/officer-action', {
    method: 'POST',
    headers: OFFICER_SESSION_HEADERS,
    body: JSON.stringify({ action: 'optimize', sim_id: simId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to trigger dispatch: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchReplayEvents(since?: string, simId?: string): Promise<EventLog[]> {
  const params = new URLSearchParams();
  if (since) params.append('since', since);
  if (simId) params.append('sim_id', simId);
  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`${API_BASE_URL}/api/v1/replay${query}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch replay events: ${res.statusText}`);
  }
  return res.json();
}

// Note: Must stay in sync with backend POST /api/v1/sos multipart form fields (latitude, longitude, severity, voice_transcript, image, sim_id)
export async function createSOSReport(data: {
  latitude: number;
  longitude: number;
  severity: string;
  voice_transcript?: string;
  image?: Blob | File;
  sim_id?: string;
}): Promise<SOSReport> {
  const formData = new FormData();
  formData.append('latitude', data.latitude.toString());
  formData.append('longitude', data.longitude.toString());
  formData.append('severity', data.severity);
  if (data.voice_transcript) {
    formData.append('voice_transcript', data.voice_transcript);
  }
  if (data.sim_id) {
    formData.append('sim_id', data.sim_id);
  }
  if (data.image) {
    if (data.image instanceof File) {
      formData.append('image', data.image);
    } else {
      formData.append('image', data.image, 'standing_water.jpg');
    }
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/sos`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to create SOS report: ${res.statusText}`);
  }
  return res.json();
}

export async function triggerSimulationScenario(): Promise<{
  status: string;
  sim_id?: string;
  seeded_units: number;
  seeded_reports?: number;
  message?: string;
}> {
  const res = await fetch('/api/officer-action', {
    method: 'POST',
    headers: OFFICER_SESSION_HEADERS,
    body: JSON.stringify({ action: 'trigger' }),
  });
  if (!res.ok) {
    throw new Error(`Failed to trigger simulation scenario: ${res.statusText}`);
  }
  return res.json();
}

export async function resetSimulationScenario(simId?: string): Promise<{
  status: string;
  message: string;
}> {
  const res = await fetch('/api/officer-action', {
    method: 'POST',
    headers: OFFICER_SESSION_HEADERS,
    body: JSON.stringify({ action: 'reset', sim_id: simId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to reset simulation scenario: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchLiveAnalyticsStats(simId?: string): Promise<LiveAnalyticsStats> {
  let url = `${API_BASE_URL}/api/v1/analytics/live-stats`;
  if (simId) {
    url += `?sim_id=${encodeURIComponent(simId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch live analytics stats: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchNearbySOSReports(
  latitude: number,
  longitude: number,
  radiusMeters: number = 5000,
  simId?: string
): Promise<SOSReport[]> {
  let url = `${API_BASE_URL}/api/v1/sos/nearby?latitude=${latitude}&longitude=${longitude}&radius_meters=${radiusMeters}`;
  if (simId) {
    url += `&sim_id=${encodeURIComponent(simId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch nearby SOS reports: ${res.statusText}`);
  }
  return res.json();
}
