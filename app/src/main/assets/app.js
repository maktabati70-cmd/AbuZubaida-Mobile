/* مركز أبو زبيدة للتتبع والرصد — نسخة الجوال المستقلة
   تجلب المصادر وتترجمها وتحلّلها على الجوال نفسه دون كمبيوتر. تطوير أبو عبدالله الشامي */
'use strict';
const $=s=>document.querySelector(s);
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>Math.floor(Date.now()/1000);
const DEV_WA='963968744241';
const CATN=Object.fromEntries(D.cats.map(c=>[c[0],c[1]])),CATC=Object.fromEntries(D.cats.map(c=>[c[0],c[2]]));
const EVC=Object.fromEntries(D.events.map(e=>[e[0],e[1]]));
const ISO=Object.fromEntries(D.countries.map(c=>[c[0],c[1]]));

/* ───── التخزين ───── */
const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},
 set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}};
let ITEMS=LS.get('az_items',[]);              // {id,cat,src,t,s,ta,sa,l,p,lang,ev,ct,tr,k}
let SAVED=LS.get('az_saved',{});
let READ=new Set(LS.get('az_read',[]));
let ALERTS=LS.get('az_alerts',[]);
let CFG=Object.assign({interval:30,translate:true,tg:true,theme:'dark',cats:D.cats.map(c=>c[0]).filter(k=>k!=='tweets'),last:0,alseen:0},LS.get('az_cfg',{}));
const saveCfg=()=>LS.set('az_cfg',CFG);
function saveItems(){
 const t=now();
 ITEMS=ITEMS.filter(i=>i.p>=t-((['think_global','think_arab','terror','intel'].includes(i.cat))?30:10)*86400);
 ITEMS.sort((a,b)=>b.p-a.p);
 let cap=1800;
 while(cap>300&&!LS.set('az_items',ITEMS.slice(0,cap)))cap-=300;   // إن امتلأت الذاكرة نقلّل العدد
 if(ITEMS.length>cap)ITEMS=ITEMS.slice(0,cap)}
document.documentElement.dataset.theme=CFG.theme;

/* ───── الاتصال عبر التطبيق (بلا قيود CORS) ───── */
const NET={n:0,cb:{}};
window.__net=(id,ok,status,body)=>{const f=NET.cb[id];delete NET.cb[id];if(f)f(ok,status,body)};
function http(url,opt={}){
 return new Promise((res,rej)=>{
  const id='r'+(++NET.n);
  const to=setTimeout(()=>{delete NET.cb[id];rej(new Error('timeout'))},opt.timeout||40000);
  NET.cb[id]=(ok,st,body)=>{clearTimeout(to);ok?res(body):rej(new Error('HTTP '+st))};
  if(window.Android&&Android.fetch)Android.fetch(id,url,opt.method||'GET',opt.body||'');
  else fetch(url,{method:opt.method||'GET',body:opt.body||undefined,headers:opt.body?{'Content-Type':'application/x-www-form-urlencoded'}:{}})
   .then(r=>r.text().then(t=>window.__net(id,r.ok,r.status,t))).catch(e=>window.__net(id,false,0,String(e)))})}
async function pool(tasks,n){let i=0;const run=async()=>{while(i<tasks.length){const k=i++;try{await tasks[k]()}catch(e){}}};await Promise.all(Array.from({length:n},run))}
function openUrl(u){if(window.Android&&Android.open)Android.open(u);else window.open(u,'_blank')}
function share(t){if(window.Android&&Android.share)Android.share(t);else if(navigator.share)navigator.share({text:t}).catch(()=>{});else navigator.clipboard?.writeText(t)}
function toast(t){let e=$('.toast');if(!e){e=document.createElement('div');e.className='toast';document.body.appendChild(e)}e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),2200)}

/* ───── النصوص العربية والكشف ───── */
const normAr=t=>(t||'').replace(/[ً-ْـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي');
const isAr=t=>(t.match(/[؀-ۿ]/g)||[]).length>(t.length*0.3);
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const AL='\\u0600-\\u06FF';
function arRe(terms,suffix){if(!terms||!terms.length)return null;
 const alt=[...new Set(terms.map(t=>reEsc(normAr(t))))].sort((a,b)=>b.length-a.length).join('|');
 return new RegExp(`(?<![${AL}])(?:[وفبلك])?(?:ال${suffix?'|ل':''})?(?:${alt})`+(suffix?`(?:ة|ات|ون|ين|يون|يين|ي|ية)?(?![${AL}])`:''),'g')}
function enRe(terms){if(!terms||!terms.length)return null;
 const pre=terms.filter(t=>!t.startsWith('=')).map(reEsc),ex=terms.filter(t=>t.startsWith('=')).map(t=>reEsc(t.slice(1)));
 const parts=[];if(pre.length)parts.push(`\\b(?:${pre.join('|')})`);if(ex.length)parts.push(`\\b(?:${ex.join('|')})\\b`);
 return new RegExp(parts.join('|'),'g')}
const hit=(p,ar,en)=>{const a=p[0],b=p[1];if(a){a.lastIndex=0;if(a.test(ar))return true}if(b){b.lastIndex=0;if(b.test(en))return true}return false};
const pos=(re,t)=>{const o=[];if(!re)return o;re.lastIndex=0;let m;while((m=re.exec(t))){o.push(m.index);if(m[0]==='')re.lastIndex++}return o};
function near(p1,p2,ar,en,d=45){for(const [i,t] of [[0,ar],[1,en]]){const a=pos(p1[i],t),b=pos(p2[i],t);if(a.some(x=>b.some(y=>Math.abs(x-y)<=d)))return true}return false}

const COUNTRY_RES=D.countries.map(c=>[c[0],arRe(c[3],true),enRe(c[4])]);
function countriesOf(...texts){const raw=texts.filter(Boolean).join(' '),ar=normAr(raw),en=raw.toLowerCase();const f=[];
 for(const [n,a,b] of COUNTRY_RES){let p=-1;if(a){a.lastIndex=0;let m;while((m=a.exec(ar))){if(!D.ar_false.some(x=>m[0].endsWith(x))){p=m.index;break}}}
  if(b){b.lastIndex=0;const m=b.exec(en);if(m&&(p<0||m.index<p))p=p<0?m.index:p}
  if(p>=0)f.push([p,n])}
 return f.sort((x,y)=>x[0]-y[0]).slice(0,6).map(x=>x[1])}
const LOC_CUE=/(?:في|فى|قبالة|سواحل|ساحل|شمال|جنوب|شرق|غرب|شمالي|جنوبي|شرقي|غربي|داخل|على|الى|من)\s*$/;
function titleCountries(tAr,tEn){const ar=normAr(tAr||''),en=(tEn||'').toLowerCase(),cued=[],plain=[];
 for(const [n,a,b] of COUNTRY_RES){let best=null;
  if(a){a.lastIndex=0;let m;while((m=a.exec(ar))){if(D.ar_false.some(x=>m[0].endsWith(x)))continue;const cue=LOC_CUE.test(ar.slice(Math.max(0,m.index-12),m.index));const k=[cue?0:1,m.index];if(!best||k[0]<best[0]||(k[0]===best[0]&&k[1]<best[1]))best=k}}
  if(!best&&b){b.lastIndex=0;const m=b.exec(en);if(m){const cue=/\b(?:in|off|near|across|inside)\s+(?:the\s+)?$/.test(en.slice(Math.max(0,m.index-14),m.index));best=[cue?0:1,5000+m.index]}}
  if(best)(best[0]?plain:cued).push([best[1],n])}
 return [...cued.sort((x,y)=>x[0]-y[0]),...plain.sort((x,y)=>x[0]-y[0])].map(x=>x[1])}

const EV_RES=D.events.map(e=>[e[0],arRe(e[2]),enRe(e[3])]);
const EVR=Object.fromEntries(EV_RES.map(e=>[e[0],[e[1],e[2]]]));
const VIP=[arRe(D.vip[0]),enRe(D.vip[1])],ISR=[arRe(D.isr[0]),enRe(D.isr[1])];
const SEA=[arRe(D.sea[0]),enRe(D.sea[1])],SEAHIT=[arRe(D.seahit[0]),enRe(D.seahit[1])],SEAONLY=[arRe(D.seaonly[0]),enRe(D.seaonly[1])];
const ORDER=D.events.map(e=>e[0]);
function computeEvents(...texts){const raw=texts.filter(Boolean).join(' '),ar=normAr(raw),en=raw.toLowerCase();
 let f=EV_RES.filter(([n,a,b])=>(a||b)&&hit([a,b],ar,en)).map(e=>e[0]);
 if(hit(SEAONLY,ar,en)||near(SEA,SEAHIT,ar,en,40))f=['هجوم بحري',...f.filter(x=>x!=='غارة جوية'&&x!=='انفجار')];
 if(f.includes('اعتقال')&&near(EVR['اعتقال'],VIP,ar,en))f[f.indexOf('اعتقال')]='اعتقال شخصية مهمة';
 if(f.includes('توغل عسكري')&&hit(ISR,ar,en))f[f.indexOf('توغل عسكري')]='توغل إسرائيلي';
 return [...new Set(f)].sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b)).slice(0,3)}
