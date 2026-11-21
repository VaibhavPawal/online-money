import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Home,
  Compass,
  Repeat,
  MessageSquare,
  User,
  Shield,
  Bell,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Crosshair,
} from 'lucide-react';
import {
  AppNotification,
  ChatMessage,
  ConnectionRecord,
  ExchangeRequest,
  PlatformConfig,
  PublicConfigResponse,
  UserProfile,
} from './types';
import { apiRequest, getStoredToken, setStoredToken } from './lib/api';
import { auth, isAuthFlowBusy, onAuthStateChanged, signOut } from './lib/firebase';
import { useGeolocation } from './hooks/useGeolocation';
import { BrandLogo } from './components/BrandLogo';
import { LandingPage } from './components/LandingPage';
import { AuthScreen, type PendingFirebaseOnboarding } from './components/AuthScreen';
import { DashboardView } from './components/DashboardView';
import { NearbyView } from './components/NearbyView';
import { RequestsConnectionsView } from './components/RequestsConnectionsView';
import { MessagesView } from './components/MessagesView';
import { ProfileView } from './components/ProfileView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { LocationModal } from './components/LocationModal';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';

type AppNavTab = 'home' | 'nearby' | 'requests' | 'messages' | 'profile' | 'admin';

const DEFAULT_CONFIG: PlatformConfig = {
  minAmount: 500,
  maxAmount: 25000,
  supportedRadii: [500, 1000, 2000, 5000],
  defaultRadius: 1000,
  maxActiveRequests: 3,
  updatedAt: new Date().toISOString(),
};

