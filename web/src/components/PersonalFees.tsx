import {LedgerBudget} from './LedgerBudget';
import {LedgerStatistics} from './LedgerStatistics';
import {TuitionDaySheet} from './TuitionDaySheet';
import {useState} from 'react';
import {MonthSwipeArea} from './MonthSwipeArea';
import {MemberPreferenceFilter,useMemberPreference,type MemberPreferenceProps} from './MemberPreferenceFilter';
import {CalendarMemberPreferenceFilter} from './CalendarMemberPreferenceFilter';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {ledgerMonth,ledgerFlow,ledgerCategory,type LedgerFlow} from '../../../shared/ledger';
import {Icon} from './Icon';
import {koreaToday} from '../../../shared/schedules';
const won=(n:number)=>new Intl.NumberFormat('ko-KR').format(n)+'원';
const short=(n:number)=>n>=10000?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(n/10000)+'만':new Intl.NumberFormat('ko-KR').format(n);
export function PersonalFees({viewerId,defaultMemberIds,saveDefaultMembers,preview=false,items,members,month,compact=false,loading=false,edit,create,onMonthChange,budgetLogin}:MemberPreferenceProps&{items:WorkspaceItem[];members:WorkspaceMember[];month:string;compact?:boolean;loading?:boolean;edit:(item:WorkspaceItem)=>void;create:(date?:string)=>void;onMonthChange?:(month:string)=>void;refresh?:()=>Promise<void>;budgetLogin?:()=>void}){
 const selection=useMemberPreference(members,{viewerId,defaultMemberIds,saveDefaultMembers});
 const [view,setView]=useState<'calendar'|'ledger'|'stats'>('calendar'),[selectedDate,setSelectedDate]=useState<string|null>(null),[flow,setFlow]=useState<'ALL'|LedgerFlow>('ALL'),[budgetActions,setBudgetActions]=useState<HTMLDivElement|null>(null);
 const filter={flow},summary=ledgerMonth(items,month,selection.memberIds,filter),date=selectedDate?.startsWith(month+'-')?selectedDate:null;
 const Filter=compact?MemberPreferenceFilter:CalendarMemberPreferenceFilter;
 const memberFilter=<Filter preview={preview} className="fee-member-filters" members={members} selection={selection} label={compact?'오늘 가계부 구성원 필터':'가계부 구성원 필터'}/>;
 const renderMonth=(pageMonth:string)=>{
  const data=ledgerMonth(items,pageMonth,selection.memberIds,filter),fees=data.fees;
  const list=fees.length?<div className="personal-item-list">{[...data.days].map(([day,group])=><section className="ledger-day-group" key={day}><header><h3>{Number(day.slice(5,7))}월 {Number(day.slice(8))}일</h3><span>{group.income>0&&`수입 ${won(group.income)} `}{group.expense>0&&`지출 ${won(group.expense)}`}</span></header>{group.items.map(item=><article className="personal-item personal-tuition-item ledger-entry" key={item.id+item.fee!.month} data-item-id={item.id} data-flow={ledgerFlow(item)}>
   <button type="button" className="personal-item-main direct-item" onClick={()=>edit(item)} aria-label={item.data.title+' '+(item.mine?'수정':'상세')}><span className="personal-item-category">{item.fee!.dueDate} · {ledgerCategory(item).label}{item.data.feeFrequency==='MONTHLY'?' · 매월 반복':''}</span><h3>{item.data.title}</h3><p>{members.find(m=>m.id===(item.data.assigneeId||item.ownerId))?.name||'연결 해제된 구성원'} · 담당 {item.fee!.payerName}</p>{!compact&&item.data.note&&<p className="personal-note-text">{item.data.note}</p>}</button>
   <div className="personal-fee-value ledger-entry-value"><strong className={ledgerFlow(item)==='INCOME'?'ledger-income':'ledger-expense'}>{ledgerFlow(item)==='INCOME'?'+':'−'}{won(item.data.amount||0)}</strong></div>
  </article>)}</section>)}</div>:<button type="button" className="personal-empty direct-empty" aria-label="가계부 등록" onClick={()=>create(date||undefined)}><Icon name="plus"/><span>찾는 내역이 없어요. 새로 추가해 보세요.</span></button>;
  if(compact)return <>{memberFilter}<details className="personal-fee-disclosure"><summary className="personal-fee-summary"><span>{Number(pageMonth.slice(5))}월 지출</span><strong>{won(data.expense)}</strong><span className="fee-disclosure-label">상세 보기<Icon name="chevron"/></span></summary>{list}</details></>;
  const offset=new Date(pageMonth+'-01T12:00:00Z').getUTCDay(),count=new Date(Date.UTC(Number(pageMonth.slice(0,4)),Number(pageMonth.slice(5)),0)).getUTCDate(),today=koreaToday();
  return <div className="personal-fees-content ledger-content">
   <dl className="ledger-summary" aria-label="조회한 가계부 합계" aria-live="polite">
    <div className="ledger-summary-expense"><dt>지출</dt><dd className="ledger-expense">{loading?'—':won(data.expense)}</dd></div>
    <div><dt>수입</dt><dd className="ledger-income">{loading?'—':won(data.income)}</dd></div>
    <div className="ledger-balance"><dt>잔액</dt><dd className={data.balance<0?'ledger-expense':undefined}>{loading?'—':won(data.balance)}</dd></div>
   </dl>
   {view==='stats'?<LedgerStatistics filter={filter} items={items} month={pageMonth} memberIds={selection.memberIds}/>:null}
   {view==='stats'?null:view==='calendar'?<section className="tuition-calendar" aria-label={`${Number(pageMonth.slice(0,4))}년 ${Number(pageMonth.slice(5))}월 가계부 달력`}><div className="tuition-weekdays" aria-hidden="true">{['일','월','화','수','목','금','토'].map(label=><span key={label}>{label}</span>)}</div><div className="tuition-date-grid">{Array.from({length:offset},(_,n)=><span className="tuition-date-empty" key={'empty-'+n}/>)}{Array.from({length:count},(_,n)=>{const key=pageMonth+'-'+String(n+1).padStart(2,'0'),day=data.days.get(key);return <button type="button" className={'tuition-date'+(day?' has-fees':'')} disabled={loading} key={key} data-date={key} aria-label={`${key} · 가계부 ${day?.items.length||0}건 · 수입 ${won(day?.income||0)} · 지출 ${won(day?.expense||0)}`} aria-pressed={date===key} aria-current={key===today?'date':undefined} onClick={()=>setSelectedDate(key)}><span>{n+1}</span>{day&&<>{day.income>0&&<strong className="ledger-income">+{short(day.income)}</strong>}{day.expense>0&&<strong className="ledger-expense">−{short(day.expense)}</strong>}<small>{day.items.length}건</small></>}</button>;})}</div></section>:<section className="tuition-ledger" aria-label="가계부 내역"><header><div><h2>이번 달 내역</h2></div><button type="button" className="button compact" onClick={()=>create()}><Icon name="plus"/>추가</button></header>{list}</section>}
  </div>;
 };
 if(compact)return renderMonth(month);
 return <div className="personal-fees-full ledger-workspace">{memberFilter}<div className="ledger-controls"><div className="ledger-control-buttons"><div className="tuition-view-switch" role="group" aria-label="가계부 보기"><button type="button" aria-pressed={view==='calendar'} onClick={()=>setView('calendar')}><Icon name="calendar"/>달력</button><button type="button" aria-pressed={view==='ledger'} onClick={()=>setView('ledger')}><Icon name="book"/>내역</button><button type="button" aria-pressed={view==='stats'} onClick={()=>setView('stats')}><Icon name="wallet"/>통계</button></div><div className="ledger-flow-filter" role="group" aria-label="보고 싶은 내역">{(['ALL','INCOME','EXPENSE'] as const).map(value=><button type="button" key={value} aria-pressed={flow===value} onClick={()=>setFlow(value)}>{value==='ALL'?'전체':value==='INCOME'?'수입':'지출'}</button>)}</div><div className="ledger-budget-actions" ref={setBudgetActions}/></div></div><LedgerBudget key={(viewerId||'preview')+month+[...selection.memberIds].sort().join(',')} month={month} memberIds={selection.memberIds} expense={ledgerMonth(items,month,selection.memberIds).expense} preview={preview} loading={loading} login={budgetLogin} actionTarget={budgetActions}/>{onMonthChange?<MonthSwipeArea month={month} onChange={onMonthChange}>{renderMonth}</MonthSwipeArea>:renderMonth(month)}{view==='calendar'&&date&&<TuitionDaySheet date={date} items={summary.days.get(date)?.items||[]} members={members} close={()=>setSelectedDate(null)} create={()=>{setSelectedDate(null);create(date);}} edit={item=>{setSelectedDate(null);edit(item);}}/>}</div>;
}
