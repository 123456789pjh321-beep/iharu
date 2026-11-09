import {useEffect,useState} from 'react';
import {MonthSwipeArea} from './MonthSwipeArea';
import {MemberFilter} from './MemberFilter';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {Icon} from './Icon';
import {tuitionMonth} from '../../../shared/tuition-calendar';
import {koreaToday} from '../../../shared/schedules';
const won=(n:number)=>new Intl.NumberFormat('ko-KR').format(n)+'원';
const calendarAmount=(n:number)=>n>=100000000?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(n/100000000)+'억':n>=10000?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(n/10000)+'만':new Intl.NumberFormat('ko-KR').format(n);
export function PersonalFees({items,members,month,compact=false,edit,create,onMonthChange}:{items:WorkspaceItem[];members:WorkspaceMember[];month:string;compact?:boolean;edit:(item:WorkspaceItem)=>void;create:(date?:string)=>void;onMonthChange?:(month:string)=>void}){
 const [member,setMember]=useState('all'),[view,setView]=useState<'calendar'|'ledger'>('calendar'),[selectedDate,setSelectedDate]=useState<string|null>(null);
 useEffect(()=>{if(member!=='all'&&!members.some(m=>m.id===member))setMember('all');},[member,members]);
 const selected=member;
 const summary=tuitionMonth(items,month,selected),fees=summary.fees;
 const date=selectedDate?.startsWith(month+'-')?selectedDate:null;
 const sorted=view==='calendar'&&date&&!compact?summary.days.get(date)?.items||[]:fees;
 const total=won(summary.total);
 const summaryLabel=Number(month.slice(5))+'월 '+(selected==='all'?'합계':members.find(m=>m.id===selected)?.name+' 합계');
 const filter=<MemberFilter className="fee-member-filters" members={members} value={member} onChange={setMember} label={compact?'오늘 학원비 구성원 필터':'학원비 구성원 필터'}/>;
 const list=sorted.length?<div className="personal-item-list">{sorted.map(item=><article className="personal-item personal-tuition-item" key={item.id+item.fee!.month} data-item-id={item.id}>
  <button type="button" className="personal-item-main direct-item" onClick={()=>edit(item)} aria-label={item.data.title+' '+(item.mine?'수정':'상세')}>
   <span className="personal-item-category">{item.fee!.dueDate} · {item.data.feeFrequency==='MONTHLY'?'매월 납부':'한 번 납부'}</span><h3>{item.data.title}</h3>
   <p>{members.find(m=>m.id===(item.data.assigneeId||item.ownerId))?.name||'연결 해제된 구성원'} · 결제자 {item.fee!.payerName}</p>
   {!compact&&item.data.note&&<p className="personal-note-text">{item.data.note}</p>}
  </button><div className="personal-fee-value"><strong>{won(item.data.amount||0)}</strong></div>
 </article>)}</div>:<button type="button" className="personal-empty direct-empty" aria-label="학원비 등록" title="학원비 등록" onClick={()=>create(date||undefined)}><Icon name="plus"/>{date?<span>이날 등록한 학원비가 없어요. 눌러서 추가해 보세요.</span>:selected!=='all'&&<span>{members.find(m=>m.id===selected)?.name}의 이번 달 학원비가 없어요.</span>}</button>;
 if(compact)return <>{filter}<details className="personal-fee-disclosure" key={month}><summary className="personal-fee-summary"><span>{summaryLabel}</span><strong aria-live="polite" aria-atomic="true">{total}</strong><span className="fee-disclosure-label">상세 보기<Icon name="chevron"/></span></summary>{list}</details></>;
 const first=month+'-01',offset=new Date(first+'T12:00:00Z').getUTCDay(),count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate(),today=koreaToday();
 const content=<div className="personal-fees-content">
  <div className="personal-fee-summary tuition-month-summary" aria-live="polite"><div><span>{summaryLabel}</span><strong>{total}</strong><small>등록한 납부일과 금액 기준</small></div><span><b>{fees.length}</b>건 · 납부일 <b>{summary.days.size}</b>일</span></div>
  <div className="tuition-view-switch" role="group" aria-label="학원비 보기"><button type="button" aria-pressed={view==='calendar'} onClick={()=>setView('calendar')}><Icon name="calendar"/>달력</button><button type="button" aria-pressed={view==='ledger'} onClick={()=>setView('ledger')}><Icon name="book"/>내역</button></div>
  {view==='calendar'&&<section className="tuition-calendar" aria-label={`${Number(month.slice(0,4))}년 ${Number(month.slice(5))}월 납부 달력`}>
   <div className="tuition-weekdays" aria-hidden="true">{['일','월','화','수','목','금','토'].map(label=><span key={label}>{label}</span>)}</div>
   <div className="tuition-date-grid">{Array.from({length:offset},(_,n)=><span className="tuition-date-empty" key={'empty-'+n}/>)}{Array.from({length:count},(_,n)=>{const key=month+'-'+String(n+1).padStart(2,'0'),day=summary.days.get(key);return <button type="button" className={'tuition-date'+(day?' has-fees':'')} key={key} data-date={key} aria-label={`${key} · 학원비 ${day?.items.length||0}건 · ${won(day?.total||0)}`} aria-pressed={date===key} aria-current={key===today?'date':undefined} onClick={()=>setSelectedDate(date===key?null:key)}><span>{n+1}</span>{day&&<><strong title={won(day.total)}>{calendarAmount(day.total)}</strong><small>{day.items.length}건</small></>}</button>;})}</div>
   <p className="tuition-calendar-hint">날짜를 누르면 아래에 해당일 내역을 보여줘요. 금액 단위: 원</p>
  </section>}
  <section className="tuition-ledger" aria-label="학원비 가계부"><header><div><h2>{view==='calendar'&&date?`${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일 납부 내역`:'이달 전체 내역'}</h2><span>{won(sorted.reduce((sum,item)=>sum+(item.data.amount||0),0))} · {sorted.length}건</span></div>{view==='calendar'&&date&&<button type="button" className="button compact quiet" onClick={()=>setSelectedDate(null)}>전체 내역</button>}<button type="button" className="button compact" onClick={()=>create(date||undefined)}><Icon name="plus"/>추가</button></header>{list}</section>
 </div>;
 return <div className="personal-fees-full">{filter}{onMonthChange?<MonthSwipeArea month={month} onChange={onMonthChange}>{content}</MonthSwipeArea>:content}</div>;
}
