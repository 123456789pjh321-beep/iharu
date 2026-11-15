import {LedgerBudget} from './LedgerBudget';
import {LedgerStatistics} from './LedgerStatistics';
import {LedgerCalculator} from './LedgerCalculator';
import {WorkspaceTopBarActions} from './WorkspaceTopBar';
import {TuitionDaySheet} from './TuitionDaySheet';
import {useState} from 'react';
import {MonthSwipeArea} from './MonthSwipeArea';
import {MemberPreferenceFilter,useMemberPreference,type MemberPreferenceProps} from './MemberPreferenceFilter';
import {CalendarMemberPreferenceFilter} from './CalendarMemberPreferenceFilter';
import {CalendarGrid,CalendarWeek,monthWeeks} from './CalendarGrid';
import {useHolidays} from './useHolidays';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {ledgerMonth,ledgerFlow,ledgerCategory,ledgerCategories,ledgerMethodLabels,ledgerWon as won,type LedgerCategory,type LedgerEntryPreset,type LedgerFlow} from '../../../shared/ledger';
import {Icon} from './Icon';
import {koreaToday} from '../../../shared/schedules';
const wonFormat=new Intl.NumberFormat('ko-KR');
const tenThousandsFormat=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
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

const ledgerViews=[
 ['calendar','달력','calendar'],['ledger','내역','checklist'],['graph','그래프','graph'],['calculator','계산기','calculator'],
] as const;
type LedgerView=typeof ledgerViews[number][0];
type TransactionCategory=LedgerCategory|'ALL';
type LedgerMonthData=ReturnType<typeof ledgerMonth>;
type ListOrder='oldest'|'newest';

function LedgerEntries({data,members,order='oldest',compact=false,edit}:{
 data:LedgerMonthData;members:WorkspaceMember[];order?:ListOrder;compact?:boolean;edit:(item:WorkspaceItem)=>void;
}){
 const groups=[...data.days];
 if(order==='newest')groups.reverse();
 return <div className="personal-item-list">{groups.map(([day,group])=><section className="ledger-day-group" key={day}>
  <header>
   <h3>{Number(day.slice(5,7))}월 {Number(day.slice(8))}일</h3>
   <span>{group.income>0&&`수입 ${won(group.income)} `}{group.expense>0&&`지출 ${won(group.expense)}`}</span>
  </header>
  {group.items.map(item=>{
   const incoming=ledgerFlow(item)==='INCOME';
   const member=members.find(m=>m.id===(item.data.assigneeId||item.ownerId));
   const payment=item.data.ledgerMethod&&ledgerMethodLabels[item.data.ledgerMethod];
   return <article className="personal-item personal-tuition-item ledger-entry" key={item.id+item.fee!.month} data-item-id={item.id} data-flow={ledgerFlow(item)}>
    <button type="button" className="personal-item-main direct-item" onClick={()=>edit(item)} aria-label={item.data.title+' '+(item.mine?'수정':'상세')}>
     <span className="personal-item-category">{item.fee!.dueDate} · {ledgerCategory(item).label}{item.data.feeFrequency==='MONTHLY'?' · 매월 반복':''}</span>
     <h3>{item.data.title}</h3>
     <p>{member?.name||'연결 해제된 구성원'} · 담당 {item.fee!.payerName}{payment&&item.data.ledgerMethod!=='OTHER'?' · '+payment:''}</p>
     {!compact&&item.data.note&&<p className="personal-note-text">{item.data.note}</p>}
    </button>
    <div className="personal-fee-value ledger-entry-value"><strong className={incoming?'ledger-income':'ledger-expense'}>{incoming?'+':'−'}{won(item.data.amount||0)}</strong></div>
   </article>;
  })}
 </section>)}</div>;
}

