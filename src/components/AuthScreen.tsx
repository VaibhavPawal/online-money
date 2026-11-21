import React, { useEffect, useRef, useState } from 'react';
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
  Phone,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { apiRequest, setStoredToken } from '../lib/api';
import {
  auth,
  googleProvider,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  updateProfile,
  deleteUser,
  formatFirebaseAuthError,
  setAuthFlowBusy,
  type ConfirmationResult,
  type FirebaseUser,
} from '../lib/firebase';
import { UserProfile } from '../types';

export interface PendingFirebaseOnboarding {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  photoURL: string | null;
  signInProvider: string;
}

interface AuthScreenProps {
  initialMode: 'login' | 'register';
  pendingOnboarding?: PendingFirebaseOnboarding | null;
  onCancelOnboarding?: () => void;
  onSuccess: (user: UserProfile) => void;
  onBack: () => void;
}

type AuthTab = 'email' | 'phone_otp' | 'google';

function isAtLeast18Client(dobStr: string): boolean {
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 18 && age <= 110;
}

function extractTenDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 10) return digits;
  return '';
}

function formatPhoneToE164(rawInput: string): string | null {
  const cleaned = rawInput.trim().replace(/[\s\-()]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) {
    return /^\+[1-9]\d{6,14}$/.test(cleaned) ? cleaned : null;
  }
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  return null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialMode,
  pendingOnboarding = null,
  onCancelOnboarding,
  onSuccess,
  onBack,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [activeTab, setActiveTab] = useState<AuthTab>('email');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Onboarding step for brand-new Phone OTP or Google Sign-In users
  const [onboardingUser, setOnboardingUser] = useState<PendingFirebaseOnboarding | null>(
    pendingOnboarding
  );

  // Email/Password Login & Reset fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  // Registration & Onboarding profile fields
  const [name, setName] = useState(pendingOnboarding?.displayName || '');
  const [phoneDigits, setPhoneDigits] = useState(extractTenDigits(pendingOnboarding?.phoneNumber));
  const [email, setEmail] = useState(pendingOnboarding?.email || '');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(pendingOnboarding?.photoURL || null);
  const [ageConfirmed18, setAgeConfirmed18] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Real Firebase Phone OTP fields
  const [otpPhoneInput, setOtpPhoneInput] = useState('');
  const [sentPhoneE164, setSentPhoneE164] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaHostRef = useRef<HTMLDivElement | null>(null);

  // Camera modal state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (pendingOnboarding) {
      setOnboardingUser(pendingOnboarding);
      setName(pendingOnboarding.displayName || '');
      setPhoneDigits(extractTenDigits(pendingOnboarding.phoneNumber));
      setEmail(pendingOnboarding.email || '');
      setProfileImage(pendingOnboarding.photoURL || null);
    }
  }, [pendingOnboarding]);

  // Countdown timer for Phone OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const clearRecaptcha = () => {
    if (recaptchaRef.current) {
      try {
        recaptchaRef.current.clear();
      } catch {
        // Ignore already-cleared widget errors
      }
      recaptchaRef.current = null;
    }
    if (recaptchaHostRef.current) {
      recaptchaHostRef.current.innerHTML = '';
    }
  };

  const createFreshRecaptchaVerifier = (): RecaptchaVerifier => {
    clearRecaptcha();
    if (!recaptchaHostRef.current) {
      throw new Error('Verification widget container is not ready. Please retry.');
    }
    const mountEl = document.createElement('div');
    recaptchaHostRef.current.appendChild(mountEl);

    const verifier = new RecaptchaVerifier(auth, mountEl, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA resolved; signInWithPhoneNumber continues automatically
      },
      'expired-callback': () => {
        clearRecaptcha();
        setError('reCAPTCHA verification expired. Please tap Send Verification OTP again.');
      },
    });
    recaptchaRef.current = verifier;
    return verifier;
  };

  useEffect(() => {
    return () => {
      clearRecaptcha();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 320 },
      });
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

  // Exchange a verified Firebase User ID Token for a CashBridge backend session
  const exchangeFirebaseUser = async (fbUser: FirebaseUser) => {
    const idToken = await fbUser.getIdToken(true);
    const res = await apiRequest<
      | { status: 'authenticated'; token: string; user: UserProfile }
      | { status: 'needs_onboarding'; firebaseUser: PendingFirebaseOnboarding }
    >('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });

    if (res.status === 'authenticated') {
      setStoredToken(res.token);
      onSuccess(res.user);
      return;
    }

    // First-time Google or Phone OTP user: collect CashBridge 18+ mandatory profile fields
    setOnboardingUser(res.firebaseUser);
    setName(res.firebaseUser.displayName || '');
    setPhoneDigits(extractTenDigits(res.firebaseUser.phoneNumber));
    setEmail(res.firebaseUser.email || '');
    setProfileImage(res.firebaseUser.photoURL || null);
    setNotice('Authentication verified. Complete your 18+ CashBridge profile to enter the dashboard.');
  };

  // 1. Firebase Email & Password Login
  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    setAuthFlowBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      await exchangeFirebaseUser(cred.user);
    } catch (err: unknown) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setAuthFlowBusy(false);
      setLoading(false);
    }
  };

  // 2. Firebase Email & Password Registration + CashBridge 18+ Profile
  const handleEmailRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const cleanDigits = phoneDigits.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanDigits)) {
      setError('Enter a valid 10-digit Indian mobile number (+91).');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address for Firebase Email & Password authentication.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!dob || !isAtLeast18Client(dob)) {
      setError('You must be at least 18 years old to register on CashBridge.');
      return;
    }
    if (!ageConfirmed18 || !termsAccepted) {
      setError('You must confirm you are 18+ and accept the Terms & Privacy Policy.');
      return;
    }

    setLoading(true);
    setAuthFlowBusy(true);
    let createdFirebaseUser: FirebaseUser | null = null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      createdFirebaseUser = cred.user;
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() }).catch(() => {});
      }
      const idToken = await cred.user.getIdToken(true);
      const res = await apiRequest<{ status: 'authenticated'; token: string; user: UserProfile }>(
        '/api/auth/firebase/complete-profile',
        {
          method: 'POST',
          body: JSON.stringify({
            idToken,
            name: name.trim(),
            phoneNumber: `+91${cleanDigits}`,
            email: email.trim().toLowerCase(),
            dateOfBirth: dob,
            profileImage,
            termsAccepted,
            ageConfirmed18,
          }),
        }
      );
      setStoredToken(res.token);
      onSuccess(res.user);
    } catch (err: any) {
      // Roll back newly created Firebase Auth user if CashBridge profile validation failed (e.g. duplicate mobile)
      if (createdFirebaseUser && err?.status && err.status >= 400 && err.status < 500) {
        await deleteUser(createdFirebaseUser).catch(() => signOut(auth).catch(() => {}));
      }
      setError(err?.code?.startsWith?.('auth/') ? formatFirebaseAuthError(err) : err?.message || 'Registration failed.');
    } finally {
      setAuthFlowBusy(false);
      setLoading(false);
    }
  };

  // 3. Firebase Forgot Password Email Reset
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!resetEmail.trim()) {
      setError('Enter your registered email address.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setNotice(
        `Password reset email sent to ${resetEmail.trim()}. Check your inbox (and spam folder) to set a new password.`
      );
      setMode('login');
      setLoginEmail(resetEmail.trim());
    } catch (err: unknown) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // 4. Real Firebase Phone OTP — Send SMS OTP (or Test Phone Number verification) with Invisible reCAPTCHA
  const handleSendPhoneOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setNotice(null);

    const formattedPhone = formatPhoneToE164(otpPhoneInput);
    if (!formattedPhone) {
      setError('Enter a valid 10-digit mobile number (auto-prefixed with +91) or full E.164 format like +919876543210.');
      return;
    }

    setLoading(true);
    try {
      const verifier = createFreshRecaptchaVerifier();
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      confirmationResultRef.current = result;
      setConfirmationResult(result);
      setSentPhoneE164(formattedPhone);
      setOtpCode('');
      setResendCooldown(60);
      setNotice(
        `Verification ready for ${formattedPhone}. Enter the 6-digit SMS OTP (or your configured Firebase Console test code).`
      );
    } catch (err: unknown) {
      clearRecaptcha();
      setError(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // 5. Real Firebase Phone OTP — Verify 6-Digit OTP via confirmationResult.confirm(otp)
  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeConfirmation = confirmationResultRef.current || confirmationResult;
    if (!activeConfirmation) {
      setError('Request an OTP first before verifying.');
      return;
    }
    const cleanOtp = otpCode.replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Enter the 6-digit verification code.');
      return;
    }

    setError(null);
    setNotice(null);
    setLoading(true);
    setAuthFlowBusy(true);
    try {
      const cred = await activeConfirmation.confirm(cleanOtp);
      confirmationResultRef.current = null;
      setConfirmationResult(null);
      clearRecaptcha();
      await exchangeFirebaseUser(cred.user);
    } catch (err: any) {
      const code = err?.code ? String(err.code) : '';
      if (code === 'auth/code-expired' || code === 'auth/session-expired') {
        confirmationResultRef.current = null;
        setConfirmationResult(null);
        clearRecaptcha();
      }
      setError(formatFirebaseAuthError(err));
    } finally {
      setAuthFlowBusy(false);
      setLoading(false);
    }
  };

  // 6. Real Firebase Google Sign-In (Popup flow for AI Studio iframe compatibility)
  const handleGoogleSignIn = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    setAuthFlowBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await exchangeFirebaseUser(cred.user);
    } catch (err: unknown) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setAuthFlowBusy(false);
      setLoading(false);
    }
  };

  // 7. Complete 18+ Profile for newly authenticated Google / Phone OTP users
  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const fbUser = auth.currentUser;
    if (!fbUser) {
      setError('Your Firebase authentication session expired. Please sign in again.');
      setOnboardingUser(null);
      return;
    }

    const cleanDigits = phoneDigits.replace(/\D/g, '');
    if (!onboardingUser?.phoneNumber && !/^[6-9]\d{9}$/.test(cleanDigits)) {
      setError('Enter a valid 10-digit Indian mobile number (+91).');
      return;
    }
    if (!dob || !isAtLeast18Client(dob)) {
      setError('You must be at least 18 years old to use CashBridge.');
      return;
    }
    if (!ageConfirmed18 || !termsAccepted) {
      setError('Please confirm you are 18+ and accept CashBridge Terms & Privacy Policy.');
      return;
    }

    setLoading(true);
    try {
      if (name.trim() && fbUser.displayName !== name.trim()) {
        await updateProfile(fbUser, { displayName: name.trim() }).catch(() => {});
      }
      const idToken = await fbUser.getIdToken(true);
      const res = await apiRequest<{ status: 'authenticated'; token: string; user: UserProfile }>(
        '/api/auth/firebase/complete-profile',
        {
          method: 'POST',
          body: JSON.stringify({
            idToken,
            name: name.trim(),
            phoneNumber: onboardingUser?.phoneNumber || `+91${cleanDigits}`,
            email: onboardingUser?.email || email.trim() || undefined,
            dateOfBirth: dob,
            profileImage,
            termsAccepted,
            ageConfirmed18,
          }),
        }
      );
      setStoredToken(res.token);
      setOnboardingUser(null);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err?.message || 'Unable to complete profile setup.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOnboardingFlow = async () => {
    await signOut(auth).catch(() => {});
    setOnboardingUser(null);
    setConfirmationResult(null);
    setError(null);
    setNotice(null);
    if (onCancelOnboarding) onCancelOnboarding();
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
            Sign in securely with Firebase Email &amp; Password, real SMS Phone OTP, or Google Sign-In to post requests within 1 KM, browse privacy-fuzzed pins on Google Maps, and coordinate in real-time chat.
          </p>
        </div>

        <div className="space-y-4 border-t border-white/10 pt-6 text-xs text-slate-300">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>CashBridge never holds funds or asks for UPI PINs, banking OTPs, or financial passwords.</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Your phone number and exact home address are never exposed publicly.</span>
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
            {/* Post-Firebase 18+ Onboarding Completion Screen */}
            {onboardingUser ? (
              <form onSubmit={handleCompleteOnboarding} className="space-y-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 mb-1">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Firebase Authentication Verified</span>
                  </div>
                  <h2 className="text-xl font-display font-bold text-[#0B192C]">
                    Complete Your 18+ CashBridge Profile
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Finish these mandatory safety details once to unlock your CashBridge dashboard.
                  </p>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <span>{error}</span>
                  </div>
                )}
                {notice && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    <span>{notice}</span>
                  </div>
                )}

                {/* Profile photo */}
                <div className="flex items-center gap-4 pb-1">
                  <div className="w-16 h-16 rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                    {profileImage ? (
                      <img src={profileImage} alt="Profile preview" className="w-full h-full object-cover" />
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
                  <label htmlFor="onb-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    id="onb-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="onb-phone" className="block text-xs font-medium text-slate-700 mb-1">
                      Mobile Number (+91) {onboardingUser.phoneNumber ? '(Verified)' : ''}
                    </label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 text-xs font-mono font-semibold text-slate-700">
                        +91
                      </span>
                      <input
                        id="onb-phone"
                        type="tel"
                        inputMode="numeric"
                        required
                        maxLength={10}
                        disabled={Boolean(onboardingUser.phoneNumber)}
                        value={phoneDigits}
                        onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="9876543210"
                        className="w-full min-h-[44px] rounded-r-xl border border-slate-300 px-3 text-sm font-mono disabled:bg-slate-100 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="onb-dob" className="block text-xs font-medium text-slate-700 mb-1">
                      Date of Birth (18+ Only)
                    </label>
                    <input
                      id="onb-dob"
                      type="date"
                      required
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="onb-email" className="block text-xs font-medium text-slate-700 mb-1">
                    Email Address {onboardingUser.email ? '(Verified via Firebase)' : '(Optional)'}
                  </label>
                  <input
                    id="onb-email"
                    type="email"
                    disabled={Boolean(onboardingUser.email)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm disabled:bg-slate-100 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
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
                      I accept CashBridge&apos;s Terms &amp; Privacy Policy and understand CashBridge only facilitates peer discovery without holding funds or executing transactions.
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {loading ? 'Creating your workspace...' : 'Complete Setup & Open Dashboard'}
                </button>

                <button
                  type="button"
                  onClick={handleCancelOnboardingFlow}
                  className="w-full text-center text-xs font-medium text-slate-500 hover:text-[#0B192C] py-1.5 cursor-pointer"
                >
                  Use a different account
                </button>
              </form>
            ) : (
              <>
                {/* Auth Method Tabs */}
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 mb-6">
                  {(
                    [
                      { id: 'email', label: 'Email & Pass' },
                      { id: 'phone_otp', label: 'Phone OTP' },
                      { id: 'google', label: 'Google Sign-In' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (activeTab === 'phone_otp' && t.id !== 'phone_otp') {
                          clearRecaptcha();
                        }
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

                {/* TAB 1: REAL FIREBASE EMAIL & PASSWORD */}
                {activeTab === 'email' && (
                  <>
                    <div className="mb-5">
                      <h2 className="text-xl font-display font-bold text-[#0B192C]">
                        {mode === 'login'
                          ? 'Sign in with Email'
                          : mode === 'register'
                          ? 'Create your 18+ account'
                          : 'Reset your password'}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {mode === 'login'
                          ? 'Authenticate securely via Firebase Email & Password.'
                          : mode === 'register'
                          ? 'All accounts require 18+ verification and prevent duplicate registrations.'
                          : 'Receive a secure password reset link via Firebase Authentication.'}
                      </p>
                    </div>

                    {mode === 'login' && (
                      <form onSubmit={handleEmailLoginSubmit} className="space-y-4">
                        <div>
                          <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                            Email Address
                          </label>
                          <div className="relative">
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              id="login-email"
                              type="email"
                              required
                              autoComplete="email"
                              value={loginEmail}
                              onChange={(e) => setLoginEmail(e.target.value)}
                              placeholder="you@example.com"
                              className="w-full min-h-[44px] rounded-xl border border-slate-300 pl-10 pr-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                            />
                          </div>
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
                                setResetEmail(loginEmail);
                                setError(null);
                                setNotice(null);
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
                              autoComplete="current-password"
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
                              setNotice(null);
                            }}
                            className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            Create an account
                          </button>
                        </p>
                      </form>
                    )}

                    {mode === 'register' && (
                      <form onSubmit={handleEmailRegisterSubmit} className="space-y-4">
                        <div className="flex items-center gap-4 pb-1">
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
                            Email Address
                          </label>
                          <input
                            id="reg-email"
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                          />
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
                              autoComplete="new-password"
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
                          {loading ? 'Creating account...' : 'Create Account'}
                        </button>

                        <p className="text-center text-xs text-slate-600 pt-1">
                          Already registered?{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setMode('login');
                              setError(null);
                              setNotice(null);
                            }}
                            className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            Sign in
                          </button>
                        </p>
                      </form>
                    )}

                    {mode === 'forgot' && (
                      <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                        <div>
                          <label htmlFor="rst-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                            Registered Email Address
                          </label>
                          <input
                            id="rst-email"
                            type="email"
                            required
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full min-h-[46px] rounded-xl bg-[#0B192C] text-white text-sm font-semibold hover:bg-[#10243E] disabled:opacity-60 cursor-pointer"
                        >
                          {loading ? 'Sending reset link...' : 'Send Password Reset Email'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMode('login');
                            setError(null);
                          }}
                          className="w-full text-center text-xs font-medium text-slate-600 hover:text-[#0B192C] py-2 cursor-pointer"
                        >
                          Back to Sign In
                        </button>
                      </form>
                    )}
                  </>
                )}

                {/* TAB 2: REAL FIREBASE PHONE NUMBER OTP WITH reCAPTCHA */}
                {activeTab === 'phone_otp' && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl font-display font-bold text-[#0B192C]">
                        Mobile OTP Sign-In
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Verify via Firebase Phone Authentication. Supports Indian (+91) numbers and Firebase Console test phone numbers.
                      </p>
                    </div>

                    {!confirmationResult ? (
                      <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                        <div>
                          <label htmlFor="otp-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                            Mobile Number (+91 default, or full +country code)
                          </label>
                          <div className="flex">
                            <span className="inline-flex items-center gap-1.5 px-3 rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 text-xs font-mono font-semibold text-slate-700">
                              <Phone className="w-3.5 h-3.5 text-emerald-600" />
                              {otpPhoneInput.trim().startsWith('+') ? 'E.164' : '+91'}
                            </span>
                            <input
                              id="otp-phone"
                              type="tel"
                              inputMode="tel"
                              required
                              autoComplete="tel"
                              maxLength={18}
                              value={otpPhoneInput}
                              onChange={(e) => setOtpPhoneInput(e.target.value.replace(/[^\d+\s-]/g, ''))}
                              placeholder="9876543210 or +919876543210"
                              className="w-full min-h-[44px] rounded-r-xl border border-slate-300 px-3.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                            />
                          </div>
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            Enter 10 digits for +91, or include a country code (e.g., +919876543210) matching your Firebase Console test number.
                          </p>
                        </div>

                        <button
                          type="submit"
                          disabled={loading || !formatPhoneToE164(otpPhoneInput)}
                          className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
                        >
                          {loading ? 'Sending Verification OTP...' : 'Send Verification OTP'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 flex items-center justify-between gap-2">
                          <span>
                            Verifying <strong className="font-mono text-[#0B192C]">{sentPhoneE164}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              confirmationResultRef.current = null;
                              setConfirmationResult(null);
                              setOtpCode('');
                              setError(null);
                              setNotice(null);
                              clearRecaptcha();
                            }}
                            className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                          >
                            Change
                          </button>
                        </div>

                        <div>
                          <label htmlFor="otp-code" className="block text-xs font-medium text-slate-700 mb-1.5">
                            6-Digit Verification Code
                          </label>
                          <input
                            id="otp-code"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            autoFocus
                            required
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="123456"
                            className="w-full min-h-[46px] rounded-xl border border-slate-300 px-4 text-center text-lg font-mono tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={loading || otpCode.length !== 6}
                          className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
                        >
                          {loading ? 'Verifying OTP...' : 'Verify OTP & Sign In'}
                        </button>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-slate-500">Didn&apos;t receive the code?</span>
                          <button
                            type="button"
                            disabled={resendCooldown > 0 || loading}
                            onClick={() => handleSendPhoneOtp()}
                            className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline disabled:text-slate-400 disabled:no-underline cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>
                              {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                            </span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* TAB 3: REAL FIREBASE GOOGLE SIGN-IN */}
                {activeTab === 'google' && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-xl font-display font-bold text-[#0B192C]">
                        Continue with Google
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Sign in instantly using your Google account via Firebase Authentication. New members will confirm 18+ eligibility before entering the dashboard.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleGoogleSignIn}
                      className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-[#0B192C] text-sm font-semibold flex items-center justify-center gap-3 transition-colors disabled:opacity-60 cursor-pointer shadow-2xs"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                        />
                      </svg>
                      <span>{loading ? 'Connecting to Google...' : 'Sign in with Google'}</span>
                    </button>

                    <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                      Opens a secure Google sign-in window powered by Firebase Authentication. CashBridge only reads your name, email, and profile avatar.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Persistent Firebase invisible reCAPTCHA host (never unmounted between Phone OTP steps) */}
          <div ref={recaptchaHostRef} id="recaptcha-container" aria-hidden="true" />
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
