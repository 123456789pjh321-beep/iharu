import {useState,type KeyboardEvent} from 'react';
import {appendLedgerKey,calculateLedgerExpression} from '../../../shared/ledger-calculator';
import {ledgerWon,type LedgerEntryPreset} from '../../../shared/ledger';

const keys=[
 ['clear','C','전체 지우기'],['backspace','⌫','한 자리 지우기'],['%','%','백분율'],['/','÷','나누기'],
 ['7','7'],['8','8'],['9','9'],['*','×','곱하기'],
 ['4','4'],['5','5'],['6','6'],['-','−','빼기'],
 ['1','1'],['2','2'],['3','3'],['+','+','더하기'],
 ['0','0'],['.','.','소수점'],['=','=','계산하기'],
] as const;
const displayExpression=(expression:string)=>expression.replaceAll('*',' × ').replaceAll('/',' ÷ ').replaceAll('-',' − ').replaceAll('+',' + ');
function displayNumber(value:string){
 const [whole,decimal]=value.split('.');
 return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimal?'.'+decimal:'');
}

export function LedgerCalculator({hidden,onUse}:{hidden:boolean;onUse:(preset:LedgerEntryPreset)=>void}){
 const [state,setState]=useState({expression:'',settled:false});
 const result=calculateLedgerExpression(state.expression);
 const answer=result&&'value' in result?result:null;
 const error=result&&'error' in result?result.error:'';
 const amount=answer?.amount??null;

 function press(key:string){
  setState(previous=>{
   if(key==='=')return {...previous,settled:true};
   let source=previous.expression;
   if(previous.settled&&key!=='backspace'&&key!=='clear'){
    const value=calculateLedgerExpression(source);
    if(value&&'value' in value)source=/^[+*/%-]$/.test(key)?value.value:'';
   }
   return {expression:appendLedgerKey(source,key),settled:false};
  });
 }
 function onKeyDown(event:KeyboardEvent<HTMLElement>){
  if(event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.key==='Enter'&&event.target instanceof HTMLButtonElement)return;
  const key=event.key==='Enter'?'=':event.key==='Backspace'?'backspace':event.key==='Escape'||event.key.toLowerCase()==='c'?'clear':event.key;
  if(!keys.some(([value])=>value===key))return;
  event.preventDefault();
  press(key);
 }
 return <section className="ledger-calculator" aria-label="가계부 계산기" hidden={hidden} tabIndex={0} onKeyDown={onKeyDown}>
  <div className="ledger-calculator-display">
   <p className="ledger-calculator-expression" aria-label="계산식">{displayExpression(state.expression)}</p>
   <output aria-label="계산 결과">{answer?displayNumber(answer.value):state.expression?'—':'0'}</output>
   {error&&<p role="status">{error}</p>}
   {!error&&state.settled&&!answer&&state.expression&&<p role="status">계산식을 완성해 주세요.</p>}
   {answer&&answer.value!=='0'&&amount===null&&<p role="status">1원부터 10억원까지 등록할 수 있어요.</p>}
   {amount!==null&&answer?.value!==String(amount)&&<p>등록 금액 {ledgerWon(amount)}</p>}
  </div>
  <div className="ledger-calculator-keys" role="group" aria-label="계산기 키패드">
   {keys.map(([key,label,name])=><button type="button" key={key} data-key={key}
    className={['+','-','*','/','%'].includes(key)?'calculator-operation':undefined}
    aria-label={name||label} onClick={()=>press(key)}>{label}</button>)}
  </div>
  <div className="ledger-calculator-actions">
   <button type="button" className="button" disabled={amount===null} onClick={()=>{if(amount!==null)onUse({amount,flow:'INCOME'});}}>수입으로 등록</button>
   <button type="button" className="button primary" disabled={amount===null} onClick={()=>{if(amount!==null)onUse({amount,flow:'EXPENSE'});}}>지출로 등록</button>
  </div>
 </section>;
}