export function PersonalFees({viewerId,defaultMemberIds,saveDefaultMembers,preview=false,items,members,month,selectedDay,compact=false,loading=false,edit,create,onMonthChange,budgetLogin}:MemberPreferenceProps&{
 items:WorkspaceItem[];members:WorkspaceMember[];month:string;selectedDay?:string;compact?:boolean;loading?:boolean;
 edit:(item:WorkspaceItem)=>void;create:(date?:string,preset?:LedgerEntryPreset)=>void;
 onMonthChange?:(month:string)=>void;refresh?:()=>Promise<void>;budgetLogin?:()=>void;
}){
 const selection=useMemberPreference(members,{viewerId,defaultMemberIds,saveDefaultMembers});
 const [view,setView]=useState<LedgerView>('calendar'),[selectedDate,setSelectedDate]=useState<string|null>(null);
 const [flow,setFlow]=useState<'ALL'|LedgerFlow>('ALL'),[budgetActions,setBudgetActions]=useState<HTMLDivElement|null>(null);
 const [query,setQuery]=useState(''),[category,setCategory]=useState<TransactionCategory>('ALL');
 const [order,setOrder]=useState<ListOrder>('oldest'),[filtersOpen,setFiltersOpen]=useState(false);
 const date=selectedDate?.startsWith(month+'-')?selectedDate:null;
 const hasListFilter=!!query.trim()||category!=='ALL';
 const financialFilter={flow};
 const listFilter={flow,category,query};
 const allowedCategories=ledgerCategories.filter(row=>flow==='ALL'||row.flow===flow);
 const today=koreaToday();
 const changingToToday=today.slice(0,7)!==month;
 const summary=ledgerMonth(items,month,selection.memberIds,financialFilter);

 function openDay(value:string){
  const nextMonth=value.slice(0,7);
  if(nextMonth!==month)onMonthChange?.(nextMonth);
  setSelectedDate(value);
 }
 function selectView(next:LedgerView){
  setSelectedDate(null);
  setView(next);
 }
 function selectFlow(next:'ALL'|LedgerFlow){
  setFlow(next);
  if(next!=='ALL'&&category!=='ALL'&&!ledgerCategories.some(row=>row.id===category&&row.flow===next))setCategory('ALL');
 }
 function clearFilters(){
  setQuery('');
  setCategory('ALL');
 }
 function openCategory(nextFlow:LedgerFlow,id:LedgerCategory,pageMonth:string){
  selectFlow(nextFlow);
  setCategory(id);
  setQuery('');
  setFiltersOpen(true);
  if(pageMonth!==month)onMonthChange?.(pageMonth);
  selectView('ledger');
 }

 const Filter=compact?MemberPreferenceFilter:CalendarMemberPreferenceFilter;
 const memberFilter=<Filter preview={preview} className="fee-member-filters" members={members} selection={selection} label={compact?'오늘 가계부 구성원 필터':'가계부 구성원 필터'}/>;
 const empty=<button type="button" className="personal-empty direct-empty" aria-label="가계부 등록" onClick={()=>create(date||undefined)}>
  <Icon name="plus"/><span>찾는 내역이 없어요. 새로 추가해 보세요.</span>
 </button>;

 if(compact)return <>{memberFilter}<details className="personal-fee-disclosure">
  <summary className="personal-fee-summary"><span>{Number(month.slice(5))}월 지출</span><strong>{won(summary.expense)}</strong><span className="fee-disclosure-label">상세 보기<Icon name="chevron"/></span></summary>
  {summary.fees.length?<LedgerEntries data={summary} members={members} compact edit={edit}/>:empty}
 </details></>;

 const renderMonth=(pageMonth:string)=>{
  const data=ledgerMonth(items,pageMonth,selection.memberIds,view==='ledger'?listFilter:financialFilter);
  return <div className={'personal-fees-content ledger-content'+(view==='calendar'?' ledger-calendar-content':'')}>
   <dl className="ledger-summary" aria-label="조회한 가계부 합계" aria-live="polite">
    <div className="ledger-summary-expense"><dt>지출</dt><dd className="ledger-expense">{loading?'—':won(data.expense)}</dd></div>
    <div><dt>수입</dt><dd className="ledger-income">{loading?'—':won(data.income)}</dd></div>
    <div className="ledger-balance"><dt>잔액</dt><dd className={data.balance<0?'ledger-expense':undefined}>{loading?'—':won(data.balance)}</dd></div>
   </dl>
   {view==='calendar'?<LedgerCalendar key={pageMonth} month={pageMonth} days={data.days} selectedDate={date??selectedDay??null}
    loading={loading} allowMonthChange={!!onMonthChange} openDay={openDay}/>
    :view==='graph'?<LedgerStatistics items={items} month={pageMonth} memberIds={selection.memberIds} filter={financialFilter}
     onCategory={(selectedFlow,id)=>openCategory(selectedFlow,id,pageMonth)} engineEnabled={pageMonth===month}/>
    :<section className="tuition-ledger" aria-label="가계부 내역">
     <header><div><h2>이번 달 내역</h2></div>
      <button type="button" className="button compact" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(open=>!open)}>
       <Icon name="filter"/>필터{hasListFilter&&<span className="ledger-filter-dot" aria-label="적용됨"/>}
      </button>
      <button type="button" className="button compact" onClick={()=>create()}><Icon name="plus"/>추가</button>
     </header>
     {filtersOpen&&<div className="ledger-list-filters">
      <label>내역 검색<input type="search" maxLength={80} value={query} onChange={event=>setQuery(event.target.value)} placeholder="내용 또는 메모"/></label>
      <label>분류<select value={category} onChange={event=>setCategory(event.target.value as TransactionCategory)}>
       <option value="ALL">전체 분류</option>
       {allowedCategories.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>
      <label>정렬<select value={order} onChange={event=>setOrder(event.target.value as ListOrder)}>
       <option value="oldest">오래된순</option><option value="newest">최신순</option>
      </select></label>
      {hasListFilter&&<button type="button" className="button compact" onClick={clearFilters}>필터 초기화</button>}
     </div>}
     {data.fees.length?<LedgerEntries data={data} members={members} order={order} edit={edit}/>
      :hasListFilter?<p className="ledger-filter-empty" role="status">조건에 맞는 내역이 없어요.</p>:empty}
    </section>}
  </div>;
 };
 return <div className="personal-fees-full ledger-workspace">
  {memberFilter}
  <WorkspaceTopBarActions label="가계부 보기">
   {ledgerViews.map(([id,name,icon])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>selectView(id)}>
    <Icon name={icon}/><span>{name}</span>
   </button>)}
  </WorkspaceTopBarActions>
  <div hidden={view==='calculator'}>
   <div className="ledger-controls">
    <div className="ledger-flow-filter" role="group" aria-label="보고 싶은 내역">
     {(['ALL','INCOME','EXPENSE'] as const).map(value=><button type="button" key={value} aria-pressed={flow===value} onClick={()=>selectFlow(value)}>
      {value==='ALL'?'전체':value==='INCOME'?'수입':'지출'}
     </button>)}
    </div>
    {view==='calendar'&&<button type="button" className="button compact ledger-today" disabled={loading||changingToToday&&!onMonthChange} onClick={()=>openDay(today)}>오늘</button>}
    <div className="ledger-budget-actions" ref={setBudgetActions}/>
   </div>
   <LedgerBudget key={(viewerId||'preview')+month+[...selection.memberIds].sort().join(',')} month={month} memberIds={selection.memberIds}
    expense={flow==='ALL'?summary.expense:ledgerMonth(items,month,selection.memberIds).expense}
    preview={preview} loading={loading} login={budgetLogin} actionTarget={budgetActions}/>
   {view!=='calculator'&&(onMonthChange?<MonthSwipeArea month={month} onChange={onMonthChange}>{renderMonth}</MonthSwipeArea>:renderMonth(month))}
  </div>
  <LedgerCalculator hidden={view!=='calculator'} onUse={preset=>create(undefined,preset)}/>
  {view==='calendar'&&date&&<TuitionDaySheet date={date} items={summary.days.get(date)?.items||[]} members={members}
   close={()=>setSelectedDate(null)} create={()=>{setSelectedDate(null);create(date);}} edit={item=>{setSelectedDate(null);edit(item);}}/>}
 </div>;
}
