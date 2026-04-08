// ── firebase.js ─────────────────────────────────────────────
// Helpers REST Firebase Realtime Database (service account)

const DB_URL = 'https://dieandretry-af391-default-rtdb.europe-west1.firebasedatabase.app';

function url(path, token) {
  return `${DB_URL}/${path}.json?access_token=${token}`;
}

export async function fbRead(path, token) {
  const res = await fetch(url(path, token));
  if (!res.ok) return null;
  return res.json();
}

export async function fbWrite(path, data, token) {
  const res = await fetch(url(path, token), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export async function fbPatch(path, data, token) {
  const res = await fetch(url(path, token), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export async function fbDelete(path, token) {
  const res = await fetch(url(path, token), { method: 'DELETE' });
  return res.ok;
}

/** Lit le solde VB authoritative d'un utilisateur */
export async function getVb(uid, token) {
  const val = await fbRead(`users/${uid}/voltbucks`, token);
  return typeof val === 'number' ? val : 0;
}

/** Écrit le solde VB authoritative */
export async function setVb(uid, amount, token) {
  return fbWrite(`users/${uid}/voltbucks`, amount, token);
}

/** Lit l'inventaire complet d'un utilisateur */
export async function getInventory(uid, token) {
  const inv = await fbRead(`users/${uid}/inventory`, token);
  return inv || { owned: [], skin: 'default', emote: 'none', bg: 'default' };
}

/** Écrit l'inventaire complet */
export async function setInventory(uid, inv, token) {
  return fbWrite(`users/${uid}/inventory`, inv, token);
}

/** Met à jour voltbucks_ranks */
export async function syncVbRank(uid, pseudo, vb, token) {
  return fbWrite(`voltbucks_ranks/${uid}`, {
    pseudo,
    vb,
    ts: Date.now(),
  }, token);
}

/** Met à jour achievement_ranks */
export async function syncAchRank(uid, pseudo, count, emote, skin, bg, vb, token) {
  return fbWrite(`achievement_ranks/${uid}`, {
    pseudo,
    count,
    ts: Date.now(),
    emote,
    skin,
    bg,
    vb,
  }, token);
}

/** Lit une entrée HOF pour vérifier qu'elle appartient à uid */
export async function getHofEntry(version, diff, key, token) {
  return fbRead(`hof/${version}/${diff}/${key}`, token);
}
