import type {WorkspaceItem} from './workspace.js';

/** Calendar and ledger share the server-calculated monthly occurrence and due date. */
export function tuitionMonth(items:WorkspaceItem[],month:string,member='all'){
 const fees=items.filter(item=>item.kind==='FEE'&&item.fee?.month===month&&(member==='all'||(item.data.assigneeId||item.ownerId)===member))
  .sort((a,b)=>a.fee!.dueDate.localeCompare(b.fee!.dueDate)||a.data.title.localeCompare(b.data.title,'ko')||a.id.localeCompare(b.id));
 const days=new Map<string,{items:WorkspaceItem[];total:number}>();
 let total=0;
 for(const item of fees){const date=item.fee!.dueDate,amount=item.data.amount||0,day=days.get(date)||{items:[],total:0};day.items.push(item);day.total+=amount;days.set(date,day);total+=amount;}
 return {fees,days,total};
}
