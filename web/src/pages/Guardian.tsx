import { Link, useLocation } from 'react-router-dom';
import { dashboardSchema, envelope, type ChildFilter, type Dashboard } from '../../../shared/contracts';
import { useApi } from '../api';
import { copy } from '../copy';
import { Icon } from '../components/Icon';
import { Card, Loading, ErrorState } from '../components/Common';
import { Calendar } from '../components/Calendar';
const schema = envelope(dashboardSchema);
const won = (n:number) => new Intl.NumberFormat('ko-KR').format(n);
export const children = [ {id:'all',name:'모든 아이'}, {id:'demo-seojun',name:'서준'}, {id:'demo-seoha',name:'서하'} ] as const;

export function Guardian({ child, setChild, onPreview }: { child:ChildFilter; setChild:(child:ChildFilter) => void; onPreview:(title:string) => void }) {
  const location = useLocation();
  const view = location.pathname;
  const { data, loading, error, retry } = useApi(`/api/demo/dashboard?child=${child}&month=2026-09`, schema);
  return <>
    <div className="page-heading"><div><p className="eyebrow">우리 그룹의 하루</p><h1>{view==='/calendar'?'함께 챙기는 그룹 일정':view==='/tuition'?'한눈에 보는 학원비':copy.guardianTitle}</h1><p className="page-subtitle">{view==='/calendar'?'학교와 학원, 그룹의 약속을 모아 보세요.':view==='/tuition'?'이달의 계획과 납부 기록을 함께 확인하세요.':copy.guardianSubtitle}</p></div><button className="button primary add-top" onClick={() => onPreview('그룹 일정 추가')}><Icon name="plus"/>일정 추가</button></div>
    <div className="family-filter"><div className="filter-buttons" aria-label="아이 선택">{children.map(c => <button key={c.id} aria-pressed={child===c.id} className={`child-chip ${child===c.id?'active':''}`} onClick={() => setChild(c.id)}>{c.id!=='all' && <span aria-hidden="true" className={`avatar small ${c.id==='demo-seojun'?'mint':'peach'}`}>{c.name[0]}</span>}{c.name}</button>)}</div><span className="sample-date"><Icon name="calendar"/>2026. 9. 17. 목요일 · 예시</span></div>
    <nav className="subnav" aria-label="오늘 화면 보기">{[['/today','한눈에'],['/calendar','월간 일정'],['/tuition','학원비'],['/repeats','반복 일정']].map(([url,label]) => <Link key={url} to={url} aria-current={view===url?'page':undefined}>{label}</Link>)}</nav>
    {view==='/calendar' ? <Card title={copy.calendar} icon="calendar" className="standalone-calendar"><Calendar child={child} onPreview={onPreview}/></Card> : loading ? <Loading/> : error ? <ErrorState message={error} retry={retry}/> : data ? view==='/tuition' ? <Tuition data={data.data} onPreview={onPreview}/> : <>
      <div className="dashboard-grid">
        <Card title={copy.attendance} icon="bag" className="attendance-card" action={<span className="badge soft">예시 일정 {data.data.events.filter(e=>e.date==='2026-09-17').length}개</span>}>
          <p className="section-description">오늘의 이동 일정</p><div className="attendance-list">{data.data.events.filter(e => e.date==='2026-09-17').map(e => { const kid=data.data.children.find(c=>c.id===e.childId)!; return <div className="attendance-row" key={e.id}>
            <div className="attendance-time"><strong>{e.start}</strong><span>{e.end}</span></div><div className={`timeline-marker ${e.status==='completed'?'complete':''}`}><span/></div>
            <div className="attendance-content"><div><span className={`child-label ${kid.color}`}>{kid.name}</span><strong>{e.title}</strong></div><p>{e.place}</p></div><span className={`badge ${e.status==='completed'?'green':'soft'}`}>{e.status==='completed'?'도착 예시':e.status==='check'?'진행 확인 필요':'예정'}</span>
          </div>; })}</div>
          {data.data.events.filter(e=>e.date==='2026-09-17').length===0&&<p>등록된 일정이 없어요. 서하 일정은 아직 전달받지 않았어요.</p>}<div className="card-actions"><button className="button primary" onClick={() => onPreview('도착·출발 기록')}><Icon name="check"/>도착·출발 기록</button><Link className="button" to="/chat"><Icon name="chat"/>그룹에게 말하기</Link></div>
        </Card>
        <Card title={copy.calendar} icon="calendar" className="family-calendar" action={<Link to="/calendar" className="text-link">크게 보기<Icon name="chevron"/></Link>}><Calendar child={child} onPreview={onPreview}/></Card>
      </div><Tuition data={data.data} onPreview={onPreview}/>
    </> : null}
  </>;
}
function Tuition({ data, onPreview }: { data:Dashboard; onPreview:(s:string)=>void }) {
  const total=data.tuition.reduce((s,t)=>s+t.amount,0); const paid=data.tuition.filter(t=>t.paid).reduce((s,t)=>s+t.amount,0);
  return <Card title="이달의 학원비" icon="wallet" className="tuition-card" action={<span className="badge soft">9월 예시</span>}>
    <div className="fee-overview"><div><p>이번 달 계획</p><strong className="fee-total">{data.tuition.length?<>{won(total)}<span>원</span></>:'금액 미등록'}</strong></div><div><p>납부 기록</p><strong>{won(paid)}원</strong></div><div><p>남은 금액</p><strong className="amber-text">{won(total-paid)}원</strong></div></div>
    <div className="fee-items">{data.tuition.map(t=><button key={t.title} className="fee-item" onClick={()=>onPreview(`${t.title} 납부 기록`)}><span><strong>{t.title}</strong><small>{data.children.find(c=>c.id===t.childId)?.name}</small></span><span><strong>{won(t.amount)}원</strong><small className={t.paid?'green-text':'amber-text'}>{t.paid?'납부 기록 예시':'납부 예정'}</small></span><Icon name="chevron"/></button>)}</div>
    <p className="fine-print">그룹이 직접 기록하는 장부예요. 실제 결제는 진행되지 않아요.</p>
  </Card>;
}

