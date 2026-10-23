// The token kit's sign-in contract (tokensetupguide.txt, Step 8c), met by the app's own Firebase sign-in so the app keeps
// one sign-in. It does what token-kit's public/firebase-client.js does on its own page:
// 1. adds the signed-in user's ID token to token API requests (the server never trusts a uid sent by the browser)
// 2. calls POST /api/profile/sync after sign-in, which creates the shared profile that holds the token balance
// 3. keeps window.appAuthState ({ user }) and fires 'appAuthChanged' (detail: { user }) for public/tokens-ui.js
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { signInWithGoogle, logOutUser } from './firebaseAuthService';

// Only the token routes get the ID token: the app's other /api routes use the Classroom sign-in cookie
const TOKEN_API = /^\/api\/(tokens|profile|exchange-rates)(\/|$)/;

const nativeFetch = window.fetch.bind(window);

window.fetch = async (input, init = {}) => {
  const rawUrl = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  const url = new URL(rawUrl, window.location.origin);
  const user = auth.currentUser;
  if (user && url.origin === window.location.origin && TOKEN_API.test(url.pathname)) {
    try {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
      init = { ...init, headers };
    } catch (e) {
      console.warn('[Tokens] Could not attach the ID token:', e.message);
    }
  }
  return nativeFetch(input, init);
};

// The Tokens tab's "Sign in with Google" button (tokens-ui.js calls window.appAuth.signIn)
window.appAuth = {
  signIn: () => signInWithGoogle(),
  signOut: () => logOutUser(),
  currentUser: () => auth.currentUser
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Creates the shared profile on first sign-in; tokens are stored on it
    try {
      await fetch('/api/profile/sync', { method: 'POST' });
    } catch (e) {
      console.warn('[Tokens] Profile sync failed:', e.message);
    }
  }
  window.appAuthState = { user: user || null };
  window.dispatchEvent(new CustomEvent('appAuthChanged', { detail: { user: user || null } }));
});
