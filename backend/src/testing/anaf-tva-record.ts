import type { AnafTvaRecord } from '../companies/anaf-company-info.js';

export function anafTvaRecord(
  cui = 12345678,
  overrides: Partial<AnafTvaRecord['date_generale']> = {},
): AnafTvaRecord {
  return {
    date_generale: {
      data: '2026-09-25',
      cui,
      denumire: 'AGRO VEST SRL',
      adresa: 'JUD. TIMIŞ, MUN. TIMIŞOARA, STR. EXEMPLU, NR.1',
      telefon: '0256000000',
      fax: '',
      codPostal: '300001',
      act: '',
      stare_inregistrare: 'INREGISTRAT din data 01.02.2010',
      data_inreg_Reg_RO_e_Factura: '2022-07-01',
      organFiscalCompetent:
        'Administraţia Judeţeană a Finanţelor Publice Timiş',
      forma_de_proprietate: 'PROPR.PRIVATA-CAPITAL PRIVAT AUTOHTON',
      forma_organizare: 'PERSOANA JURIDICA',
      forma_juridica: 'SOCIETATE COMERCIALĂ CU RĂSPUNDERE LIMITATĂ',
      statusRO_e_Factura: true,
      data_inregistrare: '2010-02-01',
      nrRegCom: 'J35/100/2010',
      cod_CAEN: '0111',
      iban: '',
      ...overrides,
    },
    inregistrare_scop_Tva: {
      scpTVA: true,
      perioade_TVA: [
        {
          data_inceput_ScpTVA: '2010-03-01',
          data_sfarsit_ScpTVA: '',
          data_anul_imp_ScpTVA: '',
          mesaj_ScpTVA: '',
        },
      ],
    },
    inregistrare_RTVAI: {
      dataInceputTvaInc: '',
      dataActualizareTvaInc: '',
      dataPublicareTvaInc: '',
      dataSfarsitTvaInc: '',
      tipActTvaInc: '',
      statusTvaIncasare: false,
    },
    stare_inactiv: {
      dataInactivare: '',
      dataReactivare: '',
      dataPublicare: '',
      dataRadiere: '',
      statusInactivi: false,
    },
    inregistrare_SplitTVA: {
      dataInceputSplitTVA: '',
      dataAnulareSplitTVA: '',
      statusSplitTVA: false,
    },
    adresa_sediu_social: {
      sdenumire_Strada: 'Str. Exemplu',
      snumar_Strada: '1',
      sdenumire_Localitate: 'Mun. Timişoara',
      scod_Localitate: '1',
      sdenumire_Judet: 'TIMIŞ',
      scod_Judet: '35',
      scod_JudetAuto: 'TM',
      stara: '',
      sdetalii_Adresa: '',
      scod_Postal: '300001',
    },
    adresa_domiciliu_fiscal: {
      ddenumire_Strada: 'Str. Exemplu',
      dnumar_Strada: '1',
      ddenumire_Localitate: 'Mun. Timişoara',
      dcod_Localitate: '1',
      ddenumire_Judet: 'TIMIŞ',
      dcod_Judet: '35',
      dcod_JudetAuto: 'TM',
      dtara: '',
      ddetalii_Adresa: '',
      dcod_Postal: '300001',
    },
  };
}
