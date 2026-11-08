import {useEffect,useState} from 'react';
import {MonthSwipeArea} from './MonthSwipeArea';
import {MemberFilter} from './MemberFilter';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {Icon} from './Icon';
const won=(n:number)=>new Intl.NumberFormat('ko-KR').format(n)+'원';
export function PersonalFees({items,members,month,compact=false,edit,create,onMonthChange}:{items:WorkspaceItem[];members:WorkspaceMember[];month:string;compact?:boolean;edit:(item:WorkspaceItem)=>void;create:()=>void;onMonthChange?:(month:string)=>void}){
 const [member,setMember]=useState('all');
 useEffect(()=>{if(member!=='all'&&!members.some(m=>m.id===member))setMember('all');},[member,members]);
 const selected=member;
 const fees=items.filter(i=>i.kind==='FEE'&&i.fee?.month===month&&(selected==='all'||(i.data.assigneeId||i.ownerId)===selected));
 const sorted=[...fees].sort((a,b)=>(a.fee?.dueDate||a.data.date).localeCompare(b.fee?.dueDate||b.data.date)||a.data.title.localeCompare(b.data.title,'ko')||a.id.localeCompare(b.id));
 const total=won(fees.reduce((sum,i)=>sum+(i.data.amount||0),0));
 const summaryLabel=Number(month.slice(5))+'월 '+(selected==='all'?'합계':members.find(m=>m.id===selected)?.name+' 합계');
 const filter=<MemberFilter className="fee-member-filters" members={members} value={member} onChange={setMember} label={compact?'오늘 학원비 구성원 필터':'학원비 구성원 필터'}/>;
 const list=sorted.length?<div className="personal-item-list">{sorted.map(item=><article className="personal-item personal-tuition-item" key={item.id+item.fee!.month} data-item-id={item.id}>
  <button type="button" className="personal-item-main direct-item" onClick={()=>edit(item)} aria-label={item.data.title+' '+(item.mine?'수정':'상세')}>
   <span className="personal-item-category">{item.fee!.dueDate} · {item.data.feeFrequency==='MONTHLY'?'매월 납부':'한 번 납부'}</span><h3>{item.data.title}</h3>
   <p>{members.find(m=>m.id===(item.data.assigneeId||item.ownerId))?.name||'연결 해제된 구성원'} · 결제자 {item.fee!.payerName}</p>
   {!compact&&item.data.note&&<p className="personal-note-text">{item.data.note}</p>}
  </button><div className="personal-fee-value"><strong>{won(item.data.amount||0)}</strong></div>
 </article>)}</div>:<button type="button" className="personal-empty direct-empty" aria-label="학원비 등록" title="학원비 등록" onClick={create}><Icon name="plus"/>{selected!=='all'&&<span>{members.find(m=>m.id===selected)?.name}의 이번 달 학원비가 없어요.</span>}</button>;
 if(compact)return <>{filter}<details className="personal-fee-disclosure" key={month}><summary className="personal-fee-summary"><span>{summaryLabel}</span><strong aria-live="polite" aria-atomic="true">{total}</strong><span className="fee-disclosure-label">상세 보기<Icon name="chevron"/></span></summary>{list}</details></>;
 const content=<div className="personal-fees-content"><div className="personal-fee-summary" aria-live="polite"><span>{summaryLabel}</span><strong>{total}</strong><span>{fees.length}건</span></div>{list}</div>;
 return <div className="personal-fees-full">{filter}{onMonthChange?<MonthSwipeArea month={month} onChange={onMonthChange}>{content}</MonthSwipeArea>:content}</div>;
}
