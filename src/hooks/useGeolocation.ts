import { useCallback, useEffect, useRef, useState } from 'react';
import { LocationState } from '../types';
import { findNearestAreaLabel, MANUAL_AREA_PRESETS } from '../utils/geo';
import { apiRequest } from '../lib/api';

const DEFAULT_PRESET = MANUAL_AREA_PRESETS[0];

export function useGeolocation(enabled: boolean, isAuthenticated: boolean) {
  const [location, setLocation] = useState<LocationState>({
    lat: DEFAULT_PRESET.lat,
    lng: DEFAULT_PRESET.lng,
    accuracy: null,
    areaLabel: DEFAULT_PRESET.label,
    source: 'manual',
    permissionStatus: typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'prompt' : 'unsupported',
    updatedAt: new Date().toISOString(),
  });
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSyncRef = useRef<number>(0);

  const syncLocationToServer = useCallback(
    async (lat: number, lng: number, areaLabel: string, force = false) => {
      if (!isAuthenticated || !enabled) return;
      const now = Date.now();
      if (!force && now - lastSyncRef.current < 25000) return;
      lastSyncRef.current = now;
      try {
        await apiRequest('/api/location/update', {
          method: 'POST',
          body: JSON.stringify({ lat, lng, areaLabel }),
        });
      } catch {
        // Ignore transient network errors during background active-tab refresh
      }
    },
    [enabled, isAuthenticated]
  );

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const requestGpsLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocation((prev) => ({ ...prev, permissionStatus: 'unsupported' }));
      setGpsError('Geolocation is not supported by this browser. Please select your area manually.');
      return;
    }
    if (!enabled) {
      setGpsError('Location sharing is currently paused in your privacy settings.');
      return;
    }

    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        const areaLabel = findNearestAreaLabel(lat, lng);
        const updatedAt = new Date().toISOString();
        setLocation({
          lat,
          lng,
          accuracy,
          areaLabel,
          source: 'gps',
          permissionStatus: 'granted',
          updatedAt,
        });
        setIsLocating(false);
        syncLocationToServer(lat, lng, areaLabel, true);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocation((prev) => ({ ...prev, permissionStatus: 'denied' }));
          setGpsError(
            'Location permission was denied. You can select your neighborhood manually below or enable Location Access in your browser site settings.'
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError('GPS signal is currently unavailable. Select your neighborhood manually below.');
        } else {
          setGpsError('Location request timed out. Try again or select your area manually.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [enabled, syncLocationToServer]);

  // Periodically update GPS ONLY when app is visible, authenticated, enabled, and granted
  useEffect(() => {
    if (!enabled || !isAuthenticated || location.permissionStatus !== 'granted' || location.source !== 'gps') {
      stopWatching();
      return;
    }

    const startWatch = () => {
      if (document.visibilityState !== 'visible' || !navigator.geolocation) return;
      stopWatching();
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy);
          const areaLabel = findNearestAreaLabel(lat, lng);
          setLocation({
            lat,
            lng,
            accuracy,
            areaLabel,
            source: 'gps',
            permissionStatus: 'granted',
            updatedAt: new Date().toISOString(),
          });
          syncLocationToServer(lat, lng, areaLabel, false);
        },
        () => {
          // Non-fatal watch update error
        },
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 }
      );
    };

    startWatch();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        startWatch();
      } else {
        stopWatching();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopWatching();
    };
  }, [enabled, isAuthenticated, location.permissionStatus, location.source, stopWatching, syncLocationToServer]);

  // Immediately halt GPS updates if location sharing is toggled off
  useEffect(() => {
    if (!enabled) {
      stopWatching();
    }
  }, [enabled, stopWatching]);

  const setManualLocation = useCallback(
    (lat: number, lng: number, areaLabel?: string) => {
      stopWatching();
      const label = areaLabel || findNearestAreaLabel(lat, lng);
      setGpsError(null);
      setLocation((prev) => ({
        ...prev,
        lat,
        lng,
        accuracy: null,
        areaLabel: label,
        source: 'manual',
        updatedAt: new Date().toISOString(),
      }));
      syncLocationToServer(lat, lng, label, true);
    },
    [stopWatching, syncLocationToServer]
  );

  return {
    location,
    gpsError,
    isLocating,
    requestGpsLocation,
    setManualLocation,
  };
}
