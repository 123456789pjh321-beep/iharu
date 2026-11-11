import {describe,it,expect} from 'vitest';
import {lunarDateCaption} from '../shared/lunar-calendar';

describe('Korean lunar date captions',()=>{
 it('matches the dates in the supplied November and December reference screens',()=>{
  expect(lunarDateCaption('2026-11-01')).toBe('9/22');
  expect(lunarDateCaption('2026-11-11')).toBe('10/3');
  expect(lunarDateCaption('2026-11-22')).toBe('10/14');
  expect(lunarDateCaption('2026-12-08')).toBe('10/30');
 });
 it('does not produce a label for a missing or malformed date',()=>{
  expect(lunarDateCaption('')).toBe('');
  expect(lunarDateCaption('not-a-date')).toBe('');
  expect(lunarDateCaption('2026-99-99')).toBe('');
 });
});
