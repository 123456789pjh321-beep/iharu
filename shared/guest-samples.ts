import {addDays} from './schedules.js';
import type {WorkspaceItem,WorkspaceMember,WorkspaceData,WorkspaceGroup} from './workspace.js';
export const sampleViewer:WorkspaceMember={id:'sample-parent',name:'지우',kind:'PARENT',host:true,version:1};
export const samplePersonalMembers=[sampleViewer];
export const sampleMembers:WorkspaceMember[]=[
 {id:'sample-minseo',name:'민서',kind:'CHILD',host:false,version:1},
 {id:'sample-hajun',name:'하준',kind:'CHILD',host:false,version:1},
 sampleViewer,
];
export const sampleGroup:WorkspaceGroup={
 id:'sample-group',name:'샘플 그룹',description:'가족이 함께 보는 시간표, 일정, 가계부의 예시입니다.',
 color:0,version:1,hostId:sampleViewer.id,isHost:true,members:sampleMembers,
};
export const sampleChildIds=['sample-minseo','sample-hajun'];
const data=(title:string,date:string,extra:Partial<WorkspaceData>={}):WorkspaceData=>({title,date,weekdays:[],place:'',note:'',paid:false,...extra});
const item=(id:string,kind:WorkspaceItem['kind'],value:WorkspaceData):WorkspaceItem=>({id:'sample:'+id,kind,data:value,ownerId:sampleViewer.id,ownerName:sampleViewer.name,mine:false,version:1});
const fee=(id:string,month:string,value:WorkspaceData):WorkspaceItem=>({
 ...item(id,'FEE',value),
 fee:{month,dueDate:value.date,paid:value.paid,payerId:sampleViewer.id,payerName:sampleViewer.name,canMarkPaid:false},
});
/** Fictional in-memory examples. No ID is a real account ID; nothing is stored or fetched. */
export function guestSamples(month:string,today:string,groupSelected:boolean){
 const anchor=addDays(today,-new Date(today+'T12:00:00Z').getUTCDay()),schoolStart=addDays(anchor,1);
 const months=[-1,0,1].map(offset=>{const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7);});
 if(!groupSelected)return {
  repeats:[
   item('walk','REPEAT',data('아침 산책',schoolStart,{weekdays:[1,3,5],startTime:'07:30',endTime:'08:10',color:0})),
   item('read','REPEAT',data('저녁 독서',schoolStart,{weekdays:[2,4],startTime:'20:00',endTime:'20:50',color:4})),
  ],
  events:months.flatMap(m=>[
   item(m+'-dentist','EVENT',data('정기 검진',m+'-12',{startTime:'10:30',endTime:'11:00',color:1})),
   item(m+'-break','EVENT',data('휴가',m+'-20',{allDay:true,endDate:m+'-21',color:4})),
  ]),
  fees:months.flatMap(m=>[
   fee(m+'-pay',m,data('급여',m+'-05',{amount:2800000,ledgerFlow:'INCOME',ledgerCategory:'SALARY',ledgerMethod:'TRANSFER'})),
   fee(m+'-book',m,data('도서 구입',m+'-12',{amount:24000,ledgerFlow:'EXPENSE',ledgerCategory:'LEISURE',ledgerMethod:'CARD'})),
   fee(m+'-transport',m,data('교통비',m+'-20',{amount:58000,ledgerFlow:'EXPENSE',ledgerCategory:'TRANSPORT',ledgerMethod:'CARD'})),
  ]),
  notes:[item('note-reading','NOTE',data('이번 주 읽을 책',month+'-10',{note:'주말에 도서관에 들러요.'}))],
 };
 const repeats=[
  item('school','REPEAT',data('초등학교',schoolStart,{weekdays:[1,2,3,4,5],startTime:'08:50',endTime:'13:30',assigneeId:'sample-minseo',color:0,place:'샘플 학교'})),
  item('kindergarten','REPEAT',data('유치원',schoolStart,{weekdays:[1,2,3,4,5],startTime:'09:20',endTime:'14:00',assigneeId:'sample-hajun',color:1})),
  item('english','REPEAT',data('영어 학원',schoolStart,{weekdays:[1,3],startTime:'15:00',endTime:'16:00',assigneeId:'sample-minseo',color:2})),
  item('taekwondo','REPEAT',data('태권도',addDays(anchor,2),{weekdays:[2,4],startTime:'16:00',endTime:'17:00',assigneeId:'sample-minseo',color:3})),
  item('piano','REPEAT',data('피아노',addDays(anchor,3),{weekdays:[3,5],startTime:'16:10',endTime:'17:00',assigneeId:'sample-hajun',color:4})),
 ];
 const events=months.flatMap(m=>[
  item(m+'-activity','EVENT',data('학교 공개 수업',m+'-12',{startTime:'10:00',endTime:'11:30',assigneeId:'sample-minseo',color:2,place:'샘플 학교'})),
  item(m+'-trip','EVENT',data('가족 여행',m+'-18',{endDate:m+'-19',allDay:true,allMembers:true,color:4})),
  item(m+'-outing','EVENT',data('그룹 나들이',m+'-21',{startTime:'10:00',endTime:'16:00',allMembers:true,color:0})),
 ]);
 const academyFees=[
  ['piano','피아노 학원비',150000,'sample-hajun','05'],
  ['english','영어 학원비',220000,'sample-minseo','12'],
  ['sport','태권도 학원비',170000,'sample-minseo','20'],
 ] as const;
 const fees=months.flatMap(m=>academyFees.map(([id,title,amount,assigneeId,day])=>
  fee(m+'-'+id,m,data(title,m+'-'+day,{amount,assigneeId,feeFrequency:'MONTHLY',feePayerId:sampleViewer.id,paid:id==='piano'}))));
 for(const m of months){
  for(const [id,title,amount,day,ledgerFlow,ledgerCategory] of [['salary','월급',3500000,'25','INCOME','SALARY'],['grocery','마트 장보기',86000,'08','EXPENSE','GROCERIES']] as const){
   fees.push(fee(m+'-'+id,m,data(title,m+'-'+day,{amount,assigneeId:sampleViewer.id,feeFrequency:'MONTHLY',
    feePayerId:sampleViewer.id,paid:true,ledgerFlow,ledgerCategory,ledgerMethod:id==='salary'?'TRANSFER':'CARD'})));
  }
 }
 const notes=[item('note-bag','NOTE',data('내일 준비물 챙기기',month+'-10',{note:'물병과 실내화를 가방에 챙겨요. 가상 예시 메모입니다.'})),item('note-pickup','NOTE',data('학원 끝나고 만나요',month+'-15',{note:'수업이 끝나면 단체 대화에서 알려 주세요. 가상 예시 메모입니다.'}))];
 return {repeats,events,fees,notes};
}
