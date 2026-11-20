export interface AreaPreset {
  id: string;
  label: string;
  city: string;
  lat: number;
  lng: number;
}

export const MANUAL_AREA_PRESETS: AreaPreset[] = [
  { id: 'blr-indiranagar', label: 'Indiranagar, Bengaluru', city: 'Bengaluru', lat: 12.9784, lng: 77.6408 },
  { id: 'blr-koramangala', label: 'Koramangala 4th Block, Bengaluru', city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  { id: 'blr-hsr', label: 'HSR Layout Sector 2, Bengaluru', city: 'Bengaluru', lat: 12.9121, lng: 77.6446 },
  { id: 'mum-bandra', label: 'Bandra West, Mumbai', city: 'Mumbai', lat: 19.0596, lng: 72.8295 },
  { id: 'mum-andheri', label: 'Andheri West, Mumbai', city: 'Mumbai', lat: 19.1197, lng: 72.8464 },
  { id: 'del-cp', label: 'Connaught Place, New Delhi', city: 'New Delhi', lat: 28.6315, lng: 77.2167 },
  { id: 'del-hauzkhas', label: 'Hauz Khas, New Delhi', city: 'New Delhi', lat: 28.5494, lng: 77.2001 },
  { id: 'pun-koregaon', label: 'Koregaon Park, Pune', city: 'Pune', lat: 18.5362, lng: 73.8940 },
  { id: 'hyd-jubilee', label: 'Jubilee Hills, Hyderabad', city: 'Hyderabad', lat: 17.4326, lng: 78.4071 },
  { id: 'che-adyar', label: 'Adyar, Chennai', city: 'Chennai', lat: 13.0012, lng: 80.2565 },
  { id: 'kol-saltlake', label: 'Salt Lake Sector V, Kolkata', city: 'Kolkata', lat: 22.5726, lng: 88.4310 },
  { id: 'ahm-navrangpura', label: 'Navrangpura, Ahmedabad', city: 'Ahmedabad', lat: 23.0365, lng: 72.5611 },
];

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatApproximateDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return 'Nearby';
  if (meters < 100) return '< 100 m';
  if (meters < 1000) {
    const rounded = Math.round(meters / 50) * 50;
    return `${rounded} m`;
  }
  const km = Math.round((meters / 1000) * 10) / 10;
  return `${km.toFixed(1)} km`;
}

/**
 * Fuzzes coordinates by ~120-200m so exact home addresses are never exposed
 * to other users or persisted in public discovery records.
 */
export function fuzzCoordinatesForPrivacy(lat: number, lng: number): { lat: number; lng: number } {
  // Snap to a ~150m privacy grid + small randomized jitter within 60m
  const grid = 0.0014;
  const snappedLat = Math.round(lat / grid) * grid;
  const snappedLng = Math.round(lng / grid) * grid;
  const jitterLat = (Math.random() - 0.5) * 0.0008;
  const jitterLng = (Math.random() - 0.5) * 0.0008;
  return {
    lat: Number((snappedLat + jitterLat).toFixed(4)),
    lng: Number((snappedLng + jitterLng).toFixed(4)),
  };
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';
  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lngMid = (lngMin + lngMax) / 2;
      if (lng >= lngMid) {
        idx = idx * 2 + 1;
        lngMin = lngMid;
      } else {
        idx = idx * 2;
        lngMax = lngMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) {
        idx = idx * 2 + 1;
        latMin = latMid;
      } else {
        idx = idx * 2;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      geohash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }
  return geohash;
}

export function findNearestAreaLabel(lat: number, lng: number): string {
  let closest = MANUAL_AREA_PRESETS[0];
  let bestDist = Infinity;
  for (const preset of MANUAL_AREA_PRESETS) {
    const d = haversineDistanceMeters(lat, lng, preset.lat, preset.lng);
    if (d < bestDist) {
      bestDist = d;
      closest = preset;
    }
  }
  if (bestDist <= 18000) {
    return `Near ${closest.label}`;
  }
  return `Sector ${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`;
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatTimeRemaining(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m left` : `${hrs}h left`;
}