const EV_CATS=['world','arab','war','terror','intel','tweets','think_global','think_arab'];
function eventsFor(i){if(!EV_CATS.includes(i.cat))return [];
 const t=computeEvents(i.t,i.ta);if(['think_global','think_arab'].includes(i.cat)||!t.length)return t;
 const full=computeEvents(i.t,i.ta,(i.s||'').slice(0,300),(i.sa||'').slice(0,300));
 return [...t,...full.filter(e=>!t.includes(e)&&!(e==='اعتقال شخصية مهمة'&&t.includes('اعتقال'))&&!(e==='توغل إسرائيلي'&&t.includes('توغل عسكري')))].slice(0,3)}

/* المواقع: الممرات البحرية ثم المدن ثم الدولة */
const STR=D.straits.map(s=>Object.assign(s,{re:[arRe(s.ar),enRe(s.en)],strict:[arRe(s.ar.filter(w=>w!==s.loose)),enRe(s.en)],ctxre:arRe(s.ctx||[])}));
function straitHit(s,ar,en,ctx){if(hit(s.strict,ar,en))return true;return !!(s.loose&&hit([s.re[0],null],ar,'')&&s.ctxre&&(s.ctxre.lastIndex=0,s.ctxre.test(ctx)))}
function straitOf(i){const ar=normAr(i.ta||''),en=(i.t||'').toLowerCase(),ctx=ar+' '+normAr((i.sa||'').slice(0,400));
 for(const s of STR)if(straitHit(s,ar,en,ctx))return s;
 if(i.k==='video')return null;const sa=normAr((i.sa||'').slice(0,400)),se=(i.s||'').slice(0,400).toLowerCase();
 for(const s of STR)if(straitHit(s,sa,se,ctx))return s;return null}
const AMBIG=new Set(D.ambig);
const CITY_RES=D.cities.map(([a,e,lat,lon,cs])=>[new RegExp(`(?<![${AL}])(?:[وفبلك])?(?:ال)?${reEsc(normAr(a))}(?![${AL}])`),new RegExp('\\b'+reEsc(e)+'\\b'),lat,lon,a,cs]);
const CITY_CTX=/(?:مدين[ةه]|بلد[ةه]|ريف|محافظ[ةه]|قضاء|منطق[ةه]|مخيم|ميناء|قرب|محيط|شرق|غرب|شمال|جنوب|شرقي|غربي|شمالي|جنوبي)\s*$/;
function findCity(ar,en,cset){let best=null;
 for(const [ra,re,lat,lon,name,cs] of CITY_RES){const m=ar?ra.exec(ar):null;let me=en?re.exec(en):null;
  if(me&&AMBIG.has(name)&&me[0]==='tyre')me=null;if(!m&&!me)continue;
  if(cset.size&&cs.length&&!cs.some(c=>cset.has(c)))continue;
  if(AMBIG.has(name)){const ok=m&&CITY_CTX.test(ar.slice(Math.max(0,m.index-14),m.index));if(!((ok||me)&&cs.some(c=>cset.has(c))))continue}
  const p=m?m.index:5000+me.index;if(!best||p<best[0])best=[p,lat,lon,name]}
 return best}
function hsh(s){let h=0;for(let k=0;k<s.length;k++)h=(h*31+s.charCodeAt(k))|0;return Math.abs(h)}
function locate(i){const h=hsh(i.id);const st=straitOf(i);
 if(st)return [st.lat+((h%100)-50)/260,st.lon+(((h/100|0)%100)-50)/200,st.name,true,st.key];
 const all=i.ct||[],tc=titleCountries(i.ta,i.t),cset=new Set([...all,...tc]);
 let c=findCity(normAr(i.ta||''),(i.t||'').toLowerCase(),cset);
 if(!c&&i.k!=='video')c=findCity(normAr((i.sa||'').slice(0,300)),(i.s||'').slice(0,300).toLowerCase(),cset);
 if(c)return [c[1],c[2],c[3],true];
 const c0=tc[0]||(all.length===1?all[0]:null);if(!c0||!D.centroids[c0])return null;
 const [la,lo]=D.centroids[c0];return [la+((h%100)-50)/60,lo+(((h/100|0)%100)-50)/60,c0,false]}

