import {LedgerBudget} from './LedgerBudget';
import {LedgerStatistics} from './LedgerStatistics';
import {TuitionDaySheet} from './TuitionDaySheet';
import {useState} from 'react';
import {MonthSwipeArea} from './MonthSwipeArea';
import {MemberPreferenceFilter,useMemberPreference,type MemberPreferenceProps} from './MemberPreferenceFilter';
import {CalendarMemberPreferenceFilter} from './CalendarMemberPreferenceFilter';
import {CalendarGrid,CalendarWeek,monthWeeks} from './CalendarGrid';
import {useHolidays} from './useHolidays';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {ledgerMonth,ledgerFlow,ledgerCategory,type LedgerFlow} from '../../../shared/ledger';
import {Icon} from './Icon';
import {koreaToday} from '../../../shared/schedules';
const wonFormat=new Intl.NumberFormat('ko-KR');
const tenThousandsFormat=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const won=(amount:number)=>wonFormat.format(amount)+'원';
const short=(amount:number)=>amount>=10000?tenThousandsFormat.format(amount/10000)+'만':wonFormat.format(amount);

function LedgerCalendar({month,days,selectedDate,loading,allowMonthChange,openDay}:{
 month:string;days:ReturnType<typeof ledgerMonth>['days'];selectedDate:string|null;loading:boolean;
 allowMonthChange:boolean;openDay:(date:string)=>void;
}){
 const weeks=monthWeeks(month),today=koreaToday(),holidays=useHolidays(month);
 const label=`${Number(month.slice(0,4))}년 ${Number(month.slice(5))}월 가계부 달력`;
 // The week needs room for a holiday badge and up to three lines of amounts and count.
 return <CalendarGrid label={label} weekCount={weeks.length} rowMinimum={days.size?104:undefined}>
  {weeks.map(dates=><CalendarWeek key={dates[0]} dates={dates} month={month} selectedDate={selectedDate}
   today={today} holidayName={holidays.name} openDay={openDay} dayDetails={(date,holiday)=>{
    const entry=days.get(date);
    const name=`${date}${holiday?' '+holiday:''} · 가계부 ${entry?.items.length??0}건`;
    return {
     label:`${name} · 수입 ${won(entry?.income??0)} · 지출 ${won(entry?.expense??0)}`,
     disabled:loading||(!allowMonthChange&&!date.startsWith(month+'-')),
     content:entry&&<div className="ledger-calendar-totals" aria-hidden="true">
      {entry.income>0&&<strong className="ledger-income">+{short(entry.income)}</strong>}
      {entry.expense>0&&<strong className="ledger-expense">−{short(entry.expense)}</strong>}
      <small>{entry.items.length}건</small>
     </div>,
    };
   }}/>)}
 </CalendarGrid>;
}

