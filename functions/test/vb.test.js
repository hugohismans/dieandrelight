// ── test/vb.test.js ──────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  calcVb, decomposeDiff, validateCampResult, validateSurvivalResult,
  shouldUnlockRich, ACH_VB, VB_BASE, VB_MIRROR_BONUS, VB_YB_MULT,
} from '../src/vb.js';

// ── calcVb ────────────────────────────────────────────────────
describe('calcVb', () => {
  it('base — bebe sans modificateur', () => expect(calcVb('bebe', false, false)).toBe(1));
  it('base — piquer sans modificateur', () => expect(calcVb('piquer', false, false)).toBe(10));
  it('base — cauchemar sans modificateur', () => expect(calcVb('cauchemar', false, false)).toBe(50));
  it('base — survie sans modificateur', () => expect(calcVb('survie', false, false)).toBe(3));

  it('mirror — bebe_inv', () => expect(calcVb('bebe', true, false)).toBe(2));       // (1+1)*1
  it('mirror — piquer_inv', () => expect(calcVb('piquer', true, false)).toBe(15));  // (10+5)*1
  it('mirror — cauchemar_inv', () => expect(calcVb('cauchemar', true, false)).toBe(55)); // (50+5)*1
  it('mirror — survie_inv', () => expect(calcVb('survie', true, false)).toBe(4));   // (3+1)*1

  it('yb — bebe_yb', () => expect(calcVb('bebe', false, true)).toBe(10));    // (1+0)*10
  it('yb — piquer_yb', () => expect(calcVb('piquer', false, true)).toBe(80)); // (10+0)*8
  it('yb — cauchemar_yb', () => expect(calcVb('cauchemar', false, true)).toBe(250)); // (50+0)*5
  it('yb — survie_yb', () => expect(calcVb('survie', false, true)).toBe(15)); // (3+0)*5

  it('yb+inv — bebe_yb_inv', () => expect(calcVb('bebe', true, true)).toBe(20));     // (1+1)*10
  it('yb+inv — piquer_yb_inv', () => expect(calcVb('piquer', true, true)).toBe(120)); // (10+5)*8
  it('yb+inv — cauchemar_yb_inv', () => expect(calcVb('cauchemar', true, true)).toBe(275)); // (50+5)*5
  it('yb+inv — survie_yb_inv', () => expect(calcVb('survie', true, true)).toBe(20)); // (3+1)*5

  it('camp invalide retourne 0', () => expect(calcVb('unknown', false, false)).toBe(0));
  it('camp vide retourne 0', () => expect(calcVb('', false, false)).toBe(0));
});

// ── decomposeDiff ─────────────────────────────────────────────
describe('decomposeDiff', () => {
  it('bebe', () => expect(decomposeDiff('bebe')).toEqual({ camp: 'bebe', inv: false, yb: false }));
  it('bebe_inv', () => expect(decomposeDiff('bebe_inv')).toEqual({ camp: 'bebe', inv: true, yb: false }));
  it('bebe_yb', () => expect(decomposeDiff('bebe_yb')).toEqual({ camp: 'bebe', inv: false, yb: true }));
  it('bebe_yb_inv', () => expect(decomposeDiff('bebe_yb_inv')).toEqual({ camp: 'bebe', inv: true, yb: true }));
  it('cauchemar_yb_inv', () => expect(decomposeDiff('cauchemar_yb_inv')).toEqual({ camp: 'cauchemar', inv: true, yb: true }));
  it('survie_inv', () => expect(decomposeDiff('survie_inv')).toEqual({ camp: 'survie', inv: true, yb: false }));
  it('survie_yb_inv', () => expect(decomposeDiff('survie_yb_inv')).toEqual({ camp: 'survie', inv: true, yb: true }));
  it('piquer_yb', () => expect(decomposeDiff('piquer_yb')).toEqual({ camp: 'piquer', inv: false, yb: true }));
});