/* ───── الجلب والترجمة ───── */
const strip=h=>{const d=document.createElement('div');d.innerHTML=(h||'').replace(/<(script|style)[\s\S]*?<\/\1>/gi,'');return (d.textContent||'').replace(/\s+/g,' ').trim()};
function gnews(q,lang){return 'https://news.google.com/rss/search?q='+encodeURIComponent(q)+(lang==='ar'?'&hl=ar&gl=EG&ceid=EG:ar':'&hl=en-US&gl=US&ceid=US:en')}
function parseFeed(xml){const doc=new DOMParser().parseFromString(xml,'text/xml');if(doc.querySelector('parsererror'))return [];
 const txt=(el,s)=>{const x=el.getElementsByTagName(s)[0];return x?x.textContent:''};const out=[];
 for(const it of [...doc.getElementsByTagName('item')].slice(0,20)){
  out.push({t:strip(txt(it,'title')),l:(txt(it,'link')||txt(it,'guid')).trim(),s:strip(txt(it,'description')||txt(it,'content:encoded')).slice(0,450),d:txt(it,'pubDate')||txt(it,'dc:date'),src:txt(it,'source')})}
 for(const it of [...doc.getElementsByTagName('entry')].slice(0,20)){
  const ln=[...it.getElementsByTagName('link')].find(x=>!x.getAttribute('rel')||x.getAttribute('rel')==='alternate');
  out.push({t:strip(txt(it,'title')),l:ln?ln.getAttribute('href'):'',s:strip(txt(it,'summary')||txt(it,'content')).slice(0,450),d:txt(it,'published')||txt(it,'updated')})}
 return out.filter(x=>x.t&&x.l)}
async function fetchFeed(f){
 const urls=[];if(f.url)urls.push(f.url);if(f.query)urls.push(gnews(f.query,f.lang));else if(f.site)urls.push(gnews('site:'+f.site+' when:3d',f.lang));
 for(const u of urls){try{const x=parseFeed(await http(u,{timeout:25000}));if(x.length)return x}catch(e){}}return []}
function tgParse(html,ch){const doc=new DOMParser().parseFromString(html,'text/html');const out=[];
 for(const w of [...doc.querySelectorAll('.tgme_widget_message')].slice(-5)){
  const post=w.getAttribute('data-post');const tx=w.querySelector('.tgme_widget_message_text');const tm=w.querySelector('time');
  if(!post||!tx)continue;const text=(tx.innerText||tx.textContent||'').replace(/\s+/g,' ').trim();if(text.length<12)continue;
  out.push({t:text.slice(0,500),l:'https://t.me/'+post,s:'',d:tm?tm.getAttribute('datetime'):'',src:ch.n})}
 return out}
async function translate(texts){
 if(!texts.length)return [];
 const body='q='+encodeURIComponent(texts.join('\n'));
 const r=JSON.parse(await http('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t',{method:'POST',body,timeout:30000}));
 const out=(r[0]||[]).map(x=>x[0]||'').join('').split('\n').map(s=>s.trim());
 if(out.length!==texts.length)throw new Error('mismatch');return out}
async function translateMany(texts){const res=new Array(texts.length).fill(null);let chunk=[],idx=[],len=0;const jobs=[];
 const flush=()=>{if(!chunk.length)return;const c=chunk,ix=idx;jobs.push(async()=>{try{const o=await translate(c);ix.forEach((k,j)=>res[k]=o[j])}catch(e){
   for(let j=0;j<c.length;j++){try{res[ix[j]]=(await translate([c[j]]))[0]}catch(e2){}}}});chunk=[];idx=[];len=0};
 texts.forEach((t,k)=>{const s=(t||'').replace(/\n+/g,' ').slice(0,600);if(len+s.length>3800)flush();chunk.push(s);idx.push(k);len+=s.length+1});flush();
 await pool(jobs,3);return res}

let BUSY=false;
async function refresh(manual){
 if(BUSY)return;BUSY=true;$('#btnRefresh').classList.add('spin');
 const t0=now(),known=new Set(ITEMS.map(i=>i.id)),fresh=[];
 const feeds=D.feeds.filter(f=>CFG.cats.includes(f.cat));
 const tgs=CFG.tg?D.tg:[];const total=feeds.length+tgs.length;let done=0;
 const tick=()=>{done++;prog(done/total*0.8,`جلب المصادر ${done}/${total}`)};
 const addRaw=(x,cat,src,lang,kind)=>{const id='i'+hsh((x.l||'')+'|'+x.t);if(known.has(id))return;known.add(id);
  let p=Math.floor((Date.parse(x.d)||Date.now())/1000);if(p>t0+600)p=t0;
  if(p<t0-(['think_global','think_arab','terror','intel'].includes(cat)?30:10)*86400)return;
  const ar=isAr(x.t)||lang==='ar'&&isAr(x.t+' '+x.s);
  fresh.push({id,cat,src:x.src&&lang!=='ar'&&!src?x.src:src,t:x.t,s:x.s,ta:ar?x.t:'',sa:ar?x.s:'',l:x.l,p,lang:ar?'ar':'en',tr:ar?1:0,k:kind||''})};
 prog(0.02,'بدء التحديث…');
 const tasks=feeds.map(f=>async()=>{const xs=await fetchFeed(f);const gn=(f.query||!f.url)&&xs.length;xs.forEach(x=>addRaw(x,f.cat,gn&&x.src?x.src+' (عبر Google)':f.name_ar,f.lang));tick()});
 tasks.push(...tgs.map(ch=>async()=>{try{tgParse(await http('https://t.me/s/'+ch.c,{timeout:20000}),ch).forEach(x=>addRaw(x,'tweets',ch.n,'',''))}catch(e){}tick()}));
 await pool(tasks,6);
 // الترجمة: الجديد + ما لم يُترجم سابقاً
 const need=[...fresh,...ITEMS].filter(i=>!i.tr).slice(0,350);
 if(CFG.translate&&need.length){prog(0.85,`ترجمة ${need.length} عنواناً…`);
  const tt=await translateMany(need.map(i=>i.t));need.forEach((i,k)=>{if(tt[k]){i.ta=tt[k];i.tr=1}});
  const ns=need.filter(i=>i.tr&&i.s&&!i.sa);prog(0.93,'ترجمة الملخصات…');
  const ss=await translateMany(ns.map(i=>i.s.slice(0,350)));ns.forEach((i,k)=>{if(ss[k])i.sa=ss[k]})}
 for(const i of [...fresh,...need]){i.ct=countriesOf(i.t,i.s,i.ta,i.sa);i.ev=eventsFor(i)}
 ITEMS=[...fresh,...ITEMS.filter(i=>!fresh.includes(i))];
 saveItems();runAlerts();CFG.last=now();saveCfg();
 prog(1,`تم: ${fresh.length} مادة جديدة`);setTimeout(()=>prog(0,''),2500);
 BUSY=false;$('#btnRefresh').classList.remove('spin');render();
 if(manual)toast(fresh.length?`${fresh.length} مادة جديدة`:'لا جديد الآن')}
