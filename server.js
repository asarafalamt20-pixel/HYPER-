const express=require('express'),cors=require('cors'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),multer=require('multer'),path=require('path'),fs=require('fs');
const {Pool}=require('pg');
const app=express(),PORT=process.env.PORT||10000,SECRET=process.env.JWT_SECRET||'dev-secret';
app.use(cors());app.use(express.json());
const dir=path.join(__dirname,'uploads');fs.mkdirSync(dir,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:dir,filename:(r,f,cb)=>cb(null,Date.now()+'-'+f.originalname.replace(/[^a-zA-Z0-9._-]/g,'_'))}),limits:{fileSize:250*1024*1024}});
app.use('/uploads',express.static(dir));
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false}):null;
const demo=[
{id:1,title:'Meri Life Ka Safar | Village Vlog 2025',channel:'Hyper Vlogs',username:'hypervlogs',views:1200000,likes:28000,duration:'10:24',type:'video',thumbnail:'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=80',video_url:'https://storage.googleapis.com/coverr-main/mp4/Mt_Baker.mp4'},
{id:2,title:'Mountains Calling | Travel Vlog',channel:'Explore More',username:'exploremore',views:856000,likes:19000,duration:'12:36',type:'video',thumbnail:'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',video_url:'https://storage.googleapis.com/coverr-main/mp4/Footboys.mp4'},
{id:3,title:'Life is better in green! ❤️',channel:'Hyper Vlogs',views:420000,likes:42000,duration:'0:25',type:'short',thumbnail:'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80',video_url:'https://storage.googleapis.com/coverr-main/mp4/Footboys.mp4'}];

