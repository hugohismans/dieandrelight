// ── auth.js ─────────────────────────────────────────────────
// Vérification Firebase ID token via identitytoolkit (pas de crypto maison)
// + génération access token service account via RS256 JWT

// Cache access token service account (réutilisable pendant ~55 min)
let _saTokenCache = null;
let _saTokenExpiry = 0;

/**
 * Vérifie un Firebase ID token via l'API identitytoolkit.
 * Retourne { uid, email } ou lève une erreur.
 */
export async function verifyIdToken(idToken, apiKey) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) throw new Error('Token invalide');
  const data = await res.json();
  if (!data.users || data.users.length === 0) throw new Error('Utilisateur introuvable');
  const user = data.users[0];
  if (user.disabled) throw new Error('Compte désactivé');
  return { uid: user.localId, email: user.email || null };
}

/**
 * Génère un Google OAuth2 access token depuis le service account JSON.
 * Utilise Web Crypto (RS256) — disponible nativement dans Cloudflare Workers.
 * Cache le token 55 minutes.
 */
export async function getServiceAccountToken(serviceAccountJson) {
  const now = Math.floor(Date.now() / 1000);
  if (_saTokenCache && _saTokenExpiry > now + 60) return _saTokenCache;

  const sa = JSON.parse(serviceAccountJson);

  // Construire le JWT claim
  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };

  const b64u = (obj) => btoa(JSON.stringify(obj))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const unsigned = `${b64u(header)}.${b64u(payload)}`;

  // Importer la clé privée PKCS8
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Signer
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );
  const b64sig = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${unsigned}.${b64sig}`;

  // Échanger contre un access token Google
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!tokenRes.ok) throw new Error('Impossible d\'obtenir le service account token');
  const tokenData = await tokenRes.json();

  _saTokenCache  = tokenData.access_token;
  _saTokenExpiry = now + (tokenData.expires_in || 3600);
  return _saTokenCache;
}