function prog(f,t){$('#prog i').style.width=(f*100)+'%';$('#progTxt').textContent=t||''}

/* ───── الإنذار المبكر ───── */
function runAlerts(){const t=now(),win=3*3600,rec={},hist={},field={},neu=[];
 for(const i of ITEMS){if(['think_global','think_arab','economy'].includes(i.cat))continue;const ks=i.ct||[];
  if(i.p>=t-win){ks.forEach(c=>rec[c]=(rec[c]||0)+1);if(i.ev&&i.ev.length&&i.p>=t-7200)ks.forEach(c=>{(field[c]=field[c]||{n:0,e:{}}).n++;i.ev.forEach(e=>field[c].e[e]=(field[c].e[e]||0)+1)})}
  else if(i.p>=t-7*86400)ks.forEach(c=>hist[c]=(hist[c]||0)+1)}
 const span=Math.max(1,Math.min(7*86400,t-Math.min(...ITEMS.map(i=>i.p),t))-win)/win;
 for(const [c,n] of Object.entries(rec)){const base=(hist[c]||0)/span,ratio=(n+1)/(base+1);
  if(n>=6&&ratio>=3)neu.push({k:'country',key:c,lv:(ratio>=6||n>=25)?3:2,msg:`ارتفاع مفاجئ في أخبار ${c}: ${n} خبراً خلال 3 ساعات (×${ratio.toFixed(0)} من المعتاد)`})}
 for(const [c,f] of Object.entries(field))if(f.n>=3){const top=Object.entries(f.e).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]).join('، ');
  neu.push({k:'field',key:c,lv:f.n>=6?3:2,msg:`تصاعد ميداني في ${c}: ${f.n} أحداث نوعية خلال ساعتين (${top})`})}
 for(const s of STR){const ev=ITEMS.filter(i=>i.p>=t-7200&&i.ev&&i.ev.length&&straitOf(i)===s);
  if(ev.length)neu.push({k:'strait',key:s.name,lv:ev.length>=2||ev.some(i=>i.ev.includes('هجوم بحري'))?3:2,msg:ev.length>1?`${s.name}: ${ev.length} أحداث نوعية خلال ساعتين`:`${s.name}: ${ev[0].ev[0]} — ${(ev[0].ta||ev[0].t).slice(0,120)}`})}
 for(const a of neu){const last=ALERTS.find(x=>x.k===a.k&&x.key===a.key);if(last&&t-last.at<6*3600&&a.lv<=last.lv)continue;ALERTS.unshift({...a,at:t})}
 ALERTS=ALERTS.slice(0,15);LS.set('az_alerts',ALERTS);badge()}
function badge(){const n=ALERTS.filter(a=>a.at>CFG.alseen).length;const e=$('#alN');e.hidden=!n;e.textContent=n}

/* ───── العرض ───── */
const ago=p=>{const d=now()-p;if(d<60)return 'الآن';if(d<3600)return 'قبل '+Math.floor(d/60)+' د';if(d<86400)return 'قبل '+Math.floor(d/3600)+' س';return 'قبل '+Math.floor(d/86400)+' يوم'};
const T=i=>i.ta||i.t,S=i=>i.sa||(i.lang==='ar'?i.s:'');
const evH=ev=>(ev||[]).map(e=>`<span class="ev" style="--e:${EVC[e]||'var(--red)'}">${esc(e)}</span>`).join('');
const FLAG_SY='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwMCIvPjxyZWN0IHdpZHRoPSI5MDAiIGhlaWdodD0iNDAwIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMwMDdBM0QiLz48ZyBmaWxsPSIjQ0UxMTI2Ij48cG9seWdvbiBwb2ludHM9IjI3MC4wLDIzOC4wIDI4My45LDI4MC44IDMyOS4wLDI4MC44IDI5Mi41LDMwNy4zIDMwNi40LDM1MC4yIDI3MC4wLDMyMy43IDIzMy42LDM1MC4yIDI0Ny41LDMwNy4zIDIxMS4wLDI4MC44IDI1Ni4xLDI4MC44Ii8+PHBvbHlnb24gcG9pbnRzPSI0NTAuMCwyMzguMCA0NjMuOSwyODAuOCA1MDkuMCwyODAuOCA0NzIuNSwzMDcuMyA0ODYuNCwzNTAuMiA0NTAuMCwzMjMuNyA0MTMuNiwzNTAuMiA0MjcuNSwzMDcuMyAzOTEuMCwyODAuOCA0MzYuMSwyODAuOCIvPjxwb2x5Z29uIHBvaW50cz0iNjMwLjAsMjM4LjAgNjQzLjksMjgwLjggNjg5LjAsMjgwLjggNjUyLjUsMzA3LjMgNjY2LjQsMzUwLjIgNjMwLjAsMzIzLjcgNTkzLjYsMzUwLjIgNjA3LjUsMzA3LjMgNTcxLjAsMjgwLjggNjE2LjEsMjgwLjgiLz48L2c+PC9zdmc+';
const flag=c=>{const i=ISO[c];if(i==='SY')return `<img src="${FLAG_SY}" style="width:1.25em;height:.85em;vertical-align:-.1em;border-radius:2px" alt="">`;return i?String.fromCodePoint(...[...i].map(x=>127397+x.charCodeAt(0))):'🏳️'};
function card(i,full){return `<button class="card${READ.has(i.id)?' read':''}" data-open="${i.id}" style="--c:${CATC[i.cat]||'var(--acc)'}">
 <div class="m"><span class="s">${esc(i.src)}</span><span>${ago(i.p)}</span>${evH(i.ev)}</div><h3 dir="auto">${esc(T(i))}</h3>${full&&S(i)?`<p dir="auto">${esc(S(i))}</p>`:''}
 ${(i.ct||[]).length?`<div class="m" style="margin:6px 0 0">${i.ct.slice(0,3).map(c=>`<span class="ct">${flag(c)} ${esc(c)}</span>`).join('')}</div>`:''}</button>`}
let TAB='home',ST={cat:'all',ev:'',lim:40,q:'',country:'',mapH:24,mapSel:LS.get('az_mapsel',''),sub:''};
const V=$('#view');
function listHtml(arr){if(!arr.length)return `<div class="empty"><b>لا توجد مواد</b>${ITEMS.length?'جرّب قسماً آخر أو مدة أطول.':'اضغط زر التحديث أعلى الشاشة لجلب الأخبار. أول تحديث يأخذ دقيقة أو اثنتين.'}</div>`;
 return arr.slice(0,ST.lim).map(i=>card(i,true)).join('')+(arr.length>ST.lim?`<button class="more" data-more>عرض المزيد (${arr.length-ST.lim})</button>`:'')}
