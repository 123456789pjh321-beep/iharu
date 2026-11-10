import {describe,it,expect} from 'vitest';
import {workspaceItemInput,type WorkspaceItem} from '../shared/workspace';
import {ledgerMonth,ledgerCSV,ledgerCategory,ledgerStatistics,ledgerQuickEntries,type LedgerFilter} from '../shared/ledger';
const row=(id:string,amount:number,flow?:'INCOME'|'EXPENSE',paid=false):WorkspaceItem=>({id,kind:'FEE',ownerId:'a',ownerName:'A',mine:true,version:1,data:{title:id,date:'2027-01-31',amount,ledgerFlow:flow,weekdays:[],note:'',place:'',paid:false},fee:{month:'2027-02',dueDate:'2027-02-28',paid,payerId:'a',payerName:'A',canMarkPaid:true}});
describe('household ledger',()=>{
 it('reconciles the reported November amounts and ignores all legacy completion flags',()=>{
  const amounts=[160000,300000,280000,220000,150000,58000,284000],items=amounts.map((amount,index)=>{const item=row('지출 '+index,amount,'EXPENSE',index===0||index===6);item.fee={...item.fee!,month:'2026-11',dueDate:index===6?'2026-11-23':'2026-11-01'};return item;});
  const total=ledgerMonth(items,'2026-11',['a']);expect(total).toMatchObject({expense:1452000,income:0,balance:-1452000});expect(total.days.get('2026-11-01')?.expense).toBe(1168000);expect(total.days.get('2026-11-23')?.expense).toBe(284000);
  for(const filter of [{},{query:'지출 0'},{flow:'INCOME'}] as LedgerFilter[]){const shown=ledgerMonth(items,'2026-11',['a'],filter),stats=ledgerStatistics(items,'2026-11',['a'],filter);expect(stats.expense).toBe(shown.expense);expect(stats.payments.reduce((sum,p)=>sum+p.amount,0)).toBe(shown.expense);expect(stats.trend[2].expense).toBe(shown.expense);expect([...shown.days.values()].reduce((sum,d)=>sum+d.expense,0)).toBe(shown.expense);}
  const flipped=items.map(item=>({...item,data:{...item.data,paid:!item.data.paid},fee:{...item.fee!,paid:!item.fee!.paid}}));expect(ledgerMonth(flipped,'2026-11').expense).toBe(1452000);expect(ledgerStatistics(flipped,'2026-11').expense).toBe(1452000);expect(ledgerMonth(items,'2026-11',['b']).expense).toBe(0);
 });
 it('builds category, payment and three-month statistics with identical member and search filters',()=>{
  const a=row('장보기',100,'EXPENSE',true),b=row('학원비',200,'EXPENSE',false),income=row('월급',1000,'INCOME',true),other=row('다른 사람',999,'EXPENSE',true),previous=row('지난달',80,'EXPENSE',true);a.data.ledgerCategory='FOOD';a.data.ledgerMethod='CARD';other.data.assigneeId='b';previous.fee={...previous.fee!,month:'2027-01',dueDate:'2027-01-31'};
  const items=[a,b,income,other,previous],data=ledgerStatistics(items,'2027-02',['a']);expect(data).toMatchObject({expense:300,income:1000,trend:[{month:'2026-12',expense:0},{month:'2027-01',expense:80},{month:'2027-02',expense:300}]});expect(data.payments).toEqual([{label:'미지정',amount:200},{label:'카드',amount:100}]);expect(ledgerStatistics(items,'2027-02',['a'],{query:'장보기'})).toMatchObject({expense:100,income:0,categories:[{label:'식비',amount:100}],payments:[{label:'카드',amount:100}]});
  expect(ledgerQuickEntries([a,{...a,fee:{...a.fee!,month:'2027-03',dueDate:'2027-03-28'}},b,other],['a']).map(i=>i.data.title)).toEqual(['장보기','학원비']);
 });
 it('keeps legacy fees as education expenses and calculates balance from every recorded amount',()=>{
  const income=row('급여',3000000,'INCOME',true),legacy=row('교육비',200000),expense=row('식비',100000,'EXPENSE',true);expense.data.ledgerCategory='FOOD';const data=ledgerMonth([income,legacy,expense],'2027-02');expect(ledgerCategory(legacy).id).toBe('EDUCATION');expect(data).toMatchObject({income:3000000,expense:300000,balance:2700000});expect(data.days.get('2027-02-28')).toMatchObject({income:3000000,expense:300000});expect(data.categories.map(c=>c.amount)).toEqual([200000,100000]);
 });
 it('keeps month, member, direction, category and search filters consistent',()=>{
  const a=row('급여',3000,'INCOME',true),b=row('식비',1000,'EXPENSE');b.data.ledgerCategory='FOOD';expect(ledgerMonth([a,b],'2027-03').fees).toEqual([]);expect(ledgerMonth([a,b],'2027-02',[]).fees).toEqual([]);expect(ledgerMonth([a,b],'2027-02','all',{flow:'INCOME'}).income).toBe(3000);expect(ledgerMonth([a,b],'2027-02','all',{query:'식비',category:'FOOD'})).toMatchObject({expense:1000,income:0,balance:-1000});
 });
 it('validates category direction and prevents finance fields on other record kinds',()=>{
  const data={title:'거래',date:'2027-02-28',amount:10000,ledgerFlow:'INCOME',ledgerCategory:'SALARY',ledgerMethod:'TRANSFER'};expect(workspaceItemInput.safeParse({kind:'FEE',data}).success).toBe(true);expect(workspaceItemInput.safeParse({kind:'FEE',data:{...data,ledgerCategory:'FOOD'}}).success).toBe(false);expect(workspaceItemInput.safeParse({kind:'FEE',data:{...data,ledgerMethod:'SECRET'}}).success).toBe(false);expect(workspaceItemInput.safeParse({kind:'NOTE',data}).success).toBe(false);
 });
 it('exports exact amounts safely without a completion-status column',()=>{
  const a=row('=HYPERLINK("bad")',3000,'INCOME',true);a.data.note='memo, "quoted"\nnext';const csv=ledgerCSV([a]);expect(csv).toContain('2027-02-28');expect(csv).toContain('3000');expect(csv).toContain("'=HYPERLINK");expect(csv).toContain('""quoted""');expect(csv).toContain('수입');expect(csv).not.toMatch(/처리 상태|완료|예정/);
 });
});
