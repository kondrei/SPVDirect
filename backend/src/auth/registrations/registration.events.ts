export class AccountantRegisteredEvent {
  constructor(
    readonly accountantId: number,
    readonly email: string,
    readonly name: string | null,
    readonly approvalToken: string,
  ) {}
}

export class AccountantApprovedEvent {
  constructor(
    readonly accountantId: number,
    readonly email: string,
  ) {}
}