function render(){document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===TAB));
 if(ST.q)return renderSearch();({home:renderHome,qual:renderQual,map:renderMap,alerts:renderAlerts,more:renderMore}[TAB]||renderHome)()}
function renderHome(){if(ST.sub)return renderSub();const t=now(),d24=ITEMS.filter(i=>i.p>=t-86400);
 const qual=d24.filter(i=>i.ev&&i.ev.length);const cts={};d24.forEach(i=>(i.ct||[]).forEach(c=>cts[c]=(cts[c]||0)+1));
 const cats=[['all','الكل'],...D.cats.filter(c=>CFG.cats.includes(c[0])||c[0]==='tweets'&&CFG.tg).map(c=>[c[0],c[1]])];
 const arr=ITEMS.filter(i=>ST.cat==='all'||i.cat===ST.cat);
 V.innerHTML=`<div class="kpis"><div class="kpi"><b>${d24.length}</b>مادة اليوم</div><div class="kpi"><b>${qual.length}</b>خبراً نوعياً</div><div class="kpi"><b>${Object.keys(cts).length}</b>دولة</div><div class="kpi"><b>${ALERTS.filter(a=>a.at>=t-86400).length}</b>إنذاراً</div></div>
 ${ALERTS.length&&ALERTS[0].at>=t-6*3600?alertH(ALERTS[0]):''}
 ${qual.length?`<div class="boxh">أبرز الأحداث النوعية<span class="sp"></span><button class="lnk" data-tab="qual">الكل</button></div><div class="qs">${qual.slice(0,8).map(i=>card(i)).join('')}</div><div style="height:12px"></div>`:''}
 <div class="chips">${cats.map(([k,n])=>`<button class="chip${ST.cat===k?' on':''}" data-cat="${k}">${esc(n)}</button>`).join('')}</div>
 <div id="list">${listHtml(arr)}</div>
 ${CFG.last?`<div class="sub" style="text-align:center;margin-top:8px">آخر تحديث ${ago(CFG.last)}</div>`:''}`}
function renderQual(){const t=now(),H=ST.qh||24;const arr=ITEMS.filter(i=>i.ev&&i.ev.length&&i.p>=t-H*3600);const cnt={};arr.forEach(i=>i.ev.forEach(e=>cnt[e]=(cnt[e]||0)+1));
 const f=ST.ev?arr.filter(i=>i.ev.includes(ST.ev)):arr;
 V.innerHTML=`<h1 class="pg">الأخبار النوعية</h1><div class="sub">غارات، مسيّرات، انفجارات، اشتباكات، اعتقالات، هجمات بحرية… تُلتقط تلقائياً من العناوين.</div>
 <div class="chips">${[[6,'6 ساعات'],[24,'يوم'],[72,'3 أيام'],[168,'أسبوع']].map(([h,n])=>`<button class="chip${H===h?' on':''}" data-qh="${h}">${n}</button>`).join('')}</div>
 <div class="chips"><button class="chip${!ST.ev?' on':''}" data-ev="">الكل<em>${arr.length}</em></button>${ORDER.filter(e=>cnt[e]).map(e=>`<button class="chip${ST.ev===e?' on':''}" data-ev="${esc(e)}">${esc(e)}<em>${cnt[e]}</em></button>`).join('')}</div>
 <div id="list">${listHtml(f)}</div>`}
function alertH(a){const lc=a.lv>=3?'#F43F5E':'#F59E0B';const tl={country:'ارتفاع مفاجئ',field:'تصاعد ميداني',strait:'ممر بحري'}[a.k]||'إنذار';
 return `<div class="al" style="--lc:${lc}"><span class="lv">${a.lv>=3?'عالٍ':'إنذار'}</span><div><b>${esc(a.msg)}</b><small>${tl} · ${ago(a.at)}</small>
 <div style="margin-top:6px">${a.k==='strait'?`<button class="btn" data-mapsel="strait:${esc((STR.find(s=>s.name===a.key)||{}).key||'')}">على الخريطة</button>`:`<button class="btn" data-country="${esc(a.key)}">أخبار ${esc(a.key)}</button>`}</div></div></div>`}
function renderAlerts(){CFG.alseen=now();saveCfg();badge();
 V.innerHTML=`<h1 class="pg">الإنذار المبكر</h1><div class="sub">حين يقفز الحديث عن دولة فجأة، أو تتوالى الأحداث النوعية في مكان واحد، أو يقع حدث في مضيق هرمز أو باب المندب. آخر 15 إنذاراً فقط.</div>
 ${ALERTS.length?ALERTS.map(alertH).join(''):'<div class="empty"><b>لا إنذارات</b>يفحص التطبيق بعد كل تحديث.</div>'}`}
function renderSearch(){const words=normAr(ST.q).toLowerCase().split(/\s+/).filter(w=>w.length>1);
 const arr=ITEMS.filter(i=>{const x=normAr(T(i)+' '+S(i)+' '+i.t).toLowerCase();return words.every(w=>x.includes(w))});
 V.innerHTML=`<div class="sub" style="margin:4px 2px 10px">${arr.length} نتيجة لـ «${esc(ST.q)}»</div><div id="list">${listHtml(arr)}</div>`}
function renderMore(){if(ST.sub)return renderSub();
 const row=(k,ic,t,s)=>`<button class="row" data-sub="${k}"><svg viewBox="0 0 24 24">${ic}</svg><b>${t}</b><small>${s||''}</small></button>`;
 V.innerHTML=`<h1 class="pg">المزيد</h1><div class="list">
 ${row('daily','<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>','الملخص اليومي','آخر 24 ساعة')}
 ${row('countries','<path d="M4 21V4M4 4h12l-2 4 2 4H4"/>','الدول',Object.keys(ctyCounts()).length+' دولة')}
 ${row('saved','<path d="M6 3h12v18l-6-4-6 4z"/>','المحفوظات',Object.keys(SAVED).length||'')}
 ${row('settings','<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 2a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2h5l.3-2a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z"/>','الإعدادات','')}
 ${row('about','<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>','ادعم المشروع وعن التطبيق','')}
 </div>`}
