require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'masar.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS properties (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, title_ar TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '', description_ar TEXT NOT NULL DEFAULT '',
 area TEXT NOT NULL, area_other TEXT NOT NULL DEFAULT '', market TEXT NOT NULL,
 category TEXT NOT NULL, property_type TEXT NOT NULL DEFAULT 'Apartment',
 price TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT '', bedrooms TEXT NOT NULL DEFAULT '',
 payment TEXT NOT NULL DEFAULT '', developer TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', images TEXT NOT NULL DEFAULT '[]',
 featured INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS leads (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
 email TEXT NOT NULL DEFAULT '', area TEXT NOT NULL DEFAULT '', area_other TEXT NOT NULL DEFAULT '',
 market TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', budget TEXT NOT NULL DEFAULT '',
 details TEXT NOT NULL DEFAULT '', property_id INTEGER, source TEXT NOT NULL DEFAULT 'interest form',
 status TEXT NOT NULL DEFAULT 'New', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
`);
if (!db.prepare('SELECT id FROM admins LIMIT 1').get()) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!';
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, bcrypt.hashSync(password, 12));
  console.log(`Initial admin created: ${username}. Set ADMIN_PASSWORD in .env before deployment.`);
}
if (!db.prepare('SELECT id FROM properties LIMIT 1').get()) {
  const add = db.prepare(`INSERT INTO properties (title,title_ar,description,description_ar,area,market,category,property_type,price,size,bedrooms,payment,developer,image_url,featured,status) VALUES (@title,@title_ar,@description,@description_ar,@area,@market,@category,@property_type,@price,@size,@bedrooms,@payment,@developer,@image_url,@featured,@status)`);
  const demo = [
    {title:'Contemporary Family Apartment',title_ar:'شقة عائلية بتصميم عصري',description:'A bright, modern home in a well-connected residential community. Contact MASAR for availability and full details.',description_ar:'وحدة عصرية داخل مجتمع سكني مميز. تواصل مع مسار لمعرفة التوافر والتفاصيل الكاملة.',area:'Sheikh Zayed',market:'Resale',category:'Residential',property_type:'Apartment',price:'Contact for price',size:'180 m²',bedrooms:'3',payment:'Negotiable',developer:'',image_url:'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85',featured:1,status:'active'},
    {title:'New Development Opportunity',title_ar:'فرصة في مشروع جديد',description:'Explore a new-build property opportunity. Ask our team about payment plans, delivery dates and available units.',description_ar:'اكتشف فرصة في مشروع جديد واسأل فريقنا عن أنظمة السداد ومواعيد التسليم والوحدات المتاحة.',area:'6th of October',market:'Primary',category:'Residential',property_type:'Apartment',price:'Contact for price',size:'145 m²',bedrooms:'3',payment:'Installments available',developer:'',image_url:'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85',featured:1,status:'active'},
    {title:'Street-Facing Retail Unit',title_ar:'وحدة تجارية على الشارع',description:'A commercial listing for brands and business owners. Request details about location, activity requirements and payment terms.',description_ar:'إعلان لوحدة تجارية مناسبة للأنشطة المختلفة. اطلب تفاصيل الموقع وشروط النشاط والسداد.',area:'Hadayek October',market:'Primary',category:'Commercial',property_type:'Retail',price:'Contact for price',size:'85 m²',bedrooms:'',payment:'Ask for plan',developer:'',image_url:'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=85',featured:0,status:'active'}
  ];
  const tx = db.transaction(rows => rows.forEach(r => add.run(r)));
  tx(demo);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true, limit:'1mb'}));
app.use(session({secret:process.env.SESSION_SECRET || 'development-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:8*60*60*1000}}));
app.use(express.static(path.join(__dirname,'public')));
const uploadDir=path.join(__dirname,'public','uploads'); fs.mkdirSync(uploadDir,{recursive:true});
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,uploadDir),filename:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();cb(null,Date.now()+'-'+Math.random().toString(36).slice(2,10)+ext)}});
const upload=multer({storage,limits:{fileSize:8*1024*1024,files:12},fileFilter:(req,file,cb)=>cb(null,/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))});
// Add the image gallery column to databases created by earlier versions.
if(!db.prepare('PRAGMA table_info(properties)').all().some(c=>c.name==='images')) db.exec("ALTER TABLE properties ADD COLUMN images TEXT NOT NULL DEFAULT '[]'");
const asyncRoute = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const isAdmin = (req,res,next)=>req.session.admin ? next() : res.status(401).json({error:'Please sign in to the admin dashboard.'});
const clean = v => String(v ?? '').trim().slice(0,5000);
const activeProperties = () => db.prepare("SELECT * FROM properties WHERE status='active' ORDER BY featured DESC, id DESC").all();

app.get('/api/config', (req,res)=>res.json({businessWhatsApp:process.env.BUSINESS_WHATSAPP||'', languageOptions:['en','ar']}));
app.post('/api/admin/uploads',isAdmin,upload.array('images',12),(req,res)=>{if(!req.files?.length)return res.status(400).json({error:'Choose at least one image (JPG, PNG, WEBP or GIF).'});res.json({images:req.files.map(f=>'/uploads/'+f.filename)});});
app.get('/api/properties', (req,res)=>{
 const {area,market,category,search} = req.query; let sql="SELECT * FROM properties WHERE status='active'"; const args=[];
 if(area){sql+=' AND area=?';args.push(area)} if(market){sql+=' AND market=?';args.push(market)} if(category){sql+=' AND category=?';args.push(category)}
 if(search){sql+=' AND (title LIKE ? OR title_ar LIKE ? OR description LIKE ? OR description_ar LIKE ? OR area LIKE ?)';const q=`%${clean(search)}%`;args.push(q,q,q,q,q)}
 sql+=' ORDER BY featured DESC, id DESC'; res.json(db.prepare(sql).all(...args));
});
app.get('/api/properties/:id',(req,res)=>{const p=db.prepare("SELECT * FROM properties WHERE id=? AND status='active'").get(Number(req.params.id)); if(!p)return res.status(404).json({error:'Property not found'});res.json(p)});

async function notifyWhatsApp(lead) {
 const token=process.env.WHATSAPP_ACCESS_TOKEN, phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID, to=process.env.WHATSAPP_NOTIFY_TO;
 if(!token||!phoneId||!to) return;
 const message=`New MASAR lead\nName: ${lead.name}\nPhone: ${lead.phone}\nArea: ${lead.area==='Other'?lead.area_other:lead.area}\nMarket: ${lead.market}\nCategory: ${lead.category}\nBudget: ${lead.budget}\nDetails: ${lead.details}\nSource: ${lead.source}`;
 try { await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:message}})}); }
 catch(e){ console.error('WhatsApp notification failed:',e.message); }
}
app.post('/api/leads', asyncRoute(async(req,res)=>{
 const body=req.body||{}; const name=clean(body.name), phone=clean(body.phone);
 if(!name||!phone) return res.status(400).json({error:'Please enter your name and phone number.'});
 if(name.length>120||phone.length>40) return res.status(400).json({error:'Please check your details.'});
 const lead={name,phone,email:clean(body.email),area:clean(body.area),area_other:clean(body.area_other),market:clean(body.market),category:clean(body.category),budget:clean(body.budget),details:clean(body.details),property_id:body.property_id?Number(body.property_id):null,source:clean(body.source)||'interest form'};
 const result=db.prepare(`INSERT INTO leads (name,phone,email,area,area_other,market,category,budget,details,property_id,source) VALUES (@name,@phone,@email,@area,@area_other,@market,@category,@budget,@details,@property_id,@source)`).run(lead);
 await notifyWhatsApp(lead); res.status(201).json({ok:true,id:result.lastInsertRowid,message:'Thanks! The MASAR team will contact you soon.'});
}));

app.post('/api/admin/login', (req,res)=>{
 const {username,password}=req.body||{}; const admin=db.prepare('SELECT * FROM admins WHERE username=?').get(clean(username));
 if(!admin||!bcrypt.compareSync(String(password||''),admin.password_hash)) return res.status(401).json({error:'Incorrect username or password.'});
 req.session.admin={id:admin.id,username:admin.username}; res.json({ok:true,username:admin.username});
});
app.post('/api/admin/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/admin/me',(req,res)=>res.json({authenticated:!!req.session.admin,username:req.session.admin?.username||''}));
app.get('/api/admin/stats',isAdmin,(req,res)=>res.json({properties:db.prepare("SELECT COUNT(*) n FROM properties WHERE status='active'").get().n,leads:db.prepare('SELECT COUNT(*) n FROM leads').get().n,newLeads:db.prepare("SELECT COUNT(*) n FROM leads WHERE status='New'").get().n,areas:db.prepare("SELECT area,COUNT(*) count FROM leads GROUP BY area ORDER BY count DESC LIMIT 5").all()}));
app.get('/api/admin/properties',isAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM properties ORDER BY id DESC').all()));
app.post('/api/admin/properties',isAdmin,(req,res)=>{
 const b=req.body||{}; if(!clean(b.title)||!clean(b.area)||!clean(b.market)||!clean(b.category))return res.status(400).json({error:'Title, area, market and category are required.'});
 const data={title:clean(b.title),title_ar:clean(b.title_ar),description:clean(b.description),description_ar:clean(b.description_ar),area:clean(b.area),area_other:clean(b.area_other),market:clean(b.market),category:clean(b.category),property_type:clean(b.property_type)||'Apartment',price:clean(b.price),size:clean(b.size),bedrooms:clean(b.bedrooms),payment:clean(b.payment),developer:clean(b.developer),image_url:clean(b.image_url),images:JSON.stringify(Array.isArray(b.images)?b.images.map(clean).slice(0,12):[]),featured:b.featured?1:0,status:b.status==='hidden'?'hidden':'active'};
 const r=db.prepare(`INSERT INTO properties (title,title_ar,description,description_ar,area,area_other,market,category,property_type,price,size,bedrooms,payment,developer,image_url,images,featured,status) VALUES (@title,@title_ar,@description,@description_ar,@area,@area_other,@market,@category,@property_type,@price,@size,@bedrooms,@payment,@developer,@image_url,@images,@featured,@status)`).run(data);res.status(201).json({ok:true,id:r.lastInsertRowid});
});
app.put('/api/admin/properties/:id',isAdmin,(req,res)=>{
 const id=Number(req.params.id), b=req.body||{}; if(!db.prepare('SELECT id FROM properties WHERE id=?').get(id))return res.status(404).json({error:'Property not found.'});
 const data={id,title:clean(b.title),title_ar:clean(b.title_ar),description:clean(b.description),description_ar:clean(b.description_ar),area:clean(b.area),area_other:clean(b.area_other),market:clean(b.market),category:clean(b.category),property_type:clean(b.property_type)||'Apartment',price:clean(b.price),size:clean(b.size),bedrooms:clean(b.bedrooms),payment:clean(b.payment),developer:clean(b.developer),image_url:clean(b.image_url),images:JSON.stringify(Array.isArray(b.images)?b.images.map(clean).slice(0,12):[]),featured:b.featured?1:0,status:b.status==='hidden'?'hidden':'active'};
 db.prepare(`UPDATE properties SET title=@title,title_ar=@title_ar,description=@description,description_ar=@description_ar,area=@area,area_other=@area_other,market=@market,category=@category,property_type=@property_type,price=@price,size=@size,bedrooms=@bedrooms,payment=@payment,developer=@developer,image_url=@image_url,images=@images,featured=@featured,status=@status WHERE id=@id`).run(data);res.json({ok:true});
});
app.delete('/api/admin/properties/:id',isAdmin,(req,res)=>{db.prepare('DELETE FROM properties WHERE id=?').run(Number(req.params.id));res.json({ok:true})});
app.get('/api/admin/leads',isAdmin,(req,res)=>res.json(db.prepare('SELECT leads.*,properties.title property_title FROM leads LEFT JOIN properties ON properties.id=leads.property_id ORDER BY leads.id DESC').all()));
app.patch('/api/admin/leads/:id',isAdmin,(req,res)=>{const allowed=['New','Contacted','Follow-up','Qualified','Closed','Not interested'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status.'});db.prepare('UPDATE leads SET status=? WHERE id=?').run(req.body.status,Number(req.params.id));res.json({ok:true})});
app.delete('/api/admin/leads/:id',isAdmin,(req,res)=>{db.prepare('DELETE FROM leads WHERE id=?').run(Number(req.params.id));res.json({ok:true})});
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Something went wrong. Please try again.'})});
app.listen(PORT,()=>console.log(`MASAR Real Estate running at http://localhost:${PORT}`));
