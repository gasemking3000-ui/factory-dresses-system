import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const app=express();
app.use(cors({origin:true,credentials:true}));
app.use(express.json({limit:"5mb"}));

const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||"CHANGE_THIS_SECRET";
const db=new Database(process.env.DB_FILE||"alkazraji.sqlite");
db.pragma("journal_mode=WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 name TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT '[]',
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ops(
 seq INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT UNIQUE NOT NULL,
 device_id TEXT NOT NULL, user_id TEXT NOT NULL, collection_name TEXT NOT NULL,
 record_id TEXT NOT NULL, action TEXT NOT NULL, before_json TEXT,
 after_json TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_seq ON ops(seq);
`);

if(db.prepare("SELECT COUNT(*) n FROM users").get().n===0){
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(
    "USR-MASTER","admin",bcrypt.hashSync("ChangeMe_Immediately_123!",12),
    "المستخدم الرئيسي",JSON.stringify(["*"]),1,new Date().toISOString()
  );
}

function auth(req,res,next){
  try{
    const t=(req.headers.authorization||"").replace(/^Bearer\s+/,"");
    req.user=jwt.verify(t,JWT_SECRET); next();
  }catch{res.status(401).json({error:"UNAUTHORIZED"});}
}
function allowed(req,p){return req.user.permissions?.includes("*")||req.user.permissions?.includes(p);}
function addOp(o,userId){
  db.prepare(`INSERT OR IGNORE INTO ops
  (op_id,device_id,user_id,collection_name,record_id,action,before_json,after_json,created_at)
  VALUES(?,?,?,?,?,?,?,?,?)`).run(
    o.opId||crypto.randomUUID(),o.deviceId||"unknown",userId,o.collection,o.recordId,o.action,
    o.before?JSON.stringify(o.before):null,o.after?JSON.stringify(o.after):null,
    o.createdAt||new Date().toISOString()
  );
}

app.get("/api/health",(req,res)=>res.json({ok:true,time:new Date().toISOString()}));

app.post("/api/auth/login",(req,res)=>{
  const {username,password}=req.body||{};
  const u=db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(username);
  if(!u||!bcrypt.compareSync(password||"",u.password_hash))
    return res.status(401).json({error:"INVALID_LOGIN"});
  const permissions=JSON.parse(u.permissions);
  const token=jwt.sign({id:u.id,username:u.username,name:u.name,permissions},JWT_SECRET,{expiresIn:"30d"});
  res.json({token,user:{id:u.id,username:u.username,name:u.name,permissions}});
});

app.post("/api/users",auth,(req,res)=>{
  if(!allowed(req,"users.manage"))return res.status(403).json({error:"FORBIDDEN"});
  const {username,password,name,permissions=[]}=req.body||{};
  if(!username||!password||!name)return res.status(400).json({error:"MISSING_FIELDS"});
  const id=crypto.randomUUID();
  try{
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(
      id,username,bcrypt.hashSync(password,12),name,JSON.stringify(permissions),1,new Date().toISOString()
    );
    res.json({ok:true,id});
  }catch{res.status(409).json({error:"USERNAME_EXISTS"});}
});

app.post("/api/sync/push",auth,(req,res)=>{
  const ops=Array.isArray(req.body?.ops)?req.body.ops:[];
  const tx=db.transaction(items=>items.forEach(o=>{
    if(o?.collection&&o?.recordId&&o?.action)addOp(o,req.user.id);
  }));
  tx(ops);
  res.json({ok:true,accepted:ops.length});
});

app.get("/api/sync/pull",auth,(req,res)=>{
  const after=Number(req.query.after||0);
  const rows=db.prepare("SELECT * FROM ops WHERE seq>? ORDER BY seq LIMIT 1000").all(after);
  res.json({
    ops:rows.map(r=>({
      seq:r.seq,opId:r.op_id,deviceId:r.device_id,userId:r.user_id,
      collection:r.collection_name,recordId:r.record_id,action:r.action,
      before:r.before_json?JSON.parse(r.before_json):null,
      after:r.after_json?JSON.parse(r.after_json):null,createdAt:r.created_at
    })),
    lastSeq:rows.length?rows.at(-1).seq:after
  });
});

app.get("/api/audit",auth,(req,res)=>{
  if(!allowed(req,"reports.view"))return res.status(403).json({error:"FORBIDDEN"});
  res.json(db.prepare("SELECT * FROM ops ORDER BY seq DESC LIMIT 500").all());
});

app.listen(PORT,()=>console.log("ALKAZRAJI Online API running on "+PORT));