function ctyCounts(){const t=now(),o={};ITEMS.forEach(i=>{if(i.p>=t-7*86400)(i.ct||[]).forEach(c=>{o[c]=o[c]||{w:0,d:0};o[c].w++;if(i.p>=t-86400)o[c].d++})});return o}
function back(h){return `<button class="btn" data-back style="margin-bottom:10px">→ رجوع</button>${h}`}
function renderSub(){const s=ST.sub;
 if(s==='country'){const c=ST.country;const arr=ITEMS.filter(i=>(i.ct||[]).includes(c));
  V.innerHTML=back(`<h1 class="pg">${flag(c)} ${esc(c)}</h1><div class="sub">${arr.length} مادة</div><div id="list">${listHtml(arr)}</div>`);return}
 if(s==='countries'){const o=ctyCounts();const l=Object.entries(o).sort((a,b)=>b[1].d-a[1].d||b[1].w-a[1].w);
  V.innerHTML=back(`<h1 class="pg">الدول</h1><div class="sub">كل مادة تُربط تلقائياً بالدول التي تتحدث عنها (آخر 7 أيام).</div>
  <div class="cgrid">${l.map(([c,n])=>`<button class="cty" data-country="${esc(c)}"><span class="f">${flag(c)}</span><span><b>${esc(c)}</b><small>${n.d} اليوم · ${n.w} أسبوع</small></span></button>`).join('')||'<div class="empty">لا بيانات بعد</div>'}</div>`);return}
 if(s==='saved'){const arr=Object.values(SAVED).sort((a,b)=>b.p-a.p);V.innerHTML=back(`<h1 class="pg">المحفوظات</h1><div id="list">${arr.length?arr.map(i=>card(i,true)).join(''):'<div class="empty"><b>لا محفوظات</b>احفظ أي خبر من نافذة القراءة.</div>'}</div>`);return}
 if(s==='daily')return renderDaily();
 if(s==='settings')return renderSettings();
 if(s==='about'){V.innerHTML=back(`<div class="box about"><b>مركز أبو زبيدة للتتبع والرصد</b><p>نسخة الجوال ${esc(window.Android&&Android.version?Android.version():'')}<br>تطوير أبو عبدالله الشامي</p>
  <p>التطبيق مجاني ويعمل على جوالك وحده: يجلب ${D.feeds.length} مصدراً و${D.tg.length} قناة تيليغرام ويترجمها ويحللها دون كمبيوتر.</p>
  <button class="btn pri" data-wa>ادعم المشروع / تواصل مع المطور (واتساب)</button></div>`);return}}
function renderDaily(){const t=now(),d=ITEMS.filter(i=>i.p>=t-86400);const qual=d.filter(i=>i.ev&&i.ev.length);const cts={};d.forEach(i=>(i.ct||[]).forEach(c=>cts[c]=(cts[c]||0)+1));
 const top=Object.entries(cts).sort((a,b)=>b[1]-a[1]).slice(0,6);const al=ALERTS.filter(a=>a.at>=t-86400);const st=d.filter(i=>['think_global','think_arab'].includes(i.cat)).slice(0,5);
 const li=i=>`<li><a data-open="${i.id}">${esc(T(i))}</a> <span>— ${esc(i.src)}</span></li>`;
 V.innerHTML=back(`<h1 class="pg">الملخص اليومي</h1><div class="sub">آخر 24 ساعة حتى ${new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</div>
 <div class="kpis"><div class="kpi"><b>${d.length}</b>مادة</div><div class="kpi"><b>${qual.length}</b>نوعياً</div><div class="kpi"><b>${Object.keys(cts).length}</b>دولة</div><div class="kpi"><b>${al.length}</b>إنذاراً</div></div>
 <button class="btn pri" data-sharedaily>مشاركة الملخص</button>
 <div class="ds">${qual.length?`<h3>أبرز الأحداث النوعية</h3><ol>${qual.slice(0,8).map(li).join('')}</ol>`:''}
 ${top.length?`<h3>الدول الأكثر حضوراً</h3>${top.map(([c,n])=>`<div style="margin:8px 0 2px;font-weight:700">${flag(c)} ${esc(c)} <span style="color:var(--faint);font-weight:400">(${n})</span></div><ul>${d.filter(i=>(i.ct||[]).includes(c)).slice(0,2).map(li).join('')}</ul>`).join('')}`:''}
 ${al.length?`<h3>الإنذارات</h3><ul>${al.map(a=>`<li>${esc(a.msg)}</li>`).join('')}</ul>`:''}
 ${st.length?`<h3>دراسات مختارة</h3><ul>${st.map(li).join('')}</ul>`:''}</div>`)}
function dailyText(){const t=now(),d=ITEMS.filter(i=>i.p>=t-86400),q=d.filter(i=>i.ev&&i.ev.length);const cts={};d.forEach(i=>(i.ct||[]).forEach(c=>cts[c]=(cts[c]||0)+1));
 let s=`📋 الملخص اليومي — ${new Date().toISOString().slice(0,10)}\n${d.length} مادة · ${q.length} خبراً نوعياً\n\n🔴 أبرز الأحداث:\n`+q.slice(0,7).map(i=>'• '+T(i)).join('\n');
 s+='\n\n📍 الدول الأكثر حضوراً: '+Object.entries(cts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c,n])=>`${c} (${n})`).join('، ');
 return s+'\n\nمركز أبو زبيدة للتتبع والرصد'}
function renderSettings(){const sw=(k,t,s)=>`<label class="set"><span>${t}${s?`<small>${s}</small>`:''}</span><span class="sw"><input type="checkbox" data-cfg="${k}"${CFG[k]?' checked':''}><i></i></span></label>`;
 const kb=Math.round((localStorage.getItem('az_items')||'').length/1024);
 V.innerHTML=back(`<h1 class="pg">الإعدادات</h1><div class="box">
 <label class="set"><span>التحديث التلقائي<small>ما دام التطبيق مفتوحاً</small></span><select id="interval">${[[0,'يدوي فقط'],[15,'كل 15 دقيقة'],[30,'كل 30 دقيقة'],[60,'كل ساعة']].map(([v,n])=>`<option value="${v}"${+CFG.interval===v?' selected':''}>${n}</option>`).join('')}</select></label>
 ${sw('translate','الترجمة إلى العربية','الأخبار الأجنبية تُترجم تلقائياً')}
 ${sw('tg','قنوات تيليغرام',D.tg.length+' قناة عامة')}
 <label class="set"><span>المظهر</span><select id="theme"><option value="dark"${CFG.theme==='dark'?' selected':''}>داكن</option><option value="light"${CFG.theme==='light'?' selected':''}>نهاري</option></select></label></div>
 <div class="box"><div class="boxh">الأقسام التي تُجلب</div><div class="sub" style="margin:0 0 6px">إيقاف أقسام لا تحتاجها يوفّر الإنترنت ويسرّع التحديث.</div>
 ${D.cats.filter(c=>c[0]!=='tweets').map(c=>`<label class="set"><span>${esc(c[1])}<small>${D.feeds.filter(f=>f.cat===c[0]).length} مصدراً</small></span><span class="sw"><input type="checkbox" data-catc="${c[0]}"${CFG.cats.includes(c[0])?' checked':''}><i></i></span></label>`).join('')}</div>
 <div class="box"><div class="boxh">البيانات</div><div class="sub" style="margin:0 0 8px">${ITEMS.length} مادة محفوظة على الجوال (${kb} ك.ب)</div><button class="btn" data-clear>مسح الأخبار المخزنة</button></div>`)}

