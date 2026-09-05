'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { TopStatsBar } from '@/components/TopStatsBar';
import { LeftController } from '@/components/LeftController';
import { RightDispatchQueue } from '@/components/RightDispatchQueue';
import { RiskCardModal } from '@/components/RiskCardModal';
import { ReplayScrubber } from '@/components/ReplayScrubber';
import { BroadcastSMSModal } from '@/components/BroadcastSMSModal';
import { ExportAARModal } from '@/components/ExportAARModal';
import { playTwoToneEmergencyAlert } from '@/components/AudioAlertManager';
import { useDebounce } from '@/hooks/useDebounce';
import { useDemoTour } from '@/hooks/useDemoTour';
import { useLiveRainfall } from '@/hooks/useLiveRainfall';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  fetchActiveSOSReports,
  fetchLiveAnalyticsStats,
  fetchReplayEvents,
  fetchSimulatedFloodZones,
  fetchSimulatedRiskScores,
  resetSimulationScenario,
  triggerOptimizeDispatch,
  triggerSimulationScenario,
} from '@/services/api';
import { DispatchAssignment, EventLog, EventPayload, FloodZoneCollection, LiveAnalyticsStats, RescueUnit, RiskFeatureProperties, RiskGridCollection, SOSReport } from '@/types';
import { CheckCircle, Info, X } from 'lucide-react';

import { MapErrorBoundary } from '@/components/MapErrorBoundary';

// Dynamically import MapContainer to prevent SSR hydration errors with maplibre-gl
const MapContainer = dynamic(
  () => import('@/components/MapContainer').then((mod) => mod.MapContainer),
  { ssr: false }
);

