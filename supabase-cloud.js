/* ALKAZRAJI FACTORY - Supabase cloud bridge
   No Render server is required. The app keeps working offline in localStorage
   and mirrors the same data to Supabase when configured and online.
*/
(function(){
  const CFG_KEY='ALKAZRAJI_SUPABASE_CONFIG_V1';
  const TABLE='factory_state';
  const DEVICE_KEY='alkazraji_device_id';
  const DEVICE_ID=localStorage.getItem(DEVICE_KEY)||crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY,DEVICE_ID);
  let client=null;
  let lastCloudUpdate='';
  let saveTimer=null;
  let loadingCloud=false;

  const cfg=()=>{try{return JSON.parse(localStorage.getItem(CFG_KEY)||'null')}catch{return null}};
  const valid=c=>c&&/^https:\/\/[^\s]+\.supabase\.co$/.test(c.url)&&c.key&&c.key.length>20;

  function localSave(){
    localStorage.setItem('ALKAZRAJI_FACTORY_DB_V1',JSON.stringify(window.__getDb()));
    if(typeof window.updateStats==='function')window.updateStats();
  }

  function showStatus(text,good){
    let el=document.getElementById('cloudStatus');
    if(!el){
      el=document.createElement('div');
      el.id='cloudStatus';
      el.style='position:fixed;left:12px;bottom:14px;z-index:250;padding:8px 12px;border-radius:12px;font:700 12px system-ui;box-shadow:0 3px 12px #0002;background:#fff;';
      document.body.appendChild(el);
    }
    el.textContent=text;
    el.style.color=good?'#166534':'#9a3412';
    el.style.border='1px solid '+(good?'#bbf7d0':'#fed7aa');
    el.style.background=good?'#f0fdf4':'#fff7ed';
  }

  function configForm(){
    const c=cfg()||{url:'',key:''};
    const html=`
      <div class="field"><label>Supabase Project URL</label><input id="sbUrl" value="${c.url||''}" placeholder="https://xxxxxxxx.supabase.co"></div>
      <div class="field"><label>Publishable key</label><textarea id="sbKey" placeholder="sb_publishable_... أو مفتاح anon القديم"></textarea></div>
      <p style="color:#64748b;font-size:13px">استخدم مفتاح Publishable فقط. لا تضع Secret / service_role هنا.</p>
      <button class="primary" onclick="window.alkazrajiConnectSupabase()">حفظ واختبار الاتصال</button>`;
    if(typeof window.openModal==='function')window.openModal('ربط قاعدة البيانات',html);
    else setTimeout(configForm,300);
  }

  async function connect(){
    const c=cfg();
    if(!valid(c)){showStatus('السحابة غير مفعلة',false);return false;}
    try{
      client=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      let {data:{session}}=await client.auth.getSession();
      if(!session){
        const r=await client.auth.signInAnonymously();
        if(r.error)throw r.error;
      }
      showStatus('متصل بالسحابة ✓',true);
      return true;
    }catch(e){
      console.error(e);showStatus('تعذر الاتصال بالسحابة',false);return false;
    }
  }

  async function pull(){
    if(loadingCloud||!client||!navigator.onLine)return;
    loadingCloud=true;
    try{
      const {data,error}=await client.from(TABLE).select('id,data,updated_at,device_id').eq('id',1).maybeSingle();
      if(error)throw error;
      if(!data){
        await push();
      }else if(data.updated_at && data.updated_at!==lastCloudUpdate && data.device_id!==DEVICE_ID){
        const remote=data.data||{};
        window.__setDb({
          dresses:Array.isArray(remote.dresses)?remote.dresses:[],
          orders:Array.isArray(remote.orders)?remote.orders:[],
          customers:Array.isArray(remote.customers)?remote.customers:[],
          expenses:Array.isArray(remote.expenses)?remote.expenses:[]
        });
        localSave();
        lastCloudUpdate=data.updated_at;
        if(typeof window.renderDresses==='function')window.renderDresses();
        if(typeof window.renderOrders==='function')window.renderOrders();
        if(typeof window.renderCustomers==='function')window.renderCustomers();
        if(typeof window.renderExpenses==='function')window.renderExpenses();
        if(typeof window.renderReports==='function')window.renderReports();
        showStatus('تم تحديث البيانات ✓',true);
      }
    }catch(e){console.error(e);showStatus('السحابة غير متاحة حالياً',false)}
    finally{loadingCloud=false}
  }

  async function push(){
    if(!client||!navigator.onLine)return;
    try{
      const stamp=new Date().toISOString();
      const {error}=await client.from(TABLE).upsert({id:1,data:window.__getDb(),updated_at:stamp,device_id:DEVICE_ID},{onConflict:'id'});
      if(error)throw error;
      lastCloudUpdate=stamp;
      showStatus('تم حفظ البيانات سحابياً ✓',true);
    }catch(e){console.error(e);showStatus('تم الحفظ محلياً — السحابة ستُعاد المحاولة',false)}
  }

  function queuePush(){
    localSave();
    clearTimeout(saveTimer);
    saveTimer=setTimeout(push,450);
  }

  window.alkazrajiConnectSupabase=async function(){
    const url=(document.getElementById('sbUrl')?.value||'').trim().replace(/\/$/,'');
    const key=(document.getElementById('sbKey')?.value||'').trim();
    if(!url||!key){alert('أدخل رابط المشروع والمفتاح.');return}
    localStorage.setItem(CFG_KEY,JSON.stringify({url,key}));
    const ok=await connect();
    if(ok){
      if(typeof window.closeModal==='function')window.closeModal();
      await pull();
    }
  };

  window.alkazrajiCloudSyncNow=async function(){
    if(!client){if(!(await connect())){configForm();return}}
    await push(); await pull();
  };

  window.alkazrajiOpenCloudSettings=configForm;

  function boot(){
    if(!window.supabase){showStatus('تعذر تحميل مكتبة Supabase',false);return}
    const c=cfg();
    if(valid(c)){
      connect().then(ok=>{if(ok)pull()});
    }else{
      showStatus('السحابة غير مفعلة — البيانات محلية',false);
    }
    setInterval(()=>{if(client)pull()},10000);
    window.addEventListener('online',()=>{if(client)pull();else if(valid(cfg()))connect().then(pull)});
  }

  window.saveDB=queuePush;

  const addMenuButton=()=>{
    const panel=document.getElementById('menuPanel');
    if(!panel||document.getElementById('cloudSettingsBtn'))return;
    const b=document.createElement('button');
    b.id='cloudSettingsBtn';b.className='menu-item';b.textContent='☁️ إعداد المزامنة السحابية';
    b.onclick=()=>{if(typeof window.closeMenu==='function')window.closeMenu();configForm()};
    panel.appendChild(b);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addMenuButton);else addMenuButton();
  boot();
})();
