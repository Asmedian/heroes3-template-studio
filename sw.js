/* Offline service worker. Keep VERSION in sync with package.json and manifest. */
const VERSION = '1.5.5';
const CACHE = `h3tc-studio-v${VERSION}`;
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './manifest.webmanifest',
    './styles/base.css',
    './styles/diagram.css',
    './styles/controls.css',
    './styles/template-picker.css',
    './locales/en.json',
    './locales/ru.json',
    './src/app.js',
    './src/core.js',
    './src/layout.js',
    './src/layout-motifs.js',
    './src/geometry.js',
    './src/sidecar.js',
    './src/schema-data.js',
    './src/i18n.js',
    './src/visuals.js',
    './src/ui/template-picker.js',
    './public/icons/icon.svg',
    './public/icons/icon-192.png',
    './public/icons/icon-512.png',
    './public/icons/apple-touch-icon.png',
    './public/icons/icon-192-maskable.png',
    './public/icons/icon-512-maskable.png',
    './public/template-icons/chest.png',
    './public/template-icons/crystal.png',
    './public/template-icons/fort-1.svg',
    './public/template-icons/fort-2.svg',
    './public/template-icons/fort-3.svg',
    './public/template-icons/fort-4.svg',
    './public/template-icons/fort-5.svg',
    './public/template-icons/fort-6.svg',
    './public/template-icons/fort-7.svg',
    './public/template-icons/fort-8.svg',
    './public/template-icons/fort-neutral.svg',
    './public/template-icons/fort.svg',
    './public/template-icons/gems.png',
    './public/template-icons/gold.png',
    './public/template-icons/mercury.png',
    './public/template-icons/ore.png',
    './public/template-icons/sulfur.png',
    './public/template-icons/swords.svg',
    './public/template-icons/village-1.svg',
    './public/template-icons/village-2.svg',
    './public/template-icons/village-3.svg',
    './public/template-icons/village-4.svg',
    './public/template-icons/village-5.svg',
    './public/template-icons/village-6.svg',
    './public/template-icons/village-7.svg',
    './public/template-icons/village-8.svg',
    './public/template-icons/village-neutral.svg',
    './public/template-icons/village.svg',
    './public/template-icons/wood.png',
    './templates/catalog.json',
    './templates/upstream-layouts.json',
    './templates/01-skirmish.txt',
    './templates/02-skirmish-m-u-200.txt',
    './templates/03-speed1-m-u.txt',
    './templates/04-speed2-m-u.txt',
    './templates/05-spider-1-3.txt',
    './templates/06-superslam.txt',
    './templates/07-triad.txt',
    './templates/08-true-random.txt',
    './templates/09-vortex.txt',
    './templates/10-hota-nostalgia.txt',
    './templates/11-original.txt',
    './templates/12-2sm2c.txt',
    './templates/13-2sm4d.txt',
    './templates/14-2sm4d-2.txt',
    './templates/15-2sm4d-3.txt',
    './templates/16-4sm0d.txt',
    './templates/17-6lm-8mm-mix.txt',
    './templates/18-6lm10.txt',
    './templates/19-6lm10a.txt',
    './templates/20-8mm0b.txt',
    './templates/21-8mm6.txt',
    './templates/22-8mm6a.txt',
    './templates/23-8xm12.txt',
    './templates/24-8xm12a.txt',
    './templates/25-anarchy-v1-01.txt',
    './templates/26-around-a-marsh.txt',
    './templates/27-balance.txt',
    './templates/28-balance-m-u-200.txt',
    './templates/29-blockbuster.txt',
    './templates/30-clash-of-dragons.txt',
    './templates/31-coldshadow-fantasy.txt',
    './templates/32-cube.txt',
    './templates/33-diamond.txt',
    './templates/34-dwarf-tunnels.txt',
    './templates/35-extreme.txt',
    './templates/36-extreme-ii.txt',
    './templates/37-fear.txt',
    './templates/38-frozen-dragons.txt',
    './templates/39-gimlis-revenge.txt',
    './templates/40-guerilla.txt',
    './templates/41-h3dm1.txt',
    './templates/42-headquarters.txt',
    './templates/43-hypercube.txt',
    './templates/44-jebus-cross.txt',
    './templates/45-long-run.txt',
    './templates/46-marathon.txt',
    './templates/47-match-terrain.txt',
    './templates/48-midnightmix.txt',
    './templates/49-mini-nostalgia.txt',
    './templates/50-mt-diamond.txt',
    './templates/51-mt-skirmish.txt',
    './templates/52-nostalgia.txt',
    './templates/53-nostalgia-xxl.txt',
    './templates/54-oceans-eleven.txt',
    './templates/55-panic.txt',
    './templates/56-poor-jebus.txt',
    './templates/57-reckless.txt',
    './templates/58-roadrunner.txt',
    './templates/59-schaafworld.txt'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key.startsWith('h3tc-studio-') && key !== CACHE)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

const freshRequest = request => new Request(request, { cache: 'no-store' });

async function networkFirst(request, fallback) {
    try {
        const response = await fetch(freshRequest(request));
        if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
    }
    catch {
        return (
            (await caches.match(request, { ignoreSearch: true }))
            || (fallback ? await caches.match(fallback, { ignoreSearch: true }) : null)
            || new Response('Resource unavailable offline', { status: 503 })
        );
    }
}

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    const scopePath = new URL(self.registration.scope).pathname;

    if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, './index.html'));
        return;
    }

    // Application code and catalogs are network-first so reopening an installed/PWA
    // copy cannot silently combine a new HTML document with stale JS/CSS from an old cache.
    const relative = url.pathname.slice(scopePath.length);
    const mutable = /\.(?:html|css|js|webmanifest|json)$/i.test(relative);
    if (mutable) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Large immutable template/icon assets remain fast and available offline.
    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request).then(response => {
            if (response.ok && response.type === 'basic') {
                const copy = response.clone();
                caches.open(CACHE).then(cache => cache.put(request, copy));
            }
            return response;
        }))
    );
});
