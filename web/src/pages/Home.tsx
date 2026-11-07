import {WorkspaceTabs} from '../components/WorkspaceTabs';
import { Link } from 'react-router-dom';
import type { SignedInSession } from '../auth';
import { Card } from '../components/Common';
import { DailyWorkspace } from './Daily';
import { Icon } from '../components/Icon';
import {Entrance} from '../components/Experience';

/** Signed-in entry point. Family data stays behind its existing server permissions. */
export function Home({session}:{session:SignedInSession}) {
  return <Entrance className="family-home-experience">
    <div className="workspace-page-heading"><div><span className="workspace-module">OVERVIEW</span><h1>오늘도 함께 챙겨요<span className="home-title-dot" aria-hidden="true">.</span></h1><p>{session.name||'보호자'}님, 가족의 일정과 연결 상태를 한눈에 확인하세요.</p></div><Link className="button" to="/family"><Icon name="shield"/>우리 가족 관리<Icon name="arrow"/></Link></div>
    <section className="workspace-metrics" aria-label="가족 현황 바로가기">
      {[{to:'/today/calendar',icon:'bag' as const,label:'오늘의 등하원',value:session.accessReady?'오늘 일정':'연결 후 확인',note:'학교와 학원을 오가는 하루',tag:'DAILY'},
        {to:'/today/calendar',icon:'calendar' as const,label:'우리 가족 달력',value:'월간 일정',note:'일정과 반복 계획을 함께',tag:'CALENDAR'},
        {to:'/family',icon:'shield' as const,label:'가족 연결',value:session.accessReady?'연결 완료':'연결 준비',note:session.accessReady?'공유 범위 안에서 안전하게':'계정 확인과 가족 연결이 필요해요',tag:'FAMILY'},
        {to:'/chat',icon:'chat' as const,label:'가족 대화',value:session.accessReady?'대화방 열기':'대화 준비',note:'짧은 소식도, 그림으로 쉽게',tag:'MESSAGE'}].map(item=><Link className="workspace-metric" to={item.to} key={item.tag}><div className="metric-top"><span>{item.label}</span><Icon name={item.icon}/></div><strong>{item.value}</strong><p>{item.note}</p><div className="metric-foot"><span>{item.tag}</span><Icon name="arrow"/></div></Link>)}
    </section>
    <WorkspaceTabs group="day"/>
    {!session.accessReady&&<section className="home-setup experience-setup" aria-label="가족 연결 안내"><div className="setup-symbol"><Icon name="shield"/></div><div className="setup-copy"><span className="workspace-module">GET STARTED</span><span className="setup-login-status"><Icon name="check"/>로그인 완료</span><h2>가족과 함께할 준비를 해요</h2><p>자녀 기기에서 이름과 비밀번호로 가입한 뒤, 가족 관리에서 자녀의 6자리 번호를 입력해 주세요.</p></div><div className="setup-checks"><span className={session.emailVerified?'complete':''}><Icon name={session.emailVerified?'check':'clock'}/>{session.emailVerified?'이메일 확인 완료':'이메일 확인'}</span><span><Icon name="shield"/>자녀 번호 확인 · 가족 연결</span></div><Link className="button primary" to="/family">연결 상태 확인<Icon name="arrow"/></Link></section>}
    {session.accessReady?<DailyWorkspace/>:<div className="home-cards">
      <Card title="오늘의 등하원" icon="bag"><p className="section-description">학교와 학원에 가는 시간을 가족 달력에서 확인하세요. 가족 연결 후 도착·출발 기록을 남길 수 있어요.</p><div className="card-actions"><Link className="button primary" to="/today/calendar">오늘 일정 보기<Icon name="arrow"/></Link></div></Card>
      <Card title="우리 가족 달력" icon="calendar"><p className="section-description">매주 반복되는 일정과 휴강·보강을 관리해요. 승인된 가족과 아이의 일정만 표시해요.</p><div className="card-actions"><Link className="button" to="/today/calendar">가족 달력 열기</Link><Link className="button" to="/today/repeats">반복 일정</Link></div></Card>
      <Card title="아이 위치" icon="pin" action={<span className="badge soft">준비 중</span>}><p className="section-description">위치 공유 기능을 준비하고 있어요. 현재 아이의 위치를 수집하거나 표시하지 않아요.</p><div className="card-actions"><Link className="button" to="/location">위치 공유 안내</Link></div></Card>
    </div>}
    <section className="home-shortcuts" aria-label="다른 메뉴"><span className="shortcut-caption">자주 찾는 메뉴</span><Link className="button" to="/chat"><Icon name="chat"/>가족 대화</Link><Link className="button" to="/tuition"><Icon name="wallet"/>학원비 · 준비 중</Link><Link className="button" to="/account"><Icon name="settings"/>내 계정</Link></section>
  </Entrance>;
}


