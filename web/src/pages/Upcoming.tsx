import {KakaoMap} from '../maps/KakaoMap';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
const info:Record<string,{title:string;body:string;icon:IconName}> = {
  '/chat':{title:'그림과 글로, 가족 대화',body:'아이별 대화방에서 짧은 글과 그림으로 소식을 주고받아요. 가족 메시지 전송 기능을 준비하고 있어요.',icon:'chat'},
  '/child/chat':{title:'그림으로 마음을 전해요',body:'가족과 연결되면 그림을 고르고, 보낼 말을 확인한 뒤 보낼 수 있어요.',icon:'chat'},
  '/location':{title:'공유한 위치를 한눈에',body:'카카오 지도에서 지역을 살펴보세요. 현재 지도에는 제주 예시 지점만 표시하며, 실제 아이 위치는 수집하지 않아요.',icon:'pin'},
  '/records':{title:'차곡차곡 쌓이는 하루',body:'도착·출발 기록과 학습 메모를 이곳에 모아요. 기록 작성 기능을 준비하고 있어요.',icon:'book'},
  '/repeats':{title:'한 번 등록해, 매주 편하게',body:'학교와 학원 일정을 요일별로 반복하고 휴강·보강을 따로 관리할 수 있어요. 지금은 화면을 준비하고 있어요.',icon:'repeat'},
  '/notifications':{title:'가족의 새로운 소식',body:'일정과 대화의 새 소식을 이곳에서 확인해요. 알림 수신 기능을 준비하고 있어요.',icon:'bell'},
  '/tuition':{title:'한눈에 보는 학원비',body:'매달 학원비와 납부 기록을 모아 볼 수 있도록 준비하고 있어요. 현재 금액을 입력하거나 결제하는 기능은 제공하지 않아요.',icon:'wallet'},
  '/settings':{title:'우리 가족에게 맞게',body:'가족 연결, 기기 관리와 알림 설정을 준비하고 있어요. 큰 글씨는 화면 상단에서 바로 바꿀 수 있어요.',icon:'settings'},
};
export function Upcoming() {
  const {pathname}=useLocation(); const item=info[pathname];
  return <div className="upcoming-page"><span className="upcoming-icon"><Icon name={item?.icon || 'home'}/></span><p className="eyebrow">{item?'연결 준비 중':'페이지를 찾을 수 없어요'}</p><h1>{item?.title || '우리 가족의 하루로 돌아갈까요?'}</h1><p>{item?.body || '주소를 다시 확인하거나 홈으로 이동해 주세요.'}</p>
    {pathname==='/location'&&<><KakaoMap/><Link className="button" to="/test/location">예시 위치 전송 테스트</Link></>}
    {pathname.includes('chat') && <div className="sticker-teaser" aria-label="그림 메시지 예시"><span><b aria-hidden="true">👋</b>안녕!</span><span><b aria-hidden="true">🥰</b>사랑해요</span><span><b aria-hidden="true">🏠</b>집에 왔어요</span></div>}
    <Link to={pathname.startsWith('/child')?'/child':'/today'} className="button primary">{pathname.startsWith('/child')?'내 하루로 돌아가기':'오늘 화면으로 돌아가기'}<Icon name="arrow"/></Link>
  </div>;
}

