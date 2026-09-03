'use client';

import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DispatchAssignment, RescueUnit, RiskFeatureProperties, RiskGridCollection, SOSReport } from '@/types';

interface MapContainerProps {
  riskGrid: RiskGridCollection | null;
  sosReports: SOSReport[];
  rescueUnits: RescueUnit[];
  dispatchAssignments: DispatchAssignment[];
  onSelectRiskCell: (props: RiskFeatureProperties) => void;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  riskGrid,
  sosReports,
  rescueUnits,
  dispatchAssignments,
  onSelectRiskCell,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Center over Chennai / Flood Monitoring Zone
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty', // Free vector tile style
      center: [80.25, 13.05],
      zoom: 12,
      pitch: 30,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // 1. Add Risk Grid Source & Layer
      map.addSource('risk-grid-source', {
        type: 'geojson',
        data: riskGrid || { type: 'FeatureCollection', features: [] },
      });

      // Polygon fill layer with dynamic color gradient based on risk_score
      map.addLayer({
        id: 'risk-grid-fill',
        type: 'fill',
        source: 'risk-grid-source',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'risk_score'],
            0.0,
            'rgba(16, 185, 129, 0.25)', // Green (Low Risk)
            0.35,
            'rgba(245, 158, 11, 0.45)', // Amber/Yellow (Moderate)
            0.65,
            'rgba(249, 115, 22, 0.60)', // Orange (High)
            0.85,
            'rgba(239, 68, 68, 0.75)', // Red (Critical)
          ],
          'fill-outline-color': 'rgba(255, 255, 255, 0.4)',
        },
      });

      // Polygon outline border
      map.addLayer({
        id: 'risk-grid-outline',
        type: 'line',
        source: 'risk-grid-source',
        paint: {
          'line-color': '#0f172a',
          'line-width': 1.5,
          'line-opacity': 0.6,
        },
      });

      // 2. Add Dispatch Routes GeoJSON Source & Line Layers (Glow + Dashed Cyan Stroke)
      map.addSource('dispatch-routes-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Neon Cyan Glow Effect Layer underneath
      map.addLayer({
        id: 'dispatch-routes-glow',
        type: 'line',
        source: 'dispatch-routes-source',
        paint: {
          'line-color': '#00f3ff',
          'line-width': 8,
          'line-opacity': 0.4,
          'line-blur': 3,
        },
      });

      // Primary Dashed Cyan Route Line Layer
      map.addLayer({
        id: 'dispatch-routes-layer',
        type: 'line',
        source: 'dispatch-routes-source',
        paint: {
          'line-color': '#00f3ff',
          'line-width': 3.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.95,
        },
      });

      // 3. Risk Grid Polygon Click Listener for Explainable Risk Card
      map.on('click', 'risk-grid-fill', (e: maplibregl.MapLayerMouseEvent) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties as any;
          if (props) {
            let breakdown = props.breakdown;
            if (typeof breakdown === 'string') {
              try {
                breakdown = JSON.parse(breakdown);
              } catch (err) {
                console.error('Failed to parse breakdown JSON:', err);
              }
            }
            onSelectRiskCell({
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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // Run once on mount

  // Hot-swap Risk Grid Data on map when riskGrid prop updates
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('risk-grid-source') as maplibregl.GeoJSONSource;
    if (source && riskGrid) {
      source.setData(riskGrid);
    }
  }, [riskGrid]);

  // Update Dispatch Routes on Map when dispatchAssignments, sosReports, or rescueUnits change
  useEffect(() => {
    if (!mapRef.current) return;
    const routeSource = mapRef.current.getSource('dispatch-routes-source') as maplibregl.GeoJSONSource;
    if (!routeSource) return;

    if (!dispatchAssignments || dispatchAssignments.length === 0) {
      routeSource.setData({
        type: 'FeatureCollection',
        features: [],
      });
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
      .filter(Boolean);

    routeSource.setData({
      type: 'FeatureCollection',
      features: routeFeatures as any,
    });
  }, [dispatchAssignments, sosReports, rescueUnits]);

  // Render SOS Report Markers & Rescue Unit Markers with Visual Urgency State Machine
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const now = Date.now();

    // Render SOS Markers with Time-Elapsed Visual Urgency State Machine
    sosReports.forEach((report) => {
      const [lon, lat] = report.location.coordinates;
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center cursor-pointer';

      // Compute elapsed minutes since report creation
      const createdAtMs = new Date(report.created_at).getTime();
      const elapsedMins = Math.max(0, (now - createdAtMs) / (1000 * 60));

      let bgColor = 'bg-amber-400'; // < 2 mins: Yellow (#FACC15)
      let border = 'border-amber-200';
      let isRadarPing = false;

      if (report.severity === 'CRITICAL_TRAPPED' || elapsedMins >= 5.0) {
        // > 5 mins or CRITICAL_TRAPPED: Pulsing Red (#EF4444) ring with radar ping animation
        bgColor = 'bg-red-600';
        border = 'border-red-300';
        isRadarPing = true;
      } else if (elapsedMins >= 2.0 || report.severity === 'HIGH') {
        // 2 to 5 mins: Orange (#FB923C)
        bgColor = 'bg-orange-500';
        border = 'border-orange-200';
      }

      el.innerHTML = `
        ${isRadarPing ? '<div class="absolute w-10 h-10 rounded-full bg-red-500 animate-ping opacity-75"></div>' : ''}
        <div class="relative w-7 h-7 rounded-full ${bgColor} border-2 ${border} flex items-center justify-center text-[10px] font-black text-slate-950 shadow-xl">
          SOS
        </div>
      `;

      const elapsedText = elapsedMins < 1 ? 'Just now' : `${elapsedMins.toFixed(1)}m ago`;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .setPopup(
          new maplibregl.Popup({ offset: 15 }).setHTML(`
            <div class="p-2 text-slate-900 font-sans">
              <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-xs uppercase ${isRadarPing ? 'text-red-600 font-extrabold' : 'text-slate-800'}">
                  ${report.severity}
                </span>
                <span class="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  ${elapsedText}
                </span>
              </div>
              <div class="text-[11px] text-slate-600 mt-1">Status: ${report.status}</div>
              <div class="text-[11px] text-slate-600">Trust Score: ${report.trust_score}</div>
              ${report.voice_transcript ? `<div class="text-[10px] bg-slate-100 p-1.5 rounded mt-1 text-slate-700 italic">"${report.voice_transcript}"</div>` : ''}
            </div>
          `)
        )
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
    });

    // Render Rescue Unit Markers
    rescueUnits.forEach((unit) => {
      const [lon, lat] = unit.current_location.coordinates;
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center cursor-pointer';
      el.innerHTML = `
        <div class="w-7.5 h-7.5 rounded-lg bg-sky-600 border-2 border-sky-300 flex items-center justify-center text-xs shadow-lg text-white font-bold">
          🚁
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .setPopup(
          new maplibregl.Popup({ offset: 15 }).setHTML(`
            <div class="p-2 text-slate-900 font-sans">
              <div class="font-bold text-xs text-sky-700">${unit.name}</div>
              <div class="text-[11px] text-slate-600">Type: ${unit.unit_type}</div>
              <div class="text-[11px] text-slate-600">Status: ${unit.status}</div>
            </div>
          `)
        )
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
    });
  }, [sosReports, rescueUnits]);

  return (
    <div className="w-full h-screen relative bg-slate-950">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};
