import {wordmarkPath,wordmarkViewBox} from '../../../shared/brand';

/** Outlined letterforms keep the iHaru logo identical before and after fonts load. */
export function BrandWordmark({className=''}:{className?:string}){
 return <svg className={'iharu-wordmark '+className} viewBox={wordmarkViewBox} fill="currentColor" aria-hidden="true" focusable="false"><path d={wordmarkPath}/></svg>;
}
