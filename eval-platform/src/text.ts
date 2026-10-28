// Lightweight text utilities for the rule-based scorers: no embeddings
// service, no external NLP dependency, so the deterministic half of the
// platform runs offline and gives identical results on every run.

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  'twenty-five': 25, thirty: 30,
};

const STOPWORDS = new Set(
  (
    'a an the and or but if then so of to in on at by for with from into onto as is are was were be been being ' +
    'it its this that these those there here i me my you your yours we our us he she they them their his her ' +
    'do does did done have has had can could will would shall should may might must not no yes any all each ' +
    'per up out over under about above below than too very just also only own same such what which who whom ' +
    'when where why how more most some other both either neither nor get gets got make makes let lets please ' +
    'am im ive youre dont doesnt isnt arent wont cant aren t s re ll ve d m'
  ).split(/\s+/)
);

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const UNIT_ALIASES: Record<string, string> = {
  day: 'day', days: 'day',
  week: 'week', weeks: 'week',
  month: 'month', months: 'month',
  year: 'year', years: 'year',
  hour: 'hour', hours: 'hour',
  '%': 'percent', percent: 'percent',
};

export function normalize(text: string): string {
  let t = text.toLowerCase().replace(/[‐-―]/g, '-').replace(/[‘’]/g, "'");
  // "26-week" -> "26 week"
  t = t.replace(/(\d)-([a-z])/g, '$1 $2');
  for (const [word, n] of Object.entries(NUMBER_WORDS).sort((a, b) => b[0].length - a[0].length)) {
    t = t.replace(new RegExp(`\\b${word}\\b`, 'g'), String(n));
  }
  return t;
}

/** Very small suffix-stripping stemmer: enough to match "approves"/"approved"/"approval". */
export function stem(word: string): string {
  let w = word;
  for (const suffix of ['ations', 'ation', 'ings', 'ing', 'edly', 'ed', 'ies', 'es', 'ly', 's', 'al']) {
    if (w.length - suffix.length >= 4 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      if (suffix === 'ies') w += 'y';
      break;
    }
  }
  return w;
}

/** Stemmed content words (stopwords and punctuation removed; numbers kept). */
export function contentTokens(text: string): string[] {
  return (normalize(text).replace(/'/g, '').match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? [])
    .filter((t) => !STOPWORDS.has(t))
    .map(stem);
}

export function cosineSimilarity(a: string[], b: string[]): number {
  const va = new Map<string, number>();
  const vb = new Map<string, number>();
  for (const t of a) va.set(t, (va.get(t) ?? 0) + 1);
  for (const t of b) vb.set(t, (vb.get(t) ?? 0) + 1);
  let dot = 0;
  for (const [t, n] of va) dot += n * (vb.get(t) ?? 0);
  const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((s, n) => s + n * n, 0));
  const denom = norm(va) * norm(vb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Extracts checkable "policy facts" — the details a hallucinating assistant
 * most often gets wrong: quantities with units, money amounts, and dates.
 * Returned as canonical strings so they can be compared as sets, e.g.
 * "20 day", "$500", "31 march".
 */
export function extractFacts(text: string): string[] {
  const t = normalize(text);
  const facts = new Set<string>();

  for (const m of t.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)) {
    facts.add(`$${m[1].replace(/,/g, '')}`);
  }

  // Number + unit, allowing up to three words in between ("5 unused annual leave days").
  const unitPattern = /(?<![\d$.,])(\d+(?:\.\d+)?)\s*(?:[a-z-]+\s+){0,3}?(days?|weeks?|months?|years?|hours?|%|percent)\b/g;
  for (const m of t.matchAll(unitPattern)) {
    facts.add(`${m[1]} ${UNIT_ALIASES[m[2]]}`);
  }

  const monthAlt = MONTHS.join('|');
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthAlt})\\b`, 'g'))) {
    facts.add(`${Number(m[1])} ${m[2]}`);
  }
  for (const m of t.matchAll(new RegExp(`\\b(${monthAlt})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g'))) {
    facts.add(`${Number(m[2])} ${m[1]}`);
  }

  return [...facts];
}

export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
