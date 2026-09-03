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

export interface EventLog {
  id: string;
  event_type: string;
  payload: Record<string, any>;
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
