export type SpvRequestField = 'an' | 'luna' | 'motiv' | 'numarInregistrare' | 'cuiPunctDeLucru';

export interface SpvRequestType {
  tip: string;
  label: string;
  required: SpvRequestField[];
  optional?: SpvRequestField[];
  months?: number[];
}

export const SPV_REQUEST_TYPES: SpvRequestType[] = [
  { tip: 'DATE IDENTIFICARE', label: 'Date de identificare', required: [] },
  { tip: 'VECTOR FISCAL', label: 'Vector fiscal', required: [] },
  { tip: 'Fisa Rol', label: 'Fișa rol', required: [], optional: ['cuiPunctDeLucru'] },
  { tip: 'Situatie Sintetica', label: 'Situație sintetică', required: [] },
  { tip: 'Obligatii de plata', label: 'Obligații de plată neachitate', required: [] },
  { tip: 'Nota obligatiilor de plata', label: 'Nota obligațiilor de plată', required: [] },
  { tip: 'Istoric Spatiu Virtual', label: 'Istoric Spațiu Privat Virtual', required: [] },
  { tip: 'Registru intrari-iesiri', label: 'Registru intrări-ieșiri', required: [] },
  { tip: 'Istoric declaratii', label: 'Istoric declarații', required: ['an'] },
  { tip: 'Istoric bilant', label: 'Istoric bilanțuri', required: [] },
  { tip: 'Bilant anual', label: 'Bilanț anual', required: ['an'] },
  { tip: 'Bilant semestrial', label: 'Bilanț semestrial', required: ['an'] },
  { tip: 'Duplicat Recipisa', label: 'Duplicat recipisă', required: ['numarInregistrare'] },
  { tip: 'Adeverinte Venit', label: 'Adeverință de venit', required: ['an', 'motiv'] },
  { tip: 'InterogariBanci', label: 'Interogări bănci', required: [] },
  { tip: 'NeconcordanteD112CNP', label: 'Neconcordanțe D112 – REVISAL', required: [] },
  { tip: 'D100', label: 'D100 – obligații de plată la bugetul de stat', required: ['an', 'luna'] },
  { tip: 'D101', label: 'D101 – impozit pe profit', required: ['an'] },
  { tip: 'D106', label: 'D106 – dividende cuvenite acționarilor', required: ['an'] },
  { tip: 'D112', label: 'D112 – contribuții sociale și impozit pe venit', required: ['an', 'luna'] },
  { tip: 'D112Contrib', label: 'D112 – date despre contribuțiile sociale', required: [] },
  { tip: 'D120', label: 'D120 – decont de accize', required: ['an'] },
  { tip: 'D130', label: 'D130 – impozit pe țițeiul din producția internă', required: ['an'] },
  { tip: 'D180', label: 'D180 – notă de certificare', required: ['an', 'luna'] },
  { tip: 'D205', label: 'D205 – impozit reținut la sursă', required: ['an'] },
  { tip: 'D208', label: 'D208 – impozit pe transferul proprietăților imobiliare', required: ['an', 'luna'], months: [6, 12] },
  { tip: 'D212', label: 'D212 – declarația unică', required: ['an'] },
  { tip: 'D300', label: 'D300 – decont de TVA', required: ['an', 'luna'] },
  { tip: 'D301', label: 'D301 – decont special de TVA', required: ['an', 'luna'] },
  { tip: 'D311', label: 'D311 – TVA colectată, cod de TVA anulat', required: ['an', 'luna'] },
  { tip: 'D390', label: 'D390 – declarație recapitulativă', required: ['an', 'luna'] },
  { tip: 'D392', label: 'D392 – livrări de bunuri și prestări de servicii', required: ['an'] },
  { tip: 'D393', label: 'D393 – venituri din bilete de transport internațional', required: ['an'] },
  { tip: 'D394', label: 'D394 – livrări și achiziții pe teritoriul național', required: ['an', 'luna'] },
];

