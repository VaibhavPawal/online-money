import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Star,
  Camera,
  Upload,
  LogOut,
  Trash2,
  Lock,
  Bell,
  MapPin,
  CheckCircle2,
  Smartphone,
  X,
  AlertTriangle,
} from 'lucide-react';
import { NotificationPrefs, UserProfile, UserReview } from '../types';
import { apiRequest } from '../lib/api';
import { formatRelativeTime } from '../utils/geo';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileViewProps {
  user: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onLogout: () => void;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onUserUpdated,
  onLogout,
  onToast,
}) => {
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Camera capture
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setName(user.name);
    setEmail(user.email || '');
  }, [user.name, user.email]);

  useEffect(() => {
    apiRequest<{ reviews: UserReview[] }>(`/api/users/${user.uid}/reviews`)
      .then((res) => setReviews(res.reviews))
      .catch(() => {});
  }, [user.uid]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onToast('Camera capture is unavailable in this browser.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 320 } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      onToast('Camera permission denied.', 'error');
    }
  };

  const saveAvatarDataUrl = async (dataUrl: string) => {
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ profileImage: dataUrl }),
      });
      onUserUpdated(res.user);
      onToast('Profile photo updated.');
    } catch (err: any) {
      onToast(err.message || 'Could not save profile photo.', 'error');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const vw = videoRef.current.videoWidth || 240;
      const vh = videoRef.current.videoHeight || 240;
      const side = Math.min(vw, vh);
      ctx.drawImage(videoRef.current, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, 240, 240);
      saveAvatarDataUrl(canvas.toDataURL('image/jpeg', 0.78));
    }
    stopCamera();
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 240, 240);
          saveAvatarDataUrl(canvas.toDataURL('image/jpeg', 0.78));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, email: email.trim() || null }),
      });
      onUserUpdated(res.user);
      onToast('Profile details saved.');
    } catch (err: any) {
      onToast(err.message || 'Could not update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      onToast(res.message);
    } catch (err: any) {
      onToast(err.message || 'Could not change password.', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const toggleLocationPrivacy = async () => {
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ locationSharingEnabled: !user.locationSharingEnabled }),
      });
      onUserUpdated(res.user);
      onToast(
        res.user.locationSharingEnabled
          ? 'Location sharing enabled while app is open.'
          : 'Location sharing disabled. GPS updates stopped.'
      );
    } catch (err: any) {
      onToast(err.message || 'Failed to update setting.', 'error');
    }
  };

  const toggleNotifPref = async (key: keyof NotificationPrefs) => {
    const nextPrefs = { ...user.notificationPrefs, [key]: !user.notificationPrefs[key] };
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ notificationPrefs: nextPrefs }),
      });
      onUserUpdated(res.user);
    } catch (err: any) {
      onToast(err.message || 'Could not save notification preference.', 'error');
    }
  };

  const requestOptionalKyc = async () => {
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ requestKyc: true }),
      });
      onUserUpdated(res.user);
      onToast('Optional KYC verification requested for admin review.');
    } catch (err: any) {
      onToast(err.message || 'Could not submit request.', 'error');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    try {
      await apiRequest('/api/profile', { method: 'DELETE' });
      onLogout();
    } catch (err: any) {
      onToast(err.message || 'Could not delete account.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Summary Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-[#0B192C] text-white flex items-center justify-center font-display font-bold text-2xl overflow-hidden shrink-0">
              {user.profileImage ? (
                <img src={user.profileImage} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user.name[0]?.toUpperCase()
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-display font-bold text-[#0B192C]">{user.name}</h1>
                {user.isVerified && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <ShieldCheck className="w-4 h-4" />
                    Verified
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-600 font-mono">
                <span>{user.phoneNumber} (Private)</span>
                <span>·</span>
                <span>Joined {new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={openCamera}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Camera</span>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white text-xs font-semibold text-[#0B192C] hover:bg-slate-50 self-start sm:self-center cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500">Total Connections</div>
            <div className="mt-1 font-mono text-xl font-bold text-[#0B192C] tabular-nums">{user.totalConnections}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Completed Exchanges</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">{user.completedConnections}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Community Rating</div>
            <div className="mt-1 font-mono text-xl font-bold text-[#0B192C] tabular-nums inline-flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>{user.ratingCount > 0 ? `${user.ratingAvg.toFixed(1)} (${user.ratingCount})` : 'New'}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Identity KYC</div>
            <div className="mt-1 text-sm font-semibold capitalize text-[#0B192C]">
              {user.kycStatus === 'verified'
                ? 'Verified'
                : user.kycStatus === 'pending'
                ? 'Under Review'
                : 'Optional (Not Started)'}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Edit Profile & Password */}
        <div className="lg:col-span-6 space-y-6">
          <form onSubmit={handleSaveProfile} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="text-base font-display font-bold text-[#0B192C]">Edit Profile Details</h2>
            <div>
              <label htmlFor="prof-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                Full Name
              </label>
              <input
                id="prof-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="prof-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                Email Address (Optional)
              </label>
              <input
                id="prof-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#0B192C] text-white text-xs font-semibold hover:bg-[#10243E] disabled:opacity-60 cursor-pointer"
            >
              {savingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </form>

          <form onSubmit={handleChangePassword} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#0B192C]" />
              <h2 className="text-base font-display font-bold text-[#0B192C]">Change Password</h2>
            </div>
            <div>
              <label htmlFor="cur-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                Current Password
              </label>
              <input
                id="cur-pass"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                New Password (8+ characters)
              </label>
              <input
                id="new-pass"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {savingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>

          {/* Optional KYC & Danger Zone */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-display font-bold text-[#0B192C]">Optional Identity Verification</h2>
                <p className="mt-1 text-xs text-slate-600">
                  Request an optional trust badge verified through compliant review. Identity documents are never displayed publicly.
                </p>
              </div>
              {user.kycStatus === 'none' && (
                <button
                  type="button"
                  onClick={requestOptionalKyc}
                  className="px-4 py-2 min-h-[40px] rounded-xl border border-emerald-600 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 whitespace-nowrap cursor-pointer"
                >
                  Request KYC
                </button>
              )}
              {user.kycStatus === 'verified' && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
                  <CheckCircle2 className="w-4 h-4" /> Approved
                </span>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-red-700">Delete Account</div>
                <p className="text-xs text-slate-500">Permanently remove your profile, active requests, and session.</p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Privacy, Notifications, PWA & Reviews */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-[#0B192C] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span>Location Privacy Setting</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  When disabled, browser GPS tracking stops immediately and your approximate coordinates are cleared.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={user.locationSharingEnabled}
                onClick={toggleLocationPrivacy}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  user.locationSharingEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                    user.locationSharingEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="text-sm font-bold text-[#0B192C] flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-[#0B192C]" />
                <span>Notification Preferences</span>
              </div>
              {(
                [
                  { key: 'matches', label: 'New nearby opposite matches' },
                  { key: 'connections', label: 'Incoming, accepted & rejected requests' },
                  { key: 'messages', label: 'Real-time 1:1 chat messages' },
                  { key: 'expiry', label: 'Exchange request expiry alerts' },
                  { key: 'verification', label: 'Account verification updates' },
                ] as const
              ).map((item) => (
                <label key={item.key} className="flex items-center justify-between gap-4 text-xs text-slate-700 cursor-pointer py-1">
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(user.notificationPrefs?.[item.key])}
                    onChange={() => toggleNotifPref(item.key)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* PWA App Install & Platform Limitations */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-display font-bold text-[#0B192C]">Install CashBridge App (PWA)</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Install CashBridge on Android, iPhone, Windows, macOS, or tablets for standalone home-screen launch. Static assets are cached for speed; authentication tokens and private exchange data are never stored offline.
            </p>
            <p className="text-[11px] text-slate-500">
              Platform limits: PWAs do not perform closed-app background GPS tracking. iOS Web Push requires adding CashBridge to your Home Screen on iOS 16.4+.
            </p>
            <div className="pt-1">
              <PWAInstallButton variant="card" showFallbackTrigger />
            </div>
          </div>

          {/* Ratings & Reviews Received */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-display font-bold text-[#0B192C]">Ratings &amp; Reviews</h2>
            {reviews.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                Completed exchanges will display neighbor trust ratings and reviews here.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {reviews.map((r) => (
                  <div key={r.ratingId} className="py-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#0B192C]">{r.reviewerName}</span>
                      <span className="font-mono text-amber-600 inline-flex items-center gap-0.5">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        {r.rating}.0 · {formatRelativeTime(r.createdAt)}
                      </span>
                    </div>
                    {r.review && <p className="mt-1 text-xs text-slate-600">{r.review}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Camera Modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-[#0B192C]">Capture Profile Photo</h3>
              <button type="button" onClick={stopCamera} className="p-2 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-square w-full rounded-xl overflow-hidden bg-slate-950">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            </div>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={stopCamera} className="flex-1 min-h-[44px] rounded-xl border border-slate-300 text-sm">
                Cancel
              </button>
              <button type="button" onClick={capturePhoto} className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-semibold">
                Save Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-[#0B192C]">Permanently Delete Account?</h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  This permanently deletes your profile, active exchange requests, and session. Type <strong className="font-mono text-red-700">DELETE</strong> below to confirm.
                </p>
              </div>
            </div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="mt-4 w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono"
            />
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== 'DELETE'}
                onClick={handleDeleteAccount}
                className="flex-1 min-h-[44px] rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40 cursor-pointer"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
