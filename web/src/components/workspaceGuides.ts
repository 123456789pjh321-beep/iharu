import type {IconName} from './Icon';
type GuideStep={title:string;icon:IconName;description:string;tips:string[]};
type Guide={id:string;label:string;steps:GuideStep[]};
const timetable:Guide={id:'timetable',label:'시간표',steps:[
 {title:'매주 반복되는 일정을 한눈에',icon:'clock',description:'학교와 학원처럼 매주 같은 요일에 이어지는 일정을 관리해요. 일요일부터 토요일까지 고정된 시간표로 보여요.',tips:['요일 아래 빈 시간 칸을 누르면 반복 일정을 등록할 수 있어요.','일정 등록에서 그룹 구성원과 반복 요일, 시작·종료 시간을 선택해요.']},
 {title:'보고 싶은 그룹만 골라요',icon:'users',description:'이름 버튼을 누르면 여러 명의 시간표를 함께 볼 수 있어요. 선택한 이름은 첫 화면 설정 버튼에도 표시돼요.',tips:['선택한 이름을 다시 누르면 해제돼요. 최소 한 명은 선택해 주세요.','공간이 부족하면 +N명 버튼에서 다른 그룹을 선택해요. 저장 버튼은 오른쪽에 있어요.','첫 화면으로 저장하면 다음 접속에도 이 조합이 열려요. 달력과 가계부의 선택은 각각 따로 저장돼요.']},
 {title:'현재 시간과 수업을 바로 확인해요',icon:'clock',description:'시간표를 열면 현재 시간 근처를 보여줘요. 시간 눈금과 선으로 지금 위치를 확인할 수 있어요.',tips:['일정 블록을 누르면 상세를 확인하고, 수정 권한이 있는 일정은 고칠 수 있어요.','행사·여행·기념일처럼 날짜가 있는 약속은 달력에 등록해 주세요.']},
]};
const calendar:Guide={id:'calendar',label:'달력',steps:[
 {title:'약속과 기념일을 달력에 담아요',icon:'calendar',description:'달력은 날짜가 정해진 행사·여행·기념일을 관리하는 공간이에요. 시간표의 학교·학원 일정과는 별도로 저장돼요.',tips:['날짜를 누르고 이 날짜에 일정 추가를 선택해요.','시작일과 종료일을 정해 여러 날의 일정을 등록할 수 있어요. 기본값은 같은 날이에요.']},
 {title:'기간·시간·반복을 편하게 정해요',icon:'repeat',description:'종일 일정이나 시작·종료 시간이 있는 일정을 등록할 수 있어요. 필요하면 매일·매주·매월·매년 반복을 선택해요.',tips:['달력 선택과 빠른 날짜 버튼으로 기간을 정해요. 시간을 정할 때는 소요 시간 버튼도 사용할 수 있어요.','등록한 일정을 눌러 내용을 확인하고 수정해요. 공휴일도 날짜 칸에서 확인할 수 있어요.']},
 {title:'그룹별로, 원하는 보기로',icon:'users',description:'월간·주간·일간 보기를 바꾸고 이름 버튼으로 함께 볼 그룹을 골라요.',tips:['구성원 칩을 가로로 밀어 여러 명을 고를 수 있어요.','오른쪽 구성원 설정에서 전체 선택과 기본 필터 저장을 할 수 있어요. 시간표·가계부 설정과는 별개예요.','일정 변경·미리 알림은 더보기 → 알림설정에서 선택해요.']},
]};
const chat:Guide={id:'chat',label:'대화',steps:[
 {title:'연결된 그룹과 이야기해요',icon:'chat',description:'그룹 전체의 단체 대화와 구성원을 선택한 1:1·단체 대화를 이용할 수 있어요.',tips:['대화할 그룹이 보이지 않으면 더보기 → 그룹 관리에서 연결을 확인해 주세요.','대화방 만들기에서 구성원을 선택하고, 열린 대화방의 입력창에서 메시지를 작성해요.']},
 {title:'글과 그림으로 마음을 전해요',icon:'chat',description:'글을 입력하거나 웃는 얼굴 버튼으로 그림 메시지를 골라 보내세요.',tips:['선택한 내용은 보내기 버튼을 눌러 전달해요.','그림 선택창은 필요할 때만 열고 닫을 수 있어요. 닫으면 대화를 더 넓게 볼 수 있어요.']},
 {title:'필요 없는 대화방에서 나가요',icon:'departure',description:'별도로 만든 1:1·단체방에서 나가기를 누르고 확인하면 내 대화방 목록에서 사라져요. 방을 만든 사람과 초대받은 사람 모두 나갈 수 있어요.',tips:['기본 단체 대화는 유지되며 나가기 버튼이 없어요.','나간 방의 지난 대화는 다시 볼 수 없어요. 다른 참여자의 대화는 유지되며, 두 명 이상 남아 있으면 계속 대화할 수 있어요.']},
 {title:'새 대화를 놓치지 않도록',icon:'bell',description:'새 소식은 메뉴의 알림 점으로 확인할 수 있어요. 기기 알림은 알림설정에서 따로 켤 수 있어요.',tips:['더보기 → 알림설정에서 새 대화 알림과 이 기기 알림을 켜 주세요.','잠금화면에 대화 내용을 보이고 싶지 않으면 알림에 내용 미리 보기를 꺼 주세요.']},
]};
const fees:Guide={id:'fees',label:'가계부',steps:[
 {title:'수입과 지출을 기록해요',icon:'wallet',description:'내용, 금액, 날짜와 분류를 고르면 됩니다. 등록한 금액은 날짜에 맞춰 가계부에 바로 반영돼요.',tips:['날짜에 등록한 금액을 모두 합산해요.','기존 내역을 열고 복사를 누르면 내용을 새 기록에 옮길 수 있어요.']},
 {title:'지출·수입·잔액을 한눈에 봐요',icon:'calendar',description:'잔액은 조회한 수입에서 지출을 뺀 금액이에요. 달력의 날짜를 누르면 그날의 내역과 합계를 확인할 수 있어요.',tips:['구성원 설정에서 전체를 선택하거나 첫 화면의 필터를 저장할 수 있어요.','구성원과 수입·지출 선택은 합계·달력·내역·통계에 함께 적용돼요.']},
 {title:'예산과 소비 흐름을 확인해요',icon:'wallet',description:'나의 월 예산을 정하면 선택한 구성원의 이번 달 전체 지출과 비교해 더 쓸 수 있는 금액을 알려줘요. 예산은 내 계정의 조회 월과 구성원 선택별로 저장돼요.',tips:['통계에서 분류·결제 방법별 지출과 최근 3개월 수입·지출을 확인해요.','내가 작성한 내역은 수정·삭제할 수 있어요. 매달 반복하는 내역은 함께 바뀝니다.']},
]};
const family=(child:boolean):Guide=>({id:'family',label:'그룹 관리',steps:[
 {title:child?'우리 그룹 연결을 확인해요':'초대 링크로 그룹을 연결해요',icon:'users',description:child?'그룹 관리에서 함께 연결된 일반사용자와 그룹을 확인할 수 있어요.':'그룹 호스트가 초대 링크를 만들어 카카오톡이나 문자로 보낼 수 있어요.',tips:child?['보호자가 보낸 어린이 초대 링크를 열고 내 아이디와 암호를 만들어요.','연결할 그룹이 다르면 일반사용자와 먼저 확인해 주세요.']:['그룹 관리에서 초대 대상을 고르고 초대 링크를 만들어요.','일반사용자는 로그인 후 초대를 수락해요. 어린이 링크는 보호자 확인이 끝난 대상에게 만들 수 있어요.']},
 {title:'연결된 그룹과 함께 사용해요',icon:'calendar',description:'연결이 완료되면 그룹의 일정과 대화를 함께 사용할 수 있어요.',tips:['그룹 목록에서 이름과 연결 상태를 확인해 주세요.','그룹 연결을 해제하면 서로의 자료 공유가 중단돼요. 각자의 원본 자료는 유지돼요.']},
]});
const notifications:Guide={id:'notifications',label:'알림설정',steps:[
 {title:'이 기기에 알림을 연결해요',icon:'bell',description:'알림은 사용하는 기기마다 한 번씩 연결해요. 이 기기 알림 켜기를 누르고 기기 또는 브라우저의 권한 요청을 허용해 주세요.',tips:['연결 후 시험 알림 보내기로 수신 상태를 확인해요.','연결 준비 중이거나 지원하지 않는 환경이면 화면의 안내를 확인해 주세요.']},
 {title:'달력과 대화 소식만 골라 받아요',icon:'calendar',description:'일정 등록·변경, 일정 미리 알림, 새 대화 알림을 각각 선택할 수 있어요.',tips:['미리 알림 시간을 고르세요. 종일 일정은 오전 9시를 기준으로 해요.','시간표와 가계부는 푸시 알림 대상이 아니에요. 수신 항목은 계정의 연결 기기에 함께 적용돼요.']},
 {title:'미리 보기와 수신 상태를 확인해요',icon:'shield',description:'알림에 내용 미리 보기를 켜면 제목이나 대화 내용이 잠금화면에 표시될 수 있어요.',tips:['알림이 오지 않으면 기기의 알림 권한·절전·방해금지 설정을 확인해 주세요.','로그아웃하거나 로그인이 만료되면 다시 로그인한 뒤 기기 알림 연결을 확인해 주세요.']},
]};
const account=(child:boolean):Guide=>({id:'account',label:'내 계정',steps:child?[
 {title:'내 계정을 확인해요',icon:'settings',description:'현재 로그인한 이름과 어린이 계정의 아이디를 확인해요.',tips:['다른 그룹의 계정이라면 로그아웃하고 자신의 계정으로 다시 로그인해 주세요.','그룹 연결은 더보기 → 그룹 관리에서 확인할 수 있어요.']},
]:[
 {title:'로그인 방법을 관리해요',icon:'settings',description:'현재 연결된 로그인 방법과 이메일을 확인하고, 사용할 수 있는 다른 로그인 방법을 연결할 수 있어요.',tips:['연결·해제 전에 본인 인증 다시 하기가 필요할 수 있어요.','준비 중인 로그인 방법은 활성화된 뒤 연결할 수 있어요.']},
 {title:'로그인한 기기를 확인해요',icon:'shield',description:'기기별 최근 사용 내역을 확인하고 필요하면 로그아웃할 수 있어요.',tips:['현재 기기를 로그아웃하면 로그인 화면으로 이동해요.','모든 기기에서 로그아웃을 선택하면 다른 기기에서도 다시 로그인이 필요해요.']},
]});
export function workspaceGuide(path:string,child=false):Guide{
 if(path.includes('calendar'))return calendar;
 if(path==='/chat'||path==='/child/chat')return chat;
 if(path==='/tuition')return fees;
 if(path.startsWith('/family'))return family(child);
 if(path.startsWith('/account'))return account(child);
 if(path==='/notification-settings')return notifications;
 return timetable;
}
export function workspaceGuidePath(path:string){return ['/timetable','/today/calendar','/today/repeats','/chat','/child/chat','/tuition','/family','/account','/notification-settings'].includes(path)?path:'/timetable';}
