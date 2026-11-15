export type LoanRepaymentMethod = 'amortized' | 'principal' | 'bullet';

export function calculateLoanRepayment({principal, annualRate, months, method}: {
  principal: number;
  annualRate: number;
  months: number;
  method: LoanRepaymentMethod;
}) {
  const monthlyRate = annualRate / 1200;
  const principalPortion = principal / months;
  const firstInterest = principal * monthlyRate;

  if (method === 'bullet') {
    const totalInterest = firstInterest * months;
    return {
      monthly: firstInterest,
      lastPayment: principal + firstInterest,
      totalInterest,
      totalPayment: principal + totalInterest,
    };
  }

  if (method === 'principal') {
    const totalInterest = firstInterest * (months + 1) / 2;
    return {
      monthly: principalPortion + firstInterest,
      lastPayment: principalPortion + principalPortion * monthlyRate,
      totalInterest,
      totalPayment: principal + totalInterest,
    };
  }

  const monthly = monthlyRate === 0
    ? principalPortion
    : firstInterest / -Math.expm1(-months * Math.log1p(monthlyRate));
  const totalInterest = Math.max(0, monthly * months - principal);
  return {monthly, lastPayment: monthly, totalInterest, totalPayment: principal + totalInterest};
}

export function calculateRentalYield({purchase, deposit, monthlyRent, annualCosts}: {
  purchase: number;
  deposit: number;
  monthlyRent: number;
  annualCosts: number;
}) {
  const investment = purchase - deposit;
  if (investment <= 0) return null;
  const annualIncome = monthlyRent * 12;
  const annualProfit = annualIncome - annualCosts;
  return {investment, annualIncome, annualProfit, annualYield: annualProfit / investment * 100};
}

export function calculateVat(amount: number, included: boolean) {
  const tax = Math.round(amount / (included ? 11 : 10));
  return {tax, supply: included ? amount - tax : amount, total: included ? amount : amount + tax};
}

export function calculateNetInterest(gross: number, ratePercent: number) {
  // The rate has at most two decimal places. Round the tax once, to a whole won.
  const rateBasisPoints = BigInt(Math.round(ratePercent * 100));
  const tax = Number((BigInt(gross) * rateBasisPoints + 5000n) / 10000n);
  return {gross, tax, net: gross - tax};
}

export function calculateStockReturn({buyPrice, sellPrice, shares, buyFee, sellCosts}: {
  buyPrice: number;
  sellPrice: number;
  shares: number;
  buyFee: number;
  sellCosts: number;
}) {
  const cost = buyPrice * shares + buyFee;
  const proceeds = sellPrice * shares - sellCosts;
  const profit = proceeds - cost;
  return {cost, proceeds, profit, returnRate: profit / cost * 100};
}

export function calculateAverageStockPrice({heldPrice, heldShares, addPrice, addShares}: {
  heldPrice: number;
  heldShares: number;
  addPrice: number;
  addShares: number;
}) {
  const shares = heldShares + addShares;
  const total = heldPrice * heldShares + addPrice * addShares;
  return {average: total / shares, shares, total};
}
