'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Activity,
  AlertTriangle,
  Building2,
  ChevronDown,
  Compass,
  Droplets,
  Gauge,
  Layers,
  MapPin,
  Navigation,
  Radio,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  Wind,
} from 'lucide-react';
import {
  DispatchAssignment,
  FloodZoneCollection,
  RescueUnit,
  RiskBreakdown,
  RiskFeatureProperties,
  RiskGridCollection,
  SOSReport,
} from '@/types';
import { ScientificTelemetryPayload } from '@/components/ScientificTelemetryMetrics';

export interface CityPreset {
  id: string;
  name: string;
  state: string;
  coordinates: [number, number]; // [lon, lat]
  zoom: number;
}

export interface GaugingStation {
  id: string;
  name: string;
  type: string;
  location: [number, number]; // [lon, lat]
  waterLevel: string;
  dangerLevel: string;
  dischargeRate: string;
  trend: string;
  flowStatus: 'NORMAL' | 'WARNING' | 'HIGH' | 'CRITICAL';
  sparklineData: number[];
}

export const CITY_PRESETS: CityPreset[] = [
  { id: 'delhi', name: 'Delhi / NCR', state: 'Delhi', coordinates: [77.2090, 28.6139], zoom: 11.8 },
  { id: 'chennai', name: 'Chennai', state: 'Tamil Nadu', coordinates: [80.25, 13.05], zoom: 12 },
  { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', coordinates: [72.8777, 19.0760], zoom: 12 },
  { id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', coordinates: [77.5946, 12.9716], zoom: 12 },
  { id: 'kolkata', name: 'Kolkata', state: 'West Bengal', coordinates: [88.3639, 22.5726], zoom: 12 },
  { id: 'kochi', name: 'Kochi', state: 'Kerala', coordinates: [76.2711, 9.9312], zoom: 12 },
  { id: 'guwahati', name: 'Guwahati', state: 'Assam', coordinates: [91.7362, 26.1445], zoom: 12 },
];

export const GAUGING_STATIONS: Record<string, GaugingStation[]> = {
  delhi: [
    {
      id: 'hathnikund',
      name: 'Hathnikund Barrage',
      type: 'Upstream Discharge Dam',
      location: [77.35, 29.02],
      waterLevel: '208.66 m',
      dangerLevel: '205.33 m',
      dischargeRate: '3.52 Lakh Cusecs',
      trend: '+0.22 m/h',
      flowStatus: 'CRITICAL',
      sparklineData: [206.1, 206.8, 207.4, 208.1, 208.66],
    },
    {
      id: 'loha_pul',
      name: 'Old Railway Bridge (Yamuna)',
      type: 'Central Gauging Point',
      location: [77.245, 28.662],
      waterLevel: '206.25 m',
      dangerLevel: '205.33 m',
      dischargeRate: '1.85 Lakh Cusecs',
      trend: '+0.12 m/h',
      flowStatus: 'HIGH',
      sparklineData: [204.8, 205.2, 205.7, 206.0, 206.25],
    },
    {
      id: 'okhla_barrage',
      name: 'Delhi Okhla Gauging Point',
      type: 'Sluice Outlet & Lock',
      location: [77.306, 28.545],
      waterLevel: '200.40 m',
      dangerLevel: '199.50 m',
      dischargeRate: '95,000 Cusecs',
      trend: '+0.08 m/h',
      flowStatus: 'WARNING',
      sparklineData: [199.1, 199.4, 199.8, 200.1, 200.40],
    },
  ],
  chennai: [
    {
      id: 'chembarambakkam',
      name: 'Chembarambakkam Reservoir',
      type: 'Primary Catchment Sluice',
      location: [80.062, 13.011],
      waterLevel: '22.40 m',
      dangerLevel: '24.00 m',
      dischargeRate: '4,500 Cusecs',
      trend: '+0.35 m/h',
      flowStatus: 'CRITICAL',
      sparklineData: [20.1, 21.0, 21.8, 22.1, 22.40],
    },
    {
      id: 'saidapet_bridge',
      name: 'Adyar River (Saidapet)',
      type: 'Hydro Gauging Station',
      location: [80.224, 13.023],
      waterLevel: '5.85 m',
      dangerLevel: '5.00 m',
      dischargeRate: '12,200 Cusecs',
      trend: '+0.18 m/h',
      flowStatus: 'HIGH',
      sparklineData: [4.2, 4.8, 5.2, 5.6, 5.85],
    },
    {
      id: 'poondi_reservoir',
      name: 'Poondi Reservoir Spillway',
      type: 'Reservoir Sluice Gate',
      location: [79.860, 13.185],
      waterLevel: '33.20 m',
      dangerLevel: '35.00 m',
      dischargeRate: '2,800 Cusecs',
      trend: '+0.10 m/h',
      flowStatus: 'WARNING',
      sparklineData: [31.5, 32.0, 32.5, 32.9, 33.20],
    },
  ],
  mumbai: [
    {
      id: 'mithi_river',
      name: 'Mithi River (Kranti Nagar)',
      type: 'Urban Drainage Outfall',
      location: [72.885, 19.082],
      waterLevel: '4.10 m',
      dangerLevel: '3.50 m',
      dischargeRate: 'Overflow Active',
      trend: '+0.25 m/h',
      flowStatus: 'CRITICAL',
      sparklineData: [3.1, 3.4, 3.7, 3.9, 4.10],
    },
    {
      id: 'vaitarna_dam',
      name: 'Vaitarna Reservoir Spillway',
      type: 'Upstream Reservoir Barrage',
      location: [73.280, 19.680],
      waterLevel: '533.80 m',
      dangerLevel: '538.40 m',
      dischargeRate: '15,000 Cusecs',
      trend: '+0.05 m/h',
      flowStatus: 'NORMAL',
      sparklineData: [532.5, 532.9, 533.2, 533.5, 533.8],
    },
  ],
  kolkata: [
    {
      id: 'hooghly_lock',
      name: 'Hooghly Tidal Lock (Howrah)',
      type: 'Tidal Storm Surge Sluice',
      location: [88.345, 22.585],
      waterLevel: '5.20 m',
      dangerLevel: '4.80 m',
      dischargeRate: 'High Tide Alert',
      trend: '+0.30 m/h',
      flowStatus: 'HIGH',
      sparklineData: [4.1, 4.4, 4.7, 5.0, 5.20],
    },
    {
      id: 'garden_reach',
      name: 'Garden Reach Gauging Station',
      type: 'Estuary Hydro Station',
      location: [88.302, 22.541],
      waterLevel: '4.65 m',
      dangerLevel: '4.50 m',
      dischargeRate: '85,000 Cusecs',
      trend: '+0.15 m/h',
      flowStatus: 'WARNING',
      sparklineData: [3.9, 4.1, 4.3, 4.5, 4.65],
    },
  ],
  bengaluru: [
    {
      id: 'bellandur_outlet',
      name: 'Bellandur Outlet Sluice',
      type: 'Watershed Overflow Channel',
      location: [77.665, 12.935],
      waterLevel: '882.40 m',
      dangerLevel: '881.50 m',
      dischargeRate: 'Overflow Active',
      trend: '+0.14 m/h',
      flowStatus: 'HIGH',
      sparklineData: [880.8, 881.2, 881.7, 882.0, 882.4],
    },
  ],
  kochi: [
    {
      id: 'periyar_aluva',
      name: 'Periyar River (Aluva Gauge)',
      type: 'River Basin Gauging Point',
      location: [76.350, 10.108],
      waterLevel: '6.40 m',
      dangerLevel: '5.80 m',
      dischargeRate: '3,800 m³/s',
      trend: '+0.20 m/h',
      flowStatus: 'HIGH',
      sparklineData: [5.2, 5.5, 5.8, 6.1, 6.40],
    },
  ],
  guwahati: [
    {
      id: 'brahmaputra_gauge',
      name: 'Brahmaputra Riverside Gauge',
      type: 'Major River Barrage',
      location: [91.750, 26.190],
      waterLevel: '49.85 m',
      dangerLevel: '49.68 m',
      dischargeRate: 'Extreme Discharge',
      trend: '+0.28 m/h',
      flowStatus: 'CRITICAL',
      sparklineData: [48.9, 49.2, 49.5, 49.7, 49.85],
    },
  ],
};

interface MapContainerProps {
  riskGrid: RiskGridCollection | null;
  floodZones?: FloodZoneCollection | null;
  sosReports: SOSReport[];
  rescueUnits: RescueUnit[];
  dispatchAssignments: DispatchAssignment[];
  onSelectRiskCell: (props: RiskFeatureProperties) => void;
  onLocationResolved?: (location: { lat: number; lon: number }) => void;
  activeRouteGeometry?: { type: 'LineString'; coordinates: [number, number][] } | null;
  animatedUnitPosition?: [number, number] | null;
  animatedUnitBearing?: number;
  telemetry?: ScientificTelemetryPayload | null;
  selectedCityId?: string;
  onCityChange?: (cityId: string) => void;
}

function renderSparklineSvg(data: number[], color: string = '#38bdf8') {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 130;
  const height = 26;
  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="overflow-visible">
      <polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
      ${data
        .map((val, i) => {
          const x = (i / (data.length - 1)) * width;
          const y = height - ((val - min) / range) * (height - 6) - 3;
          const isLast = i === data.length - 1;
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isLast ? '3.5' : '2'}" fill="${isLast ? color : '#0f172a'}" stroke="${color}" stroke-width="1.5"/>`;
        })
        .join('')}
    </svg>
  `;
}

function generateRadarPrecipitationGeoJSON(center: [number, number], intensity: number) {
  const [lon, lat] = center;
  const numPoints = 36;

  const bands = [
    { r: 0.03, mm: Math.round(intensity * 1.8), bandName: 'core_purple' },
    { r: 0.055, mm: Math.round(intensity * 1.4), bandName: 'inner_red' },
    { r: 0.085, mm: Math.round(intensity * 1.0), bandName: 'mid_orange' },
    { r: 0.12, mm: Math.round(intensity * 0.6), bandName: 'outer_yellow' },
    { r: 0.16, mm: Math.round(intensity * 0.25), bandName: 'fringe_green' },
  ];

  const features = bands.map((b) => {
    const coords: [number, number][] = [];
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const wobble = 1 + 0.14 * Math.sin(angle * 3) + 0.07 * Math.cos(angle * 5);
      const r = b.r * wobble;
      const dx = r * Math.cos(angle) * 1.35;
      const dy = r * Math.sin(angle);
      coords.push([lon + dx, lat + dy]);
    }
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [coords],
      },
      properties: {
        rainfall_mm: Math.max(5, b.mm),
        band: b.bandName,
      },
    };
  });

  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

function generateSoilMoistureGeoJSON(center: [number, number], saturationPercent: number) {
  const [lon, lat] = center;
  const numPoints = 32;

  const createRing = (radius: number) => {
    const coords: [number, number][] = [];
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const dx = radius * Math.cos(angle) * 1.3;
      const dy = radius * Math.sin(angle);
      coords.push([lon + dx, lat + dy]);
    }
    return coords;
  };

  const ringCore = createRing(0.04);
  const ringOuter = createRing(0.08);

  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [ringCore],
        },
        properties: {
          ring: 'core',
          saturationPercent,
        },
      },
      {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [ringOuter],
        },
        properties: {
          ring: 'outer',
          saturationPercent: Math.max(0, saturationPercent - 15),
        },
      },
    ],
  };
}

export const MapContainer: React.FC<MapContainerProps> = ({
  riskGrid,
  floodZones,
  sosReports,
  rescueUnits,
  dispatchAssignments,
  onSelectRiskCell,
  onLocationResolved,
  activeRouteGeometry,
  animatedUnitPosition,
  animatedUnitBearing = 0,
  telemetry,
  selectedCityId: controlledCityId,
  onCityChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const windMarkersRef = useRef<maplibregl.Marker[]>([]);
  const stationMarkersRef = useRef<maplibregl.Marker[]>([]);
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const animatedUnitMarkerRef = useRef<maplibregl.Marker | null>(null);
  const isUserSelectedRegionRef = useRef<boolean>(false);

  // City & Layer State
  const [internalCityId, setInternalCityId] = useState<string>('delhi');
  const selectedCityId = controlledCityId || internalCityId;

  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState<boolean>(false);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState<boolean>(false);

  const [layersVisible, setLayersVisible] = useState({
    radarSweep: true,
    riskGrid: true,
    floodZones: true,
    gaugingStations: true,
    windVectors: true,
    soilMoisture: true,
    sosReports: true,
    rescueUnits: true,
    dispatchRoutes: true,
  });

  const onSelectRiskCellRef = useRef(onSelectRiskCell);
  onSelectRiskCellRef.current = onSelectRiskCell;
  const onLocationResolvedRef = useRef(onLocationResolved);
  onLocationResolvedRef.current = onLocationResolved;

  const selectedCity = CITY_PRESETS.find((c) => c.id === selectedCityId) || CITY_PRESETS[0];

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: selectedCity.coordinates,
      zoom: selectedCity.zoom,
      pitch: 30,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      // 0. Precipitation Radar Source & Layer (Green -> Yellow -> Orange -> Red -> Purple)
      map.addSource('radar-precipitation-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'radar-precipitation-fill',
        type: 'fill',
        source: 'radar-precipitation-source',
        layout: { visibility: layersVisible.radarSweep ? 'visible' : 'none' },
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'rainfall_mm'],
            0, 'rgba(34, 197, 94, 0.20)',   // Green
            25, 'rgba(234, 179, 8, 0.35)',  // Yellow
            50, 'rgba(249, 115, 22, 0.50)', // Orange
            100, 'rgba(239, 68, 68, 0.65)', // Red
            150, 'rgba(168, 85, 247, 0.80)' // Purple
          ],
          'fill-outline-color': 'rgba(255, 255, 255, 0.15)',
        },
      });

      // Flood Zone Source & Layer
      map.addSource('flood-zone-source', {
        type: 'geojson',
        data: floodZones || { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'flood-zone-fill',
        type: 'fill',
        source: 'flood-zone-source',
        layout: { visibility: layersVisible.floodZones ? 'visible' : 'none' },
        paint: {
          'fill-color': [
            'match',
            ['get', 'band'],
            'light',
            '#38bdf8',
            'heavy',
            '#0ea5e9',
            'core',
            '#0284c7',
            '#0ea5e9',
          ],
          'fill-opacity': ['coalesce', ['get', 'opacity'], 0.4],
          'fill-outline-color': 'transparent',
        },
      });

      // Soil Moisture Saturation Source & Layer
      map.addSource('soil-moisture-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'soil-moisture-fill',
        type: 'fill',
        source: 'soil-moisture-source',
        layout: { visibility: layersVisible.soilMoisture ? 'visible' : 'none' },
        paint: {
          'fill-color': [
            'match',
            ['get', 'ring'],
            'core',
            'rgba(239, 68, 68, 0.40)',
            'outer',
            'rgba(249, 115, 22, 0.30)',
            'rgba(234, 179, 8, 0.25)',
          ],
          'fill-outline-color': 'rgba(255, 255, 255, 0.2)',
        },
      });

      // 1. Risk Grid Source & Layers
      map.addSource('risk-grid-source', {
        type: 'geojson',
        data: riskGrid || { type: 'FeatureCollection', features: [] },
        promoteId: 'zone_id',
      });

      map.addLayer({
        id: 'risk-grid-fill',
        type: 'fill',
        source: 'risk-grid-source',
        layout: { visibility: layersVisible.riskGrid ? 'visible' : 'none' },
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'risk_score'],
            0.0,
            'rgba(16, 185, 129, 0.25)',
            0.35,
            'rgba(245, 158, 11, 0.45)',
            0.65,
            'rgba(249, 115, 22, 0.60)',
            0.85,
            'rgba(239, 68, 68, 0.75)',
          ],
          'fill-color-transition': { duration: 400, delay: 0 },
          'fill-outline-color': 'rgba(255, 255, 255, 0.4)',
        },
      });

      map.addLayer({
        id: 'risk-grid-outline',
        type: 'line',
        source: 'risk-grid-source',
        layout: { visibility: layersVisible.riskGrid ? 'visible' : 'none' },
        paint: {
          'line-color': '#0f172a',
          'line-width': 1.5,
          'line-opacity': 0.6,
        },
      });

      // 2. Dispatch Routes Source & Layer
      map.addSource('dispatch-routes-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'dispatch-routes-layer',
        type: 'line',
        source: 'dispatch-routes-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: layersVisible.dispatchRoutes ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#0f172a',
          'line-width': 3,
          'line-dasharray': [1, 1.5],
          'line-opacity': 0.9,
        },
      });

      // Active Route Highlight Source & Layers
      map.addSource('active-route-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'active-route-casing',
        type: 'line',
        source: 'active-route-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: layersVisible.dispatchRoutes ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#1e40af',
          'line-width': 10,
          'line-opacity': 0.5,
          'line-blur': 3,
        },
      });

      map.addLayer({
        id: 'active-route-line',
        type: 'line',
        source: 'active-route-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: layersVisible.dispatchRoutes ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#38bdf8',
          'line-width': 5,
          'line-opacity': 1.0,
        },
      });

      // 3. Risk Grid Polygon Click Listener
      map.on('click', 'risk-grid-fill', (e: maplibregl.MapLayerMouseEvent) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties as Record<string, unknown> | null;
          if (props) {
            let breakdown: RiskBreakdown | undefined;
            const rawBreakdown = props.breakdown;
            if (typeof rawBreakdown === 'string') {
              try {
                breakdown = JSON.parse(rawBreakdown);
              } catch (err) {
                console.error('Failed to parse breakdown JSON:', err);
              }
            } else if (rawBreakdown && typeof rawBreakdown === 'object') {
              breakdown = rawBreakdown as RiskBreakdown;
            }
            onSelectRiskCellRef.current({
              risk_score: Number(props.risk_score),
              breakdown: breakdown || {
                rainfall_impact: 0.5,
                flood_proximity: 0.5,
                elevation_drop: 0.5,
                report_density: 0.5,
              },
            });
          }
        }
      });

      map.on('mouseenter', 'risk-grid-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'risk-grid-fill', () => {
        map.getCanvas().style.cursor = '';
      });
    });

    mapRef.current = map;

    // Geolocation Lookup (Guarded against overwriting active city selections)
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (isUserSelectedRegionRef.current) return;
          const { longitude, latitude } = position.coords;
          const el = document.createElement('div');
          el.className = 'relative flex items-center justify-center';
          el.innerHTML = `
            <div class="absolute w-6 h-6 rounded-full bg-blue-500 animate-ping opacity-40"></div>
            <div class="relative w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
          `;
          userLocationMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([longitude, latitude])
            .addTo(map);

          onLocationResolvedRef.current?.({ lat: latitude, lon: longitude });
        },
        (err) => {
          console.warn('Geolocation unavailable:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }

    return () => {
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
      animatedUnitMarkerRef.current?.remove();
      animatedUnitMarkerRef.current = null;
      windMarkersRef.current.forEach((m) => m.remove());
      windMarkersRef.current = [];
      stationMarkersRef.current.forEach((m) => m.remove());
      stationMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Hot-swap Precipitation Radar Layer Data
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('radar-precipitation-source') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!layersVisible.radarSweep || !telemetry) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const city = CITY_PRESETS.find((c) => c.id === selectedCityId) || CITY_PRESETS[0];
    const geojson = generateRadarPrecipitationGeoJSON(city.coordinates, telemetry.rainfall.currentRateMmHr);
    source.setData(geojson);
  }, [telemetry, selectedCityId, layersVisible.radarSweep]);

  // Hot-swap Risk Grid
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('risk-grid-source') as maplibregl.GeoJSONSource;
    if (source && riskGrid) {
      source.setData(riskGrid);
    }
  }, [riskGrid]);

  // Hot-swap Flood Zones
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('flood-zone-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(floodZones || { type: 'FeatureCollection', features: [] });
    }
  }, [floodZones]);

  // Hot-swap Soil Moisture Layer
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('soil-moisture-source') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!layersVisible.soilMoisture || !telemetry) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const city = CITY_PRESETS.find((c) => c.id === selectedCityId) || CITY_PRESETS[0];
    const saturation = telemetry.soil.soilSaturationPercent;
    const geojson = generateSoilMoistureGeoJSON(city.coordinates, saturation);
    source.setData(geojson);
  }, [telemetry, selectedCityId, layersVisible.soilMoisture]);

  // Render Hydrological Gauging Station & Barrage Markers with Rich SVG Sparklines
  useEffect(() => {
    if (!mapRef.current) return;

    stationMarkersRef.current.forEach((m) => m.remove());
    stationMarkersRef.current = [];

    if (!layersVisible.gaugingStations) return;

    const stations = GAUGING_STATIONS[selectedCityId] || GAUGING_STATIONS['delhi'];

    stations.forEach((st) => {
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center cursor-pointer group pointer-events-auto z-10';

      let statusColor = 'bg-emerald-500 border-emerald-300';
      let badgeBg = 'bg-emerald-600';
      let isSevere = false;

      if (st.flowStatus === 'CRITICAL') {
        statusColor = 'bg-red-600 border-white';
        badgeBg = 'bg-red-600';
        isSevere = true;
      } else if (st.flowStatus === 'HIGH') {
        statusColor = 'bg-orange-500 border-white';
        badgeBg = 'bg-orange-600';
      } else if (st.flowStatus === 'WARNING') {
        statusColor = 'bg-amber-500 border-white';
        badgeBg = 'bg-amber-600';
      }

      el.innerHTML = `
        ${isSevere ? '<div class="absolute w-8 h-8 rounded-full bg-red-500 animate-ping opacity-45"></div>' : ''}
        <div class="relative flex items-center gap-1.5 px-2 py-1 rounded-full ${statusColor} text-white shadow-xl border backdrop-blur-md transition-transform group-hover:scale-105">
          <div class="w-3.5 h-3.5 rounded-full bg-slate-950/80 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M2 12h20"/>
            </svg>
          </div>
          <span class="text-[10px] font-mono font-bold tracking-tight">${st.name.split(' ')[0]} ${st.waterLevel}</span>
        </div>
      `;

      const sparklineHtml = renderSparklineSvg(
        st.sparklineData,
        st.flowStatus === 'CRITICAL' ? '#ef4444' : st.flowStatus === 'HIGH' ? '#f97316' : '#38bdf8'
      );

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(st.location)
        .setPopup(
          new maplibregl.Popup({ offset: 15, closeButton: true, className: 'suraksha-popup' }).setHTML(`
            <div class="p-3 text-slate-900 font-sans max-w-xs space-y-2">
              <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <div>
                  <h4 class="font-bold text-xs text-slate-900">${st.name}</h4>
                  <span class="text-[10px] text-slate-500">${st.type}</span>
                </div>
                <span class="text-[9px] font-mono font-bold uppercase text-white px-2 py-0.5 rounded-md ${badgeBg}">
                  ${st.flowStatus}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-1.5 text-[10.5px]">
                <div class="bg-slate-50 p-1.5 rounded border border-slate-100">
                  <span class="text-[9.5px] text-slate-500 block">Current Level</span>
                  <span class="font-mono font-bold text-slate-900 text-xs">${st.waterLevel}</span>
                </div>
                <div class="bg-slate-50 p-1.5 rounded border border-slate-100">
                  <span class="text-[9.5px] text-slate-500 block">Danger Mark</span>
                  <span class="font-mono font-bold text-red-600 text-xs">${st.dangerLevel}</span>
                </div>
                <div class="bg-slate-50 p-1.5 rounded border border-slate-100">
                  <span class="text-[9.5px] text-slate-500 block">Discharge Rate</span>
                  <span class="font-mono font-semibold text-slate-800">${st.dischargeRate}</span>
                </div>
                <div class="bg-slate-50 p-1.5 rounded border border-slate-100">
                  <span class="text-[9.5px] text-slate-500 block">Trend Rate</span>
                  <span class="font-mono font-semibold text-sky-600">${st.trend}</span>
                </div>
              </div>
              <div class="pt-1">
                <div class="flex items-center justify-between text-[9.5px] text-slate-400 font-mono mb-1">
                  <span>6H HYDRO LEVEL TREND</span>
                  <span>LIVE SENSOR</span>
                </div>
                <div class="bg-slate-950 p-2 rounded-lg flex items-center justify-center shadow-inner">
                  ${sparklineHtml}
                </div>
              </div>
            </div>
          `)
        )
        .addTo(mapRef.current!);

      stationMarkersRef.current.push(marker);
    });
  }, [selectedCityId, layersVisible.gaugingStations]);

  // Dynamic Airflow Vector Field Markers
  useEffect(() => {
    if (!mapRef.current) return;

    windMarkersRef.current.forEach((m) => m.remove());
    windMarkersRef.current = [];

    if (!layersVisible.windVectors || !telemetry) return;

    const city = CITY_PRESETS.find((c) => c.id === selectedCityId) || CITY_PRESETS[0];
    const [cLon, cLat] = city.coordinates;

    const gridOffsets = [
      [-0.04, -0.025],
      [0.0, -0.035],
      [0.04, -0.025],
      [-0.045, 0.015],
      [0.0, 0.025],
      [0.045, 0.015],
    ];

    gridOffsets.forEach(([dLon, dLat]) => {
      const el = document.createElement('div');
      el.className = 'relative flex flex-col items-center justify-center pointer-events-none group';
      el.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-slate-950/90 border border-sky-400/80 shadow-xl backdrop-blur-md flex items-center justify-center transition-transform duration-500" style="transform: rotate(${telemetry.wind.directionDegrees}deg)">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </div>
        <span class="mt-0.5 text-[8px] font-mono font-bold bg-slate-950/90 text-sky-300 px-1 py-0.2 rounded border border-sky-500/40 shadow-sm whitespace-nowrap">
          ${telemetry.wind.speedKmH}k/h ${telemetry.wind.heading}
        </span>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([cLon + dLon, cLat + dLat])
        .addTo(mapRef.current!);

      windMarkersRef.current.push(marker);
    });
  }, [telemetry, selectedCityId, layersVisible.windVectors]);

  // Update Dispatch Routes
  useEffect(() => {
    if (!mapRef.current) return;
    const routeSource = mapRef.current.getSource('dispatch-routes-source') as maplibregl.GeoJSONSource;
    if (!routeSource) return;

    if (!dispatchAssignments || dispatchAssignments.length === 0) {
      routeSource.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const routeFeatures = dispatchAssignments
      .map((assignment) => {
        const sos = sosReports.find((s) => s.id === assignment.sos_id);
        const unit = rescueUnits.find((u) => u.id === assignment.rescue_unit_id);

        if (sos && unit) {
          const uCoords = Array.isArray(unit.current_location)
            ? unit.current_location
            : unit.current_location?.coordinates;
          const sCoords = Array.isArray(sos.location)
            ? sos.location
            : sos.location?.coordinates;

          if (uCoords && sCoords && uCoords.length >= 2 && sCoords.length >= 2) {
            return {
              type: 'Feature' as const,
              geometry: {
                type: 'LineString' as const,
                coordinates: [uCoords, sCoords],
              },
              properties: {
                unit_name: assignment.unit_name,
                eta_seconds: assignment.eta_seconds,
                sos_id: assignment.sos_id,
                rescue_unit_id: assignment.rescue_unit_id,
              },
            };
          }
        }
        return null;
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    routeSource.setData({
      type: 'FeatureCollection',
      features: routeFeatures,
    });
  }, [dispatchAssignments, sosReports, rescueUnits]);

  // Hot-swap Active Route Polyline & Fit Camera
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('active-route-source') as maplibregl.GeoJSONSource;
    if (!source) return;

    source.setData(
      activeRouteGeometry
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: activeRouteGeometry, properties: {} }] }
        : { type: 'FeatureCollection', features: [] }
    );

    if (activeRouteGeometry && activeRouteGeometry.coordinates.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      activeRouteGeometry.coordinates.forEach((coord) => bounds.extend(coord));
      mapRef.current.fitBounds(bounds, {
        padding: { top: 90, bottom: 120, left: 90, right: 90 },
        duration: 1500,
        maxZoom: 16,
      });
    }
  }, [activeRouteGeometry]);

  // Animated Unit Position & Heading Rotation
  useEffect(() => {
    if (!mapRef.current) return;

    if (!animatedUnitPosition) {
      animatedUnitMarkerRef.current?.remove();
      animatedUnitMarkerRef.current = null;
      return;
    }

    if (!animatedUnitMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center';
      el.innerHTML = `
        <div class="absolute w-9 h-9 rounded-full bg-blue-500/40 animate-ping"></div>
        <div class="vehicle-icon-wrapper relative w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center transition-transform duration-200 ease-out" style="transform: rotate(${animatedUnitBearing}deg)">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 2 7 19-7-4-7 4 7-19z"/>
          </svg>
        </div>
      `;
      animatedUnitMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(animatedUnitPosition).addTo(mapRef.current);
    } else {
      animatedUnitMarkerRef.current.setLngLat(animatedUnitPosition);
      const iconEl = animatedUnitMarkerRef.current.getElement().querySelector('.vehicle-icon-wrapper') as HTMLElement | null;
      if (iconEl) {
        iconEl.style.transform = `rotate(${animatedUnitBearing}deg)`;
      }
    }
  }, [animatedUnitPosition, animatedUnitBearing]);

  // Render SOS & Rescue Unit Markers
  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const now = Date.now();

    // SOS Markers
    if (layersVisible.sosReports) {
      sosReports.forEach((report) => {
        const [lon, lat] = report.location.coordinates;
        const el = document.createElement('div');
        el.className = 'relative flex items-center justify-center cursor-pointer group';

        const createdAtMs = new Date(report.created_at).getTime();
        const elapsedMins = Math.max(0, (now - createdAtMs) / (1000 * 60));

        let bgColor = 'bg-amber-400';
        let isCritical = false;

        if (report.severity === 'CRITICAL_TRAPPED' || elapsedMins >= 5.0) {
          bgColor = 'bg-red-600';
          isCritical = true;
        } else if (elapsedMins >= 2.0 || report.severity === 'HIGH') {
          bgColor = 'bg-orange-500';
        }

        el.innerHTML = `
          ${isCritical ? '<div class="absolute w-7 h-7 rounded-full bg-red-500 animate-ping opacity-40"></div>' : ''}
          <div class="relative w-6 h-6 rounded-full ${bgColor} border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-md transition-transform group-hover:scale-110">
            !
          </div>
        `;

        const elapsedText = elapsedMins < 1 ? 'Just now' : `${elapsedMins.toFixed(1)}m ago`;

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lon, lat])
          .setPopup(
            new maplibregl.Popup({ offset: 15, closeButton: true, className: 'suraksha-popup' }).setHTML(`
              <div class="p-3 text-slate-900 font-sans max-w-xs">
                <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 mb-1.5">
                  <span class="font-bold text-xs flex items-center gap-1 ${isCritical ? 'text-red-600' : 'text-slate-900'}">
                    ${isCritical ? '⚠️' : '🚨'} ${report.severity}
                  </span>
                  <span class="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    ${elapsedText}
                  </span>
                </div>
                <div class="space-y-1 text-[11px] text-slate-600">
                  <div><strong class="text-slate-800">Status:</strong> <span class="uppercase tracking-wider font-semibold text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">${report.status}</span></div>
                  <div><strong class="text-slate-800">Trust Score:</strong> <span class="font-semibold text-emerald-700">${(report.trust_score * 100).toFixed(0)}%</span></div>
                </div>
                ${report.voice_transcript ? `<div class="text-[11px] bg-slate-50 border border-slate-200 p-2 rounded-lg mt-2 text-slate-700 italic">"${report.voice_transcript}"</div>` : ''}
              </div>
            `)
          )
          .addTo(mapRef.current!);

        markersRef.current.push(marker);
      });
    }

    // Rescue Unit Markers
    if (layersVisible.rescueUnits) {
      rescueUnits.forEach((unit) => {
        const [lon, lat] = unit.current_location.coordinates;
        const el = document.createElement('div');
        el.className = 'relative flex items-center justify-center cursor-pointer group';
        el.innerHTML = `
          <div class="w-7 h-7 rounded-lg bg-slate-900 border-2 border-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lon, lat])
          .setPopup(
            new maplibregl.Popup({ offset: 15, closeButton: true, className: 'suraksha-popup' }).setHTML(`
              <div class="p-3 text-slate-900 font-sans max-w-xs">
                <div class="font-bold text-xs text-slate-900 border-b border-slate-100 pb-1 mb-1.5">${unit.name}</div>
                <div class="space-y-1 text-[11px] text-slate-600">
                  <div><strong class="text-slate-800">Unit Type:</strong> <span class="font-semibold text-slate-700">${unit.unit_type}</span></div>
                  <div><strong class="text-slate-800">Status:</strong> <span class="font-semibold text-emerald-600 uppercase tracking-wider text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded">${unit.status}</span></div>
                  <div class="text-[10px] text-slate-400 font-mono pt-1">Location: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°</div>
                </div>
              </div>
            `)
          )
          .addTo(mapRef.current!);

        markersRef.current.push(marker);
      });
    }
  }, [sosReports, rescueUnits, layersVisible]);

  // Handle City Change Navigation
  const handleCityChange = (cityId: string) => {
    isUserSelectedRegionRef.current = true;
    setInternalCityId(cityId);
    onCityChange?.(cityId);
    setIsCityDropdownOpen(false);

    const city = CITY_PRESETS.find((c) => c.id === cityId);
    if (!city || !mapRef.current) return;

    mapRef.current.flyTo({
      center: city.coordinates,
      zoom: city.zoom,
      pitch: 30,
      duration: 1800,
      essential: true,
    });

    onLocationResolvedRef.current?.({ lat: city.coordinates[1], lon: city.coordinates[0] });
  };

  // Handle Layer Visibility Toggle
  const toggleLayer = (layerKey: keyof typeof layersVisible) => {
    setLayersVisible((prev) => {
      const nextState = { ...prev, [layerKey]: !prev[layerKey] };

      if (mapRef.current) {
        if (layerKey === 'radarSweep') {
          const vis = nextState.radarSweep ? 'visible' : 'none';
          if (mapRef.current.getLayer('radar-precipitation-fill')) mapRef.current.setLayoutProperty('radar-precipitation-fill', 'visibility', vis);
        } else if (layerKey === 'riskGrid') {
          const vis = nextState.riskGrid ? 'visible' : 'none';
          if (mapRef.current.getLayer('risk-grid-fill')) mapRef.current.setLayoutProperty('risk-grid-fill', 'visibility', vis);
          if (mapRef.current.getLayer('risk-grid-outline')) mapRef.current.setLayoutProperty('risk-grid-outline', 'visibility', vis);
        } else if (layerKey === 'floodZones') {
          const vis = nextState.floodZones ? 'visible' : 'none';
          if (mapRef.current.getLayer('flood-zone-fill')) mapRef.current.setLayoutProperty('flood-zone-fill', 'visibility', vis);
        } else if (layerKey === 'soilMoisture') {
          const vis = nextState.soilMoisture ? 'visible' : 'none';
          if (mapRef.current.getLayer('soil-moisture-fill')) mapRef.current.setLayoutProperty('soil-moisture-fill', 'visibility', vis);
        } else if (layerKey === 'dispatchRoutes') {
          const vis = nextState.dispatchRoutes ? 'visible' : 'none';
          if (mapRef.current.getLayer('dispatch-routes-layer')) mapRef.current.setLayoutProperty('dispatch-routes-layer', 'visibility', vis);
          if (mapRef.current.getLayer('active-route-casing')) mapRef.current.setLayoutProperty('active-route-casing', 'visibility', vis);
          if (mapRef.current.getLayer('active-route-line')) mapRef.current.setLayoutProperty('active-route-line', 'visibility', vis);
        }
      }

      return nextState;
    });
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-950 font-sans">
      {/* 1. TOP HEADER BANNER (Institutional EOC Meteorological Header) */}
      <div className="absolute top-0 left-0 right-0 z-20 h-11 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/90 px-3.5 flex items-center justify-between text-white shadow-2xl">
        {/* City Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-700/80 shadow-md transition-all text-xs font-bold"
          >
            <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate max-w-[120px] sm:max-w-none">{selectedCity.name}</span>
            <span className="text-[10px] font-normal text-slate-400 hidden sm:inline">({selectedCity.state})</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isCityDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isCityDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-56 rounded-xl bg-slate-950/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-1.5 z-40 space-y-0.5 text-xs">
              <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                Select Indian Metro Hub
              </div>
              {CITY_PRESETS.map((city) => (
                <button
                  key={city.id}
                  onClick={() => handleCityChange(city.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${
                    city.id === selectedCityId
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-200 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className={`w-3.5 h-3.5 ${city.id === selectedCityId ? 'text-white' : 'text-slate-400'}`} />
                    <span>{city.name}</span>
                  </div>
                  <span className={`text-[10px] ${city.id === selectedCityId ? 'text-blue-100' : 'text-slate-400'}`}>
                    {city.state}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* EOC Header Banner Title */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
            </span>
            <span className="font-mono text-xs font-extrabold tracking-wider text-slate-100">
              {selectedCity.name.toUpperCase()} ({selectedCity.state.toUpperCase()}) LIVE WEATHER & RIVER MONITOR
            </span>
          </div>
        </div>

        {/* Telemetry Status & Layer Toggle Button */}
        <div className="flex items-center gap-2">
          {telemetry && (
            <div className="hidden lg:flex items-center gap-2 text-[10.5px] font-mono text-slate-300 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
              <div className="flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-bold">RADAR LIVE</span>
              </div>
              <span className="text-slate-600">|</span>
              <span>{telemetry.rainfall.currentRateMmHr} mm/h</span>
              <span className="text-slate-600">|</span>
              <span className="text-sky-300 font-bold">{telemetry.rainfall.severity}</span>
            </div>
          )}

          <button
            onClick={() => setIsLayerPanelOpen(!isLayerPanelOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold backdrop-blur-md border shadow-md transition-all active:scale-95 ${
              isLayerPanelOpen
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700/80'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Layers</span>
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>

      {/* MapLibre Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full pt-11" />

      {/* 2. WIND FLOW INSET WIDGET (Top-Left Map Overlay) */}
      <div className="absolute top-14 left-3.5 z-10 w-64 rounded-xl bg-slate-950/90 border border-slate-800/90 backdrop-blur-xl p-3 shadow-2xl text-white pointer-events-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <Wind className="w-4 h-4 text-sky-400 animate-pulse" />
            <span className="text-xs font-bold font-mono tracking-wider text-slate-100">WIND FLOW</span>
          </div>
          <span className="text-[10px] font-mono text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/60">
            {telemetry?.wind.heading || 'SE'} VECTOR
          </span>
        </div>

        {/* Readout Text */}
        <div className="text-[11px] font-sans text-slate-300 space-y-0.5 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Wind Direction:</span>
            <span className="font-mono font-bold text-sky-300">
              {telemetry?.wind.heading || 'SE'} ({telemetry?.wind.directionDegrees || 135}°)
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Avg Speed:</span>
            <span className="font-mono font-bold text-white">{telemetry?.wind.speedKmH || 18} km/h</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Peak Gusts:</span>
            <span className="font-mono font-semibold text-amber-400">{telemetry?.wind.gustKmH || 32} km/h</span>
          </div>
        </div>

        {/* Animated Micro Vector Barb Grid */}
        <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800 flex items-center justify-between">
          <div className="relative w-10 h-10 rounded-full border border-sky-500/30 flex items-center justify-center bg-slate-950">
            <div
              className="w-full h-full flex items-center justify-center transition-transform duration-700"
              style={{ transform: `rotate(${telemetry?.wind.directionDegrees || 135}deg)` }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="21" x2="12" y2="3" />
                <polyline points="6 9 12 3 18 9" />
              </svg>
            </div>
            <span className="absolute -top-1 text-[7px] font-mono text-slate-500 font-bold">N</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className="w-6 h-6 rounded bg-slate-950 border border-slate-800 flex items-center justify-center"
              >
                <div
                  className="transition-transform duration-700"
                  style={{ transform: `rotate(${telemetry?.wind.directionDegrees || 135}deg)` }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="6 11 12 5 18 11" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. RAINFALL SCALE LEGEND (Top-Right Map Overlay) */}
      <div className="absolute top-14 right-3.5 z-10 w-48 rounded-xl bg-slate-950/90 border border-slate-800/90 backdrop-blur-xl p-2.5 shadow-2xl text-white pointer-events-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
          <span className="text-[11px] font-bold font-mono tracking-wider text-slate-200">24H PRECIPITATION</span>
          <span className="text-[9px] font-mono text-slate-400">(mm)</span>
        </div>

        {/* Gradient Spectrum Bar (Green -> Yellow -> Orange -> Red -> Purple) */}
        <div className="relative my-1">
          <div className="h-3 w-full rounded-md bg-gradient-to-r from-emerald-500 via-yellow-400 via-orange-500 via-red-600 to-purple-600 border border-slate-700/80 shadow-inner" />
        </div>

        {/* Scale Ticks */}
        <div className="flex justify-between text-[9px] font-mono text-slate-400 px-0.5">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>100</span>
          <span>150+</span>
        </div>

        {/* Current Max Rate Pill */}
        <div className="mt-1.5 pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
          <span className="text-slate-400">Peak Rate:</span>
          <span className="font-bold text-sky-300">{telemetry?.rainfall.currentRateMmHr || 0} mm/hr</span>
        </div>
      </div>

      {/* FLOATING LAYER TOGGLE PANEL */}
      {isLayerPanelOpen && (
        <div className="absolute top-14 right-52 z-30 w-64 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-4 space-y-3 text-xs text-white">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-xs flex items-center gap-1.5 text-slate-100">
              <Layers className="w-4 h-4 text-sky-400" /> EOC Map Layers
            </span>
            <button
              onClick={() => setIsLayerPanelOpen(false)}
              className="text-[10px] text-slate-400 hover:text-white underline"
            >
              Close
            </button>
          </div>

          <div className="space-y-2">
            {/* Radar Precipitation Sweep */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-900/80 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="font-medium text-slate-200">Radar Precipitation Overlay</span>
              </div>
              <input
                type="checkbox"
                checked={layersVisible.radarSweep}
                onChange={() => toggleLayer('radarSweep')}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Barrages & Gauging Stations */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-900/80 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-sky-400" />
                <span className="font-medium text-slate-200">Barrages & Hydro Gauges</span>
              </div>
              <input
                type="checkbox"
                checked={layersVisible.gaugingStations}
                onChange={() => toggleLayer('gaugingStations')}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Flood Risk Grid */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-900/80 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span className="font-medium text-slate-200">Flood Risk Grid</span>
              </div>
              <input
                type="checkbox"
                checked={layersVisible.riskGrid}
                onChange={() => toggleLayer('riskGrid')}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Airflow Wind Vectors */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-900/80 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-sky-300" />
                <span className="font-medium text-slate-200">Airflow Wind Vectors</span>
              </div>
              <input
                type="checkbox"
                checked={layersVisible.windVectors}
                onChange={() => toggleLayer('windVectors')}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Soil Saturation Index */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-900/80 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-teal-400" />
                <span className="font-medium text-slate-200">Soil Saturation Index</span>
              </div>
              <input
                type="checkbox"
                checked={layersVisible.soilMoisture}
                onChange={() => toggleLayer('soilMoisture')}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>

            {/* SOS Reports */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-900/80 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-red-600 text-white font-bold flex items-center justify-center text-[9px]">!</span>
                <span className="font-medium text-slate-200">Active SOS Reports</span>
              </div>
              <input
                type="checkbox"
                checked={layersVisible.sosReports}
                onChange={() => toggleLayer('sosReports')}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Rescue Units */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-900/80 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-emerald-400" />
                <span className="font-medium text-slate-200">Rescue Assets</span>
              </div>
              <input
                type="checkbox"
                checked={layersVisible.rescueUnits}
                onChange={() => toggleLayer('rescueUnits')}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Dispatch Routes */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-900/80 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 bg-blue-500 rounded-full" />
                <span className="font-medium text-slate-200">Dispatch Routes</span>
              </div>
              <input
                type="checkbox"
                checked={layersVisible.dispatchRoutes}
                onChange={() => toggleLayer('dispatchRoutes')}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

