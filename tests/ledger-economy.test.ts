import {describe, expect, it} from 'vitest';
import {
  calculateAverageStockPrice, calculateLoanRepayment, calculateNetInterest,
  calculateRentalYield, calculateStockReturn, calculateVat,
} from '../shared/ledger-economy';

describe('ledger financial calculators', () => {
  it('calculates equal monthly repayments and handles an interest-free loan', () => {
    const mortgage = calculateLoanRepayment({principal: 300_000_000, annualRate: 4.5, months: 360, method: 'amortized'});
    expect(mortgage.monthly).toBeCloseTo(1_520_055.9295, 3);
    expect(mortgage.totalPayment).toBeCloseTo(547_220_134.612, 2);
    expect(mortgage.lastPayment).toBe(mortgage.monthly);
    expect(calculateLoanRepayment({principal: 12_000_000, annualRate: 0, months: 12, method: 'amortized'}))
      .toEqual({monthly: 1_000_000, lastPayment: 1_000_000, totalPayment: 12_000_000, totalInterest: 0});
  });

  it('separates first and last instalments for principal and bullet repayments', () => {
    const terms = {principal: 120_000_000, annualRate: 6, months: 120};
    expect(calculateLoanRepayment({...terms, method: 'principal'})).toEqual({
      monthly: 1_600_000, lastPayment: 1_005_000, totalInterest: 36_300_000, totalPayment: 156_300_000,
    });
    expect(calculateLoanRepayment({...terms, method: 'bullet'})).toEqual({
      monthly: 600_000, lastPayment: 120_600_000, totalInterest: 72_000_000, totalPayment: 192_000_000,
    });
  });

  it('calculates an annual rental yield on the purchase price after deposit and handles zero equity', () => {
    const terms = {purchase: 300_000_000, deposit: 30_000_000, monthlyRent: 1_200_000, annualCosts: 1_200_000};
    const result = calculateRentalYield(terms);
    expect(result).toMatchObject({investment: 270_000_000, annualIncome: 14_400_000, annualProfit: 13_200_000});
    expect(result?.annualYield).toBeCloseTo(4.8889, 4);
    expect(calculateRentalYield({...terms, deposit: terms.purchase})).toBeNull();
    expect(calculateRentalYield({...terms, monthlyRent: 0})?.annualYield).toBeLessThan(0);
  });

  it('keeps VAT and supply amounts consistent after whole-won rounding', () => {
    expect(calculateVat(100_000, false)).toEqual({supply: 100_000, tax: 10_000, total: 110_000});
    expect(calculateVat(110_000, true)).toEqual({supply: 100_000, tax: 10_000, total: 110_000});
    expect(calculateVat(105, false)).toEqual({supply: 105, tax: 11, total: 116});
    expect(calculateVat(115, true)).toEqual({supply: 105, tax: 10, total: 115});
  });

  it('uses the entered tax rate and rounds estimated interest withholding once', () => {
    expect(calculateNetInterest(100_000, 15.4)).toEqual({gross: 100_000, tax: 15_400, net: 84_600});
    expect(calculateNetInterest(50, 2.99)).toEqual({gross: 50, tax: 1, net: 49});
    expect(calculateNetInterest(5, 10)).toEqual({gross: 5, tax: 1, net: 4});
    expect(calculateNetInterest(100, 0)).toEqual({gross: 100, tax: 0, net: 100});
  });

  it('applies purchase and sale costs to the appropriate amounts and supports a loss', () => {
    const terms = {buyPrice: 50_000, sellPrice: 55_000, shares: 100, buyFee: 1000, sellCosts: 12_000};
    const result = calculateStockReturn(terms);
    expect(result).toMatchObject({cost: 5_001_000, proceeds: 5_488_000, profit: 487_000});
    expect(result.returnRate).toBeCloseTo(9.738052, 4);
    expect(calculateStockReturn({...terms, sellPrice: 0}).profit).toBe(-5_013_000);
  });

  it('weights average purchase prices by the number of shares', () => {
    const result = calculateAverageStockPrice({heldPrice: 50_000, heldShares: 100, addPrice: 42_000, addShares: 50});
    expect(result.shares).toBe(150);
    expect(result.total).toBe(7_100_000);
    expect(result.average).toBeCloseTo(47_333.3333, 4);
  });
});
