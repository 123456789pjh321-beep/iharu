import {describe,expect,it} from 'vitest';
import {appendLedgerKey,calculateLedgerExpression} from '../shared/ledger-calculator';

describe('ledger calculator',()=>{
 it('calculates exact decimal and percent operands with operator precedence',()=>{
  expect(calculateLedgerExpression('1200+50*10')).toEqual({value:'1700',amount:1700});
  expect(calculateLedgerExpression('0.1+0.2')).toEqual({value:'0.3',amount:null});
  expect(calculateLedgerExpression('1999*25%')).toEqual({value:'499.75',amount:500});
  expect(calculateLedgerExpression('-20/5+10')).toEqual({value:'6',amount:6});
 });
 it('rounds a register amount once and rejects amounts outside valid limits',()=>{
  expect(calculateLedgerExpression('9/2')).toEqual({value:'4.5',amount:5});
  expect(calculateLedgerExpression('0.499999999999')).toMatchObject({amount:null});
  expect(calculateLedgerExpression('1000000000')).toEqual({value:'1000000000',amount:1000000000});
  expect(calculateLedgerExpression('1000000000+1')).toMatchObject({amount:null});
  expect(calculateLedgerExpression('2-3')).toEqual({value:'-1',amount:null});
  expect(calculateLedgerExpression('3/0')).toMatchObject({error:'0으로 나눌 수 없어요.'});
  expect(calculateLedgerExpression('3+')).toBeNull();
 });
 it('accepts only supported keypad input',()=>{
  expect(appendLedgerKey('2+','*')).toBe('2*');
  expect(appendLedgerKey('2+','.')).toBe('2+0.');
  expect(appendLedgerKey('2+0','2')).toBe('2+2');
  expect(appendLedgerKey('7%', '1')).toBe('7%');
  expect(appendLedgerKey('7%', 'backspace')).toBe('7');
  expect(appendLedgerKey('7%', '<script>')).toBe('7%');
 });
});
