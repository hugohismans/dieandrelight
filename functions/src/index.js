// ── index.js ─────────────────────────────────────────────────
// Cloudflare Worker — backend sécurisé Die and Relight
// Endpoints :
//   POST /earn-vb          — créditer VB après campagne validée
//   POST /earn-vb-survival — créditer VB après niveau survie
//   POST /unlock-ach       — débloquer un haut-fait + créditer VB (écriture admin)
//   POST /use-consumable   — décrémenter un consommable (écriture admin)
//   POST /buy-item         — acheter un item boutique
//   POST /sync-ranks       — mettre à jour les classements
//   GET  /vb-balance       — lire le solde VB authoritative

import { verifyIdToken, getServiceAccountToken } from './auth.js';
import { fbRead, fbWrite, getVb, setVb, getInventory, setInventory, syncVbRank, syncAchRank, getHofEntry } from './firebase.js';
import { calcVb, decomposeDiff, validateCampResult, validateSurvivalResult, shouldUnlockRich, HOF_VERSION, ACH_VB } from './vb.js';
import { validatePurchase, applyPurchase } from './shop.js';

// ── CORS ─────────────────────────────────────────────────────
function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') || '';
  // En dev on accepte localhost, en prod uniquement le domaine configuré
  const allowed = env.ALLOWED_ORIGIN || '*';
  const isAllowed = allowed === '*' || origin === allowed || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin || '*' : env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function err(msg, status = 400, cors = {}) {
  return json({ error: msg }, status, cors);
}

// ── AUTH HELPER ──────────────────────────────────────────────
async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new Error('Token manquant');
  return verifyIdToken(token, env.FIREBASE_API_KEY);
}

// ── MAIN HANDLER ─────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request);

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/earn-vb' && request.method === 'POST')
        return await handleEarnVb(request, env, cors);

      if (path === '/earn-vb-survival' && request.method === 'POST')
        return await handleEarnVbSurvival(request, env, cors);

      if (path === '/unlock-ach' && request.method === 'POST')
        return await handleUnlockAch(request, env, cors);

      if (path === '/use-consumable' && request.method === 'POST')
        return await handleUseConsumable(request, env, cors);

      if (path === '/buy-item' && request.method === 'POST')
        return await handleBuyItem(request, env, cors);

      if (path === '/sync-ranks' && request.method === 'POST')
        return await handleSyncRanks(request, env, cors);

      if (path === '/vb-balance' && request.method === 'GET')
        return await handleVbBalance(request, env, cors);

      return err('Not found', 404, cors);

    } catch (e) {
      console.error(e);
      // Ne jamais exposer les détails d'erreur interne au client
      if (e.message === 'Token invalide' || e.message === 'Token manquant' || e.message === 'Utilisateur introuvable')
        return err(e.message, 401, cors);
      return err('Erreur serveur', 500, cors);
    }
  },
};

// ── ENDPOINT : /earn-vb ──────────────────────────────────────
// Crédite les VB après une campagne complétée.
// Le client envoie : { diff, hofKey, timeMs, deaths, pseudo, version? }
// Le Worker lit l'entrée HOF pour vérifier que uid + timeMs + deaths correspondent.
async function handleEarnVb(request, env, cors) {
  const user = await authenticate(request, env);
  const { diff, hofKey, timeMs, deaths, pseudo, version } = await request.json();

  if (!diff || !hofKey || !pseudo) return err('Paramètres manquants', 400, cors);

  const { camp, inv, yb } = decomposeDiff(diff);
  const validErr = validateCampResult(camp, timeMs, deaths);
  if (validErr) return err(validErr, 400, cors);

  const saToken = await getServiceAccountToken(env.FIREBASE_SERVICE_ACCOUNT);
  const hofVer  = version || HOF_VERSION;

  // Lire l'entrée HOF et vérifier qu'elle appartient à cet utilisateur
  const entry = await getHofEntry(hofVer, diff, hofKey, saToken);
  if (!entry) return err('Entrée HOF introuvable', 404, cors);
  if (entry.uid !== user.uid) return err('UID non concordant', 403, cors);

  // Vérifier que le temps/morts correspondent (tolérance ±500ms pour le réseau)
  if (Math.abs(entry.time - timeMs) > 500) return err('Temps non concordant', 400, cors);
  if (entry.deaths !== deaths) return err('Morts non concordantes', 400, cors);

  // Vérifier que ce gain n'a pas déjà été crédité (anti-replay)
  const alreadyPaid = await fbRead(`users/${user.uid}/vb_paid_hof/${hofVer}_${diff}_${hofKey}`, saToken);
  if (alreadyPaid) return json({ ok: true, alreadyPaid: true, vb: await getVb(user.uid, saToken) }, 200, cors);

  // Calculer et créditer les VB
  const earned = calcVb(camp, inv, yb);
  const current = await getVb(user.uid, saToken);
  const newVb = current + earned;

  // Marquer comme payé + créditer
  const paidKey = `${hofVer}_${diff}_${hofKey}`;
  await Promise.all([
    setVb(user.uid, newVb, saToken),
    fbWrite(`users/${user.uid}/vb_paid_hof/${paidKey}`, true, saToken),
  ]);

  // Vérifier unlock "I'm rich"
  let richUnlocked = false;
  const inv2 = await getInventory(user.uid, saToken);
  if (shouldUnlockRich(newVb, inv2.owned || [])) {
    inv2.owned = [...(inv2.owned || []), 'emote_rich'];
    await setInventory(user.uid, inv2, saToken);
    richUnlocked = true;
  }

  // Sync classement VB
  await syncVbRank(user.uid, pseudo, newVb, saToken);

  return json({ ok: true, earned, vb: newVb, richUnlocked }, 200, cors);
}

