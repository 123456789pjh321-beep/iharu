import {useEffect,useRef,useState} from 'react';
import {useApi} from '../api';
import {scheduleRequest,useScheduleAction} from '../schedules';
import {templateCatalog,templateInput,templatePreview,templateResult,type TemplateInput,type TemplatePreview} from '../../../shared/schedule-template';
import {addDays} from '../../../shared/schedules';
import {Dialog,weekLabels} from './ScheduleForms';
import {FormNotice} from './AuthLayout';
import {Loading,ErrorState} from './Common';

export function ScheduleTemplateDialog({childrenOptions,childId,close,saved}:{childrenOptions:{id:string;nickname:string}[];childId:string;close:()=>void;saved:(message:string)=>void}){
 const [child,setChild]=useState(childId),[busy,setBusy]=useState(false);
 return <Dialog title="서준 시간표 가져오기" busy={busy} close={close}>
  <p className="auth-notice">제공받은 서준 시간표예요. 등록할 아이·실제 적용 기간·필요한 일정만 선택해 주세요. 생년월일, 서하 일정과 학원비는 추가하지 않아요.</p>
  <label className="form-field">등록할 아이<select value={child} disabled={busy} onChange={e=>setChild(e.target.value)}><option value="">아이를 선택해 주세요</option>{childrenOptions.map(c=><option key={c.id} value={c.id}>{c.nickname}</option>)}</select></label>
  {child&&<TemplateSelection key={child} childId={child} saved={saved} busyChanged={setBusy}/>}
 </Dialog>;
}
function TemplateSelection({childId,saved,busyChanged}:{childId:string;saved:(message:string)=>void;busyChanged:(busy:boolean)=>void}){
 const catalog=useApi(`/api/v1/children/${childId}/schedule-template`,templateCatalog),action=useScheduleAction();
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[selected,setSelected]=useState<string[]>([]),[confirmed,setConfirmed]=useState(false);
 const [preview,setPreview]=useState<{input:TemplateInput;result:TemplatePreview}|null>(null);
 const previewHeading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(preview)previewHeading.current?.focus();},[preview]);
 function run(fn:Parameters<typeof action.run>[0]){busyChanged(true);void action.run(fn).finally(()=>busyChanged(false));}
 function invalidate(){setPreview(null);setConfirmed(false);action.clear();}
 if(catalog.loading)return <Loading label="시간표를 불러오고 있어요"/>;
 if(catalog.error)return <ErrorState message={catalog.error} retry={catalog.retry}/>;
 return <><form className="auth-form" onChange={invalidate} onSubmit={e=>{e.preventDefault();run(async()=>{
  const input=templateInput.safeParse({from,to,rowIds:selected});if(!input.success)throw new Error('적용 기간과 가져올 일정을 선택해 주세요.');
  const result=templatePreview.parse(await scheduleRequest(`/api/v1/children/${childId}/schedule-template/preview`,input.data));setPreview({input:input.data,result});
 });}}>
 <fieldset disabled={action.busy} className="schedule-fields"><legend className="sr-only">가져올 시간표</legend>
 <div className="schedule-form-row"><label className="form-field">적용 시작일<input type="date" value={from} min={addDays(catalog.data!.serverToday,-90)} max={addDays(catalog.data!.serverToday,365)} onChange={e=>setFrom(e.target.value)} required/></label><label className="form-field">적용 종료일<input type="date" value={to} min={from} max={from?addDays(from,365):undefined} onChange={e=>setTo(e.target.value)} required/></label></div>
 <small>새 일정은 오늘 이후부터 등록해요. 이미 등록한 기간은 같은 날짜로 확인할 수 있어요.</small>
 <fieldset className="template-choices"><legend>가져올 일정 · {selected.length}개 선택</legend>{catalog.data!.rows.map(r=><label key={r.id} className="template-choice"><input type="checkbox" checked={selected.includes(r.id)} onChange={()=>setSelected(v=>v.includes(r.id)?v.filter(id=>id!==r.id):[...v,r.id])}/><span><strong>{r.title}</strong><span>{r.weekdays.map(d=>weekLabels[d]).join(' · ')} · {r.startTime}–{r.endTime}</span><small>{r.place||'장소 미입력'}</small></span></label>)}</fieldset>
 </fieldset><button className="button full" disabled={action.busy||!selected.length}>선택한 시간표 미리보기</button></form>
 <FormNotice error={action.error}/>
 {preview&&<section className="change-preview" aria-live="polite"><h3 ref={previewHeading} tabIndex={-1}>{preview.result.childName}에게 등록할 시간표</h3><p>{preview.result.from} ~ {preview.result.to} · 한국 시간</p>
 <ul className="template-summary">{preview.result.rows.map(r=><li key={r.id}><strong>{r.title}</strong><span>{r.weekdays.map(d=>weekLabels[d]).join(' · ')} · {r.startTime}–{r.endTime}</span><span>{r.state==='EXISTING'?'이미 등록됨 · 기존 변경 유지':r.state==='OVERLAP'?'기존 등록 기간과 겹침':`새 반복 일정 · 반복 기준 ${r.count}회`}</span></li>)}</ul>
 <p className="account-caption">공휴일 진행 여부는 등록 후 별도로 확인해요. 미리보기는 5분간 유효해요. 같은 시간표는 다시 만들어지지 않으며 기존 휴강·보강·변경 기록을 유지해요.</p>
 {!preview.result.canImport?<p className="auth-notice">같은 시간표의 등록 기간이 겹쳐요. 적용 기간이나 선택 항목을 바꾸거나 반복 일정에서 기존 내용을 수정해 주세요.</p>:<><label className="check-option"><input type="checkbox" checked={confirmed} disabled={action.busy} onChange={e=>setConfirmed(e.target.checked)}/>{preview.result.childName}의 실제 적용 기간과 선택한 일정을 확인했어요.</label>
 <button className="button primary full" disabled={action.busy||!confirmed} onClick={()=>run(async keyFor=>{
  const body={...preview.input,previewToken:preview.result.previewToken};const result=templateResult.parse(await scheduleRequest(`/api/v1/children/${childId}/schedule-template/import`,body,'POST',keyFor({childId,...body})));
  saved(`새 일정 ${result.created}개를 등록했어요. 이미 등록된 ${result.existing}개는 그대로 유지했어요.`);
 })}>{action.busy?'등록 중…':'확인한 시간표 등록'}</button></>}
 </section>}</>;
}

