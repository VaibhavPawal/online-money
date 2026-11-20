import React, { useState } from 'react';
import { Crosshair, MapPin, ShieldAlert, X, Check, Lock } from 'lucide-react';
import { LocationState } from '../types';
import { MANUAL_AREA_PRESETS } from '../utils/geo';

interface LocationModalProps {
  open: boolean;
  onClose: () => void;
  location: LocationState;
  gpsError: string | null;
  isLocating: boolean;
  locationSharingEnabled: boolean;
  onToggleSharing: (enabled: boolean) => void;
  onRequestGps: () => void;
  onSelectManual: (lat: number, lng: number, label: string) => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  open,
  onClose,
  location,
  gpsError,
  isLocating,
  locationSharingEnabled,
  onToggleSharing,
  onRequestGps,
  onSelectManual,
}) => {
  const [search, setSearch] = useState('');

  if (!open) return null;

  const filteredPresets = MANUAL_AREA_PRESETS.filter(
    (p) =>
      p.label.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0B192C]/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white border border-slate-200 p-6 max-h-[88vh] overflow-y-auto shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-display font-bold text-[#0B192C]">Location &amp; GPS Privacy</h3>
            <p className="mt-1 text-xs text-slate-600">
              Your coordinates are rounded into ~200m zones. Exact home addresses are never exposed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close location modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Location Privacy Toggle */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[#0B192C] flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>Active Location Sharing</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              {locationSharingEnabled
                ? 'Updates only while CashBridge is open. Never tracks in the background when closed.'
                : 'Paused — GPS tracking is stopped and your approximate position is hidden.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={locationSharingEnabled}
            onClick={() => onToggleSharing(!locationSharingEnabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
              locationSharingEnabled ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                locationSharingEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Current GPS Status */}
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">Current Active Area</div>
              <div className="mt-0.5 text-sm font-semibold text-[#0B192C]">{location.areaLabel}</div>
              <div className="mt-1 text-xs text-slate-500 font-mono">
                Source: {location.source === 'gps' ? 'Live GPS' : 'Manual Area'}
                {location.accuracy !== null ? ` · ±${location.accuracy}m accuracy` : ''} · Permission: {location.permissionStatus}
              </div>
            </div>
            <button
              type="button"
              disabled={!locationSharingEnabled || isLocating}
              onClick={onRequestGps}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[42px] rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Crosshair className="w-4 h-4" />
              <span>{isLocating ? 'Detecting...' : 'Detect Live GPS'}</span>
            </button>
          </div>

          {gpsError && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p>{gpsError}</p>
                {location.permissionStatus === 'denied' && (
                  <p className="mt-1 text-amber-800">
                    To re-enable: open your browser&apos;s address bar lock/site-settings icon → set <strong>Location</strong> to <strong>Allow</strong> → reload.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Manual Neighborhood Picker */}
        <div className="mt-5">
          <label htmlFor="manual-area-search" className="block text-xs font-semibold text-slate-700 mb-2">
            Or Select Your Neighborhood Manually
          </label>
          <input
            id="manual-area-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Bengaluru, Mumbai, Delhi, Pune, Hyderabad..."
            className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
          />
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
            {filteredPresets.map((preset) => {
              const isSelected = location.areaLabel === preset.label;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onSelectManual(preset.lat, preset.lng, preset.label);
                    onClose();
                  }}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors min-h-[44px] cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">{preset.label}</span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
