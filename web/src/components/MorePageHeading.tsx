import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {GroupInviteShareButton} from './GroupInviteShare';
import {Icon} from './Icon';

export function MorePageHeading({title,id,backTo='/more',backLabel='더보기로 돌아가기'}:{
 title:ReactNode;id?:string;backTo?:string;backLabel?:string;
}){
 return <header className="more-page-heading">
  <Link to={backTo} className="icon-button" aria-label={backLabel}><Icon name="arrow" className="flip"/></Link>
  <h1 id={id} tabIndex={id?-1:undefined}>{title}</h1>
  <GroupInviteShareButton/>
 </header>;
}