// ── ENDPOINT : /earn-vb-survival ─────────────────────────────
// Crédite les VB après un niveau de survie.
// Le client envoie : { levels, inv, yb, pseudo }
// On ne peut pas vérifier côté serveur sans état de jeu, mais on valide
// que le montant est cohérent et on cap à 1 niveau par appel.
async function handleEarnVbSurvival(request, env, cors) {
  const user = await authenticate(request, env);
  const { levels, inv, yb, pseudo } = await request.json();

  const validErr = validateSurvivalResult(levels);
  if (validErr) return err(validErr, 400, cors);
  if (!pseudo) return err('Pseudo manquant', 400, cors);

  // On n'accepte qu'un gain de 1 niveau à la fois (le client appelle à chaque niveau)
  if (levels !== 1) return err('Un niveau à la fois', 400, cors);

  const saToken = await getServiceAccountToken(env.FIREBASE_SERVICE_ACCOUNT);

  const earned  = calcVb('survie', inv === true, yb === true);
  const current = await getVb(user.uid, saToken);
  const newVb   = current + earned;

  await setVb(user.uid, newVb, saToken);

  // Unlock "I'm rich" si applicable
  let richUnlocked = false;
  const inventory = await getInventory(user.uid, saToken);
  if (shouldUnlockRich(newVb, inventory.owned || [])) {
    inventory.owned = [...(inventory.owned || []), 'emote_rich'];
    await setInventory(user.uid, inventory, saToken);
    richUnlocked = true;
  }

  // Sync classement VB
  await syncVbRank(user.uid, pseudo, newVb, saToken);

  return json({ ok: true, earned, vb: newVb, richUnlocked }, 200, cors);
}

// ── ENDPOINT : /buy-item ─────────────────────────────────────
// Achète un item.
// Le client envoie : { itemId, pseudo }
async function handleBuyItem(request, env, cors) {
  const user = await authenticate(request, env);
  const { itemId, pseudo } = await request.json();

  if (!itemId || !pseudo) return err('Paramètres manquants', 400, cors);

  const saToken   = await getServiceAccountToken(env.FIREBASE_SERVICE_ACCOUNT);
  const currentVb = await getVb(user.uid, saToken);
  const inventory = await getInventory(user.uid, saToken);
  const owned     = inventory.owned || [];

  const validation = validatePurchase(itemId, currentVb, owned);
  if (!validation.ok) return err(validation.error, 400, cors);

  const { item } = validation;
  const newVb     = currentVb - item.price;
  const newInv    = applyPurchase(itemId, item, inventory);

  await Promise.all([
    setVb(user.uid, newVb, saToken),
    setInventory(user.uid, newInv, saToken),
    syncVbRank(user.uid, pseudo, newVb, saToken),
  ]);

  return json({ ok: true, vb: newVb, inventory: newInv }, 200, cors);
}

