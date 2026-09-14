import {
  EarlySettlementQuote,
  Installment,
  InterestMethod,
  InstallmentStatus,
  Loan,
  RepaymentFrequency,
} from '../../shared/types';
import { addDaysISO, addMonthsISO, diffDays, isBefore, todayISO } from './dates';

// ---------------------------------------------------------------------------
// Rounding & frequency helpers
// ---------------------------------------------------------------------------

export function roundTo(value: number, dp = 2): number {
  return Math.round((value + Number.EPSILON) * Math.pow(10, dp)) / Math.pow(10, dp);
}

/** Number of payment periods per year for a repayment frequency. */
export function getPeriodsPerYear(freq: RepaymentFrequency): number {
  return freq === 'Monthly' ? 12 : freq === 'Bi-Weekly' ? 26 : 52;
}

/** Total number of installments for a loan term expressed in months. */
export function numberOfInstallments(termMonths: number, freq: RepaymentFrequency): number {
  switch (freq) {
    case 'Monthly':
      return termMonths;
    case 'Bi-Weekly':
      return Math.round((termMonths * 26) / 12);
    case 'Weekly':
      return Math.round((termMonths * 52) / 12);
  }
}

/** Advance a base date by one repayment step for the given frequency. */
function stepDueDate(base: string, freq: RepaymentFrequency): string {
  if (freq === 'Monthly') return addMonthsISO(base, 1);
  if (freq === 'Weekly') return addDaysISO(base, 7);
  return addDaysISO(base, 14);
}

// ---------------------------------------------------------------------------
// Reducing-Balance EMI:  EMI = P * [ r(1+r)^n ] / [ (1+r)^n - 1 ]
// ---------------------------------------------------------------------------

export function calculateEMI(
  principal: number,
  annualRatePct: number,
  periodsPerYear: number,
  n: number,
): number {
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / periodsPerYear;
  if (r === 0) return principal / n;
  const growth = Math.pow(1 + r, n);
  return roundTo((principal * r * growth) / (growth - 1));
}

// ---------------------------------------------------------------------------
// Installment schedule generation
// ---------------------------------------------------------------------------

export interface GenerateScheduleParams {
  principal: number;
  annualRatePct: number;
  termMonths: number;
  frequency: RepaymentFrequency;
  method: InterestMethod;
  startDate?: string;
}

