// Special thanks / content creators — edit this file to update both index.html and game.html
const SPECIAL_THANKS = [
  { pseudo: 'Lesups',                      fr: 'Créateur du jeu',      en: 'Game creator' },
  { pseudo: 'KetaKoala',                   fr: 'Bras droit & MVP',     en: 'Right hand & MVP' },
  { pseudo: 'Hormun',                      fr: 'Testeur',              en: 'Tester' },
  { pseudo: 'Skunkz',                      fr: 'Testeur',              en: 'Tester' },
  { pseudo: 'Alex',                        fr: 'Testeur',              en: 'Tester' },
  { pseudo: 'AccurateCatFish',             fr: 'Testeur',              en: 'Tester' },
  { pseudo: 'Frigolite',                   fr: 'Créateur de niveau',   en: 'Level creator' },
  { pseudo: 'Philippe 1er (roi des Belges)', fr: 'Merci de servir à rien', en: 'Thanks for nothing' },
];

// Retourne la couleur CSS en fonction du rôle (utilise toujours le champ fr pour la détection).
function specialThanksColor(entry) {
  const r = (typeof entry === 'object' ? entry.fr : entry).toLowerCase();
  if (r.includes('créateur du jeu'))    return '#ffcc44'; // or
  if (r.includes('bras droit'))         return '#ffcc44'; // or doré
  if (r.includes('créateur de niveau')) return '#44ff99'; // vert
  if (r.includes('testeur'))            return '#44aaff'; // bleu
  return '#556677'; // gris par défaut
}
