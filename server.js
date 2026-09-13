const express=require('express'),cors=require('cors'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),multer=require('multer'),path=require('path'),fs=require('fs');
const {Pool}=require('pg');
const {S3Client,PutObjectCommand,DeleteObjectCommand}=require('@aws-sdk/client-s3');
const app=express(),PORT=process.env.PORT||10000,SECRET=process.env.JWT_SECRET||'dev-secret';
app.use(cors());app.use(express.json());
// Always fetch fresh feed/API data so newly published videos appear for every user/device.
app.use((req,res,next)=>{if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');next()});
const defaultUploadDir=fs.existsSync('/var/data')?path.join('/var/data','hyper-uploads'):path.join(__dirname,'uploads');
const dir=process.env.HYPER_UPLOAD_DIR||defaultUploadDir;
fs.mkdirSync(dir,{recursive:true});
const storageConfigured=!!(process.env.STORAGE_ENDPOINT&&process.env.STORAGE_BUCKET&&process.env.STORAGE_ACCESS_KEY_ID&&process.env.STORAGE_SECRET_ACCESS_KEY&&process.env.STORAGE_PUBLIC_BASE_URL);
const s3=storageConfigured?new S3Client({endpoint:process.env.STORAGE_ENDPOINT,region:process.env.STORAGE_REGION||'auto',credentials:{accessKeyId:process.env.STORAGE_ACCESS_KEY_ID,secretAccessKey:process.env.STORAGE_SECRET_ACCESS_KEY},forcePathStyle:false}):null;
function storageKey(userId,filename){return `users/${userId}/${Date.now()}-${String(filename).replace(/[^a-zA-Z0-9._-]/g,'_')}`}
async function uploadPermanent(localPath,key,contentType){if(!storageConfigured)return null;await s3.send(new PutObjectCommand({Bucket:process.env.STORAGE_BUCKET,Key:key,Body:fs.createReadStream(localPath),ContentType:contentType||'application/octet-stream'}));return process.env.STORAGE_PUBLIC_BASE_URL.replace(/\/$/,'')+'/'+key.split('/').map(encodeURIComponent).join('/')}
async function deletePermanent(url){if(!storageConfigured||!url)return;const base=process.env.STORAGE_PUBLIC_BASE_URL.replace(/\/$/,'')+'/';if(!String(url).startsWith(base))return;const key=decodeURIComponent(String(url).slice(base.length));try{await s3.send(new DeleteObjectCommand({Bucket:process.env.STORAGE_BUCKET,Key:key}))}catch(e){console.warn('Storage delete failed:',e.message)}}
const upload=multer({storage:multer.diskStorage({destination:dir,filename:(r,f,cb)=>cb(null,Date.now()+'-'+f.originalname.replace(/[^a-zA-Z0-9._-]/g,'_'))}),limits:{fileSize:250*1024*1024}});
app.use('/uploads',express.static(dir));
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false}):null;
const demo=[
{id:1,title:'Meri Life Ka Safar | Village Vlog 2025',channel:'Hyper Vlogs',username:'hypervlogs',views:1200000,likes:28000,duration:'10:24',type:'video',thumbnail:'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=80',video_url:'https://storage.googleapis.com/coverr-main/mp4/Mt_Baker.mp4'},
{id:2,title:'Mountains Calling | Travel Vlog',channel:'Explore More',username:'exploremore',views:856000,likes:19000,duration:'12:36',type:'video',thumbnail:'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',video_url:'https://storage.googleapis.com/coverr-main/mp4/Footboys.mp4'},
{id:3,title:'Life is better in green! ❤️',channel:'Hyper Vlogs',views:420000,likes:42000,duration:'0:25',type:'short',thumbnail:'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80',video_url:'https://storage.googleapis.com/coverr-main/mp4/Footboys.mp4'}];

