import {ledgerAmountLimit} from './ledger.js';

type Fraction={numerator:bigint;denominator:bigint};
type CalculatorResult={value:string;amount:number|null}|{error:string}|null;
const expressionLimit=80;
const displayScale=10n**10n;
const operator=/^[+*/-]$/;

function operand(token:string|undefined):Fraction|null{
 if(!token||!/^\d+(\.\d*)?%?$/.test(token))return null;
 const percentage=token.endsWith('%');
 const [whole,decimal='']=token.replace(/%$/,'').split('.');
 return {numerator:BigInt(whole+decimal),denominator:10n**BigInt(decimal.length+(percentage?2:0))};
}

function add(a:Fraction,b:Fraction):Fraction{
 return {
  numerator:a.numerator*b.denominator+b.numerator*a.denominator,
  denominator:a.denominator*b.denominator,
 };
}

export function calculateLedgerExpression(expression:string):CalculatorResult{
 if(expression.length>expressionLimit)return {error:'계산식이 너무 길어요.'} as const;
 const tokens=expression.match(/\d+(?:\.\d*)?%?|[+*/-]/g)??[];
 if(tokens.join('')!==expression)return null;
 const negative=tokens[0]==='-';
 const first=negative?1:0;
 let term=operand(tokens[first]);
 if(!term)return null;
 if(negative)term.numerator=-term.numerator;
 let total:Fraction={numerator:0n,denominator:1n};
 for(let index=first+1;index<tokens.length;index+=2){
  const operation=tokens[index],next=operand(tokens[index+1]);
  if(!operator.test(operation)||!next)return null;
  switch(operation){
   case '*':
    term={numerator:term.numerator*next.numerator,denominator:term.denominator*next.denominator};
    break;
   case '/':
    if(next.numerator===0n)return {error:'0으로 나눌 수 없어요.'} as const;
    term={numerator:term.numerator*next.denominator,denominator:term.denominator*next.numerator};
    break;
   default:
    total=add(total,term);
    term=operation==='-'?{...next,numerator:-next.numerator}:next;
  }
 }
 const {numerator,denominator}=add(total,term);
 const magnitude=numerator<0n?-numerator:numerator;
 const scaled=(2n*magnitude*displayScale+denominator)/(2n*denominator);
 const whole=String(scaled/displayScale);
 if(whole.length>24)return {error:'계산 결과가 너무 커요.'} as const;
 const decimal=String(scaled%displayScale).padStart(10,'0').replace(/0+$/,'');
 const value=(numerator<0n&&scaled!==0n?'-':'')+whole+(decimal?'.'+decimal:'');
 // Amounts are rounded once from the exact result to a whole won.
 const rounded=(2n*magnitude+denominator)/(2n*denominator);
 const amount=numerator>0n&&rounded>=1n&&rounded<=BigInt(ledgerAmountLimit)?Number(rounded):null;
 return {value,amount} as const;
}

export function appendLedgerKey(expression:string,key:string){
 if(key==='clear')return '';
 if(key==='backspace')return expression.slice(0,-1);
 if(operator.test(key)){
  if(!expression||expression==='-')return key==='-'?'-':expression;
  return operator.test(expression.at(-1)!)?expression.slice(0,-1)+key:expression+key;
 }
 if(expression.length>=expressionLimit)return expression;
 const current=expression.split(/[+*/-]/).at(-1)!;
 if(current.endsWith('%'))return expression;
 if(key==='%'&&current)return expression+'%';
 if(key==='.'&&!current.includes('.'))return expression+(current?'.':'0.');
 if(/^\d$/.test(key))return current==='0'?expression.slice(0,-1)+key:expression+key;
 return expression;
}
