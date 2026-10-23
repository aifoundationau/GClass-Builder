// Universal Firebase Authentication & Firestore Role Management Service
// Unbreakable authentication compatible with Namecheap, Hostinger, Vercel, GoDaddy & Localhost

import { 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  onSnapshot
} from "firebase/firestore";
import { auth, db, googleProvider, isFirebaseConfigured } from "../firebase";
import { isOwnerAccount } from "../rbac/permissions";

// The Superadmin is the owner, as in every app sharing the Firebase project: one of the owner's
// Google accounts, recognised from the sign-in by uid or verified email (src/rbac/permissions.js)
export async function verifySuperadminStatus(userRecord) {
  if (!userRecord) return false;
  const signedIn = auth.currentUser;
  const emailVerified = Boolean(signedIn && signedIn.uid === userRecord.uid && signedIn.emailVerified);
  return isOwnerAccount({ uid: userRecord.uid, email: userRecord.email, emailVerified });
}

// Synchronize Google User profile to Firebase Database
export async function syncUserToFirebase(authUser) {
  if (!authUser || !authUser.email) return null;

  const email = authUser.email;
  const uid = authUser.uid;
  const displayName = authUser.displayName || email.split("@")[0];
  const photoURL = authUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}&backgroundColor=4285f4`;

  let existingData = null;
  // Whether /users/{uid} exists (null when Firestore could not say): create or update below
  let profileExists = null;

  // 1. Fetch existing profile from Firestore if available
  if (isFirebaseConfigured && db) {
    try {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      profileExists = userSnap.exists();
      if (profileExists) {
        existingData = userSnap.data();
      }
    } catch (err) {
      console.warn("[Firebase Database] Fetch user profile error:", err);
    }
  }

  // Fallback to local storage mirror if Firestore not loaded
  if (profileExists === null) {
    try {
      const cached = localStorage.getItem(`gcb_user_${uid}`);
      if (cached) existingData = JSON.parse(cached);
    } catch (e) {}
  }

  const nowIso = new Date().toISOString();

  // What the app writes about the person in their shared profile (one per person for all the
  // owner's apps). Roles are this app's own (Role Permissions), so it never writes role,
  // classification, status or tags, which belong to the shared profile.
  const ownFields = {
    uid: uid,
    email: email,
    displayName: displayName,
    name: displayName,
    photoURL: photoURL,
    avatar: photoURL,
    lastLoginAt: nowIso,
    provider: "google.com"
  };

  const userProfile = {
    ...ownFields,
    createdAt: existingData?.createdAt || nowIso
  };

  // The Superadmin is the owner; worked out at sign-in, never stored
  userProfile.isSuperAdmin = await verifySuperadminStatus(userProfile);

  // 2. Update the profile in Firestore. The token server creates it on first sign-in
  // (POST /api/profile/sync, src/services/tokenAuthBridge.js) with the shared starting values.
  if (isFirebaseConfigured && db && profileExists) {
    try {
      await setDoc(doc(db, "users", uid), ownFields, { merge: true });
    } catch (err) {
      console.warn("[Firebase Database] Failed to write user profile:", err);
    }
  }

  // 3. Persist into Local Storage mirror
  try {
    localStorage.setItem(`gcb_user_${uid}`, JSON.stringify(userProfile));
    localStorage.setItem("gcb_active_user", JSON.stringify(userProfile));
  } catch (e) {}

  return userProfile;
}

// Unbreakable Google Sign-In with fallback resilience
export async function signInWithGoogle() {
  if (!isFirebaseConfigured) {
    // The placeholder config has no valid API key, so Google would only return an error
    const error = new Error("Firebase is not configured (VITE_FIREBASE_API_KEY).");
    error.code = "auth/not-configured";
    throw error;
  }
  try {
    // Attempt popup sign in first
    const result = await signInWithPopup(auth, googleProvider);
    if (result && result.user) {
      return await syncUserToFirebase(result.user);
    }
  } catch (error) {
    // If the user deliberately closed or cancelled the popup, respect their cancellation without redirecting
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      console.info("[Firebase Auth] User closed or cancelled sign-in popup.");
      throw error;
    }
    console.warn("[Firebase Auth] Popup blocked or failed, attempting redirect:", error);
    // If popup was blocked by browser, fallback to redirect
    if (error.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirect(auth, googleProvider);
        return null; // Will resume upon redirect completion
      } catch (redirectErr) {
        console.error("[Firebase Auth] Redirect failed:", redirectErr);
        throw redirectErr;
      }
    }
    throw error;
  }
}

// Check redirect login result (for mobile or redirected flows)
export async function checkRedirectAuthResult() {
  if (!isFirebaseConfigured) return null;
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      return await syncUserToFirebase(result.user);
    }
  } catch (err) {
    console.warn("[Firebase Auth] Redirect result check error:", err);
  }
  return null;
}

// Log out user completely and purge cached user profiles from browser storage
export async function logOutUser() {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("[Firebase Auth] Sign out error:", err);
  }
  try {
    localStorage.removeItem("gcb_active_user");
    localStorage.removeItem("gcb_user_session");
    // Clear all cached user profiles on sign out for privacy/security
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("gcb_user_") || key.startsWith("gcb_draft_"))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

// Listen for Auth changes in real time
export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const profile = await syncUserToFirebase(firebaseUser);
      callback(profile);
    } else {
      callback(null);
    }
  });
}

// Listen for live changes to a specific user doc (e.g. if Superadmin changes their category)
export function subscribeToUserProfile(uid, callback) {
  if (!isFirebaseConfigured || !db || !uid) return () => {};

  try {
    const userRef = doc(db, "users", uid);
    return onSnapshot(userRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        data.isSuperAdmin = await verifySuperadminStatus(data);
        callback(data);
      }
    }, (err) => {
      console.warn("[Firebase Database] Profile snapshot error:", err);
    });
  } catch (e) {
    return () => {};
  }
}

// Superadmin Feature: Fetch all registered users from Firebase
export async function getAllUsersFromFirebase() {
  const users = [];

  if (isFirebaseConfigured && db) {
    try {
      const usersCol = collection(db, "users");
      const snap = await getDocs(usersCol);
      snap.forEach((d) => {
        users.push({ id: d.id, ...d.data() });
      });
      if (users.length > 0) return users;
    } catch (err) {
      console.warn("[Firebase Database] Fetch all users error:", err);
    }
  }

  // Fallback: Check backend /api/users/lms or local storage
  try {
    const res = await fetch('/api/users/lms');
    if (res.ok) {
      const data = await res.json();
      if (data && data.users && data.users.length > 0) {
        return data.users;
      }
    }
  } catch (e) {}

  // Fallback to local storage mirror
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith("gcb_user_")) {
        const val = JSON.parse(localStorage.getItem(k));
        if (val && val.email) users.push(val);
      }
    }
  } catch (e) {}

  return users;
}