// ── validateCampResult ────────────────────────────────────────
describe('validateCampResult', () => {
  it('valide — bebe, temps normal', () => expect(validateCampResult('bebe', 60000, 5)).toBeNull());
  it('valide — piquer, zéro mort', () => expect(validateCampResult('piquer', 300000, 0)).toBeNull());
  it('valide — cauchemar, max morts', () => expect(validateCampResult('cauchemar', 3600000, 99999)).toBeNull());

  it('rejette survie (mauvais endpoint)', () => expect(validateCampResult('survie', 60000, 0)).toBeTruthy());
  it('rejette camp inconnu', () => expect(validateCampResult('unknown', 60000, 0)).toBeTruthy());

  it('rejette temps trop court (≤10s)', () => expect(validateCampResult('bebe', 10000, 0)).toBeTruthy());
  it('rejette temps exactement 10s', () => expect(validateCampResult('bebe', 10000, 0)).toBeTruthy());
  it('rejette temps trop long (≥2h)', () => expect(validateCampResult('bebe', 7200000, 0)).toBeTruthy());
  it('accepte juste au-dessus de 10s', () => expect(validateCampResult('bebe', 10001, 0)).toBeNull());
  it('accepte juste en-dessous de 2h', () => expect(validateCampResult('bebe', 7199999, 0)).toBeNull());

  it('rejette morts négatives', () => expect(validateCampResult('bebe', 60000, -1)).toBeTruthy());
  it('rejette morts trop élevées', () => expect(validateCampResult('bebe', 60000, 100000)).toBeTruthy());
  it('rejette temps non-number', () => expect(validateCampResult('bebe', '60000', 0)).toBeTruthy());
  it('rejette morts non-number', () => expect(validateCampResult('bebe', 60000, '0')).toBeTruthy());
});

// ── validateSurvivalResult ────────────────────────────────────
describe('validateSurvivalResult', () => {
  it('valide — 1 niveau', () => expect(validateSurvivalResult(1)).toBeNull());
  it('valide — 9999 niveaux', () => expect(validateSurvivalResult(9999)).toBeNull());
  it('rejette 0', () => expect(validateSurvivalResult(0)).toBeTruthy());
  it('rejette 10000', () => expect(validateSurvivalResult(10000)).toBeTruthy());
  it('rejette valeur non-number', () => expect(validateSurvivalResult('1')).toBeTruthy());
});

// ── shouldUnlockRich ──────────────────────────────────────────
describe('shouldUnlockRich', () => {
  it('débloque à exactement 50000', () => expect(shouldUnlockRich(50000, [])).toBe(true));
  it('débloque au-dessus de 50000', () => expect(shouldUnlockRich(99999, [])).toBe(true));
  it('ne débloque pas en-dessous', () => expect(shouldUnlockRich(49999, [])).toBe(false));
  it('ne débloque pas si déjà possédé', () => expect(shouldUnlockRich(50000, ['emote_rich'])).toBe(false));
  it('ne débloque pas si possédé avec d\'autres items', () => expect(shouldUnlockRich(100000, ['skin_plasma', 'emote_rich'])).toBe(false));
});

// ── ACH_VB — intégrité du catalogue ───────────────────────────
describe('ACH_VB', () => {
  it('contient exactement 37 hauts-faits', () => expect(Object.keys(ACH_VB).length).toBe(37));

  it('toutes les récompenses sont des entiers positifs', () => {
    for (const [id, vb] of Object.entries(ACH_VB)) {
      expect(typeof vb, `${id} doit être un number`).toBe('number');
      expect(vb > 0, `${id} doit être > 0`).toBe(true);
      expect(Number.isInteger(vb), `${id} doit être un entier`).toBe(true);
    }
  });

  // Quelques valeurs clés connues
  it('first_death = 50',                  () => expect(ACH_VB.first_death).toBe(50));
  it('cauchemar_won = 600',               () => expect(ACH_VB.cauchemar_won).toBe(600));
  it('yb_cauchemar_deathless = 3000',     () => expect(ACH_VB.yb_cauchemar_deathless).toBe(3000));
  it('yb_inv_cauchemar_deathless = 5000', () => expect(ACH_VB.yb_inv_cauchemar_deathless).toBe(5000));
  it('platine = 5000',                    () => expect(ACH_VB.platine).toBe(5000));
});
