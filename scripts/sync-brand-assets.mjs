// Keep the first-paint logo and install icons on the same outlined letterforms as React.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {wordmarkPath,wordmarkViewBox} from '../shared/brand.ts';
const inline=`<svg class="launch-logo" viewBox="${wordmarkViewBox}" fill="currentColor" aria-hidden="true" focusable="false"><path d="${wordmarkPath}"/></svg>`;
const file='web/index.html',html=await readFile(file,'utf8');
if(!html.includes('<!-- iharu-wordmark:start -->'))throw new Error('Launch wordmark insertion point missing');
await writeFile(file,html.replace(/<!-- iharu-wordmark:start -->[\s\S]*?<!-- iharu-wordmark:end -->/,'<!-- iharu-wordmark:start -->'+inline+'<!-- iharu-wordmark:end -->'));
await mkdir('web/public/brand',{recursive:true});
await writeFile('web/public/brand/iharu-wordmark.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${wordmarkViewBox}" role="img" aria-label="iHaru"><title>iHaru</title><path fill="#176b56" d="${wordmarkPath}"/></svg>\n`);
// Full iHaru wordmark stays inside the circular mask safe area as well as rounded squares.
const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>iHaru</title><rect width="512" height="512" rx="112" fill="#176b56"/><path d="${wordmarkPath}" fill="#fff" transform="translate(80 202) scale(.07)"/></svg>\n`;
await writeFile('web/public/app-icon.svg',icon);
await writeFile('web/public/icon.svg',icon);
console.log('Synchronized iHaru launch, wordmark and web icons.');
