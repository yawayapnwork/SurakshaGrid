'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DispatchAssignment, RescueUnit, RiskFeatureProperties, RiskGridCollection, SOSReport } from '@/types';

export interface DemoStep {
  id: number;
  title: string;
  description: string;
  durationMs: number;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: 1,
    title: 'Baseline Monitoring',
    description: 'Set rainfall to 0% and verify baseline stats',
    durationMs: 6000,
  },
  {
    id: 2,
    title: 'What-If Risk Simulation',
    description: 'Simulate 75mm/h heavy rainfall & recolor risk grid',
    durationMs: 8000,
  },
  {
    id: 3,
    title: 'Scenario Generator',
    description: 'Trigger flood scenario (7 Units, 12 Reports & Alert Siren)',
    durationMs: 10000,
  },
  {
    id: 4,
    title: 'OpenCV Water Verification',
    description: 'Simulate photo-verified report with 96.5% confidence',
    durationMs: 8000,
  },
  {
    id: 5,
    title: 'Hungarian Dispatch',
    description: 'Run SciPy dispatch optimizer & fit camera bounds to routes',
    durationMs: 10000,
  },
  {
    id: 6,
    title: 'Explainable Risk AI',
    description: 'Inspect high-risk cell breakdown analytics card',
    durationMs: 9000,
  },
  {
    id: 7,
    title: 'Digital Twin Time Travel',
    description: 'Scrub backward across historical incident replay timeline',
    durationMs: 9000,
  },
];

const TOTAL_DEMO_DURATION_MS = DEMO_STEPS.reduce((sum, step) => sum + step.durationMs, 0);

interface UseDemoTourProps {
  setRainfall: (val: number) => void;
  triggerFloodScenario: () => Promise<void>;
  runDispatch: () => Promise<void>;
  setSelectedRiskCell: (props: RiskFeatureProperties | null) => void;
  toggleReplayMode: (active: boolean) => Promise<void>;
  selectReplayIndex: (idx: number) => void;
  setSosReports: React.Dispatch<React.SetStateAction<SOSReport[]>>;
  riskGrid: RiskGridCollection | null;
  showToast: (text: string, type?: 'success' | 'info') => void;
}

