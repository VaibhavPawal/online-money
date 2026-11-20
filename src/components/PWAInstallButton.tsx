import React, { useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X, CheckCircle2, Info } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card' | 'dark';
  showFallbackTrigger?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  showFallbackTrigger = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Running as installed CashBridge app</span>
        </div>
      );
    }
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  if (!isInstallable && !isIOS && !showFallbackTrigger) {
    return null;
  }

  const btnClass =
    variant === 'dark'
      ? 'inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/15 transition-colors whitespace-nowrap shrink-0 min-h-[40px]'
      : variant === 'card'
      ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B192C] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#10243E] transition-colors whitespace-nowrap shrink-0 min-h-[44px]'
      : 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#0B192C] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[40px]';

  return (
    <>
      <button type="button" onClick={handleClick} className={btnClass}>
        {isIOS ? <Smartphone className="w-4 h-4 text-emerald-600" /> : <Download className="w-4 h-4 text-emerald-600" />}
        <span>{isInstallable ? 'Install App' : isIOS ? 'Install on iPhone' : 'Install PWA'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="pwa-install-title" className="text-lg font-bold text-[#0F172A]">
                  {isIOS ? 'Install CashBridge on iPhone / iPad' : 'Install CashBridge App'}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Access CashBridge directly from your home screen or desktop dock.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-5 space-y-3 text-sm text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs font-semibold text-emerald-700 mt-0.5">01</span>
                  <span>
                    Open CashBridge in <strong>Safari</strong> and tap the{' '}
                    <span className="inline-flex items-center gap-1 font-medium text-[#0B192C]">
                      <Share className="w-3.5 h-3.5" /> Share
                    </span>{' '}
                    button in the browser toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs font-semibold text-emerald-700 mt-0.5">02</span>
                  <span>
                    Scroll down the share sheet and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs font-semibold text-emerald-700 mt-0.5">03</span>
                  <span>
                    Tap <strong>Add</strong> in the top-right corner to launch CashBridge in standalone app mode.
                  </span>
                </li>
              </ol>
            ) : (
              <ol className="mt-5 space-y-3 text-sm text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs font-semibold text-emerald-700 mt-0.5">01</span>
                  <span>
                    On Android Chrome or Desktop Edge/Chrome, click the <strong>Install</strong> icon in the address bar or open browser menu → <strong>Install CashBridge</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs font-semibold text-emerald-700 mt-0.5">02</span>
                  <span>
                    Confirm installation to add the CashBridge icon to your home screen or desktop.
                  </span>
                </li>
              </ol>
            )}

            <div className="mt-5 rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Info className="w-3.5 h-3.5 text-[#0B192C]" />
                <span>PWA Platform Transparency</span>
              </div>
              <p>
                Browser PWAs only access GPS while the app is actively open and consented—they do not perform continuous background tracking when closed. On iOS, Web Push notifications require iOS 16.4+ after adding to the Home Screen.
              </p>
              <p>
                Static interface assets are cached for faster loading; authentication sessions and private exchange records are never stored in the offline cache.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-[#0B192C] text-sm font-medium text-white hover:bg-[#10243E] transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>You are offline — showing app shell only. Reconnect for live matches and chat.</span>
    </div>
  );
};
