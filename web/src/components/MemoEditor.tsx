import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import {memoCategories,memoFields,type MemoDraft,type MemoPhotoInput} from '../../../shared/memos';
import {workspaceRequest} from '../workspace-api';
import {Icon} from './Icon';
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
export function MemoEditor({initial,profileId,onClose,onSaved}:{initial:MemoDraft;profileId:string;onClose:()=>void;onSaved:(date:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),pending=useRef(false),mounted=useRef(true),photoInput=useRef<HTMLInputElement>(null);
 const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[photoBusy,setPhotoBusy]=useState(false),[locating,setLocating]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false),[draftMessage,setDraftMessage]=useState('');
 const key='iharu-memo-draft:'+profileId,meaningful=!!(draft.title||draft.body||draft.photos.length||draft.place||draft.location);
 useEffect(()=>{mounted.current=true;dialog.current?.showModal();return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(!meaningful)return;const timer=setTimeout(()=>{try{sessionStorage.setItem(key,JSON.stringify({draft,expiresAt:Date.now()+86400000}));setDraftMessage('작성 중인 내용을 이 탭에 임시 보관했어요.');}catch{setDraftMessage('임시 보관 공간이 부족해요. 창을 닫기 전에 저장해 주세요.');}},300);return()=>clearTimeout(timer);},[draft,key,meaningful]);
 useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(meaningful){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[meaningful]);
 function patch(value:Partial<MemoDraft>){setDraft(old=>({...old,...value}));}
 function close(){if(busy||photoBusy)return;if(meaningful&&!window.confirm('작성 중인 내용을 버리고 닫을까요?'))return;try{sessionStorage.removeItem(key);}catch{}onClose();}
 async function photos(e:ChangeEvent<HTMLInputElement>){const files=Array.from(e.target.files||[]);e.target.value='';if(files.length+draft.photos.length>3){setError('사진은 메모 하나에 3장까지 추가할 수 있어요.');return;}setPhotoBusy(true);setError('');try{const added:MemoPhotoInput[]=[];for(const file of files)added.push(await prepareMemoPhoto(file));if(mounted.current)setDraft(old=>({...old,photos:[...old.photos,...added]}));}catch(e){setError((e as Error).message);}finally{if(mounted.current)setPhotoBusy(false);}}
 function locate(){
  if(!navigator.geolocation){setError('이 기기에서는 위치를 가져올 수 없어요. 장소 이름을 직접 입력해 주세요.');return;}
  setLocating(true);setError('');
  navigator.geolocation.getCurrentPosition(p=>{if(!mounted.current)return;patch({location:{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:new Date(p.timestamp).toISOString()}});setLocating(false);},e=>{if(!mounted.current)return;setLocating(false);setError(e.code===1?'위치 권한이 꺼져 있어요. 허용하거나 장소 이름을 직접 입력해 주세요.':'현재 위치를 확인하지 못했어요. 다시 시도하거나 장소 이름을 입력해 주세요.');},{enableHighAccuracy:true,timeout:12000,maximumAge:0});
 }
 async function save(){if(pending.current||photoBusy||locating)return;const parsed=memoFields.safeParse({...Object.fromEntries(Object.keys(memoFields.shape).map(k=>[k,draft[k as keyof MemoDraft]])),tags:[...new Set(draft.tags.map(t=>t.trim()).filter(Boolean))]});if(!parsed.success){setError('제목·날짜·시간과 입력 내용을 확인해 주세요.');return;}pending.current=true;setBusy(true);setError('');setConsent(false);try{await workspaceRequest('memos.save',{...parsed.data,id:draft.id,version:draft.version,photos:draft.photos});try{sessionStorage.removeItem(key);}catch{}onSaved(draft.date);}catch(e){setError((e as Error).message);setConsent((e as {code?:string}).code==='LEGAL_ACCEPTANCE_REQUIRED');}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 return <dialog ref={dialog} className="memo-editor" aria-labelledby="memo-editor-title" onCancel={e=>{e.preventDefault();close();}}>
  <form onSubmit={e=>{e.preventDefault();void save();}}><header><h2 id="memo-editor-title">{draft.version?'메모 수정':'메모 작성'}</h2><button type="button" className="icon-button" aria-label="메모 작성 닫기" onClick={close} disabled={busy||photoBusy}><Icon name="close"/></button></header>
  <div className="memo-editor-body"><fieldset disabled={busy}><legend className="sr-only">메모 내용</legend>
   <label>제목<input value={draft.title} onChange={e=>patch({title:e.target.value})} maxLength={100} placeholder="어떤 순간을 기억하고 싶나요?" required autoFocus/></label>
   <label>글<textarea value={draft.body} onChange={e=>patch({body:e.target.value})} maxLength={10000} rows={5} placeholder="오늘의 일, 아이의 한마디, 떠오른 생각을 자유롭게 남겨요."/></label>
   <div className="memo-field-grid"><label>날짜<input type="date" required min="1900-01-01" max="2099-12-31" value={draft.date} onChange={e=>patch({date:e.target.value})}/></label><label>시간<input type="time" required value={draft.time} onChange={e=>patch({time:e.target.value})}/></label>
   <label>카테고리<select value={draft.category} onChange={e=>patch({category:e.target.value as MemoDraft['category']})}>{Object.entries(memoCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>공유 범위<select value={draft.visibility} onChange={e=>patch({visibility:e.target.value as MemoDraft['visibility']})}><option value="PRIVATE">나만 보기</option><option value="GROUP">현재 그룹과 공유</option></select></label></div>
   <p className="memo-hint">{draft.visibility==='GROUP'?'글·사진·위치가 현재 그룹에 공유돼요. 그룹을 옮기면 이 메모도 본인 자료로 새 그룹에 공유돼요.':'본인만 볼 수 있어요. 사진과 위치도 함께 비공개로 저장해요.'}</p>
   <label>태그 <small>쉼표로 구분 · 최대 5개</small><input value={draft.tags.join(', ')} onChange={e=>patch({tags:e.target.value.split(',').slice(0,5).map(t=>t.trimStart())})} maxLength={128} placeholder="성장, 주말, 기억할 일"/></label>
   <div className="memo-attachment-heading"><strong>사진 <small>{draft.photos.length}/3</small></strong><button type="button" className="button compact" disabled={photoBusy||draft.photos.length>=3} onClick={()=>photoInput.current?.click()}><Icon name="image"/>{photoBusy?'사진 준비 중…':'사진 추가'}</button><input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>void photos(e)}/></div>
   {draft.photos.length>0&&<div className="memo-photos">{draft.photos.map((photo,index)=><div className="memo-photo-draft" key={'id' in photo?photo.id:index}>{'data' in photo?<img src={'data:image/jpeg;base64,'+photo.data} alt={'첨부 사진 '+(index+1)}/>:<MemoPhoto id={photo.id} alt={'첨부 사진 '+(index+1)}/>}<button type="button" aria-label={'사진 '+(index+1)+' 삭제'} disabled={photoBusy} onClick={()=>patch({photos:draft.photos.filter((_,i)=>i!==index)})}><Icon name="close"/></button></div>)}</div>}
   <label>장소<input value={draft.place} onChange={e=>patch({place:e.target.value})} maxLength={120} placeholder="예: 우리 동네 도서관"/></label>
   <div className="memo-location-actions"><button type="button" className="button compact" disabled={locating} onClick={locate}><Icon name="pin"/>{locating?'위치 확인 중…':'현재 위치 담기'}</button>{draft.location&&<><span>좌표 저장됨 · 정확도 약 {Math.round(draft.location.accuracy)}m</span><button type="button" className="button compact" onClick={()=>patch({location:null})}>위치 삭제</button></>}</div>
  </fieldset>{error&&<p className="memo-error" role="alert">{error} {consent&&<Link to="/privacy">개인정보 관리</Link>}</p>}<p className="memo-hint" role="status">{draftMessage}</p></div>
  <footer><button type="button" className="button" disabled={busy||photoBusy} onClick={close}>취소</button><button type="submit" className="button primary" disabled={busy||photoBusy||locating||!draft.title.trim()}>{busy?'저장 중…':'메모 저장'}</button></footer></form>
 </dialog>;
}