async function db(){
 if(!pool)return;
 await pool.query(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,username VARCHAR(50) UNIQUE NOT NULL,email VARCHAR(160) UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name VARCHAR(100) NOT NULL,full_name VARCHAR(100),channel_name VARCHAR(100),channel_description TEXT DEFAULT '',created_at TIMESTAMPTZ DEFAULT NOW(),avatar_url TEXT DEFAULT NULL);
 CREATE TABLE IF NOT EXISTS videos(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,title VARCHAR(200) NOT NULL,description TEXT DEFAULT '',video_url TEXT NOT NULL,thumbnail_url TEXT,type VARCHAR(20) DEFAULT 'video',category VARCHAR(30) DEFAULT 'Vlog',views INTEGER DEFAULT 0,likes INTEGER DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW(),upload_key TEXT UNIQUE,duration_seconds INTEGER DEFAULT 0);
 ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT; ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE; ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(100); ALTER TABLE users ADD COLUMN IF NOT EXISTS channel_name VARCHAR(100); ALTER TABLE users ADD COLUMN IF NOT EXISTS channel_description TEXT DEFAULT ''; UPDATE users SET full_name=COALESCE(full_name,display_name),channel_name=COALESCE(channel_name,display_name) WHERE full_name IS NULL OR channel_name IS NULL; ALTER TABLE videos ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'Vlog'; ALTER TABLE videos ADD COLUMN IF NOT EXISTS upload_key TEXT; CREATE UNIQUE INDEX IF NOT EXISTS videos_upload_key_uidx ON videos(upload_key) WHERE upload_key IS NOT NULL; CREATE TABLE IF NOT EXISTS subscriptions(subscriber_id INTEGER REFERENCES users(id) ON DELETE CASCADE,channel_id INTEGER REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(subscriber_id,channel_id));
 ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0;
 CREATE TABLE IF NOT EXISTS comments(id SERIAL PRIMARY KEY,video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,text TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS watch_history(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,video_id INTEGER NOT NULL,watched_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(user_id,video_id));
 CREATE TABLE IF NOT EXISTS liked_videos(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,video_id INTEGER NOT NULL,liked_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(user_id,video_id));
 CREATE TABLE IF NOT EXISTS saved_videos(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,video_id INTEGER NOT NULL,saved_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(user_id,video_id)); CREATE TABLE IF NOT EXISTS saved_collections(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,name VARCHAR(100) NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(user_id,name)); CREATE TABLE IF NOT EXISTS saved_collection_items(collection_id INTEGER REFERENCES saved_collections(id) ON DELETE CASCADE,video_id INTEGER NOT NULL,saved_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(collection_id,video_id)); CREATE TABLE IF NOT EXISTS ad_events(id SERIAL PRIMARY KEY,video_id INTEGER,kind VARCHAR(20) NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());`);
}
const tok=u=>jwt.sign({id:u.id,username:u.username},SECRET,{expiresIn:'30d'});
function auth(req,res,next){const h=req.headers.authorization||'';try{req.user=jwt.verify(h.startsWith('Bearer ')?h.slice(7):'',SECRET);next()}catch{return res.status(401).json({message:'Login required'})}}

app.get('/api/me/profile',auth,async(req,res)=>{if(!pool)return res.status(503).json({message:'Database is not connected on the server'});try{let q=await pool.query("SELECT id,username,email,display_name,COALESCE(full_name,display_name) full_name,COALESCE(channel_name,display_name) channel_name,COALESCE(channel_description,'') channel_description,avatar_url FROM users WHERE id=$1",[req.user.id]);res.json({user:q.rows[0]})}catch(e){res.status(500).json({message:e.message})}});
app.put('/api/me/profile',auth,async(req,res)=>{if(!pool)return res.status(503).json({message:'Database is not connected on the server'});try{let a=String(req.body.avatar_url||'');let fn=String(req.body.full_name||'').trim();let cn=String(req.body.channel_name||'').trim();let cd=String(req.body.channel_description||'').trim();if(a&&a.length>1100000)return res.status(400).json({message:'Profile picture is too large'});if(fn&&(fn.length<2||fn.length>100))return res.status(400).json({message:'User name must be 2-100 characters'});if(cn&&(cn.length<2||cn.length>100))return res.status(400).json({message:'Channel name must be 2-100 characters'});if(cd.length>500)return res.status(400).json({message:'Channel description must be 500 characters or less'});let q=await pool.query("UPDATE users SET avatar_url=COALESCE(NULLIF($1,''),avatar_url),full_name=COALESCE(NULLIF($2,''),full_name),channel_name=COALESCE(NULLIF($3,''),channel_name),channel_description=$4,display_name=COALESCE(NULLIF($3,''),display_name) WHERE id=$5 RETURNING id,username,email,display_name,COALESCE(full_name,display_name) full_name,COALESCE(channel_name,display_name) channel_name,COALESCE(channel_description,'') channel_description,avatar_url",[a,fn,cn,cd,req.user.id]);res.json({user:q.rows[0]})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/health',(r,s)=>s.json({ok:true,app:'HYPER',storage:storageConfigured?'permanent':'local',message:storageConfigured?'Permanent storage enabled':(dir.startsWith('/var/data')?'Persistent Render disk storage enabled':'Local disk storage; configure HYPER_UPLOAD_DIR or permanent object storage for deployment-safe media')}));
app.get('/api/studio/overview',auth,async(req,res)=>{
 if(!pool)return res.json({channel:{username:req.user.username,channel_name:req.user.username,subscriber_count:0},stats:{uploads:0,videos:0,shorts:0,views:0,likes:0},topVideos:[],monthlyViews:[],monetization:{enabled:false,balance:0}});
 try{
  const [profile,stats,top]=await Promise.all([
   pool.query(`SELECT username,display_name,COALESCE(channel_name,display_name) channel_name,COALESCE(channel_description,'') channel_description,avatar_url,(SELECT COUNT(*) FROM subscriptions s WHERE s.channel_id=u.id)::int subscriber_count FROM users u WHERE u.id=$1`,[req.user.id]),
   pool.query(`SELECT COUNT(*)::int uploads,COUNT(*) FILTER(WHERE type='video')::int videos,COUNT(*) FILTER(WHERE type='short')::int shorts,COALESCE(SUM(views),0)::int views,COALESCE(SUM(likes),0)::int likes FROM videos WHERE user_id=$1`,[req.user.id]),
   pool.query(`SELECT id,title,type,category,views,likes,duration_seconds,created_at,thumbnail_url FROM videos WHERE user_id=$1 ORDER BY (views + likes*25) DESC,created_at DESC LIMIT 10`,[req.user.id])
  ]);
  const months=await pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',created_at),'Mon YYYY') month,COUNT(*)::int uploads,COALESCE(SUM(views),0)::int views FROM videos WHERE user_id=$1 GROUP BY 1,DATE_TRUNC('month',created_at) ORDER BY DATE_TRUNC('month',created_at) DESC LIMIT 6`,[req.user.id]);
  res.json({channel:profile.rows[0],stats:stats.rows[0],topVideos:top.rows,monthlyViews:months.rows.reverse(),monetization:{enabled:false,balance:0}})
 }catch(e){res.status(500).json({message:e.message})}
});
app.get('/api/studio/content',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT id,title,type,category,views,likes,duration_seconds,created_at,thumbnail_url,video_url FROM videos WHERE user_id=$1 ORDER BY created_at DESC`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});


app.post('/api/auth/register',async(req,res)=>{
 try{
  if(!pool)return res.status(503).json({message:'Database is not connected on the server'});
  let {username,email,password,displayName}=req.body;
  username=(username||'').trim(); email=(email||'').trim().toLowerCase(); displayName=(displayName||username).trim();
  if(!username||!email||!password)return res.status(400).json({message:'Name, email and password are required'});
  if(password.length<6)return res.status(400).json({message:'Password must be at least 6 characters'});
  if(!/^[a-zA-Z0-9_]{3,50}$/.test(username))return res.status(400).json({message:'Username: 3-50 letters, numbers or _ only'});
  let h=await bcrypt.hash(password,10);
  let q=await pool.query('INSERT INTO users(username,email,password_hash,display_name,full_name,channel_name) VALUES($1,$2,$3,$4,$4,$4) RETURNING id,username,email,display_name,full_name,channel_name,channel_description,avatar_url',[username.toLowerCase(),email,h,displayName]);
  let u=q.rows[0]; res.json({user:u,token:tok(u)});
 }catch(e){res.status(400).json({message:e.code==='23505'?'Username or email already exists':e.message})}
});
app.post('/api/auth/login',async(req,res)=>{
 try{
  if(!pool)return res.status(503).json({message:'Database is not connected on the server'});
  let email=(req.body.email||'').trim().toLowerCase(), q=await pool.query('SELECT * FROM users WHERE email=$1',[email]),u=q.rows[0];
  if(!u||!(await bcrypt.compare(req.body.password||'',u.password_hash)))return res.status(401).json({message:'Invalid email or password'});
  let x={id:u.id,username:u.username,email:u.email,display_name:u.display_name,full_name:u.full_name||u.display_name,channel_name:u.channel_name||u.display_name,channel_description:u.channel_description||'',avatar_url:u.avatar_url,is_private:!!u.is_private};res.json({user:x,token:tok(x)});
 }catch(e){res.status(500).json({message:e.message})}
});
app.put('/api/me/settings',auth,async(req,res)=>{if(!pool)return res.json({is_private:!!req.body.is_private});try{let v=!!req.body.is_private;let q=await pool.query('UPDATE users SET is_private=$1 WHERE id=$2 RETURNING is_private',[v,req.user.id]);res.json({is_private:!!q.rows[0]?.is_private})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/channels/:username',async(req,res)=>{
 if(!pool){let v=demo.find(x=>(x.username||'').toLowerCase()===req.params.username.toLowerCase());return v?res.json({username:v.username,display_name:v.channel,channel_name:v.channel,avatar_url:v.avatar_url||null,subscriber_count:0}):res.status(404).json({message:'Channel not found'})}
 try{let q=await pool.query("SELECT u.id,u.username,u.email,u.display_name,COALESCE(u.full_name,u.display_name) full_name,COALESCE(u.channel_name,u.display_name) channel_name,COALESCE(u.channel_description,'') channel_description,u.avatar_url,u.is_private,(SELECT COUNT(*) FROM subscriptions s WHERE s.channel_id=u.id) subscriber_count FROM users u WHERE LOWER(u.username)=LOWER($1)",[req.params.username]);if(!q.rows[0])return res.status(404).json({message:'Channel not found'});res.json(q.rows[0])}catch(e){res.status(500).json({message:e.message})}
});
app.get('/api/me/subscriptions',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT u.id,u.username,u.email,u.display_name,COALESCE(u.full_name,u.display_name) full_name,COALESCE(u.channel_name,u.display_name) channel_name,COALESCE(u.channel_description,'') channel_description,u.avatar_url,(SELECT COUNT(*) FROM subscriptions s2 WHERE s2.channel_id=u.id) subscriber_count FROM subscriptions s JOIN users u ON u.id=s.channel_id WHERE s.subscriber_id=$1 ORDER BY u.channel_name`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/subscription-videos',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.avatar_url,(SELECT COUNT(*) FROM subscriptions s2 WHERE s2.channel_id=u.id)::int subscriber_count FROM videos v JOIN users u ON u.id=v.user_id JOIN subscriptions s ON s.channel_id=u.id WHERE s.subscriber_id=$1 ORDER BY v.created_at DESC`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/channels/:username/subscribed',auth,async(req,res)=>{if(!pool)return res.json({subscribed:false});try{let q=await pool.query('SELECT u.id,(SELECT COUNT(*) FROM subscriptions s2 WHERE s2.channel_id=u.id) subscriber_count,EXISTS(SELECT 1 FROM subscriptions s WHERE s.subscriber_id=$2 AND s.channel_id=u.id) subscribed FROM users u WHERE LOWER(u.username)=LOWER($1)',[req.params.username,req.user.id]);if(!q.rows[0])return res.status(404).json({message:'Channel not found'});res.json(q.rows[0])}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/search',async(req,res)=>{
 const q=String(req.query.q||'').trim();
 if(!q)return res.json({channels:[],videos:[]});
 if(!pool){
  const x=q.toLowerCase();
  const channels=demo.filter(v=>(v.channel||'').toLowerCase().includes(x)).map(v=>({username:v.username,display_name:v.channel,channel_name:v.channel,avatar_url:v.avatar_url||null,subscriber_count:0}));
  const seen=new Set(); const cs=channels.filter(c=>{if(seen.has(c.username))return false;seen.add(c.username);return true});
  return res.json({channels:cs,videos:demo.filter(v=>((v.title||'')+' '+(v.channel||'')+' '+(v.category||'')).toLowerCase().includes(x))});
 }
 try{
  const like='%'+q.replace(/[%_]/g,'\$&')+'%';
  const cr=await pool.query(`SELECT u.username,u.display_name,u.channel_name,u.avatar_url,(SELECT COUNT(*) FROM subscriptions s WHERE s.channel_id=u.id)::int subscriber_count
    FROM users u WHERE u.is_private IS NOT TRUE AND (u.username ILIKE $1 ESCAPE '\\' OR u.display_name ILIKE $1 ESCAPE '\\' OR u.channel_name ILIKE $1 ESCAPE '\\')
    ORDER BY u.channel_name ASC LIMIT 20`,[like]);
  const vr=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.channel_name,u.avatar_url,(SELECT COUNT(*) FROM subscriptions s WHERE s.channel_id=u.id)::int subscriber_count
    FROM videos v JOIN users u ON u.id=v.user_id
    WHERE u.is_private IS NOT TRUE AND (v.title ILIKE $1 ESCAPE '\\' OR v.description ILIKE $1 ESCAPE '\\' OR u.username ILIKE $1 ESCAPE '\\' OR u.display_name ILIKE $1 ESCAPE '\\' OR u.channel_name ILIKE $1 ESCAPE '\\')
    ORDER BY v.created_at DESC LIMIT 100`,[like]);
  res.json({channels:cr.rows,videos:vr.rows});
 }catch(e){res.status(500).json({message:e.message})}
});
app.get('/api/videos',async(req,res)=>{
 const type=req.query.type==='short'?'short':req.query.type==='video'?'video':null;
 const category=String(req.query.category||'').trim();
 if(!pool){
  let list=demo.slice();
  if(type)list=list.filter(x=>x.type===type);
  if(category==='Popular') list=list.filter(x=>x.type!=='short').sort((a,b)=>(Number(b.views||0)+Number(b.likes||0)*25)-(Number(a.views||0)+Number(a.likes||0)*25));
  else if(category&&category!=='All')list=list.filter(x=>(x.category||'Discover').toLowerCase()===category.toLowerCase());
  return res.json(list);
 }
 try{
  const params=[]; const where=[];
  if(type){params.push(type);where.push(`v.type=$${params.length}`)}
  if(category&&category!=='All'&&category!=='Popular'){params.push(category);where.push(`LOWER(v.category)=LOWER($${params.length})`)}
  const privacyClause='u.is_private IS NOT TRUE'; where.push(privacyClause);
  const order=category==='Popular' ? 'ORDER BY ((v.views::numeric)+(v.likes::numeric*25)) DESC, v.created_at DESC' : 'ORDER BY v.created_at DESC';
  const q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.channel_name,u.avatar_url,(SELECT COUNT(*) FROM subscriptions s WHERE s.channel_id=u.id)::int subscriber_count FROM videos v JOIN users u ON u.id=v.user_id WHERE ${where.join(' AND ')} ${order}`,params);
  res.json(q.rows);
 }catch(e){res.status(500).json({message:e.message})}
});

