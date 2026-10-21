export enum AccountStatus {
  Pending = 'pending',
  Active = 'active',
  Deleted = 'deleted',
}

export enum ProfessionalTitle {
  ExpertContabil = 'expert_contabil',
  ContabilAutorizat = 'contabil_autorizat',
}

export enum AccountExportFile {
  Profile = 'cont.json',
  Connections = 'certificate.csv',
  Companies = 'firme.csv',
  Activity = 'activitate.csv',
  CompaniesFolder = 'firme',
  UnmatchedSpv = 'spv-fara-firma',
}
