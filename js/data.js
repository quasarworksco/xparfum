/* ═══════════════════════════════════════════════════════════════
   XParfm · Catálogo local (fallback)

   Este catálogo se usa cuando Firestore está vacío o no responde,
   y es el que importa el botón "Importar catálogo local" del admin.

   ⚠️ CATÁLOGO DE MUESTRA: reemplaza estos productos y precios por
   tu catálogo real (o edítalos desde el panel admin una vez
   importados a Firestore).
   ═══════════════════════════════════════════════════════════════ */

// Margen por defecto del precio al detal cuando el producto
// no define un precioDetal propio: precioMayor + DETAL_MARKUP.
export const DETAL_MARKUP = 5;

export const CATALOGO_LOCAL = [
  { casa: "Lattafa",           nombre: "Khamrah",                 precioMayor: 32, destacado: true },
  { casa: "Lattafa",           nombre: "Khamrah Qahwa",           precioMayor: 34 },
  { casa: "Lattafa",           nombre: "Asad",                    precioMayor: 26, destacado: true },
  { casa: "Lattafa",           nombre: "Yara",                    precioMayor: 24, destacado: true },
  { casa: "Lattafa",           nombre: "Fakhar Black",            precioMayor: 25 },
  { casa: "Lattafa",           nombre: "Badee Al Oud Amethyst",   precioMayor: 30 },
  { casa: "Armaf",             nombre: "Club de Nuit Intense Man",precioMayor: 33, destacado: true },
  { casa: "Armaf",             nombre: "Club de Nuit Sillage",    precioMayor: 38 },
  { casa: "Afnan",             nombre: "9 PM",                    precioMayor: 27 },
  { casa: "Afnan",             nombre: "Supremacy Not Only Intense", precioMayor: 42 },
  { casa: "Maison Alhambra",   nombre: "Jean Lowe Ombre",         precioMayor: 28 },
  { casa: "Maison Alhambra",   nombre: "Kismet Angel",            precioMayor: 26 },
  { casa: "Al Haramain",       nombre: "Amber Oud Gold Edition",  precioMayor: 46 },
  { casa: "Bharara",           nombre: "King",                    precioMayor: 55 },
  { casa: "Rasasi",            nombre: "Hawas",                   precioMayor: 44 },
  { casa: "Carolina Herrera",  nombre: "Good Girl",               precioMayor: 88, destacado: true },
  { casa: "Carolina Herrera",  nombre: "212 VIP Rosé",            precioMayor: 78 },
  { casa: "Dior",              nombre: "Sauvage EDT",             precioMayor: 105 },
  { casa: "Chanel",            nombre: "Bleu de Chanel EDP",      precioMayor: 128 },
  { casa: "Versace",           nombre: "Eros",                    precioMayor: 68 },
  { casa: "Rabanne",           nombre: "One Million",             precioMayor: 82 },
  { casa: "Rabanne",           nombre: "Invictus",                precioMayor: 80 },
  { casa: "Jean Paul Gaultier",nombre: "Le Male Elixir",          precioMayor: 96 },
  { casa: "Yves Saint Laurent",nombre: "Y EDP",                   precioMayor: 98 },
  { casa: "Valentino",         nombre: "Born in Roma Uomo",       precioMayor: 90 },
  { casa: "Ariana Grande",     nombre: "Cloud",                   precioMayor: 48 },
  { casa: "Billie Eilish",     nombre: "Eilish",                  precioMayor: 46 },
  { casa: "Moschino",          nombre: "Toy 2 Pearl",             precioMayor: 62 },
].map((p, i) => ({
  id: `local-${i + 1}`,
  precioDetal: null,   // null → usa precioMayor + DETAL_MARKUP
  precioOferta: null,  // precio de oferta visible en la tienda (opcional)
  stock: 10,
  imagen: "",
  destacado: false,
  ...p,
}));