app.get('/api/videos/:id',async(req,res)=>{
 if(!pool){let v=demo.find(x=>String(x.id)===req.params.id);return v?res.json(v):res.status(404).json({message:'Not found'})}
 try{let q=await pool.query('SELECT v.*,u.username,u.display_name channel,u.avatar_url,(SELECT COUNT(*) FROM subscriptions s WHERE s.channel_id=u.id)::int subscriber_count FROM videos v JOIN users u ON u.id=v.user_id WHERE v.id=$1',[req.params.id]);if(!q.rows[0])return res.status(404).json({message:'Not found'});await pool.query('UPDATE videos SET views=views+1 WHERE id=$1',[req.params.id]);res.json(q.rows[0])}
 catch(e){res.status(500).json({message:e.message})}
});
app.post('/api/videos',auth,upload.fields([{name:'video',maxCount:1},{name:'thumbnail',maxCount:1}]),async(req,res)=>{
 if(!pool)return res.status(503).json({message:'Database is not connected. Add DATABASE_URL and restart the server.'});
 const vf=req.files?.video?.[0];
 if(!vf)return res.status(400).json({message:'Video required'});
 const allowed=['Discover','Popular','Entertainment','News','Education','Sports','Music','Gaming','Lifestyle','Creator'];
 const cat=allowed.includes(req.body.category)?req.body.category:'Discover';
 const durationSeconds=Math.max(0,Math.round(Number(req.body.duration_seconds||0)));
 try{let v='/uploads/'+vf.filename,t=req.files.thumbnail?.[0]?'/uploads/'+req.files.thumbnail[0].filename:null;
 const uploadKey=String(req.body.upload_id||'').trim()||null;
 if(uploadKey){const existing=await pool.query('SELECT * FROM videos WHERE upload_key=$1 LIMIT 1',[uploadKey]);if(existing.rows[0]){try{fs.unlinkSync(path.join(dir,vf.filename));if(req.files.thumbnail?.[0])fs.unlinkSync(path.join(dir,req.files.thumbnail[0].filename))}catch{}return res.status(200).json(existing.rows[0])}}
 if(storageConfigured){
   const vk=storageKey(req.user.id,vf.originalname); v=await uploadPermanent(path.join(dir,vf.filename),vk,vf.mimetype);
   let thumb=req.files.thumbnail?.[0]; if(thumb){const tk=storageKey(req.user.id,thumb.originalname);t=await uploadPermanent(path.join(dir,thumb.filename),tk,thumb.mimetype)}
 }
 let q=await pool.query('INSERT INTO videos(user_id,title,description,video_url,thumbnail_url,type,category,upload_key,duration_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[req.user.id,String(req.body.title||'Untitled').slice(0,200),req.body.description||'',v,t,req.body.type==='short'?'short':'video',cat,uploadKey,durationSeconds]);
 if(storageConfigured){try{fs.unlinkSync(path.join(dir,vf.filename));if(req.files.thumbnail?.[0])fs.unlinkSync(path.join(dir,req.files.thumbnail[0].filename))}catch{}}
 res.status(201).json(q.rows[0])}
 catch(e){try{fs.unlinkSync(path.join(dir,vf.filename));if(req.files.thumbnail?.[0])fs.unlinkSync(path.join(dir,req.files.thumbnail[0].filename))}catch{}console.error('Publish error:',e);res.status(500).json({message:storageConfigured?'Permanent storage upload failed. Please try again.':'Publish failed. Please try again.'})}
});
app.put('/api/videos/:id',auth,async(req,res)=>{if(!pool)return res.status(503).json({message:'Database is not connected'});try{let q=await pool.query('SELECT id,title,description,category,type FROM videos WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!q.rows[0])return res.status(404).json({message:'Video not found or not yours'});let title=String(req.body.title??q.rows[0].title).trim(),description=String((req.body.description??q.rows[0].description)||'').trim(),category=String((req.body.category??q.rows[0].category)||'Discover').trim();if(!title||title.length>200)return res.status(400).json({message:'Title must be 1-200 characters'});if(description.length>5000)return res.status(400).json({message:'Description is too long'});let r=await pool.query('UPDATE videos SET title=$1,description=$2,category=$3 WHERE id=$4 AND user_id=$5 RETURNING *',[title,description,category,req.params.id,req.user.id]);res.json(r.rows[0])}catch(e){res.status(500).json({message:e.message})}});
app.delete('/api/videos/:id',auth,async(req,res)=>{if(!pool)return res.status(503).json({message:'Database is not connected'});try{let q=await pool.query('SELECT video_url,thumbnail_url FROM videos WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!q.rows[0])return res.status(404).json({message:'Video not found or not yours'});await pool.query('DELETE FROM videos WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);for(const u of [q.rows[0].video_url,q.rows[0].thumbnail_url]){if(u&&String(u).startsWith('/uploads/')){try{fs.unlinkSync(path.join(dir,String(u).replace(/^\/uploads\//,'')))}catch{}}else await deletePermanent(u)}res.json({deleted:true})}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/ads/event',async(req,res)=>{
 try{if(pool){const id=Number(req.body.video_id);const kind=String(req.body.kind||'impression').slice(0,20);await pool.query('INSERT INTO ad_events(video_id,kind) VALUES($1,$2)',[Number.isFinite(id)?id:null,kind])}res.json({ok:true})}catch(e){res.status(500).json({message:e.message})}
});
app.post('/api/videos/:id/view',async(req,res)=>{
 if(!pool){let v=demo.find(x=>String(x.id)===String(req.params.id));return v?res.json({views:(v.views||0)+1}):res.status(404).json({message:'Not found'})}
 try{let q=await pool.query('UPDATE videos SET views=views+1 WHERE id=$1 RETURNING views',[req.params.id]);if(!q.rows[0])return res.status(404).json({message:'Not found'});res.json({views:q.rows[0].views})}catch(e){res.status(500).json({message:e.message})}
});
app.post('/api/videos/:id/like',auth,async(req,res)=>{
 if(!pool)return res.json({likes:0,liked:true});
 try{
  let x=await pool.query('SELECT 1 FROM liked_videos WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.id]);
  if(x.rowCount){await pool.query('DELETE FROM liked_videos WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.id]);let q=await pool.query('UPDATE videos SET likes=GREATEST(likes-1,0) WHERE id=$1 RETURNING likes',[req.params.id]);return res.json({likes:q.rows[0].likes,liked:false})}
  await pool.query('INSERT INTO liked_videos(user_id,video_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,req.params.id]);let q=await pool.query('UPDATE videos SET likes=likes+1 WHERE id=$1 RETURNING likes',[req.params.id]);res.json({likes:q.rows[0].likes,liked:true})
 }catch(e){res.status(500).json({message:e.message})}
});
app.post('/api/channels/:username/subscribe',auth,async(req,res)=>{
 if(!pool)return res.json({subscribed:true,subscriber_count:0});
 try{let q=await pool.query('SELECT id FROM users WHERE LOWER(username)=LOWER($1)',[req.params.username]);if(!q.rows[0])return res.status(404).json({message:'Channel not found'});let c=q.rows[0].id;if(c===req.user.id)return res.status(400).json({message:'Cannot subscribe to yourself'});let x=await pool.query('SELECT 1 FROM subscriptions WHERE subscriber_id=$1 AND channel_id=$2',[req.user.id,c]);let subscribed;if(x.rowCount){await pool.query('DELETE FROM subscriptions WHERE subscriber_id=$1 AND channel_id=$2',[req.user.id,c]);subscribed=false}else{await pool.query('INSERT INTO subscriptions(subscriber_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,c]);subscribed=true}let n=await pool.query('SELECT COUNT(*)::int subscriber_count FROM subscriptions WHERE channel_id=$1',[c]);res.json({subscribed,subscriber_count:n.rows[0].subscriber_count})}catch(e){res.status(500).json({message:e.message})}
});
app.post('/api/videos/:id/subscribe',auth,async(req,res)=>{
 if(!pool)return res.json({subscribed:true,subscriber_count:0});
 try{let q=await pool.query('SELECT u.username FROM videos v JOIN users u ON u.id=v.user_id WHERE v.id=$1',[req.params.id]);if(!q.rows[0])return res.status(404).json({message:'Not found'});let c=await pool.query('SELECT id FROM users WHERE LOWER(username)=LOWER($1)',[q.rows[0].username]);let cid=c.rows[0].id;if(cid===req.user.id)return res.status(400).json({message:'Cannot subscribe to yourself'});let x=await pool.query('SELECT 1 FROM subscriptions WHERE subscriber_id=$1 AND channel_id=$2',[req.user.id,cid]);let subscribed;if(x.rowCount){await pool.query('DELETE FROM subscriptions WHERE subscriber_id=$1 AND channel_id=$2',[req.user.id,cid]);subscribed=false}else{await pool.query('INSERT INTO subscriptions(subscriber_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,cid]);subscribed=true}let n=await pool.query('SELECT COUNT(*)::int subscriber_count FROM subscriptions WHERE channel_id=$1',[cid]);res.json({subscribed,subscriber_count:n.rows[0].subscriber_count})}catch(e){res.status(500).json({message:e.message})}
});
app.post('/api/videos/:id/history',auth,async(req,res)=>{if(!pool)return res.json({ok:true});try{await pool.query('INSERT INTO watch_history(user_id,video_id,watched_at) VALUES($1,$2,NOW()) ON CONFLICT(user_id,video_id) DO UPDATE SET watched_at=NOW()',[req.user.id,req.params.id]);res.json({ok:true})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/history',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM watch_history h JOIN videos v ON v.id=h.video_id LEFT JOIN users u ON u.id=v.user_id WHERE h.user_id=$1 ORDER BY h.watched_at DESC LIMIT 100`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.delete('/api/me/history/:videoId',auth,async(req,res)=>{if(!pool)return res.json({ok:true});try{await pool.query('DELETE FROM watch_history WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.videoId]);res.json({ok:true})}catch(e){res.status(500).json({message:e.message})}});
app.delete('/api/me/history',auth,async(req,res)=>{if(!pool)return res.json({ok:true});try{await pool.query('DELETE FROM watch_history WHERE user_id=$1',[req.user.id]);res.json({ok:true})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/liked',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM liked_videos l JOIN videos v ON v.id=l.video_id LEFT JOIN users u ON u.id=v.user_id WHERE l.user_id=$1 ORDER BY l.liked_at DESC LIMIT 100`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/videos',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query('SELECT v.*,u.username,u.display_name channel,u.avatar_url,(SELECT COUNT(*) FROM subscriptions s WHERE s.channel_id=u.id)::int subscriber_count FROM videos v JOIN users u ON u.id=v.user_id WHERE v.user_id=$1 ORDER BY v.created_at DESC',[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/videos/:id/save',auth,async(req,res)=>{if(!pool)return res.json({saved:true});try{let x=await pool.query('SELECT 1 FROM saved_videos WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.id]);if(x.rowCount){await pool.query('DELETE FROM saved_videos WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.id]);return res.json({saved:false})}await pool.query('INSERT INTO saved_videos(user_id,video_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,req.params.id]);res.json({saved:true})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/saved',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM saved_videos s JOIN videos v ON v.id=s.video_id LEFT JOIN users u ON u.id=v.user_id WHERE s.user_id=$1 ORDER BY s.saved_at DESC LIMIT 100`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/saved-collections',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT c.id,c.name,c.created_at,COUNT(i.video_id)::int video_count FROM saved_collections c LEFT JOIN saved_collection_items i ON i.collection_id=c.id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at DESC`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/me/saved-collections',auth,async(req,res)=>{if(!pool)return res.json({id:0,name:String(req.body.name||'Saved')});try{let name=String(req.body.name||'').trim();if(name.length<1||name.length>100)return res.status(400).json({message:'Save file name must be 1-100 characters'});let q=await pool.query('INSERT INTO saved_collections(user_id,name) VALUES($1,$2) ON CONFLICT(user_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id,name',[req.user.id,name]);res.json(q.rows[0])}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/saved-collections/:id',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM saved_collection_items i JOIN saved_collections c ON c.id=i.collection_id JOIN videos v ON v.id=i.video_id LEFT JOIN users u ON u.id=v.user_id WHERE c.id=$1 AND c.user_id=$2 ORDER BY i.saved_at DESC`,[req.params.id,req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.delete('/api/me/saved-collections/:id',auth,async(req,res)=>{if(!pool)return res.json({ok:true});try{await pool.query('DELETE FROM saved_collections WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);res.json({ok:true})}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/me/saved-collections/:id/videos/:videoId',auth,async(req,res)=>{if(!pool)return res.json({saved:true});try{let c=await pool.query('SELECT id FROM saved_collections WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!c.rowCount)return res.status(404).json({message:'Save file not found'});await pool.query('INSERT INTO saved_collection_items(collection_id,video_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.params.id,req.params.videoId]);res.json({saved:true})}catch(e){res.status(500).json({message:e.message})}});
app.delete('/api/me/saved-collections/:id/videos/:videoId',auth,async(req,res)=>{if(!pool)return res.json({saved:false});try{await pool.query('DELETE FROM saved_collection_items i USING saved_collections c WHERE i.collection_id=c.id AND c.id=$1 AND c.user_id=$2 AND i.video_id=$3',[req.params.id,req.user.id,req.params.videoId]);res.json({saved:false})}catch(e){res.status(500).json({message:e.message})}});


app.get('/api/videos/:id/comments',async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query('SELECT c.id,c.text,c.created_at,u.display_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.video_id=$1 ORDER BY c.created_at DESC LIMIT 100',[req.params.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/videos/:id/comments',auth,async(req,res)=>{if(!pool)return res.status(503).json({message:'Database is not connected on the server'});try{let q=await pool.query('INSERT INTO comments(video_id,user_id,text) VALUES($1,$2,$3) RETURNING id,text,created_at',[req.params.id,req.user.id,String(req.body.text||'').trim()]);res.json(q.rows[0])}catch(e){res.status(500).json({message:e.message})}});
app.use((err,req,res,next)=>{if(err instanceof multer.MulterError){return res.status(400).json({message:err.code==='LIMIT_FILE_SIZE'?'Video is too large (max 250 MB).':err.message})}if(err)return res.status(400).json({message:err.message||'Upload failed'});next()});
app.get(['/studio','/studio.html'],(req,res)=>res.sendFile(path.join(__dirname,'studio.html')));
app.get('*',(req,res)=>{if(req.path.startsWith('/api/'))return res.status(404).end();res.sendFile(path.join(__dirname,'index.html'))});
db().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log('HYPER on '+PORT))).catch(e=>{console.error(e);app.listen(PORT,'0.0.0.0',()=>console.log('HYPER on '+PORT+' without DB'))});
