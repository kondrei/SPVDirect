export interface AnafTvaRecord {
  date_generale: {
    cui: number;
    data: string;
    denumire: string;
    adresa: string;
    nrRegCom: string;
    telefon: string;
    fax: string;
    codPostal: string;
    act: string;
    stare_inregistrare: string;
    data_inregistrare: string;
    cod_CAEN: string;
    iban: string;
    statusRO_e_Factura: boolean;
    data_inreg_Reg_RO_e_Factura?: string;
    organFiscalCompetent: string;
    forma_de_proprietate: string;
    forma_organizare: string;
    forma_juridica: string;
  };
  inregistrare_scop_Tva: {
    scpTVA: boolean;
    perioade_TVA?: {
      data_inceput_ScpTVA: string;
      data_sfarsit_ScpTVA: string;
      data_anul_imp_ScpTVA: string;
      mesaj_ScpTVA: string;
    }[];
  };
  inregistrare_RTVAI: {
    dataInceputTvaInc: string;
    dataSfarsitTvaInc: string;
    dataActualizareTvaInc: string;
    dataPublicareTvaInc: string;
    tipActTvaInc: string;
    statusTvaIncasare: boolean;
  };
  stare_inactiv: {
    dataInactivare: string;
    dataReactivare: string;
    dataPublicare: string;
    dataRadiere: string;
    statusInactivi: boolean;
  };
  inregistrare_SplitTVA: {
    dataInceputSplitTVA: string;
    dataAnulareSplitTVA: string;
    statusSplitTVA: boolean;
  };
  adresa_sediu_social: Record<string, string>;
  adresa_domiciliu_fiscal: Record<string, string>;
}

export interface AnafTvaResponse {
  found?: AnafTvaRecord[];
  notFound?: (number | string)[];
}

export function companyFieldsFromAnaf(record: AnafTvaRecord) {
  const g = record.date_generale;
  return {
    name: g.denumire.trim(),
    regCom: blankToNull(g.nrRegCom),
    address: blankToNull(g.adresa),
    caenCode: blankToNull(g.cod_CAEN),
    registrationStatus: blankToNull(g.stare_inregistrare),
    vatPayer: record.inregistrare_scop_Tva?.scpTVA ?? null,
    vatOnCollection: record.inregistrare_RTVAI?.statusTvaIncasare ?? null,
    splitVat: record.inregistrare_SplitTVA?.statusSplitTVA ?? null,
    eFactura: g.statusRO_e_Factura ?? null,
    inactive: record.stare_inactiv?.statusInactivi ?? null,
    anafData: record,
  };
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
