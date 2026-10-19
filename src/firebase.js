// Universal Firebase Initialization
// Compatible with Namecheap, Hostinger, Vercel, GoDaddy, and Localhost
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  setPersistence, 
  browserLocalPersistence 
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// THE TAG FOR everything from this app is #gcoursebuilder
export const FIREBASE_SYSTEM_TAG = "#gcoursebuilder";
export const APP_TAG = "#gcoursebuilder";

// Read Firebase Web Config from environment variables or runtime window config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.apiKey) || "AIzaSyCPeAOWQj8456TeIWDIPsyxyWT7QLrC8J8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.authDomain) || "ai-foundation-firebase.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.projectId) || "ai-foundation-firebase",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.storageBucket) || "ai-foundation-firebase.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.messagingSenderId) || "614773274800",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.appId) || "1:614773274800:web:bcfa9d363de884cf9ea375",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.measurementId) || "G-9V4X460YRL"
};

// Check if live config is provided
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "your_firebase_api_key_here" && 
  firebaseConfig.projectId
);

// Fallback configuration to prevent bundle breakage during build or unconfigured states
const effectiveConfig = isFirebaseConfigured ? firebaseConfig : {
  apiKey: "AIzaSyCPeAOWQj8456TeIWDIPsyxyWT7QLrC8J8",
  authDomain: "ai-foundation-firebase.firebaseapp.com",
  projectId: "ai-foundation-firebase",
  storageBucket: "ai-foundation-firebase.firebasestorage.app",
  messagingSenderId: "614773274800",
  appId: "1:614773274800:web:bcfa9d363de884cf9ea375",
  measurementId: "G-9V4X460YRL"
};

// Initialize singleton
const app = getApps().length > 0 ? getApp() : initializeApp(effectiveConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Firebase Analytics safely (supported in browser environments)
export let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Enforce MAXIMUM login duration: browserLocalPersistence
if (typeof window !== 'undefined') {
  try {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn("[Firebase Auth] Local persistence warning:", err);
    });
  } catch (e) {}
}

export default app;
