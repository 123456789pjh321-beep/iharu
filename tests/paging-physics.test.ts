import {describe,it,expect} from 'vitest';
import {pageIntent,releaseVelocity,settleDuration} from '../web/src/components/paging-physics';
describe('page release intent',()=>{
 it('keeps taps, short slow drags and a deliberate reversal on the current page',()=>{
  expect(pageIntent(3,2,390)).toBe(0);expect(pageIntent(-35,-.1,390)).toBe(0);expect(pageIntent(-180,.6,390)).toBe(0);
 });
 it('accepts a short deliberate fling in either direction and a slow full drag on tablets',()=>{
  expect(pageIntent(-36,-.8,390)).toBe(1);expect(pageIntent(36,.8,820)).toBe(-1);expect(pageIntent(-180,0,1440)).toBe(1);
 });
 it('ignores stale velocity after holding and estimates velocity using the recent path',()=>{
  const samples=[{x:300,t:0},{x:280,t:200},{x:240,t:250},{x:200,t:300}];
  expect(releaseVelocity(samples,310)).toBeCloseTo(-.8);expect(releaseVelocity(samples,450)).toBe(0);expect(releaseVelocity([{x:1,t:0}],0)).toBe(0);
 });
 it('bounds completion duration across screen sizes and fling speeds',()=>{
  expect(settleDuration(20,4)).toBe(180);expect(settleDuration(1200,0)).toBe(380);expect(settleDuration(500,2)).toBe(250);
 });
});
