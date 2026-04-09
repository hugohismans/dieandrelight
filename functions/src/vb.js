// ── vb.js ────────────────────────────────────────────────────
// Logique VoltBucks côté serveur (miroir exact du client)

export const VB_BASE         = { bebe: 1,  piquer: 10, cauchemar: 50, survie: 3  };
export const VB_MIRROR_BONUS = { bebe: 1,  piquer: 5,  cauchemar: 5,  survie: 1  };
export const VB_YB_MULT      = { bebe: 10, piquer: 8,  cauchemar: 5,  survie: 5  };

export const HOF_VERSION = 'v0_1_1';

// Camps valides
const VALID_CAMPS = ['bebe', 'piquer', 'cauchemar', 'survie'];

/**
 * Calcule les VB attendus pour une campagne avec modificateurs.
 * Même logique que _calcVb() côté client.
 */
export function calcVb(campId, inv, yb) {
  if (!VALID_CAMPS.includes(campId)) return 0;
  const base  = VB_BASE[campId]         || 0;
  const bonus = inv ? (VB_MIRROR_BONUS[campId] || 0) : 0;
  const mult  = yb  ? (VB_YB_MULT[campId]     || 1) : 1;
  return Math.round((base + bonus) * mult);
}

/**
 * Décompose un diffId en { camp, inv, yb }.
 * Ex: 'bebe_yb_inv' → { camp: 'bebe', inv: true, yb: true }
 */
export function decomposeDiff(diff) {
  const inv = diff.includes('_inv');
  const yb  = diff.includes('_yb');
  const camp = diff.replace('_yb_inv', '').replace('_yb', '').replace('_inv', '');
  return { camp, inv, yb };
}

/**
 * Valide un résultat de campagne côté serveur.
 * Retourne null si OK, sinon un message d'erreur.
 */
export function validateCampResult(campId, timeMs, deaths) {
  if (!VALID_CAMPS.includes(campId) || campId === 'survie') return 'Camp invalide';
  if (typeof timeMs !== 'number' || timeMs <= 10000 || timeMs >= 7200000) return 'Temps invalide';
  if (typeof deaths !== 'number' || deaths < 0 || deaths > 99999) return 'Morts invalides';
  return null;
}

/**
 * Valide un résultat de survie côté serveur.
 */
export function validateSurvivalResult(levels) {
  if (typeof levels !== 'number' || levels < 1 || levels > 9999) return 'Niveaux invalides';
  return null;
}

/**
 * Vérifie si l'emote "I'm rich" doit être débloquée.
 */
export function shouldUnlockRich(newVb, ownedItems) {
  return newVb >= 50000 && !ownedItems.includes('emote_rich');
}

// Gain VB par haut-fait (miroir exact du client)
export const ACH_VB = {
  first_death:                  50,
  centurion:                   100,
  bebe_won:                    100,
  piquer_won:                  300,
  cauchemar_won:               600,
  bebe_deathless:              200,
  piquer_deathless:            500,
  cauchemar_deathless:        1500,
  bebe_speed:                  200,
  cauchemar_speed:             500,
  mirror_won:                  300,
  cauchemar_mirror:            800,
  cauchemar_mirror_deathless: 2000,
  survie_5:                    150,
  survie_10:                   300,
  survie_20:                   600,
  survie_50:                  1500,
  survie_deathless:            400,
  survie_comeback:             200,
  yb_bebe:                     300,
  yb_piquer:                   800,
  yb_cauchemar:               2000,
  yb_deathless:                500,
  yb_cauchemar_deathless:     3000,
  survie_inv_5:                200,
  survie_inv_10:               400,
  survie_inv_20:               800,
  survie_inv_deathless:        600,
  survie_inv_comeback:         300,
  yb_inv_won:                  800,
  yb_inv_cauchemar:           3000,
  yb_inv_cauchemar_deathless: 5000,
  survie_yb_5:                 300,
  survie_yb_10:                700,
  survie_yb_deathless:         600,
  survie_yb_inv_5:             500,
  platine:                    5000,
};
