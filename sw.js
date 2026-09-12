const DB='hyper-upload-queue', STORE='tasks';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function all(){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(STORE,'readonly').objectStore(STORE).getAll();t.onsuccess=()=>res(t.result);t.onerror=()=>rej(t.error)})}
async function del(id){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite').objectStore(STORE).delete(id);t.onsuccess=()=>res();t.onerror=()=>rej(t.error)})}
async function syncUploads(){for(const x of await all()){try{const f=x.file;const d=new FormData();d.append('title',x.title);d.append('description',x.description||'');d.append('type',x.type||'video');d.append('category',x.category||'Discover');d.append('video',f,x.filename||f.name);if(x.thumbnail)d.append('thumbnail',x.thumbnail,x.thumbnailName||x.thumbnail.name);const r=await fetch('/api/videos',{method:'POST',headers:{Authorization:'Bearer '+x.token},body:d});if(r.ok)await del(x.id)}catch(e){throw e}}}
self.addEventListener('sync',e=>{if(e.tag==='hyper-upload')e.waitUntil(syncUploads())});
self.addEventListener('message',e=>{if(e.data?.type==='HYPER_SYNC')syncUploads().catch(()=>{})});
