'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Building2,
  ChevronDown,
  Layers,
  MapPin,
  Navigation,
  Radio,
  ShieldAlert,
  SlidersHorizontal,
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

export interface CityPreset {
  id: string;
  name: string;
  state: string;
  coordinates: [number, number]; // [lon, lat]
  zoom: number;
}

export const CITY_PRESETS: CityPreset[] = [
  { id: 'chennai', name: 'Chennai', state: 'Tamil Nadu', coordinates: [80.25, 13.05], zoom: 12 },
  { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', coordinates: [72.8777, 19.0760], zoom: 12 },
  { id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', coordinates: [77.5946, 12.9716], zoom: 12 },
  { id: 'kolkata', name: 'Kolkata', state: 'West Bengal', coordinates: [88.3639, 22.5726], zoom: 12 },
  { id: 'delhi', name: 'Delhi / NCR', state: 'Delhi', coordinates: [77.2090, 28.6139], zoom: 12 },
  { id: 'kochi', name: 'Kochi', state: 'Kerala', coordinates: [76.2711, 9.9312], zoom: 12 },
  { id: 'guwahati', name: 'Guwahati', state: 'Assam', coordinates: [91.7362, 26.1445], zoom: 12 },
];

interface MapContainerProps {
  riskGrid: RiskGridCollection | null;
  floodZones?: FloodZoneCollection | null;
  sosReports: SOSReport[];
  rescueUnits: RescueUnit[];
  dispatchAssignments: DispatchAssignment[];
  onSelectRiskCell: (props: RiskFeatureProperties) => void;
  /** Called once the viewer's real device location resolves or city changes */
  onLocationResolved?: (location: { lat: number; lon: number }) => void;
  /** Real OSRM road geometry for focused dispatch assignment */
  activeRouteGeometry?: { type: 'LineString'; coordinates: [number, number][] } | null;
  /** Simulated live position along that route */
  animatedUnitPosition?: [number, number] | null;
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
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const animatedUnitMarkerRef = useRef<maplibregl.Marker | null>(null);

  // City & Layer State
  const [selectedCityId, setSelectedCityId] = useState<string>('chennai');
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState<boolean>(false);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState<boolean>(false);

  const [layersVisible, setLayersVisible] = useState({
    riskGrid: true,
    floodZones: true,
    sosReports: true,
    rescueUnits: true,
    dispatchRoutes: true,
  });

  const onSelectRiskCellRef = useRef(onSelectRiskCell);
  onSelectRiskCellRef.current = onSelectRiskCell;
  const onLocationResolvedRef = useRef(onLocationResolved);
  onLocationResolvedRef.current = onLocationResolved;

  const DEFAULT_CENTER: [number, number] = [80.25, 13.05];

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: DEFAULT_CENTER,
      zoom: 12,
      pitch: 30,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      // 0. Flood Zone Source & Fill Layer
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
          'line-color': '#0f172a',
          'line-width': 7,
          'line-opacity': 0.35,
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
          'line-color': '#2563eb',
          'line-width': 4.5,
          'line-opacity': 0.95,
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

    // Geolocation Resolution
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
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

          map.flyTo({ center: [longitude, latitude], zoom: 13, pitch: 30, essential: true });
          onLocationResolvedRef.current?.({ lat: latitude, lon: longitude });
        },
        (err) => {
          console.warn('Geolocation unavailable, keeping default map center:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }

    return () => {
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
      animatedUnitMarkerRef.current?.remove();
      animatedUnitMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

  // Hot-swap Active Route Polyline
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('active-route-source') as maplibregl.GeoJSONSource;
    if (!source) return;

    source.setData(
      activeRouteGeometry
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: activeRouteGeometry, properties: {} }] }
        : { type: 'FeatureCollection', features: [] }
    );
  }, [activeRouteGeometry]);

  // Animated Unit Position
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
        <div class="absolute w-8 h-8 rounded-full bg-blue-500 opacity-30"></div>
        <div class="relative w-7 h-7 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/></svg>
        </div>
      `;
      animatedUnitMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(animatedUnitPosition).addTo(mapRef.current);
    } else {
      animatedUnitMarkerRef.current.setLngLat(animatedUnitPosition);
    }
  }, [animatedUnitPosition]);

  // Render SOS & Rescue Unit Markers with Visibility Filtering & Rich Popups
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
    setSelectedCityId(cityId);
    setIsCityDropdownOpen(false);

    const city = CITY_PRESETS.find((c) => c.id === cityId);
    if (!city || !mapRef.current) return;

    mapRef.current.flyTo({
      center: city.coordinates,
      zoom: city.zoom,
      pitch: 35,
      duration: 2000,
      essential: true,
    });

    onLocationResolvedRef.current?.({ lat: city.coordinates[1], lon: city.coordinates[0] });
  };

  // Handle Layer Visibility Toggle
  const toggleLayer = (layerKey: keyof typeof layersVisible) => {
    setLayersVisible((prev) => {
      const nextState = { ...prev, [layerKey]: !prev[layerKey] };

      if (mapRef.current) {
        if (layerKey === 'riskGrid') {
          const vis = nextState.riskGrid ? 'visible' : 'none';
          if (mapRef.current.getLayer('risk-grid-fill')) mapRef.current.setLayoutProperty('risk-grid-fill', 'visibility', vis);
          if (mapRef.current.getLayer('risk-grid-outline')) mapRef.current.setLayoutProperty('risk-grid-outline', 'visibility', vis);
        } else if (layerKey === 'floodZones') {
          const vis = nextState.floodZones ? 'visible' : 'none';
          if (mapRef.current.getLayer('flood-zone-fill')) mapRef.current.setLayoutProperty('flood-zone-fill', 'visibility', vis);
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

  const selectedCity = CITY_PRESETS.find((c) => c.id === selectedCityId) || CITY_PRESETS[0];

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* MapLibre Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Tactical Overlay Controls */}
      <div className="absolute top-4 left-4 z-20 flex flex-col sm:flex-row items-start sm:items-center gap-2 pointer-events-auto">
        {/* City Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-900 text-white backdrop-blur-md border border-slate-700/80 shadow-xl transition-all active:scale-95 text-xs font-semibold"
            aria-label="Select City Region"
          >
            <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="text-left">
              <div className="text-[11px] text-slate-400 font-normal leading-none">Monitoring Hub</div>
              <div className="text-xs font-bold text-slate-100 leading-tight flex items-center gap-1">
                {selectedCity.name}
                <span className="text-[10px] font-normal text-slate-400">({selectedCity.state})</span>
              </div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isCityDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* City Dropdown Menu */}
          {isCityDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-56 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl p-1.5 z-30 space-y-0.5 text-xs">
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

        {/* Collapsible Layer Control Button */}
        <button
          onClick={() => setIsLayerPanelOpen(!isLayerPanelOpen)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold backdrop-blur-md border shadow-xl transition-all active:scale-95 ${
            isLayerPanelOpen
              ? 'bg-blue-600 text-white border-blue-500'
              : 'bg-slate-900/90 hover:bg-slate-900 text-slate-200 border-slate-700/80'
          }`}
        >
          <Layers className="w-4 h-4 text-blue-400" />
          <span>Layers</span>
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
        </button>
      </div>

      {/* Floating Layer Toggle Panel Overlay */}
      {isLayerPanelOpen && (
        <div className="absolute top-16 left-4 z-20 w-64 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl p-4 space-y-3 text-xs text-white">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-xs flex items-center gap-1.5 text-slate-100">
              <Layers className="w-4 h-4 text-blue-400" /> Map Layers & Feeds
            </span>
            <button
              onClick={() => setIsLayerPanelOpen(false)}
              className="text-[10px] text-slate-400 hover:text-white underline"
            >
              Close
            </button>
          </div>

          <div className="space-y-2">
            {/* 1. Risk Grid */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors">
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

            {/* 2. Flood Radar Zones */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
                <span className="font-medium text-slate-200">Rainfall Radar Extent</span>
              </div>
              <input
                type="checkbox"
                checked={layersVisible.floodZones}
                onChange={() => toggleLayer('floodZones')}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
            </label>

            {/* 3. SOS Reports */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors">
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

            {/* 4. Rescue Units */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors">
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

            {/* 5. Dispatch Routes */}
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors">
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
