import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {Icon} from './Icon';
const won=(n:number)=>new Intl.NumberFormat('ko-KR').format(n)+'원';
export function PersonalFees({items,members,month,compact=false,edit,create}:{items:WorkspaceItem[];members:WorkspaceMember[];month:string;compact?:boolean;edit:(item:WorkspaceItem)=>void;create:()=>void}){
 const fees=items.filter(i=>i.kind==='FEE'&&i.fee?.month===month);
 const sorted=[...fees].sort((a,b)=>(a.fee?.dueDate||a.data.date).localeCompare(b.fee?.dueDate||b.data.date)||a.data.title.localeCompare(b.data.title,'ko')||a.id.localeCompare(b.id));
 const total=won(fees.reduce((sum,i)=>sum+(i.data.amount||0),0));
 const list=sorted.length?<div className="personal-item-list">{sorted.map(item=><article className="personal-item personal-tuition-item" key={item.id+item.fee!.month} data-item-id={item.id}>
  <button type="button" className="personal-item-main direct-item" onClick={()=>edit(item)} aria-label={item.data.title+' '+(item.mine?'수정':'상세')}>
   <span className="personal-item-category">{item.fee!.dueDate} · {item.data.feeFrequency==='MONTHLY'?'매월 납부':'한 번 납부'}</span><h3>{item.data.title}</h3>
   <p>{members.find(m=>m.id===(item.data.assigneeId||item.ownerId))?.name||'연결 해제된 구성원'} · 결제자 {item.fee!.payerName}</p>
   {!compact&&item.data.note&&<p className="personal-note-text">{item.data.note}</p>}
  </button><div className="personal-fee-value"><strong>{won(item.data.amount||0)}</strong></div>
 </article>)}</div>:<button type="button" className="personal-empty direct-empty" onClick={create}><Icon name="plus"/><strong>학원비 등록</strong></button>;
 if(compact)return <details className="personal-fee-disclosure" key={month}><summary className="personal-fee-summary"><span>{Number(month.slice(5))}월 합계</span><strong>{total}</strong><span className="fee-disclosure-label">상세 보기<Icon name="chevron"/></span></summary>{list}</details>;
 return <><div className="personal-fee-summary"><span>{Number(month.slice(5))}월 합계</span><strong>{total}</strong><span>{fees.length}건</span></div>{list}</>;
}
