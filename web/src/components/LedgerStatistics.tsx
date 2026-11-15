import type {WorkspaceItem} from '../../../shared/workspace';
import {ledgerStatistics,ledgerWon as won,type LedgerCategory,type LedgerCategoryTotal,type LedgerFilter,type LedgerFlow} from '../../../shared/ledger';
import {GraphicRing,type RingSlice} from './GraphicRing';
import {Icon} from './Icon';

const chartColors=['#168575','#456eaa','#ae5f82','#b17a30','#7b6fb0','#488da2','#bc6048','#598854','#885b9b','#3e7d94'];
const percent=new Intl.NumberFormat('ko-KR',{style:'percent',maximumFractionDigits:1});

function CategoryChart({title,flow,total,rows,onSelect,engineEnabled}:{title:string;flow:LedgerFlow;total:number;rows:LedgerCategoryTotal[];onSelect:(flow:LedgerFlow,id:LedgerCategory)=>void;engineEnabled:boolean}){
 let position=0;
 const slices:RingSlice[]=rows.map((row,index)=>{
  const from=position;
  position+=total?row.amount/total:0;
  return {id:row.id,from,to:Math.min(position,1),lane:0,color:chartColors[index%chartColors.length]};
 });
 return <section className="ledger-stat-card">
  <h3>{title}</h3>
  {total>0?<div className="ledger-category-chart">
   <GraphicRing slices={slices} label={title+' 원형 그래프'} engineEnabled={engineEnabled} onSelect={id=>{
    const category=rows.find(row=>row.id===id);
    if(category)onSelect(flow,category.id);
   }} center={<><small>{flow==='INCOME'?'총수입':'총지출'}</small><strong>{won(total)}</strong></>}/>
   <ul>
    {rows.map((row,index)=><li key={row.id}><button type="button" onClick={()=>onSelect(flow,row.id)}>
     <span className="ledger-chart-key" style={{background:chartColors[index%chartColors.length]}}/>
     <span>{row.label}</span>
     <span className="ledger-chart-value"><strong>{won(row.amount)}</strong><small>{percent.format(row.amount/total)}</small></span>
     <Icon name="chevron"/>
    </button></li>)}
   </ul>
  </div>:<p>표시할 {flow==='INCOME'?'수입':'지출'}이 없어요.</p>}
 </section>;
}

function comparison(amount:number,previous:number,flow:LedgerFlow){
 const label=flow==='INCOME'?'수입':'지출',difference=amount-previous;
 if(!previous)return amount?'지난달 '+label+' 내역이 없어요.':'이번 달과 지난달 '+label+'이 없어요.';
 if(!difference)return '지난달과 '+label+'이 같아요.';
 const action=flow==='INCOME'?'받았어요':'썼어요';
 return `지난달보다 ${won(Math.abs(difference))} ${difference>0?'더':'덜'} ${action}`;
}

export function LedgerStatistics({items,month,memberIds,filter,onCategory,engineEnabled}:{items:WorkspaceItem[];month:string;memberIds:string[];filter:LedgerFilter;onCategory:(flow:LedgerFlow,id:LedgerCategory)=>void;engineEnabled:boolean}){
 const data=ledgerStatistics(items,month,memberIds,filter);
 const previous=data.trend[1],showIncome=filter.flow!=='EXPENSE',showExpense=filter.flow!=='INCOME';
 const series=(['income','expense'] as const).filter(key=>key==='income'?showIncome:showExpense);
 const maximum=Math.max(1,...data.trend.flatMap(row=>series.map(key=>row[key])));
 return <section className="ledger-statistics" aria-label="가계부 그래프">
  <p className="ledger-comparison">{showExpense?comparison(data.expense,previous.expense,'EXPENSE'):comparison(data.income,previous.income,'INCOME')}</p>
  <div className="ledger-stat-grid">
   {showExpense&&<CategoryChart title="어디에 썼나요?" flow="EXPENSE" total={data.expense} rows={data.categories} onSelect={onCategory} engineEnabled={engineEnabled}/>}
   {showIncome&&<CategoryChart title="어디에서 받았나요?" flow="INCOME" total={data.income} rows={data.incomeCategories} onSelect={onCategory} engineEnabled={engineEnabled}/>}
  </div>
  <section className="ledger-stat-card">
   <h3>최근 3개월 {showIncome&&showExpense?'수입·지출':showIncome?'수입':'지출'}</h3>
   {data.trend.map(row=><div className="ledger-trend-row" key={row.month}>
    <strong>{row.month.replace('-','.')}월</strong>
    <div>{series.map(key=><div className={'ledger-trend-value '+(key==='income'?'ledger-income':'ledger-expense')} key={key}>
     <i style={{width:row[key]/maximum*100+'%'}}/>
     <span>{key==='income'?'수입':'지출'} {won(row[key])}</span>
    </div>)}</div>
   </div>)}
  </section>
  {showExpense&&<section className="ledger-stat-card">
   <h3>어떻게 결제했나요?</h3>
   {data.expense>0?data.payments.map(row=><div className="ledger-category-bar" key={row.label}>
    <span>{row.label}</span><div><i style={{width:row.amount/data.expense*100+'%'}}/></div>
    <strong>{won(row.amount)}<small>{percent.format(row.amount/data.expense)}</small></strong>
   </div>):<p>표시할 결제 내역이 없어요.</p>}
  </section>}
 </section>;
}
