'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { TopStatsBar } from '@/components/TopStatsBar';
import { LeftController } from '@/components/LeftController';
import { RightDispatchQueue } from '@/components/RightDispatchQueue';
import { RiskCardModal } from '@/components/RiskCardModal';
import { ReplayScrubber } from '@/components/ReplayScrubber';
import { playCriticalAudioAlert } from '@/components/AudioAlertManager';
import { useDebounce } from '@/hooks/useDebounce';
import { useWebSocket } from '@/hooks/useWebSocket';
import { createSOSReport, fetchReplayEvents, fetchSimulatedRiskScores, triggerOptimizeDispatch } from '@/services/api';
import { DispatchAssignment, EventLog, RescueUnit, RiskFeatureProperties, RiskGridCollection, SOSReport } from '@/types';

// Dynamically import MapContainer to prevent SSR hydration errors with maplibre-gl
const MapContainer = dynamic(
  () => import('@/components/MapContainer').then((mod) => mod.MapContainer),
  { ssr: false }
);

// Initial Default Rescue Units for demonstration
const INITIAL_RESCUE_UNITS: RescueUnit[] = [
  {
    id: 'unit-boat-01',
    name: 'NDRF Rescue Boat Alpha',
    unit_type: 'BOAT',
    current_location: { type: 'Point', coordinates: [80.27, 13.08] },
    status: 'AVAILABLE',
  },
  {
    id: 'unit-amb-02',
    name: 'SDRF Ambulance Bravo',
    unit_type: 'AMBULANCE',
    current_location: { type: 'Point', coordinates: [80.20, 13.00] },
    status: 'AVAILABLE',
  },
  {
    id: 'unit-drone-03',
    name: 'Survey Drone Charlie',
    unit_type: 'DRONE',
    current_location: { type: 'Point', coordinates: [80.24, 13.05] },
    status: 'AVAILABLE',
  },
];

