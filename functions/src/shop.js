// ── shop.js ──────────────────────────────────────────────────
// Catalogue des items achetables (miroir exact du client)
// Le Worker valide chaque achat ici avant de débiter les VB.

export const SHOP_ITEMS = {
  // Skins balle
  skin_plasma:   { type: 'skin',  price: 300  },
  skin_soleil:   { type: 'skin',  price: 300  },
  skin_venin:    { type: 'skin',  price: 400  },
  skin_braise:   { type: 'skin',  price: 400  },
  skin_spectre:  { type: 'skin',  price: 600  },
  skin_neant:    { type: 'skin',  price: 800  },
  skin_arc:      { type: 'skin',  price: 1200 },
  skin_etoile:   { type: 'skin',  price: 1800 },
  skin_cube:     { type: 'skin',  price: 2500 },
  skin_cristal:  { type: 'skin',  price: 3000 },
  skin_crane:    { type: 'skin',  price: 3500 },
  skin_glitch:   { type: 'skin',  price: 4500 },
  skin_blackhole:{ type: 'skin',  price: 6000 },

  // Emotes
  emote_bolt:    { type: 'emote', price: 150  },
  emote_moon:    { type: 'emote', price: 150  },
  emote_skull:   { type: 'emote', price: 200  },
  emote_party:   { type: 'emote', price: 200  },
  emote_sakura:  { type: 'emote', price: 250  },
  emote_vortex:  { type: 'emote', price: 250  },
  emote_ghost:   { type: 'emote', price: 300  },
  emote_fire:    { type: 'emote', price: 300  },
  emote_fox:     { type: 'emote', price: 300  },
  emote_rocket:  { type: 'emote', price: 350  },
  emote_robot:   { type: 'emote', price: 400  },
  emote_alien:   { type: 'emote', price: 400  },
  emote_mask:    { type: 'emote', price: 400  },
  emote_magnet:  { type: 'emote', price: 450  },
  emote_crown:   { type: 'emote', price: 500  },
  emote_brain:   { type: 'emote', price: 500  },
  emote_crystal: { type: 'emote', price: 600  },
  emote_diamond: { type: 'emote', price: 600  },
  emote_devil:   { type: 'emote', price: 600  },
  emote_comet:   { type: 'emote', price: 800  },
  emote_eclipse: { type: 'emote', price: 900  },
  emote_chemist: { type: 'emote', price: 1000 },
  emote_eagle:   { type: 'emote', price: 1200 },
  emote_godmode: { type: 'emote', price: 1500 },
  // emote_rich : non achetable, débloquée automatiquement à 50 000 VB
  // emote_white_hat, emote_mvp, emote_dev : admin-only

  // Backgrounds
  bg_electrons:  { type: 'bg',    price: 300  },
  bg_stars:      { type: 'bg',    price: 400  },
  bg_matrix:     { type: 'bg',    price: 500  },
  bg_aurora:     { type: 'bg',    price: 600  },
  bg_void:       { type: 'bg',    price: 300  },

  // Consommables (stackables — on ajoute 1 à la quantité)
  consum_heart:      { type: 'consumable', price: 500  },
  consum_fuse:       { type: 'consumable', price: 800  },
  consum_hint:       { type: 'consumable', price: 1000 },
  consum_attenuator: { type: 'consumable', price: 600  },
};

// Items gratuits de base (jamais à acheter)
export const FREE_ITEMS = new Set([
  'skin_default',
  'emote_none',
  'bg_default',
]);

/**
 * Valide un achat.
 * @returns { ok: true, item } ou { ok: false, error: string }
 */
export function validatePurchase(itemId, currentVb, ownedItems) {
  // Items gratuits — jamais vendus
  if (FREE_ITEMS.has(itemId)) return { ok: false, error: 'Item gratuit, non achetable' };

  // Emote rich — débloquée automatiquement, jamais achetable
  if (itemId === 'emote_rich') return { ok: false, error: 'Non achetable' };

  const item = SHOP_ITEMS[itemId];
  if (!item) return { ok: false, error: 'Item inconnu' };

  // Déjà possédé (non-consommable)
  if (item.type !== 'consumable' && ownedItems.includes(itemId)) {
    return { ok: false, error: 'Déjà possédé' };
  }

  // Solde insuffisant
  if (currentVb < item.price) {
    return { ok: false, error: 'Solde insuffisant' };
  }

  return { ok: true, item };
}

/**
 * Applique l'achat à l'inventaire.
 * Retourne le nouvel inventaire mis à jour.
 */
export function applyPurchase(itemId, item, inventory) {
  const inv = { ...inventory };

  if (item.type === 'consumable') {
    // Consommable stackable — incrémenter la quantité (copie profonde de consumables)
    const key = itemId.replace('consum_', '');
    inv.consumables = { ...(inv.consumables || {}) };
    inv.consumables[key] = (inv.consumables[key] || 0) + 1;
  } else {
    // Item unique — copie du tableau avant modification
    const owned = Array.isArray(inv.owned) ? [...inv.owned] : [];
    if (!owned.includes(itemId)) owned.push(itemId);
    inv.owned = owned;
  }

  return inv;
}
