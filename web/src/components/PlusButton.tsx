import type {ButtonHTMLAttributes} from 'react';
import {Icon} from './Icon';

export function PlusButton({label,className='',type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string}){
 return <button {...props} type={type} className={`button primary plus-action ${className}`} aria-label={label} title={label}><Icon name="plus"/></button>;
}
