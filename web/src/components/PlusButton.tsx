import type {ButtonHTMLAttributes} from 'react';

export function PlusButton({label,text='등록',className='',type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string;text?:string}){
 return <button {...props} type={type} className={`button compact registration-action ${className}`} aria-label={label} title={label}>{text}</button>;
}
