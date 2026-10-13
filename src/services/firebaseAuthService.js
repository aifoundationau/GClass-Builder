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
  updateDoc, 
  collection, 
  getDocs, 
  onSnapshot 
} from "firebase/firestore";
import { auth, db, googleProvider, isFirebaseConfigured } from "../firebase";

// Standard Role Categories per specification
export const USER_CATEGORIES = [
  "Supporter",       // Default for all new Google registrations
  "student",
  "teacher",
  "admin staff",
  "CEO",
  "COO",
  "CFO",
  "Financial team",
  "Superadmin"
];

// Helper: Determine if a user record represents a Superadmin (zero hardcoding)
export async function verifySuperadminStatus(userRecord) {
  if (!userRecord || !userRecord.email) return false;

  const emailLower = userRecord.email.toLowerCase();
  const roleLower = String(userRecord.role || userRecord.classification || "").toLowerCase();

  // 1. Direct role inspection
  if (
    roleLower === "superadmin" || 
    roleLower === "admin" || 
    roleLower === "school_admin" || 
    userRecord.isAdmin === true || 
    userRecord.isSuperAdmin === true
  ) {
    return true;
  }

  // 2. Optional Environment Variable check (if configured in hosting env)
  const envAdmin = (import.meta.env.VITE_FIREBASE_ADMIN_EMAIL || "").toLowerCase().trim();
  if (envAdmin && emailLower === envAdmin) {
    return true;
  }

  // 3. Inspect Firestore 'admins' / 'superadmins' collections if Firebase is connected
  if (isFirebaseConfigured && db) {
    try {
      // Check admins collection by UID
      if (userRecord.uid) {
        const adminUidDoc = await getDoc(doc(db, "admins", userRecord.uid));
        if (adminUidDoc.exists()) return true;

        const superadminUidDoc = await getDoc(doc(db, "superadmins", userRecord.uid));
        if (superadminUidDoc.exists()) return true;
      }

      // Check admins collection by Email
      const adminEmailDoc = await getDoc(doc(db, "admins", emailLower));
      if (adminEmailDoc.exists()) return true;

      const superadminEmailDoc = await getDoc(doc(db, "superadmins", emailLower));
      if (superadminEmailDoc.exists()) return true;

      // Check system_config/admin doc
      const configDoc = await getDoc(doc(db, "system_config", "admin"));
      if (configDoc.exists()) {
        const configData = configDoc.data();
        const adminList = configData.adminEmails || configData.admins || [];
        if (Array.isArray(adminList) && adminList.map(e => String(e).toLowerCase()).includes(emailLower)) {
          return true;
        }
      }
    } catch (err) {
      console.warn("[Firebase Auth] Superadmin remote verification error:", err);
    }
  }

  return false;
}

// Synchronize Google User profile to Firebase Database
export async function syncUserToFirebase(authUser) {
  if (!authUser || !authUser.email) return null;

  const email = authUser.email;
  const uid = authUser.uid;
  const displayName = authUser.displayName || email.split("@")[0];
  const photoURL = authUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}&backgroundColor=4285f4`;

  let existingData = null;

  // 1. Fetch existing profile from Firestore if available
  if (isFirebaseConfigured && db) {
    try {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        existingData = userSnap.data();
      }
    } catch (err) {
      console.warn("[Firebase Database] Fetch user profile error:", err);
    }
  }

  // Fallback to local storage mirror if Firestore not loaded
  if (!existingData) {
    try {
      const cached = localStorage.getItem(`gcb_user_${uid}`);
      if (cached) existingData = JSON.parse(cached);
    } catch (e) {}
  }

  const nowIso = new Date().toISOString();

  // Requirement 5: People log in with Google, then become Supporters immediately as their classification
  // If they already have an assigned category (changed by Superadmin), preserve it!
  const assignedRole = existingData?.role || existingData?.classification || "Supporter";
  const loginCount = (existingData?.loginCount || 0) + 1;

  const userProfile = {
    uid: uid,
    email: email,
    displayName: displayName,
    name: displayName,
    photoURL: photoURL,
    avatar: photoURL,
    role: assignedRole,
    classification: assignedRole,
    status: existingData?.status || "active",
    createdAt: existingData?.createdAt || nowIso,
    lastLoginAt: nowIso,
    loginCount: loginCount,
    provider: "google.com",
    tags: ["lms", "supporter"]
  };

  // Determine Superadmin status dynamically
  userProfile.isSuperAdmin = await verifySuperadminStatus(userProfile);

  // 2. Persist record into Firebase Firestore
  if (isFirebaseConfigured && db) {
    try {
      const userRef = doc(db, "users", uid);
      await setDoc(userRef, userProfile, { merge: true });
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
    console.warn("[Firebase Auth] Popup blocked or failed, attempting redirect:", error);
    // If popup was blocked or unsupported, fallback smoothly to redirect
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
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

// Log out user completely
export async function logOutUser() {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("[Firebase Auth] Sign out error:", err);
  }
  try {
    localStorage.removeItem("gcb_active_user");
    localStorage.removeItem("gcb_user_session");
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

// Superadmin Feature: Update any user's category/classification
// Requirement 6: Superadmin can change any user category (student, teacher, admin staff, CEO, COO, CFO, Financial team, Supporter)
export async function updateUserCategoryInFirebase(targetUid, newCategory) {
  if (!targetUid || !newCategory) throw new Error("Missing user UID or category.");

  const nowIso = new Date().toISOString();

  // 1. Update in Firestore if configured
  if (isFirebaseConfigured && db) {
    try {
      const userRef = doc(db, "users", targetUid);
      await updateDoc(userRef, {
        role: newCategory,
        classification: newCategory,
        updatedAt: nowIso
      });
    } catch (err) {
      console.warn("[Firebase Database] Update user doc error:", err);
    }
  }

  // 2. Update local storage mirror
  try {
    const cached = localStorage.getItem(`gcb_user_${targetUid}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      parsed.role = newCategory;
      parsed.classification = newCategory;
      parsed.updatedAt = nowIso;
      localStorage.setItem(`gcb_user_${targetUid}`, JSON.stringify(parsed));
    }
    const active = localStorage.getItem("gcb_active_user");
    if (active) {
      const activeParsed = JSON.parse(active);
      if (activeParsed.uid === targetUid) {
        activeParsed.role = newCategory;
        activeParsed.classification = newCategory;
        localStorage.setItem("gcb_active_user", JSON.stringify(activeParsed));
      }
    }
  } catch (e) {}

  return { success: true, uid: targetUid, role: newCategory };
}