export function PersonalFees({viewerId,defaultMemberIds,saveDefaultMembers,preview=false,items,members,month,selectedDay,compact=false,loading=false,edit,create,onMonthChange,budgetLogin}:MemberPreferenceProps&{items:WorkspaceItem[];members:WorkspaceMember[];month:string;selectedDay?:string;compact?:boolean;loading?:boolean;edit:(item:WorkspaceItem)=>void;create:(date?:string)=>void;onMonthChange?:(month:string)=>void;refresh?:()=>Promise<void>;budgetLogin?:()=>void}){
 const selection=useMemberPreference(members,{viewerId,defaultMemberIds,saveDefaultMembers});
 const [view,setView]=useState<'calendar'|'ledger'|'stats'>('calendar'),[selectedDate,setSelectedDate]=useState<string|null>(null),[flow,setFlow]=useState<'ALL'|LedgerFlow>('ALL'),[budgetActions,setBudgetActions]=useState<HTMLDivElement|null>(null);
 const filter={flow},summary=ledgerMonth(items,month,selection.memberIds,filter),date=selectedDate?.startsWith(month+'-')?selectedDate:null;
 const openDay=(value:string)=>{
  const nextMonth=value.slice(0,7);
  if(nextMonth!==month)onMonthChange?.(nextMonth);
  setSelectedDate(value);
 };
 const Filter=compact?MemberPreferenceFilter:CalendarMemberPreferenceFilter;
 const memberFilter=<Filter preview={preview} className="fee-member-filters" members={members} selection={selection} label={compact?'오늘 가계부 구성원 필터':'가계부 구성원 필터'}/>;
 const renderMonth=(pageMonth:string)=>{
  const data=ledgerMonth(items,pageMonth,selection.memberIds,filter),fees=data.fees;
  const list=fees.length?<div className="personal-item-list">{[...data.days].map(([day,group])=><section className="ledger-day-group" key={day}><header><h3>{Number(day.slice(5,7))}월 {Number(day.slice(8))}일</h3><span>{group.income>0&&`수입 ${won(group.income)} `}{group.expense>0&&`지출 ${won(group.expense)}`}</span></header>{group.items.map(item=><article className="personal-item personal-tuition-item ledger-entry" key={item.id+item.fee!.month} data-item-id={item.id} data-flow={ledgerFlow(item)}>
   <button type="button" className="personal-item-main direct-item" onClick={()=>edit(item)} aria-label={item.data.title+' '+(item.mine?'수정':'상세')}><span className="personal-item-category">{item.fee!.dueDate} · {ledgerCategory(item).label}{item.data.feeFrequency==='MONTHLY'?' · 매월 반복':''}</span><h3>{item.data.title}</h3><p>{members.find(m=>m.id===(item.data.assigneeId||item.ownerId))?.name||'연결 해제된 구성원'} · 담당 {item.fee!.payerName}</p>{!compact&&item.data.note&&<p className="personal-note-text">{item.data.note}</p>}</button>
   <div className="personal-fee-value ledger-entry-value"><strong className={ledgerFlow(item)==='INCOME'?'ledger-income':'ledger-expense'}>{ledgerFlow(item)==='INCOME'?'+':'−'}{won(item.data.amount||0)}</strong></div>
  </article>)}</section>)}</div>:<button type="button" className="personal-empty direct-empty" aria-label="가계부 등록" onClick={()=>create(date||undefined)}><Icon name="plus"/><span>찾는 내역이 없어요. 새로 추가해 보세요.</span></button>;
  if(compact)return <>{memberFilter}<details className="personal-fee-disclosure"><summary className="personal-fee-summary"><span>{Number(pageMonth.slice(5))}월 지출</span><strong>{won(data.expense)}</strong><span className="fee-disclosure-label">상세 보기<Icon name="chevron"/></span></summary>{list}</details></>;
  return <div className={'personal-fees-content ledger-content'+(view==='calendar'?' ledger-calendar-content':'')}>
   <dl className="ledger-summary" aria-label="조회한 가계부 합계" aria-live="polite">
    <div className="ledger-summary-expense"><dt>지출</dt><dd className="ledger-expense">{loading?'—':won(data.expense)}</dd></div>
    <div><dt>수입</dt><dd className="ledger-income">{loading?'—':won(data.income)}</dd></div>
    <div className="ledger-balance"><dt>잔액</dt><dd className={data.balance<0?'ledger-expense':undefined}>{loading?'—':won(data.balance)}</dd></div>
   </dl>
   {view==='stats'?<LedgerStatistics filter={filter} items={items} month={pageMonth} memberIds={selection.memberIds}/>
    :view==='calendar'?<LedgerCalendar key={pageMonth} month={pageMonth} days={data.days}
     selectedDate={date??selectedDay??null} loading={loading} allowMonthChange={!!onMonthChange} openDay={openDay}/>
    :<section className="tuition-ledger" aria-label="가계부 내역">
      <header><div><h2>이번 달 내역</h2></div><button type="button" className="button compact" onClick={()=>create()}><Icon name="plus"/>추가</button></header>
      {list}
     </section>}
  </div>;
 };
 if(compact)return renderMonth(month);
 return <div className="personal-fees-full ledger-workspace">{memberFilter}<div className="ledger-controls"><div className="ledger-control-buttons"><div className="tuition-view-switch" role="group" aria-label="가계부 보기"><button type="button" aria-pressed={view==='calendar'} onClick={()=>setView('calendar')}><Icon name="calendar"/>달력</button><button type="button" aria-pressed={view==='ledger'} onClick={()=>setView('ledger')}><Icon name="book"/>내역</button><button type="button" aria-pressed={view==='stats'} onClick={()=>setView('stats')}><Icon name="wallet"/>통계</button></div><div className="ledger-flow-filter" role="group" aria-label="보고 싶은 내역">{(['ALL','INCOME','EXPENSE'] as const).map(value=><button type="button" key={value} aria-pressed={flow===value} onClick={()=>setFlow(value)}>{value==='ALL'?'전체':value==='INCOME'?'수입':'지출'}</button>)}</div><div className="ledger-budget-actions" ref={setBudgetActions}/></div></div><LedgerBudget key={(viewerId||'preview')+month+[...selection.memberIds].sort().join(',')} month={month} memberIds={selection.memberIds} expense={ledgerMonth(items,month,selection.memberIds).expense} preview={preview} loading={loading} login={budgetLogin} actionTarget={budgetActions}/>{onMonthChange?<MonthSwipeArea month={month} onChange={onMonthChange}>{renderMonth}</MonthSwipeArea>:renderMonth(month)}{view==='calendar'&&date&&<TuitionDaySheet date={date} items={summary.days.get(date)?.items||[]} members={members} close={()=>setSelectedDate(null)} create={()=>{setSelectedDate(null);create(date);}} edit={item=>{setSelectedDate(null);edit(item);}}/>}</div>;
}
