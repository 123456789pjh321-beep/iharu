import type {WorkspaceItem} from './workspace.js';
import {tuitionMonth} from './tuition-calendar.js';
export const ledgerFlows=['INCOME','EXPENSE'] as const;
export const ledgerMethods=['CASH','CARD','TRANSFER','OTHER'] as const;
export const ledgerCategories=[
 {id:'SALARY',label:'월급',flow:'INCOME'},{id:'SIDE_INCOME',label:'추가로 번 돈',flow:'INCOME'},{id:'ALLOWANCE',label:'용돈',flow:'INCOME'},{id:'REFUND',label:'돌려받은 돈',flow:'INCOME'},{id:'OTHER_INCOME',label:'그 밖에 받은 돈',flow:'INCOME'},
 {id:'EDUCATION',label:'교육·학원',flow:'EXPENSE'},{id:'FOOD',label:'식비',flow:'EXPENSE'},{id:'GROCERIES',label:'생활용품',flow:'EXPENSE'},{id:'TRANSPORT',label:'교통·자동차',flow:'EXPENSE'},{id:'HOUSING',label:'주거·통신',flow:'EXPENSE'},{id:'HEALTH',label:'건강·의료',flow:'EXPENSE'},{id:'SHOPPING',label:'쇼핑',flow:'EXPENSE'},{id:'LEISURE',label:'문화·여가',flow:'EXPENSE'},{id:'INSURANCE',label:'보험',flow:'EXPENSE'},{id:'OTHER_EXPENSE',label:'그 밖에 쓴 돈',flow:'EXPENSE'},
] as const;
export type LedgerFlow=typeof ledgerFlows[number];
export type LedgerCategory=typeof ledgerCategories[number]['id'];
export const ledgerCategoryIds=ledgerCategories.map(c=>c.id);
export const ledgerMethodLabels={CASH:'현금',CARD:'카드',TRANSFER:'계좌이체',OTHER:'미지정'};
export function ledgerFlow(item:WorkspaceItem):LedgerFlow{return item.data.ledgerFlow||'EXPENSE';}
export function ledgerCategory(item:WorkspaceItem){return ledgerCategories.find(c=>c.id===item.data.ledgerCategory&&c.flow===ledgerFlow(item))||ledgerCategories.find(c=>c.id===(ledgerFlow(item)==='INCOME'?'OTHER_INCOME':item.data.ledgerCategory?'OTHER_EXPENSE':'EDUCATION'))!;}
export type LedgerFilter={flow?:'ALL'|LedgerFlow;category?:string;query?:string};
/** Every recorded amount counts once; legacy completion flags never affect totals. */
export function ledgerMonth(items:WorkspaceItem[],month:string,members:readonly string[]|string='all',filter:LedgerFilter={}){
 const query=filter.query?.trim().toLocaleLowerCase('ko-KR')||'';
 const fees=tuitionMonth(items,month,members).fees.filter(i=>(!filter.flow||filter.flow==='ALL'||ledgerFlow(i)===filter.flow)&&(!filter.category||filter.category==='ALL'||ledgerCategory(i).id===filter.category)&&(!query||[i.data.title,i.data.note,i.fee?.payerName,ledgerCategory(i).label].join(' ').toLocaleLowerCase('ko-KR').includes(query)));
 let income=0,expense=0;
 const days=new Map<string,{items:WorkspaceItem[];income:number;expense:number}>(),categories=new Map<string,{label:string;amount:number}>();
 for(const i of fees){const amount=i.data.amount||0,incoming=ledgerFlow(i)==='INCOME',date=i.fee!.dueDate,day=days.get(date)||{items:[],income:0,expense:0};day.items.push(i);if(incoming){income+=amount;day.income+=amount;}else{expense+=amount;day.expense+=amount;const c=ledgerCategory(i),bucket=categories.get(c.id)||{label:c.label,amount:0};bucket.amount+=amount;categories.set(c.id,bucket);}days.set(date,day);}
 return {fees,days,income,expense,balance:income-expense,categories:[...categories.values()].sort((a,b)=>b.amount-a.amount)};
}
export function ledgerCSV(items:WorkspaceItem[]){
 const cell=(v:string|number)=>{let s=String(v);if(typeof v==='string'&&/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\uFEFF'+[['거래일','구분','분류','내용','금액(원)','결제 수단','담당자','메모'],...items.map(i=>[i.fee!.dueDate,ledgerFlow(i)==='INCOME'?'수입':'지출',ledgerCategory(i).label,i.data.title,i.data.amount||0,ledgerMethodLabels[i.data.ledgerMethod||'OTHER'],i.fee?.payerName||'',i.data.note])].map(row=>row.map(cell).join(',')).join('\r\n');
}
/** Statistics, dates and summaries use identical record filters. */
export function ledgerStatistics(items:WorkspaceItem[],month:string,members:readonly string[]|string='all',filter:LedgerFilter={}){
 const data=ledgerMonth(items,month,members,filter),payments=new Map<string,number>();
 for(const item of data.fees)if(ledgerFlow(item)==='EXPENSE'){const method=item.data.ledgerMethod||'OTHER';payments.set(method,(payments.get(method)||0)+(item.data.amount||0));}
 const trend=Array.from({length:3},(_,index)=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+index-2);const key=d.toISOString().slice(0,7),summary=ledgerMonth(items,key,members,filter);return {month:key,income:summary.income,expense:summary.expense};});
 return {...data,payments:[...payments].map(([method,amount])=>({label:ledgerMethodLabels[method as keyof typeof ledgerMethodLabels],amount})).sort((a,b)=>b.amount-a.amount),trend};
}
/** Reuse drafts only; each repeating record appears once across loaded months. */
export function ledgerQuickEntries(items:WorkspaceItem[],members:readonly string[]){
 const seen=new Set<string>();return items.filter(i=>i.kind==='FEE'&&members.includes(i.data.assigneeId||i.ownerId)).sort((a,b)=>(b.fee?.dueDate||b.data.date).localeCompare(a.fee?.dueDate||a.data.date)).filter(i=>{const key=JSON.stringify([i.data.title,i.data.amount,ledgerFlow(i),ledgerCategory(i).id,i.data.ledgerMethod,i.data.assigneeId||i.ownerId]);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,6);
}
