import {useId} from 'react';
import {GroupInviteShareButton} from './GroupInviteShare';
import {Icon} from './Icon';
import {InviteLinkActions} from './InviteLinkActions';

const appInviteLink='https://myiharu.com/timetable';

export function GroupInviteManager({canInvite,showGroup=true}:{canInvite:boolean;showGroup?:boolean}){
 const id=useId();
 return <section className="account-card">
  <div className="card-title"><h2><Icon name="key"/>초대 링크</h2></div>
  {showGroup&&<section className="group-invite-option" aria-labelledby={id+'-group'}>
   <h3 id={id+'-group'}>그룹 초대</h3>
   {canInvite?<GroupInviteShareButton label="그룹 초대 링크"/>:<p>그룹 초대 링크는 호스트에게 요청해 주세요.</p>}
  </section>}
  <section className="group-invite-option" aria-labelledby={id+'-app'}>
   <h3 id={id+'-app'}>일반 초대</h3>
   <p>아이하루 시간표를 열어 앱을 둘러볼 수 있어요.</p>
   <InviteLinkActions url={appInviteLink}/>
  </section>
 </section>;
}
