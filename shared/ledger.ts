import type {WorkspaceItem} from './workspace.js';
import {tuitionMonth} from './tuition-calendar.js';
export const ledgerFlows=['INCOME','EXPENSE'] as const;
export const ledgerMethods=['CASH','CARD','TRANSFER','OTHER'] as const;
export const ledgerCategories=[
 {id:'SALARY',label:'급여',flow:'INCOME'},{id:'SIDE_INCOME',label:'부수입',flow:'INCOME'},{id:'ALLOWANCE',label:'용돈·지원금',flow:'INCOME'},{id:'REFUND',label:'환급·환불',flow:'INCOME'},{id:'OTHER_INCOME',label:'기타 수입',flow:'INCOME'},
 {id:'EDUCATION',label:'교육·학원',flow:'EXPENSE'},{id:'FOOD',label:'식비',flow:'EXPENSE'},{id:'GROCERIES',label:'생활용품',flow:'EXPENSE'},{id:'TRANSPORT',label:'교통·자동차',flow:'EXPENSE'},{id:'HOUSING',label:'주거·통신',flow:'EXPENSE'},{id:'HEALTH',label:'건강·의료',flow:'EXPENSE'},{id:'SHOPPING',label:'쇼핑',flow:'EXPENSE'},{id:'LEISURE',label:'문화·여가',flow:'EXPENSE'},{id:'INSURANCE',label:'보험',flow:'EXPENSE'},{id:'OTHER_EXPENSE',label:'기타 지출',flow:'EXPENSE'},
] as const;
export type LedgerFlow=typeof ledgerFlows[number];
export type LedgerCategory=typeof ledgerCategories[number]['id'];
export const ledgerCategoryIds=ledgerCategories.map(c=>c.id);
export const ledgerMethodLabels={CASH:'현금',CARD:'카드',TRANSFER:'계좌이체',OTHER:'미지정'};
export function ledgerFlow(item:WorkspaceItem):LedgerFlow{return item.data.ledgerFlow||'EXPENSE';}
export function ledgerCategory(item:WorkspaceItem){return ledgerCategories.find(c=>c.id===item.data.ledgerCategory&&c.flow===ledgerFlow(item))||ledgerCategories.find(c=>c.id===(ledgerFlow(item)==='INCOME'?'OTHER_INCOME':item.data.ledgerCategory?'OTHER_EXPENSE':'EDUCATION'))!;}
export type LedgerFilter={flow?:'ALL'|LedgerFlow;category?:string;query?:string;status?:'ALL'|'DONE'|'PENDING'};
export function ledgerMonth(items:WorkspaceItem[],month:string,members:readonly string[]|string='all',filter:LedgerFilter={}){
 const query=filter.query?.trim().toLocaleLowerCase('ko-KR')||'';
 const fees=tuitionMonth(items,month,members).fees.filter(i=>(!filter.flow||filter.flow==='ALL'||ledgerFlow(i)===filter.flow)&&(!filter.category||filter.category==='ALL'||ledgerCategory(i).id===filter.category)&&(!filter.status||filter.status==='ALL'||(filter.status==='DONE')===!!i.fee?.paid)&&(!query||[i.data.title,i.data.note,i.fee?.payerName,ledgerCategory(i).label].join(' ').toLocaleLowerCase('ko-KR').includes(query)));
 let income=0,expense=0,settledIncome=0,settledExpense=0;
 const days=new Map<string,{items:WorkspaceItem[];income:number;expense:number}>(),categories=new Map<string,{label:string;amount:number}>();
 for(const i of fees){const amount=i.data.amount||0,incoming=ledgerFlow(i)==='INCOME',date=i.fee!.dueDate,day=days.get(date)||{items:[],income:0,expense:0};day.items.push(i);if(incoming){income+=amount;day.income+=amount;if(i.fee!.paid)settledIncome+=amount;}else{expense+=amount;day.expense+=amount;if(i.fee!.paid)settledExpense+=amount;const c=ledgerCategory(i),bucket=categories.get(c.id)||{label:c.label,amount:0};bucket.amount+=amount;categories.set(c.id,bucket);}days.set(date,day);}
 return {fees,days,income,expense,balance:income-expense,settledIncome,settledExpense,settledBalance:settledIncome-settledExpense,pendingIncome:income-settledIncome,pendingExpense:expense-settledExpense,categories:[...categories.values()].sort((a,b)=>b.amount-a.amount)};
}
export function ledgerCSV(items:WorkspaceItem[]){
 const cell=(v:string|number)=>{let s=String(v);if(typeof v==='string'&&/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\uFEFF'+[['거래일','구분','분류','내용','금액(원)','처리 상태','결제 수단','담당자','메모'],...items.map(i=>[i.fee!.dueDate,ledgerFlow(i)==='INCOME'?'수입':'지출',ledgerCategory(i).label,i.data.title,i.data.amount||0,i.fee?.paid?'완료':'예정',ledgerMethodLabels[i.data.ledgerMethod||'OTHER'],i.fee?.payerName||'',i.data.note])].map(row=>row.map(cell).join(',')).join('\r\n');
}
