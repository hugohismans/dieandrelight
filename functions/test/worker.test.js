// ── test/worker.test.js ───────────────────────────────────────
// Tests d'intégration du Worker — toutes les dépendances réseau sont mockées.
// On importe le handler directement et on forge des Request Cloudflare-style.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────
// On mock les modules avant l'import du handler
vi.mock('../src/auth.js', () => ({
  verifyIdToken: vi.fn(),
  getServiceAccountToken: vi.fn().mockResolvedValue('sa-token'),
}));

vi.mock('../src/firebase.js', () => ({
  fbRead: vi.fn(),
  fbWrite: vi.fn().mockResolvedValue(true),
  fbPatch: vi.fn().mockResolvedValue(true),
  fbDelete: vi.fn().mockResolvedValue(true),
  getVb: vi.fn().mockResolvedValue(100),
  setVb: vi.fn().mockResolvedValue(true),
  getInventory: vi.fn().mockResolvedValue({ owned: [], skin: 'default', emote: 'none', bg: 'default' }),
  setInventory: vi.fn().mockResolvedValue(true),
  syncVbRank: vi.fn().mockResolvedValue(true),
  syncAchRank: vi.fn().mockResolvedValue(true),
  getHofEntry: vi.fn(),
}));

import { verifyIdToken } from '../src/auth.js';
import { getVb, setVb, getInventory, setInventory, syncVbRank, syncAchRank, getHofEntry, fbRead, fbWrite } from '../src/firebase.js';
import worker from '../src/index.js';

// ── Helpers ───────────────────────────────────────────────────
const ENV = {
  FIREBASE_API_KEY: 'test-api-key',
  FIREBASE_SERVICE_ACCOUNT: '{"test":"true"}',
  ALLOWED_ORIGIN: 'https://dieandrelight.com',
};

function makeRequest(method, path, body, origin = 'https://dieandrelight.com') {
  const url = `https://worker.example.com${path}`;
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-id-token',
      'Origin': origin,
    },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(url, init);
}

async function callWorker(method, path, body) {
  const req = makeRequest(method, path, body);
  return worker.fetch(req, ENV);
}

// ── Setup ─────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  verifyIdToken.mockResolvedValue({ uid: 'user-abc', email: 'test@test.com' });
  getVb.mockResolvedValue(100);
  getInventory.mockResolvedValue({ owned: [], skin: 'default', emote: 'none', bg: 'default' });
  fbRead.mockResolvedValue(null);
  fbWrite.mockResolvedValue(true);
});

