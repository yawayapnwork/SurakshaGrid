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

export interface RouteProgress {
  position: [number, number] | null;
  bearingDegrees: number;
  progress: number; // 0..1
  traveledMeters: number;
  remainingMeters: number;
  remainingSeconds: number;
  currentStepIndex: number;
}

function haversineBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

function interpolateAtDistance(
  points: CumulativePoint[],
  targetDistance: number
): { position: [number, number]; bearingDegrees: number } {
  if (points.length === 0) return { position: [0, 0], bearingDegrees: 0 };
  if (points.length === 1) return { position: points[0].coord, bearingDegrees: 0 };

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
      const interpolatedPos: [number, number] = [lon1 + (lon2 - lon1) * segT, lat1 + (lat2 - lat1) * segT];
      const bearing = haversineBearing(lat1, lon1, lat2, lon2);
      return { position: interpolatedPos, bearingDegrees: bearing };
    }
  }

  const lastPrev = points[points.length - 2];
  const lastCurr = points[points.length - 1];
  const bearing = haversineBearing(lastPrev.coord[1], lastPrev.coord[0], lastCurr.coord[1], lastCurr.coord[0]);
  return { position: lastCurr.coord, bearingDegrees: bearing };
}

/**
 * Simulates or tracks a rescue unit's position moving along its OSRM route in real time.
 *
 * Supports both smooth wall-clock time interpolation along OSRM polylines and real-time
 * coordinate overrides from WebSockets or n8n workflows. Calculates exact vehicle
 * heading/bearing angle in degrees along street segments for marker rotation.
 */
export function useAnimatedRouteProgress(
  route: DispatchRoute | null,
  realtimeLocation?: [number, number] | null
): RouteProgress {
  const [progress, setProgress] = useState<RouteProgress>({
    position: null,
    bearingDegrees: 0,
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived animation state when the route clears
      setProgress({
        position: null,
        bearingDegrees: 0,
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

      const interpolated = interpolateAtDistance(cumulativePoints, traveledMeters);

      // If a real-time WebSocket or n8n GPS feed position is provided, prioritize it
      const currentPos = realtimeLocation || interpolated.position;

      setProgress({
        position: currentPos,
        bearingDegrees: interpolated.bearingDegrees,
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
  }, [route, cumulativePoints, stepDistanceBounds, realtimeLocation]);

  return progress;
}
