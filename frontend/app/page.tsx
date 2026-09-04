'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { TopStatsBar } from '@/components/TopStatsBar';
import { LeftController, LiveWeatherInfo } from '@/components/LeftController';
import { RightDispatchQueue } from '@/components/RightDispatchQueue';
import { RiskCardModal } from '@/components/RiskCardModal';
import { ReplayScrubber } from '@/components/ReplayScrubber';
import { ExportAARModal } from '@/components/ExportAARModal';
import { playTwoToneEmergencyAlert } from '@/components/AudioAlertManager';
import { useDebounce } from '@/hooks/useDebounce';
import { useDemoTour } from '@/hooks/useDemoTour';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  fetchLiveAnalyticsStats,
  fetchReplayEvents,
  fetchSimulatedFloodZones,
  fetchSimulatedRiskScores,
  resetSimulationScenario,
  triggerOptimizeDispatch,
  triggerSimulationScenario,
} from '@/services/api';
import { DispatchAssignment, EventLog, LiveAnalyticsStats, RescueUnit, RiskFeatureProperties, RiskGridCollection, SOSReport } from '@/types';
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
  const [liveWeatherInfo, setLiveWeatherInfo] = useState<LiveWeatherInfo | null>(null);

  const [riskGrid, setRiskGrid] = useState<RiskGridCollection | null>(null);
  const [floodZones, setFloodZones] = useState<any | null>(null);
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

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  // 2. Replay Mode State
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replayEvents, setReplayEvents] = useState<EventLog[]>([]);

  // Active Simulation ID State (persisted in sessionStorage for multi-tenant isolation)
  const [activeSimId, setActiveSimId] = useState<string | null>(null);

  // Load sound mute preference and active sim_id on client mount
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

  // 3. What-If Risk Simulation & Flood Zone Data Fetching
  useEffect(() => {
    let isSubscribed = true;
    Promise.all([
      fetchSimulatedRiskScores(debouncedRainfall, activeSimId || undefined, riskMode),
      fetchSimulatedFloodZones(debouncedRainfall, activeSimId || undefined),
    ])
      .then(([riskData, floodData]) => {
        if (isSubscribed) {
          setRiskGrid(riskData);
          setFloodZones(floodData);
        }
      })
      .catch((err) => console.error('Error simulating risk scores or flood zones:', err));

    return () => {
      isSubscribed = false;
    };
  }, [debouncedRainfall, activeSimId, riskMode, liveWeatherInfo]);

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
    (msg: { event: string; data: Record<string, any> }) => {
      if (isReplayMode) return; // Pause live WebSocket updates in replay mode

      const { event, data } = msg;

      if (event === 'LIVE_RAINFALL_UPDATED') {
        const info: LiveWeatherInfo = {
          intensity: data.rainfall_intensity,
          raw_mm: data.raw_mm,
          source: data.source || 'OpenWeatherMap',
          timestamp: data.timestamp || new Date().toISOString(),
        };
        setLiveWeatherInfo(info);
        showToast(`Live weather update: ${data.rainfall_intensity}mm/hr (${data.source || 'OpenWeatherMap'})`, 'info');
      } else if (event === 'SOS_CREATED') {
        const newReport: SOSReport = {
          id: data.sos_id,
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
          prev.map((r) => (r.id === data.sos_id ? { ...r, trust_score: data.trust_score } : r))
        );
      } else if (event === 'UNIT_DISPATCHED') {
        const assignment: DispatchAssignment = {
          sos_id: data.sos_id,
          rescue_unit_id: data.rescue_unit_id,
          unit_name: data.unit_name,
          eta_seconds: data.eta_seconds,
          cost: data.cost,
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
          const updatedFeatureCollection = {
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
      showToast('Failed to trigger simulation scenario', 'info');
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
      showToast('Dispatch optimizer failed', 'info');
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
    let latestZonePayload: any = null;

    historicalEvents.forEach((evt) => {
      const p = evt.payload;
      if (evt.event_type === 'SOS_CREATED') {
        reconstructedSos.set(p.sos_id, {
          id: p.sos_id,
          location: { type: 'Point', coordinates: [p.longitude || 80.27, p.latitude || 13.08] },
          status: 'PENDING',
          severity: p.severity || 'HIGH',
          trust_score: p.trust_score || 0,
          created_at: evt.occurred_at,
        });
      } else if (evt.event_type === 'SOS_CONFIRMED') {
        const existing = reconstructedSos.get(p.sos_id);
        if (existing) {
          existing.trust_score = p.trust_score;
        }
      } else if (evt.event_type === 'UNIT_DISPATCHED') {
        const existing = reconstructedSos.get(p.sos_id);
        if (existing) {
          existing.status = 'ASSIGNED';
        }
        reconstructedDispatches.push({
          sos_id: p.sos_id,
          rescue_unit_id: p.rescue_unit_id,
          unit_name: p.unit_name || 'Rescue Unit',
          eta_seconds: p.eta_seconds || 300,
          cost: p.cost || 5.0,
          assigned_at: evt.occurred_at,
        });
      } else if (evt.event_type === 'ZONE_EXPANDED') {
        latestZonePayload = p;
      }
    });

    setSosReports(Array.from(reconstructedSos.values()));
    setDispatchAssignments(reconstructedDispatches);

    if (latestZonePayload && latestZonePayload.geometry) {
      setFloodZones({
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
      });
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
    <main className="w-full h-screen overflow-hidden flex flex-col bg-[#F8FAFC] font-sans">
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
        demoState={demoTour}
      />

      {/* Map + floating panels area: panels are positioned relative to THIS
          container (not the viewport), so header height/wrapping can never
          push them out of place or make them overlap each other. */}
      <div className="relative flex-1 min-h-0">
        {/* Non-Blocking Toast Notification */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce">
            <div
              className={`px-4 py-2.5 rounded-full border shadow-lg shadow-slate-900/10 backdrop-blur-md flex items-center gap-2 text-xs font-bold ${
                toastMessage.type === 'success'
                  ? 'bg-emerald-50/95 text-emerald-700 border-emerald-200'
                  : 'bg-sky-50/95 text-sky-700 border-sky-200'
              }`}
            >
              {toastMessage.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              ) : (
                <Info className="w-4 h-4 text-sky-600" />
              )}
              <span>{toastMessage.text}</span>
              <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-75">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 2. Central Interactive Map with Error Boundary */}
        <MapErrorBoundary>
          <MapContainer
            riskGrid={riskGrid}
            floodZones={floodZones}
            sosReports={sosReports}
            rescueUnits={rescueUnits}
            dispatchAssignments={dispatchAssignments}
            onSelectRiskCell={setSelectedRiskCell}
          />
        </MapErrorBoundary>

        {/* 3. Left Controller Drawer */}
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

        {/* 4. Right Live Dispatch Queue Drawer */}
        <RightDispatchQueue assignments={dispatchAssignments} />

        {/* 7. Replay Time-Scrubber Control */}
        <ReplayScrubber
          events={replayEvents}
          isReplayMode={isReplayMode}
          onToggleReplayMode={handleToggleReplayMode}
          onSelectEventIndex={handleSelectReplayEventIndex}
        />
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
    </main>
  );
}