/* ───── نافذة القراءة ───── */
let CUR=null;
function openItem(id){const i=ITEMS.find(x=>x.id===id)||SAVED[id];if(!i)return;CUR=i;READ.add(id);LS.set('az_read',[...READ].slice(-3000));
 $('#sheetBody').innerHTML=`<div class="meta"><span style="color:${CATC[i.cat]};font-weight:700">${esc(i.src)}</span><span>${esc(CATN[i.cat]||'')}</span><span>${new Date(i.p*1000).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'})}</span></div>
 <div style="margin-top:6px">${evH(i.ev)}</div><h2 dir="auto">${esc(T(i))}</h2>
 ${(i.ct||[]).length?`<div class="meta">${i.ct.map(c=>`<span class="ct" data-country="${esc(c)}">${flag(c)} ${esc(c)}</span>`).join('')}</div>`:''}
 <div class="body" style="margin-top:12px">${S(i)?`<p dir="auto">${esc(S(i))}</p>`:''}</div>
 ${i.lang!=='ar'&&i.t!==T(i)?`<details><summary style="color:var(--faint);font-size:12.5px">العنوان الأصلي</summary><p class="orig">${esc(i.t)}</p></details>`:''}
 <div class="acts"><button class="btn pri" data-full><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>النص الكامل</button>
 <button class="btn" data-link><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>فتح في موقعه</button>
 <button class="btn" data-share><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>مشاركة</button>
 <button class="btn" data-save>${SAVED[i.id]?'✓ محفوظ':'حفظ'}</button></div><div id="full"></div>`;
 $('#sheet').hidden=false;$('#sheet .sheetbox').scrollTop=0}
