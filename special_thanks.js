// Special thanks / content creators — edit this file to update both index.html and game.html
const SPECIAL_THANKS = [
  { pseudo: 'Lesups', level: 'Créateur du jeu / Game creator' },
  { pseudo: 'KetaKoala', level: 'Bras droit & MVP / Right hand & MVP' },
  { pseudo: 'Hormun', level: 'Testeur / Tester' },
  { pseudo: 'Skunkz', level: 'Testeur / Tester' },
  { pseudo: 'Alex', level: 'Testeur / Tester' },
  { pseudo: 'AccurateCatFish', level: 'Testeur / Tester' },
  { pseudo: 'Frigolite', level: 'Createur de niveau / Level creator' },
  { pseudo: 'Philippe 1er (roi des Belges)', level: 'Merci de servir a rien' },
];

// Retourne la couleur CSS associée au rôle d'une entrée Special Thanks.
// Ajouter ici de nouvelles règles si de nouveaux rôles apparaissent.
function specialThanksColor(level) {
  const r = (level || '').toLowerCase();
  if (r.includes('créateur du jeu') || r.includes('createur du jeu') || r.includes('game creator')) return '#ffcc44'; // or
  if (r.includes('bras droit') || r.includes('right hand') || r.includes('mvp')) return '#ffcc44'; // or doré
  if (r.includes('créateur de niveau') || r.includes('createur de niveau') || r.includes('level creator')) return '#44ff99'; // vert
  if (r.includes('testeur') || r.includes('tester')) return '#44aaff'; // bleu
  return '#556677'; // gris par défaut
}