export interface GenerateScheduleResult {
  installments: Installment[];
  totalPayable: number;
  totalInterest: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export function generateSchedule(params: GenerateScheduleParams): GenerateScheduleResult {
  const start = params.startDate ?? today();
  const n = numberOfInstallments(params.termMonths, params.frequency);
  const periodsPerYear = getPeriodsPerYear(params.frequency);
  const principal = roundTo(params.principal);

  const schedule =
    params.method === 'Reducing Balance'
      ? reducingBalanceSchedule(principal, params.annualRatePct, periodsPerYear, n, start, params.frequency)
      : flatRateSchedule(principal, params.annualRatePct, params.termMonths, n, start, params.frequency);

  const totalInterest = roundTo(schedule.reduce((s, i) => s + i.interestAmount, 0));
  const totalPayable = roundTo(schedule.reduce((s, i) => s + i.totalInstallment, 0));
  return { installments: schedule, totalPayable, totalInterest };
}
// ---------------------------------------------------------------------------
// Schedule builders
// ---------------------------------------------------------------------------

function statusForPending(dueDate: string, today: string, paidCredit: number): InstallmentStatus {
  if (paidCredit > 0) return 'Partially Paid';
  return isBefore(dueDate, today) ? 'Overdue' : 'Pending';
}

function reducingBalanceSchedule(
  principal: number,
  annualRatePct: number,
  periodsPerYear: number,
  n: number,
  start: string,
  freq: RepaymentFrequency,
): Installment[] {
  const r = annualRatePct / 100 / periodsPerYear;
  const emi = calculateEMI(principal, annualRatePct, periodsPerYear, n);
  let outstanding = principal;
  let dueDate = start;
  const reference = todayISO();
  const result: Installment[] = [];

  for (let idx = 1; idx <= n; idx++) {
    dueDate = idx === 1 ? start : stepDueDate(dueDate, freq);
    const interestAmount = roundTo(outstanding * r);
    let principalPart = idx === n ? roundTo(outstanding) : roundTo(emi - interestAmount);
    if (principalPart < 0) principalPart = 0;
    const total = roundTo(principalPart + interestAmount);
    outstanding = roundTo(outstanding - principalPart);

    result.push({
      installmentNumber: idx,
      dueDate,
      principalAmount: principalPart,
      interestAmount,
      totalInstallment: total,
      paidAmount: 0,
      remainingAmount: total,
      status: statusForPending(dueDate, reference, 0),
      lateFee: 0,
      paidPrincipal: 0,
      paidInterest: 0,
      lateFeePaid: 0,
    });
  }
  return result;
}

function flatRateSchedule(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  n: number,
  start: string,
  freq: RepaymentFrequency,
): Installment[] {
  // Flat-rate interest: annual rate applied to the full principal for the term.
  const totalInterest = roundTo((principal * annualRatePct) / 100 * (termMonths / 12));
  const principalPer = roundTo(principal / n);
  const interestPer = roundTo(totalInterest / n);
  const totalPer = roundTo(principalPer + interestPer);
  const reference = todayISO();
  const result: Installment[] = [];
  let dueDate = start;

  for (let idx = 1; idx <= n; idx++) {
    dueDate = idx === 1 ? start : stepDueDate(dueDate, freq);
    const isLast = idx === n;
    const p = isLast ? roundTo(principal - principalPer * (n - 1)) : principalPer;
    const i = isLast ? roundTo(totalInterest - interestPer * (n - 1)) : interestPer;
    const sum = roundTo(p + i);
    result.push({
      installmentNumber: idx,
      dueDate,
      principalAmount: p,
      interestAmount: i,
      totalInstallment: sum,
      paidAmount: 0,
      remainingAmount: sum,
      status: statusForPending(dueDate, reference, 0),
      lateFee: 0,
      paidPrincipal: 0,
      paidInterest: 0,
      lateFeePaid: 0,
    });
  }
  return result;
}
// ---------------------------------------------------------------------------
// Loan state recomputation & status rules
// ---------------------------------------------------------------------------

const ACTIVE_LIKE: string[] = ['Active', 'Overdue', 'Settled', 'Early Settled'];

export function computeLoan(loan: Loan, referenceDate?: string): Loan {
  const today = referenceDate ?? todayISO();

  // 1. Re-derive per-installment status + amounts from the ledger.
  let anyDisbursedOverdue = false;
  for (const inst of loan.installments) {
    if (inst.status === 'Paid') continue;
    const creditPaid = roundTo((inst.paidPrincipal ?? 0) + (inst.paidInterest ?? 0));
    const lateOwed = roundTo((inst.lateFee ?? 0) - (inst.lateFeePaid ?? 0));
    const left = roundTo(inst.totalInstallment - creditPaid);

    inst.paidAmount = creditPaid;
    inst.remainingAmount = left;
    if (left <= 0 && lateOwed <= 0) {
      inst.status = 'Paid';
      inst.paidDate = inst.paidDate ?? today;
    } else if (creditPaid > 0) {
      inst.status = 'Partially Paid';
    } else if (isBefore(inst.dueDate, today)) {
      inst.status = 'Overdue';
      anyDisbursedOverdue = anyDisbursedOverdue || inst.paidAmount === 0;
    } else {
      inst.status = 'Pending';
    }
  }

  // 2. Portfolio-level totals.
  const totalPaidAmount = roundTo(loan.payments.reduce((s, p) => s + p.amount, 0));
  const outstandingBalance = roundTo(
    loan.installments.reduce(
      (s, i) => s + i.remainingAmount + roundTo((i.lateFee ?? 0) - (i.lateFeePaid ?? 0)),
      0,
    ),
  );
  loan.totalPaidAmount = totalPaidAmount;
  loan.outstandingBalance = outstandingBalance;

  // 3. Status recalc (spec): out<=0 -> Settled; any late -> Overdue; else Active.
  const isDisbursed =
    loan.disbursedAmount > 0 && ACTIVE_LIKE.includes(loan.status as Loan['status']);

  if (loan.status === 'Rejected') {
    // terminal - do not overwrite.
  } else if (!isDisbursed) {
    // pre-disbursement statuses are driven by explicit transitions.
    loan.status = loan.status as Loan['status'];
  } else if (outstandingBalance <= 0) {
    loan.status = loan.earlySettlementQuote ? 'Early Settled' : 'Settled';
    loan.settledDate = loan.settledDate ?? today;
  } else if (anyDisbursedOverdue) {
    loan.status = 'Overdue';
  } else {
    loan.status = 'Active';
  }

  // 4. UI next-due reference.
  const next = [...loan.installments]
    .filter((i) => i.remainingAmount > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  loan.nextDueDate = next?.dueDate;
  loan.nextDueAmount = next ? next.totalInstallment : undefined;

  return loan;
}

// ---------------------------------------------------------------------------
// Payment waterfall allocation:  Late Fee -> Interest -> Principal
// ---------------------------------------------------------------------------

export interface AllocationResult {
  lateFeeAllocated: number;
  interestAllocated: number;
  principalAllocated: number;
  applied: number;
  coveredInstallmentNumbers: number[];
}

export function allocatePayment(loan: any, amount: number, referenceDate?: string): AllocationResult {
  const today = referenceDate ?? todayISO();
  const result: AllocationResult = {
    lateFeeAllocated: 0,
    interestAllocated: 0,
    principalAllocated: 0,
    applied: 0,
    coveredInstallmentNumbers: [],
  };
  let remaining = roundTo(amount);

  const sorted = [...loan.installments].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber,
  );

  for (const inst of sorted) {
    if (remaining <= 0) break;
    if (
      inst.principalAmount - (inst.paidPrincipal ?? 0) +
        inst.interestAmount - (inst.paidInterest ?? 0) +
        (inst.lateFee ?? 0) - (inst.lateFeePaid ?? 0) <=
      0
    ) {
      inst.status = 'Paid';
      continue;
    }
    const appliedBefore = result.applied;

    // 1. Late fees first.
    const lateOwed = roundTo((inst.lateFee ?? 0) - (inst.lateFeePaid ?? 0));
    if (lateOwed > 0) {
      const take = Math.min(remaining, lateOwed);
      inst.lateFeePaid = roundTo((inst.lateFeePaid ?? 0) + take);
      result.lateFeeAllocated += take;
      remaining = roundTo(remaining - take);
    }
    // 2. Accrued interest.
    const interestOwed = roundTo(inst.interestAmount - (inst.paidInterest ?? 0));
    if (remaining > 0 && interestOwed > 0) {
      const take = Math.min(remaining, interestOwed);
      inst.paidInterest = roundTo((inst.paidInterest ?? 0) + take);
      result.interestAllocated += take;
      remaining = roundTo(remaining - take);
    }
    // 3. Principal.
    const principalOwed = roundTo(inst.principalAmount - (inst.paidPrincipal ?? 0));
    if (remaining > 0 && principalOwed > 0) {
      const take = Math.min(remaining, principalOwed);
      inst.paidPrincipal = roundTo((inst.paidPrincipal ?? 0) + take);
      result.principalAllocated += take;
      remaining = roundTo(remaining - take);
    }

    const creditPaid = roundTo((inst.paidPrincipal ?? 0) + (inst.paidInterest ?? 0));
    inst.paidAmount = creditPaid;
    inst.remainingAmount = roundTo(inst.totalInstallment - creditPaid);
    if (inst.remainingAmount <= 0 && (inst.lateFee - (inst.lateFeePaid ?? 0)) <= 0) {
      inst.status = 'Paid';
      inst.paidDate = inst.paidDate ?? today;
    } else if (creditPaid > 0) {
      inst.status = 'Partially Paid';
    }

    result.applied = roundTo(
      result.lateFeeAllocated + result.interestAllocated + result.principalAllocated,
    );
    if (result.applied > appliedBefore) {
      result.coveredInstallmentNumbers.push(inst.installmentNumber);
    }
  }

  result.applied = roundTo(
    result.lateFeeAllocated + result.interestAllocated + result.principalAllocated,
  );
  return result;
}
// ---------------------------------------------------------------------------
// Early settlement quote
// ---------------------------------------------------------------------------

export function calculateEarlySettlementQuote(loan: Loan, calcDate?: string): EarlySettlementQuote {
  const today = calcDate ?? todayISO();
  const principalPaidToDate = roundTo(
    loan.installments.reduce((s, i) => s + (i.paidPrincipal ?? 0), 0),
  );
  const outstandingPrincipalBalance = roundTo(loan.disbursedAmount - principalPaidToDate);

  let accruedInterestToDate = 0;
  let unearnedFutureInterest = 0;
  for (const inst of loan.installments) {
    const unpaidInterest = roundTo(inst.interestAmount - (inst.paidInterest ?? 0));
    if (unpaidInterest <= 0) continue;
    if (isBefore(inst.dueDate, today)) accruedInterestToDate += unpaidInterest;
    else unearnedFutureInterest += unpaidInterest;
  }

  const penaltyPercent = loan.earlySettlementPenaltyPercent;
  const penaltyFee = roundTo((outstandingPrincipalBalance * penaltyPercent) / 100);
  const totalSettlementAmount = roundTo(
    outstandingPrincipalBalance + accruedInterestToDate + penaltyFee,
  );

  return {
    calculationDate: today,
    originalPrincipal: roundTo(loan.disbursedAmount),
    principalPaidToDate,
    outstandingPrincipalBalance,
    accruedInterestToDate: roundTo(accruedInterestToDate),
    unearnedFutureInterestWaived: roundTo(unearnedFutureInterest),
    earlySettlementPenaltyPercent: penaltyPercent,
    earlySettlementPenaltyFee: penaltyFee,
    totalSettlementAmount,
    totalSavingsForCustomer: roundTo(unearnedFutureInterest),
  };
}