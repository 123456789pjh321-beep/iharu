import {describe,it,expect} from 'vitest';
import {entryReturnPath,entryIntentSchema,entryIntentKey,entryIntentLifetime,saveEntryIntent,takeEntryIntent,type EntryStorage} from '../shared/entry-intent';
function storage():EntryStorage{const values=new Map<string,string>();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};}
describe('guest authentication continuations',()=>{
 it('permits only known internal destinations',()=>{
  for(const path of ['/today/calendar','/timetable','/family','/more/notices/menu-update-dots','/briefing?settings=1','/briefing?view=saved'])expect(entryReturnPath(path)).toBe(path);
  for(const path of ['https://evil.example','//evil.example','/\\evil.example','/login','/signup','/admin?act=delete','/briefing?view=all','/briefing?settings=1&next=//evil.example','/briefing?view=saved#script','/timetable#script','/%2f%2fevil.example','/timetable\n',null])expect(entryReturnPath(path)).toBe('/timetable');
 });
 it('resumes an input position once and only on its own page',()=>{
  const store=storage(),intent={type:'create' as const,path:'/today/calendar',kind:'EVENT' as const,date:'2027-02-18',time:'16:30'};
  saveEntryIntent(store,intent,1000);expect(takeEntryIntent(store,'/timetable',1001)).toBeNull();expect(takeEntryIntent(store,'/today/calendar',1002)).toEqual(intent);expect(takeEntryIntent(store,'/today/calendar',1003)).toBeNull();
 });
 it('rejects expired, overlong, malformed, and mismatched actions',()=>{
  for(const value of [
   {intent:{type:'create',path:'/timetable',kind:'FEE',date:'2027-02-18'},expiresAt:2000},
   {intent:{type:'create',path:'/today/calendar',kind:'EVENT',date:'2027-02-30'},expiresAt:2000},
   {intent:{type:'create',path:'/today/calendar',kind:'EVENT',date:'2027-02-18',time:'25:10'},expiresAt:2000},
   {intent:{type:'page',path:'//evil.example'},expiresAt:2000},
   {intent:{type:'page',path:'/timetable'},expiresAt:1000},
   {intent:{type:'page',path:'/timetable'},expiresAt:1001+entryIntentLifetime},
   {intent:{type:'create',path:'/today/calendar',kind:'EVENT',date:'2027-02-18',title:'do not preserve private input'},expiresAt:2000},
  ]){const store=storage();store.setItem(entryIntentKey,JSON.stringify(value));expect(takeEntryIntent(store,'/timetable',1000)).toBeNull();expect(store.getItem(entryIntentKey)).toBeNull();}
 });
 it('has no operation that writes, sends, or deletes records',()=>{
  for(const type of ['save','send','delete','invite','pay'])expect(entryIntentSchema.safeParse({type,path:'/timetable'}).success).toBe(false);
 });
});
