import {describe,it,expect} from 'vitest';
import {tuitionMonth} from '../shared/tuition-calendar';
import type {WorkspaceItem} from '../shared/workspace';
const fee=(id:string,amount:number,date:string,member='child'):WorkspaceItem=>({id,kind:'FEE',mine:true,ownerId:'parent',ownerName:'부모',version:1,data:{title:id,amount,date:'2027-01-31',assigneeId:member,weekdays:[],place:'',note:'',paid:false},fee:{month:date.slice(0,7),dueDate:date,paid:false,payerId:'parent',payerName:'부모',canMarkPaid:true}});
describe('tuition calendar and ledger',()=>{
 it('groups monthly occurrences by the clamped due date and sums each occurrence once',()=>{
  const a=fee('피아노',180000,'2027-02-28'),b=fee('교재',30000,'2027-02-28'),c=fee('미술',70000,'2027-02-10'),other=fee('다음 달',90000,'2027-03-31');
  const result=tuitionMonth([a,b,c,other],'2027-02');
  expect(result.total).toBe(280000);expect(result.days.size).toBe(2);expect(result.days.get('2027-02-28')?.total).toBe(210000);expect(result.fees[0].id).toBe('미술');expect(result.days.has('2027-01-31')).toBe(false);expect(a.data.date).toBe('2027-01-31');
 });
 it('keeps member totals, zero amounts and non-fee records consistent between calendar and ledger',()=>{
  const a=fee('내 수업',0,'2028-02-29','parent'),b=fee('아이 수업',120000,'2028-02-29'),note={...b,id:'메모',kind:'NOTE' as const};
  expect(tuitionMonth([a,b,note],'2028-02').total).toBe(120000);const own=tuitionMonth([a,b,note],'2028-02','parent');expect(own.fees.map(i=>i.id)).toEqual(['내 수업']);expect(own.days.get('2028-02-29')?.total).toBe(0);expect(tuitionMonth([a,b],'2028-03').days.size).toBe(0);expect(tuitionMonth([a,b,note],'2028-02',['parent','child']).total).toBe(120000);expect(tuitionMonth([a,b],'2028-02',[]).fees).toEqual([]);
 });
});
