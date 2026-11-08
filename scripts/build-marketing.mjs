import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {publicPaths,publicPage} from '../shared/public-content.ts';
const template=await readFile('dist/index.html','utf8');
const escape=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(const path of publicPaths){
 const page=publicPage(path),title=escape(page.title),description=escape(page.description),url='https://myiharu.com'+path;
 const structured=page.post?{'@context':'https://schema.org','@type':page.post.section==='blog'?'BlogPosting':'Article',headline:page.post.title,description:page.description,datePublished:page.post.date,author:{'@type':'Organization',name:'아이하루'},mainEntityOfPage:url}:null;
 let html=template.replace(/<title>.*?<\/title>/,`<title>${title}</title>`)
  .replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${description}" />`)
  .replace(/<meta name="robots"[^>]*>/,'<meta name="robots" content="index, follow" />')
  .replace('</head>',`<link data-marketing-head rel="canonical" href="${url}" />
    <meta data-marketing-head property="og:type" content="${page.post?'article':'website'}" />
    <meta data-marketing-head property="og:locale" content="ko_KR" />
    <meta data-marketing-head property="og:site_name" content="아이하루" />
    <meta data-marketing-head property="og:title" content="${title}" />
    <meta data-marketing-head property="og:description" content="${description}" />
    <meta data-marketing-head property="og:url" content="${url}" />
    ${structured?`<script data-marketing-head type="application/ld+json">${JSON.stringify(structured).replaceAll('<','\\u003c')}</script>`:''}
  </head>`);
 const fallback=`<noscript><main><h1>${title}</h1><p>${description}</p>${page.post?page.post.sections.map(part=>`<section><h2>${escape(part.heading)}</h2>${part.paragraphs.map(text=>`<p>${escape(text)}</p>`).join('')}${part.steps?`<ol>${part.steps.map(text=>`<li>${escape(text)}</li>`).join('')}</ol>`:''}</section>`).join(''):''}<nav><a href="/service">서비스</a> · <a href="/guide">활용방법</a> · <a href="/notices">공지사항</a> · <a href="/blog">블로그</a></nav></main></noscript>`;
 html=html.replace('</body>',fallback+'</body>');const file=`dist${path}.html`;await mkdir(dirname(file),{recursive:true});await writeFile(file,html);
}
await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicPaths.map(path=>`<url><loc>https://myiharu.com${path}</loc></url>`).join('')}</urlset>`);
await writeFile('dist/robots.txt','User-agent: *\nAllow: /service\nAllow: /guide\nAllow: /notices\nAllow: /blog\nAllow: /assets/\nAllow: /stickers/\nDisallow: /\nSitemap: https://myiharu.com/sitemap.xml\n');
console.log(`Generated ${publicPaths.length} public entry pages and sitemap. Account/workspace entry stays noindex.`);
