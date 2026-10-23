export interface Screenshot {
  id: string;
  label: string;
  path: string;
  caption: string;
}

export const SCREENSHOT_WIDTH = 2528;
export const SCREENSHOT_HEIGHT = 1628;

export const SCREENSHOTS: Screenshot[] = [
  {
    id: 'panou',
    label: 'Panou',
    path: '/accountants/1',
    caption: 'Panoul cabinetului: facturarea lunii, ultimele 6 luni și activitatea din cont.',
  },
  {
    id: 'firme',
    label: 'Firme',
    path: '/accountants/1/companies',
    caption: 'Firmele clienților, cu datele de la ANAF și certificatul folosit pentru fiecare.',
  },
  {
    id: 'facturi',
    label: 'Facturi',
    path: '/accountants/1/invoices',
    caption: 'Facturile emise, cu starea din RO e-Factura, PDF, XML și trimitere pe email.',
  },
  {
    id: 'arhiva',
    label: 'Arhivă e-Factura',
    path: '/accountants/1/efactura/archive',
    caption: 'Arhiva e-Factura păstrează facturile și după ce ANAF le șterge, după 60 de zile.',
  },
  {
    id: 'spv',
    label: 'Mesaje SPV',
    path: '/accountants/1/spv',
    caption: 'Mesajele din SPV și documentele lor, potrivite cu firmele clienților.',
  },
  {
    id: 'certificate',
    label: 'Certificate ANAF',
    path: '/accountants/1/connections',
    caption: 'Certificatele ANAF conectate o singură dată, cu data până la care sunt valabile.',
  },
];

export function screenshotSrc(base: string, id: string, theme: 'light' | 'dark') {
  return `${base}screenshots/${id}-${theme}.webp`;
}

export function screenshotAlt(shot: Screenshot) {
  return `Captură din aplicația SPVDirect, pagina ${shot.label}, pe calculator și pe telefon, cu date de exemplu.`;
}
