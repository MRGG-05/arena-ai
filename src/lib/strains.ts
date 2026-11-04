import { hex, RGB } from './util';

export interface StrainColors {
  leafYoung: RGB;
  leafBase: RGB;
  leafFade: RGB;
  leafEdge: RGB;
  vein: RGB;
  stem: RGB;
  stemFade: RGB;
  calyxA: RGB; // grün (jung)
  calyxB: RGB; // Endfarbe der Blüte
  calyxLight: RGB;
  pistilA: RGB;
  pistilB: RGB;
}

export interface Strain {
  id: string;
  name: string;
  type: string;
  tagline: string;
  thc: string;
  accent: string;
  accent2: string;
  aroma: string[];
  colorNote: string;
  flowerStart: number; // Tag der Umstellung auf 12/12
  harvestDay: number;
  hVeg: number; // cm am Ende der Veg
  stretch: number; // Streckung in der Blüte
  nodes: number;
  maxLeaflets: number;
  leafWidth: number;
  leafSize: number; // cm
  branchLen: number; // cm
  branchAngle: number; // Grad über Horizontal
  budSize: number;
  maxYield: number; // g pro Pflanze
  fadeStart: number;
  fadeMax: number;
  seed: number;
  colors: StrainColors;
}

const c = hex;

export const STRAINS: Strain[] = [
  {
    id: 'purple',
    name: 'Purple Haze Dream',
    type: 'Sativa-Hybrid',
    tagline: 'Hoch, schlank, Blätter & Blüten färben sich tief violett.',
    thc: '21 %',
    accent: '#a974ff',
    accent2: '#5b2a9c',
    aroma: ['Beere', 'Weihrauch', 'Süß'],
    colorNote: 'Blätter: Grün → Violett · Blüten: Lavendel mit orangen Härchen',
    flowerStart: 49,
    harvestDay: 112,
    hVeg: 56,
    stretch: 1.15,
    nodes: 15,
    maxLeaflets: 9,
    leafWidth: 0.105,
    leafSize: 25,
    branchLen: 38,
    branchAngle: 44,
    budSize: 1.0,
    maxYield: 96,
    fadeStart: 66,
    fadeMax: 1,
    seed: 11,
    colors: {
      leafYoung: c('#8fcf55'),
      leafBase: c('#2f7a2e'),
      leafFade: c('#5b2a86'),
      leafEdge: c('#8a2d9e'),
      vein: c('#b8dd8a'),
      stem: c('#6f9a3b'),
      stemFade: c('#7b4a94'),
      calyxA: c('#6f9f3c'),
      calyxB: c('#7a4ca8'),
      calyxLight: c('#c3a6ea'),
      pistilA: c('#f6eed6'),
      pistilB: c('#e8812a'),
    },
  },
  {
    id: 'lemon',
    name: 'Lemon Skunk',
    type: 'Hybrid',
    tagline: 'Buschig, harzig – Blätter werden zitronengelb und golden.',
    thc: '19 %',
    accent: '#e8d33a',
    accent2: '#7a7a14',
    aroma: ['Zitrone', 'Skunk', 'Pinie'],
    colorNote: 'Blätter: Grün → Zitronengelb/Gold · Blüten: Limette',
    flowerStart: 42,
    harvestDay: 98,
    hVeg: 44,
    stretch: 1.0,
    nodes: 13,
    maxLeaflets: 7,
    leafWidth: 0.135,
    leafSize: 23,
    branchLen: 40,
    branchAngle: 38,
    budSize: 1.05,
    maxYield: 118,
    fadeStart: 58,
    fadeMax: 1,
    seed: 23,
    colors: {
      leafYoung: c('#a6dc4c'),
      leafBase: c('#4c9a26'),
      leafFade: c('#dccb2a'),
      leafEdge: c('#e9961c'),
      vein: c('#e4f09a'),
      stem: c('#86b83a'),
      stemFade: c('#b9c23a'),
      calyxA: c('#8dc23a'),
      calyxB: c('#d6dc55'),
      calyxLight: c('#f1f5a0'),
      pistilA: c('#faf1b8'),
      pistilB: c('#f0961d'),
    },
  },
  {
    id: 'crimson',
    name: 'Crimson Widow',
    type: 'Indica',
    tagline: 'Kompakt & dicht – Blätter glühen in Burgunder und Orange.',
    thc: '24 %',
    accent: '#ff5a4d',
    accent2: '#8a1b2d',
    aroma: ['Kirsche', 'Erde', 'Gewürz'],
    colorNote: 'Blätter: Dunkelgrün → Burgunder/Orange · Blüten: Rotviolett',
    flowerStart: 38,
    harvestDay: 92,
    hVeg: 36,
    stretch: 0.75,
    nodes: 11,
    maxLeaflets: 7,
    leafWidth: 0.185,
    leafSize: 22,
    branchLen: 34,
    branchAngle: 32,
    budSize: 1.12,
    maxYield: 134,
    fadeStart: 54,
    fadeMax: 1,
    seed: 37,
    colors: {
      leafYoung: c('#6fb24a'),
      leafBase: c('#1f5427'),
      leafFade: c('#8c1c2e'),
      leafEdge: c('#e0551c'),
      vein: c('#9fcf72'),
      stem: c('#4f7c32'),
      stemFade: c('#8b3040'),
      calyxA: c('#46742f'),
      calyxB: c('#8e2744'),
      calyxLight: c('#d98a8f'),
      pistilA: c('#f5dfc6'),
      pistilB: c('#d8361a'),
    },
  },
];