export default function DashboardPage() {
  // 1. Dashboard State
  const [rainfall, setRainfall] = useState<number>(0);
  const debouncedRainfall = useDebounce(rainfall, 250);

  const [riskGrid, setRiskGrid] = useState<RiskGridCollection | null>(null);
  const [sosReports, setSosReports] = useState<SOSReport[]>([]);
  const [rescueUnits, setRescueUnits] = useState<RescueUnit[]>(INITIAL_RESCUE_UNITS);
  const [dispatchAssignments, setDispatchAssignments] = useState<DispatchAssignment[]>([]);

  const [selectedRiskCell, setSelectedRiskCell] = useState<RiskFeatureProperties | null>(null);

  const [isDispatching, setIsDispatching] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);

  // 2. Replay Mode State
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replayEvents, setReplayEvents] = useState<EventLog[]>([]);

  // 3. What-If Risk Simulation Data Fetching
  useEffect(() => {
    let isSubscribed = true;
    fetchSimulatedRiskScores(debouncedRainfall)
      .then((data) => {
        if (isSubscribed) {
          setRiskGrid(data);
        }
      })
      .catch((err) => console.error('Error simulating risk scores:', err));

    return () => {
      isSubscribed = false;
    };
  }, [debouncedRainfall]);

  // 4. WebSocket Message Handler
  const handleWebSocketMessage = useCallback((msg: { event: string; data: Record<string, any> }) => {
    if (isReplayMode) return; // Pause live WebSocket updates in replay mode

    const { event, data } = msg;

    if (event === 'SOS_CREATED') {
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

      // Play Web Audio Alert tone if CRITICAL_TRAPPED
      if (newReport.severity === 'CRITICAL_TRAPPED') {
        playCriticalAudioAlert();
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
    }
  }, [isReplayMode]);

  // Connect WebSocket Hook
  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
    enabled: !isReplayMode,
  });

  // 5. Trigger Flood Event Scenario Handler
  const handleTriggerFloodScenario = async () => {
    setIsTriggering(true);
    try {
      // Create synthetic high-severity SOS report around flood zone
      const lat = 13.08 + (Math.random() - 0.5) * 0.05;
      const lon = 80.27 + (Math.random() - 0.5) * 0.05;
      const severities = ['HIGH', 'CRITICAL_TRAPPED', 'MEDIUM'];
      const chosenSev = severities[Math.floor(Math.random() * severities.length)];

      const report = await createSOSReport({
        latitude: lat,
        longitude: lon,
        severity: chosenSev,
        voice_transcript: 'Emergency scenario: Water level rising quickly near residential complex!',
      });

      setSosReports((prev) => [report, ...prev]);

      if (chosenSev === 'CRITICAL_TRAPPED') {
        playCriticalAudioAlert();
      }
    } catch (err) {
      console.error('Failed to trigger flood scenario:', err);
    } finally {
      setIsTriggering(false);
    }
  };

  // 6. Run Rescue Dispatch Handler
  const handleRunDispatch = async () => {
    setIsDispatching(true);
    try {
      const assignments = await triggerOptimizeDispatch();
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
      }
    } catch (err) {
      console.error('Failed to run rescue dispatch optimizer:', err);
    } finally {
      setIsDispatching(false);
    }
  };

  // 7. Toggle Replay Mode & Load Timeline Events
  const handleToggleReplayMode = async (active: boolean) => {
    setIsReplayMode(active);
    if (active) {
      try {
        const events = await fetchReplayEvents();
        setReplayEvents(events);
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
      }
    });

    setSosReports(Array.from(reconstructedSos.values()));
    setDispatchAssignments(reconstructedDispatches);
  };

  // Derived Top Stats
  const activeSosCount = sosReports.filter((r) => r.status !== 'RESOLVED').length;
  const criticalCount = sosReports.filter((r) => r.severity === 'CRITICAL_TRAPPED').length;
  const dispatchedUnitsCount = rescueUnits.filter((u) => u.status === 'DISPATCHED').length;

  const avgEtaMinutes =
    dispatchAssignments.length > 0
      ? dispatchAssignments.reduce((acc, a) => acc + a.eta_seconds / 60, 0) / dispatchAssignments.length
      : 0;

  return (
    <main className="w-full h-screen overflow-hidden flex flex-col relative bg-slate-950 font-sans">
      {/* 1. Persistent Top Stats Bar */}
      <TopStatsBar
        monitoredAreaKm2={42.5}
        activeSosCount={activeSosCount}
        criticalCount={criticalCount}
        dispatchedUnitsCount={dispatchedUnitsCount}
        avgEtaMinutes={avgEtaMinutes}
        isConnected={isConnected}
        isReplayMode={isReplayMode}
      />

      {/* 2. Central Interactive Map */}
      <MapContainer
        riskGrid={riskGrid}
        sosReports={sosReports}
        rescueUnits={rescueUnits}
        dispatchAssignments={dispatchAssignments}
        onSelectRiskCell={setSelectedRiskCell}
      />

      {/* 3. Left Controller Drawer */}
      <LeftController
        rainfall={rainfall}
        onRainfallChange={setRainfall}
        onTriggerFloodScenario={handleTriggerFloodScenario}
        onRunDispatch={handleRunDispatch}
        isDispatching={isDispatching}
        isTriggering={isTriggering}
      />

      {/* 4. Right Live Dispatch Queue Drawer */}
      <RightDispatchQueue assignments={dispatchAssignments} />

      {/* 5. Explainable Risk Card Modal */}
      <RiskCardModal
        properties={selectedRiskCell}
        onClose={() => setSelectedRiskCell(null)}
      />

      {/* 6. Replay Time-Scrubber Control */}
      <ReplayScrubber
        events={replayEvents}
        isReplayMode={isReplayMode}
        onToggleReplayMode={handleToggleReplayMode}
        onSelectEventIndex={handleSelectReplayEventIndex}
      />
    </main>
  );
}
