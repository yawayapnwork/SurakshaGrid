import { useEffect, useState } from 'react';
import { fetchLatestLiveRainfall, GridCenter } from '@/services/api';
import { LiveWeatherInfo } from '@/components/LeftController';

const POLL_INTERVAL_MS = 60_000; // matches the backend's 1hr reading freshness window with headroom to spare

/**
 * Polls GET /api/v1/risk-scores/live-rainfall/latest for the reading nearest `center`,
 * re-fetching whenever `center` itself changes (e.g. the map re-centers on the viewer's
 * real geolocation) in addition to the fixed interval. Previously the dashboard's "live"
 * weather ticker only ever reflected whatever the last WebSocket LIVE_RAINFALL_UPDATED
 * broadcast said — a single global value with no relationship to where this particular
 * client's map was actually looking. This hook is what makes the ticker (and, via
 * mode=live on /risk-scores/simulate, the risk grid itself) track the viewer's own
 * region instead.
 */
export function useLiveRainfall(
  center: GridCenter | null,
  enabled: boolean = true,
  /** Bump this (e.g. on a WebSocket LIVE_RAINFALL_UPDATED push) to force an immediate
   *  re-poll instead of waiting for the next fixed interval tick. */
  refreshTrigger: number = 0
): LiveWeatherInfo | null {
  const [liveWeatherInfo, setLiveWeatherInfo] = useState<LiveWeatherInfo | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let isSubscribed = true;

    const poll = () => {
      fetchLatestLiveRainfall(center || undefined)
        .then((reading) => {
          if (!isSubscribed || !reading) return;
          setLiveWeatherInfo({
            intensity: reading.rainfall_intensity,
            raw_mm: reading.raw_mm,
            source: reading.source,
            timestamp: reading.timestamp,
          });
        })
        .catch((err) => console.error('Failed to poll live rainfall:', err));
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [center?.lat, center?.lon, enabled, refreshTrigger]);

  return liveWeatherInfo;
}
