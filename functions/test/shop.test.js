// ── test/shop.test.js ─────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { SHOP_ITEMS, FREE_ITEMS, validatePurchase, applyPurchase } from '../src/shop.js';

// ── Intégrité du catalogue ────────────────────────────────────
describe('SHOP_ITEMS — catalogue', () => {
  it('tous les items ont un type valide', () => {
    const validTypes = new Set(['skin', 'emote', 'bg', 'consumable']);
    for (const [id, item] of Object.entries(SHOP_ITEMS)) {
      expect(validTypes.has(item.type), `${id}: type "${item.type}" inconnu`).toBe(true);
    }
  });

  it('tous les prix sont des entiers positifs', () => {
    for (const [id, item] of Object.entries(SHOP_ITEMS)) {
      expect(typeof item.price, `${id} price doit être un number`).toBe('number');
      expect(item.price > 0, `${id} price doit être > 0`).toBe(true);
      expect(Number.isInteger(item.price), `${id} price doit être un entier`).toBe(true);
    }
  });

  it('emote_rich absent du catalogue (débloquée automatiquement)', () =>
    expect(SHOP_ITEMS.emote_rich).toBeUndefined());

  // Vérification des prix de référence (miroir exact client game.html)
  const expectedPrices = {
    skin_plasma: 300, skin_soleil: 300, skin_venin: 400, skin_braise: 400,
    skin_spectre: 600, skin_neant: 800, skin_arc: 1200,
    emote_bolt: 150, emote_skull: 200, emote_crown: 500, emote_ghost: 300,
    emote_fire: 300, emote_robot: 400, emote_alien: 400, emote_diamond: 600,
    emote_devil: 600, emote_comet: 800, emote_godmode: 1500,
    bg_electrons: 300, bg_stars: 400, bg_matrix: 500, bg_aurora: 600, bg_void: 300,
    consum_heart: 500, consum_fuse: 800, consum_hint: 1000, consum_attenuator: 600,
  };

  for (const [id, price] of Object.entries(expectedPrices)) {
    it(`prix ${id} = ${price} VB`, () => {
      expect(SHOP_ITEMS[id], `${id} manquant dans SHOP_ITEMS`).toBeDefined();
      expect(SHOP_ITEMS[id].price).toBe(price);
    });
  }

  it('nombre total d\'items achetables = ' + Object.keys(expectedPrices).length, () =>
    expect(Object.keys(SHOP_ITEMS).length).toBe(Object.keys(expectedPrices).length));
});

// ── FREE_ITEMS ────────────────────────────────────────────────
describe('FREE_ITEMS', () => {
  it('contient skin_default', () => expect(FREE_ITEMS.has('skin_default')).toBe(true));
  it('contient emote_none',   () => expect(FREE_ITEMS.has('emote_none')).toBe(true));
  it('contient bg_default',   () => expect(FREE_ITEMS.has('bg_default')).toBe(true));
  it('aucun item gratuit n\'est dans SHOP_ITEMS', () => {
    for (const id of FREE_ITEMS) {
      expect(SHOP_ITEMS[id], `${id} ne doit pas être dans SHOP_ITEMS`).toBeUndefined();
    }
  });
});

// ── validatePurchase ──────────────────────────────────────────
describe('validatePurchase', () => {
  it('achat valide — emote_bolt sans le posséder', () => {
    const r = validatePurchase('emote_bolt', 500, []);
    expect(r.ok).toBe(true);
    expect(r.item.price).toBe(150);
  });

  it('achat valide — skin juste avec le montant exact', () => {
    const r = validatePurchase('skin_plasma', 300, []);
    expect(r.ok).toBe(true);
  });

  it('rejette item inconnu', () => {
    const r = validatePurchase('item_inexistant', 9999, []);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/inconnu/i);
  });

  it('rejette item gratuit (skin_default)', () => {
    const r = validatePurchase('skin_default', 9999, []);
    expect(r.ok).toBe(false);
  });

  it('rejette emote_rich', () => {
    const r = validatePurchase('emote_rich', 999999, []);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/non achetable/i);
  });

  it('rejette si déjà possédé (non-consommable)', () => {
    const r = validatePurchase('emote_bolt', 9999, ['emote_bolt']);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/déjà possédé/i);
  });

  it('rejette si solde insuffisant', () => {
    const r = validatePurchase('emote_bolt', 100, []);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/insuffisant/i);
  });

  it('accepte solde exact', () => {
    const r = validatePurchase('emote_bolt', 150, []);
    expect(r.ok).toBe(true);
  });

  it('autorise achat consommable déjà possédé (stackable)', () => {
    const r = validatePurchase('consum_heart', 1000, ['consum_heart']);
    expect(r.ok).toBe(true);
  });

  it('consommable avec solde insuffisant', () => {
    const r = validatePurchase('consum_heart', 499, []);
    expect(r.ok).toBe(false);
  });
});

// ── applyPurchase ─────────────────────────────────────────────
describe('applyPurchase', () => {
  it('ajoute un skin à owned', () => {
    const inv = { owned: [], skin: 'default', emote: 'none', bg: 'default' };
    const result = applyPurchase('skin_plasma', SHOP_ITEMS.skin_plasma, inv);
    expect(result.owned).toContain('skin_plasma');
    expect(result.owned.length).toBe(1);
  });

  it('ajoute une emote à owned', () => {
    const inv = { owned: ['skin_plasma'] };
    const result = applyPurchase('emote_bolt', SHOP_ITEMS.emote_bolt, inv);
    expect(result.owned).toContain('emote_bolt');
    expect(result.owned).toContain('skin_plasma');
  });

  it('ne duplique pas un item déjà dans owned', () => {
    const inv = { owned: ['emote_bolt'] };
    const result = applyPurchase('emote_bolt', SHOP_ITEMS.emote_bolt, inv);
    expect(result.owned.filter(x => x === 'emote_bolt').length).toBe(1);
  });

  it('consommable — initialise à 1 si absent', () => {
    const inv = { owned: [] };
    const result = applyPurchase('consum_heart', SHOP_ITEMS.consum_heart, inv);
    expect(result.consumables.heart).toBe(1);
  });

  it('consommable — incrémente si déjà présent', () => {
    const inv = { owned: [], consumables: { heart: 3 } };
    const result = applyPurchase('consum_heart', SHOP_ITEMS.consum_heart, inv);
    expect(result.consumables.heart).toBe(4);
  });

  it('consommable — crée consumables si absent de inv', () => {
    const inv = { owned: [] };
    const result = applyPurchase('consum_fuse', SHOP_ITEMS.consum_fuse, inv);
    expect(result.consumables).toBeDefined();
    expect(result.consumables.fuse).toBe(1);
  });

  it('n\'écrase pas les autres consommables', () => {
    const inv = { owned: [], consumables: { heart: 2, fuse: 1 } };
    const result = applyPurchase('consum_hint', SHOP_ITEMS.consum_hint, inv);
    expect(result.consumables.heart).toBe(2);
    expect(result.consumables.fuse).toBe(1);
    expect(result.consumables.hint).toBe(1);
  });

  it('ne mute pas l\'inventaire original', () => {
    const inv = { owned: ['emote_bolt'] };
    const original = JSON.stringify(inv);
    applyPurchase('emote_skull', SHOP_ITEMS.emote_skull, inv);
    expect(JSON.stringify(inv)).toBe(original);
  });
});
