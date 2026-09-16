// ============================================================
// SMV Holdings - Shared Domain Types
// Port of the frontend `types.ts` / `api.ts` contracts.
// ============================================================

export type LoanType =
  | "Instant_Personal"
  | "Standard_Personal"
  | "Business_Expansion"
  | "Micro_Enterprise"
  | "Emergency_Quick";

export type UserRole = "admin" | "manager" | "staff";

export interface User {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: UserRole;
  designation: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export type RepaymentFrequency = "Monthly" | "Bi-Weekly" | "Weekly";

export type InterestMethod = "Flat_Rate" | "Reducing_Balance";

export type LoanStatus =
  | "Pending_Approval"
  | "KYC_Pending"
  | "Approved_Pending_Disbursement"
  | "Active"
  | "Overdue"
  | "Settled"
  | "Early_Settled"
  | "Rejected";

export type InstallmentStatus =
  | "Paid"
  | "Pending"
  | "Overdue"
  | "Partially_Paid";

export type KYCDocumentType =
  | "National_ID_Passport"
  | "Proof_of_Address"
  | "Pay_Slip_Bank_Statement"
  | "Guarantor_ID"
  | "Business_Registration";

export type KYCDocumentStatus = "Verified" | "Pending_Review" | "Rejected";

export interface KYCDocument {
  id: string;
  type: KYCDocumentType;
  fileName: string;
  fileUrl?: string;
  /** Object key in the storage bucket (persisted in KYC JSONB data). */
  fileKey?: string;
  status: KYCDocumentStatus;
  uploadedAt: string;
}

export interface KYCData {
  nationalIdNumber: string;
  idType: "NIC" | "Passport" | "Driver_License";
  dateOfBirth: string;
  gender: string;
  occupation: string;
  employerName: string;
  monthlyIncome: number;
  addressLine: string;
  city: string;
  postalCode: string;
  guarantorName: string;
  guarantorPhone: string;
  guarantorRelation: string;
  // bankName: string;
  // accountNumber: string;
  documents: KYCDocument[];
  isVerified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface KYCPayload {
  kycData: {
    customer: {
      idNumber: string;
      idType: string;
      dateOfBirth: string;
      gender: string;
      occupation: string;
      employerName: string;
      monthlyIncome: string;
      addressLine: string;
      city: string;
      postalCode: string;
    };
    guarantor: {
      fullName: string;
      phone: string;
      relation: string;
    };
  };
}

export interface Installment {
  installmentNumber: number;
  dueDate: string; // YYYY-MM-DD
  principalAmount: number;
  interestAmount: number;
  totalInstallment: number;
  paidAmount: number;
  remainingAmount: number;
  status: InstallmentStatus;
  paidDate?: string;
  lateFee: number;
  // Internal ledger (not part of the frontend contract)
  paidPrincipal?: number;
  paidInterest?: number;
  lateFeePaid?: number;
}

export interface PaymentRecord {
  id: string;
  loanId: string;
  customerName: string;
  amount: number;
  paymentDate: string;
  paymentMethod:
    | "Cash"
    | "Bank_Transfer"
    | "Debit_Credit_Card"
    | "Direct_Debit"
    | "Cheque";
  referenceNumber: string;
  receivedBy: string;
  notes?: string;
  allocatedPrincipal: number;
  allocatedInterest: number;
  allocatedLateFee: number;
  principalPortion: number; // ← new
  interestPortion: number;
  installmentNumbersCovered: number[];
  smsStatus?: "SENT" | "FAILED" | "PENDING" | "SKIPPED";
  smsRecipient?: string;
  smsMessage?: string;
}

export interface EarlySettlementQuote {
  calculationDate: string;
  originalPrincipal: number;
  principalPaidToDate: number;
  outstandingPrincipalBalance: number;
  accruedInterestToDate: number;
  unearnedFutureInterestWaived: number;
  earlySettlementPenaltyPercent: number;
  earlySettlementPenaltyFee: number;
  totalSettlementAmount: number;
  totalSavingsForCustomer: number;
}

export interface Loan {
  id: string;
  accountNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  loanType: LoanType;
  requestedAmount: number;
  disbursedAmount: number;
  interestRatePerAnnum: number;
  termMonths: number;
  repaymentFrequency: RepaymentFrequency;
  interestMethod: InterestMethod;
  processingFee: number;
  earlySettlementPenaltyPercent: number;
  status: LoanStatus;
  requestedDate: string;
  approvedDate?: string;
  rejectedAt?: string;
  rejectReason?: string;
  disbursedDate?: string;
  kyc: KYCData;
  installments: Installment[];
  payments: PaymentRecord[];
  earlySettlementQuote?: EarlySettlementQuote;
  settledDate?: string;
  totalPaidAmount: number;
  outstandingBalance: number;
  nextDueDate?: string;
  nextDueAmount?: number;
  purpose: string;
  creditScore: number;
}

export interface FinancialSummary {
  totalLoansDisbursed: number;
  totalDisbursedAmount: number;
  totalOutstandingBalance: number;
  totalCollectedAmount: number;
  activeLoansCount: number;
  overdueLoansCount: number;
  pendingApprovalCount: number;
  pendingKycCount: number;
  settledLoansCount: number;
  totalInterestEarned: number;
}

export interface SMSLogEntry {
  id: string;
  timestamp: string;
  recipient: string;
  originalPhone: string;
  message: string;
  loanId?: string;
  customerName?: string;
  amount?: number;
  status: "DELIVERED" | "SENT" | "FAILED";
  gatewayResponse?: any;
  error?: string;
}

export type ConsultancyStatus =
  | "Active Placed"
  | "Maturing Soon"
  | "Maturity Reached"
  | "Returned & Closed";

export interface ConsultancyReturnRecord {
  id: string;
  returnDate: string;
  returnedAmount: number;
  paymentMethod: "Bank Transfer" | "Cheque" | "Cash" | "Direct Deposit";
  referenceNumber: string;
  processedBy: string;
  notes?: string;
}

export interface ConsultancyAgreement {
  id: string;
  agreementNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  nationalIdNumber: string;
  bankName: string;
  accountNumber: string;
  lastStatementBalance: number;
  lastStatementDate?: string;
  placedAmount: number;
  startDate: string;
  maturityDate: string;
  termMonths: number;
  monthlyConsultancyFee?: number;
  status: ConsultancyStatus;
  notes?: string;
  createdDate: string;
  returnRecord?: ConsultancyReturnRecord;
  passbookUrl?: string;
  /** Object key in the storage bucket (persisted in the passbook_key column). */
  passbookKey?: string;
}

// ============================================================
// Request / Response contracts (api.ts)
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  timestamp: string;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface CreateLoanPayload {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  nationalIdNumber: string;
  loanType: LoanType;
  requestedAmount: number;
  interestRatePerAnnum: number;
  termMonths: number;
  repaymentFrequency: RepaymentFrequency;
  interestMethod: InterestMethod;
  purpose: string;
  monthlyIncome: number;
  occupation: string;
  employerName: string;
  addressLine: string;
  city: string;
  postalCode: string;
  guarantorName: string;
  guarantorPhone: string;
  guarantorRelation: string;
  bankName: string;
  accountNumber: string;
}

export interface RecordPaymentPayload {
  loanId: string;
  amount: number;
  paymentMethod: PaymentRecord["paymentMethod"];
  referenceNumber: string;
  receivedBy: string;
  notes?: string;
  paymentDate?: string;
}

export interface ExecuteSettlementPayload {
  loanId: string;
  quote: EarlySettlementQuote;
  paymentMethod: PaymentRecord["paymentMethod"];
  referenceNumber: string;
  receivedBy: string;
  notes?: string;
  settlementDate?: string;
}

export interface UpdateKYCPayload {
  loanId: string;
  kycData: Partial<KYCData>;
}

export interface CreateConsultancyPayload {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  nationalIdNumber: string;
  bankName: string;
  accountNumber: string;
  lastStatementBalance: number;
  lastStatementDate?: string;
  placedAmount: number;
  startDate: string;
  monthlyConsultancyFee?: number;
  notes?: string;
}

export interface ReturnConsultancyPayload {
  agreementId: string;
  returnRecord: ConsultancyAgreement["returnRecord"];
}
