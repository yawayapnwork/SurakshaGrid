'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { TopStatsBar } from '@/components/TopStatsBar';
import { LeftController } from '@/components/LeftController';
import { RightDispatchQueue } from '@/components/RightDispatchQueue';
import { RiskCardModal } from '@/components/RiskCardModal';
import { ReplayScrubber } from '@/components/ReplayScrubber';
import { BroadcastSMSModal } from '@/components/BroadcastSMSModal';
import { DispatchNavigationCard } from '@/components/DispatchNavigationCard';
import { ScientificTelemetryMetrics, ScientificTelemetryPayload } from '@/components/ScientificTelemetryMetrics';
import { ExportAARModal } from '@/components/ExportAARModal';
import { playTwoToneEmergencyAlert } from '@/components/AudioAlertManager';
import { useAnimatedRouteProgress } from '@/hooks/useAnimatedRouteProgress';
import { useDebounce } from '@/hooks/useDebounce';
import { useDemoTour } from '@/hooks/useDemoTour';
import { useLiveRainfall } from '@/hooks/useLiveRainfall';
import { useN8nLiveFeed } from '@/hooks/useN8nLiveFeed';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  fetchActiveSOSReports,
  fetchDispatchRoute,
  fetchLiveAnalyticsStats,
  fetchReplayEvents,
  fetchSimulatedFloodZones,
  fetchSimulatedRiskScores,
  resetSimulationScenario,
  resolveSOSReport,
  triggerOptimizeDispatch,
  triggerSimulationScenario,
} from '@/services/api';
import { DispatchAssignment, DispatchRoute, EventLog, EventPayload, FloodZoneCollection, LiveAnalyticsStats, RescueUnit, RiskFeatureProperties, RiskGridCollection, SOSReport } from '@/types';
import { Activity, CheckCircle, Info, LayoutGrid, Map as MapIcon, Radio, Sliders, X } from 'lucide-react';

import { MapErrorBoundary } from '@/components/MapErrorBoundary';

// Dynamically import MapContainer to prevent SSR hydration errors with maplibre-gl
const MapContainer = dynamic(
  () => import('@/components/MapContainer').then((mod) => mod.MapContainer),
  { ssr: false }
);

const FloodInundationTelemetryDashboard = dynamic(
  () => import('@/components/FloodInundationTelemetryDashboard').then((mod) => mod.FloodInundationTelemetryDashboard),
  { ssr: false }
);

function mergeDispatchAssignments(
  prev: DispatchAssignment[],
  incoming: DispatchAssignment[]
): DispatchAssignment[] {
  const bySosId = new Map<string, DispatchAssignment>(prev.map((a) => [a.sos_id, a]));
  for (const assignment of incoming) {
    bySosId.set(assignment.sos_id, assignment);
  }
  return Array.from(bySosId.values());
}

