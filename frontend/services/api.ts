import {
  DispatchAssignment,
  EventLog,
  FloodZoneCollection,
  LiveAnalyticsStats,
  PhotoVerificationResult,
  ReportTranslationResult,
  RiskGridCollection,
  SOSReport,
} from '@/types';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

export interface GridCenter {
  lat: number;
  lon: number;
}

// Every backend error response is clean JSON with a `detail` string (see app/main.py's
// global exception handler + each router's try/except); the /api/officer-action Next.js
// route instead uses `error` (see app/api/officer-action/route.ts). `res.statusText` is
// the last-resort fallback for a response the JSON parse can't read at all (e.g. a
// network-level failure surfaced as a non-JSON body).
async function throwApiError(res: Response, fallbackAction: string): Promise<never> {
  const errorData = await res.json().catch(() => ({}));
  throw new Error(errorData.detail || errorData.error || `${fallbackAction}: ${res.statusText || `HTTP ${res.status}`}`);
}

// Note: Must stay in sync with backend GET /api/v1/sos/active
export async function fetchActiveSOSReports(simId?: string): Promise<SOSReport[]> {
  let url = `${API_BASE_URL}/api/v1/sos/active`;
  if (simId) {
    url += `?sim_id=${encodeURIComponent(simId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) return throwApiError(res, 'Failed to fetch active SOS reports');
  return res.json();
}

export async function fetchSimulatedRiskScores(
  rainfall: number = 0,
  simId?: string,
  mode: 'simulated' | 'live' = 'simulated',
  center?: GridCenter
): Promise<RiskGridCollection> {
  let url = `${API_BASE_URL}/api/v1/risk-scores/simulate?rainfall=${rainfall}&mode=${mode}`;
  if (simId) {
    url += `&sim_id=${encodeURIComponent(simId)}`;
  }
  if (center) {
    url += `&center_lon=${center.lon}&center_lat=${center.lat}`;
  }
  const res = await fetch(url);
  if (!res.ok) return throwApiError(res, 'Failed to fetch risk scores');
  return res.json();
}

export async function fetchSimulatedFloodZones(
  rainfall: number = 0,
  simId?: string,
  center?: GridCenter
): Promise<FloodZoneCollection> {
  let url = `${API_BASE_URL}/api/v1/flood-zones/simulate?rainfall=${rainfall}`;
  if (simId) {
    url += `&sim_id=${encodeURIComponent(simId)}`;
  }
  if (center) {
    url += `&center_lon=${center.lon}&center_lat=${center.lat}`;
  }
  const res = await fetch(url);
  if (!res.ok) return throwApiError(res, 'Failed to fetch flood zones');
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
  if (!res.ok) return throwApiError(res, 'Failed to trigger dispatch');
  return res.json();
}

export async function fetchReplayEvents(since?: string, simId?: string): Promise<EventLog[]> {
  const params = new URLSearchParams();
  if (since) params.append('since', since);
  if (simId) params.append('sim_id', simId);
  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`${API_BASE_URL}/api/v1/replay${query}`);
  if (!res.ok) return throwApiError(res, 'Failed to fetch replay events');
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
  if (!res.ok) return throwApiError(res, 'Failed to create SOS report');
  return res.json();
}

// Note: Must stay in sync with backend POST /api/transcribe-audio (multipart field "audio")
export async function transcribeVoiceSOS(audioBlob: Blob): Promise<{
  text: string;
  detected_language: string | null;
  duration_seconds: number | null;
}> {
  const formData = new FormData();
  const extension = audioBlob.type.includes('webm') ? 'webm' : audioBlob.type.includes('mp3') ? 'mp3' : 'wav';
  formData.append('audio', audioBlob, `sos_voice.${extension}`);

  const res = await fetch(`${API_BASE_URL}/api/transcribe-audio`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) return throwApiError(res, 'Failed to transcribe audio');
  return res.json();
}

// Note: Must stay in sync with backend POST /api/verify-photo (multipart field "image")
export async function verifyPhoto(image: Blob | File): Promise<PhotoVerificationResult> {
  const formData = new FormData();
  if (image instanceof File) {
    formData.append('image', image);
  } else {
    const extension = image.type.includes('png') ? 'png' : image.type.includes('webp') ? 'webp' : 'jpg';
    formData.append('image', image, `evidence.${extension}`);
  }

  const res = await fetch(`${API_BASE_URL}/api/verify-photo`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) return throwApiError(res, 'Failed to verify photo');
  return res.json();
}

// Note: Must stay in sync with backend POST /api/translate-report (JSON body: text, source_lang, target_lang)
export async function translateReportText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<ReportTranslationResult> {
  const res = await fetch(`${API_BASE_URL}/api/translate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
  });
  if (!res.ok) return throwApiError(res, 'Failed to translate report text');
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
  if (!res.ok) return throwApiError(res, 'Failed to trigger simulation scenario');
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
  if (!res.ok) return throwApiError(res, 'Failed to reset simulation scenario');
  return res.json();
}

export async function fetchLiveAnalyticsStats(simId?: string): Promise<LiveAnalyticsStats> {
  let url = `${API_BASE_URL}/api/v1/analytics/live-stats`;
  if (simId) {
    url += `?sim_id=${encodeURIComponent(simId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) return throwApiError(res, 'Failed to fetch live analytics stats');
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
  if (!res.ok) return throwApiError(res, 'Failed to fetch nearby SOS reports');
  return res.json();
}
