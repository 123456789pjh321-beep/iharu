import {useId} from 'react';
import {useSlidingDialog} from './useSlidingDialog';
import {PlusButton} from './PlusButton';
import {Icon} from './Icon';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
const won=(n:number)=>new Intl.NumberFormat('ko-KR').format(n)+'원';
export function TuitionDaySheet({date,items,members,close,create,edit}:{date:string;items:WorkspaceItem[];members:WorkspaceMember[];close:()=>void;create:()=>void;edit:(item:WorkspaceItem)=>void}){
 const {ref,closing,closeWithAnimation}=useSlidingDialog(),id=useId();
 const label=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'}).format(new Date(date+'T12:00:00+09:00'));
 const dismiss=()=>{void closeWithAnimation(close);};
 return <dialog ref={ref} className="calendar-day-sheet tuition-day-sheet" data-closing={closing||undefined} aria-labelledby={id} onCancel={e=>{e.preventDefault();dismiss();}} onClick={e=>{if(e.target===e.currentTarget)dismiss();}}>
  <header><div><h2 id={id}>{label} 학원비</h2><p>{won(items.reduce((sum,item)=>sum+(item.data.amount||0),0))} · {items.length}건</p></div><button type="button" className="icon-button" aria-label="날짜 학원비 닫기" disabled={closing} onClick={dismiss}><Icon name="close"/></button></header>
  <div className="calendar-day-sheet-body">{items.length?items.map(item=><button type="button" key={item.id} className="day-sheet-event tuition-day-event" disabled={closing} aria-label={item.data.title+' '+(item.mine?'수정':'상세')} onClick={()=>void closeWithAnimation(()=>edit(item))}><span>{won(item.data.amount||0)}</span><div><strong>{item.data.title}</strong><small>{members.find(m=>m.id===(item.data.assigneeId||item.ownerId))?.name||'연결 해제된 구성원'} · {item.data.feeFrequency==='MONTHLY'?'매월 납부':'한 번 납부'}</small><small>결제자 {item.fee?.payerName||'미지정'}</small></div><Icon name="chevron"/></button>):<p className="day-sheet-empty">이 날짜에 등록된 학원비가 없어요.</p>}</div>
  <footer><PlusButton label="이 날짜에 학원비 추가" disabled={closing} onClick={()=>void closeWithAnimation(create)}/></footer>
 </dialog>;
}
