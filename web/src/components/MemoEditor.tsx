import {useCallback,useEffect,useRef,useState,type ChangeEvent} from 'react';
import {memoCategories,memoFields,type MemoDraft,type MemoPhotoInput} from '../../../shared/memos';
import {workspaceRequest} from '../workspace-api';
import {Icon,type IconName} from './Icon';
import {captureBytes,memoByteLimit,attachmentCountLimit,emptyCapture,memoTemplates,type MemoAttachmentInput} from '../../../shared/memo-capture';
import {MemoWriting,MemoChecklist,MemoAttachmentCard} from './memo/MemoContent';
import {MemoRecorder} from './memo/MemoRecorder';
import {MemoCamera} from './memo/MemoCamera';
import {MemoSketch} from './memo/MemoSketch';
import {prepareAttachment,fileAccept} from './memo/media';
import './memo/memo-capture.css';
import {Link} from 'react-router-dom';

export async function prepareMemoPhoto(file:File):Promise<MemoPhotoInput>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('JPG·PNG·WebP 사진을 선택해 주세요. 사진 한 장은 20MB까지 가능해요.');
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width*bitmap.height>60000000)throw new Error('사진 크기가 너무 커요. 크기를 줄인 뒤 다시 선택해 주세요.');
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이 기기에서 사진을 처리하지 못했어요.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  // Re-encoding removes hidden EXIF/GPS metadata; location is a separate explicit choice.
  for(const quality of [.82,.67,.5,.32]){const url=canvas.toDataURL('image/jpeg',quality),data=url.split(',')[1];if(data.length<=466664)return {data,width:canvas.width,height:canvas.height};}
  throw new Error('사진을 압축하지 못했어요. 조금 작은 사진을 선택해 주세요.');
 }finally{bitmap.close();}
}
export function MemoPhoto({id,alt,onOpen}:{id:string;alt:string;onOpen?:(src:string)=>void}){
 const host=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
 useEffect(()=>{if(!host.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'200px'});observer.observe(host.current);return()=>observer.disconnect();},[]);
 const [src,setSrc]=useState(''),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!visible)return;let active=true;setSrc('');setFailed(false);workspaceRequest<{data:string}>('memos.photo',{id}).then(r=>{if(active)setSrc('data:image/jpeg;base64,'+r.data);}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[id,retry,visible]);
 return <div ref={host} className="memo-photo-container">{src?<button className="memo-photo" type="button" onClick={()=>onOpen?.(src)} aria-label={alt+' 크게 보기'}><img src={src} alt={alt}/></button>:failed?<button className="memo-photo memo-photo-placeholder" type="button" onClick={()=>setRetry(n=>n+1)}>사진 다시 보기</button>:<span className="memo-photo memo-photo-placeholder" aria-label="사진 불러오는 중"><Icon name="image"/></span>}</div>;
}

