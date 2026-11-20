import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Upload,
  X,
  Info,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { apiRequest, setStoredToken } from '../lib/api';
import { UserProfile } from '../types';

interface AuthScreenProps {
  initialMode: 'login' | 'register';
  firebaseConfigured: boolean;
  onSuccess: (user: UserProfile) => void;
  onBack: () => void;
}

type AuthTab = 'password' | 'phone_otp' | 'google';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialMode,
  firebaseConfigured,
  onSuccess,
  onBack,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [activeTab, setActiveTab] = useState<AuthTab>('password');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [ageConfirmed18, setAgeConfirmed18] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Forgot password fields
  const [resetPhone, setResetPhone] = useState('');
  const [resetDob, setResetDob] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');

  // Camera modal state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const openCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera capture is not supported in this browser. Please upload a photo instead.');
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
      setCameraError('Camera permission denied. Allow camera access or choose an image file.');
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
      setProfileImage(canvas.toDataURL('image/jpeg', 0.78));
    }
    stopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }
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
          setProfileImage(canvas.toDataURL('image/jpeg', 0.78));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password: loginPassword }),
      });
      setStoredToken(res.token);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          phoneNumber: `+91${phoneDigits.replace(/\D/g, '')}`,
          email: email.trim() || undefined,
          password,
          dateOfBirth: dob,
          profileImage,
          termsAccepted,
          ageConfirmed18,
        }),
      });
      setStoredToken(res.token);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber: `+91${resetPhone.replace(/\D/g, '')}`,
          dateOfBirth: resetDob,
          newPassword: resetNewPass,
        }),
      });
      setNotice(res.message);
      setMode('login');
      setIdentifier(`+91${resetPhone.replace(/\D/g, '')}`);
      setResetNewPass('');
    } catch (err: any) {
      setError(err.message || 'Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Left Brand Context Panel (Desktop) */}
      <aside className="hidden lg:flex lg:w-[440px] xl:w-[480px] bg-[#0B192C] text-white p-10 flex-col justify-between shrink-0">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to CashBridge Home</span>
          </button>
          <div className="mt-8">
            <BrandLogo variant="light" />
          </div>
          <h1 className="mt-8 text-3xl font-display font-bold leading-tight">
            Safe, local cash &amp; digital exchange discovery.
          </h1>
          <p className="mt-4 text-sm text-slate-300 leading-relaxed">
            Sign in or create your 18+ verified account to post requests within 1 KM, browse privacy-fuzzed neighborhood pins on Google Maps, and coordinate safely in real-time chat.
          </p>
        </div>

        <div className="space-y-4 border-t border-white/10 pt-6 text-xs text-slate-300">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>CashBridge never holds funds or asks for UPI PINs, OTPs, or banking passwords.</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Your phone number and exact home address are never shown publicly.</span>
          </div>
        </div>
      </aside>

      {/* Main Form Workspace */}
      <main className="flex-1 flex flex-col justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6 lg:hidden">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0B192C] min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Home</span>
            </button>
            <BrandLogo variant="dark" size="sm" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
            {/* Auth Method Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 mb-6">
              {(
                [
                  { id: 'password', label: 'Mobile / Email' },
                  { id: 'phone_otp', label: 'Firebase OTP' },
                  { id: 'google', label: 'Google Sign-In' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(t.id);
                    setError(null);
                    setNotice(null);
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[40px] cursor-pointer ${
                    activeTab === t.id
                      ? 'bg-white text-[#0B192C] shadow-xs'
                      : 'text-slate-600 hover:text-[#0B192C]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Firebase OTP & Google Sign-In Honest Config Status */}
            {activeTab !== 'password' ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <div className="flex items-start gap-2.5">
                    <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h2 className="font-bold">
                        {activeTab === 'phone_otp'
                          ? 'Firebase Phone Authentication Not Configured'
                          : 'Firebase Google Sign-In Not Configured'}
                      </h2>
                      <p className="mt-1.5 text-xs text-amber-900 leading-relaxed">
                        {firebaseConfigured
                          ? 'Firebase client keys are present, but Phone OTP / Google provider verification requires enabling these providers in your Firebase Authentication Console.'
                          : 'Firebase project credentials are not configured in this environment. CashBridge never simulates fake OTP codes—real SMS OTP and Google OAuth require valid Firebase Auth configuration.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-2">
                  <div className="font-semibold text-[#0B192C]">To enable real Firebase Authentication:</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600">
                    <li>Configure <code className="font-mono text-[#0B192C]">VITE_FIREBASE_API_KEY</code>, <code className="font-mono text-[#0B192C]">VITE_FIREBASE_AUTH_DOMAIN</code>, and <code className="font-mono text-[#0B192C]">VITE_FIREBASE_PROJECT_ID</code>.</li>
                    <li>Enable <strong>Phone</strong> (with reCAPTCHA) and/or <strong>Google</strong> under Firebase Console → Authentication → Sign-in method.</li>
                  </ol>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('password')}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  Continue with Active Mobile &amp; Password Auth
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-xl font-display font-bold text-[#0B192C]">
                      {mode === 'login'
                        ? 'Sign in to CashBridge'
                        : mode === 'register'
                        ? 'Create your 18+ account'
                        : 'Reset account password'}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {mode === 'login'
                        ? 'Enter your +91 mobile number or email and password.'
                        : mode === 'register'
                        ? 'All accounts require 18+ age verification and prevent duplicate mobile numbers.'
                        : 'Verify your registered +91 mobile number and date of birth.'}
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <span>{error}</span>
                  </div>
                )}

                {notice && (
                  <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    <span>{notice}</span>
                  </div>
                )}

                {mode === 'login' && (
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="login-id" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Mobile Number (+91) or Email
                      </label>
                      <input
                        id="login-id"
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="+91 9876543210 or email@example.com"
                        className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="login-pass" className="text-xs font-medium text-slate-700">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot');
                            setError(null);
                          }}
                          className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          id="login-pass"
                          type={showPass ? 'text' : 'password'}
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full min-h-[44px] rounded-xl border border-slate-300 pl-3.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(!showPass)}
                          aria-label={showPass ? 'Hide password' : 'Show password'}
                          className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-800"
                        >
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {loading ? 'Signing in...' : 'Sign In Securely'}
                    </button>

                    <p className="text-center text-xs text-slate-600 pt-2">
                      New to CashBridge?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('register');
                          setError(null);
                        }}
                        className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Create an account
                      </button>
                    </p>
                  </form>
                )}

                {mode === 'register' && (
                  <form onSubmit={handleRegisterSubmit} className="space-y-4">
                    {/* Profile photo capture / upload */}
                    <div className="flex items-center gap-4 pb-2">
                      <div className="w-16 h-16 rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                        {profileImage ? (
                          <img src={profileImage} alt="Selected profile" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg font-display font-bold text-slate-400">
                            {name ? name.trim()[0]?.toUpperCase() : 'CB'}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-slate-800">Profile Photo (Optional)</div>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload</span>
                            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                          </label>
                          <button
                            type="button"
                            onClick={openCamera}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Use Camera</span>
                          </button>
                        </div>
                        {cameraError && <p className="mt-1 text-[11px] text-red-600">{cameraError}</p>}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 mb-1">
                        Full Name
                      </label>
                      <input
                        id="reg-name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Rohan Deshmukh"
                        className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label htmlFor="reg-phone" className="block text-xs font-medium text-slate-700 mb-1">
                          Mobile Number (+91)
                        </label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 text-xs font-mono font-semibold text-slate-700">
                            +91
                          </span>
                          <input
                            id="reg-phone"
                            type="tel"
                            inputMode="numeric"
                            required
                            maxLength={10}
                            value={phoneDigits}
                            onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="9876543210"
                            className="w-full min-h-[44px] rounded-r-xl border border-slate-300 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-dob" className="block text-xs font-medium text-slate-700 mb-1">
                          Date of Birth (18+ Only)
                        </label>
                        <input
                          id="reg-dob"
                          type="date"
                          required
                          value={dob}
                          onChange={(e) => setDob(e.target.value)}
                          className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 mb-1">
                        Email Address (Optional)
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Admin bootstrap: registering with <span className="font-mono">pawalvaibhav13@gmail.com</span> grants Admin Dashboard access.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="reg-pass" className="block text-xs font-medium text-slate-700 mb-1">
                        Password (minimum 8 characters)
                      </label>
                      <div className="relative">
                        <input
                          id="reg-pass"
                          type={showPass ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Create a strong password"
                          className="w-full min-h-[44px] rounded-xl border border-slate-300 pl-3.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(!showPass)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500"
                        >
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-1">
                      <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          required
                          checked={ageConfirmed18}
                          onChange={(e) => setAgeConfirmed18(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                        />
                        <span>I confirm that I am at least 18 years of age.</span>
                      </label>
                      <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          required
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                        />
                        <span>
                          I accept CashBridge&apos;s Terms &amp; Privacy Policy and understand CashBridge only facilitates peer discovery without holding funds or processing payments.
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {loading ? 'Creating account...' : 'Create Verified Account'}
                    </button>

                    <p className="text-center text-xs text-slate-600 pt-1">
                      Already registered?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setError(null);
                        }}
                        className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Sign in
                      </button>
                    </p>
                  </form>
                )}

                {mode === 'forgot' && (
                  <form onSubmit={handleResetSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="rst-phone" className="block text-xs font-medium text-slate-700 mb-1">
                        Registered Mobile Number (+91)
                      </label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 text-xs font-mono font-semibold text-slate-700">
                          +91
                        </span>
                        <input
                          id="rst-phone"
                          type="tel"
                          required
                          maxLength={10}
                          value={resetPhone}
                          onChange={(e) => setResetPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="9876543210"
                          className="w-full min-h-[44px] rounded-r-xl border border-slate-300 px-3 text-sm font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="rst-dob" className="block text-xs font-medium text-slate-700 mb-1">
                        Date of Birth
                      </label>
                      <input
                        id="rst-dob"
                        type="date"
                        required
                        value={resetDob}
                        onChange={(e) => setResetDob(e.target.value)}
                        className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="rst-pass" className="block text-xs font-medium text-slate-700 mb-1">
                        New Password (8+ characters)
                      </label>
                      <input
                        id="rst-pass"
                        type="password"
                        required
                        minLength={8}
                        value={resetNewPass}
                        onChange={(e) => setResetNewPass(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[46px] rounded-xl bg-[#0B192C] text-white text-sm font-semibold hover:bg-[#10243E] disabled:opacity-60 cursor-pointer"
                    >
                      {loading ? 'Updating password...' : 'Reset Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                      }}
                      className="w-full text-center text-xs font-medium text-slate-600 hover:text-[#0B192C] py-2 cursor-pointer"
                    >
                      Back to Login
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Live Camera Capture Modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-[#0B192C]">Take Profile Photo</h3>
              <button type="button" onClick={stopCamera} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-square w-full rounded-xl overflow-hidden bg-slate-950">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={stopCamera}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={capturePhoto}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >
                Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
