import {it,expect} from 'vitest';
import {PullRefreshGesture,pullRefreshDistance} from '../web/src/components/pull-refresh-physics';
it('ignores ordinary scrolling, controls, loading and horizontal photo swipes',()=>{
 const g=new PullRefreshGesture();g.begin(0,0,10,true);expect(g.move(0,300,10)).toBe(false);expect(g.release()).toBe(false);
 g.begin(0,0,0,false);expect(g.move(0,300,0)).toBe(false);
 g.begin(0,0,0,true);expect(g.move(80,12,0)).toBe(false);expect(g.move(80,300,0)).toBe(false);expect(g.release()).toBe(false);
});
it('tracks deliberate top-edge pulls, softens long drags and commits only on release',()=>{
 const g=new PullRefreshGesture();g.begin(100,30,0,true);expect(g.move(101,35,0)).toBe(false);expect(g.move(102,110,0)).toBe(true);expect(g.armed).toBe(false);expect(g.move(103,190,0)).toBe(true);expect(g.armed).toBe(true);expect(g.release()).toBe(true);expect(g.release()).toBe(false);
 expect(pullRefreshDistance(1000)).toBeLessThan(112);expect(pullRefreshDistance(1000)-pullRefreshDistance(800)).toBeLessThan(pullRefreshDistance(200)-pullRefreshDistance(0));
});
it('cancels short pulls, deliberate reversal, multiple fingers and interrupted gestures',()=>{
 const g=new PullRefreshGesture();g.begin(0,0,0,true);g.move(0,80,0);expect(g.release()).toBe(false);
 g.begin(0,0,0,true);g.move(0,180,0);g.move(0,25,0);expect(g.release()).toBe(false);
 g.begin(0,0,0,true);g.move(0,180,0,2);expect(g.release()).toBe(false);
 g.begin(0,0,0,true);g.move(0,180,0);g.cancel();expect(g.release()).toBe(false);
});
