/** Utilitaires transverses : identifiants, dates, texte, formats. */

let seq = 0;

export function uid(prefix = 'id'): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/* -------------------------------------------------------------------------
   Dates — on manipule des chaînes ISO `yyyy-MM-dd` pour éviter les décalages
   de fuseau horaire lors de la persistance.
   ------------------------------------------------------------------------- */

export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function addMonths(iso: string, months: number): string {
  const d = parseIso(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Conserve la fin de mois (31 janvier + 1 mois → 28/29 février)
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toIso(d);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Nombre de jours entre aujourd'hui et `iso` (négatif = passé). */
export function daysUntil(iso: string, from = todayIso()): number {
  const a = parseIso(from).getTime();
  const b = parseIso(iso).getTime();
  return Math.round((b - a) / 86400000);
}

export function period(iso: string): string {
  return iso.slice(0, 7);
}

export function periodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function formatDate(iso: string | undefined, style: 'long' | 'short' | 'numeric' = 'short'): string {
  if (!iso) return '—';
  const d = parseIso(iso);
  if (Number.isNaN(d.getTime())) return '—';
  if (style === 'numeric') return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (style === 'long') return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** « dans 12 jours », « il y a 3 jours », « aujourd'hui ». */
export function relativeDays(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days === -1) return 'hier';
  if (days > 0) return `dans ${days} jour${days > 1 ? 's' : ''}`;
  return `il y a ${-days} jour${-days > 1 ? 's' : ''}`;
}

function pad(n: number): string {
  return `${n}`.padStart(2, '0');
}

/* -------------------------------------------------------------------------
   Formats
   ------------------------------------------------------------------------- */

export function euro(value: number | undefined, decimals = 2): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} €`;
}

export function percent(value: number, decimals = 0): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals).replace('.', ',')} %`;
}

export function fileSize(kb: number): string {
  if (kb < 1024) return `${Math.round(kb)} Ko`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} Mo`;
}

/* -------------------------------------------------------------------------
   Texte — normalisation pour la recherche plein texte et le classement
   ------------------------------------------------------------------------- */

/**
 * Repli minuscule/sans-accent **strictement conservateur en longueur** :
 * chaque unité UTF-16 en entrée produit exactement une unité en sortie.
 * C'est cette propriété qui permet à `highlight` et `snippet` de réutiliser
 * les index calculés sur le texte replié pour découper le texte d'origine.
 */
/** Marques diacritiques combinantes (U+0300–U+036F), produites par NFD. */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export function fold(input: string): string {
  return (input ?? '')
    .split('')
    .map((c) => {
      const stripped = c.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '');
      if (stripped.length === 1) return stripped;
      const lower = c.toLowerCase();
      return lower.length === 1 ? lower : c;
    })
    .join('');
}

/** Minuscules sans accents ni ponctuation : base de toutes les comparaisons. */
export function normalize(input: string): string {
  return fold(input)
    .replace(/[^a-z0-9\s@.\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  return normalize(input)
    .split(/[\s.\-/]+/)
    .filter((t) => t.length > 1);
}

export function slugify(input: string): string {
  return normalize(input).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Extrait un fragment de texte autour de la première occurrence du terme. */
export function snippet(text: string, query: string, radius = 60): string {
  // `fold` conserve les longueurs : les index sont valides sur `text`.
  const folded = fold(text);
  const term = fold(query).trim().split(/\s+/).filter((t) => t.length > 1)[0] ?? '';
  const i = term ? folded.indexOf(term) : -1;
  if (i < 0) return text.slice(0, radius * 2).trim() + (text.length > radius * 2 ? '…' : '');
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + term.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/** Découpe un texte en segments marqués/non marqués pour le surlignage. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = normalize(query)
    .split(' ')
    .filter((t) => t.length > 1);
  if (!terms.length) return [{ text, hit: false }];

  // `fold` est conservateur en longueur : les index restent alignés sur `text`.
  const folded = fold(text);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let from = 0;
    let i = folded.indexOf(term, from);
    while (i >= 0) {
      ranges.push([i, i + term.length]);
      from = i + term.length;
      i = folded.indexOf(term, from);
    }
  }
  if (!ranges.length) return [{ text, hit: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r] as [number, number]);
  }

  const out: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor) out.push({ text: text.slice(cursor, s), hit: false });
    out.push({ text: text.slice(s, e), hit: true });
    cursor = e;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out;
}

/* -------------------------------------------------------------------------
   Divers
   ------------------------------------------------------------------------- */

export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function average(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
