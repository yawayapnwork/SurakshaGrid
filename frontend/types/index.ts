import type { Geometry } from 'geojson';

export type SOSSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL_TRAPPED';
export type SOSStatus = 'PENDING' | 'ASSIGNED' | 'RESOLVED';
export type RescueUnitType = 'BOAT' | 'AMBULANCE' | 'DRONE';
export type RescueUnitStatus = 'AVAILABLE' | 'DISPATCHED' | 'MAINTENANCE';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface SOSReport {
  id: string;
  location: GeoPoint;
  status: SOSStatus;
  severity: SOSSeverity;
  photo_url?: string | null;
  visual_confidence_score?: number | null;
  trust_score: number;
  voice_transcript?: string | null;
  created_at: string;
}

export interface RescueUnit {
  id: string;
  name: string;
  unit_type: RescueUnitType;
  current_location: GeoPoint;
  status: RescueUnitStatus;
}

export interface DispatchAssignment {
  sos_id: string;
  rescue_unit_id: string;
  unit_name: string;
  eta_seconds: number;
  cost: number;
  assigned_at: string;
}

export interface RiskBreakdown {
  rainfall_impact: number;
  flood_proximity: number;
  elevation_drop: number;
  report_density: number;
}

export interface RiskFeatureProperties {
  risk_score: number;
  breakdown: RiskBreakdown;
  zone_id?: string | null;
  zone_name?: string | null;
}

export interface RiskGridFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
  properties: RiskFeatureProperties;
}

export interface RiskGridCollection {
  type: 'FeatureCollection';
  features: RiskGridFeature[];
}

export interface FloodZoneFeature {
  type: 'Feature';
  geometry: Geometry;
  properties: {
    rainfall: number;
    sim_id?: string | null;
    zone_id?: string | null;
  };
}

export interface FloodZoneCollection {
  type: 'FeatureCollection';
  features: FloodZoneFeature[];
}

/** Heterogeneous shape of backend event-log/WebSocket payloads. Each event
 * type (SOS_CREATED, UNIT_DISPATCHED, ZONE_EXPANDED, ...) only populates a
 * subset of these fields — consumers read the ones relevant to the event. */
export interface EventPayload {
  sos_id?: string;
  rescue_unit_id?: string;
  unit_name?: string;
  eta_seconds?: number;
  cost?: number;
  assigned_at?: string;
  latitude?: number;
  longitude?: number;
  location?: GeoPoint;
  status?: SOSStatus;
  severity?: SOSSeverity;
  photo_url?: string;
  visual_confidence_score?: number;
  trust_score?: number;
  voice_transcript?: string;
  created_at?: string;
  rainfall_intensity?: number;
  raw_mm?: number;
  source?: string;
  timestamp?: string;
  geometry?: FloodZoneFeature['geometry'];
  sim_id?: string;
  zone_id?: string;
  message?: string;
}

export interface EventLog {
  id: string;
  event_type: string;
  payload: EventPayload;
  occurred_at: string;
}

export interface LiveAnalyticsStats {
  monitored_area_km2: number;
  total_sos_logged: number;
  total_sos_confirmed: number;
  total_sos_resolved: number;
  active_sos_count: number;
  critical_sos_count: number;
  dispatched_units_count: number;
  available_units_count: number;
  total_units_count: number;
  avg_eta_minutes: number;
}

export interface PhotoVerificationResult {
  verified: boolean;
  confidence: number;
  summary: string;
}

export interface ReportTranslationResult {
  translated_text: string;
  source_lang: string;
  target_lang: string;
}

export interface LiveRainfallReading {
  id: string;
  timestamp: string;
  rainfall_intensity: number;
  raw_mm: number;
  source: string;
  latitude: number | null;
  longitude: number | null;
}

export type SMSAlertPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SMSAlertRecipientResult {
  to: string;
  sent: boolean;
  error: string | null;
}

export interface SMSAlertResponse {
  priority: SMSAlertPriority;
  total: number;
  sent_count: number;
  failed_count: number;
  results: SMSAlertRecipientResult[];
}

export interface RouteStep {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
  maneuver_type: string;
  maneuver_modifier: string | null;
  road_name: string | null;
}

export interface DispatchRoute {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  distance_meters: number;
  duration_seconds: number;
  steps: RouteStep[];
}
