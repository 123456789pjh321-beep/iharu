// Keep the web wordmark and install icons on the same outlined letterforms as React.
import {writeFile,mkdir} from 'node:fs/promises';
import {wordmarkPath,wordmarkViewBox} from '../shared/brand.ts';
await mkdir('web/public/brand',{recursive:true});
await writeFile('web/public/brand/iharu-wordmark.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${wordmarkViewBox}" role="img" aria-label="iHaru"><title>iHaru</title><path fill="#176b56" d="${wordmarkPath}"/></svg>\n`);
// Full iHaru wordmark stays inside the circular mask safe area as well as rounded squares.
const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>iHaru</title><rect width="512" height="512" rx="112" fill="#176b56"/><path d="${wordmarkPath}" fill="#fff" transform="translate(80 202) scale(.07)"/></svg>\n`;
await writeFile('web/public/app-icon.svg',icon);
await writeFile('web/public/icon.svg',icon);
console.log('Synchronized the iHaru wordmark and web icons.');
