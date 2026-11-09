import {addDays} from './schedules.js';
import type {WorkspaceItem,WorkspaceMember,WorkspaceData} from './workspace.js';
export const sampleMembers:WorkspaceMember[]=[{id:'sample-minseo',name:'민서',kind:'CHILD',host:false,version:1},{id:'sample-hajun',name:'하준',kind:'CHILD',host:false,version:1},{id:'sample-parent',name:'지우',kind:'PARENT',host:true,version:1}];
export const sampleChildIds=['sample-minseo','sample-hajun'];
const data=(title:string,date:string,extra:Partial<WorkspaceData>={}):WorkspaceData=>({title,date,weekdays:[],place:'',note:'',paid:false,...extra});
const item=(id:string,kind:WorkspaceItem['kind'],value:WorkspaceData):WorkspaceItem=>({id:'sample:'+id,kind,data:value,ownerId:'sample-parent',ownerName:'지우',mine:false,version:1});
/** Fictional in-memory examples. No ID is a real account ID; nothing is stored or fetched. */
export function guestSamples(month:string,today:string){
 const anchor=addDays(today,-new Date(today+'T12:00:00Z').getUTCDay()),schoolStart=addDays(anchor,1);
 const repeats=[
  item('school','REPEAT',data('초등학교',schoolStart,{weekdays:[1,2,3,4,5],startTime:'08:50',endTime:'13:30',assigneeId:'sample-minseo',color:0,place:'샘플 학교'})),
  item('kindergarten','REPEAT',data('유치원',schoolStart,{weekdays:[1,2,3,4,5],startTime:'09:20',endTime:'14:00',assigneeId:'sample-hajun',color:1})),
  item('english','REPEAT',data('영어 학원',schoolStart,{weekdays:[1,3],startTime:'15:00',endTime:'16:00',assigneeId:'sample-minseo',color:2})),
  item('taekwondo','REPEAT',data('태권도',addDays(anchor,2),{weekdays:[2,4],startTime:'16:00',endTime:'17:00',assigneeId:'sample-minseo',color:3})),
  item('piano','REPEAT',data('피아노',addDays(anchor,3),{weekdays:[3,5],startTime:'16:10',endTime:'17:00',assigneeId:'sample-hajun',color:4})),
 ];
 const months=[-1,0,1].map(offset=>{const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7);});
 const events=months.flatMap(m=>[
  item(m+'-activity','EVENT',data('학교 공개 수업',m+'-12',{startTime:'10:00',endTime:'11:30',assigneeId:'sample-minseo',color:2})),
  item(m+'-birthday','EVENT',data('그룹 생일',m+'-18',{allDay:true,allMembers:true,color:4})),
  item(m+'-outing','EVENT',data('그룹 나들이',m+'-21',{startTime:'10:00',endTime:'16:00',allMembers:true,color:0})),
 ]);
 const fees=months.flatMap(m=>[
  ['piano','피아노 학원비',150000,'sample-hajun','05'],['english','영어 학원비',220000,'sample-minseo','12'],['sport','태권도 학원비',170000,'sample-minseo','20'],
 ].map(([id,title,amount,assigneeId,day])=>{const fee=item(m+'-'+id,'FEE',data(String(title),m+'-'+day,{amount:Number(amount),assigneeId:String(assigneeId),feeFrequency:'MONTHLY',feePayerId:'sample-parent'}));fee.fee={month:m,dueDate:fee.data.date,paid:id==='piano',payerId:'sample-parent',payerName:'일반사용자',canMarkPaid:false};return fee;}));
 const notes=[item('note-bag','NOTE',data('내일 준비물 챙기기',month+'-10',{note:'물병과 실내화를 가방에 챙겨요. 가상 예시 메모입니다.'})),item('note-pickup','NOTE',data('학원 끝나고 만나요',month+'-15',{note:'수업이 끝나면 단체 대화에서 알려 주세요. 가상 예시 메모입니다.'}))];
 return {repeats,events,fees,notes};
}
