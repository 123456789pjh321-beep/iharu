import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {Icon} from './Icon';
const won=(n:number)=>new Intl.NumberFormat('ko-KR').format(n)+'원';
export function PersonalFees({items,members,month,compact=false,busy,edit,markPaid,create}:{items:WorkspaceItem[];members:WorkspaceMember[];month:string;compact?:boolean;busy:boolean;edit:(item:WorkspaceItem)=>void;markPaid:(item:WorkspaceItem)=>void;create:()=>void}){
 const fees=items.filter(i=>i.kind==='FEE'&&i.fee?.month===month),unpaid=fees.filter(i=>!i.fee?.paid);
 const sorted=[...fees].sort((a,b)=>Number(!!a.fee?.paid)-Number(!!b.fee?.paid)||(a.fee?.dueDate||a.data.date).localeCompare(b.fee?.dueDate||b.data.date));
 const shown=compact?sorted.slice(0,3):sorted;
 return <><div className="personal-fee-summary"><span>{Number(month.slice(5))}월 합계</span><strong>{won(fees.reduce((sum,i)=>sum+(i.data.amount||0),0))}</strong><span>미납 {unpaid.length}건 · {won(unpaid.reduce((sum,i)=>sum+(i.data.amount||0),0))}</span></div>
 {shown.length?<div className="personal-item-list">{shown.map(item=><article className="personal-item personal-tuition-item" key={item.id+item.fee!.month} data-item-id={item.id}>
  <button type="button" className="personal-item-main direct-item" onClick={()=>edit(item)} aria-label={item.data.title+' '+(item.mine?'수정':'상세')}>
   <span className="personal-item-category">{item.fee!.dueDate} · {item.data.feeFrequency==='MONTHLY'?'매월 납부':'한 번 납부'}</span><h3>{item.data.title}</h3>
   <p>{members.find(m=>m.id===(item.data.assigneeId||item.ownerId))?.name||'연결 해제된 구성원'} · 결제자 {item.fee!.payerName}</p>
   {!compact&&item.data.note&&<p className="personal-note-text">{item.data.note}</p>}
  </button><div className="personal-fee-value"><strong>{won(item.data.amount||0)}</strong>{item.fee!.canMarkPaid?<button type="button" className={'badge '+(item.fee!.paid?'green':'amber')} disabled={busy} onClick={()=>markPaid(item)} aria-label={item.data.title+' '+item.fee!.month+' '+(item.fee!.paid?'납부 취소':'납부 완료 표시')}>{item.fee!.paid?'납부 완료':'미납 · 납부 표시'}</button>:<span className={'badge '+(item.fee!.paid?'green':'amber')}>{item.fee!.paid?'납부 완료':'미납'}</span>}</div>
 </article>)}</div>:<button type="button" className="personal-empty direct-empty" onClick={create}><Icon name="plus"/><strong>학원비 등록</strong></button>}</>;
}
