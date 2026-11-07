import { Link } from 'react-router-dom';
import type { SignedInSession } from '../auth';
import { Card } from '../components/Common';
import { DailyWorkspace } from './Daily';
import { Icon } from '../components/Icon';
import {Entrance} from '../components/Experience';

/** Signed-in entry point. Family data stays behind its existing server permissions. */
export function Home({session}:{session:SignedInSession}) {
  return <Entrance className="family-home-experience">
    <div className="home-overview-label"><Icon name="sun"/><span>FAMILY OVERVIEW</span><span className="home-overview-caption">우리 가족의 하루</span></div><div className="page-heading home-heading"><div><p className="eyebrow">우리 가족의 하루</p><h1>오늘도 함께 챙겨요<span className="home-title-dot" aria-hidden="true">.</span></h1><p className="page-subtitle">{session.name||'보호자'}님, 반가워요. 가족의 일정과 연결 상태를 확인하세요.</p></div><Link className="button primary" to="/family"><Icon name="home"/>우리 가족 관리</Link></div>
    <nav className="subnav" aria-label="오늘 화면 보기"><Link to="/today" aria-current="page">한눈에</Link><Link to="/today/calendar">월간 일정</Link><Link to="/today/repeats">반복 일정</Link><Link to="/tuition">학원비</Link></nav>
    {!session.accessReady&&<section className="home-setup experience-setup" aria-label="가족 연결 안내"><span className="badge green"><Icon name="check"/>로그인 완료</span><h2>가족과 함께할 준비를 해요</h2><p>메인 화면에 들어왔어요. 아이 정보를 열려면 이메일 확인과 보호자 확인이 필요해요. 가족 관리에서 현재 연결 상태를 확인할 수 있어요.</p><Link className="text-link" to="/family">연결 상태 확인<Icon name="arrow"/></Link></section>}
    {session.accessReady?<DailyWorkspace/>:<div className="home-cards">
      <Card title="오늘의 등하원" icon="bag"><p className="section-description">학교와 학원에 가는 시간을 가족 달력에서 확인하세요. 가족 연결 후 도착·출발 기록을 남길 수 있어요.</p><div className="card-actions"><Link className="button primary" to="/today/calendar">오늘 일정 보기<Icon name="arrow"/></Link></div></Card>
      <Card title="우리 가족 달력" icon="calendar"><p className="section-description">매주 반복되는 일정과 휴강·보강을 관리해요. 승인된 가족과 아이의 일정만 표시해요.</p><div className="card-actions"><Link className="button" to="/today/calendar">가족 달력 열기</Link><Link className="button" to="/today/repeats">반복 일정</Link></div></Card>
      <Card title="아이 위치" icon="pin" action={<span className="badge soft">준비 중</span>}><p className="section-description">위치 공유 기능을 준비하고 있어요. 현재 아이의 위치를 수집하거나 표시하지 않아요.</p><div className="card-actions"><Link className="button" to="/location">위치 공유 안내</Link></div></Card>
    </div>}
    <section className="home-shortcuts" aria-label="다른 메뉴"><span className="shortcut-caption">자주 찾는 메뉴</span><Link className="button" to="/chat"><Icon name="chat"/>가족 대화</Link><Link className="button" to="/tuition"><Icon name="wallet"/>학원비 · 준비 중</Link><Link className="button" to="/account"><Icon name="settings"/>내 계정</Link></section>
  </Entrance>;
}

