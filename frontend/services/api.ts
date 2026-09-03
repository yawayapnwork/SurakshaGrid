import { DispatchAssignment, EventLog, LiveAnalyticsStats, RiskGridCollection, SOSReport } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

let inMemoryToken: string | null = null;

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined' && !inMemoryToken) {
    inMemoryToken = localStorage.getItem('surakshagrid_token');
  }
  return inMemoryToken;
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('surakshagrid_token', token);
    } else {
      localStorage.removeItem('surakshagrid_token');
    }
  }
}

export async function loginDemoOfficer(): Promise<string> {
  const username = process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin';
  const password = process.env.NEXT_PUBLIC_ADMIN_PASSWORD_PLAIN || 'SurakshaGrid2026!';

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      console.warn(`Demo officer login returned status ${res.status}`);
      return '';
    }

    const data = await res.json();
    const token = data.access_token;
    if (token) {
      setAuthToken(token);
      return token;
    }
  } catch (err) {
    console.error('Failed to authenticate demo officer:', err);
  }
  return '';
}

async function ensureAuthToken(): Promise<string> {
  let token = getAuthToken();
  if (!token) {
    token = await loginDemoOfficer();
  }
  return token;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = await ensureAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    token = await loginDemoOfficer();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      res = await fetch(url, { ...options, headers });
    }
  }

  return res;
}

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

export async function triggerOptimizeDispatch(): Promise<DispatchAssignment[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/dispatch/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function createSOSReport(data: {
  latitude: number;
  longitude: number;
  severity: string;
  voice_transcript?: string;
}): Promise<SOSReport> {
  const formData = new FormData();
  formData.append('latitude', data.latitude.toString());
  formData.append('longitude', data.longitude.toString());
  formData.append('severity', data.severity);
  if (data.voice_transcript) {
    formData.append('voice_transcript', data.voice_transcript);
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/sos`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Failed to create SOS report: ${res.statusText}`);
  }
  return res.json();
}

export async function triggerSimulationScenario(): Promise<{
  status: string;
  seeded_units: number;
  seeded_reports?: number;
  message?: string;
}> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/simulation/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/simulation/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
