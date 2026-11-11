/** Public editorial content only. Never put family or account data in this catalog. */
export type PublicPost={slug:string;section:'notices'|'blog';category:string;date:string;title:string;summary:string;art:'chat'|'calendar'|'wallet'|'users';sections:{heading:string;paragraphs:string[];steps?:string[]}[];guide:string};
export const publicPosts:PublicPost[]=[
 {slug:'choose-your-account',section:'notices',category:'업데이트',date:'2026-11-09',title:'그룹 초대와 일반 초대 링크로 시작해요',summary:'그룹에 연결하거나 아이하루 가입 링크를 공유할 수 있어요.',art:'users',guide:'/guide#start',sections:[
  {heading:'그룹 초대로 함께 연결해요',paragraphs:['그룹 관리에서 그룹 초대 링크를 만들고 카카오톡이나 문자로 보내세요. 받은 사람이 로그인하고 초대를 수락하면 그룹의 일정과 대화를 함께 볼 수 있어요.']},
  {heading:'일반 초대로 가입 링크를 보내요',paragraphs:['일반 초대 링크를 열면 아이하루 회원가입 화면으로 이동해요. 가입을 마치면 개인으로 시작할 수 있어요.']}
 ]},
 {slug:'menu-update-dots',section:'notices',category:'업데이트',date:'2026-11-09',title:'그룹의 새 소식, 메뉴의 알림 점으로 확인해요',summary:'새 일정과 대화, 가계부·메모 변경을 메뉴에서 확인하세요. 내용을 확인하면 점이 사라져요.',art:'chat',guide:'/guide#updates',sections:[
  {heading:'새 내용이 있는 메뉴를 알려드려요',paragraphs:['연결된 그룹이 일정이나 대화, 가계부·메모를 등록하거나 바꾸면 관련 메뉴에 작은 알림 점이 표시돼요. 그룹 연결 변경은 그룹 관리에 표시합니다. 메모·그룹 관리에 새 내용이 있으면 전체메뉴에도 점이 나타나요. 내가 직접 작성한 내용은 내 메뉴의 새 소식으로 표시하지 않아요.']},
  {heading:'내용을 확인하면 사라져요',paragraphs:['해당 메뉴의 내용을 불러오면 확인 처리돼요. 전체메뉴를 여는 것만으로 안쪽 메뉴의 점이 사라지지는 않아요. 대화는 최신 메시지까지 내려와 확인했을 때 점이 사라집니다. 확인 상태는 계정에 저장돼 다시 로그인해도 유지됩니다.']},
  {heading:'화면을 사용 중일 때 새 소식을 확인해요',paragraphs:['화면이 열려 있을 때 약 5초 간격으로 변경을 확인합니다. 기기 알림창으로 보내는 푸시 알림과는 별개의 표시예요. 이번 업데이트 이후 생긴 변경부터 표시하며, 연결된 그룹과 본인에게 허용된 메뉴 안에서만 확인할 수 있습니다.']}
 ]},
 {slug:'calendar-recurrence',section:'notices',category:'업데이트',date:'2026-11-09',title:'생일은 매년, 그룹 약속은 매월 반복으로',summary:'달력에서도 매일·매주·매월·매년 반복을 선택할 수 있어요. 학교·학원 시간표와는 따로 관리합니다.',art:'calendar',guide:'/guide#schedule',sections:[
  {heading:'달력 일정에 반복 옵션을 더했어요',paragraphs:['달력에서 일정 등록을 열고 반복 안 함, 매일, 매주, 매월, 매년 중 선택하세요. 매주는 반복할 요일을 고를 수 있고, 종료일은 필요할 때 지정해요. 종료일을 비워 두면 계속 반복됩니다.']},
  {heading:'월말과 윤년은 이렇게 표시해요',paragraphs:['매월은 시작일과 같은 날짜에 표시하며, 그 날짜가 없는 달에는 말일에 표시해요. 매년 2월 29일 일정은 윤년이 아닌 해의 2월 28일에 표시합니다. 다음 달이나 다음 해에는 원래 시작 날짜를 기준으로 계산해요.']},
  {heading:'시간표와 달력은 각각 관리해요',paragraphs:['달력의 반복 일정은 달력에만 표시돼요. 학교·학원처럼 주간 시간 배치가 필요한 일정은 시간표에서 등록하세요. 반복 일정의 수정과 삭제는 전체 반복에 적용됩니다.']}
 ]},
 {slug:'family-week-check',section:'blog',category:'그룹 일정',date:'2026-11-09',title:'시간표부터 새 소식까지, 우리 그룹의 한 주 확인법',summary:'학교·학원은 시간표에, 생일과 정기 약속은 달력에. 메뉴의 알림 점까지 확인하며 한 주를 준비해 보세요.',art:'calendar',guide:'/guide#updates',sections:[
  {heading:'첫 화면에서 이번 주를 확인해요',paragraphs:['로그인하면 시간표가 먼저 열려요. 일요일부터 토요일까지 요일별 학교·학원 일정을 보고, 이름 필터로 여러 명의 일정을 함께 확인해 보세요. 첫 화면으로 저장하면 계정별로 선택한 조합을 기억해요.']},
  {heading:'달력에는 그룹의 큰 약속을 남겨요',paragraphs:['생일은 매년, 월말 그룹 모임은 매월 반복으로 등록해 보세요. 행사와 일회성 약속은 반복 안 함을 선택하면 됩니다. 시간표와 달력은 별도로 관리하므로 일정을 목적에 맞는 메뉴에 등록해 주세요.']},
  {heading:'알림 점을 따라 바뀐 내용을 살펴봐요',paragraphs:['그룹이 바꾼 일정이나 새 대화가 있으면 메뉴에 알림 점이 보여요. 해당 내용을 확인하고, 대화는 마지막 메시지까지 읽어 주세요. 대화의 그림 목록은 작은 크기로 정리돼 메시지를 볼 공간을 더 확보했어요.']},
  {heading:'가계부와 준비물도 함께 마무리해요',paragraphs:['일반사용자는 하단 가계부에서 이번 달 수입과 지출 기록을 확인해요. 다시 챙길 준비물은 전체메뉴 → 메모에 남겨 두세요. 시간표, 달력, 대화, 가계부 순서로 한 번씩 확인하는 습관부터 시작해 보세요.']}
 ]},
 {slug:'picture-messages',section:'notices',category:'업데이트',date:'2026-11-08',title:'말 대신 그림으로, 단체 대화가 더 쉬워졌어요',summary:'안녕, 어디야, 나 집이야. 그림과 문구가 함께 담긴 24가지 메시지를 입력창 위에서 바로 골라보세요.',art:'chat',guide:'/guide#chat',sections:[
  {heading:'아이도 고를 수 있는 그림 메시지',paragraphs:['안녕, 어디야, 학원, 아빠, 엄마, 나 집이야처럼 자주 쓰는 표현을 그림과 함께 준비했어요. 글자를 입력하기 어려운 아이도 그림을 보고 자신의 소식을 전할 수 있습니다.']},
  {heading:'입력창 바로 위에서 고르고 보내요',paragraphs:['그림 목록은 대화 입력창 위에 작은 크기로 표시해 대화 내용을 더 넓게 볼 수 있어요. 좌우로 넘기거나 화살표를 누르면 다른 표현도 볼 수 있어요.'],steps:['단체 대화 화면을 열어요.','전하고 싶은 그림을 눌러 선택해요.','선택한 문구를 확인한 뒤 종이비행기 버튼으로 보내요.']},
  {heading:'그룹에게도 같은 그림으로 보여요',paragraphs:['받은 화면에서도 그림과 문구를 함께 확인할 수 있어요. 그림 선택을 취소하거나 글을 입력하면 다른 내용으로 바꿀 수 있습니다. 그림을 보내기 전에 작성 중이던 글은 남아 있어요.']}
 ]},
 {slug:'schedule-registration',section:'notices',category:'업데이트',date:'2026-11-08',title:'시간표는 반복 일정, 달력은 행사와 기념일로',summary:'학교·학원은 일주일 시간표에서, 행사·기념일은 달력에서 따로 관리해요. 두 화면에서 공휴일도 확인할 수 있어요.',art:'calendar',guide:'/guide#schedule',sections:[
  {heading:'일정의 용도에 맞춰 나눠 관리해요',paragraphs:['시간표에서는 학교·학원처럼 매주 반복되는 일정을 등록해요. 일요일부터 토요일까지 고정된 한 주 화면에서 확인합니다. 주를 넘기거나 반복 기간을 지정할 필요 없이 선택한 요일에 매주 표시돼요. 달력에서는 행사·약속·기념일 등 일반 일정을 따로 등록하고 관리해요. 기존 반복 일정은 시간표에서 그대로 확인할 수 있습니다. 공휴일 이름은 두 화면 모두에 표시돼요.']},
  {heading:'매일 같은 시간 범위로 확인해요',paragraphs:['시간표는 일정 유무와 그룹 구성원 선택에 관계없이 오전 6시부터 밤 12시(24:00)까지 고정으로 표시해요. 종일 일정은 따로 표시해요. 숫자 날짜 줄과 주 선택은 정리하고 요일 중심으로 확인합니다.']},
  {heading:'일정이 있는 곳에서 등록해요',paragraphs:['달력에서는 날짜를 누른 뒤 일정 추가를, 시간표에서는 빈 시간 칸을 눌러 등록 화면을 열 수 있어요. 두 화면의 떠 있는 + 버튼은 정리했습니다.']},
  {heading:'시간표에서 하루를 시작해요',paragraphs:['로그인하면 시간표가 먼저 열려요. 하단 메뉴는 시간표, 달력, 대화, 가계부 순서로 배치했어요. 그룹 관리와 계정 설정은 전체메뉴에서 이용할 수 있습니다.']}
 ]},
 {slug:'welcome-guide',section:'notices',category:'서비스 안내',date:'2026-11-08',title:'아이하루를 처음 만나는 그룹을 위한 안내',summary:'서비스 소개부터 활용방법, 공지사항과 블로그까지. 로그인 전에도 아이하루를 둘러볼 수 있어요.',art:'users',guide:'/guide#start',sections:[
  {heading:'필요한 기능을 먼저 둘러보세요',paragraphs:['서비스 소개에서는 달력, 시간표, 가계부, 그림 대화를 예시 화면으로 살펴볼 수 있습니다. 예시의 이름과 일정, 금액은 설명을 위해 만든 가상 정보예요.']},
  {heading:'그룹의 사용 흐름을 따라가요',paragraphs:['활용방법에서는 그룹 연결과 일정 등록 순서를 안내합니다. 공지사항에는 서비스 변경 내용을, 블로그에는 일상에서 사용하는 방법을 정리합니다.']},
  {heading:'가입하고 첫 일정을 시작해요',paragraphs:['함께 사용할 사람에게 그룹 초대 링크를 보내세요. 상대방이 로그인하고 초대를 수락하면 같은 그룹에서 일정을 확인할 수 있어요.']}
 ]},
 {slug:'shared-morning',section:'blog',category:'그룹 일정',date:'2026-11-08',title:'“오늘 몇 시에 끝나?”를 줄이는 우리 집 일정표',summary:'바쁜 아침, 서로 묻기 전에 같은 일정을 확인하는 작은 습관을 만들어 보세요.',art:'calendar',guide:'/guide#schedule',sections:[
  {heading:'자주 반복되는 일정부터 모아보세요',paragraphs:['학교와 학원처럼 매주 돌아오는 일정은 반복으로 등록해 두면 편해요. 제목은 그룹 모두 알아볼 수 있게 짧게 쓰고, 대상과 시작·종료 시간을 함께 정해 보세요.'],steps:['시간표에서 등록할 요일의 빈 시간 칸을 눌러요.','반복 일정 등록에서 제목을 적고 그룹 구성원을 버튼으로 선택한 뒤 시간을 정해요.','반복할 요일을 한 개 이상 선택하고 저장해요. 시작일과 종료일 없이 매주 반복됩니다.']},
  {heading:'한 달과 일주일을 번갈아 봐요',paragraphs:['이번 달의 큰 일정은 달력으로, 일요일부터 토요일까지의 순서는 시간표로 확인해 보세요. 형제자매의 일정이 겹칠 때는 이름 필터로 한 사람의 일정만 살펴볼 수 있어요.']},
  {heading:'변경된 소식은 대화로 한 번 더',paragraphs:['시간이 달라졌다면 작성한 계정에서 일정을 수정하고 단체 대화에도 짧게 알려 주세요. 일정표를 확인하는 시간까지 그룹끼리 정해 두면 바뀐 내용을 함께 챙기기 좋습니다.']}
 ]},
 {slug:'first-picture-conversation',section:'blog',category:'아이와 소통',date:'2026-11-08',title:'글쓰기가 서툰 아이와 시작하는 그림 대화',summary:'“나 집이야”, “전화해 줘”, “사랑해”. 익숙한 그림 몇 개부터 함께 골라보세요.',art:'chat',guide:'/guide#chat',sections:[
  {heading:'그림의 뜻을 함께 이야기해요',paragraphs:['처음에는 안녕, 엄마, 아빠, 나 집이야처럼 익숙한 표현부터 보여 주세요. 아이가 그림을 가리키면 어떤 뜻인지 함께 말해 보는 것도 좋아요.']},
  {heading:'고르기와 보내기를 나눠 연습해요',paragraphs:['그림을 누르면 선택한 문구를 확인할 수 있어요. 종이비행기 버튼을 눌러야 전송되므로, 보내기 전에 한 번 더 살펴볼 수 있습니다. 다른 내용을 보내고 싶으면 선택 취소를 누르거나 새 그림을 고르면 돼요.']},
  {heading:'짧은 답장으로 대화를 이어가요',paragraphs:['아이가 나 집이야를 보냈다면 응, 알겠어 또는 사랑해로 답해 보세요. 그룹만의 간단한 인사 규칙을 정하면 작은 소식도 편하게 주고받을 수 있습니다. 그림 메시지는 아이가 직접 선택해 전하는 표현입니다.']}
 ]},
 {slug:'monthly-tuition-routine',section:'blog',category:'생활 관리',date:'2026-11-08',title:'가계부를 정리하는 월말 10분',summary:'수입과 지출을 적고, 이번 달 내역을 한눈에 확인하는 방법입니다.',art:'wallet',guide:'/guide#fees',sections:[
  {heading:'반복 비용과 한 번 내는 비용을 구분해요',paragraphs:['월급과 학원비처럼 매달 같은 돈은 매달로, 한 번만 적을 돈은 한 번으로 등록해 보세요. 수입인지 지출인지 고르고 내용, 금액, 날짜를 적으면 됩니다.']},
  {heading:'누구의 내역인지 정해요',paragraphs:['누구의 내역인지 이름을 골라 주세요. 필요한 내용은 추가 정보를 펼쳐 적을 수 있어요. 가계부는 일반사용자 계정의 하단 가계부 메뉴에서 관리합니다. 구성원 필터로 한 사람의 내역과 합계만 확인할 수 있습니다.']},
  {heading:'마지막에는 이번 달 기록을 확인해요',paragraphs:['조회할 달을 선택하고 빠진 항목이 없는지 확인하세요. 이름과 내용으로 내역을 찾거나 통계에서 분류·결제 방법별 금액을 볼 수 있어요. 나의 월 예산을 정해 이번 달 전체 지출과 비교해 보세요. 아이하루의 가계부 기능은 기록 도구이며 자동 결제나 송금은 실행하지 않습니다.']}
 ]}
];
export const publicSections={service:{title:'아이하루 — 그룹의 하루를 잇다',description:'학교와 학원 일정, 가계부와 그림 대화를 한곳에서. 그룹의 하루를 함께 챙기는 아이하루를 만나보세요.'},guide:{title:'아이하루 활용방법 — 우리 그룹의 시작 안내',description:'그룹 연결, 일정과 시간표, 가계부, 그림 대화를 함께 활용하는 방법을 알아보세요.'},notices:{title:'공지사항 · 아이하루',description:'아이하루의 업데이트와 서비스 이용 안내를 확인하세요.'},blog:{title:'블로그 · 아이하루',description:'우리 그룹의 일정과 소통을 조금 더 편하게 만드는 아이하루 활용 이야기.'}};
export function publicPage(pathname:string){const [section,slug]=pathname.split('/').filter(Boolean);const post=slug?publicPosts.find(p=>p.section===section&&p.slug===slug):undefined;return post?{title:post.title+' · 아이하루',description:post.summary,post}:!slug&&section in publicSections?{...publicSections[section as keyof typeof publicSections],post:undefined}:null;}
export const publicPaths=[...Object.keys(publicSections).map(section=>'/'+section),...publicPosts.map(post=>'/'+post.section+'/'+post.slug)];
