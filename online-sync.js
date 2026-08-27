const API_BASE_URL=window.ALKAZRAJI_API_BASE_URL||"";
const TOKEN_KEY="alkazraji_online_token";
const SEQ_KEY="alkazraji_last_server_seq";
const DEVICE_KEY="alkazraji_device_id";
const DEVICE_ID=localStorage.getItem(DEVICE_KEY)||crypto.randomUUID();
localStorage.setItem(DEVICE_KEY,DEVICE_ID);

async function api(path,opt={}){
  const h={"Content-Type":"application/json",...(opt.headers||{})};
  const t=localStorage.getItem(TOKEN_KEY); if(t)h.Authorization="Bearer "+t;
  const r=await fetch(API_BASE_URL+path,{...opt,headers:h});
  if(!r.ok)throw new Error(await r.text()); return r.json();
}
async function onlineLogin(username,password){
  const x=await api("/api/auth/login",{method:"POST",body:JSON.stringify({username,password})});
  localStorage.setItem(TOKEN_KEY,x.token); return x.user;
}
async function pushLocalOperations(ops){
  if(!navigator.onLine||!ops?.length)return {skipped:true};
  return api("/api/sync/push",{method:"POST",body:JSON.stringify({deviceId:DEVICE_ID,ops})});
}
async function pullServerOperations(applyOperation){
  if(!navigator.onLine)return {skipped:true};
  let after=Number(localStorage.getItem(SEQ_KEY)||0);
  const x=await api("/api/sync/pull?after="+after);
  for(const op of x.ops)await applyOperation(op);
  localStorage.setItem(SEQ_KEY,String(x.lastSeq)); return x;
}
window.addEventListener("online",()=>window.dispatchEvent(new Event("alkazraji:sync")));
