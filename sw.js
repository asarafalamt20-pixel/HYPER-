const DB='hyper-upload-queue', STORE='tasks';
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
async function notify(){const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});cs.forEach(c=>c.postMessage({type:'HYPER_UPLOAD_RESUME'}))}
self.addEventListener('sync',e=>{if(e.tag==='hyper-upload')e.waitUntil(notify())});
self.addEventListener('message',e=>{if(e.data?.type==='HYPER_SYNC')e.waitUntil?.(notify())});