// ── CORS ──────────────────────────────────────────────────────
describe('CORS', () => {
  it('OPTIONS retourne 204', async () => {
    const req = new Request('https://worker.example.com/vb-balance', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://dieandrelight.com' },
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://dieandrelight.com');
  });

  it('origine inconnue reçoit quand même un header CORS', async () => {
    const req = makeRequest('OPTIONS', '/vb-balance', null, 'https://evil.com');
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(204);
  });
});

// ── Auth ──────────────────────────────────────────────────────
describe('Auth', () => {
  it('requête sans token → 401', async () => {
    const req = new Request('https://worker.example.com/vb-balance', {
      method: 'GET',
      headers: { 'Origin': 'https://dieandrelight.com' },
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(401);
  });

  it('token invalide → 401', async () => {
    verifyIdToken.mockRejectedValue(new Error('Token invalide'));
    const res = await callWorker('GET', '/vb-balance', null);
    expect(res.status).toBe(401);
  });

  it('route inconnue → 404', async () => {
    const res = await callWorker('GET', '/unknown-route', null);
    expect(res.status).toBe(404);
  });
});

// ── GET /vb-balance ───────────────────────────────────────────
describe('GET /vb-balance', () => {
  it('retourne le solde VB', async () => {
    getVb.mockResolvedValue(1500);
    const res = await callWorker('GET', '/vb-balance', null);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.vb).toBe(1500);
  });
});

// ── POST /sync-ranks ──────────────────────────────────────────
describe('POST /sync-ranks', () => {
  it('sync valide', async () => {
    getVb.mockResolvedValue(500);
    const res = await callWorker('POST', '/sync-ranks', {
      pseudo: 'Toto', achCount: 10, emote: 'bolt', skin: 'default', bg: 'default',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.vb).toBe(500);
    expect(syncVbRank).toHaveBeenCalled();
    expect(syncAchRank).toHaveBeenCalled();
  });

  it('pseudo manquant → 400', async () => {
    const res = await callWorker('POST', '/sync-ranks', { achCount: 5 });
    expect(res.status).toBe(400);
  });

  it('achCount invalide (négatif) → 400', async () => {
    const res = await callWorker('POST', '/sync-ranks', { pseudo: 'Toto', achCount: -1 });
    expect(res.status).toBe(400);
  });

  it('achCount invalide (trop grand) → 400', async () => {
    const res = await callWorker('POST', '/sync-ranks', { pseudo: 'Toto', achCount: 38 });
    expect(res.status).toBe(400);
  });
});

// ── POST /buy-item ────────────────────────────────────────────
describe('POST /buy-item', () => {
  it('achat valide — emote_bolt', async () => {
    getVb.mockResolvedValue(500);
    const res = await callWorker('POST', '/buy-item', { itemId: 'emote_bolt', pseudo: 'Toto' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.vb).toBe(500 - 150); // 350
    expect(setVb).toHaveBeenCalledWith('user-abc', 350, 'sa-token');
  });

  it('solde insuffisant → 400', async () => {
    getVb.mockResolvedValue(50);
    const res = await callWorker('POST', '/buy-item', { itemId: 'emote_bolt', pseudo: 'Toto' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/insuffisant/i);
  });

  it('item déjà possédé → 400', async () => {
    getVb.mockResolvedValue(500);
    getInventory.mockResolvedValue({ owned: ['emote_bolt'], skin: 'default', emote: 'none', bg: 'default' });
    const res = await callWorker('POST', '/buy-item', { itemId: 'emote_bolt', pseudo: 'Toto' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/déjà possédé/i);
  });

  it('item inconnu → 400', async () => {
    const res = await callWorker('POST', '/buy-item', { itemId: 'item_fantome', pseudo: 'Toto' });
    expect(res.status).toBe(400);
  });

  it('emote_rich non achetable → 400', async () => {
    getVb.mockResolvedValue(999999);
    const res = await callWorker('POST', '/buy-item', { itemId: 'emote_rich', pseudo: 'Toto' });
    expect(res.status).toBe(400);
  });

  it('pseudo manquant → 400', async () => {
    const res = await callWorker('POST', '/buy-item', { itemId: 'emote_bolt' });
    expect(res.status).toBe(400);
  });

  it('achat consommable empile correctement', async () => {
    getVb.mockResolvedValue(2000);
    getInventory.mockResolvedValue({ owned: [], consumables: { heart: 2 } });
    const res = await callWorker('POST', '/buy-item', { itemId: 'consum_heart', pseudo: 'Toto' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.inventory.consumables.heart).toBe(3);
  });
});

// ── POST /earn-vb-survival ────────────────────────────────────
describe('POST /earn-vb-survival', () => {
  it('gagne des VB pour 1 niveau — bebe sans modificateur', async () => {
    // survie base = 3 VB
    getVb.mockResolvedValue(100);
    const res = await callWorker('POST', '/earn-vb-survival', {
      levels: 1, inv: false, yb: false, pseudo: 'Toto',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.earned).toBe(3);
    expect(data.vb).toBe(103);
  });

  it('gagne des VB — survie_yb_inv', async () => {
    // (3+1)*5 = 20 VB
    getVb.mockResolvedValue(0);
    const res = await callWorker('POST', '/earn-vb-survival', {
      levels: 1, inv: true, yb: true, pseudo: 'Toto',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.earned).toBe(20);
  });

  it('rejette levels != 1', async () => {
    const res = await callWorker('POST', '/earn-vb-survival', {
      levels: 2, inv: false, yb: false, pseudo: 'Toto',
    });
    expect(res.status).toBe(400);
  });

  it('pseudo manquant → 400', async () => {
    const res = await callWorker('POST', '/earn-vb-survival', { levels: 1 });
    expect(res.status).toBe(400);
  });

  it('débloque emote_rich si nouveau VB >= 50000', async () => {
    getVb.mockResolvedValue(49999);
    getInventory.mockResolvedValue({ owned: [], skin: 'default', emote: 'none', bg: 'default' });
    const res = await callWorker('POST', '/earn-vb-survival', {
      levels: 1, inv: true, yb: true, pseudo: 'Toto', // +20 VB = 50019
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.richUnlocked).toBe(true);
    expect(setInventory).toHaveBeenCalledWith('user-abc', expect.objectContaining({
      owned: expect.arrayContaining(['emote_rich']),
    }), 'sa-token');
  });
});

// ── POST /unlock-ach ──────────────────────────────────────────
describe('POST /unlock-ach', () => {
  it('écrit le haut-fait et crédite first_death', async () => {
    fbRead.mockResolvedValue([]); // vb_ach_paid vide
    getVb.mockResolvedValue(0);
    const res = await callWorker('POST', '/unlock-ach', { id: 'first_death', pseudo: 'Toto' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.earned).toBe(50);
    expect(data.vb).toBe(50);
    expect(fbWrite).toHaveBeenCalledWith(
      expect.stringContaining('achievements/'),
      true, 'sa-token'
    );
  });

  it('anti-replay — retourne alreadyPaid si VB déjà crédité', async () => {
    fbRead.mockResolvedValue(['first_death']);
    getVb.mockResolvedValue(50);
    const res = await callWorker('POST', '/unlock-ach', { id: 'first_death', pseudo: 'Toto' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alreadyPaid).toBe(true);
    expect(setVb).not.toHaveBeenCalled();
  });

  it('haut-fait sans VB — écrit quand même et retourne earned: 0', async () => {
    // Simule un haut-fait qui n'est pas dans ACH_VB
    fbRead.mockResolvedValue([]);
    getVb.mockResolvedValue(100);
    const res = await callWorker('POST', '/unlock-ach', { id: 'inexistant_no_vb', pseudo: 'Toto' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.earned).toBe(0);
    expect(setVb).not.toHaveBeenCalled();
  });

  it('pseudo manquant → 400', async () => {
    const res = await callWorker('POST', '/unlock-ach', { id: 'first_death' });
    expect(res.status).toBe(400);
  });

  it('platine crédite 5000 VB', async () => {
    fbRead.mockResolvedValue([]);
    getVb.mockResolvedValue(10000);
    const res = await callWorker('POST', '/unlock-ach', { id: 'platine', pseudo: 'Toto' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.earned).toBe(5000);
    expect(data.vb).toBe(15000);
  });
});

// ── POST /use-consumable ──────────────────────────────────────
describe('POST /use-consumable', () => {
  it('décrémente heart disponible', async () => {
    fbRead.mockResolvedValue({ heart: 1, fuse: 2 });
    const res = await callWorker('POST', '/use-consumable', { id: 'heart' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.remaining).toBe(0);
    expect(fbWrite).toHaveBeenCalledWith(
      expect.stringContaining('consumables/heart'), 0, 'sa-token'
    );
  });

  it('décrémente hint depuis count > 1', async () => {
    fbRead.mockResolvedValue({ hint: 3 });
    const res = await callWorker('POST', '/use-consumable', { id: 'hint' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.remaining).toBe(2);
  });

  it('aucun consommable disponible → 400', async () => {
    fbRead.mockResolvedValue({ heart: 0 });
    const res = await callWorker('POST', '/use-consumable', { id: 'heart' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/aucun/i);
  });

  it('consommable absent → 400', async () => {
    fbRead.mockResolvedValue({});
    const res = await callWorker('POST', '/use-consumable', { id: 'fuse' });
    expect(res.status).toBe(400);
  });

  it('type invalide → 400', async () => {
    const res = await callWorker('POST', '/use-consumable', { id: 'gold' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalide/i);
  });

  it('gère le format booléen legacy (heart: true → 1)', async () => {
    fbRead.mockResolvedValue({ heart: true });
    const res = await callWorker('POST', '/use-consumable', { id: 'heart' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.remaining).toBe(0);
  });
});

// ── POST /earn-vb ─────────────────────────────────────────────
describe('POST /earn-vb', () => {
  const validHofEntry = { uid: 'user-abc', time: 60000, deaths: 5, pseudo: 'Toto' };

  it('crédite les VB après campagne valide', async () => {
    getHofEntry.mockResolvedValue(validHofEntry);
    fbRead.mockResolvedValue(null); // pas encore payé
    getVb.mockResolvedValue(100);
    const res = await callWorker('POST', '/earn-vb', {
      diff: 'bebe', hofKey: '-abc123', timeMs: 60000, deaths: 5, pseudo: 'Toto',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.earned).toBe(1); // bebe base sans modificateur
    expect(data.vb).toBe(101);
  });

  it('HOF introuvable → 404', async () => {
    getHofEntry.mockResolvedValue(null);
    const res = await callWorker('POST', '/earn-vb', {
      diff: 'bebe', hofKey: '-bad', timeMs: 60000, deaths: 5, pseudo: 'Toto',
    });
    expect(res.status).toBe(404);
  });

  it('UID ne correspond pas → 403', async () => {
    getHofEntry.mockResolvedValue({ uid: 'other-user', time: 60000, deaths: 5 });
    const res = await callWorker('POST', '/earn-vb', {
      diff: 'bebe', hofKey: '-abc', timeMs: 60000, deaths: 5, pseudo: 'Toto',
    });
    expect(res.status).toBe(403);
  });

  it('temps non concordant (>500ms d\'écart) → 400', async () => {
    getHofEntry.mockResolvedValue({ uid: 'user-abc', time: 60000, deaths: 5 });
    const res = await callWorker('POST', '/earn-vb', {
      diff: 'bebe', hofKey: '-abc', timeMs: 60700, deaths: 5, pseudo: 'Toto',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/temps/i);
  });

  it('tolérance ±500ms sur le temps', async () => {
    getHofEntry.mockResolvedValue(validHofEntry); // time=60000
    fbRead.mockResolvedValue(null);
    getVb.mockResolvedValue(0);
    const res = await callWorker('POST', '/earn-vb', {
      diff: 'bebe', hofKey: '-abc123', timeMs: 60500, deaths: 5, pseudo: 'Toto',
    });
    expect(res.status).toBe(200);
  });

  it('morts non concordantes → 400', async () => {
    getHofEntry.mockResolvedValue({ uid: 'user-abc', time: 60000, deaths: 5 });
    const res = await callWorker('POST', '/earn-vb', {
      diff: 'bebe', hofKey: '-abc', timeMs: 60000, deaths: 6, pseudo: 'Toto',
    });
    expect(res.status).toBe(400);
  });

  it('anti-replay — déjà payé retourne alreadyPaid', async () => {
    getHofEntry.mockResolvedValue(validHofEntry);
    fbRead.mockResolvedValue(true); // déjà marqué comme payé
    const res = await callWorker('POST', '/earn-vb', {
      diff: 'bebe', hofKey: '-abc123', timeMs: 60000, deaths: 5, pseudo: 'Toto',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alreadyPaid).toBe(true);
    expect(setVb).not.toHaveBeenCalled();
  });

  it('paramètres manquants → 400', async () => {
    const res = await callWorker('POST', '/earn-vb', { diff: 'bebe' });
    expect(res.status).toBe(400);
  });

  it('camp invalide (survie) → 400', async () => {
    const res = await callWorker('POST', '/earn-vb', {
      diff: 'survie', hofKey: '-abc', timeMs: 60000, deaths: 0, pseudo: 'Toto',
    });
    expect(res.status).toBe(400);
  });
});
