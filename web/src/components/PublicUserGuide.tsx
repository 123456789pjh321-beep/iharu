import {Link} from 'react-router-dom';
import {Icon} from './Icon';
import {workspaceGuide} from './workspaceGuides';
const paths=['/timetable','/today/calendar','/tuition','/timeline','/chat','/family','/notification-settings','/account'];
export function PublicUserGuide(){return <UserGuideContent/>;}
export function UserGuideContent({plain=false,child=false}:{plain?:boolean;child?:boolean}){
 const sections=paths.map(path=>workspaceGuide(path,child));
 return <div className={plain?'workspace-guide':'public-user-guide market-container'}>{!plain&&<header className="guide-hero"><span className="market-kicker">IHARU GUIDE</span><h1>함께 쓰는 하루,<br/><em>쉽게 시작하세요.</em></h1><p>처음 연결부터 일정 등록까지.<br/>필요한 메뉴의 사용 방법을 바로 찾아보세요.</p><Link className="market-text-link" to="/more">아이하루로 돌아가기 <Icon name="arrow"/></Link></header>}
 <div id="start" className="guide-anchor"/>
 <nav className="user-guide-index" aria-label="사용 가이드 목차">{sections.map(guide=><a key={guide.id} href={'#'+guide.id}><Icon name={guide.steps[0].icon}/>{guide.label}</a>)}<a href="#settings"><Icon name="settings"/>화면 설정</a></nav>
 <div id="schedule" className="guide-anchor"/>{sections.map(guide=><section key={guide.id} id={guide.id} className="user-guide-section"><h2><Icon name={guide.steps[0].icon}/>{guide.label}</h2><ol>{guide.steps.map((step,index)=><li key={step.title}><span className="guide-step-number">{String(index+1).padStart(2,'0')}</span><div><h3>{step.title}</h3><p>{step.description}</p><ul>{step.tips.map(tip=><li key={tip}>{tip}</li>)}</ul></div></li>)}</ol>{guide.id==='fees'&&<p className="user-guide-note">가계부는 일반사용자 계정에서 이용합니다. 기록으로 실제 결제가 진행되지는 않아요.</p>}{guide.id==='account'&&<p className="user-guide-note">어린이 계정에서는 이름·아이디 확인과 로그아웃을 할 수 있어요.</p>}</section>)}
 <div id="updates" className="guide-anchor"/><section id="settings" className="user-guide-section"><h2><Icon name="settings"/>화면 설정과 더보기</h2><p>하단의 더보기에서 그룹 관리, 알림설정, 설정, 사용 가이드와 공지사항을 찾을 수 있어요. 자주 쓰는 시간표·달력·가계부·타임라인·대화는 하단 메뉴에서 바로 열어요.</p><ol><li><span className="guide-step-number">01</span><div><h3>편안한 밝기로 바꾸기</h3><p>더보기 → 설정 → 화면 밝기에서 밝게 또는 어둡게를 선택하세요. 이 기기에 선택이 저장됩니다.</p></div></li><li><span className="guide-step-number">02</span><div><h3>움직임 줄이기</h3><p>설정의 움직임 줄이기를 켜면 전환 효과 없이 바로 이동해요. 기기의 동작 줄이기 설정도 적용됩니다.</p></div></li><li><span className="guide-step-number">03</span><div><h3>옆 화면을 미리 보며 이동하기</h3><p>달력·가계부·타임라인을 좌우로 밀면 이전·다음 기간이 이어져 보여요. 짧게 밀다 놓으면 원래 화면으로 돌아옵니다. 위아래 스크롤과 날짜 누르기도 그대로 사용할 수 있어요.</p></div></li></ol></section>
 {!plain&&<div className="user-guide-footer"><strong>그룹과 연결하면 더 편해요.</strong><p>같은 그룹으로 연결하려면 그룹 초대를, 시간표를 공유하려면 일반 초대를 선택하세요.</p><Link className="market-text-link" to="/timetable">아이하루 시작하기 <Icon name="arrow"/></Link></div>}
 </div>;}
