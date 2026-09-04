import { DispatchAssignment, EventLog, LiveAnalyticsStats, RiskGridCollection, SOSReport } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export async function fetchSimulatedRiskScores(rainfall: number = 0): Promise<RiskGridCollection> {
  const res = await fetch(`${API_BASE_URL}/api/v1/risk-scores/simulate?rainfall=${rainfall}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch risk scores: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSimulatedFloodZones(rainfall: number = 0): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/flood-zones/simulate?rainfall=${rainfall}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch flood zones: ${res.statusText}`);
  }
  return res.json();
}

const OFFICER_SESSION_HEADERS = {
  'Content-Type': 'application/json',
  'X-Officer-Session': process.env.NEXT_PUBLIC_OFFICER_SESSION_KEY || 'surakshagrid-officer-active-session',
};

export async function triggerOptimizeDispatch(): Promise<DispatchAssignment[]> {
  const res = await fetch('/api/officer-action', {
    method: 'POST',
    headers: OFFICER_SESSION_HEADERS,
    body: JSON.stringify({ action: 'optimize' }),
  });
  if (!res.ok) {
    throw new Error(`Failed to trigger dispatch: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchReplayEvents(since?: string): Promise<EventLog[]> {
  const url = since
    ? `${API_BASE_URL}/api/v1/replay?since=${encodeURIComponent(since)}`
    : `${API_BASE_URL}/api/v1/replay`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch replay events: ${res.statusText}`);
  }
  return res.json();
}

// Note: Must stay in sync with backend POST /api/v1/sos multipart form fields (latitude, longitude, severity, voice_transcript, image)
export async function createSOSReport(data: {
  latitude: number;
  longitude: number;
  severity: string;
  voice_transcript?: string;
  image?: Blob | File;
}): Promise<SOSReport> {
  const formData = new FormData();
  formData.append('latitude', data.latitude.toString());
  formData.append('longitude', data.longitude.toString());
  formData.append('severity', data.severity);
  if (data.voice_transcript) {
    formData.append('voice_transcript', data.voice_transcript);
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

export async function resetSimulationScenario(): Promise<{
  status: string;
  message: string;
}> {
  const res = await fetch('/api/officer-action', {
    method: 'POST',
    headers: OFFICER_SESSION_HEADERS,
    body: JSON.stringify({ action: 'reset' }),
  });
  if (!res.ok) {
    throw new Error(`Failed to reset simulation scenario: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchLiveAnalyticsStats(): Promise<LiveAnalyticsStats> {
  const res = await fetch(`${API_BASE_URL}/api/v1/analytics/live-stats`);
  if (!res.ok) {
    throw new Error(`Failed to fetch live analytics stats: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchNearbySOSReports(
  latitude: number,
  longitude: number,
  radiusMeters: number = 5000
): Promise<SOSReport[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/sos/nearby?latitude=${latitude}&longitude=${longitude}&radius_meters=${radiusMeters}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch nearby SOS reports: ${res.statusText}`);
  }
  return res.json();
}
