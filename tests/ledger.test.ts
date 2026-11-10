import {describe,it,expect} from 'vitest';
import {workspaceItemInput,type WorkspaceItem} from '../shared/workspace';
import {ledgerMonth,ledgerCSV,ledgerCategory} from '../shared/ledger';
const row=(id:string,amount:number,flow?:'INCOME'|'EXPENSE',paid=false):WorkspaceItem=>({id,kind:'FEE',ownerId:'a',ownerName:'A',mine:true,version:1,data:{title:id,date:'2027-01-31',amount,ledgerFlow:flow,weekdays:[],note:'',place:'',paid:false},fee:{month:'2027-02',dueDate:'2027-02-28',paid,payerId:'a',payerName:'A',canMarkPaid:true}});
describe('household ledger',()=>{
 it('keeps legacy fees as education expenses and separates planned and completed cash flow',()=>{
  const income=row('급여',3000000,'INCOME',true),legacy=row('교육비',200000),expense=row('식비',100000,'EXPENSE',true);expense.data.ledgerCategory='FOOD';
  const data=ledgerMonth([income,legacy,expense],'2027-02');expect(ledgerCategory(legacy).id).toBe('EDUCATION');expect(data).toMatchObject({income:3000000,expense:300000,balance:2700000,settledBalance:2900000,pendingExpense:200000});expect(data.days.get('2027-02-28')).toMatchObject({income:3000000,expense:300000});expect(data.categories.map(c=>c.amount)).toEqual([200000,100000]);
 });
 it('keeps month, member, direction, category, search and completion filters consistent',()=>{
  const a=row('급여',3000,'INCOME',true),b=row('식비',1000,'EXPENSE');b.data.ledgerCategory='FOOD';
  expect(ledgerMonth([a,b],'2027-03').fees).toEqual([]);expect(ledgerMonth([a,b],'2027-02',[]).fees).toEqual([]);
  expect(ledgerMonth([a,b],'2027-02','all',{flow:'INCOME'}).income).toBe(3000);expect(ledgerMonth([a,b],'2027-02','all',{status:'PENDING',query:'식비',category:'FOOD'}).expense).toBe(1000);
 });
 it('validates category direction and prevents finance fields on other record kinds',()=>{
  const data={title:'거래',date:'2027-02-28',amount:10000,ledgerFlow:'INCOME',ledgerCategory:'SALARY',ledgerMethod:'TRANSFER'};
  expect(workspaceItemInput.safeParse({kind:'FEE',data}).success).toBe(true);expect(workspaceItemInput.safeParse({kind:'FEE',data:{...data,ledgerCategory:'FOOD'}}).success).toBe(false);expect(workspaceItemInput.safeParse({kind:'FEE',data:{...data,ledgerMethod:'SECRET'}}).success).toBe(false);expect(workspaceItemInput.safeParse({kind:'NOTE',data}).success).toBe(false);
 });
 it('exports exact dates and amounts while neutralizing spreadsheet formulas and escaping quotes',()=>{
  const a=row('=HYPERLINK("bad")',3000,'INCOME',true);a.data.note='memo, "quoted"\nnext';const csv=ledgerCSV([a]);expect(csv).toContain('2027-02-28');expect(csv).toContain('3000');expect(csv).toContain("'=HYPERLINK");expect(csv).toContain('""quoted""');expect(csv).toContain('수입');
 });
});
