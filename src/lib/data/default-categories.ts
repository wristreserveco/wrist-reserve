// Centralised default brand + sub-category taxonomy. Used by:
//   - the SQL migration 011 (hand-kept in sync)
//   - the /api/admin/categories/seed route so you can (re)seed from the UI.

export interface DefaultBrandSeed {
  name: string;
  slug: string;
  tagline: string;
  children: Array<{ name: string; slug: string }>;
}

export const DEFAULT_BRANDS: DefaultBrandSeed[] = [
  {
    name: "Rolex",
    slug: "rolex",
    tagline: "Crown-level icons",
    children: [
      { name: "Submariner", slug: "rolex-submariner" },
      { name: "GMT-Master II", slug: "rolex-gmt-master-ii" },
      { name: "Daytona", slug: "rolex-daytona" },
      { name: "Datejust", slug: "rolex-datejust" },
      { name: "Day-Date", slug: "rolex-day-date" },
      { name: "Explorer", slug: "rolex-explorer" },
      { name: "Sea-Dweller", slug: "rolex-sea-dweller" },
      { name: "Deepsea", slug: "rolex-deepsea" },
      { name: "Yacht-Master", slug: "rolex-yacht-master" },
      { name: "Sky-Dweller", slug: "rolex-sky-dweller" },
      { name: "Air-King", slug: "rolex-air-king" },
      { name: "Milgauss", slug: "rolex-milgauss" },
      { name: "Oyster Perpetual", slug: "rolex-oyster-perpetual" },
      { name: "Cellini", slug: "rolex-cellini" },
      { name: "1908", slug: "rolex-1908" },
    ],
  },
  {
    name: "Patek Philippe",
    slug: "patek-philippe",
    tagline: "Haute horlogerie",
    children: [
      { name: "Nautilus", slug: "patek-nautilus" },
      { name: "Aquanaut", slug: "patek-aquanaut" },
      { name: "Calatrava", slug: "patek-calatrava" },
      { name: "Complications", slug: "patek-complications" },
      { name: "Grand Complications", slug: "patek-grand-complications" },
      { name: "Twenty~4", slug: "patek-twenty-four" },
      { name: "Gondolo", slug: "patek-gondolo" },
      { name: "Golden Ellipse", slug: "patek-golden-ellipse" },
    ],
  },
  {
    name: "Audemars Piguet",
    slug: "audemars-piguet",
    tagline: "Genta architecture",
    children: [
      { name: "Royal Oak", slug: "ap-royal-oak" },
      { name: "Royal Oak Offshore", slug: "ap-royal-oak-offshore" },
      { name: "Royal Oak Concept", slug: "ap-royal-oak-concept" },
      { name: "Code 11.59", slug: "ap-code-11-59" },
      { name: "Millenary", slug: "ap-millenary" },
      { name: "Jules Audemars", slug: "ap-jules-audemars" },
    ],
  },
  {
    name: "Omega",
    slug: "omega",
    tagline: "Moonwatch heritage",
    children: [
      { name: "Speedmaster", slug: "omega-speedmaster" },
      { name: "Seamaster", slug: "omega-seamaster" },
      { name: "Constellation", slug: "omega-constellation" },
      { name: "De Ville", slug: "omega-de-ville" },
      { name: "Railmaster", slug: "omega-railmaster" },
    ],
  },
  {
    name: "Tudor",
    slug: "tudor",
    tagline: "Tool-watch DNA",
    children: [
      { name: "Black Bay", slug: "tudor-black-bay" },
      { name: "Pelagos", slug: "tudor-pelagos" },
      { name: "Royal", slug: "tudor-royal" },
      { name: "Heritage", slug: "tudor-heritage" },
      { name: "Ranger", slug: "tudor-ranger" },
      { name: "1926", slug: "tudor-1926" },
    ],
  },
  {
    name: "Cartier",
    slug: "cartier",
    tagline: "Paris maison",
    children: [
      { name: "Santos", slug: "cartier-santos" },
      { name: "Tank", slug: "cartier-tank" },
      { name: "Ballon Bleu", slug: "cartier-ballon-bleu" },
      { name: "Pasha", slug: "cartier-pasha" },
      { name: "Panthère", slug: "cartier-panthere" },
      { name: "Ronde Louis", slug: "cartier-ronde-louis" },
    ],
  },
  {
    name: "IWC",
    slug: "iwc",
    tagline: "Schaffhausen precision",
    children: [
      { name: "Portugieser", slug: "iwc-portugieser" },
      { name: "Pilot's Watch", slug: "iwc-pilots-watch" },
      { name: "Big Pilot", slug: "iwc-big-pilot" },
      { name: "Portofino", slug: "iwc-portofino" },
      { name: "Aquatimer", slug: "iwc-aquatimer" },
      { name: "Ingenieur", slug: "iwc-ingenieur" },
      { name: "Da Vinci", slug: "iwc-da-vinci" },
    ],
  },
  {
    name: "Richard Mille",
    slug: "richard-mille",
    tagline: "Motorsport engineering",
    children: [
      { name: "RM 011", slug: "rm-011" },
      { name: "RM 035", slug: "rm-035" },
      { name: "RM 055", slug: "rm-055" },
      { name: "RM 67-02", slug: "rm-67-02" },
      { name: "RM 72-01", slug: "rm-72-01" },
      { name: "RM 27-04", slug: "rm-27-04" },
    ],
  },
  {
    name: "Breitling",
    slug: "breitling",
    tagline: "Aviation chronographs",
    children: [
      { name: "Navitimer", slug: "breitling-navitimer" },
      { name: "Chronomat", slug: "breitling-chronomat" },
      { name: "Superocean", slug: "breitling-superocean" },
      { name: "Avenger", slug: "breitling-avenger" },
      { name: "Premier", slug: "breitling-premier" },
      { name: "Top Time", slug: "breitling-top-time" },
    ],
  },
  {
    name: "Hublot",
    slug: "hublot",
    tagline: "Fusion avant-garde",
    children: [
      { name: "Big Bang", slug: "hublot-big-bang" },
      { name: "Classic Fusion", slug: "hublot-classic-fusion" },
      { name: "Spirit of Big Bang", slug: "hublot-spirit-of-big-bang" },
      { name: "MP Collection", slug: "hublot-mp-collection" },
    ],
  },
  {
    name: "Tag Heuer",
    slug: "tag-heuer",
    tagline: "Racing stopwatches",
    children: [
      { name: "Carrera", slug: "tag-carrera" },
      { name: "Monaco", slug: "tag-monaco" },
      { name: "Aquaracer", slug: "tag-aquaracer" },
      { name: "Formula 1", slug: "tag-formula-1" },
      { name: "Link", slug: "tag-link" },
    ],
  },
  {
    name: "Vacheron Constantin",
    slug: "vacheron-constantin",
    tagline: "Since 1755",
    children: [
      { name: "Overseas", slug: "vc-overseas" },
      { name: "Patrimony", slug: "vc-patrimony" },
      { name: "Traditionnelle", slug: "vc-traditionnelle" },
      { name: "Historiques", slug: "vc-historiques" },
      { name: "Fiftysix", slug: "vc-fiftysix" },
    ],
  },
  {
    name: "Grand Seiko",
    slug: "grand-seiko",
    tagline: "Japanese craft",
    children: [
      { name: "Heritage", slug: "gs-heritage" },
      { name: "Elegance", slug: "gs-elegance" },
      { name: "Sport", slug: "gs-sport" },
      { name: "Evolution 9", slug: "gs-evolution-9" },
    ],
  },
  {
    name: "Panerai",
    slug: "panerai",
    tagline: "Italian frogman steel",
    children: [
      { name: "Luminor", slug: "panerai-luminor" },
      { name: "Submersible", slug: "panerai-submersible" },
      { name: "Radiomir", slug: "panerai-radiomir" },
    ],
  },
  {
    name: "A. Lange & Söhne",
    slug: "a-lange-sohne",
    tagline: "Glashütte excellence",
    children: [
      { name: "Lange 1", slug: "als-lange-1" },
      { name: "Datograph", slug: "als-datograph" },
      { name: "Odysseus", slug: "als-odysseus" },
      { name: "Saxonia", slug: "als-saxonia" },
      { name: "Zeitwerk", slug: "als-zeitwerk" },
      { name: "1815", slug: "als-1815" },
    ],
  },
  {
    name: "Jaeger-LeCoultre",
    slug: "jaeger-lecoultre",
    tagline: "Reverso maison",
    children: [
      { name: "Reverso", slug: "jlc-reverso" },
      { name: "Master Control", slug: "jlc-master-control" },
      { name: "Master Ultra Thin", slug: "jlc-master-ultra-thin" },
      { name: "Polaris", slug: "jlc-polaris" },
      { name: "Duomètre", slug: "jlc-duometre" },
    ],
  },
  {
    name: "Zenith",
    slug: "zenith",
    tagline: "El Primero originals",
    children: [
      { name: "Chronomaster", slug: "zenith-chronomaster" },
      { name: "Defy", slug: "zenith-defy" },
      { name: "Pilot", slug: "zenith-pilot" },
      { name: "Elite", slug: "zenith-elite" },
    ],
  },
  {
    name: "Chopard",
    slug: "chopard",
    tagline: "Mille Miglia heritage",
    children: [
      { name: "Mille Miglia", slug: "chopard-mille-miglia" },
      { name: "Alpine Eagle", slug: "chopard-alpine-eagle" },
      { name: "L.U.C", slug: "chopard-luc" },
      { name: "Happy Sport", slug: "chopard-happy-sport" },
    ],
  },
];
