import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  updateProfile,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  deleteUser,
  type Auth,
  type ConfirmationResult,
  type User as FirebaseUser,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAO39dWD0n-_hm5C22f68GDYLIZjeP6VW4',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'cashbride-fa3b3.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'cashbride-fa3b3',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'cashbride-fa3b3.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '542707418962',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:542707418962:web:e26aa2f79bfb82ec389c8b',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-JPV83GK87K',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
);

// Initialize Firebase strictly once across hot reloads / module imports
export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(firebaseApp);
auth.useDeviceLanguage();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let authFlowBusy = false;

export function setAuthFlowBusy(busy: boolean) {
  authFlowBusy = busy;
}

export function isAuthFlowBusy(): boolean {
  return authFlowBusy;
}

export function formatFirebaseAuthError(err: unknown): string {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as any).code) : '';
  const fallbackMsg =
    typeof err === 'object' && err !== null && 'message' in err && typeof (err as any).message === 'string'
      ? (err as any).message
      : 'Authentication failed. Please try again.';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email address or password. Please check your credentials and try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters with a mix of letters and numbers.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support for assistance.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes before trying again.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled yet in your Firebase Console (Authentication -> Sign-in method).';
    case 'auth/unauthorized-domain':
      return `This domain (${window.location.hostname}) is not authorized in Firebase Console -> Authentication -> Settings -> Authorized domains.`;
    case 'auth/invalid-phone-number':
      return 'Invalid phone number format. Enter a 10-digit number (auto-prefixed with +91) or full international E.164 format (e.g., +919876543210).';
    case 'auth/missing-phone-number':
      return 'Please enter your mobile number to receive an OTP.';
    case 'auth/missing-verification-code':
      return 'Please enter the 6-digit verification code.';
    case 'auth/missing-verification-id':
      return 'Verification session missing. Please request a new OTP.';
    case 'auth/invalid-verification-code':
      return 'Incorrect 6-digit OTP code. Double-check the code and try again.';
    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'This verification session has expired. Tap Resend OTP to receive a fresh code.';
    case 'auth/quota-exceeded':
      return 'SMS OTP quota for this Firebase project has been reached. Try again later or use a configured Firebase Console test phone number.';
    case 'auth/billing-not-enabled':
      return 'Firebase blocked live SMS because Blaze billing is not enabled. If you are using a Firebase Console test phone number, verify the exact number (including country code, e.g. +91...) matches your Firebase Console entry.';
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
      return `reCAPTCHA app verification failed. Verify that "${window.location.hostname}" is added under Firebase Console -> Authentication -> Settings -> Authorized domains, then try again.`;
    case 'auth/internal-error':
      return `Firebase Phone Auth encountered an internal error. Confirm Phone sign-in is enabled and "${window.location.hostname}" is listed under Firebase Authorized domains.`;
    case 'auth/argument-error':
      return 'Verification widget reset required. Please try sending the OTP again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing authentication.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site and try again.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in popup is already open. Complete or close it first.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method. Sign in with that method instead.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase Authentication. Check your connection and retry.';
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign back in before completing this action.';
    default:
      return fallbackMsg.replace(/^Firebase:\s*/i, '');
  }
}

export {
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  updateProfile,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  deleteUser,
  type ConfirmationResult,
  type FirebaseUser,
};
