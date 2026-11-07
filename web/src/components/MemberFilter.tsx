import type {WorkspaceMember} from '../../../shared/workspace';

export function MemberFilter({members,value,onChange,label,className=''}:{members:WorkspaceMember[];value:string;onChange:(id:string)=>void;label:string;className?:string}){
 return <div className={'member-filters '+className} role="group" aria-label={label}><button type="button" aria-pressed={value==='all'} onClick={()=>onChange('all')}>전체 보기</button>{members.map(m=><button type="button" key={m.id} aria-pressed={value===m.id} onClick={()=>onChange(m.id)}>{m.name}</button>)}</div>;
}
