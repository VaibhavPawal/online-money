import React, { useState } from 'react';
import {
  MapPin,
  List,
  Map as MapIcon,
  ShieldCheck,
  Star,
  Clock,
  RefreshCw,
  Crosshair,
  AlertTriangle,
  X,
} from 'lucide-react';
import { ExchangeRequest, LocationState, PlatformConfig } from '../types';
import { formatINR, formatTimeRemaining } from '../utils/geo';
import { NearbyMap } from './NearbyMap';

interface NearbyViewProps {
  mapsApiKey: string;
  platformConfig: PlatformConfig;
  location: LocationState;
  radiusMeters: number;
  onChangeRadius: (r: number) => void;
  requests: ExchangeRequest[];
  loading: boolean;
  onRefresh: () => void;
  onOpenLocationModal: () => void;
  onManualPickCoords: (lat: number, lng: number) => void;
  onSendConnection: (req: ExchangeRequest, agreedAmount: number) => Promise<void>;
}

export const NearbyView: React.FC<NearbyViewProps> = ({
  mapsApiKey,
  platformConfig,
  location,
  radiusMeters,
  onChangeRadius,
  requests,
  loading,
  onRefresh,
  onOpenLocationModal,
  onManualPickCoords,
  onSendConnection,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [typeFilter, setTypeFilter] = useState<'all' | 'need_cash' | 'need_online'>('all');
  const [manualPickMode, setManualPickMode] = useState(false);
  const [connectTarget, setConnectTarget] = useState<ExchangeRequest | null>(null);
  const [agreedAmount, setAgreedAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const filtered = requests.filter((r) => (typeFilter === 'all' ? true : r.requestType === typeFilter));

  const openConnectModal = (req: ExchangeRequest) => {
    setConnectTarget(req);
    setAgreedAmount(String(req.amount));
    setConnectError(null);
  };

  const confirmConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectTarget) return;
    setSending(true);
    setConnectError(null);
    try {
      await onSendConnection(connectTarget, Number(agreedAmount));
      setConnectTarget(null);
    } catch (err: any) {
      setConnectError(err.message || 'Unable to send connection request.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-display font-bold text-[#0B192C]">Nearby Smart Matches</h1>
            <p className="mt-0.5 text-xs text-slate-600">
              Showing active verified neighbors near <span className="font-semibold text-[#0B192C]">{location.areaLabel}</span> · Ranked by compatibility, distance, and trust.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === 'map' ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Google Map</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh nearby requests"
              className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100">
            {(
              [
                { id: 'all', label: 'All Nearby' },
                { id: 'need_cash', label: 'Needs Cash' },
                { id: 'need_online', label: 'Needs Online' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  typeFilter === tab.id ? 'bg-white text-[#0B192C] font-semibold shadow-xs' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100">
              {platformConfig.supportedRadii.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeRadius(r)}
                  className={`px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    radiusMeters === r ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {r < 1000 ? `${r}m` : `${r / 1000}KM`}
                </button>
              ))}
            </div>

            {viewMode === 'map' && (
              <button
                type="button"
                onClick={() => setManualPickMode(!manualPickMode)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  manualPickMode
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>{manualPickMode ? 'Tap Map to Set Area' : 'Pick on Map'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenLocationModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span>Area Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Map or List Content */}
      {viewMode === 'map' ? (
        <NearbyMap
          apiKey={mapsApiKey}
          center={{ lat: location.lat, lng: location.lng }}
          radiusMeters={radiusMeters}
          requests={filtered}
          onConnect={openConnectModal}
          manualPickMode={manualPickMode}
          onManualPick={(lat, lng) => {
            onManualPickCoords(lat, lng);
            setManualPickMode(false);
          }}
        />
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-slate-200 rounded" />
                  <div className="h-3 w-1/2 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="h-8 w-full bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <MapPin className="w-9 h-9 text-slate-300 mx-auto" />
          <h3 className="mt-3 text-base font-bold text-[#0B192C]">
            No active requests within {radiusMeters < 1000 ? `${radiusMeters} metres` : `${radiusMeters / 1000} KM`}
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 max-w-md mx-auto">
            Try increasing your search radius to 2 KM or 5 KM, or switch to another locality using Area Settings.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {radiusMeters < 5000 && (
              <button
                type="button"
                onClick={() => onChangeRadius(5000)}
                className="px-4 py-2.5 min-h-[42px] rounded-xl bg-[#0B192C] text-white text-xs font-semibold hover:bg-[#10243E] cursor-pointer"
              >
                Expand Radius to 5 KM
              </button>
            )}
            <button
              type="button"
              onClick={onOpenLocationModal}
              className="px-4 py-2.5 min-h-[42px] rounded-xl border border-slate-300 bg-white text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
            >
              Change Neighborhood
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((req) => (
            <article
              key={req.requestId}
              className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-[#0B192C] text-white flex items-center justify-center font-display font-bold text-sm shrink-0 overflow-hidden">
                      {req.userPhoto ? (
                        <img src={req.userPhoto} alt={req.userName} className="w-full h-full object-cover" />
                      ) : (
                        req.userName[0]?.toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-[#0B192C] truncate">{req.userName}</h3>
                        {req.userVerified && (
                          <span title="Verified Account">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span className="font-mono text-[#0B192C] font-medium">{req.approxDistanceLabel}</span>
                        <span>·</span>
                        <span>{req.userOnline ? 'Online' : 'Recently active'}</span>
                        {req.userRatingCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5 text-slate-700 font-mono">
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              {req.userRating.toFixed(1)} ({req.userRatingCount})
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono text-lg font-bold text-[#0B192C] tabular-nums">
                      {formatINR(req.amount)}
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        req.requestType === 'need_cash' ? 'text-emerald-700' : 'text-[#1B365D]'
                      }`}
                    >
                      {req.requestType === 'need_cash' ? 'Needs Cash' : 'Needs Online'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span>Method: <strong className="text-slate-800">{req.paymentMethod}</strong></span>
                  <span>·</span>
                  <span>{req.areaLabel}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-mono text-slate-500">
                    <Clock className="w-3 h-3" />
                    {formatTimeRemaining(req.expiresAt)}
                  </span>
                </div>

                {req.availableCashAmount && req.requestType === 'need_online' && (
                  <p className="mt-1.5 text-xs text-slate-500 font-mono">
                    Cash available in hand: {formatINR(req.availableCashAmount)}
                  </p>
                )}

                {req.description && (
                  <p className="mt-2.5 text-xs text-slate-700 leading-relaxed">{req.description}</p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <div className="text-[11px] text-slate-500 font-mono">
                  {req.compatibilityScore ? `Match Fit ${req.compatibilityScore}%` : 'Verified Nearby'}
                  {req.userKycStatus === 'verified' ? ' · KYC Verified' : ''}
                </div>
                <button
                  type="button"
                  onClick={() => openConnectModal(req)}
                  className="px-4 py-2 min-h-[42px] rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Connect
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Connect Confirmation Modal */}
      {connectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={confirmConnect}
            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-display font-bold text-[#0B192C]">
                  Connect with {connectTarget.userName}
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  {connectTarget.requestType === 'need_cash' ? 'Needs Cash' : 'Needs Online Money'} ·{' '}
                  {connectTarget.approxDistanceLabel} away · {connectTarget.paymentMethod}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConnectTarget(null)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5">
              <label htmlFor="connect-amt" className="block text-xs font-medium text-slate-700 mb-1.5">
                Proposed Exchange Amount (₹)
              </label>
              <input
                id="connect-amt"
                type="number"
                required
                min={platformConfig.minAmount}
                max={platformConfig.maxAmount}
                value={agreedAmount}
                onChange={(e) => setAgreedAmount(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono font-semibold tabular-nums"
              />
            </div>

            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Private chat unlocks only after {connectTarget.userName} accepts. Never share your UPI PIN or OTP, verify settlement in your official banking app, and meet in a public location.
              </span>
            </div>

            {connectError && (
              <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {connectError}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConnectTarget(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {sending ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
