import React, { useState } from 'react';
import {
  Banknote,
  Smartphone,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Star,
  Crosshair,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  AppNotification,
  ExchangeRequest,
  LocationState,
  PaymentMethod,
  PlatformConfig,
  UserProfile,
} from '../types';
import { formatINR, formatRelativeTime, formatTimeRemaining } from '../utils/geo';
import { apiRequest } from '../lib/api';

const PAYMENT_METHODS: PaymentMethod[] = [
  'UPI',
  'Google Pay',
  'PhonePe',
  'Paytm',
  'Bank Transfer (IMPS)',
];

const EXPIRY_OPTIONS = [
  { label: '30 minutes', mins: 30 },
  { label: '1 hour', mins: 60 },
  { label: '3 hours', mins: 180 },
  { label: '6 hours', mins: 360 },
  { label: '24 hours', mins: 1440 },
];

interface DashboardViewProps {
  user: UserProfile;
  platformConfig: PlatformConfig;
  location: LocationState;
  radiusMeters: number;
  onChangeRadius: (r: number) => void;
  onOpenLocationModal: () => void;
  nearbySummary: {
    activeNearbyUsers: number;
    nearbyRequestsCount: number;
    matchingCount: number;
  };
  topMatches: ExchangeRequest[];
  notifications: AppNotification[];
  onRequestCreated: () => void;
  onNavigate: (tab: 'nearby' | 'requests' | 'messages' | 'profile') => void;
  onConnect: (req: ExchangeRequest) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  platformConfig,
  location,
  radiusMeters,
  onChangeRadius,
  onOpenLocationModal,
  nearbySummary,
  topMatches,
  notifications,
  onRequestCreated,
  onNavigate,
  onConnect,
}) => {
  // Card 1: I Need Cash
  const [cashAmount, setCashAmount] = useState(String(Math.max(1000, platformConfig.minAmount)));
  const [cashMethod, setCashMethod] = useState<PaymentMethod>('UPI');
  const [cashDesc, setCashDesc] = useState('');
  const [cashRadius, setCashRadius] = useState(radiusMeters);
  const [cashExpiry, setCashExpiry] = useState(60);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashFeedback, setCashFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Card 2: I Need Online Money
  const [onlineAmount, setOnlineAmount] = useState(String(Math.max(1000, platformConfig.minAmount)));
  const [availCash, setAvailCash] = useState(String(Math.max(1000, platformConfig.minAmount)));
  const [onlineMethod, setOnlineMethod] = useState<PaymentMethod>('Google Pay');
  const [onlineDesc, setOnlineDesc] = useState('');
  const [onlineRadius, setOnlineRadius] = useState(radiusMeters);
  const [onlineExpiry, setOnlineExpiry] = useState(60);
  const [onlineSubmitting, setOnlineSubmitting] = useState(false);
  const [onlineFeedback, setOnlineFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const submitNeedCash = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashFeedback(null);
    setCashSubmitting(true);
    try {
      await apiRequest('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          requestType: 'need_cash',
          amount: Number(cashAmount),
          paymentMethod: cashMethod,
          description: cashDesc,
          radiusMeters: cashRadius,
          expiryMinutes: cashExpiry,
          lat: location.lat,
          lng: location.lng,
          areaLabel: location.areaLabel,
        }),
      });
      setCashFeedback({
        type: 'success',
        text: `Posted request for ${formatINR(Number(cashAmount))} cash. Compatible neighbors nearby are being notified.`,
      });
      setCashDesc('');
      onRequestCreated();
    } catch (err: any) {
      setCashFeedback({ type: 'error', text: err.message || 'Could not submit request.' });
    } finally {
      setCashSubmitting(false);
    }
  };

  const submitNeedOnline = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnlineFeedback(null);
    setOnlineSubmitting(true);
    try {
      await apiRequest('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          requestType: 'need_online',
          amount: Number(onlineAmount),
          availableCashAmount: Number(availCash),
          paymentMethod: onlineMethod,
          description: onlineDesc,
          radiusMeters: onlineRadius,
          expiryMinutes: onlineExpiry,
          lat: location.lat,
          lng: location.lng,
          areaLabel: location.areaLabel,
        }),
      });
      setOnlineFeedback({
        type: 'success',
        text: `Posted request for ${formatINR(Number(onlineAmount))} online money. Nearby cash seekers can now discover you.`,
      });
      setOnlineDesc('');
      onRequestCreated();
    } catch (err: any) {
      setOnlineFeedback({ type: 'error', text: err.message || 'Could not submit request.' });
    } finally {
      setOnlineSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Greeting & Live Location Control Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0B192C]">
              Welcome back, {user.name.split(' ')[0]}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 font-medium text-[#0B192C]">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                {location.areaLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                {location.source === 'gps' ? 'Live GPS' : 'Manual Area'}
                {location.accuracy ? ` (±${location.accuracy}m)` : ''}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {user.locationSharingEnabled ? 'Location sharing active' : 'Location sharing paused'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
              {platformConfig.supportedRadii.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeRadius(r)}
                  className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    radiusMeters === r
                      ? 'bg-white text-[#0B192C] shadow-xs'
                      : 'text-slate-600 hover:text-[#0B192C]'
                  }`}
                >
                  {r < 1000 ? `${r}m` : `${r / 1000} KM`}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenLocationModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[42px] rounded-xl border border-slate-300 bg-white text-xs font-semibold text-[#0B192C] hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5 text-emerald-600" />
              <span>Location &amp; GPS</span>
            </button>
          </div>
        </div>

        {/* Clean 4-column live KPI strip */}
        <div className="mt-6 pt-5 border-t border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500">Active Nearby Users</div>
            <div className="mt-1 font-mono text-2xl font-bold text-[#0B192C] tabular-nums">
              {nearbySummary.activeNearbyUsers}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Nearby Requests ({radiusMeters < 1000 ? `${radiusMeters}m` : `${radiusMeters / 1000} KM`})</div>
            <div className="mt-1 font-mono text-2xl font-bold text-[#0B192C] tabular-nums">
              {nearbySummary.nearbyRequestsCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Smart Matches</div>
            <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
              {nearbySummary.matchingCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Completed Exchanges</div>
            <div className="mt-1 font-mono text-2xl font-bold text-[#0B192C] tabular-nums">
              {user.completedConnections}
            </div>
          </div>
        </div>
      </section>

      {/* Two Large Action Cards */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* CARD 1: I NEED CASH */}
        <form
          onSubmit={submitNeedCash}
          className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-display font-bold text-[#0B192C]">I Need Cash</h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  You have digital UPI/bank funds and want physical cash nearby.
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cash-amt" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Required Cash Amount (₹)
                  </label>
                  <input
                    id="cash-amt"
                    type="number"
                    required
                    min={platformConfig.minAmount}
                    max={platformConfig.maxAmount}
                    step={50}
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                  <div className="mt-1 text-[11px] text-slate-500 font-mono">
                    Limit: {formatINR(platformConfig.minAmount)} – {formatINR(platformConfig.maxAmount)}
                  </div>
                </div>

                <div>
                  <label htmlFor="cash-method" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Preferred Digital Payment
                  </label>
                  <select
                    id="cash-method"
                    value={cashMethod}
                    onChange={(e) => setCashMethod(e.target.value as PaymentMethod)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cash-radius" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Search Radius
                  </label>
                  <select
                    id="cash-radius"
                    value={cashRadius}
                    onChange={(e) => setCashRadius(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  >
                    {platformConfig.supportedRadii.map((r) => (
                      <option key={r} value={r}>
                        {r < 1000 ? `${r} metres` : `${r / 1000} KM`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cash-expiry" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Request Expiry Time
                  </label>
                  <select
                    id="cash-expiry"
                    value={cashExpiry}
                    onChange={(e) => setCashExpiry(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.mins} value={o.mins}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="cash-desc" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Short Public Note (Optional)
                </label>
                <input
                  id="cash-desc"
                  type="text"
                  maxLength={180}
                  value={cashDesc}
                  onChange={(e) => setCashDesc(e.target.value)}
                  placeholder="e.g., Prefer ₹500 notes, can meet at Main Metro Gate / Cafe"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

          <div className="mt-5">
            {cashFeedback && (
              <div
                className={`mb-3 rounded-xl px-3.5 py-2.5 text-xs flex items-start gap-2 border ${
                  cashFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {cashFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                )}
                <span>{cashFeedback.text}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={cashSubmitting}
              className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {cashSubmitting ? 'Posting Request...' : 'Submit Need Cash Request'}
            </button>
          </div>
        </form>

        {/* CARD 2: I NEED ONLINE MONEY */}
        <form
          onSubmit={submitNeedOnline}
          className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-display font-bold text-[#0B192C]">I Need Online Money</h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  You hold physical cash and want digital UPI/bank funds instead.
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[#0B192C] shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="online-amt" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Required Online Amount (₹)
                  </label>
                  <input
                    id="online-amt"
                    type="number"
                    required
                    min={platformConfig.minAmount}
                    max={platformConfig.maxAmount}
                    step={50}
                    value={onlineAmount}
                    onChange={(e) => {
                      setOnlineAmount(e.target.value);
                      if (Number(availCash) < Number(e.target.value)) {
                        setAvailCash(e.target.value);
                      }
                    }}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B192C]/25 focus:border-[#0B192C]"
                  />
                </div>

                <div>
                  <label htmlFor="avail-cash" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Available Cash in Hand (₹)
                  </label>
                  <input
                    id="avail-cash"
                    type="number"
                    required
                    min={Number(onlineAmount) || platformConfig.minAmount}
                    max={platformConfig.maxAmount * 2}
                    step={50}
                    value={availCash}
                    onChange={(e) => setAvailCash(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B192C]/25 focus:border-[#0B192C]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label htmlFor="online-method" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Payment App
                  </label>
                  <select
                    id="online-method"
                    value={onlineMethod}
                    onChange={(e) => setOnlineMethod(e.target.value as PaymentMethod)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B192C]/25 focus:border-[#0B192C]"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="online-radius" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Search Radius
                  </label>
                  <select
                    id="online-radius"
                    value={onlineRadius}
                    onChange={(e) => setOnlineRadius(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B192C]/25 focus:border-[#0B192C]"
                  >
                    {platformConfig.supportedRadii.map((r) => (
                      <option key={r} value={r}>
                        {r < 1000 ? `${r}m` : `${r / 1000} KM`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="online-expiry" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Expiry Time
                  </label>
                  <select
                    id="online-expiry"
                    value={onlineExpiry}
                    onChange={(e) => setOnlineExpiry(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B192C]/25 focus:border-[#0B192C]"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.mins} value={o.mins}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="online-desc" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Short Public Note (Optional)
                </label>
                <input
                  id="online-desc"
                  type="text"
                  maxLength={180}
                  value={onlineDesc}
                  onChange={(e) => setOnlineDesc(e.target.value)}
                  placeholder="e.g., Crisp ₹500 notes available, can meet near HDFC Bank / Market Square"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B192C]/25 focus:border-[#0B192C]"
                />
              </div>
            </div>
          </div>

          <div className="mt-5">
            {onlineFeedback && (
              <div
                className={`mb-3 rounded-xl px-3.5 py-2.5 text-xs flex items-start gap-2 border ${
                  onlineFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {onlineFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                )}
                <span>{onlineFeedback.text}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={onlineSubmitting}
              className="w-full min-h-[46px] rounded-xl bg-[#0B192C] text-white text-sm font-semibold hover:bg-[#10243E] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {onlineSubmitting ? 'Posting Request...' : 'Submit Need Online Money Request'}
            </button>
          </div>
        </form>
      </section>

      {/* Safety Reminder Banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 flex items-start gap-3 text-xs text-amber-950">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Safety First:</strong> CashBridge never holds money or executes payments. Verify every UPI or bank credit directly inside your official banking app before handing over cash, never share OTPs or UPI PINs, and meet in well-lit public places.
        </p>
      </div>

      {/* Bottom Split: Matching Requests Preview + Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-display font-bold text-[#0B192C]">Top Nearby Matches</h2>
              <p className="text-xs text-slate-500">Ranked by amount fit, proximity, and verified trust</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('nearby')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap cursor-pointer"
            >
              <span>View Map &amp; All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {topMatches.length === 0 ? (
            <div className="py-10 text-center">
              <MapPin className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="mt-3 text-sm font-semibold text-[#0B192C]">No nearby requests within {radiusMeters < 1000 ? `${radiusMeters}m` : `${radiusMeters / 1000} KM`} yet</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                Post your request above or expand your search radius to 2 KM or 5 KM to discover more neighbors.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 mt-2">
              {topMatches.slice(0, 4).map((req) => (
                <div key={req.requestId} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#0B192C] text-white flex items-center justify-center font-display font-bold text-sm shrink-0 overflow-hidden">
                      {req.userPhoto ? (
                        <img src={req.userPhoto} alt={req.userName} className="w-full h-full object-cover" />
                      ) : (
                        req.userName[0]?.toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-[#0B192C] truncate">{req.userName}</span>
                        {req.userVerified && <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span className={req.requestType === 'need_cash' ? 'text-emerald-700 font-medium' : 'text-[#0B192C] font-medium'}>
                          {req.requestType === 'need_cash' ? 'Needs Cash' : 'Needs Online'}
                        </span>
                        <span>·</span>
                        <span className="font-mono">{req.approxDistanceLabel}</span>
                        <span>·</span>
                        <span>{req.paymentMethod}</span>
                        {req.userRatingCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              {req.userRating.toFixed(1)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <div className="font-mono text-base font-bold text-[#0B192C] tabular-nums">
                        {formatINR(req.amount)}
                      </div>
                      <div className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeRemaining(req.expiresAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onConnect(req)}
                      className="px-3.5 py-2 min-h-[40px] rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Connect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <h2 className="text-base font-display font-bold text-[#0B192C]">Recent Activity</h2>
            <span className="text-xs text-slate-500 font-mono">{notifications.length} events</span>
          </div>
          {notifications.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500">
              Notifications for nearby matches, incoming requests, and messages will appear here.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 mt-2">
              {notifications.slice(0, 5).map((n) => (
                <div key={n.notificationId} className="py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0B192C]">{n.title}</span>
                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