export default function DashboardPage() {
  // 1. Dashboard State
  const [rainfall, setRainfall] = useState<number>(0);
  const debouncedRainfall = useDebounce(rainfall, 250);

  const [riskMode, setRiskMode] = useState<'simulated' | 'live'>('simulated');
  const [rainfallRefreshTrigger, setRainfallRefreshTrigger] = useState(0);

  const [riskGrid, setRiskGrid] = useState<RiskGridCollection | null>(null);
  const [floodZones, setFloodZones] = useState<FloodZoneCollection | null>(null);
  const [sosReports, setSosReports] = useState<SOSReport[]>([]);
  const [rescueUnits, setRescueUnits] = useState<RescueUnit[]>([]);
  const [dispatchAssignments, setDispatchAssignments] = useState<DispatchAssignment[]>([]);
  const [analyticsStats, setAnalyticsStats] = useState<LiveAnalyticsStats | null>(null);

  const [selectedRiskCell, setSelectedRiskCell] = useState<RiskFeatureProperties | null>(null);

  // Modular Focus View State ('overview' | 'map' | 'dispatch' | 'scenario' | 'telemetry')
  const [activeFocusModule, setActiveFocusModule] = useState<'overview' | 'map' | 'dispatch' | 'scenario' | 'telemetry'>('overview');

  // Selected City / Region state
  const [selectedCityId, setSelectedCityId] = useState<string>('delhi');

  const selectedCityInfo = useMemo(() => {
    const cityMap: Record<string, { name: string; state: string; coords: [number, number] }> = {
      delhi: { name: 'Delhi / NCR', state: 'Delhi', coords: [77.2090, 28.6139] },
      chennai: { name: 'Chennai', state: 'Tamil Nadu', coords: [80.25, 13.05] },
      mumbai: { name: 'Mumbai', state: 'Maharashtra', coords: [72.8777, 19.0760] },
      bengaluru: { name: 'Bengaluru', state: 'Karnataka', coords: [77.5946, 12.9716] },
      kolkata: { name: 'Kolkata', state: 'West Bengal', coords: [88.3639, 22.5726] },
      kochi: { name: 'Kochi', state: 'Kerala', coords: [76.2711, 9.9312] },
      guwahati: { name: 'Guwahati', state: 'Assam', coords: [91.7362, 26.1445] },
    };
    return cityMap[selectedCityId] || cityMap.delhi;
  }, [selectedCityId]);

  // Focused Dispatch Navigation State
  const [focusedAssignment, setFocusedAssignment] = useState<DispatchAssignment | null>(null);
  const [focusedRoute, setFocusedRoute] = useState<DispatchRoute | null>(null);
  const [focusedRouteError, setFocusedRouteError] = useState<string | null>(null);
  const [isLoadingFocusedRoute, setIsLoadingFocusedRoute] = useState(false);
  const [isMarkingArrived, setIsMarkingArrived] = useState(false);

  const [isDispatching, setIsDispatching] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Audio Siren Mute State
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Modal States
  const [isAARModalOpen, setIsAARModalOpen] = useState(false);
  const [isSMSModalOpen, setIsSMSModalOpen] = useState(false);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  // Replay Mode State
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replayEvents, setReplayEvents] = useState<EventLog[]>([]);
  const [activeSimId, setActiveSimId] = useState<string | null>(null);

  // Geolocation
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const liveWeatherInfo = useLiveRainfall(userLocation, riskMode === 'live', rainfallRefreshTrigger);

  // n8n Webhook Live Feed Integration
  const n8nFeed = useN8nLiveFeed(!isReplayMode);

  useEffect(() => {
    if (n8nFeed.isLive) {
      if (n8nFeed.sosReports.length > 0) {
        setSosReports((prev) => {
          const merged = new Map<string, SOSReport>(prev.map((r) => [r.id, r]));
          for (const report of n8nFeed.sosReports) {
            merged.set(report.id, { ...merged.get(report.id), ...report });
          }
          return Array.from(merged.values());
        });
      }

      if (n8nFeed.dispatchQueue.length > 0) {
        setDispatchAssignments((prev) => mergeDispatchAssignments(prev, n8nFeed.dispatchQueue));
      }

      if (n8nFeed.rescueUnits.length > 0) {
        setRescueUnits((prev) => {
          const merged = new Map<string, RescueUnit>(prev.map((u) => [u.id, u]));
          for (const unit of n8nFeed.rescueUnits) {
            merged.set(unit.id, { ...merged.get(unit.id), ...unit });
          }
          return Array.from(merged.values());
        });
      }

      if (n8nFeed.telemetry) {
        setRainfall(n8nFeed.telemetry.rainfall_intensity);
      }
    }
  }, [n8nFeed.isLive, n8nFeed.sosReports, n8nFeed.dispatchQueue, n8nFeed.rescueUnits, n8nFeed.telemetry]);

  // Real Coordinate-Based Telemetry Payload bound strictly to selected region
  const telemetryData: ScientificTelemetryPayload = useMemo(() => {
    const intensity = liveWeatherInfo?.intensity ?? rainfall;
    const [cLon, cLat] = userLocation ? [userLocation.lon, userLocation.lat] : selectedCityInfo.coords;
    const latStr = cLat.toFixed(4);
    const lonStr = cLon.toFixed(4);

    const windSpeed = Math.round(15 + intensity * 0.45);
    const windGust = Math.round(28 + intensity * 0.65);
    const directionDegrees = Math.round((135 + cLat * 5 + intensity * 2) % 360);

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const heading = directions[Math.round(directionDegrees / 45) % 8];

    return {
      timestamp: new Date().toISOString(),
      stationId: `EOC-${selectedCityId.toUpperCase()}-${latStr}-${lonStr}`,
      stationName: `${selectedCityInfo.name} Hydro-Meteorological Station (${selectedCityInfo.state})`,
      wind: {
        speedKmH: windSpeed,
        gustKmH: windGust,
        directionDegrees,
        heading,
      },
      rainfall: {
        currentRateMmHr: intensity,
        cumulative24hMm: Math.round((intensity * 3.1) * 10) / 10,
        severity: intensity > 75 ? 'TORRENTIAL' : intensity > 35 ? 'HEAVY' : intensity > 7.5 ? 'MODERATE' : 'LIGHT',
      },
      atmospheric: {
        pressureHpa: Math.round((1012 - intensity * 0.28) * 10) / 10,
        pressureTrend: intensity > 40 ? 'FALLING' : 'STEADY',
        pressureDelta3h: Math.round((-1.4 - intensity * 0.08) * 10) / 10,
        humidityPercent: Math.min(100, Math.round(76 + intensity * 0.24)),
        dewPointC: 24.5,
      },
      soil: {
        soilSaturationPercent: Math.min(100, Math.round(52 + intensity * 0.46)),
        absorptionRateMmHr: 4.2,
        surfaceRunoffPotential: intensity > 60 ? 'EXTREME' : intensity > 30 ? 'HIGH' : 'MODERATE',
        groundwaterTableMeters: 0.45,
      },
    };
  }, [liveWeatherInfo, rainfall, userLocation, selectedCityId, selectedCityInfo]);

  useEffect(() => {
    const savedMute = localStorage.getItem('surakshagrid_muted');
    if (savedMute !== null) {
      setIsMuted(savedMute === 'true');
    }
    const savedSimId = sessionStorage.getItem('surakshagrid_sim_id');
    if (savedSimId) {
      setActiveSimId(savedSimId);
    }
  }, []);

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem('surakshagrid_muted', String(next));
      return next;
    });
  };

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // What-If Risk Simulation Data Fetching
  useEffect(() => {
    let isSubscribed = true;
    Promise.all([
      fetchSimulatedRiskScores(debouncedRainfall, activeSimId || undefined, riskMode, userLocation || undefined),
      fetchSimulatedFloodZones(debouncedRainfall, activeSimId || undefined, userLocation || undefined),
    ])
      .then(([riskData, floodData]) => {
        if (isSubscribed) {
          setRiskGrid(riskData);
          setFloodZones(floodData);
        }
      })
      .catch((err) => {
        console.error('Error simulating risk scores or flood zones:', err);
        if (isSubscribed) {
          showToast(err instanceof Error ? err.message : 'Failed to run the flood risk simulation.', 'info');
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [debouncedRainfall, activeSimId, riskMode, liveWeatherInfo, userLocation]);

  // Analytics Polling
  useEffect(() => {
    let isSubscribed = true;
    const fetchAnalytics = () => {
      fetchLiveAnalyticsStats(activeSimId || undefined)
        .then((data) => {
          if (isSubscribed) setAnalyticsStats(data);
        })
        .catch((err) => console.error('Error fetching live analytics stats:', err));
    };

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [activeSimId]);

  // Elapsed Time Refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setSosReports((prev) => [...prev]);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket Message Handler
  const handleWebSocketMessage = useCallback(
    (msg: { event: string; data: EventPayload }) => {
      if (isReplayMode) return;
      const { event, data } = msg;

      if (event === 'LIVE_RAINFALL_UPDATED') {
        setRainfallRefreshTrigger((n) => n + 1);
        showToast(`Live weather update: ${data.rainfall_intensity}mm/hr (${data.source || 'OpenWeatherMap'})`, 'info');
      } else if (event === 'SOS_CREATED') {
        const newReport: SOSReport = {
          id: data.sos_id ?? '',
          location: data.location || { type: 'Point', coordinates: [80.27, 13.08] },
          status: data.status || 'PENDING',
          severity: data.severity || 'HIGH',
          photo_url: data.photo_url,
          visual_confidence_score: data.visual_confidence_score,
          trust_score: data.trust_score || 0,
          voice_transcript: data.voice_transcript,
          created_at: data.created_at || new Date().toISOString(),
        };

        setSosReports((prev) => {
          if (prev.some((r) => r.id === newReport.id)) return prev;
          return [newReport, ...prev];
        });

        if (newReport.severity === 'CRITICAL_TRAPPED') {
          playTwoToneEmergencyAlert(isMuted);
        }
      } else if (event === 'SOS_CONFIRMED') {
        setSosReports((prev) =>
          prev.map((r) => (r.id === data.sos_id ? { ...r, trust_score: data.trust_score ?? r.trust_score } : r))
        );
      } else if (event === 'UNIT_DISPATCHED') {
        const assignment: DispatchAssignment = {
          sos_id: data.sos_id ?? '',
          rescue_unit_id: data.rescue_unit_id ?? '',
          unit_name: data.unit_name || 'Rescue Unit',
          eta_seconds: data.eta_seconds ?? 300,
          cost: data.cost ?? 5.0,
          assigned_at: data.assigned_at || new Date().toISOString(),
        };

        setDispatchAssignments((prev) => mergeDispatchAssignments(prev, [assignment]));
        setRescueUnits((prev) =>
          prev.map((u) => (u.id === data.rescue_unit_id ? { ...u, status: 'DISPATCHED' } : u))
        );
        setSosReports((prev) =>
          prev.map((r) => (r.id === data.sos_id ? { ...r, status: 'ASSIGNED' } : r))
        );
      } else if (event === 'ZONE_EXPANDED') {
        if (data.geometry) {
          const updatedFeatureCollection: FloodZoneCollection = {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: data.geometry,
                properties: {
                  rainfall: data.rainfall_intensity ?? 0,
                  sim_id: data.sim_id,
                  zone_id: data.zone_id,
                },
              },
            ],
          };
          setFloodZones(updatedFeatureCollection);
        }
      } else if (event === 'SIMULATION_COMPLETE') {
        setIsTriggering(false);
        showToast(data.message || 'Live flood scenario completed: All SOS reports spawned!', 'success');
      } else if (event === 'SCENARIO_RESET') {
        setIsTriggering(false);
        setSosReports([]);
        setDispatchAssignments([]);
        setRescueUnits([]);
        setFloodZones(null);
        showToast('Scenario state reset by backend', 'info');
      }
    },
    [isReplayMode, isMuted]
  );

  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
    enabled: !isReplayMode,
  });

  useEffect(() => {
    if (!isConnected || isReplayMode) return;
    let isSubscribed = true;

    fetchActiveSOSReports(activeSimId || undefined)
      .then((reports) => {
        if (!isSubscribed) return;
        setSosReports((prev) => {
          const merged = new Map<string, SOSReport>(prev.map((r) => [r.id, r]));
          for (const report of reports) {
            merged.set(report.id, { ...merged.get(report.id), ...report });
          }
          return Array.from(merged.values());
        });
      })
      .catch((err) => console.error('Failed to hydrate active SOS reports:', err));

    return () => {
      isSubscribed = false;
    };
  }, [isConnected, activeSimId, isReplayMode]);

  const handleTriggerFloodScenario = async () => {
    setIsTriggering(true);
    try {
      const result = await triggerSimulationScenario();
      if (result.sim_id) {
        setActiveSimId(result.sim_id);
        sessionStorage.setItem('surakshagrid_sim_id', result.sim_id);
      }
      showToast(
        result.message || `Scenario Initiated: ${result.seeded_units} Rescue Units Seeded! SOS reports arriving progressively...`,
        'success'
      );
      playTwoToneEmergencyAlert(isMuted);

      setTimeout(() => {
        setIsTriggering(false);
      }, 100000);
    } catch (err) {
      console.error('Failed to trigger live simulation scenario:', err);
      showToast(err instanceof Error ? err.message : 'Failed to trigger simulation scenario.', 'info');
      setIsTriggering(false);
    }
  };

  const handleResetScenario = async () => {
    setIsResetting(true);
    try {
      await resetSimulationScenario(activeSimId || undefined);
      setActiveSimId(null);
      sessionStorage.removeItem('surakshagrid_sim_id');
      setSosReports([]);
      setDispatchAssignments([]);
      setRescueUnits([]);
      showToast('Demo state safely wiped. Baseline DB intact.', 'info');
    } catch (err) {
      console.error('Failed to reset simulation:', err);
      showToast(err instanceof Error ? err.message : 'Failed to reset simulation scenario.', 'info');
    } finally {
      setIsResetting(false);
    }
  };

  const handleRunDispatch = async () => {
    setIsDispatching(true);
    try {
      const assignments = await triggerOptimizeDispatch(activeSimId || undefined);
      setDispatchAssignments((prev) => mergeDispatchAssignments(prev, assignments));

      if (assignments.length > 0) {
        const assignedSosIds = new Set(assignments.map((a) => a.sos_id));
        const assignedUnitIds = new Set(assignments.map((a) => a.rescue_unit_id));

        setSosReports((prev) =>
          prev.map((r) => (assignedSosIds.has(r.id) ? { ...r, status: 'ASSIGNED' } : r))
        );

        setRescueUnits((prev) =>
          prev.map((u) => (assignedUnitIds.has(u.id) ? { ...u, status: 'DISPATCHED' } : u))
        );

        showToast(`Hungarian Optimizer Dispatched ${assignments.length} Rescue Units!`, 'success');
      } else {
        showToast('No pending reports or available units to dispatch.', 'info');
      }
    } catch (err) {
      console.error('Failed to run rescue dispatch optimizer:', err);
      showToast(err instanceof Error ? err.message : 'Dispatch optimizer failed.', 'info');
    } finally {
      setIsDispatching(false);
    }
  };

  useEffect(() => {
    if (!focusedAssignment) {
      setFocusedRoute(null);
      setFocusedRouteError(null);
      return;
    }
    let isSubscribed = true;
    setIsLoadingFocusedRoute(true);
    setFocusedRouteError(null);

    fetchDispatchRoute(focusedAssignment.rescue_unit_id, focusedAssignment.sos_id)
      .then((route) => {
        if (isSubscribed) setFocusedRoute(route);
      })
      .catch((err) => {
        console.error('Failed to fetch dispatch route:', err);
        if (isSubscribed) {
          setFocusedRoute(null);
          setFocusedRouteError(err instanceof Error ? err.message : 'Route unavailable.');
        }
      })
      .finally(() => {
        if (isSubscribed) setIsLoadingFocusedRoute(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [focusedAssignment]);

  const focusedRouteProgress = useAnimatedRouteProgress(focusedRoute);

  const handleCloseNavigation = () => {
    setFocusedAssignment(null);
  };

  const handleMarkArrived = async () => {
    if (!focusedAssignment) return;
    setIsMarkingArrived(true);
    try {
      await resolveSOSReport(focusedAssignment.sos_id);
      setSosReports((prev) =>
        prev.map((r) => (r.id === focusedAssignment.sos_id ? { ...r, status: 'RESOLVED' } : r))
      );
      setRescueUnits((prev) =>
        prev.map((u) => (u.id === focusedAssignment.rescue_unit_id ? { ...u, status: 'AVAILABLE' } : u))
      );
      showToast(`${focusedAssignment.unit_name} marked arrived. Incident resolved.`, 'success');
      setFocusedAssignment(null);
    } catch (err) {
      console.error('Failed to mark SOS report resolved:', err);
      showToast(err instanceof Error ? err.message : 'Failed to mark as arrived.', 'info');
    } finally {
      setIsMarkingArrived(false);
    }
  };

  const handleUpdateStatus = () => {
    showToast('Status updates coming soon to live GPS feed.', 'info');
  };

  const handleCallDispatcher = () => {
    showToast('Dispatcher audio link initiated.', 'info');
  };

  const handleToggleReplayMode = async (active: boolean) => {
    setIsReplayMode(active);
    if (active) {
      try {
        const events = await fetchReplayEvents(undefined, activeSimId || undefined);
        setReplayEvents(events);
        showToast('Digital Twin Replay Mode Activated', 'info');
      } catch (err) {
        console.error('Failed to fetch replay events:', err);
        showToast(err instanceof Error ? err.message : 'Failed to load replay events.', 'info');
        setIsReplayMode(false);
      }
    }
  };

  const handleSelectReplayEventIndex = (idx: number) => {
    if (idx < 0 || idx >= replayEvents.length) return;

    const historicalEvents = replayEvents.slice(0, idx + 1);
    const reconstructedSos: Map<string, SOSReport> = new Map();
    const reconstructedDispatches: DispatchAssignment[] = [];
    let latestZonePayload: EventPayload | null = null;

    for (const evt of historicalEvents) {
      const p = evt.payload;
      if (evt.event_type === 'SOS_CREATED') {
        const sosId = p.sos_id ?? '';
        reconstructedSos.set(sosId, {
          id: sosId,
          location: { type: 'Point', coordinates: [p.longitude || 80.27, p.latitude || 13.08] },
          status: 'PENDING',
          severity: p.severity || 'HIGH',
          trust_score: p.trust_score || 0,
          created_at: evt.occurred_at,
        });
      } else if (evt.event_type === 'SOS_CONFIRMED') {
        const existing = reconstructedSos.get(p.sos_id ?? '');
        if (existing) {
          existing.trust_score = p.trust_score ?? existing.trust_score;
        }
      } else if (evt.event_type === 'UNIT_DISPATCHED') {
        const existing = reconstructedSos.get(p.sos_id ?? '');
        if (existing) {
          existing.status = 'ASSIGNED';
        }
        reconstructedDispatches.push({
          sos_id: p.sos_id ?? '',
          rescue_unit_id: p.rescue_unit_id ?? '',
          unit_name: p.unit_name || 'Rescue Unit',
          eta_seconds: p.eta_seconds || 300,
          cost: p.cost || 5.0,
          assigned_at: evt.occurred_at,
        });
      } else if (evt.event_type === 'ZONE_EXPANDED') {
        latestZonePayload = p;
      }
    }

    setSosReports(Array.from(reconstructedSos.values()));
    setDispatchAssignments(reconstructedDispatches);

    if (latestZonePayload && latestZonePayload.geometry) {
      const reconstructedFloodZones: FloodZoneCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: latestZonePayload.geometry,
            properties: {
              rainfall: latestZonePayload.rainfall_intensity ?? 0,
              sim_id: latestZonePayload.sim_id,
              zone_id: latestZonePayload.zone_id,
            },
          },
        ],
      };
      setFloodZones(reconstructedFloodZones);
    } else {
      setFloodZones(null);
    }
  };

  const activeSosCount = analyticsStats ? analyticsStats.active_sos_count : sosReports.filter((r) => r.status !== 'RESOLVED').length;
  const criticalCount = analyticsStats ? analyticsStats.critical_sos_count : sosReports.filter((r) => r.severity === 'CRITICAL_TRAPPED').length;
  const dispatchedUnitsCount = analyticsStats ? analyticsStats.dispatched_units_count : rescueUnits.filter((u) => u.status === 'DISPATCHED').length;

  const avgEtaMinutes = analyticsStats
    ? analyticsStats.avg_eta_minutes
    : dispatchAssignments.length > 0
    ? dispatchAssignments.reduce((acc, a) => acc + a.eta_seconds / 60, 0) / dispatchAssignments.length
    : 0;

  const demoTour = useDemoTour({
    setRainfall,
    triggerFloodScenario: handleTriggerFloodScenario,
    runDispatch: handleRunDispatch,
    setSelectedRiskCell,
    toggleReplayMode: handleToggleReplayMode,
    selectReplayIndex: handleSelectReplayEventIndex,
    setSosReports,
    riskGrid,
    showToast,
  });

  const focusedSosReport = useMemo(() => {
    if (!focusedAssignment) return undefined;
    return sosReports.find((r) => r.id === focusedAssignment.sos_id);
  }, [focusedAssignment, sosReports]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 text-slate-900 select-none relative font-sans">
      {/* Top Navigation & Telemetry Stats Bar (Fixed shrink-0 height) */}
      <header className="shrink-0 flex-shrink-0 w-full z-30 relative">
        <TopStatsBar
          monitoredAreaKm2={analyticsStats?.monitored_area_km2 || 42.5}
          activeSosCount={activeSosCount}
          criticalCount={criticalCount}
          dispatchedUnitsCount={dispatchedUnitsCount}
          avgEtaMinutes={avgEtaMinutes}
          isConnected={isConnected}
          isReplayMode={isReplayMode}
          n8nStatus={n8nFeed.syncStatus}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onOpenAARModal={() => setIsAARModalOpen(true)}
          onOpenSMSModal={() => setIsSMSModalOpen(true)}
          demoState={demoTour}
        />
      </header>

      {/* 2. TOP EOC MODULAR FOCUS VIEW SWITCHER BAR (Fixed shrink-0 height) */}
      <nav className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-xs shrink-0 flex-shrink-0 z-20">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mr-2 hidden sm:inline">
            Focus Mode:
          </span>
          <button
            onClick={() => setActiveFocusModule('overview')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeFocusModule === 'overview'
                ? 'bg-slate-900 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Overview (Split)</span>
          </button>
          <button
            onClick={() => setActiveFocusModule('map')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeFocusModule === 'map'
                ? 'bg-slate-900 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5 text-sky-600" />
            <span>Command Map</span>
          </button>
          <button
            onClick={() => setActiveFocusModule('dispatch')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeFocusModule === 'dispatch'
                ? 'bg-slate-900 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-red-600" />
            <span>Live Dispatch</span>
            {activeSosCount > 0 && (
              <span className="bg-red-600 text-white text-[9.5px] px-1.5 py-0.2 rounded-full font-bold">
                {activeSosCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveFocusModule('scenario')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeFocusModule === 'scenario'
                ? 'bg-slate-900 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-amber-600" />
            <span>Scenario Controls</span>
          </button>
          <button
            onClick={() => setActiveFocusModule('telemetry')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeFocusModule === 'telemetry'
                ? 'bg-slate-900 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            <span>Hydro Telemetry</span>
          </button>
        </div>

        {/* Active Dynamic Region Coordinate Tag */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-600">
          <span className="text-slate-400 text-[11px]">COORDINATE BOUND:</span>
          <span className="text-slate-800 font-bold bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 text-[11px]">
            {selectedCityInfo.name.toUpperCase()} ({selectedCityInfo.coords[1].toFixed(2)}°, {selectedCityInfo.coords[0].toFixed(2)}°)
          </span>
        </div>
      </nav>

      {/* Non-Blocking Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div
            className={`px-4 py-2 rounded-xl border shadow-md backdrop-blur-md flex items-center gap-2 text-xs font-semibold ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-white text-slate-800 border-slate-200'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : (
              <Info className="w-4 h-4 text-slate-400" />
            )}
            <span>{toastMessage.text}</span>
            <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Workspace Content Area (Strict Viewport Isolation) */}
      <main className="flex-1 w-full h-full min-h-0 overflow-hidden relative flex flex-col p-4 gap-4">
        {/* VIEW MODE 1: OVERVIEW (SPLIT DASHBOARD 2-COLUMN VIEWPORT GRID) */}
        {activeFocusModule === 'overview' && (
          <div className="w-full h-full min-h-0 grid grid-cols-12 gap-4 overflow-hidden">
            {/* Left Primary Column: Command Map Hero Card + Hydro Telemetry (8 Cols) */}
            <div className="col-span-12 lg:col-span-8 h-full min-h-0 flex flex-col gap-4 overflow-hidden">
              {/* Map Container Hero Card (Flex-1 fills remaining vertical space) */}
              <div className="flex-1 min-h-0 w-full flex flex-col h-full max-h-full overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm relative">
                <MapErrorBoundary>
                  <MapContainer
                    riskGrid={riskGrid}
                    floodZones={floodZones}
                    sosReports={sosReports}
                    rescueUnits={rescueUnits}
                    dispatchAssignments={dispatchAssignments}
                    onSelectRiskCell={setSelectedRiskCell}
                    onLocationResolved={setUserLocation}
                    activeRouteGeometry={focusedRoute?.geometry ?? null}
                    animatedUnitPosition={focusedRouteProgress.position}
                    animatedUnitBearing={focusedRouteProgress.bearingDegrees}
                    telemetry={telemetryData}
                    selectedCityId={selectedCityId}
                    onCityChange={setSelectedCityId}
                  />
                </MapErrorBoundary>
              </div>

              {/* Hydro Telemetry Data Metrics Panel */}
              <div className="shrink-0 flex-shrink-0 w-full max-h-[220px] flex flex-col overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
                <ScientificTelemetryMetrics
                  telemetry={telemetryData}
                  isStreaming={isConnected}
                />
              </div>
            </div>

            {/* Right Secondary Column: Scenario Controls + Live Dispatch Queue (4 Cols) */}
            <div className="col-span-12 lg:col-span-4 h-full min-h-0 flex flex-col gap-4 overflow-hidden">
              {/* Scenario Simulation Controls */}
              <div className="flex-1 min-h-0 flex flex-col h-full max-h-full overflow-hidden">
                <LeftController
                  rainfall={rainfall}
                  onRainfallChange={setRainfall}
                  riskMode={riskMode}
                  onRiskModeChange={setRiskMode}
                  liveWeatherInfo={liveWeatherInfo}
                  onTriggerFloodScenario={handleTriggerFloodScenario}
                  onResetScenario={handleResetScenario}
                  onRunDispatch={handleRunDispatch}
                  isDispatching={isDispatching}
                  isTriggering={isTriggering}
                  isResetting={isResetting}
                />
              </div>

              {/* Live Rescue Units Dispatch Queue */}
              <div className="flex-1 min-h-0 flex flex-col h-full max-h-full overflow-hidden">
                <RightDispatchQueue assignments={dispatchAssignments} onSelectAssignment={setFocusedAssignment} />
              </div>
            </div>
          </div>
        )}

        {/* VIEW MODE 2: COMMAND MAP FOCUS (100% EXPANDED SINGLE-COLUMN VIEW) */}
        {activeFocusModule === 'map' && (
          <div className="w-full h-full min-h-0 flex flex-col overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm relative">
            <MapErrorBoundary>
              <MapContainer
                riskGrid={riskGrid}
                floodZones={floodZones}
                sosReports={sosReports}
                rescueUnits={rescueUnits}
                dispatchAssignments={dispatchAssignments}
                onSelectRiskCell={setSelectedRiskCell}
                onLocationResolved={setUserLocation}
                activeRouteGeometry={focusedRoute?.geometry ?? null}
                animatedUnitPosition={focusedRouteProgress.position}
                animatedUnitBearing={focusedRouteProgress.bearingDegrees}
                telemetry={telemetryData}
                selectedCityId={selectedCityId}
                onCityChange={setSelectedCityId}
              />
            </MapErrorBoundary>
          </div>
        )}

        {/* VIEW MODE 3: LIVE DISPATCH QUEUE FOCUS (100% EXPANDED SINGLE-COLUMN / SPLIT VIEW) */}
        {activeFocusModule === 'dispatch' && (
          <div className="w-full h-full min-h-0 grid grid-cols-12 gap-4 overflow-hidden">
            <div className="col-span-12 lg:col-span-7 h-full min-h-0 flex flex-col overflow-hidden">
              <RightDispatchQueue assignments={dispatchAssignments} onSelectAssignment={setFocusedAssignment} />
            </div>
            <div className="col-span-12 lg:col-span-5 h-full min-h-0 flex flex-col overflow-hidden">
              {focusedAssignment ? (
                <div className="flex-1 min-h-0 flex flex-col h-full max-h-full overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
                  <DispatchNavigationCard
                    assignment={focusedAssignment}
                    sosReport={focusedSosReport}
                    route={focusedRoute}
                    routeError={focusedRouteError}
                    isLoadingRoute={isLoadingFocusedRoute}
                    progress={focusedRouteProgress}
                    onClose={handleCloseNavigation}
                    onMarkArrived={handleMarkArrived}
                    onUpdateStatus={handleUpdateStatus}
                    onCallDispatcher={handleCallDispatcher}
                    isMarkingArrived={isMarkingArrived}
                    embedded={true}
                  />
                </div>
              ) : (
                <div className="w-full h-full rounded-xl bg-white border border-slate-200 p-8 flex flex-col items-center justify-center text-center text-slate-500 space-y-3 shadow-sm">
                  <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                    <Radio className="w-6 h-6 animate-pulse" />
                  </div>
                  <h4 className="font-bold text-base text-slate-900">Select a Dispatch Assignment</h4>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Click any active unit in the queue to preview turn-by-turn road geometry, ETA updates, and live dispatch tracking.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW MODE 4: SCENARIO CONTROLS FOCUS (100% EXPANDED SINGLE-COLUMN VIEW) */}
        {activeFocusModule === 'scenario' && (
          <div className="w-full h-full min-h-0 flex flex-col overflow-hidden">
            <LeftController
              rainfall={rainfall}
              onRainfallChange={setRainfall}
              riskMode={riskMode}
              onRiskModeChange={setRiskMode}
              liveWeatherInfo={liveWeatherInfo}
              onTriggerFloodScenario={handleTriggerFloodScenario}
              onResetScenario={handleResetScenario}
              onRunDispatch={handleRunDispatch}
              isDispatching={isDispatching}
              isTriggering={isTriggering}
              isResetting={isResetting}
            />
          </div>
        )}

        {/* VIEW MODE 5: HYDRO TELEMETRY FOCUS (100% EXPANDED SINGLE-COLUMN VIEW) */}
        {activeFocusModule === 'telemetry' && (
          <div className="w-full h-full min-h-0 flex flex-col gap-4 overflow-hidden">
            <div className="shrink-0 flex-shrink-0 max-h-[35%] flex flex-col overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
              <ScientificTelemetryMetrics
                telemetry={telemetryData}
                isStreaming={isConnected}
              />
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-1 custom-scrollbar bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <FloodInundationTelemetryDashboard
                telemetry={{
                  timestamp: telemetryData.timestamp,
                  locationName: telemetryData.stationName,
                  windSpeedKmH: telemetryData.wind.speedKmH,
                  windGustKmH: telemetryData.wind.gustKmH,
                  windDirectionDeg: telemetryData.wind.directionDegrees,
                  relativeHumidityPercent: telemetryData.atmospheric.humidityPercent,
                  soilMoisturePercent: telemetryData.soil.soilSaturationPercent,
                  rainfallRateMmHr: telemetryData.rainfall.currentRateMmHr,
                  rainfall24hMm: telemetryData.rainfall.cumulative24hMm,
                  pressureHpa: telemetryData.atmospheric.pressureHpa,
                  pressureTrend: telemetryData.atmospheric.pressureTrend,
                  pressureDelta3h: telemetryData.atmospheric.pressureDelta3h,
                }}
                mapCenter={userLocation ? [userLocation.lon, userLocation.lat] : selectedCityInfo.coords}
              />
            </div>
          </div>
        )}
      </main>

      {/* Replay Time-Scrubber (Fixed shrink-0 height persistent footer bar) */}
      <footer className="shrink-0 flex-shrink-0 w-full px-4 pb-3 z-20">
        <ReplayScrubber
          isReplayMode={isReplayMode}
          onToggleReplayMode={handleToggleReplayMode}
          events={replayEvents}
          onSelectEventIndex={handleSelectReplayEventIndex}
        />
      </footer>

      {/* Modals */}
      {selectedRiskCell && (
        <RiskCardModal properties={selectedRiskCell} onClose={() => setSelectedRiskCell(null)} />
      )}
      {isAARModalOpen && (
        <ExportAARModal
          isOpen={isAARModalOpen}
          onClose={() => setIsAARModalOpen(false)}
          sosReports={sosReports}
          dispatchAssignments={dispatchAssignments}
          rescueUnits={rescueUnits}
          monitoredAreaKm2={analyticsStats?.monitored_area_km2 || 42.5}
        />
      )}
      {isSMSModalOpen && (
        <BroadcastSMSModal
          isOpen={isSMSModalOpen}
          onClose={() => setIsSMSModalOpen(false)}
          onToast={showToast}
          defaultMessage={`[ALERT] Emergency flood update for ${selectedCityInfo.name}: Rainfall intensity at ${telemetryData.rainfall.currentRateMmHr}mm/hr. Seek high ground if in low-lying sectors.`}
        />
      )}
    </div>
  );
}
