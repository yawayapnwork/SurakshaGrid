import { useEffect, useMemo, useRef, useState } from 'react';
import { DispatchRoute } from '@/types';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface CumulativePoint {
  coord: [number, number];
  distanceFromStart: number;
}

function buildCumulativeDistances(coordinates: [number, number][]): CumulativePoint[] {
  if (coordinates.length === 0) return [];
  const points: CumulativePoint[] = [{ coord: coordinates[0], distanceFromStart: 0 }];
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    total += haversineMeters(lat1, lon1, lat2, lon2);
    points.push({ coord: coordinates[i], distanceFromStart: total });
  }
  return points;
}

function interpolateAtDistance(points: CumulativePoint[], targetDistance: number): [number, number] {
  if (points.length === 0) return [0, 0];
  const total = points[points.length - 1].distanceFromStart;
  const clamped = Math.max(0, Math.min(targetDistance, total));

  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceFromStart >= clamped) {
      const prev = points[i - 1];
      const curr = points[i];
      const segLength = curr.distanceFromStart - prev.distanceFromStart;
      const segT = segLength === 0 ? 0 : (clamped - prev.distanceFromStart) / segLength;
      const [lon1, lat1] = prev.coord;
      const [lon2, lat2] = curr.coord;
      return [lon1 + (lon2 - lon1) * segT, lat1 + (lat2 - lat1) * segT];
    }
  }
  return points[points.length - 1].coord;
}

export interface RouteProgress {
  position: [number, number] | null;
  progress: number; // 0..1
  traveledMeters: number;
  remainingMeters: number;
  remainingSeconds: number;
  currentStepIndex: number;
}

/**
 * Simulates a rescue unit's position moving along its OSRM route in real time.
 *
 * SurakshaGrid has no backend GPS feed for rescue units — `RescueUnit.current_location`
 * is fixed at seed time and never updates, so there is no live position to poll or
 * subscribe to over WebSocket. This hook instead derives progress from elapsed
 * wall-clock time versus the route's OSRM-estimated duration, animated with
 * requestAnimationFrame for a smooth glide rather than discrete jumps. It's what makes
 * the marker in the nav view look "live" for this demo.
 *
 * The returned shape is deliberately position-source agnostic (id est, it doesn't leak
 * "this came from a timer"), so the moment real per-unit GPS tracking exists on the
 * backend (a position-update endpoint + a WebSocket broadcast), only this hook's
 * internals need to change — every caller (map marker, nav card) stays the same.
 */
export function useAnimatedRouteProgress(route: DispatchRoute | null): RouteProgress {
  const [progress, setProgress] = useState<RouteProgress>({
    position: null,
    progress: 0,
    traveledMeters: 0,
    remainingMeters: 0,
    remainingSeconds: 0,
    currentStepIndex: 0,
  });

  const cumulativePoints = useMemo(
    () => (route ? buildCumulativeDistances(route.geometry.coordinates) : []),
    [route]
  );

  const stepDistanceBounds = useMemo(() => {
    if (!route) return [];
    let cumulative = 0;
    return route.steps.map((step) => {
      const start = cumulative;
      cumulative += step.distance_meters;
      return { start, end: cumulative };
    });
  }, [route]);

  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!route || cumulativePoints.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived animation state when the route clears, no render-time alternative
      setProgress({
        position: null,
        progress: 0,
        traveledMeters: 0,
        remainingMeters: 0,
        remainingSeconds: 0,
        currentStepIndex: 0,
      });
      return;
    }

    startTimeRef.current = null;
    const totalDistance = cumulativePoints[cumulativePoints.length - 1].distanceFromStart;
    const durationMs = Math.max(route.duration_seconds, 1) * 1000;

    const tick = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsedMs = now - startTimeRef.current;
      const t = Math.min(elapsedMs / durationMs, 1);
      const traveledMeters = t * totalDistance;

      const currentStepIndex = Math.max(
        0,
        stepDistanceBounds.findIndex((bound) => traveledMeters < bound.end)
      );

      setProgress({
        position: interpolateAtDistance(cumulativePoints, traveledMeters),
        progress: t,
        traveledMeters,
        remainingMeters: Math.max(totalDistance - traveledMeters, 0),
        remainingSeconds: Math.max(route.duration_seconds * (1 - t), 0),
        currentStepIndex: currentStepIndex === -1 ? Math.max(stepDistanceBounds.length - 1, 0) : currentStepIndex,
      });

      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [route, cumulativePoints, stepDistanceBounds]);

  return progress;
}
