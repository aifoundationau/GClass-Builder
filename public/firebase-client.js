// Google sign-in with the shared Firebase project, and the signed-in user's ID token on every same-site /api/ request
// (the server checks it; it never trusts a uid sent in a request body). Load with <script type="module">.
// Exposes window.appAuth, keeps the latest sign-in state in window.appAuthState ({ user }) and fires 'appAuthChanged'
// (detail: { user }) whenever sign-in changes.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';

const nativeFetch = window.fetch.bind(window);
const config = await (await nativeFetch('/api/firebase/config')).json();
const auth = getAuth(initializeApp(config));

window.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
    const url = new URL(rawUrl, window.location.origin);
    const user = auth.currentUser;
    if (user && url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        try {
            const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
            if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
            init = { ...init, headers };
        } catch (e) {
            console.warn('[Auth] Could not attach the ID token:', e.message);
        }
    }
    return nativeFetch(input, init);
};

window.appAuth = {
    signIn: () => signInWithPopup(auth, new GoogleAuthProvider()),
    signOut: () => signOut(auth),
    currentUser: () => auth.currentUser
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Creates the shared profile on first sign-in; tokens are stored on it
        try {
            await fetch('/api/profile/sync', { method: 'POST' });
        } catch (e) {
            console.warn('[Auth] Profile sync failed:', e.message);
        }
    }
    window.appAuthState = { user: user || null };
    window.dispatchEvent(new CustomEvent('appAuthChanged', { detail: { user: user || null } }));
});