async function loadFull(){const i=CUR;if(!i)return;const box=$('#full');box.innerHTML='<p><span class="spin"></span>جارٍ جلب النص الكامل…</p>';
 try{let txt=await http('https://r.jina.ai/'+i.l,{timeout:45000});
  const k=txt.indexOf('Markdown Content:');if(k>=0)txt=txt.slice(k+17);
  txt=txt.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/^[#>*\-\s]+/gm,'').replace(/\r/g,'');
  let paras=txt.split(/\n{2,}|\n/).map(p=>p.trim()).filter(p=>p.length>60&&!/^(http|cookie|subscribe|sign up|advertisement)/i.test(p)).slice(0,30);
  if(!paras.length)throw new Error('empty');
  if(CUR!==i)return;
  if(!isAr(paras.join(' '))&&CFG.translate){box.innerHTML='<p><span class="spin"></span>جارٍ الترجمة…</p>';const tr=await translateMany(paras);paras=paras.map((p,k)=>tr[k]||p)}
  if(CUR!==i)return;box.innerHTML='<div class="body">'+paras.map(p=>`<p dir="auto">${esc(p)}</p>`).join('')+'</div>'}
 catch(e){if(CUR===i)box.innerHTML='<p style="color:var(--faint)">تعذّر جلب النص الكامل. افتح المقال في موقعه.</p>'}}
function closeSheet(){$('#sheet').hidden=true;CUR=null}

/* ───── الخريطة ───── */
let MAP=null,MLAYER=null,TILE=null,LBL=null,LEAF=null;
function loadLeaflet(){if(LEAF)return LEAF;const srcs=[['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'],['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js']];
 LEAF=new Promise((ok,no)=>{let k=0;const tryOne=()=>{if(k>=srcs.length){LEAF=null;return no()}const [c,j]=srcs[k++];const l=document.createElement('link');l.rel='stylesheet';l.href=c;document.head.appendChild(l);
  const s=document.createElement('script');s.src=j;s.onload=ok;s.onerror=tryOne;document.head.appendChild(s)};tryOne()});return LEAF}
const TILES={general:{d:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',l:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'},
 detailed:{d:'https://tile.openstreetmap.org/{z}/{x}/{y}.png'},satellite:{d:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',lab:'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'}};
let MSTYLE=LS.get('az_mstyle','general');
function tileUrl(){const t=TILES[MSTYLE]||TILES.general;return (CFG.theme==='light'&&t.l)?t.l:t.d}
function renderMap(){const opts=[['','الخريطة الكاملة'],...STR.map(s=>['strait:'+s.key,'⚓ '+s.name]),...Object.keys(D.centroids).sort().map(c=>[c,(ISO[c]==='SY'?'':flag(c)+' ')+c])];
 V.innerHTML=`<div class="mapctl"><select id="mapsel" style="flex:1">${opts.map(([v,n])=>`<option value="${esc(v)}"${ST.mapSel===v?' selected':''}>${esc(n)}</option>`).join('')}</select>
 <select id="mstyle"><option value="general">عامة</option><option value="detailed">تفصيلية</option><option value="satellite">قمر صناعي</option></select></div>
 <div class="chips">${[[6,'6 ساعات'],[24,'يوم'],[72,'3 أيام'],[168,'أسبوع']].map(([h,n])=>`<button class="chip${ST.mapH===h?' on':''}" data-mh="${h}">${n}</button>`).join('')}</div>
 <div id="map"><div class="empty"><span class="spin"></span>تحميل الخريطة…</div></div><div id="mapcount" class="sub" style="margin:6px 2px"></div><div id="straits"></div>`;
 $('#mstyle').value=MSTYLE;MAP=null;drawMap()}
async function drawMap(){try{await loadLeaflet()}catch(e){$('#map').innerHTML='<div class="empty">تعذّر تحميل الخريطة. تأكد من الاتصال بالإنترنت.</div>';drawStraits();return}
 if(!$('#map'))return;$('#map').innerHTML='';
 MAP=L.map('map',{zoomControl:false,attributionControl:false,worldCopyJump:true}).setView([30,42],4);
 TILE=L.tileLayer(tileUrl(),{maxZoom:19}).addTo(MAP);if(TILES[MSTYLE].lab)LBL=L.tileLayer(TILES[MSTYLE].lab,{maxZoom:19}).addTo(MAP);
 STR.forEach(s=>{L.circle([s.lat,s.lon],{radius:s.r,color:s.color,weight:2,dashArray:'6 6',fillOpacity:.08,interactive:false}).addTo(MAP);
  L.marker([s.lat,s.lon],{interactive:false,icon:L.divIcon({className:'lbl-st',html:'⚓ '+s.name,iconSize:[100,18],iconAnchor:[50,-14]})}).addTo(MAP)});
 MLAYER=L.layerGroup().addTo(MAP);plotMap()}
function plotMap(){if(!MAP)return;MLAYER.clearLayers();const t=now(),sel=ST.mapSel;let n=0;
 for(const i of ITEMS){if(!i.ev||!i.ev.length||i.p<t-ST.mapH*3600)continue;const loc=locate(i);if(!loc)continue;
  if(sel.startsWith('strait:')){if(loc[4]!==sel.slice(7))continue}else if(sel&&!(i.ct||[]).includes(sel)&&loc[2]!==sel)continue;
  n++;L.circleMarker([loc[0],loc[1]],{radius:loc[3]?8:6,color:'#fff',weight:1.2,fillColor:EVC[i.ev[0]]||'#EF4444',fillOpacity:.9})
   .on('click',()=>openItem(i.id)).addTo(MLAYER)}
 $('#mapcount').textContent=n+' حدثاً على الخريطة — اضغط أي نقطة لقراءة الخبر';
 if(sel.startsWith('strait:')){const s=STR.find(x=>'strait:'+x.key===sel);if(s)MAP.fitBounds(s.bbox)}
 else if(sel&&D.centroids[sel])MAP.setView(D.centroids[sel],6);else MAP.setView([30,42],4);
 drawStraits()}
function drawStraits(){const box=$('#straits');if(!box)return;const t=now(),H=ST.mapH*3600;
 box.innerHTML=STR.map(s=>{const arr=ITEMS.filter(i=>i.p>=t-H&&straitOf(i)===s),ev=arr.filter(i=>i.ev&&i.ev.length).length;
  return `<div class="stc" style="--sc:${s.color}"><div class="h"><b>⚓ ${esc(s.name)}</b><button class="btn" data-mapsel="strait:${s.key}">على الخريطة</button></div>
  <div class="n"><em>${arr.length}</em>خبراً · <em>${ev}</em>حدثاً نوعياً</div>${arr.slice(0,4).map(i=>card(i)).join('')||'<div class="sub" style="margin:0">لا أخبار في هذه المدة.</div>'}</div>`}).join('')}

/* ───── الأحداث ───── */
document.addEventListener('click',e=>{const b=e.target.closest('button,a,[data-open],[data-country]');if(!b)return;const d=b.dataset;
 if(b.closest('.tabs')&&d.tab){TAB=d.tab;ST.sub='';ST.lim=40;ST.q='';$('#searchbar').hidden=true;render();scrollTo(0,0);return}
 if(d.tab){TAB=d.tab;ST.sub='';render();scrollTo(0,0);return}
 if(d.open!==undefined){openItem(d.open);return}
 if(d.country!==undefined){closeSheet();TAB='more';ST.sub='country';ST.country=d.country;ST.lim=40;render();scrollTo(0,0);return}
 if(d.cat!==undefined){ST.cat=d.cat;ST.lim=40;render();return}
 if(d.ev!==undefined){ST.ev=d.ev;ST.lim=40;render();return}
 if(d.qh!==undefined){ST.qh=+d.qh;render();return}
 if(d.more!==undefined){ST.lim+=40;render();return}
 if(d.sub!==undefined){ST.sub=d.sub;ST.lim=40;render();scrollTo(0,0);return}
 if(d.back!==undefined){window.onBack();return}
 if(d.mh!==undefined){ST.mapH=+d.mh;document.querySelectorAll('[data-mh]').forEach(x=>x.classList.toggle('on',x===b));plotMap();return}
 if(d.mapsel!==undefined){ST.mapSel=d.mapsel;LS.set('az_mapsel',ST.mapSel);if(TAB!=='map'){TAB='map';ST.sub='';render()}else{$('#mapsel').value=ST.mapSel;plotMap()}scrollTo(0,0);return}
 if(d.full!==undefined){loadFull();return}
 if(d.link!==undefined){if(CUR)openUrl(CUR.l);return}
 if(d.share!==undefined){if(CUR)share(T(CUR)+'\n'+CUR.l+'\n\nعبر مركز أبو زبيدة للتتبع والرصد');return}
 if(d.save!==undefined){if(!CUR)return;if(SAVED[CUR.id]){delete SAVED[CUR.id];b.textContent='حفظ'}else{SAVED[CUR.id]=CUR;b.textContent='✓ محفوظ'}LS.set('az_saved',SAVED);return}
 if(d.sharedaily!==undefined){share(dailyText());return}
 if(d.wa!==undefined){openUrl('https://wa.me/'+DEV_WA+'?text='+encodeURIComponent('السلام عليكم، بخصوص تطبيق مركز أبو زبيدة للتتبع والرصد'));return}
 if(d.clear!==undefined){if(confirm('مسح كل الأخبار المخزنة؟ (المحفوظات تبقى)')){ITEMS=[];ALERTS=[];LS.set('az_items',[]);LS.set('az_alerts',[]);badge();render()}return}});
document.addEventListener('change',e=>{const t=e.target;
 if(t.dataset.cfg){CFG[t.dataset.cfg]=t.checked;saveCfg();return}
 if(t.dataset.catc){const k=t.dataset.catc;CFG.cats=t.checked?[...new Set([...CFG.cats,k])]:CFG.cats.filter(x=>x!==k);saveCfg();return}
 if(t.id==='interval'){CFG.interval=+t.value;saveCfg();schedule();return}
 if(t.id==='theme'){CFG.theme=t.value;saveCfg();document.documentElement.dataset.theme=CFG.theme;return}
 if(t.id==='mapsel'){ST.mapSel=t.value;LS.set('az_mapsel',ST.mapSel);plotMap();return}
 if(t.id==='mstyle'){MSTYLE=t.value;LS.set('az_mstyle',MSTYLE);renderMap();return}});
$('#sheet').addEventListener('click',e=>{if(e.target.id==='sheet')closeSheet()});
$('#btnRefresh').onclick=()=>refresh(true);
$('#btnSearch').onclick=()=>{$('#searchbar').hidden=false;$('#q').focus()};
$('#qClose').onclick=()=>{$('#searchbar').hidden=true;$('#q').value='';ST.q='';render()};
let qt;$('#q').oninput=e=>{clearTimeout(qt);qt=setTimeout(()=>{ST.q=e.target.value.trim();ST.lim=40;render()},300)};
window.onBack=()=>{if(!$('#sheet').hidden){closeSheet();return true}
 if(!$('#searchbar').hidden){$('#qClose').click();return true}
 if(ST.sub){ST.sub=ST.sub==='country'&&TAB==='more'&&ST._from?ST._from:'';render();return true}
 if(TAB!=='home'){TAB='home';render();return true}return false};
let TIMER=null;function schedule(){clearInterval(TIMER);if(+CFG.interval>0)TIMER=setInterval(()=>refresh(false),CFG.interval*60000)}

/* ───── البدء ───── */
badge();render();schedule();
if(!CFG.last||now()-CFG.last>Math.max(10,+CFG.interval||30)*60)setTimeout(()=>refresh(false),600);