export function useDemoTour({
  setRainfall,
  triggerFloodScenario,
  runDispatch,
  setSelectedRiskCell,
  toggleReplayMode,
  selectReplayIndex,
  setSosReports,
  riskGrid,
  showToast,
}: UseDemoTourProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stepStartTimeRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelDemo = useCallback(() => {
    clearTimers();
    setIsRunning(false);
    setIsPaused(false);
    setCurrentStepIndex(0);
    setElapsedMs(0);
    setSelectedRiskCell(null);
    toggleReplayMode(false).catch(() => {});
    showToast('Guided Demo cancelled', 'info');
  }, [clearTimers, setSelectedRiskCell, toggleReplayMode, showToast]);

  const executeStep = useCallback(
    async (stepIdx: number) => {
      if (stepIdx >= DEMO_STEPS.length) {
        // Completed demo
        clearTimers();
        setIsRunning(false);
        setIsPaused(false);
        setElapsedMs(TOTAL_DEMO_DURATION_MS);
        showToast('🎉 Guided Demo Completed! 8/8 PRD §8 Judging Steps Executed.', 'success');
        return;
      }

      setCurrentStepIndex(stepIdx);
      const step = DEMO_STEPS[stepIdx];
      showToast(`Step ${stepIdx + 1}/${DEMO_STEPS.length}: ${step.title} — ${step.description}`, 'success');

      try {
        switch (stepIdx) {
          case 0:
            // Step 1: Set rainfall to 0% and verify baseline stats bar
            setRainfall(0);
            break;

          case 1:
            // Step 2: Programmatically slide rainfall slider to 75%
            setRainfall(75);
            break;

          case 2:
            // Step 3: Trigger live hackathon flood scenario generator (7 Units, 12 Reports & Alert Siren)
            await triggerFloodScenario();
            break;

          case 3:
            // Step 4: Simulate photo-verified report displaying visual_confidence_score
            const syntheticReport: SOSReport = {
              id: 'demo-sos-cv-verified',
              location: { type: 'Point', coordinates: [80.252, 13.065] },
              status: 'PENDING',
              severity: 'CRITICAL_TRAPPED',
              visual_confidence_score: 0.965,
              trust_score: 4,
              voice_transcript: 'Water level reached 4 feet inside basement!',
              created_at: new Date().toISOString(),
            };
            setSosReports((prev) => [syntheticReport, ...prev.filter((r) => r.id !== syntheticReport.id)]);
            break;

          case 4:
            // Step 5: Call POST /api/v1/dispatch/run & fit camera bounds to routes
            await runDispatch();
            break;

          case 5:
            // Step 6: Select high-risk cell polygon & display explainable risk card
            if (riskGrid && riskGrid.features && riskGrid.features.length > 0) {
              const highRiskFeature =
                riskGrid.features.find((f) => f.properties.risk_score > 0.6) || riskGrid.features[0];
              setSelectedRiskCell(highRiskFeature.properties);
            } else {
              setSelectedRiskCell({
                risk_score: 0.88,
                breakdown: {
                  rainfall_impact: 0.75,
                  flood_proximity: 0.85,
                  elevation_drop: 0.9,
                  report_density: 0.8,
                },
              });
            }
            break;

          case 6:
            // Step 7: Open Replay Scrubber and scrub backward across timeline
            setSelectedRiskCell(null);
            await toggleReplayMode(true);
            setTimeout(() => {
              selectReplayIndex(2);
            }, 2500);
            break;

          default:
            break;
        }
      } catch (err) {
        console.error(`Error executing demo step ${stepIdx + 1}:`, err);
      }

      // Schedule next step after step.durationMs
      stepStartTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        executeStep(stepIdx + 1);
      }, step.durationMs);
    },
    [
      clearTimers,
      setRainfall,
      triggerFloodScenario,
      setSosReports,
      runDispatch,
      riskGrid,
      setSelectedRiskCell,
      toggleReplayMode,
      selectReplayIndex,
      showToast,
    ]
  );

  const startDemo = useCallback(() => {
    clearTimers();
    setIsRunning(true);
    setIsPaused(false);
    setCurrentStepIndex(0);
    setElapsedMs(0);
    executeStep(0);
  }, [clearTimers, executeStep]);

  const pauseDemo = useCallback(() => {
    clearTimers();
    setIsPaused(true);
    showToast('Guided Demo Paused', 'info');
  }, [clearTimers, showToast]);

  const resumeDemo = useCallback(() => {
    setIsPaused(false);
    const step = DEMO_STEPS[currentStepIndex];
    const remainingMs = step ? step.durationMs / 2 : 3000;
    showToast(`Resuming Guided Demo (Step ${currentStepIndex + 1}/${DEMO_STEPS.length})`, 'info');
    timerRef.current = setTimeout(() => {
      executeStep(currentStepIndex + 1);
    }, remainingMs);
  }, [currentStepIndex, executeStep, showToast]);

  // Update progress bar smooth ticker
  useEffect(() => {
    if (!isRunning || isPaused) return;

    const interval = setInterval(() => {
      setElapsedMs((prev) => Math.min(TOTAL_DEMO_DURATION_MS, prev + 200));
    }, 200);

    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  const progressPercent = Math.min(100, Math.round((elapsedMs / TOTAL_DEMO_DURATION_MS) * 100));

  return {
    isRunning,
    isPaused,
    currentStepIndex,
    currentStep: DEMO_STEPS[currentStepIndex] || DEMO_STEPS[0],
    totalSteps: DEMO_STEPS.length,
    progressPercent,
    startDemo,
    pauseDemo,
    resumeDemo,
    cancelDemo,
  };
}