export type MemoTool='notebook'|'record'|'camera'|'scan'|'file'|'sketch'|null;
export const memoTools:[Exclude<MemoTool,null>,string,IconName][]=[['notebook','노트북','book'],['record','녹음기','mic'],['camera','카메라','camera'],['scan','스캔','scan'],['file','파일','file'],['sketch','스케치','sketch']];
export function MemoEditor({initial,profileId,spaceId,initialTool=null,onClose,onSaved}:{initial:MemoDraft;profileId:string;spaceId:string|null;initialTool?:MemoTool;onClose:()=>void;onSaved:(date:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),pending=useRef(false),mounted=useRef(true),photoInput=useRef<HTMLInputElement>(null),fileInput=useRef<HTMLInputElement>(null),processing=useRef(false),draftRef=useRef(initial),locateVersion=useRef(0);
 const [draft,setDraft]=useState<MemoDraft>(()=>({...emptyCapture,...initial,...(!spaceId?{visibility:'PRIVATE' as const}:{})}));
 draftRef.current=draft;
 const [busy,setBusy]=useState(false),[photoBusy,setPhotoBusy]=useState(false),[sensorActive,setSensorActive]=useState(false),[locating,setLocating]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false),[draftMessage,setDraftMessage]=useState(''),[tool,setTool]=useState<MemoTool>(initialTool),[templates,setTemplates]=useState(false);
 const key='iharu-memo-draft:'+profileId+':'+(spaceId||'personal');
 const meaningful=!!(draft.title||draft.body||draft.photos.length||draft.place||draft.location||draft.attachments?.length||draft.checklist?.length||draft.notebook);
 const onActive=useCallback((active:boolean)=>setSensorActive(active),[]);
 useEffect(()=>{mounted.current=true;const node=dialog.current,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();node?.querySelector<HTMLInputElement>('input[aria-label="제목"]')?.focus({preventScroll:true});return()=>{mounted.current=false;locateVersion.current++;node?.close();if(opener?.isConnected)opener.focus({preventScroll:true});};},[]);
 useEffect(()=>{if(!meaningful)return;const timer=setTimeout(()=>{try{sessionStorage.setItem(key,JSON.stringify({draft,expiresAt:Date.now()+86400000}));setDraftMessage('작성 중인 내용을 이 탭에 임시 보관했어요.');}catch{setDraftMessage('임시 보관 공간이 부족해요. 창을 닫기 전에 저장해 주세요.');}},300);return()=>clearTimeout(timer);},[draft,key,meaningful]);
 useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(meaningful||sensorActive){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[meaningful,sensorActive]);
 function patch(value:Partial<MemoDraft>){setDraft(old=>({...old,...value}));}
 function close(){if(busy||photoBusy)return;if((meaningful||sensorActive)&&!window.confirm('작성 중인 내용을 버리고 닫을까요?'))return;try{sessionStorage.removeItem(key);}catch{}onClose();}
 function keep(){if(busy||photoBusy||sensorActive)return;try{sessionStorage.setItem(key,JSON.stringify({draft,expiresAt:Date.now()+86400000}));onClose();}catch{setError('임시 보관 공간이 부족해요. 첨부를 줄이거나 메모를 저장해 주세요.');}}
 async function addPhoto(file:File){const photo=await prepareMemoPhoto(file);if(!mounted.current)return;const current=draftRef.current;if(current.photos.length>=3)throw new Error('사진은 3장까지 추가할 수 있어요. 스캔·스케치는 파일로 첨부돼요.');if(captureBytes([...current.photos,photo],current.attachments||[])>memoByteLimit)throw new Error('사진과 파일 합계는 2.8MB까지 가능해요.');setDraft(old=>({...old,photos:[...old.photos,photo]}));}
 async function photos(e:ChangeEvent<HTMLInputElement>){const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length||processing.current)return;if(files.length+draft.photos.length>3){setError('사진은 메모 하나에 3장까지 추가할 수 있어요.');return;}
 processing.current=true;setPhotoBusy(true);setError('');try{const added:MemoPhotoInput[]=[];for(const file of files)added.push(await prepareMemoPhoto(file));if(mounted.current){if(captureBytes([...draftRef.current.photos,...added],draftRef.current.attachments||[])>memoByteLimit)throw new Error('사진과 파일 합계는 2.8MB까지 가능해요.');setDraft(old=>({...old,photos:[...old.photos,...added]}));}}catch(e){if(mounted.current)setError((e as Error).message);}finally{processing.current=false;if(mounted.current)setPhotoBusy(false);}}
 async function addAttachments(added:MemoAttachmentInput[]){if(!mounted.current)return;const current=draftRef.current,all=[...(current.attachments||[]),...added];if(all.length>attachmentCountLimit)throw new Error('파일·녹음·스캔·스케치는 합쳐서 4개까지 첨부할 수 있어요.');if(captureBytes(current.photos,all)>memoByteLimit)throw new Error('사진과 파일 합계는 2.8MB까지 가능해요. 첨부를 줄여 주세요.');const next={...current,attachments:all};draftRef.current=next;setDraft(next);}
 async function files(e:ChangeEvent<HTMLInputElement>){const selected=Array.from(e.target.files||[]);e.target.value='';if(!selected.length||processing.current)return;processing.current=true;setPhotoBusy(true);setError('');try{const added=[];for(const file of selected)added.push(await prepareAttachment(file));await addAttachments(added);}catch(e){if(mounted.current)setError((e as Error).message);}finally{processing.current=false;if(mounted.current)setPhotoBusy(false);}}
 function locate(){
  if(!navigator.geolocation){setError('이 기기에서는 위치를 가져올 수 없어요. 장소 이름을 직접 입력해 주세요.');return;}
  const ticket=++locateVersion.current;setLocating(true);setError('');
  navigator.geolocation.getCurrentPosition(p=>{if(!mounted.current||ticket!==locateVersion.current)return;patch({location:{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:new Date(p.timestamp).toISOString()}});setLocating(false);},e=>{if(!mounted.current||ticket!==locateVersion.current)return;setLocating(false);setError(e.code===1?'위치 권한이 꺼져 있어요. 허용하거나 장소 이름을 직접 입력해 주세요.':'현재 위치를 확인하지 못했어요. 다시 시도하거나 장소 이름을 입력해 주세요.');},{enableHighAccuracy:true,timeout:12000,maximumAge:0});
 }
 async function save(){if(pending.current||processing.current||photoBusy||locating||sensorActive)return;
 const parsed=memoFields.safeParse({...Object.fromEntries(Object.keys(memoFields.shape).map(k=>[k,draft[k as keyof MemoDraft]])),checklist:(draft.checklist||[]).filter(i=>i.text.trim()),tags:[...new Set(draft.tags.map(t=>t.trim()).filter(Boolean))]});
 if(!parsed.success){setError('제목·날짜·시간과 입력 내용을 확인해 주세요.');return;}
 pending.current=true;setBusy(true);setError('');setConsent(false);
 try{await workspaceRequest('memos.save',{...parsed.data,id:draft.id,version:draft.version,photos:draft.photos,attachments:(draft.attachments||[]).map(a=>'id' in a?{id:a.id}:a)},spaceId);try{sessionStorage.removeItem(key);}catch{}if(mounted.current)onSaved(draft.date);}catch(e){if(mounted.current){setError((e as Error).message);setConsent((e as {code?:string}).code==='LEGAL_ACCEPTANCE_REQUIRED');}}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 function choose(next:Exclude<MemoTool,null>){setError('');if(next==='file'){setTool('file');fileInput.current?.click();}else setTool(tool===next?null:next);}
 function template(value:typeof memoTemplates[number]){if((draft.body||draft.checklist?.length)&&!window.confirm('현재 글과 체크리스트를 선택한 양식으로 바꿀까요?'))return;patch({title:draft.title||value.title,body:value.body,bodyFormat:'MARKDOWN',checklist:value.tasks.map(text=>({id:crypto.randomUUID(),text,done:false}))});setTemplates(false);}
 return <dialog ref={dialog} className="memo-editor" aria-labelledby="memo-editor-title" onCancel={e=>{e.preventDefault();close();}}>
 <form onSubmit={e=>{e.preventDefault();void save();}}><header><div><h2 id="memo-editor-title">{draft.version?'메모 수정':'메모 작성'}</h2><span className="memo-editor-scope"><Icon name={draft.visibility==='PRIVATE'?'shield':'users'}/>{draft.visibility==='PRIVATE'?'나만 보는 기록':'현재 그룹에 공유'}</span></div><button type="button" className="icon-button" aria-label="메모 작성 닫기" onClick={close} disabled={busy||photoBusy}><Icon name="close"/></button></header>
 <div className="memo-editor-body"><fieldset disabled={busy}><legend className="sr-only">메모 내용</legend>
 <div className="memo-tools" role="group" aria-label="기록 도구">{memoTools.map(([id,label,icon])=><button type="button" key={id} aria-pressed={tool===id} disabled={photoBusy||sensorActive} onClick={()=>choose(id)}><Icon name={icon}/><span>{label}</span></button>)}</div>
 {tool==='notebook'&&<section className="memo-capture-panel"><label>노트북<input aria-label="노트북" value={draft.notebook||''} maxLength={40} onChange={e=>patch({notebook:e.target.value})} placeholder="예: 아이의 성장, 가족의 기록"/></label><p className="memo-hint">같은 이름으로 기록을 묶어요. 노트북도 선택한 개인·그룹 안에서만 사용돼요.</p></section>}
 {tool==='record'&&<MemoRecorder onAdd={a=>addAttachments([a])} onClose={()=>setTool(null)} onActive={onActive}/>}
 {(tool==='camera'||tool==='scan')&&<MemoCamera key={tool} scan={tool==='scan'} onFile={tool==='scan'?async f=>addAttachments([await prepareAttachment(f,'SCAN')]):addPhoto} onClose={()=>setTool(null)} onActive={onActive}/>}
 {tool==='sketch'&&<MemoSketch onActive={onActive} onFile={async f=>addAttachments([await prepareAttachment(f,'SKETCH')])} onClose={()=>setTool(null)}/>}
 {tool==='file'&&<div className="memo-capture-panel"><p className="memo-hint">PDF·텍스트·문서·사진·오디오 · 파일당 2MB · 최대 4개</p><button type="button" className="button compact" disabled={photoBusy} onClick={()=>fileInput.current?.click()}>파일 선택</button></div>}
 <input ref={fileInput} type="file" aria-label="첨부 파일 선택" accept={fileAccept} multiple hidden onChange={e=>void files(e)}/>
 <label className="memo-title-label">제목<input aria-label="제목" value={draft.title} onChange={e=>patch({title:e.target.value})} maxLength={100} placeholder="어떤 순간을 기억하고 싶나요?" required/></label>
 <MemoWriting body={draft.body} format={draft.bodyFormat} onChange={(body,bodyFormat)=>patch({body,bodyFormat})}/>
 <div className="memo-inline-tools"><button type="button" className="button compact" onClick={()=>patch({checklist:[...(draft.checklist||[]),{id:crypto.randomUUID(),text:'',done:false}]})} disabled={(draft.checklist?.length||0)>=50}><Icon name="checklist"/>체크리스트</button><button type="button" className="button compact" aria-expanded={templates} onClick={()=>setTemplates(!templates)}><Icon name="book"/>기록 양식</button><button type="button" className="button compact" disabled={photoBusy||draft.photos.length>=3} onClick={()=>photoInput.current?.click()}><Icon name="image"/>사진 추가</button></div>
 {templates&&<div className="memo-templates" aria-label="기록 양식">{memoTemplates.map(t=><button type="button" key={t.id} onClick={()=>template(t)}><Icon name="book"/>{t.label}<Icon name="plus"/></button>)}</div>}
 {!!draft.checklist?.length&&<MemoChecklist items={draft.checklist} onChange={checklist=>patch({checklist})}/>}
 <div className="memo-attachment-heading"><strong>첨부 <small>사진 {draft.photos.length}/3 · 파일 {draft.attachments?.length||0}/4</small></strong>{photoBusy&&<span role="status">첨부 준비 중…</span>}<input ref={photoInput} type="file" aria-label="사진 선택" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>void photos(e)}/></div>
 {draft.photos.length>0&&<div className="memo-photos">{draft.photos.map((photo,index)=><div className="memo-photo-draft" key={'id' in photo?photo.id:index}>{'data' in photo?<img src={'data:image/jpeg;base64,'+photo.data} alt={'첨부 사진 '+(index+1)}/>:<MemoPhoto id={photo.id} alt={'첨부 사진 '+(index+1)}/>}<button type="button" aria-label={'사진 '+(index+1)+' 삭제'} disabled={photoBusy} onClick={()=>patch({photos:draft.photos.filter((_,i)=>i!==index)})}><Icon name="close"/></button></div>)}</div>}
 <div className="memo-attachments">{draft.attachments?.map((a,i)=><MemoAttachmentCard key={'id' in a?a.id:a.name+':'+i} attachment={a} spaceId={spaceId} onRemove={()=>patch({attachments:draft.attachments?.filter((_,index)=>index!==i)})}/>)}</div>
 <p className="memo-hint">사진과 파일 합계 2.8MB까지 · 선택한 공유 범위로 함께 저장돼요.</p>
 <div className="memo-field-grid"><label>날짜<input aria-label="날짜" type="date" required min="1900-01-01" max="2099-12-31" value={draft.date} onChange={e=>patch({date:e.target.value})}/></label><label>시간<input aria-label="시간" type="time" required value={draft.time} onChange={e=>patch({time:e.target.value})}/></label>
 <label>카테고리<select aria-label="카테고리" value={draft.category} onChange={e=>patch({category:e.target.value as MemoDraft['category']})}>{Object.entries(memoCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 <label>공유 범위<select aria-label="공유 범위" value={draft.visibility} onChange={e=>patch({visibility:e.target.value as MemoDraft['visibility']})}><option value="PRIVATE">나만 보기</option>{spaceId&&<option value="GROUP">현재 그룹과 공유</option>}</select></label></div>
 <p className="memo-hint">{draft.visibility==='GROUP'?'이 메모를 등록한 그룹 안에서만 글·첨부·위치를 공유해요. 개인 공간과 다른 그룹으로 자동 공유되지 않아요.':'본인만 볼 수 있어요. 첨부와 위치도 함께 비공개로 저장해요.'}</p>
 {draft.notebook&&tool!=='notebook'&&<button type="button" className="memo-notebook-chip" onClick={()=>setTool('notebook')}><Icon name="book"/>{draft.notebook}</button>}
 <label>태그 <small>쉼표로 구분 · 최대 5개</small><input aria-label="태그" value={draft.tags.join(', ')} onChange={e=>patch({tags:e.target.value.split(',').slice(0,5).map(t=>t.trimStart())})} maxLength={128} placeholder="성장, 주말, 기억할 일"/></label>
 <label>장소<input aria-label="장소" value={draft.place} onChange={e=>patch({place:e.target.value})} maxLength={120} placeholder="예: 우리 동네 도서관"/></label>
 <div className="memo-location-actions"><button type="button" className="button compact" disabled={locating} onClick={locate}><Icon name="pin"/>{locating?'위치 확인 중…':'현재 위치 담기'}</button>{locating&&<button type="button" className="button compact" onClick={()=>{locateVersion.current++;setLocating(false);}}>위치 요청 취소</button>}{draft.location&&<><span>좌표 저장됨 · 정확도 약 {Math.round(draft.location.accuracy)}m</span><button type="button" className="button compact" onClick={()=>patch({location:null})}>위치 삭제</button></>}</div>
 </fieldset>{error&&<p className="memo-error" role="alert">{error} {consent&&<Link to="/privacy">개인정보 관리</Link>}</p>}<p className="memo-hint" role="status">{draftMessage}</p></div>
 <footer><button type="button" className="button memo-discard" disabled={busy||photoBusy} onClick={close}>취소</button><button type="button" className="button" disabled={busy||photoBusy||sensorActive||!meaningful} onClick={keep}>임시 보관</button><button type="submit" className="button primary" disabled={busy||photoBusy||locating||sensorActive||!draft.title.trim()}>{busy?'저장 중…':'메모 저장'}</button></footer></form>
 </dialog>;
}
