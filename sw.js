/* Offline service worker. Keep VERSION in sync with package.json and manifest. */
const VERSION='1.0.1';
const CACHE=`h3tc-studio-v${VERSION}`;
const ASSETS=[
  './','./index.html','./styles.css','./manifest.webmanifest',
  './src/app.js','./src/core.js','./src/layout.js','./src/sidecar.js','./src/schema-data.js',
  './public/icons/icon.svg','./public/icons/icon-192.png',
  './public/icons/icon-512.png','./public/icons/apple-touch-icon.png',
  './samples/tesseract.txt'
];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('h3tc-studio-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}
    return response;
  }).catch(async()=>(await caches.match('./index.html'))||new Response('Offline page unavailable',{status:503})));
 }else{
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok&&response.type==='basic'){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy));}
    return response;
  })));
 }
});
