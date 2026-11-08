/** Public editorial content only. Never put family or account data in this catalog. */
export type PublicPost={slug:string;section:'notices'|'blog';category:string;date:string;title:string;summary:string;art:'chat'|'calendar'|'wallet'|'users';sections:{heading:string;paragraphs:string[];steps?:string[]}[];guide:string};
export const publicPosts:PublicPost[]=[
 {slug:'picture-messages',section:'notices',category:'업데이트',date:'2026-11-08',title:'말 대신 그림으로, 가족 대화가 더 쉬워졌어요',summary:'안녕, 어디야, 나 집이야. 그림과 문구가 함께 담긴 24가지 메시지를 입력창 위에서 바로 골라보세요.',art:'chat',guide:'/guide#chat',sections:[
  {heading:'아이도 고를 수 있는 그림 메시지',paragraphs:['안녕, 어디야, 학원, 아빠, 엄마, 나 집이야처럼 자주 쓰는 표현을 그림과 함께 준비했어요. 글자를 입력하기 어려운 아이도 그림을 보고 자신의 소식을 전할 수 있습니다.']},
  {heading:'입력창 바로 위에서 고르고 보내요',paragraphs:['그림 목록은 대화 입력창 위에 항상 표시돼요. 좌우로 넘기거나 화살표를 누르면 다른 표현도 볼 수 있어요.'],steps:['가족 대화 화면을 열어요.','전하고 싶은 그림을 눌러 선택해요.','선택한 문구를 확인한 뒤 종이비행기 버튼으로 보내요.']},
  {heading:'가족에게도 같은 그림으로 보여요',paragraphs:['받은 화면에서도 그림과 문구를 함께 확인할 수 있어요. 그림 선택을 취소하거나 글을 입력하면 다른 내용으로 바꿀 수 있습니다. 그림을 보내기 전에 작성 중이던 글은 남아 있어요.']}
 ]},
 {slug:'schedule-registration',section:'notices',category:'업데이트',date:'2026-11-08',title:'시간표는 반복 일정, 달력은 행사와 기념일로',summary:'학교·학원은 일주일 시간표에서, 행사·기념일은 달력에서 따로 관리해요. 두 화면에서 공휴일도 확인할 수 있어요.',art:'calendar',guide:'/guide#schedule',sections:[
  {heading:'일정의 용도에 맞춰 나눠 관리해요',paragraphs:['시간표에서는 학교·학원처럼 매주 반복되는 일정을 등록해요. 선택한 주의 일요일부터 토요일까지 함께 표시합니다. 달력에서는 행사·약속·기념일 등 일반 일정을 따로 등록하고 관리해요. 기존 반복 일정은 시간표에서 그대로 확인할 수 있습니다. 공휴일 이름은 두 화면 모두에 표시돼요.']},
  {heading:'첫 일정 1시간 전부터 준비하세요',paragraphs:['시간표는 표시 중인 일주일과 선택한 구성원에서 가장 이른 일정의 1시간 전부터 시작합니다. 오전의 빈 공간을 줄이고 일정의 흐름을 바로 확인할 수 있어요. 종일 일정은 따로 표시합니다.']},
  {heading:'일정이 있는 곳에서 등록해요',paragraphs:['달력에서는 날짜를 누른 뒤 일정 추가를, 시간표에서는 빈 시간 칸을 눌러 등록 화면을 열 수 있어요. 두 화면의 떠 있는 + 버튼은 정리했습니다.']},
  {heading:'시간표에서 하루를 시작해요',paragraphs:['로그인하면 시간표가 먼저 열려요. 하단 메뉴는 시간표, 달력, 대화, 학원비 순서로 배치했어요. 가족 관리와 계정 설정은 더보기에서 이용할 수 있습니다.']}
 ]},
 {slug:'welcome-guide',section:'notices',category:'서비스 안내',date:'2026-11-08',title:'아이하루를 처음 만나는 가족을 위한 안내',summary:'서비스 소개부터 활용방법, 공지사항과 블로그까지. 로그인 전에도 아이하루를 둘러볼 수 있어요.',art:'users',guide:'/guide#start',sections:[
  {heading:'필요한 기능을 먼저 둘러보세요',paragraphs:['서비스 소개에서는 달력, 시간표, 학원비, 그림 대화를 예시 화면으로 살펴볼 수 있습니다. 예시의 이름과 일정, 금액은 설명을 위해 만든 가상 정보예요.']},
  {heading:'가족의 사용 흐름을 따라가요',paragraphs:['활용방법에서는 가족 연결과 일정 등록 순서를 안내합니다. 공지사항에는 서비스 변경 내용을, 블로그에는 일상에서 사용하는 방법을 정리합니다.']},
  {heading:'가입하고 첫 일정을 시작해요',paragraphs:['보호자 계정을 만들고 이메일 확인을 마친 뒤 가족 관리에서 승인번호를 발급하세요. 다른 보호자는 가족 관리에서, 자녀는 자녀 회원가입에서 번호를 입력해 연결할 수 있습니다.']}
 ]},
 {slug:'shared-morning',section:'blog',category:'가족 일정',date:'2026-11-08',title:'“오늘 몇 시에 끝나?”를 줄이는 우리 집 일정표',summary:'바쁜 아침, 서로 묻기 전에 같은 일정을 확인하는 작은 습관을 만들어 보세요.',art:'calendar',guide:'/guide#schedule',sections:[
  {heading:'자주 반복되는 일정부터 모아보세요',paragraphs:['학교와 학원처럼 매주 돌아오는 일정은 반복으로 등록해 두면 편해요. 제목은 가족 모두 알아볼 수 있게 짧게 쓰고, 대상과 시작·종료 시간을 함께 정해 보세요.'],steps:['시간표에서 시작할 날짜의 빈 시간 칸을 눌러요.','반복 일정 등록에서 제목과 대상, 시간을 정해요.','반복할 요일과 종료일을 확인하고 저장해요.']},
  {heading:'한 달과 일주일을 번갈아 봐요',paragraphs:['이번 달의 큰 일정은 달력으로, 일요일부터 토요일까지의 순서는 시간표로 확인해 보세요. 형제자매의 일정이 겹칠 때는 이름 필터로 한 사람의 일정만 살펴볼 수 있어요.']},
  {heading:'변경된 소식은 대화로 한 번 더',paragraphs:['시간이 달라졌다면 작성한 계정에서 일정을 수정하고 가족 대화에도 짧게 알려 주세요. 일정표를 확인하는 시간까지 가족끼리 정해 두면 바뀐 내용을 함께 챙기기 좋습니다.']}
 ]},
 {slug:'first-picture-conversation',section:'blog',category:'아이와 소통',date:'2026-11-08',title:'글쓰기가 서툰 아이와 시작하는 그림 대화',summary:'“나 집이야”, “전화해 줘”, “사랑해”. 익숙한 그림 몇 개부터 함께 골라보세요.',art:'chat',guide:'/guide#chat',sections:[
  {heading:'그림의 뜻을 함께 이야기해요',paragraphs:['처음에는 안녕, 엄마, 아빠, 나 집이야처럼 익숙한 표현부터 보여 주세요. 아이가 그림을 가리키면 어떤 뜻인지 함께 말해 보는 것도 좋아요.']},
  {heading:'고르기와 보내기를 나눠 연습해요',paragraphs:['그림을 누르면 선택한 문구를 확인할 수 있어요. 종이비행기 버튼을 눌러야 전송되므로, 보내기 전에 한 번 더 살펴볼 수 있습니다. 다른 내용을 보내고 싶으면 선택 취소를 누르거나 새 그림을 고르면 돼요.']},
  {heading:'짧은 답장으로 대화를 이어가요',paragraphs:['아이가 나 집이야를 보냈다면 응, 알겠어 또는 사랑해로 답해 보세요. 가족만의 간단한 인사 규칙을 정하면 작은 소식도 편하게 주고받을 수 있습니다. 그림 메시지는 아이가 직접 선택해 전하는 표현입니다.']}
 ]},
 {slug:'monthly-tuition-routine',section:'blog',category:'생활 관리',date:'2026-11-08',title:'학원비를 정리하는 월말 10분',summary:'학원 이름, 금액, 납부일과 결제자. 흩어진 비용 기록을 한곳에 모으는 방법입니다.',art:'wallet',guide:'/guide#fees',sections:[
  {heading:'반복 비용과 한 번 내는 비용을 구분해요',paragraphs:['매달 내는 수강료는 매월 납부로, 교재비처럼 한 번 내는 비용은 일회성으로 등록해 보세요. 가족이 내용을 알아볼 수 있도록 제목과 금액을 적습니다.']},
  {heading:'대상과 결제자를 함께 기록해요',paragraphs:['누구의 비용인지와 누가 납부를 챙기는지 정해 두세요. 학원비는 보호자 계정에서 관리합니다. 구성원 필터로 한 사람의 내역과 합계만 확인할 수 있습니다.']},
  {heading:'마지막에는 이번 달 기록을 확인해요',paragraphs:['조회할 달을 선택하고 빠진 항목이 없는지 확인하세요. 실제 납부 내역과 비교해 상태를 정리하면 다음 달에 참고하기도 편해요. 아이하루의 학원비 기능은 기록 도구이며 자동 결제나 송금은 실행하지 않습니다.']}
 ]}
];
export const publicSections={service:{title:'아이하루 — 가족의 하루를 잇다',description:'학교와 학원 일정, 학원비와 그림 대화를 한곳에서. 가족의 하루를 함께 챙기는 아이하루를 만나보세요.'},guide:{title:'아이하루 활용방법 — 우리 가족의 시작 안내',description:'가족 연결, 일정과 시간표, 학원비, 그림 대화를 함께 활용하는 방법을 알아보세요.'},notices:{title:'공지사항 · 아이하루',description:'아이하루의 업데이트와 서비스 이용 안내를 확인하세요.'},blog:{title:'블로그 · 아이하루',description:'우리 가족의 일정과 소통을 조금 더 편하게 만드는 아이하루 활용 이야기.'}};
export function publicPage(pathname:string){const [section,slug]=pathname.split('/').filter(Boolean);const post=slug?publicPosts.find(p=>p.section===section&&p.slug===slug):undefined;return post?{title:post.title+' · 아이하루',description:post.summary,post}:!slug&&section in publicSections?{...publicSections[section as keyof typeof publicSections],post:undefined}:null;}
export const publicPaths=[...Object.keys(publicSections).map(section=>'/'+section),...publicPosts.map(post=>'/'+post.section+'/'+post.slug)];
