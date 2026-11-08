import {it,expect} from 'vitest';
import {hasMenuUpdate,menuForPath,mergeMenuUpdates} from '../shared/workspace-updates';
it('maps both chat routes and repeat aliases to the same dot without exposing unrelated menu state',()=>{
 expect(['/timetable','/today/repeats','/today/calendar','/child/chat','/chat','/tuition','/records','/family','/account'].map(menuForPath)).toEqual(['timetable','timetable','calendar','chat','chat','fees','records','family',undefined]);
});
it('keeps a newer unread update when an older read request completes later',()=>{
 const newer={profileId:'a',updates:{chat:{revision:4,seen:2}}};
 const merged=mergeMenuUpdates(newer,{profileId:'a',updates:{chat:{revision:3,seen:3}}});
 expect(merged.updates.chat).toEqual({revision:4,seen:3});expect(hasMenuUpdate(merged,'chat')).toBe(true);
 expect(hasMenuUpdate(mergeMenuUpdates(merged,{profileId:'a',updates:{chat:{revision:4,seen:4}}}),'chat')).toBe(false);
});
it('does not resurrect an acknowledged dot from an older poll or leak another account state',()=>{
 expect(mergeMenuUpdates({profileId:'a',updates:{chat:{revision:2,seen:2}}},{profileId:'a',updates:{chat:{revision:1,seen:0}}}).updates.chat).toEqual({revision:2,seen:2});
 expect(mergeMenuUpdates({profileId:'a',updates:{chat:{revision:2,seen:0}}},{profileId:'b',updates:{}})).toEqual({profileId:'b',updates:{}});
 expect(hasMenuUpdate(null,'chat')).toBe(false);
});
