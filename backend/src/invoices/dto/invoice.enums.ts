export enum VatCategory {
  Standard = 'S',
  ZeroRated = 'Z',
  Exempt = 'E',
  ReverseCharge = 'AE',
  NotSubject = 'O',
}

export enum Currency {
  RON = 'RON',
  EUR = 'EUR',
  USD = 'USD',
  GBP = 'GBP',
  CHF = 'CHF',
}

export enum PaymentMethod {
  Transfer = 'transfer',
  Numerar = 'numerar',
  Card = 'card',
}

export enum BuyerSource {
  Invoice = 'invoice',
  Company = 'company',
  Anaf = 'anaf',
}