async function db(){
 if(!pool)return;
 await pool.query(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,username VARCHAR(50) UNIQUE NOT NULL,email VARCHAR(160) UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name VARCHAR(100) NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW(),avatar_url TEXT DEFAULT NULL);
 CREATE TABLE IF NOT EXISTS videos(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,title VARCHAR(200) NOT NULL,description TEXT DEFAULT '',video_url TEXT NOT NULL,thumbnail_url TEXT,type VARCHAR(20) DEFAULT 'video',category VARCHAR(30) DEFAULT 'Vlog',views INTEGER DEFAULT 0,likes INTEGER DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW());
 ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT; ALTER TABLE videos ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'Vlog'; CREATE TABLE IF NOT EXISTS subscriptions(subscriber_id INTEGER REFERENCES users(id) ON DELETE CASCADE,channel_id INTEGER REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(subscriber_id,channel_id));
 CREATE TABLE IF NOT EXISTS comments(id SERIAL PRIMARY KEY,video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,text TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS watch_history(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,video_id INTEGER NOT NULL,watched_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(user_id,video_id));
 CREATE TABLE IF NOT EXISTS liked_videos(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,video_id INTEGER NOT NULL,liked_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(user_id,video_id));
 CREATE TABLE IF NOT EXISTS saved_videos(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,video_id INTEGER NOT NULL,saved_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(user_id,video_id));`);
}
const tok=u=>jwt.sign({id:u.id,username:u.username},SECRET,{expiresIn:'30d'});
function auth(req,res,next){const h=req.headers.authorization||'';try{req.user=jwt.verify(h.startsWith('Bearer ')?h.slice(7):'',SECRET);next()}catch{return res.status(401).json({message:'Login required'})}}

app.get('/api/me/profile',auth,async(req,res)=>{if(!pool)return res.status(503).json({message:'Database is not connected on the server'});try{let q=await pool.query('SELECT id,username,email,display_name,avatar_url FROM users WHERE id=$1',[req.user.id]);res.json({user:q.rows[0]})}catch(e){res.status(500).json({message:e.message})}});
app.put('/api/me/profile',auth,async(req,res)=>{if(!pool)return res.status(503).json({message:'Database is not connected on the server'});try{let a=String(req.body.avatar_url||'');let n=String(req.body.display_name||'').trim();if(a&&a.length>1100000)return res.status(400).json({message:'Profile picture is too large'});if(n&&(n.length<2||n.length>100))return res.status(400).json({message:'Channel name must be 2-100 characters'});let q=await pool.query('UPDATE users SET avatar_url=COALESCE($1,avatar_url),display_name=COALESCE(NULLIF($2,$4),display_name) WHERE id=$3 RETURNING id,username,email,display_name,avatar_url',[a||null,n,req.user.id,'']);res.json({user:q.rows[0]})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/health',(r,s)=>s.json({ok:true,app:'HYPER'}));

app.post('/api/auth/register',async(req,res)=>{
 try{
  if(!pool)return res.status(503).json({message:'Database is not connected on the server'});
  let {username,email,password,displayName}=req.body;
  username=(username||'').trim(); email=(email||'').trim().toLowerCase(); displayName=(displayName||username).trim();
  if(!username||!email||!password)return res.status(400).json({message:'Name, email and password are required'});
  if(password.length<6)return res.status(400).json({message:'Password must be at least 6 characters'});
  if(!/^[a-zA-Z0-9_]{3,50}$/.test(username))return res.status(400).json({message:'Username: 3-50 letters, numbers or _ only'});
  let h=await bcrypt.hash(password,10);
  let q=await pool.query('INSERT INTO users(username,email,password_hash,display_name) VALUES($1,$2,$3,$4) RETURNING id,username,email,display_name,avatar_url',[username.toLowerCase(),email,h,displayName]);
  let u=q.rows[0]; res.json({user:u,token:tok(u)});
 }catch(e){res.status(400).json({message:e.code==='23505'?'Username or email already exists':e.message})}
});
app.post('/api/auth/login',async(req,res)=>{
 try{
  if(!pool)return res.status(503).json({message:'Database is not connected on the server'});
  let email=(req.body.email||'').trim().toLowerCase(), q=await pool.query('SELECT * FROM users WHERE email=$1',[email]),u=q.rows[0];
  if(!u||!(await bcrypt.compare(req.body.password||'',u.password_hash)))return res.status(401).json({message:'Invalid email or password'});
  let x={id:u.id,username:u.username,email:u.email,display_name:u.display_name,avatar_url:u.avatar_url};res.json({user:x,token:tok(x)});
 }catch(e){res.status(500).json({message:e.message})}
});
app.get('/api/channels/:username',async(req,res)=>{
 if(!pool){let v=demo.find(x=>(x.username||'').toLowerCase()===req.params.username.toLowerCase());return v?res.json({username:v.username,display_name:v.channel,avatar_url:v.avatar_url||null}):res.status(404).json({message:'Channel not found'})}
 try{let q=await pool.query('SELECT id,username,email,display_name,avatar_url FROM users WHERE LOWER(username)=LOWER($1)',[req.params.username]);if(!q.rows[0])return res.status(404).json({message:'Channel not found'});res.json(q.rows[0])}catch(e){res.status(500).json({message:e.message})}
});
app.get('/api/videos',async(req,res)=>{
 if(!pool)return res.json(req.query.type?demo.filter(x=>x.type===req.query.type):demo);
 try{let q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM videos v JOIN users u ON u.id=v.user_id ${req.query.type?'WHERE v.type=$1':''} ORDER BY v.created_at DESC`,req.query.type?[req.query.type]:[]);res.json(q.rows)}
 catch(e){res.status(500).json({message:e.message})}
});
app.get('/api/videos/:id',async(req,res)=>{
 if(!pool){let v=demo.find(x=>String(x.id)===req.params.id);return v?res.json(v):res.status(404).json({message:'Not found'})}
 try{let q=await pool.query('SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM videos v JOIN users u ON u.id=v.user_id WHERE v.id=$1',[req.params.id]);if(!q.rows[0])return res.status(404).json({message:'Not found'});await pool.query('UPDATE videos SET views=views+1 WHERE id=$1',[req.params.id]);res.json(q.rows[0])}
 catch(e){res.status(500).json({message:e.message})}
});
app.post('/api/videos',auth,upload.fields([{name:'video',maxCount:1},{name:'thumbnail',maxCount:1}]),async(req,res)=>{
 if(!pool)return res.status(503).json({message:'Database is not connected. Add DATABASE_URL and restart the server.'});
 const vf=req.files?.video?.[0];
 if(!vf)return res.status(400).json({message:'Video required'});
 const allowed=['Discover','Popular','Entertainment','News','Education','Sports','Music','Gaming','Lifestyle','Creator'];
 const cat=allowed.includes(req.body.category)?req.body.category:'Discover';
 try{let v='/uploads/'+vf.filename,t=req.files.thumbnail?.[0]?'/uploads/'+req.files.thumbnail[0].filename:null;
 let q=await pool.query('INSERT INTO videos(user_id,title,description,video_url,thumbnail_url,type,category) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[req.user.id,String(req.body.title||'Untitled').slice(0,200),req.body.description||'',v,t,req.body.type==='short'?'short':'video',cat]);res.status(201).json(q.rows[0])}
 catch(e){try{fs.unlinkSync(path.join(dir,vf.filename));if(req.files.thumbnail?.[0])fs.unlinkSync(path.join(dir,req.files.thumbnail[0].filename))}catch{}console.error('Publish error:',e);res.status(500).json({message:'Publish failed. Please try again.'})}
});
app.post('/api/videos/:id/like',auth,async(req,res)=>{
 if(!pool)return res.json({likes:0,liked:true});
 try{
  let x=await pool.query('SELECT 1 FROM liked_videos WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.id]);
  if(x.rowCount){await pool.query('DELETE FROM liked_videos WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.id]);let q=await pool.query('UPDATE videos SET likes=GREATEST(likes-1,0) WHERE id=$1 RETURNING likes',[req.params.id]);return res.json({likes:q.rows[0].likes,liked:false})}
  await pool.query('INSERT INTO liked_videos(user_id,video_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,req.params.id]);let q=await pool.query('UPDATE videos SET likes=likes+1 WHERE id=$1 RETURNING likes',[req.params.id]);res.json({likes:q.rows[0].likes,liked:true})
 }catch(e){res.status(500).json({message:e.message})}
});
app.post('/api/videos/:id/subscribe',auth,async(req,res)=>{
 if(!pool)return res.json({subscribed:true});
 try{let q=await pool.query('SELECT user_id FROM videos WHERE id=$1',[req.params.id]);if(!q.rows[0])return res.status(404).json({message:'Not found'});let c=q.rows[0].user_id;if(c===req.user.id)return res.status(400).json({message:'Cannot subscribe to yourself'});let x=await pool.query('SELECT 1 FROM subscriptions WHERE subscriber_id=$1 AND channel_id=$2',[req.user.id,c]);if(x.rowCount){await pool.query('DELETE FROM subscriptions WHERE subscriber_id=$1 AND channel_id=$2',[req.user.id,c]);return res.json({subscribed:false})}await pool.query('INSERT INTO subscriptions(subscriber_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,c]);res.json({subscribed:true})}catch(e){res.status(500).json({message:e.message})}
});
app.post('/api/videos/:id/history',auth,async(req,res)=>{if(!pool)return res.json({ok:true});try{await pool.query('INSERT INTO watch_history(user_id,video_id,watched_at) VALUES($1,$2,NOW()) ON CONFLICT(user_id,video_id) DO UPDATE SET watched_at=NOW()',[req.user.id,req.params.id]);res.json({ok:true})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/history',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM watch_history h JOIN videos v ON v.id=h.video_id LEFT JOIN users u ON u.id=v.user_id WHERE h.user_id=$1 ORDER BY h.watched_at DESC LIMIT 100`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/liked',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM liked_videos l JOIN videos v ON v.id=l.video_id LEFT JOIN users u ON u.id=v.user_id WHERE l.user_id=$1 ORDER BY l.liked_at DESC LIMIT 100`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/videos',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query('SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM videos v JOIN users u ON u.id=v.user_id WHERE v.user_id=$1 ORDER BY v.created_at DESC',[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/videos/:id/save',auth,async(req,res)=>{if(!pool)return res.json({saved:true});try{let x=await pool.query('SELECT 1 FROM saved_videos WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.id]);if(x.rowCount){await pool.query('DELETE FROM saved_videos WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.id]);return res.json({saved:false})}await pool.query('INSERT INTO saved_videos(user_id,video_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,req.params.id]);res.json({saved:true})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/me/saved',auth,async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query(`SELECT v.*,u.username,u.display_name channel,u.avatar_url FROM saved_videos s JOIN videos v ON v.id=s.video_id LEFT JOIN users u ON u.id=v.user_id WHERE s.user_id=$1 ORDER BY s.saved_at DESC LIMIT 100`,[req.user.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});

app.get('/api/videos/:id/comments',async(req,res)=>{if(!pool)return res.json([]);try{let q=await pool.query('SELECT c.id,c.text,c.created_at,u.display_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.video_id=$1 ORDER BY c.created_at DESC LIMIT 100',[req.params.id]);res.json(q.rows)}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/videos/:id/comments',auth,async(req,res)=>{if(!pool)return res.status(503).json({message:'Database is not connected on the server'});try{let q=await pool.query('INSERT INTO comments(video_id,user_id,text) VALUES($1,$2,$3) RETURNING id,text,created_at',[req.params.id,req.user.id,String(req.body.text||'').trim()]);res.json(q.rows[0])}catch(e){res.status(500).json({message:e.message})}});
app.use((err,req,res,next)=>{if(err instanceof multer.MulterError){return res.status(400).json({message:err.code==='LIMIT_FILE_SIZE'?'Video is too large (max 250 MB).':err.message})}if(err)return res.status(400).json({message:err.message||'Upload failed'});next()});
app.get('*',(req,res)=>{if(req.path.startsWith('/api/'))return res.status(404).end();res.sendFile(path.join(__dirname,'index.html'))});
db().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log('HYPER on '+PORT))).catch(e=>{console.error(e);app.listen(PORT,'0.0.0.0',()=>console.log('HYPER on '+PORT+' without DB'))});
