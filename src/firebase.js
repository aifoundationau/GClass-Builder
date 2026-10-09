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

// Read Firebase Web Config from environment variables or runtime window config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.apiKey) || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.authDomain) || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.projectId) || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.storageBucket) || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.messagingSenderId) || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__?.appId) || ""
};

// Check if live config is provided
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "your_firebase_api_key_here" && 
  firebaseConfig.projectId
);

// Fallback configuration to prevent bundle breakage during build or unconfigured states
const effectiveConfig = isFirebaseConfigured ? firebaseConfig : {
  apiKey: "AIzaSyPlaceholderKeyForBuildSafety000000",
  authDomain: "app.firebaseapp.com",
  projectId: "course-builder-app",
  storageBucket: "course-builder-app.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

// Initialize singleton
const app = getApps().length > 0 ? getApp() : initializeApp(effectiveConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

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