export default function App() {
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string>(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '');
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);

  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authScreenMode, setAuthScreenMode] = useState<'landing' | 'login' | 'register'>('landing');
  const [pendingOnboarding, setPendingOnboarding] = useState<PendingFirebaseOnboarding | null>(null);
  const userRef = useRef<UserProfile | null>(null);
  userRef.current = user;

  const [activeTab, setActiveTab] = useState<AppNavTab>('home');
  const [radiusMeters, setRadiusMeters] = useState<number>(1000);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [gpsPromptDismissed, setGpsPromptDismissed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const [nearbyRequests, setNearbyRequests] = useState<ExchangeRequest[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbySummary, setNearbySummary] = useState({
    activeNearbyUsers: 0,
    nearbyRequestsCount: 0,
    matchingCount: 0,
  });
  const [myRequests, setMyRequests] = useState<ExchangeRequest[]>([]);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [incomingWsMessage, setIncomingWsMessage] = useState<ChatMessage | null>(null);
  const [readReceiptEvent, setReadReceiptEvent] = useState<{ conversationId: string; readerId: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const showToast = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  // Listen for Google Maps Platform Demo Key quota events
  useEffect(() => {
    const handler = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Load public config and restore Firebase-authenticated session on mount
  useEffect(() => {
    let active = true;

    apiRequest<PublicConfigResponse>('/api/config/public')
      .then((cfg) => {
        if (!active) return;
        if (cfg.mapsApiKey) setMapsApiKey(cfg.mapsApiKey);
        setPlatformConfig(cfg.platformConfig);
        setRadiusMeters(cfg.platformConfig.defaultRadius || 1000);
      })
      .catch(() => {
        // Use fallback defaults
      });

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;

      // If AuthScreen is actively handling sign-in/registration or user is already loaded, skip duplicate exchange
      if (isAuthFlowBusy() || (fbUser && userRef.current)) {
        setAuthLoading(false);
        return;
      }

      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await apiRequest<
            | { status: 'authenticated'; token: string; user: UserProfile }
            | { status: 'needs_onboarding'; firebaseUser: PendingFirebaseOnboarding }
          >('/api/auth/firebase', {
            method: 'POST',
            body: JSON.stringify({ idToken }),
          });
          if (!active) return;
          if (res.status === 'authenticated') {
            setStoredToken(res.token);
            setUser(res.user);
            setPendingOnboarding(null);
          } else {
            // Only open onboarding automatically if user isn't mid-registration in AuthScreen
            setPendingOnboarding(res.firebaseUser);
            setAuthScreenMode('register');
          }
        } catch {
          if (active) {
            setUser(null);
            setPendingOnboarding(null);
          }
        } finally {
          if (active) setAuthLoading(false);
        }
        return;
      }

      // No active Firebase user: check existing HttpOnly session cookie if any
      try {
        const me = await apiRequest<{ user: UserProfile; platformConfig: PlatformConfig }>('/api/auth/me');
        if (active) {
          setUser(me.user);
          setPlatformConfig(me.platformConfig);
        }
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setAuthLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const { location, gpsError, isLocating, requestGpsLocation, setManualLocation } = useGeolocation(
    Boolean(user?.locationSharingEnabled),
    Boolean(user)
  );

  const fetchNearby = useCallback(async () => {
    if (!user) return;
    setNearbyLoading(true);
    try {
      const res = await apiRequest<{
        requests: ExchangeRequest[];
        summary: { activeNearbyUsers: number; nearbyRequestsCount: number; matchingCount: number };
      }>(`/api/requests/nearby?lat=${location.lat}&lng=${location.lng}&radius=${radiusMeters}`);
      setNearbyRequests(res.requests);
      setNearbySummary(res.summary);
    } catch {
      // Non-fatal
    } finally {
      setNearbyLoading(false);
    }
  }, [user, location.lat, location.lng, radiusMeters]);

  const fetchUserCollections = useCallback(async () => {
    if (!user) return;
    try {
      const [mine, conns, notifs] = await Promise.all([
        apiRequest<{ requests: ExchangeRequest[] }>('/api/requests/mine'),
        apiRequest<{ connections: ConnectionRecord[] }>('/api/connections'),
        apiRequest<{ notifications: AppNotification[] }>('/api/notifications'),
      ]);
      setMyRequests(mine.requests);
      setConnections(conns.connections);
      setNotifications(notifs.notifications);
    } catch {
      // Ignore transient errors
    }
  }, [user]);

  const refreshAllData = useCallback(() => {
    fetchNearby();
    fetchUserCollections();
  }, [fetchNearby, fetchUserCollections]);

  useEffect(() => {
    if (user) {
      fetchNearby();
    }
  }, [user, fetchNearby]);

  useEffect(() => {
    if (user) {
      fetchUserCollections();
    }
  }, [user, fetchUserCollections]);

  // Real-time WebSocket connection for instant chat, read receipts & notifications
  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let closedByCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connectWs = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getStoredToken();
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws${qs}`);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.event === 'message:new') {
            setIncomingWsMessage(msg.payload as ChatMessage);
            fetchUserCollections();
          } else if (msg.event === 'messages:read') {
            setReadReceiptEvent(msg.payload);
          } else if (msg.event === 'notification:new') {
            const n = msg.payload as AppNotification;
            setNotifications((prev) =>
              prev.some((x) => x.notificationId === n.notificationId) ? prev : [n, ...prev]
            );
            showToast(n.title);
            fetchNearby();
          } else if (msg.event === 'connection:updated') {
            fetchUserCollections();
            fetchNearby();
          }
        } catch {
          // Ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!closedByCleanup) {
          reconnectTimer = setTimeout(connectWs, 4000);
        }
      };
    };

    connectWs();
    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user?.uid, fetchUserCollections, fetchNearby, showToast]);

  const handleLogout = async () => {
    try {
      await Promise.allSettled([
        signOut(auth),
        apiRequest('/api/auth/logout', { method: 'POST' }),
      ]);
    } catch {
      // Proceed to clear local session
    }
    setStoredToken(null);
    setPendingOnboarding(null);
    setUser(null);
    setAuthScreenMode('landing');
    setActiveTab('home');
    setSelectedChatId(null);
  };

  const handleToggleLocationSharing = async (enabled: boolean) => {
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ locationSharingEnabled: enabled }),
      });
      setUser(res.user);
      showToast(enabled ? 'Active location sharing resumed.' : 'Location sharing paused. GPS updates halted.');
    } catch (err: any) {
      showToast(err.message || 'Unable to update privacy setting.', 'error');
    }
  };

  const handleSendConnection = async (req: ExchangeRequest, agreedAmount: number) => {
    await apiRequest('/api/connections', {
      method: 'POST',
      body: JSON.stringify({ requestId: req.requestId, agreedAmount }),
    });
    showToast(`Connection request sent to ${req.userName}.`);
    refreshAllData();
  };

  const handleMarkNotifRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.notificationId === id ? { ...n, isRead: true } : n)));
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  };

  const handleMarkAllNotifRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await apiRequest('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
  };

  const handleSelectNotification = (n: AppNotification) => {
    if (n.type === 'chat_message' && n.relatedId) {
      setSelectedChatId(n.relatedId);
      setActiveTab('messages');
    } else if (n.type === 'connection_request' || n.type === 'request_accepted' || n.type === 'request_rejected') {
      setActiveTab('requests');
    } else if (n.type === 'match') {
      setActiveTab('nearby');
    } else if (n.type === 'verification') {
      setActiveTab('profile');
    }
  };

  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;
  const unreadChatCount = connections.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const pendingConnCount = connections.filter((c) => c.status === 'pending' && c.receiverId === user?.uid).length;

  const quotaBanner = mapsQuotaExceeded ? (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950 hover:text-amber-800"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  ) : null;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
        {quotaBanner}
        <BrandLogo variant="dark" />
        <p className="mt-3 text-xs text-slate-500">Loading your secure CashBridge workspace...</p>
      </div>
    );
  }

  // Unauthenticated Routes: Landing Page or Auth Screen
  if (!user) {
    return (
      <>
        {quotaBanner}
        {authScreenMode === 'landing' && !pendingOnboarding ? (
          <LandingPage onOpenAuth={(m) => setAuthScreenMode(m)} />
        ) : (
          <AuthScreen
            initialMode={authScreenMode === 'landing' ? 'register' : authScreenMode}
            pendingOnboarding={pendingOnboarding}
            onCancelOnboarding={() => {
              setPendingOnboarding(null);
              setAuthScreenMode('login');
            }}
            onBack={() => {
              setPendingOnboarding(null);
              setAuthScreenMode('landing');
            }}
            onSuccess={(u) => {
              setPendingOnboarding(null);
              setUser(u);
              setGpsPromptDismissed(false);
              setActiveTab('home');
            }}
          />
        )}
        <OfflineIndicator />
      </>
    );
  }

  const navItems: Array<{ id: AppNavTab; label: string; icon: React.ComponentType<any>; badge?: number }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'nearby', label: 'Nearby', icon: Compass },
    { id: 'requests', label: 'My Requests', icon: Repeat, badge: pendingConnCount },
    { id: 'messages', label: 'Messages', icon: MessageSquare, badge: unreadChatCount },
    { id: 'profile', label: 'Profile', icon: User },
  ];
  if (user.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {quotaBanner}

      <div className="flex-1 flex min-h-0">
        {/* Desktop Dark Navy Sidebar */}
        <aside className="hidden lg:flex lg:w-64 bg-[#0B192C] text-white flex-col justify-between shrink-0 sticky top-0 h-screen">
          <div className="p-6">
            <BrandLogo variant="light" />

            <nav className="mt-8 space-y-1.5" aria-label="Primary Navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 whitespace-nowrap">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge ? (
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white/15">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-5 border-t border-white/10 space-y-3">
            <PWAInstallButton variant="dark" />
            <div className="flex items-center gap-3 pt-1">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-display font-bold text-xs overflow-hidden shrink-0">
                {user.profileImage ? (
                  <img src={user.profileImage} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  user.name[0]?.toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{user.name}</div>
                <div className="text-[11px] text-slate-400 truncate">
                  {user.role === 'admin' ? 'Platform Admin' : 'Verified Member'}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Workspace Column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Compact Sticky Top Header */}
          <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="lg:hidden">
                <BrandLogo variant="dark" size="sm" />
              </div>
              <button
                type="button"
                onClick={() => setLocationModalOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-[#0B192C] truncate max-w-[280px] min-h-[38px] px-2.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{location.areaLabel}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:block">
                <PWAInstallButton variant="header" />
              </div>
              <button
                type="button"
                onClick={() => setNotifOpen(true)}
                aria-label="Open notifications"
                className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                aria-label="Open profile"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-[#0B192C] text-white font-display font-bold text-xs flex items-center justify-center overflow-hidden cursor-pointer"
              >
                {user.profileImage ? (
                  <img src={user.profileImage} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  user.name[0]?.toUpperCase()
                )}
              </button>
            </div>
          </header>

          {/* Post-login Live GPS Consent Prompt Banner */}
          {location.permissionStatus === 'prompt' && user.locationSharingEnabled && !gpsPromptDismissed && (
            <div className="bg-[#0B192C] text-white px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Crosshair className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Enable live GPS to discover neighbors within 1 KM accurately (only approximate ~200m zones are shared).
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    requestGpsLocation();
                    setGpsPromptDismissed(true);
                  }}
                  className="px-3.5 py-1.5 min-h-[36px] rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 whitespace-nowrap cursor-pointer"
                >
                  Allow Live GPS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGpsPromptDismissed(true);
                    setLocationModalOpen(true);
                  }}
                  className="px-3 py-1.5 min-h-[36px] rounded-lg bg-white/10 text-slate-200 hover:bg-white/15 whitespace-nowrap cursor-pointer"
                >
                  Pick Area Manually
                </button>
              </div>
            </div>
          )}

          {/* Active Page Viewport */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-8">
            {activeTab === 'home' && (
              <DashboardView
                user={user}
                platformConfig={platformConfig}
                location={location}
                radiusMeters={radiusMeters}
                onChangeRadius={setRadiusMeters}
                onOpenLocationModal={() => setLocationModalOpen(true)}
                nearbySummary={nearbySummary}
                topMatches={nearbyRequests}
                notifications={notifications}
                onRequestCreated={refreshAllData}
                onNavigate={(t) => setActiveTab(t)}
                onConnect={(req) => {
                  handleSendConnection(req, req.amount).catch((err) =>
                    showToast(err.message || 'Unable to send connection.', 'error')
                  );
                }}
              />
            )}

            {activeTab === 'nearby' && (
              <NearbyView
                mapsApiKey={mapsApiKey}
                platformConfig={platformConfig}
                location={location}
                radiusMeters={radiusMeters}
                onChangeRadius={setRadiusMeters}
                requests={nearbyRequests}
                loading={nearbyLoading}
                onRefresh={fetchNearby}
                onOpenLocationModal={() => setLocationModalOpen(true)}
                onManualPickCoords={(lat, lng) => {
                  setManualLocation(lat, lng);
                  showToast('Neighborhood search center updated from map.');
                }}
                onSendConnection={handleSendConnection}
              />
            )}

            {activeTab === 'requests' && (
              <RequestsConnectionsView
                user={user}
                myRequests={myRequests}
                connections={connections}
                onRefreshAll={refreshAllData}
                onOpenChat={(connId) => {
                  setSelectedChatId(connId);
                  setActiveTab('messages');
                }}
                onToast={showToast}
              />
            )}

            {activeTab === 'messages' && (
              <MessagesView
                user={user}
                connections={connections}
                selectedConnectionId={selectedChatId}
                onSelectConnection={setSelectedChatId}
                incomingWsMessage={incomingWsMessage}
                readReceiptEvent={readReceiptEvent}
                onRefreshConnections={fetchUserCollections}
                onToast={showToast}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                user={user}
                onUserUpdated={setUser}
                onLogout={handleLogout}
                onToast={showToast}
              />
            )}

            {activeTab === 'admin' && user.role === 'admin' && (
              <AdminDashboardView
                platformConfig={platformConfig}
                onConfigUpdated={setPlatformConfig}
                onToast={showToast}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (≤15% sticky height cap, ≥44px touch targets) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div
          className="grid items-center h-16"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center h-full min-h-[48px] transition-colors cursor-pointer ${
                  active ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge ? (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null}
                </div>
                <span className="mt-1 text-[10px] tracking-tight whitespace-nowrap">
                  {item.id === 'requests' ? 'Requests' : item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals & Drawers */}
      <LocationModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        location={location}
        gpsError={gpsError}
        isLocating={isLocating}
        locationSharingEnabled={user.locationSharingEnabled}
        onToggleSharing={handleToggleLocationSharing}
        onRequestGps={requestGpsLocation}
        onSelectManual={(lat, lng, label) => {
          setManualLocation(lat, lng, label);
          showToast(`Location set to ${label}`);
        }}
      />

      <NotificationsDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onMarkRead={handleMarkNotifRead}
        onMarkAllRead={handleMarkAllNotifRead}
        onSelectNotification={handleSelectNotification}
      />

      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-16 right-4 z-50 max-w-sm rounded-xl border px-4 py-3 text-xs font-medium shadow-lg flex items-start gap-2.5 ${
            toast.tone === 'error'
              ? 'bg-red-50 border-red-200 text-red-900'
              : 'bg-[#0B192C] border-slate-700 text-white'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
