/* Offline service worker. Keep VERSION in sync with package.json and manifest. */
const VERSION='1.2.0';
const CACHE=`h3tc-studio-v${VERSION}`;
const ASSETS=[
  './','./index.html','./styles.css','./manifest.webmanifest',
  './src/app.js','./src/core.js','./src/layout.js','./src/sidecar.js','./src/schema-data.js',
  './src/i18n.js','./src/visuals.js',
  './public/icons/icon.svg','./public/icons/icon-192.png',
  './public/icons/icon-512.png','./public/icons/apple-touch-icon.png',
  './public/icons/icon-192-maskable.png','./public/icons/icon-512-maskable.png',
  './samples/catalog.json',
  './samples/01-skirmish.txt',
  './samples/02-skirmish-m-u-200.txt',
  './samples/03-speed1-m-u.txt',
  './samples/04-speed2-m-u.txt',
  './samples/05-spider-1-3.txt',
  './samples/06-superslam.txt',
  './samples/07-triad.txt',
  './samples/08-true-random.txt',
  './samples/09-vortex.txt',
  './samples/10-hota-nostalgia.txt',
  './samples/11-original.txt',
  './samples/12-2sm2c.txt',
  './samples/13-2sm4d.txt',
  './samples/14-2sm4d-2.txt',
  './samples/15-2sm4d-3.txt',
  './samples/16-4sm0d.txt',
  './samples/17-6lm-8mm-mix.txt',
  './samples/18-6lm10.txt',
  './samples/19-6lm10a.txt',
  './samples/20-8mm0b.txt',
  './samples/21-8mm6.txt',
  './samples/22-8mm6a.txt',
  './samples/23-8xm12.txt',
  './samples/24-8xm12a.txt',
  './samples/25-anarchy-v1-01.txt',
  './samples/26-around-a-marsh.txt',
  './samples/27-balance.txt',
  './samples/28-balance-m-u-200.txt',
  './samples/29-blockbuster.txt',
  './samples/30-clash-of-dragons.txt',
  './samples/31-coldshadow-fantasy.txt',
  './samples/32-cube.txt',
  './samples/33-diamond.txt',
  './samples/34-dwarf-tunnels.txt',
  './samples/35-extreme.txt',
  './samples/36-extreme-ii.txt',
  './samples/37-fear.txt',
  './samples/38-frozen-dragons.txt',
  './samples/39-gimlis-revenge.txt',
  './samples/40-guerilla.txt',
  './samples/41-h3dm1.txt',
  './samples/42-headquarters.txt',
  './samples/43-hypercube.txt',
  './samples/44-jebus-cross.txt',
  './samples/45-long-run.txt',
  './samples/46-marathon.txt',
  './samples/47-match-terrain.txt',
  './samples/48-midnightmix.txt',
  './samples/49-mini-nostalgia.txt',
  './samples/50-mt-diamond.txt',
  './samples/51-mt-skirmish.txt',
  './samples/52-nostalgia.txt',
  './samples/53-nostalgia-xxl.txt',
  './samples/54-oceans-eleven.txt',
  './samples/55-panic.txt',
  './samples/56-poor-jebus.txt',
  './samples/57-reckless.txt',
  './samples/58-roadrunner.txt',
  './samples/59-schaafworld.txt'
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
