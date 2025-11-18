export type PartyInfo = {
    name: string
    nationality: string
    birthDate: string
  }
  
  export type RemittanceForm = {
    originator: PartyInfo
    beneficiary: PartyInfo
    amountKRW: number
    beneficiaryAccount: string
    corridorBankCode: string // "J_BANK"
  }
  