export default function DashboardPage() {
  // 1. Dashboard State
  const [rainfall, setRainfall] = useState<number>(0);
  const debouncedRainfall = useDebounce(rainfall, 250);

  const [riskMode, setRiskMode] = useState<'simulated' | 'live'>('simulated');
  // Bumped on a WebSocket LIVE_RAINFALL_UPDATED push to force useLiveRainfall to re-poll
  // immediately instead of waiting for its next fixed interval tick.
  const [rainfallRefreshTrigger, setRainfallRefreshTrigger] = useState(0);

  const [riskGrid, setRiskGrid] = useState<RiskGridCollection | null>(null);
  const [floodZones, setFloodZones] = useState<FloodZoneCollection | null>(null);
  const [sosReports, setSosReports] = useState<SOSReport[]>([]);
  const [rescueUnits, setRescueUnits] = useState<RescueUnit[]>([]);
  const [dispatchAssignments, setDispatchAssignments] = useState<DispatchAssignment[]>([]);
  const [analyticsStats, setAnalyticsStats] = useState<LiveAnalyticsStats | null>(null);

  const [selectedRiskCell, setSelectedRiskCell] = useState<RiskFeatureProperties | null>(null);

  const [isDispatching, setIsDispatching] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Audio Siren Mute State (persisted in localStorage)
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // AAR Report Modal State
  const [isAARModalOpen, setIsAARModalOpen] = useState(false);

  // Broadcast SMS Alert Modal State
  const [isSMSModalOpen, setIsSMSModalOpen] = useState(false);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  // 2. Replay Mode State
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replayEvents, setReplayEvents] = useState<EventLog[]>([]);

  // Active Simulation ID State (persisted in sessionStorage for multi-tenant isolation)
  const [activeSimId, setActiveSimId] = useState<string | null>(null);

  // Viewer's real device location, resolved by MapContainer's geolocation lookup. Once
  // set, the risk grid / flood zone simulation re-centers on it instead of Chennai.
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  // Polls the live rainfall reading nearest to userLocation (see useLiveRainfall) — the
  // authoritative, region-aware source for the "Live Feed" ticker and mode=live risk
  // grid, replacing the old approach of only ever reflecting whatever the last global
  // WebSocket broadcast said regardless of where this client's map was looking.
  const liveWeatherInfo = useLiveRainfall(userLocation, riskMode === 'live', rainfallRefreshTrigger);

  // Load sound mute preference and active sim_id on client mount.
  // localStorage/sessionStorage don't exist during SSR, so this can only run
  // client-side after mount — an effect is the correct (unavoidable) place.
  useEffect(() => {
    const savedMute = localStorage.getItem('surakshagrid_muted');
    if (savedMute !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from browser-only storage, no render-time alternative
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

  // 3. What-If Risk Simulation & Flood Zone Data Fetching
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

  // Periodic polling (every 3s) for live analytics aggregator metrics
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

  // Periodic timer (every 10s) to update elapsed time visual state machine
  useEffect(() => {
    const timer = setInterval(() => {
      setSosReports((prev) => [...prev]); // Trigger re-render for marker elapsed time state
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // 4. WebSocket Message Handler
  const handleWebSocketMessage = useCallback(
    (msg: { event: string; data: EventPayload }) => {
      if (isReplayMode) return; // Pause live WebSocket updates in replay mode

      const { event, data } = msg;

      if (event === 'LIVE_RAINFALL_UPDATED') {
        // This broadcast has no relationship to whether the new reading is actually
        // near this client's own map location — trigger useLiveRainfall to re-poll
        // (which filters by userLocation) rather than trusting the pushed payload
        // directly, so a reading ingested for a different region doesn't overwrite
        // this client's correctly region-scoped weather state.
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

        // Fire synthetic two-tone siren alert if CRITICAL_TRAPPED
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

        setDispatchAssignments((prev) => [assignment, ...prev]);

        // Update unit status to DISPATCHED
        setRescueUnits((prev) =>
          prev.map((u) => (u.id === data.rescue_unit_id ? { ...u, status: 'DISPATCHED' } : u))
        );

        // Update SOS report status to ASSIGNED
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

  // Connect WebSocket Hook
  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
    enabled: !isReplayMode,
  });

  // Hydrate active SOS reports from the shared backend on every (re)connect, not just on
  // first mount. Without this, sosReports only ever grows from SOS_CREATED WebSocket
  // events received *after* this client connected — a freshly opened dashboard, or one
  // reconnecting after a dropped socket, would otherwise start from an empty list and
  // stay blind to every report that already exists in the database. Merged by id rather
  // than replaced outright, so it can't clobber a report a WS message just added in the
  // same tick.
  useEffect(() => {
    if (!isConnected || isReplayMode) return;
    let isSubscribed = true;

    fetchActiveSOSReports(activeSimId || undefined)
      .then((reports) => {
        if (!isSubscribed) return;
        setSosReports((prev) => {
          const merged = new Map(prev.map((r) => [r.id, r]));
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

  // 5. Hackathon Live Scenario Generator Handler
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

      // Safety fallback timer (~100s) to guarantee isTriggering clears even if WS connection drops
      setTimeout(() => {
        setIsTriggering(false);
      }, 100000);
    } catch (err) {
      console.error('Failed to trigger live simulation scenario:', err);
      showToast(err instanceof Error ? err.message : 'Failed to trigger simulation scenario.', 'info');
      setIsTriggering(false);
    }
  };

  // Reset Scenario Handler
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

  // 6. Run Rescue Dispatch Handler
  const handleRunDispatch = async () => {
    setIsDispatching(true);
    try {
      const assignments = await triggerOptimizeDispatch(activeSimId || undefined);
      setDispatchAssignments(assignments);

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

  // 7. Toggle Replay Mode & Load Timeline Events
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

  // Replay Step Handler (moves forward/backward through past event logs)
  const handleSelectReplayEventIndex = (idx: number) => {
    if (idx < 0 || idx >= replayEvents.length) return;

    // Filter events up to selected index to reconstruct historical digital twin state
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

  // Derived Top Stats (prefer live analytics stats if available)
  const activeSosCount = analyticsStats ? analyticsStats.active_sos_count : sosReports.filter((r) => r.status !== 'RESOLVED').length;
  const criticalCount = analyticsStats ? analyticsStats.critical_sos_count : sosReports.filter((r) => r.severity === 'CRITICAL_TRAPPED').length;
  const dispatchedUnitsCount = analyticsStats ? analyticsStats.dispatched_units_count : rescueUnits.filter((u) => u.status === 'DISPATCHED').length;

  const avgEtaMinutes = analyticsStats
    ? analyticsStats.avg_eta_minutes
    : dispatchAssignments.length > 0
    ? dispatchAssignments.reduce((acc, a) => acc + a.eta_seconds / 60, 0) / dispatchAssignments.length
    : 0;

  // Guided Demo Tour Orchestrator (PRD §8 Automated Judging Runner)
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

  return (
    // Mobile/tablet: the whole page scrolls (grid + stacked panels exceed one viewport).
    // Desktop (lg+): pinned to the viewport height. overflow-x-hidden guards against any
    // child (e.g. the map) ever forcing horizontal scroll on the page.
    <main className="w-full min-h-screen lg:h-screen overflow-x-hidden overflow-y-auto lg:overflow-hidden flex flex-col bg-[#F8FAFC] font-sans">
      {/* 1. Persistent Top Stats Bar */}
      <TopStatsBar
        monitoredAreaKm2={analyticsStats ? analyticsStats.monitored_area_km2 : 42.5}
        activeSosCount={activeSosCount}
        criticalCount={criticalCount}
        dispatchedUnitsCount={dispatchedUnitsCount}
        avgEtaMinutes={avgEtaMinutes}
        isConnected={isConnected}
        isReplayMode={isReplayMode}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onOpenAARModal={() => setIsAARModalOpen(true)}
        onOpenSMSModal={() => setIsSMSModalOpen(true)}
        demoState={demoTour}
      />

      {/* Non-Blocking Toast Notification — fixed to the viewport, independent of the
          grid below, so it stays visible even while the mobile stack is scrolled. */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div
            className={`px-4 py-2.5 rounded-xl border shadow-sm backdrop-blur-md flex items-center gap-2 text-xs font-semibold ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50/95 text-emerald-700 border-emerald-200'
                : 'bg-white/95 text-slate-700 border-slate-200'
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

      {/* Dashboard grid: 1 column (stacked) below lg, a 12-column grid at lg+ with
          non-overlapping, explicitly-sized columns — sidebar (3) / map (6) / queue (3).
          `lg:min-h-0` lets this area shrink inside the flex-col `main` instead of
          overflowing it, which is what makes `lg:h-full` on each cell below resolve
          to a real, bounded height rather than growing unbounded. */}
      <div className="flex-1 lg:min-h-0 overflow-y-auto lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:h-full">
          {/* 2. Left Controller — sidebar column */}
          <div className="lg:col-span-3 lg:h-full lg:min-h-0">
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

          {/* 3. Central Interactive Map — its own bounded, rounded card; no longer a
              full-bleed background with panels floating on top of it. */}
          <div className="lg:col-span-6 relative h-[50vh] lg:h-full min-h-[320px] rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden bg-slate-100">
            <MapErrorBoundary>
              <MapContainer
                riskGrid={riskGrid}
                floodZones={floodZones}
                sosReports={sosReports}
                rescueUnits={rescueUnits}
                dispatchAssignments={dispatchAssignments}
                onSelectRiskCell={setSelectedRiskCell}
                onLocationResolved={setUserLocation}
              />
            </MapErrorBoundary>
          </div>

          {/* 4. Right Live Dispatch Queue — queue column */}
          <div className="lg:col-span-3 lg:h-full lg:min-h-0">
            <RightDispatchQueue assignments={dispatchAssignments} />
          </div>

          {/* 5. Replay Time-Scrubber — its own full-width row below the grid columns */}
          <div className="lg:col-span-12">
            <ReplayScrubber
              events={replayEvents}
              isReplayMode={isReplayMode}
              onToggleReplayMode={handleToggleReplayMode}
              onSelectEventIndex={handleSelectReplayEventIndex}
            />
          </div>
        </div>
      </div>

      {/* 5. Explainable Risk Card Modal */}
      <RiskCardModal
        properties={selectedRiskCell}
        onClose={() => setSelectedRiskCell(null)}
      />

      {/* 6. Incident After-Action Report (AAR) Export Modal */}
      <ExportAARModal
        isOpen={isAARModalOpen}
        onClose={() => setIsAARModalOpen(false)}
        sosReports={sosReports}
        rescueUnits={rescueUnits}
        dispatchAssignments={dispatchAssignments}
        monitoredAreaKm2={analyticsStats ? analyticsStats.monitored_area_km2 : 42.5}
      />

      {/* 7. Broadcast SMS Alert Modal */}
      <BroadcastSMSModal
        isOpen={isSMSModalOpen}
        onClose={() => setIsSMSModalOpen(false)}
        onToast={showToast}
      />
    </main>
  );
}