export interface StageInfo {
  name: string;
  detail: string;
  key: string;
  week: number;
  light: string;
}

export function stageAt(s: Strain, day: number): StageInfo {
  const d = Math.floor(day);
  const fs = s.flowerStart;
  const F = s.harvestDay - fs;
  const week = Math.floor((d - 1) / 7) + 1;
  const light = d < fs ? '18 / 6 Std.' : '12 / 12 Std.';
  let name = '';
  let detail = '';
  let key = '';
  if (d < 2) {
    name = 'Samen';
    detail = 'Der Samen liegt 1 cm tief im feuchten Substrat.';
    key = 'seed';
  } else if (d < 5) {
    name = 'Keimung';
    detail = 'Die Pfahlwurzel bricht aus der Schale und wächst nach unten.';
    key = 'germ';
  } else if (d < 8) {
    name = 'Keimling';
    detail = 'Die Keimblätter entfalten sich über der Erde.';
    key = 'sprout';
  } else if (d < 22) {
    name = 'Sämling';
    detail = 'Erste gezackte Blätter mit 1, 3 und 5 Fingern entstehen.';
    key = 'seedling';
  } else if (d < fs) {
    name = 'Vegetative Phase';
    detail = 'Schnelles Wachstum, Seitentriebe und große Fächerblätter.';
    key = 'veg';
  } else if (d < fs + 14) {
    name = 'Vorblüte & Streckung';
    detail = 'Lichtwechsel 12/12 – die Pflanze streckt sich, erste Härchen.';
    key = 'preflower';
  } else if (d < fs + F * 0.42) {
    name = 'Frühe Blüte';
    detail = 'Blütenstände bilden sich an Haupttrieb und Seitenästen.';
    key = 'flower1';
  } else if (d < fs + F * 0.78) {
    name = 'Mittlere Blüte';
    detail = 'Die Blüten schwellen an, Trichome bilden dichten Harzfrost.';
    key = 'flower2';
  } else if (d < s.harvestDay) {
    name = 'Reifephase';
    detail = 'Härchen färben sich orange, Trichome werden milchig bis bernsteinfarben.';
    key = 'ripe';
  } else {
    name = 'Erntereif!';
    detail = 'Perfekter Zeitpunkt – jetzt kannst du ernten.';
    key = 'harvest';
  }
  return { name, detail, key, week, light };
}

export interface Milestone {
  day: number;
  label: string;
}

export function milestones(s: Strain): Milestone[] {
  const F = s.harvestDay - s.flowerStart;
  return [
    { day: 1, label: 'Samen' },
    { day: 3, label: 'Keimung' },
    { day: 6, label: 'Keimblätter' },
    { day: 12, label: 'Sämling' },
    { day: 28, label: 'Vegetation' },
    { day: s.flowerStart, label: 'Blüte' },
    { day: Math.round(s.flowerStart + F * 0.55), label: 'Harzfrost' },
    { day: s.harvestDay, label: 'Ernte' },
  ];
}
