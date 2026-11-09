import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useApi} from '../api';
import {FormNotice} from './AuthLayout';
import {Icon} from './Icon';
import {Loading,ErrorState} from './Common';
import {scheduleRequest,useScheduleAction} from '../schedules';
import {dailyMembersSchema,dailyListSchema,type DailyItem} from '../../../shared/daily';
import {addDays,koreaToday,type Occurrence} from '../../../shared/schedules';
export type ChildOption={id:string;nickname:string};
export type DailyForm={type:'CHECKIN'|'TASK'|'LEARNING'|'PICKUP';item?:DailyItem;action?:string;occurrence?:Occurrence;kind?:'ARRIVED'|'DEPARTED'};
const toLocal=(s?:string|null)=>s?new Date(Date.parse(s)+9*3600000).toISOString().slice(0,16):'';
const toInstant=(s:string)=>new Date(s+':00+09:00').toISOString();
const labels:Record<string,string>={CHECKIN:'등하원 기록',TASK:'할 일',LEARNING:'학습 메모',PICKUP:'픽업 요청',COMPLETE:'다 했어요',REOPEN:'다시 할 일로',CANCEL:'취소하기',ACCEPT:'픽업 맡기',HANDOVER:'아이 만남 기록',REASSIGN:'담당 바꾸기',ANNOTATE:'만남 기록에 메모',DELETE:'메모 삭제',CORRECT:'등하원 정정'};
function Modal({title,close,children,busy}:{title:string;close:()=>void;children:ReactNode;busy:boolean}){
 const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 return <dialog ref={ref} className="daily-dialog" onCancel={e=>{if(busy)e.preventDefault();}} onClose={close} aria-labelledby="daily-dialog-title"><header><h2 id="daily-dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="닫기" disabled={busy} onClick={close}><Icon name="close"/></button></header>{children}</dialog>;
}
function Members({childId,value,onChange}:{childId:string;value:string;onChange:(s:string)=>void}){
 const list=useApi(`/api/v1/children/${childId}/daily-members`,dailyMembersSchema);
 if(list.loading)return <Loading label="담당할 그룹을 확인하고 있어요"/>;
 if(list.error)return <ErrorState message={list.error} retry={list.retry}/>;
 return <label>담당 그룹<select value={value} onChange={e=>onChange(e.target.value)}><option value="">아직 정하지 않았어요</option>{list.data?.data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>;
}
function LinkedTask({childId,value,onChange}:{childId:string;value:string;onChange:(s:string)=>void}){
 const today=koreaToday(),list=useApi(`/api/v1/children/${childId}/tasks?from=${addDays(today,-89)}&to=${today}`,dailyListSchema);
 return <label>연결할 할 일<select value={value} onChange={e=>onChange(e.target.value)}><option value="">연결하지 않아요</option>{list.data?.data.items.filter(t=>t.state!=='CANCELLED').map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select>{list.error&&<span role="alert">할 일 목록을 불러오지 못했어요. <button type="button" onClick={list.retry}>다시 불러오기</button></span>}{list.data?.meta.nextCursor&&<small>최근 할 일 30개를 표시해요.</small>}</label>;
}
export function DailyDialog({form,childrenOptions,childId,occurrences,serverNow,childMode=false,close,saved}:{form:DailyForm;childrenOptions:ChildOption[];childId:string;occurrences:Occurrence[];serverNow:string;childMode?:boolean;close:()=>void;saved:()=>void}){
 const item=form.item,action=useScheduleAction();
 const [cid,setCid]=useState(item?.childId||form.occurrence?.childId||childId||childrenOptions[0]?.id||'');
 const [kind,setKind]=useState(form.kind||item?.kind||'ARRIVED'),[occurrence,setOccurrence]=useState(form.occurrence?.id||item?.occurrenceId||'');
 const [dateTime,setDateTime]=useState(toLocal(item?.happenedAt||item?.scheduledAt||(form.type==='PICKUP'?form.occurrence?.endsAt:undefined)||serverNow));
 const [title,setTitle]=useState(item?.title||''),[detail,setDetail]=useState(item?.detail||''),[due,setDue]=useState(toLocal(item?.dueAt));
 const [assignee,setAssignee]=useState(item?.assigneeMemberId||''),[sourceName,setSourceName]=useState(item?.sourceName||''),[sourceUrl,setSourceUrl]=useState(item?.sourceUrl||'');
 const [learningDate,setLearningDate]=useState(item?.learningDate||koreaToday(new Date(serverNow))),[subject,setSubject]=useState(item?.subject||''),[content,setContent]=useState(item?.content||''),[taskId,setTaskId]=useState(item?.taskId||'');
 const [place,setPlace]=useState(item?.place||form.occurrence?.place||''),[memo,setMemo]=useState(item?.memo||''),[reason,setReason]=useState(''),[voidOnly,setVoidOnly]=useState(false);
 const [clientEventId]=useState(()=>crypto.randomUUID());const [confirmRepeat,setConfirmRepeat]=useState(false);
 const verb=form.action,editing=verb==='EDIT',simple=Boolean(verb&&!['EDIT','CORRECT','REASSIGN'].includes(verb));
 function submit(){void action.run(async keyFor=>{
  let path='',body:object={},method='POST';const expectedVersion=item?.version;
  if(form.type==='CHECKIN'){
   const checkin={kind,occurrenceId:occurrence||null,happenedAt:toInstant(dateTime),clientEventId,confirmRepeat};
   path=verb==='CORRECT'?`/api/v1/checkins/${item!.id}/corrections`:`/api/v1/children/${cid}/checkins`;body=verb==='CORRECT'?{expectedVersion,reason,replacement:voidOnly?null:checkin}:checkin;
  }else if(form.type==='TASK'){
   path=item?`/api/v1/tasks/${item.id}${editing?'':'/actions'}`:`/api/v1/children/${cid}/tasks`;
   body=simple?{action:verb,expectedVersion}:{title,detail,dueAt:due?toInstant(due):null,assigneeMemberId:assignee||null,sourceName,sourceUrl:sourceUrl||null,...(editing?{expectedVersion}:{})};method=editing?'PATCH':'POST';
  }else if(form.type==='LEARNING'){
   path=item?`/api/v1/learning-entries/${item.id}`:`/api/v1/children/${cid}/learning-entries`;
   body=verb==='DELETE'?{expectedVersion}:{learningDate,subject,content,taskId:taskId||null,...(editing?{expectedVersion}:{})};method=verb==='DELETE'?'DELETE':editing?'PATCH':'POST';
  }else{
   path=item?`/api/v1/pickups/${item.id}/actions`:`/api/v1/children/${cid}/pickups`;
   body=item?{action:verb,expectedVersion,assigneeMemberId:assignee||null,reason}:{occurrenceId:occurrence||null,assigneeMemberId:assignee||null,scheduledAt:toInstant(dateTime),place,memo};
  }
  await scheduleRequest(path,body,method,keyFor({path,...body}),childMode?'child':undefined);saved();
 });}
 const heading=verb?labels[verb]||`${labels[form.type]} 수정`:form.type==='CHECKIN'?(kind==='ARRIVED'?'도착했어요':'출발했어요'):`${labels[form.type]} 추가`;
 const changeChild=(value:string)=>{setCid(value);setOccurrence('');setAssignee('');setTaskId('');};
 return <Modal title={heading} close={close} busy={action.busy}><form className={`daily-form ${childMode?'child-daily-form':''}`} onSubmit={e=>{e.preventDefault();submit();}}>
  {!childMode&&!item&&<label>아이<select value={cid} onChange={e=>changeChild(e.target.value)} required>{childrenOptions.map(c=><option key={c.id} value={c.id}>{c.nickname}</option>)}</select></label>}
  {item&&<p className="daily-form-context">{item.childName} · {item.title||item.occurrenceTitle||labels[item.type]}</p>}
  {simple&&<p>{verb==='HANDOVER'?'아이를 직접 만났나요? 그룹에게 만남 기록이 남아요.':verb==='COMPLETE'?'할 일을 마쳤다면 아래 버튼을 눌러 주세요.':verb==='ACCEPT'?'이 시간의 픽업을 맡을 수 있나요?':verb==='DELETE'?'이 학습 메모를 삭제할까요?':verb==='CANCEL'?'현재 요청이나 할 일을 취소할까요?':verb==='ANNOTATE'?'완료 상태를 유지하고 정정 설명을 덧붙여요.':'할 일을 다시 열까요?'}</p>}
  {form.type==='CHECKIN'&&<>
   {childMode?<div className="child-checkin-confirm"><Icon name={kind==='ARRIVED'?'arrival':'departure'}/><strong>{kind==='ARRIVED'?'잘 도착했나요?':'이제 출발하나요?'}</strong><p>그룹에게 기록이 보여요.</p></div>:<label>기록 종류<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="ARRIVED">도착</option><option value="DEPARTED">출발</option></select></label>}
   {verb==='CORRECT'&&<label className="daily-checkbox"><input type="checkbox" checked={voidOnly} onChange={e=>setVoidOnly(e.target.checked)}/>새 기록 없이 원본만 취소하기</label>}
   {!voidOnly&&<><label>연결 일정<select value={occurrence} onChange={e=>setOccurrence(e.target.value)}><option value="">일정에 연결하지 않아요</option>{occurrences.filter(o=>o.childId===cid&&!['CANCELLED','SKIPPED'].includes(o.status)).map(o=><option key={o.id} value={o.id}>{o.title} · {o.startTime}–{o.endTime}</option>)}{item?.occurrenceId&&!occurrences.some(o=>o.id===item.occurrenceId)&&<option value={item.occurrenceId}>{item.occurrenceTitle||'기존 연결 일정'}</option>}</select></label>{!childMode&&<label>기록 시각 · 한국 시간<input type="datetime-local" value={dateTime} onChange={e=>setDateTime(e.target.value)} required/></label>}</>}
   {!childMode&&<small>지난 7일 안의 기록을 남길 수 있어요. 도착 기록은 픽업 완료나 위치 공유를 뜻하지 않아요.</small>}
  </>}
  {form.type==='TASK'&&!simple&&<><label>할 일 이름<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} required autoFocus/></label><label>자세한 내용<textarea value={detail} onChange={e=>setDetail(e.target.value)} maxLength={1000}/></label><label>마감 시각 · 선택<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label><Members key={cid} childId={cid} value={assignee} onChange={setAssignee}/><details><summary>출처 연결 · 선택</summary><label>출처 이름<input value={sourceName} onChange={e=>setSourceName(e.target.value)} maxLength={80}/></label><label>출처 링크 · https://<input type="url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} maxLength={2000} pattern="https://.*"/></label></details></>}
  {form.type==='LEARNING'&&!simple&&<><label>학습한 날짜<input type="date" value={learningDate} max={koreaToday(new Date(serverNow))} min={addDays(koreaToday(new Date(serverNow)),-89)} onChange={e=>setLearningDate(e.target.value)} required/></label><label>과목 · 선택<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={30}/></label><label>학습 메모<textarea value={content} onChange={e=>setContent(e.target.value)} maxLength={1000} required placeholder="오늘 배운 내용과 아이의 작은 변화를 남겨요."/></label><LinkedTask key={cid} childId={cid} value={taskId} onChange={setTaskId}/></>}
  {form.type==='PICKUP'&&!simple&&<><Members key={cid} childId={cid} value={assignee} onChange={setAssignee}/>{!item&&<><label>만날 시각 · 한국 시간<input type="datetime-local" value={dateTime} onChange={e=>setDateTime(e.target.value)} required/></label><label>연결 일정<select value={occurrence} onChange={e=>setOccurrence(e.target.value)}><option value="">일정에 연결하지 않아요</option>{occurrences.filter(o=>o.childId===cid&&!['CANCELLED','SKIPPED'].includes(o.status)).map(o=><option key={o.id} value={o.id}>{o.title} · {o.endTime}</option>)}</select></label><label>만날 장소<input value={place} onChange={e=>setPlace(e.target.value)} maxLength={100}/></label><label>전할 말 · 일반사용자에게만 표시<textarea value={memo} onChange={e=>setMemo(e.target.value)} maxLength={500}/></label></>}<small>담당 그룹이 수락하면 픽업 약속이 정해져요.</small></>}
  {(verb==='CORRECT'||form.type==='PICKUP'&&['CANCEL','ANNOTATE'].includes(verb||''))&&<label>기록 사유<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={300} required/></label>}
  <FormNotice error={action.error}/>
  {action.code==='REPEAT_CONFIRM_REQUIRED'&&<label className="daily-checkbox"><input type="checkbox" checked={confirmRepeat} onChange={e=>setConfirmRepeat(e.target.checked)}/>확인했어요. 같은 기록을 한 번 더 남길게요.</label>}
  {action.code==='VERSION_CONFLICT'&&<button type="button" className="button" onClick={saved}>최신 기록 불러오기</button>}
  <footer><button type="button" className="button" disabled={action.busy} onClick={close}>돌아가기</button><button type="submit" className="button primary" disabled={action.busy||!cid||action.code==='REPEAT_CONFIRM_REQUIRED'&&!confirmRepeat}>{action.busy?'저장하고 있어요':simple?heading:childMode?'네, 기록할게요':'저장하기'}</button></footer>
 </form></Modal>;
}

