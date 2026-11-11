import {useEffect,useState,type FormEvent} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import type {WorkspaceMe} from '../../../shared/workspace';
import {AuthLayout,FormNotice,PasswordField} from '../components/AuthLayout';
import {Loading} from '../components/Common';
import {workspaceRequest} from '../workspace-api';

type InvitePreview={
 id:string;
 kind:'PARENT'|'CHILD';
 viewer:'GUEST'|'PARENT_PENDING'|'PARENT'|'CHILD';
 familyId?:string;
 familyName?:string;
};
const inviteIntent='iharu:opened-group-invite';
const login='/login?role=parent&next=%2Finvite';

export function GroupInvitePage(){
 const {hash}=useLocation();
 return <AuthLayout><GroupInvite key={hash} hash={hash}/></AuthLayout>;
}

function GroupInvite({hash}:{hash:string}){
 const navigate=useNavigate();
 const [invite,setInvite]=useState<InvitePreview|null>(null);
 const [me,setMe]=useState<WorkspaceMe|null>(null);
 const [loading,setLoading]=useState(true);
 const [loadError,setLoadError]=useState('');
 const [retry,setRetry]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [switchFamily,setSwitchFamily]=useState(false);
 const [joined,setJoined]=useState('');

 useEffect(()=>{
  let active=true;
  const token=hash.slice(1);
  async function load(){
   try{
    const stored=readInviteIntent();
    const preview=await workspaceRequest<InvitePreview>('invite.link.inspect',token?{token}:{});
    if(!active)return;
    if(!token&&stored&&preview.id!==stored)throw new Error('다른 초대를 열었어요. 참여하려는 초대 링크를 다시 열어 주세요.');
    try{sessionStorage.setItem(inviteIntent,preview.id);}catch{/* The server cookie also preserves the invite. */}
    if(token&&window.location.hash===hash)window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
    const profile=preview.kind==='PARENT'&&preview.viewer==='PARENT'?await workspaceRequest<WorkspaceMe>('me'):null;
    if(active){setMe(profile);setInvite(preview);}
   }catch(e){if(active)setLoadError((e as Error).message);}
   finally{if(active)setLoading(false);}
  }
  void load();
  return()=>{active=false;};
 },[hash,retry]);

 const current=me?.family;
 const self=current?.members.find(member=>member.id===me?.id);
 const sameGroup=!!current&&current.id===invite?.familyId;
 const blocked=!!current?.isHost&&current.members.length>1;

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!invite||busy)return;
  const form=new FormData(event.currentTarget);
  setBusy(true);setError('');
  try{
   if(invite.kind==='PARENT'){
    const result=await workspaceRequest<{familyName:string}>('invite.link.accept',{
     inviteId:invite.id,...(current&&self&&switchFamily?{leaveCurrent:{familyId:current.id,version:self.version}}:{})
    });
    clearInviteIntent();
    setJoined(result.familyName);
   }else{
    await workspaceRequest('invite.link.signup',{
     inviteId:invite.id,loginId:form.get('loginId'),name:form.get('name'),password:form.get('password')
    });
    clearInviteIntent();
    navigate('/family',{replace:true});
   }
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 if(loading)return <Loading label="초대장을 확인하고 있어요"/>;
 if(joined)return <section className="auth-title"><h1>그룹에 참여했어요</h1><p>{joined}에서 그룹 일정을 확인할 수 있어요.</p><Link className="button primary full" to="/family" replace>그룹 관리 열기</Link></section>;
 if(!invite)return <section className="auth-title"><h1>그룹 초대를 확인해 주세요</h1><FormNotice error={loadError}/><p>받은 초대 링크를 처음부터 다시 열거나 호스트에게 새 링크를 요청해 주세요.</p><button className="button full" onClick={()=>{setLoadError('');setLoading(true);setRetry(value=>value+1);}}>다시 확인</button></section>;
 return <>
  <div className="auth-title"><p className="eyebrow">아이하루 그룹 초대</p><h1>{invite.kind==='CHILD'?'어린이 계정 만들기':invite.familyName||'그룹에 초대받았어요'}</h1>
   <p>{invite.kind==='CHILD'?'내가 기억할 아이디와 암호를 만들면 그룹에 함께할 수 있어요.':'초대를 수락하면 그룹과 일정 등 공유 자료를 함께 볼 수 있어요.'}</p></div>
  <FormNotice error={error}/>
  {invite.viewer==='CHILD'?<><p>이미 어린이 계정으로 로그인했어요. 새 초대를 쓰려면 먼저 현재 계정에서 로그아웃해 주세요.</p><Link className="button full" to="/account">내 계정 열기</Link></>:
   invite.viewer==='PARENT_PENDING'?<><p>먼저 내 계정에서 로그인과 이메일 확인을 마친 뒤 이 초대 링크를 다시 열어 주세요.</p><Link className="button primary full" to="/account">내 계정 확인</Link></>:
   invite.kind==='CHILD'&&invite.viewer==='PARENT'?<p className="auth-notice">어린이가 사용할 기기나 로그아웃한 브라우저에서 이 링크를 다시 열어 주세요.</p>:
   invite.kind==='PARENT'&&invite.viewer==='GUEST'?<div className="auth-form"><p>로그인이나 회원가입을 마친 뒤 초대를 수락할 수 있어요. 이 브라우저에서 계속해 주세요.</p><Link className="button primary full" to={login}>로그인하고 계속</Link><Link className="button full" to="/signup?role=parent&next=%2Finvite">일반사용자 회원가입</Link></div>:
   sameGroup?<><p>이미 이 그룹과 연결돼 있어요.</p><Link className="button primary full" to="/family">내 그룹 열기</Link></>:
   blocked?<><p>현재 그룹의 호스트예요. 연결된 구성원을 먼저 정리하면 새 그룹에 참여할 수 있어요.</p><Link className="button full" to="/family">내 그룹 열기</Link></>:
   <form className="auth-form" onSubmit={submit}><fieldset disabled={busy}><legend className="sr-only">그룹 초대 수락</legend>
    {invite.kind==='CHILD'?<>
     <div className="form-field"><label htmlFor="invite-child-name">그룹에서 쓸 이름</label><input id="invite-child-name" name="name" required maxLength={24} autoComplete="nickname"/></div>
     <div className="form-field"><label htmlFor="invite-child-login">아이디</label><input id="invite-child-login" name="loginId" required autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={4} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9_]{3,19}" placeholder="영문·숫자·밑줄, 4~20자"/></div>
     <PasswordField fresh minimum={8}/>
     <p>내가 정한 이름은 그룹에 보여요. 암호는 나만 알고 있어야 해요.</p>
    </>:current&&<label className="check-option"><input type="checkbox" required checked={switchFamily} onChange={e=>setSwitchFamily(e.target.checked)}/><span>{current.name} 연결을 끝내고 새 그룹에 참여할게요. 내 자료는 그대로 있어요.</span></label>}
    <button className="button primary full" disabled={busy||!!current&&!switchFamily}>{busy?'연결하고 있어요…':invite.kind==='CHILD'?'가입하고 그룹 연결':'초대 수락'}</button>
   </fieldset></form>}
 </>;
}

function readInviteIntent(){
 try{return sessionStorage.getItem(inviteIntent);}catch{return null;}
}
function clearInviteIntent(){
 try{sessionStorage.removeItem(inviteIntent);}catch{/* The server clears the invitation cookie. */}
}