// ── ENDPOINT : /sync-ranks ───────────────────────────────────
// Met à jour les classements achievement_ranks et voltbucks_ranks.
// Le client envoie : { pseudo, achCount, emote, skin, bg }
async function handleSyncRanks(request, env, cors) {
  const user = await authenticate(request, env);
  const { pseudo, achCount, emote, skin, bg } = await request.json();

  if (!pseudo) return err('Pseudo manquant', 400, cors);
  if (typeof achCount !== 'number' || achCount < 0 || achCount > 37)
    return err('achCount invalide', 400, cors);

  const saToken = await getServiceAccountToken(env.FIREBASE_SERVICE_ACCOUNT);
  const vb      = await getVb(user.uid, saToken);

  await Promise.all([
    syncVbRank(user.uid, pseudo, vb, saToken),
    syncAchRank(user.uid, pseudo, achCount, emote || 'none', skin || 'default', bg || 'default', vb, saToken),
  ]);

  return json({ ok: true, vb }, 200, cors);
}

// ── ENDPOINT : /unlock-ach ───────────────────────────────────
// Débloque un haut-fait (écriture admin sur achievements) + crédite les VB.
// Remplace /earn-vb-ach — atomique et sécurisé.
// Le client envoie : { id, pseudo }
async function handleUnlockAch(request, env, cors) {
  const user = await authenticate(request, env);
  const { id, pseudo } = await request.json();

  if (!id || !pseudo) return err('Paramètres manquants', 400, cors);

  const saToken = await getServiceAccountToken(env.FIREBASE_SERVICE_ACCOUNT);

  // Écriture du haut-fait dans Firebase (admin-only)
  const achKey = btoa(id);
  await fbWrite(`users/${user.uid}/achievements/${achKey}`, true, saToken);

  const reward = ACH_VB[id];
  const vbCurrent = await getVb(user.uid, saToken);

  // Pas de récompense VB pour ce haut-fait
  if (!reward) {
    return json({ ok: true, earned: 0, vb: vbCurrent }, 200, cors);
  }

  // Anti-replay VB
  const paidArr = await fbRead(`users/${user.uid}/vb_ach_paid`, saToken);
  const paid = Array.isArray(paidArr) ? paidArr : [];
  if (paid.includes(id)) {
    return json({ ok: true, alreadyPaid: true, vb: vbCurrent }, 200, cors);
  }

  // Créditer VB
  const newVb   = vbCurrent + reward;
  const newPaid = [...paid, id];

  await Promise.all([
    setVb(user.uid, newVb, saToken),
    fbWrite(`users/${user.uid}/vb_ach_paid`, newPaid, saToken),
  ]);

  // Unlock "I'm rich" si applicable
  let richUnlocked = false;
  const inventory = await getInventory(user.uid, saToken);
  if (shouldUnlockRich(newVb, inventory.owned || [])) {
    inventory.owned = [...(inventory.owned || []), 'emote_rich'];
    await setInventory(user.uid, inventory, saToken);
    richUnlocked = true;
  }

  await syncVbRank(user.uid, pseudo, newVb, saToken);

  return json({ ok: true, earned: reward, vb: newVb, richUnlocked }, 200, cors);
}

// ── ENDPOINT : /use-consumable ───────────────────────────────
// Décrémente un consommable côté serveur (admin-only en écriture).
// Le client envoie : { id } — ex: 'heart', 'fuse', 'hint', 'attenuator'
async function handleUseConsumable(request, env, cors) {
  const user = await authenticate(request, env);
  const { id } = await request.json();

  const VALID = ['heart', 'fuse', 'hint', 'attenuator'];
  if (!VALID.includes(id)) return err('Consommable invalide', 400, cors);

  const saToken = await getServiceAccountToken(env.FIREBASE_SERVICE_ACCOUNT);

  const consumables = await fbRead(`users/${user.uid}/consumables`, saToken) || {};
  const current = typeof consumables[id] === 'number' ? consumables[id]
                : (consumables[id] ? 1 : 0);

  if (current <= 0) return err('Aucun consommable disponible', 400, cors);

  const newCount = current - 1;
  await fbWrite(`users/${user.uid}/consumables/${id}`, newCount, saToken);

  return json({ ok: true, remaining: newCount }, 200, cors);
}

// ── ENDPOINT : /vb-balance ───────────────────────────────────
// Retourne le solde VB authoritative.
async function handleVbBalance(request, env, cors) {
  const user    = await authenticate(request, env);
  const saToken = await getServiceAccountToken(env.FIREBASE_SERVICE_ACCOUNT);
  const vb      = await getVb(user.uid, saToken);
  return json({ ok: true, vb }, 200, cors);
}
