// Turn the baseline export into the hand-authored app shell comparison: a textured paper layer in
// the root (painted over the boot paper colour), the texture preloaded, the bundle loaded after the
// first contentful paint exactly as the prerendered prototype loads it.
import { readFileSync, writeFileSync } from 'node:fs';
const [path] = process.argv.slice(2);
let html = readFileSync(path, 'utf8');
const texture = '/assets/assets/paper/handmade-paper.7637e6600d2982210f85a1a9ff5b9cba.webp';
const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((m) => m[1]);
html = html.replace(/<script src="[^"]+" defer><\/script>/g, '');
html = html.replace(
  '<head>',
  `<head>\n<link rel="preload" as="image" href="${texture}" fetchpriority="high"><style>.paper-shell{position:absolute;left:0;right:0;bottom:0;top:75px}@media (orientation:landscape){.paper-shell{top:0;left:84px}}</style>`
);
const loader = `(function(){function load(){var l=${JSON.stringify(scripts)};for(var i=0;i<l.length;i++){var x=document.createElement('script');x.src=l[i];x.async=false;document.body.appendChild(x)}}if(document.visibilityState!=='visible')return load();var done=false;function go(){if(!done){done=true;load()}}try{new PerformanceObserver(function(l,o){if(l.getEntriesByName('first-contentful-paint').length){o.disconnect();setTimeout(go)}}).observe({type:'paint',buffered:true})}catch(e){go()}setTimeout(go,2000)})();`;
html = html.replace(
  '<div id="root"></div>',
  `<div id="root"><div aria-hidden="true" class="paper-shell" style="background:url(&quot;${texture}&quot;) 0 0"></div></div>\n<script>${loader}</script>`
);
writeFileSync(path, html);
