import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import { ShieldCheck, Star, MapPin, Banknote, Smartphone, ArrowRight } from 'lucide-react';
import { ExchangeRequest } from '../types';
import { formatINR } from '../utils/geo';

interface NearbyMapProps {
  apiKey: string;
  center: { lat: number; lng: number };
  radiusMeters: number;
  requests: ExchangeRequest[];
  onConnect: (req: ExchangeRequest) => void;
  onManualPick?: (lat: number, lng: number) => void;
  manualPickMode?: boolean;
}

interface CircleHandle {
  setCenter: (center: { lat: number; lng: number }) => void;
  setRadius: (radius: number) => void;
  setMap: (map: unknown) => void;
}

const RadiusCircleOverlay: React.FC<{
  center: { lat: number; lng: number };
  radiusMeters: number;
}> = ({ center, radiusMeters }) => {
  const map = useMap();
  const circleRef = useRef<CircleHandle | null>(null);

  useEffect(() => {
    const gMaps = (window as unknown as { google?: { maps?: { Circle?: new (opts: Record<string, unknown>) => CircleHandle } } }).google?.maps;
    if (!map || !gMaps?.Circle) return;

    if (!circleRef.current) {
      circleRef.current = new gMaps.Circle({
        map,
        center,
        radius: radiusMeters,
        strokeColor: '#059669',
        strokeOpacity: 0.7,
        strokeWeight: 1.5,
        fillColor: '#10B981',
        fillOpacity: 0.08,
        clickable: false,
      });
    } else {
      circleRef.current.setCenter(center);
      circleRef.current.setRadius(radiusMeters);
    }

    map.panTo(center);
    const targetZoom =
      radiusMeters <= 500 ? 15.5 : radiusMeters <= 1000 ? 14.5 : radiusMeters <= 2000 ? 13.5 : 12.2;
    map.setZoom(targetZoom);

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
  }, [map, center.lat, center.lng, radiusMeters]);

  return null;
};

export const NearbyMap: React.FC<NearbyMapProps> = ({
  apiKey,
  center,
  radiusMeters,
  requests,
  onConnect,
  onManualPick,
  manualPickMode = false,
}) => {
  const [selectedReq, setSelectedReq] = useState<ExchangeRequest | null>(null);

  if (!apiKey) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <MapPin className="w-8 h-8 text-slate-400 mx-auto" />
        <h3 className="mt-3 text-base font-semibold text-[#0F172A]">Google Maps API Key Not Configured</h3>
        <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
          The interactive map requires a Google Maps Platform API key in your environment. You can still browse all distance-ranked nearby matches in List View.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50/70 text-xs text-slate-600">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
            Needs Cash
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0B192C] inline-block" />
            Needs Online Money
          </span>
        </div>
        <span>
          {manualPickMode
            ? 'Tap anywhere on the map to set your approximate neighborhood center'
            : 'Pins show approximate ~200m zones — exact home addresses are never exposed'}
        </span>
      </div>

      {/* Explicit height container required by CF2 to prevent 0x0 map collapse */}
      <div className="relative w-full h-[430px] md:h-[520px]">
        <APIProvider apiKey={apiKey} libraries={['marker']} language="en" region="IN">
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={center}
            defaultZoom={14.5}
            gestureHandling="greedy"
            disableDefaultUI={false}
            streetViewControl={false}
            mapTypeControl={false}
            fullscreenControl={true}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            onClick={(ev) => {
              if (manualPickMode && onManualPick && ev.detail.latLng) {
                onManualPick(ev.detail.latLng.lat, ev.detail.latLng.lng);
              } else {
                setSelectedReq(null);
              }
            }}
            className="w-full h-full"
          >
            <RadiusCircleOverlay center={center} radiusMeters={radiusMeters} />

            {/* Current user approximate center */}
            <AdvancedMarker position={center} title="Your Approximate Area">
              <div className="relative flex items-center justify-center">
                <div className="w-5 h-5 rounded-full bg-[#0B192C] border-2 border-white shadow-md flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
              </div>
            </AdvancedMarker>

            {/* Nearby privacy-fuzzed request markers */}
            {requests.map((req) => {
              const isCash = req.requestType === 'need_cash';
              return (
                <AdvancedMarker
                  key={req.requestId}
                  position={{ lat: req.approxLat, lng: req.approxLng }}
                  title={`${req.userName} · ${formatINR(req.amount)}`}
                  onClick={() => setSelectedReq(req)}
                >
                  <button
                    type="button"
                    className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-mono font-semibold shadow-md border transition-transform hover:scale-105 cursor-pointer ${
                      isCash
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-[#0B192C] text-white border-slate-700'
                    }`}
                  >
                    {isCash ? (
                      <Banknote className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="tabular-nums">{formatINR(req.amount)}</span>
                  </button>
                </AdvancedMarker>
              );
            })}

            {selectedReq && (
              <InfoWindow
                position={{ lat: selectedReq.approxLat, lng: selectedReq.approxLng }}
                onCloseClick={() => setSelectedReq(null)}
                maxWidth={270}
              >
                <div className="p-1 font-sans text-[#0F172A]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{selectedReq.userName}</span>
                    {selectedReq.userVerified && (
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-600 flex items-center gap-1.5">
                    <span>{selectedReq.requestType === 'need_cash' ? 'Needs Cash' : 'Needs Online'}</span>
                    <span>·</span>
                    <span className="font-mono">{selectedReq.approxDistanceLabel || 'Nearby'}</span>
                    {selectedReq.userRatingCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          {selectedReq.userRating.toFixed(1)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 font-mono text-base font-bold text-[#0B192C] tabular-nums">
                    {formatINR(selectedReq.amount)}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {selectedReq.paymentMethod} · {selectedReq.areaLabel}
                  </p>
                  {selectedReq.description && (
                    <p className="mt-1.5 text-xs text-slate-700 line-clamp-2">{selectedReq.description}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onConnect(selectedReq);
                      setSelectedReq(null);
                    }}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                  >
                    <span>Send Connection Request</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </APIProvider>
      </div>
    </div>
  );
};
