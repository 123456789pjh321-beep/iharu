import {readFile,writeFile} from 'node:fs/promises';

// Only these two public entry points are indexable. Account/workspace entry HTML stays noindex.
const template=await readFile('dist/index.html','utf8');
const pages=[
 {slug:'service',title:'아이하루 — 가족의 하루를 잇다',description:'학교와 학원 일정, 학원비와 가족 대화를 한곳에서. 가족의 하루를 함께 챙기는 아이하루를 만나보세요.'},
 {slug:'guide',title:'아이하루 활용법 — 일정부터 학원비까지',description:'가족 일정, 3일 시간표, 학원비와 대화를 아이하루에서 함께 활용하는 방법을 알아보세요.'},
];
for(const {slug,title,description} of pages){
 const url=`https://myiharu.com/${slug}`;
 const html=template.replace(/<title>.*?<\/title>/,`<title>${title}</title>`)
  .replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${description}" />`)
  .replace(/<meta name="robots"[^>]*>/,'<meta name="robots" content="index, follow" />')
  .replace('</head>',`<link data-marketing-head rel="canonical" href="${url}" />
    <meta data-marketing-head property="og:type" content="website" />
    <meta data-marketing-head property="og:locale" content="ko_KR" />
    <meta data-marketing-head property="og:site_name" content="아이하루" />
    <meta data-marketing-head property="og:title" content="${title}" />
    <meta data-marketing-head property="og:description" content="${description}" />
    <meta data-marketing-head property="og:url" content="${url}" />
  </head>`);
 await writeFile(`dist/${slug}.html`,html);
}
console.log('Public service and guide entry HTML generated; private entry metadata unchanged.');