export const SPV_INCOME_REASONS = [
  'Sanatate',
  'Cresa',
  'Gradinita',
  'Scoala',
  'Liceu',
  'Facultate',
  'Alocatia pentru copiii nou nascuti',
  'Trusou nou nascuti',
  'Alocatia de stat pentru copii',
  'Indemnizatie ajutor stimulent pentru cresterea copilului',
  'Sprijin financiar acordat la constituirea familiei',
  'Alocatia pentru sustinerea familiei',
  'Alocatia familiala complementara',
  'Somaj si stimularea fortei de munca',
  'Ajutor social',
  'Pensie',
  'Stimulent de insertie',
  'Ajutoare pentru incalzirea locuintei',
  'Ajutoare financiare pentru persoane aflate in extrema dificultate',
  'Cheltuieli cu inmormantarea persoanelor din familiile beneficiare de ajutor social',
  'Ajutoare de urgenta in caz de calamitati naturale',
  'Indemnizatia',
  'Bugetul personal complementar pentru persoana cu handicap',
  'Alocatia de plasament',
  'Indemnizatia pentru insotitor',
  'Alocatia lunara de hrana pentru copiii cu handicap de tip HIV SIDA',
  'Ajutor anual pentru veteranii de razboi',
  'Institutie financiar bancara asigurare etc.',
  'Executor judecatoresc',
  'Autoritati straine',
  'Altele',
];

export function spvRequestType(tip: string): SpvRequestType | undefined {
  return SPV_REQUEST_TYPES.find((t) => t.tip === tip);
}

export function usesField(type: SpvRequestType | undefined, field: SpvRequestField): boolean {
  return !!type && (type.required.includes(field) || !!type.optional?.includes(field));
}

const DIGITS = /^\d{2,13}$/;
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export interface SpvRequestForm {
  tip: string;
  cui: string;
  an: string;
  luna: string;
  motiv: string;
  numarInregistrare: string;
  cuiPunctDeLucru: string;
}

function monthError(type: SpvRequestType, luna: string): string | null {
  if (!usesField(type, 'luna')) return null;
  if ((type.months ?? ALL_MONTHS).includes(Number(luna))) return null;
  return type.months
    ? `Luna trebuie să fie ${type.months.join(' sau ')}.`
    : 'Luna trebuie să fie între 1 și 12.';
}

export function spvRequestError(type: SpvRequestType | undefined, form: SpvRequestForm): string | null {
  if (!type) return 'Alegeți tipul cererii.';
  if (!DIGITS.test(form.cui)) return 'CUI/CNP invalid: folosiți doar cifre (2–13).';
  if (usesField(type, 'an') && !/^\d{4}$/.test(form.an)) return 'Anul trebuie să aibă 4 cifre.';
  const month = monthError(type, form.luna);
  if (month) return month;
  if (usesField(type, 'motiv') && !form.motiv) return 'Alegeți motivul adeverinței.';
  if (usesField(type, 'numarInregistrare') && !form.numarInregistrare) {
    return 'Introduceți numărul de înregistrare al recipisei.';
  }
  if (usesField(type, 'cuiPunctDeLucru') && form.cuiPunctDeLucru && !DIGITS.test(form.cuiPunctDeLucru)) {
    return 'CUI-ul punctului de lucru este invalid.';
  }
  return null;
}

export function spvRequestPayload(type: SpvRequestType, form: SpvRequestForm) {
  const uses = (field: SpvRequestField) => usesField(type, field);
  return {
    tip: type.tip,
    cui: form.cui,
    ...(uses('an') ? { an: Number(form.an) } : {}),
    ...(uses('luna') ? { luna: Number(form.luna) } : {}),
    ...(uses('motiv') ? { motiv: form.motiv } : {}),
    ...(uses('numarInregistrare') ? { numarInregistrare: form.numarInregistrare } : {}),
    ...(uses('cuiPunctDeLucru') && form.cuiPunctDeLucru ? { cuiPunctDeLucru: form.cuiPunctDeLucru } : {}),
  };
}
