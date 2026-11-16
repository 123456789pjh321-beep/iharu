import {useState} from 'react';
import type {WorkspaceItem} from '../../../shared/workspace';
import {sampleGroup,sampleMembers,sampleViewer} from '../../../shared/guest-samples';
import {ChatRoomToolbar} from './ChatRooms';
import {Icon} from './Icon';

export function SampleLabel(){return <span className="guest-sample-badge" title="실제 계정·그룹 자료가 아닌 가상 예시입니다">샘플 데이터</span>;}
const groupMessages=[
 {name:'지우',text:'오늘 피아노 끝나면 알려 줘요.',mine:true},
 {name:'민서',text:'네! 준비물도 챙겼어요 😊',mine:false},
 {name:'하준',text:'우리 같이 집에 가요!',mine:false},
];
const directMessages=[
 {name:'민서',text:'공개 수업에 실내화가 필요해요.',mine:false},
 {name:'지우',text:'달력에도 준비물을 적어 둘게요.',mine:true},
];
const personalMessages=[{name:'지우',text:'이번 주에 읽을 책을 도서관에서 빌리기.',mine:true}];
const sampleDirectRoom={
 id:'sample-direct',name:'민서',kind:'DIRECT' as const,canSend:true,
 members:[sampleViewer,sampleMembers[0]].map(member=>({...member,active:true})),
};
export function GuestChatSample({groupSelected,login}:{groupSelected:boolean;login:()=>void}){
 const [selected,setSelected]=useState<string|null>(null);
 const roomId=groupSelected?selected:null;
 const messages=groupSelected?(roomId?directMessages:groupMessages):personalMessages;
 const title=groupSelected?(roomId?'민서 · 1:1 대화':sampleGroup.name+' · '+sampleMembers.length+'명'):'나와의 대화';
 return <section className="group-chat guest-chat-sample" aria-label="샘플 대화">
  <div className="chat-rooms"><ChatRoomToolbar group={groupSelected} rooms={groupSelected?[sampleDirectRoom]:[]}
   selected={roomId} select={setSelected} create={login}/></div>
  <header className="chat-room-header">
   <span className="chat-room-avatar"><Icon name="chat"/></span>
   <div className="chat-room-details"><small className="chat-room-meta">{title}</small></div><SampleLabel/>
  </header>
  <div className="guest-sample-messages">{messages.map((message,index)=><article className={'chat-message '+(message.mine?'mine':'theirs')} key={index}>
   <div className="chat-message-content"><span className="chat-author-name">{message.name}</span><p className="chat-bubble">{message.text}</p></div>
  </article>)}</div>
  <div className="guest-sample-compose">
   <button type="button" className="guest-message-input" onClick={login}>메시지를 남겨 보세요</button>
   <button type="button" className="icon-button" aria-label="메시지 보내기" onClick={login}><Icon name="arrow"/></button>
  </div>
 </section>;
}
export function GuestNotesSample({items,create}:{items:WorkspaceItem[];create:(date:string)=>void}){return <div className="guest-notes-sample"><SampleLabel/><div className="personal-item-list">{items.map(item=><article className="personal-item" key={item.id}><button type="button" className="personal-item-main direct-item" onClick={()=>create(item.data.date)}><span className="personal-item-category">{item.data.date}</span><h3>{item.data.title}</h3><p>{item.data.note}</p></button></article>)}</div></div>;}
