import {useEffect,useRef,useState} from 'react';
import type {MemoTrashItem,MemoTrashList} from '../../../../shared/memos';
import {workspaceRequest} from '../../workspace-api';
import {Icon} from '../Icon';

const deletedLabel=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function MemoTrash({spaceId,spaceName,onClose,onChanged}:{spaceId:string|null;spaceName:string;onClose:()=>void;onChanged:(date?:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),mounted=useRef(false),writeLock=useRef(false);
 const [data,setData]=useState<MemoTrashList|null>(null),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState('');
 useEffect(()=>{
  mounted.current=true;const node=dialog.current,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  node?.showModal();return()=>{mounted.current=false;node?.close();if(opener?.isConnected)opener.focus({preventScroll:true});};
 },[]);
 useEffect(()=>{
  let active=true;setLoading(true);setData(null);
  workspaceRequest<MemoTrashList>('memos.trash.list',{offset,limit:20},spaceId).then(result=>{
   if(!active)return;
   if(offset>0&&!result.items.length){setOffset(Math.max(0,offset-20));return;}
   setData(result);
  }).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[offset,refresh,spaceId]);
 function close(){if(!writeLock.current)onClose();}
 async function act(item:MemoTrashItem,operation:'restore'|'purge'){
  if(writeLock.current)return;
  if(operation==='purge'&&!window.confirm('“'+item.title+'” 글과 모든 사진·파일을 영구 삭제할까요?\n영구 삭제 후에는 복원할 수 없어요.'))return;
  writeLock.current=true;setBusy(item.id);setError('');setMessage('');
  try{
   const result=await workspaceRequest<{date:string}>('memos.trash.'+operation,{id:item.id,version:item.version},spaceId);
   if(!mounted.current)return;
   setMessage(operation==='restore'?'원래 날짜와 공간으로 복원했어요.':'영구 삭제했어요.');
   onChanged(operation==='restore'?result.date:undefined);
  }catch(e){if(mounted.current)setError((e as Error).message);}
  finally{writeLock.current=false;if(mounted.current){setBusy('');setRefresh(n=>n+1);}}
 }
 return <dialog ref={dialog} className="memo-detail memo-trash" aria-labelledby="memo-trash-title" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
  <div className="memo-sheet-handle" aria-hidden="true"/>
  <header className="memo-detail-heading"><h2 id="memo-trash-title">휴지통</h2><button type="button" className="icon-button" aria-label="휴지통 닫기" disabled={!!busy} onClick={close}><Icon name="close"/></button></header>
  <div className="memo-detail-body">
   <p className="memo-trash-guide"><strong>{spaceName}</strong>에서 내가 삭제한 글이에요. 복원하면 원래 날짜와 공유 설정으로 돌아가요.</p>
   {error&&<p className="memo-trash-error" role="alert">{error} <button type="button" className="button compact" disabled={loading||!!busy} onClick={()=>{setError('');setRefresh(n=>n+1);}}>다시 불러오기</button></p>}
   <p className="memo-detail-status" role="status">{message|| (loading?'휴지통을 불러오고 있어요':'')}</p>
   {!loading&&data?.total===0&&<div className="memo-empty"><Icon name="trash"/><h3>휴지통이 비어 있어요</h3><p>삭제한 글은 이곳에서 확인하고 복원할 수 있어요.</p></div>}
   {!!data?.items.length&&<ul className="memo-trash-list">{data.items.map(item=><li key={item.id}>
    <article aria-label={item.title}><h3>{item.title}</h3><p>작성일 {item.date} · 사진 {item.photoCount} · 파일 {item.attachmentCount}</p><p><time dateTime={item.deletedAt}>{deletedLabel(item.deletedAt)}</time> 삭제</p>
     <div className="memo-trash-actions"><button type="button" className="button compact" disabled={!!busy} onClick={()=>void act(item,'restore')}>복원</button><button type="button" className="button compact danger" disabled={!!busy} onClick={()=>void act(item,'purge')}><Icon name="trash"/>영구 삭제</button>{busy===item.id&&<span role="status">처리 중…</span>}</div>
    </article>
   </li>)}</ul>}
   {data&&data.total>20&&<nav className="memo-pagination" aria-label="휴지통 페이지"><button type="button" className="button compact" disabled={offset===0||loading||!!busy} onClick={()=>{setError('');setOffset(n=>n-20);}}>이전</button><span>{offset/20+1} / {Math.ceil(data.total/20)}</span><button type="button" className="button compact" disabled={offset+20>=data.total||loading||!!busy} onClick={()=>{setError('');setOffset(n=>n+20);}}>다음</button></nav>}
  </div>
 </dialog>;
}
