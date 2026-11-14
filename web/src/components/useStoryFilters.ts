import {useLayoutEffect,useRef} from 'react';
import {useSearchParams} from 'react-router-dom';

/** Merge rapid category/search changes before the router commits its next render. */
export function useStoryFilters(){
 const [params,setParams]=useSearchParams(),pending=useRef(params);
 useLayoutEffect(()=>{pending.current=params;},[params]);
 const commit=(next:URLSearchParams)=>{pending.current=next;setParams(next,{replace:true});};
 const update=(key:string,value:string)=>{
  const next=new URLSearchParams(pending.current);
  if(value&&value!=='전체')next.set(key,value);else next.delete(key);
  commit(next);
 };
 return {params,update,reset:()=>commit(new URLSearchParams())};
}
