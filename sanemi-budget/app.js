/* Budget perso Sanemi — PWA reliée à Sanemi OS (Supabase, tables sanemi_). */
"use strict";

/* ---------- Référentiels ---------- */
const OUT_CATS=[
  {id:"logement",name:"Logement",def:2500},
  {id:"nourriture",name:"Nourriture",def:1100},
  {id:"abonnements",name:"Abonnements fixes",def:287},
  {id:"wenna",name:"Aide WennaShop",def:500},
  {id:"pret",name:"Remboursement prêt",def:0},
  {id:"deplacements",name:"Déplacements",def:200},
  {id:"style",name:"Style vestimentaire",def:150},
  {id:"sorties",name:"Sorties et loisirs",def:100},
  {id:"sante",name:"Santé et sport",def:0},
  {id:"epargne",name:"Épargne et voyages",def:0},
  {id:"divers",name:"Divers",def:0}
];
const IN_CATS=[{id:"salaire",name:"Salaire"},{id:"hexjen",name:"Hexjen"},{id:"wenna_in",name:"WennaShop"},{id:"autre_in",name:"Autre entrée"}];
const LOAN_CATS=[{id:"pret_donne",name:"Prêt donné"},{id:"pret_recu",name:"Prêt reçu"},{id:"remb_recu",name:"Remboursement reçu"}];
const NAME=Object.fromEntries([...OUT_CATS,...IN_CATS,...LOAN_CATS].map(c=>[c.id,c.name]));
const DOMAINES=["WennaShop","Hexjen","Fixi","Myria","Havoc","Sanemi OS","Contenu","Finances","Perso","Spirituel","Autre"];
const STATUTS={a_analyser:"À analyser",nouvelle:"Nouvelle",a_explorer:"À explorer",en_cours:"En cours",realisee:"Réalisée",archivee:"Archivée"};
const ENNEA={
  1:{n:"Le Perfectionniste",i:7,s:4,peur:"être mauvais ou dans l'erreur",parler:"Sois précis et fiable, reconnais son sérieux, évite le flou."},
  2:{n:"L'Altruiste",i:4,s:8,peur:"ne pas être aimé",parler:"Remercie-le sincèrement, demande ce dont lui a besoin."},
  3:{n:"Le Battant",i:6,s:9,peur:"être sans valeur",parler:"Parle objectifs et résultats, valorise ses réussites, sois efficace."},
  4:{n:"L'Individualiste",i:1,s:2,peur:"n'avoir aucune identité propre",parler:"Accueille ses émotions sans les minimiser, reconnais sa singularité."},
  5:{n:"L'Observateur",i:8,s:7,peur:"être incompétent ou envahi",parler:"Donne de l'info claire, laisse-lui du temps et de l'espace."},
  6:{n:"Le Loyal",i:9,s:3,peur:"être sans soutien ni repères",parler:"Rassure, sois cohérent, annonce les risques et le plan B."},
  7:{n:"L'Épicurien",i:5,s:1,peur:"être privé ou coincé dans la douleur",parler:"Garde de l'énergie et des options, sois bref, évite la lourdeur."},
  8:{n:"Le Chef",i:2,s:5,peur:"être contrôlé ou vulnérable",parler:"Sois direct et franc, tiens tête avec respect, pas de manipulation."},
  9:{n:"Le Médiateur",i:3,s:6,peur:"le conflit et la séparation",parler:"Sois calme, inclus-le, aide-le à prioriser sans pression."}
};

/* ---------- Utilitaires ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>Math.round(+n||0).toLocaleString("fr-FR")+" DH";
const ym=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
const ymd=d=>ym(d)+"-"+String(d.getDate()).padStart(2,"0");
// Courbe lissee monotone (Fritsch-Carlson) : passe par chaque point sans jamais
// depasser les valeurs reelles, contrairement a un lissage bezier naif.
function curvePath(pts){
  const n=pts.length;
  if(!n)return"";
  if(n===1)return"M"+pts[0].x+" "+pts[0].y;
  const dx=[],m=[],t=[];
  for(let i=0;i<n-1;i++){dx[i]=pts[i+1].x-pts[i].x;m[i]=(pts[i+1].y-pts[i].y)/dx[i]}
  t[0]=m[0];t[n-1]=m[n-2];
  for(let i=1;i<n-1;i++)t[i]=m[i-1]*m[i]<=0?0:(m[i-1]+m[i])/2;
  for(let i=0;i<n-1;i++){
    if(m[i]===0){t[i]=0;t[i+1]=0;continue}
    const a=t[i]/m[i],b=t[i+1]/m[i],s=a*a+b*b;
    if(s>9){const f=3/Math.sqrt(s);t[i]=f*a*m[i];t[i+1]=f*b*m[i]}
  }
  let d="M"+pts[0].x+" "+pts[0].y;
  for(let i=0;i<n-1;i++){const h=dx[i]/3;
    d+="C"+(pts[i].x+h)+" "+(pts[i].y+t[i]*h)+","+(pts[i+1].x-h)+" "+(pts[i+1].y-t[i+1]*h)+","+pts[i+1].x+" "+pts[i+1].y}
  return d;
}
const today=()=>ymd(new Date());
const uid=()=>(crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16)}));
const dlabel=s=>new Date(s+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"short"});
function toast(m){const t=$("toast");t.textContent=m;t.classList.add("on");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("on"),2600)}
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

/* ---------- État ---------- */
/* Tables Sanemi OS existantes (colonnes d'origine conservées) + correspondance avec les champs de l'app */
const TABLES={ops:"sanemi_transactions",prets:"sanemi_prets",journal:"sanemi_journal",idees:"sanemi_ideas",personnes:"sanemi_relations",courses:"sanemi_courses"};
const pick=(o,ks)=>Object.fromEntries(ks.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const MAP={
  ops:{to:r=>({...pick(r,["id","produit","quantite","unite","devise","montant_orig","lieu","personne","contexte","date","pret_id","source","created_at"]),type:r.type==="in"?"income":"expense",amount:r.montant,category:r.categorie,label:r.produit||catName(r.categorie)}),
       from:d=>({...d,type:["income","in","entree","revenu"].includes(d.type)?"in":"out",montant:+d.amount||0,categorie:d.category,produit:d.produit||d.label,date:d.date||(d.created_at||"").slice(0,10)})},
  prets:{to:r=>r,from:d=>d},
  courses:{to:r=>r,from:d=>d},
  journal:{to:r=>({...pick(r,["id","date","recit","humeur","energie","etat"]),note_libre:r.note??null}),from:d=>({...d,note:d.note_libre})},
  idees:{to:r=>({...pick(r,["id","tags","resume","potentiel","effort","action","lecture_ennea","lien_os","created_at"]),content:r.texte,title:r.titre??null,project:r.domaine||"general",status:r.statut}),
         from:d=>({...d,texte:d.content||d.title||"",titre:d.title,domaine:d.project&&d.project!=="general"?d.project:null,statut:d.status||"nouvelle"})},
  personnes:{to:r=>({...pick(r,["id","aile","notes","created_at"]),name:r.nom,relation_detail:r.relation??null,type_ennea:r.type??null,ia_analyse:r.analyse??null}),
             from:d=>({...d,nom:d.name||"",relation:d.relation_detail||(d.relation_type&&d.relation_type!=="autre"?d.relation_type:null),type:d.type_ennea,analyse:d.ia_analyse})}
};
const DEF_PROFIL={type:null,aile:"",sous_type:"",revenu:4500,taux:60,budgets:Object.fromEntries(OUT_CATS.map(c=>[c.id,c.def]))};
let S={profil:{...DEF_PROFIL},ops:[],prets:[],journal:[],idees:[],personnes:[],courses:[]};
let queue=LS.get("sb_queue",[]);
let user=null, view=new Date(), tab="budget", domFilter="", draft=null;
view=new Date(view.getFullYear(),view.getMonth(),1);

const db=window.supabase.createClient(window.SB_URL,window.SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,storageKey:"sanemi-auth"}});

function saveCache(){LS.set("sb_cache_"+(user?user.id:"x"),S);LS.set("sb_queue",queue);syncLabel()}
function syncLabel(){
  const off=!navigator.onLine;
  $("sync").textContent=off?"Hors ligne · "+queue.length+" en attente":queue.length?queue.length+" à synchroniser":"Synchronisé avec Sanemi OS";
}

/* ---------- Liste de courses / marché du mois, par enveloppe ---------- */
// Quelles listes sont depliees : garde en memoire entre deux rendus.
const openLists={};
const coursesOf=c=>S.courses.filter(x=>x.mois===ym(view)&&x.categorie===c);
// Ce qui reste a acheter : sert a afficher "prevus" a cote du reste d'enveloppe.
const prevuOf=c=>coursesOf(c).filter(x=>!x.achete).reduce((t,x)=>t+(+x.montant_prevu||0),0);

function listBlock(c){
  const items=coursesOf(c),open=!!openLists[c];
  const reste=items.filter(x=>!x.achete).length;
  const resume=items.length?items.length+" article"+(items.length>1?"s":"")+(reste?" · "+reste+" à acheter":" · tout est acheté"):"aucun article";
  let h='<div class="clist'+(open?" open":"")+'">'
    +'<button type="button" class="ctog" data-act="toggle" data-cat="'+esc(c)+'" aria-expanded="'+open+'">Liste de courses — '+esc(resume)+'</button>';
  if(open){
    h+='<div class="cbody">';
    h+=items.length?items.map(x=>'<label class="citem'+(x.achete?" done":"")+'">'
      +'<input type="checkbox" data-act="check" data-id="'+esc(x.id)+'"'+(x.achete?" checked":"")+'>'
      +'<span class="cn">'+esc(x.produit)+'<span class="cq">'+esc(qtyLabel(x))+'</span></span>'
      +'<span class="cm num">'+fmt(x.montant_prevu)+'</span>'
      +'<button type="button" class="cdel" data-act="del" data-id="'+esc(x.id)+'" aria-label="Retirer '+esc(x.produit)+'">Retirer</button>'
      +'</label>').join(""):'<p class="empty">Rien pour l\'instant. Ajoute ce que tu comptes acheter ce mois-ci.</p>';
    h+='<div class="cadd" data-cat="'+esc(c)+'">'
      +'<input type="text" class="cp" placeholder="Produit" aria-label="Produit">'
      +'<input type="number" class="cq2" placeholder="Qté" step="any" min="0" aria-label="Quantité">'
      +'<input type="text" class="cu" placeholder="Unité" aria-label="Unité">'
      +'<input type="number" class="cm2" placeholder="Montant prévu" step="any" min="0" aria-label="Montant prévu en DH">'
      +'<button type="button" class="btn sm" data-act="add" data-cat="'+esc(c)+'">Ajouter</button>'
      +'</div></div>';
  }
  return h+'</div>';
}
const qtyLabel=x=>{const q=+x.quantite||1,u=(x.unite||"").trim();return q===1&&!u?"":" · "+q+(u?" "+u:"")};

// Cocher cree la depense ; decocher la supprime. L'article garde le lien (tx_id)
// pour que les deux sens restent exacts.
function courseCheck(id,on){
  const x=S.courses.find(i=>i.id===id);if(!x)return;
  if(on){
    const t=uid();
    put("ops",{id:t,type:"out",montant:Math.round((+x.montant_prevu||0)*100)/100,devise:"MAD",montant_orig:+x.montant_prevu||0,
      produit:x.produit,quantite:+x.quantite||1,unite:x.unite||null,categorie:x.categorie,
      contexte:"Liste de courses",date:today(),created_at:new Date().toISOString()});
    put("courses",{...x,achete:true,tx_id:t});
    toast("Dépense enregistrée : "+x.produit);
  }else{
    if(x.tx_id)del("ops",x.tx_id);
    put("courses",{...x,achete:false,tx_id:null});
    toast("Dépense annulée");
  }
  renderBudget();
}

function courseDelete(id){
  const x=S.courses.find(i=>i.id===id);if(!x)return;
  if(x.achete&&x.tx_id&&!confirm("« "+x.produit+" » a créé une dépense. La retirer de la liste supprimera aussi cette dépense. Continuer ?"))return;
  if(x.achete&&x.tx_id)del("ops",x.tx_id);
  del("courses",id);renderBudget();
}

function courseAdd(cat,box){
  const produit=box.querySelector(".cp").value.trim();
  if(!produit){toast("Donne au moins un nom de produit");return}
  put("courses",{id:uid(),mois:ym(view),categorie:cat,produit,
    quantite:+box.querySelector(".cq2").value||1,
    unite:box.querySelector(".cu").value.trim()||null,
    montant_prevu:+box.querySelector(".cm2").value||0,
    achete:false,tx_id:null,created_at:new Date().toISOString()});
  openLists[cat]=true;renderBudget();
}

$("env").addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");if(!b)return;
  const act=b.dataset.act;
  if(act==="toggle"){openLists[b.dataset.cat]=!openLists[b.dataset.cat];renderBudget()}
  else if(act==="del"){e.preventDefault();courseDelete(b.dataset.id)}
  else if(act==="add"){courseAdd(b.dataset.cat,b.closest(".cadd"))}
});
$("env").addEventListener("change",e=>{
  const c=e.target.closest('[data-act="check"]');
  if(c)courseCheck(c.dataset.id,c.checked);
});

/* Écriture locale immédiate + file d'attente vers Supabase */
function put(key,row){const arr=S[key];const i=arr.findIndex(x=>x.id===row.id);const full=i>=0?{...arr[i],...row}:row;if(i>=0)arr[i]=full;else arr.push(full);queue.push({k:key,op:"upsert",row:full});saveCache();flush()}
function del(key,id){S[key]=S[key].filter(x=>x.id!==id);queue.push({k:key,op:"delete",id});saveCache();flush()}
function putProfil(p){S.profil={...S.profil,...p};const P=S.profil;queue.push({k:"profil",op:"profil",row:{user_id:user.id,type:P.type||null,aile:P.aile||null,sous_type:P.sous_type||null,revenu:P.revenu,taux:P.taux,budgets:P.budgets,updated_at:new Date().toISOString()}});saveCache();flush()}

let flushing=false;
async function flush(){
  if(flushing||!navigator.onLine||!user)return;flushing=true;
  try{
    while(queue.length){
      const q=queue[0];let res;
      if(q.op==="upsert")res=await db.from(TABLES[q.k]).upsert(MAP[q.k].to(q.row));
      else if(q.op==="delete")res=await db.from(TABLES[q.k]).delete().eq("id",q.id);
      else if(q.op==="profil")res=await db.from("sanemi_profil").upsert(q.row,{onConflict:"user_id"});
      else res={error:null};
      if(res.error){
        if(/fetch|network|Failed/i.test(res.error.message||""))break;
        console.warn("Sync rejetée",res.error);toast("Une modification a été refusée par le serveur");
      }
      queue.shift();LS.set("sb_queue",queue);
    }
  }catch(e){/* réseau coupé : on réessaiera */}
  flushing=false;syncLabel();
}
window.addEventListener("online",()=>{flush().then(loadAll)});
window.addEventListener("offline",syncLabel);

async function loadAll(){
  if(!navigator.onLine||!user)return;
  await flush();
  if(queue.length)return;
  try{
    const [o,p,j,i,pe,pr,co]=await Promise.all([
      db.from(TABLES.ops).select("*").order("created_at",{ascending:false}).limit(5000),
      db.from(TABLES.prets).select("*").order("date",{ascending:false}),
      db.from(TABLES.journal).select("*").order("date",{ascending:false}).limit(1000),
      db.from(TABLES.idees).select("*").order("created_at",{ascending:false}),
      db.from(TABLES.personnes).select("*").order("name"),
      db.from("sanemi_profil").select("*").maybeSingle(),
      db.from(TABLES.courses).select("*").order("created_at",{ascending:true}).limit(2000)
    ]);
    const err=[o,p,j,i,pe,pr,co].find(r=>r.error);if(err)throw err.error;
    S.ops=o.data.map(MAP.ops.from);S.prets=p.data;S.journal=j.data.map(MAP.journal.from);S.idees=i.data.map(MAP.idees.from);S.personnes=pe.data.map(MAP.personnes.from);S.courses=co.data||[];
    if(pr.data)S.profil={...DEF_PROFIL,...pr.data,budgets:{...DEF_PROFIL.budgets,...(pr.data.budgets||{})}};
    saveCache();renderAll();
  }catch(e){console.warn(e);toast("Chargement impossible, données locales affichées")}
}

/* ---------- IA (fonction serveur sanemi-ia) ---------- */
async function ai(action,payload){
  if(!navigator.onLine)throw new Error("offline");
  const {data,error}=await db.functions.invoke("sanemi-ia",{body:{action,payload}});
  if(error)throw error;
  if(data&&data.error)throw new Error(data.error);
  return data;
}
function enneaCtx(){const t=S.profil.type;return t?{type:+t,nom:ENNEA[t].n,integration:ENNEA[t].i,stress:ENNEA[t].s,aile:S.profil.aile||null,sous_type:S.profil.sous_type||null}:null}

/* ---------- Navigation ---------- */
const TITLES={budget:"Budget",journal:"Journal",idees:"Idées",personnes:"Personnes",reglages:"Réglages"};
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>{tab=b.dataset.v;
  document.querySelectorAll("nav.tabs button").forEach(x=>{if(x===b)x.setAttribute("aria-current","page");else x.removeAttribute("aria-current")});
  Object.keys(TITLES).forEach(k=>$("v-"+k).hidden=k!==tab);
  $("title").textContent=TITLES[tab];$("monthBar").hidden=tab!=="budget";
  window.scrollTo(0,0);renderAll()});
$("prev").onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);renderBudget()};
$("next").onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);renderBudget()};

/* ================= BUDGET ================= */
const isOut=t=>t.type==="out";
function catName(id){return NAME[id]||id||"Divers"}
function fillCatList(){
  const extra=[...new Set(S.ops.map(o=>o.categorie).filter(c=>c&&!NAME[c]))];
  $("catList").innerHTML=[...OUT_CATS,...IN_CATS,...LOAN_CATS].map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join("")+extra.map(c=>'<option value="'+esc(c)+'"></option>').join("");
}
function renderBudget(){
  const key=ym(view);
  $("mlabel").textContent=view.toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
  const mtx=S.ops.filter(t=>(t.date||"").startsWith(key));
  const inc=mtx.filter(t=>t.type==="in").reduce((s,t)=>s+ +t.montant,0);
  const out=mtx.filter(isOut).reduce((s,t)=>s+ +t.montant,0);
  const bal=inc-out;
  $("kIn").textContent=fmt(inc);$("kInS").textContent="Prévu : "+fmt(S.profil.revenu);
  $("kOut").textContent=fmt(out);
  const totB=OUT_CATS.reduce((s,c)=>s+(+S.profil.budgets[c.id]||0),0);$("kOutS").textContent="Budget : "+fmt(totB);
  $("kBal").textContent=(bal>0?"+":"")+fmt(bal);$("kBal").className="v num"+(bal<0?" bad":" in");
  $("kBalS").textContent=bal<0?"Tu dépenses plus que tu ne gagnes":"Ce qu'il te reste ce mois-ci";
  const open=S.prets.filter(p=>p.statut!=="rembourse");
  const du=open.filter(p=>p.sens==="donne").reduce((s,p)=>s+(+p.montant-(+p.rembourse||0)),0);
  const dois=open.filter(p=>p.sens==="recu").reduce((s,p)=>s+(+p.montant-(+p.rembourse||0)),0);
  $("kLoan").textContent=fmt(du-dois);$("kLoan").className="v num"+(du-dois<0?" bad":"");
  $("kLoanS").textContent="On te doit "+fmt(du)+" · tu dois "+fmt(dois);

  // Enveloppes
  const spent={};mtx.filter(isOut).forEach(t=>{const c=t.categorie||"divers";spent[c]=(spent[c]||0)+ +t.montant});
  const cats=[...OUT_CATS.map(c=>c.id),...Object.keys(spent).filter(c=>!OUT_CATS.find(x=>x.id===c)&&!c.startsWith("pret_"))];
  $("env").innerHTML=cats.filter(c=>(+S.profil.budgets[c]||0)>0||spent[c]||coursesOf(c).length).map(c=>{
    const b=+S.profil.budgets[c]||0,s=spent[c]||0;
    const head=!b
      ? '<div class="l"><b>'+esc(catName(c))+'</b><span class="num">'+fmt(s)+'</span></div><div class="track"><div class="fill neutral" style="width:100%"></div></div><div class="l"><span>Hors budget</span></div>'
      : (()=>{const p=s/b*100,cls=p>100?"bad":p>=80?"warn":"",rest=b-s,prev=prevuOf(c);
          return '<div class="l"><b>'+esc(catName(c))+'</b><span class="num">'+fmt(s)+' / '+fmt(b)+'</span></div>'
            +'<div class="track"><div class="fill '+cls+'" style="width:'+Math.min(100,p)+'%"></div></div>'
            +'<div class="l"><span>'+(rest>=0?'Reste '+fmt(rest):'<span class="over">Dépassé de '+fmt(-rest)+'</span>')
            +(prev>0?' · '+fmt(prev)+' prévus':'')+'</span></div>'})();
    return '<div class="erow">'+head+listBlock(c)+'</div>'}).join("")||'<p class="empty">Définis tes enveloppes dans Réglages.</p>';

  // 6 mois
  const months=[];for(let i=5;i>=0;i--)months.push(new Date(view.getFullYear(),view.getMonth()-i,1));
  const data=months.map(d=>{const k=ym(d),m=S.ops.filter(t=>(t.date||"").startsWith(k));return{d,i:m.filter(t=>t.type==="in").reduce((s,t)=>s+ +t.montant,0),o:m.filter(isOut).reduce((s,t)=>s+ +t.montant,0)}});
  const max=Math.max(1,...data.map(x=>Math.max(x.i,x.o)));
  const px=i=>data.length<2?50:4+i/(data.length-1)*92, py=v=>94-v/max*88;
  const pIn=data.map((x,i)=>({x:px(i),y:py(x.i)})), pOut=data.map((x,i)=>({x:px(i),y:py(x.o)}));
  const dot=(p,c)=>'<span class="pt '+c+'" style="left:'+p.x+'%;top:'+p.y+'%"></span>';
  $("chart").innerHTML='<div class="plot">'
    +'<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
    +'<path class="ln out" d="'+curvePath(pOut)+'"></path>'
    +'<path class="ln in" d="'+curvePath(pIn)+'"></path>'
    +'</svg>'
    +pOut.map(p=>dot(p,"out")).join("")+pIn.map(p=>dot(p,"in")).join("")
    +data.map((x,i)=>'<span class="hit" style="left:'+(i/data.length*100)+'%;width:'+(100/data.length)+'%" title="'+esc(x.d.toLocaleDateString("fr-FR",{month:"long"})+" : entrées "+fmt(x.i)+", dépenses "+fmt(x.o))+'"></span>').join("")
    +'</div><div class="mrow">'
    +data.map((x,i)=>'<span class="m" style="left:'+px(i)+'%">'+esc(x.d.toLocaleDateString("fr-FR",{month:"short"}).replace(".",""))+'</span>').join("")
    +'</div>';

  // Top produits
  const prod={};mtx.filter(t=>isOut(t)&&!String(t.categorie).startsWith("pret")).forEach(t=>{const k=(t.produit||t.contexte||catName(t.categorie)).trim().toLowerCase();if(!prod[k])prod[k]={n:t.produit||catName(t.categorie),m:0,q:0,c:0};prod[k].m+= +t.montant;prod[k].q+= +t.quantite||1;prod[k].c++});
  const top=Object.values(prod).sort((a,b)=>b.m-a.m).slice(0,8);
  const pmax=Math.max(1,...top.map(p=>p.m));
  $("topProd").innerHTML=top.length?'<div class="env">'+top.map(p=>'<div class="erow"><div class="l"><b>'+esc(p.n)+'</b><span class="num">'+fmt(p.m)+' · '+p.c+' achat'+(p.c>1?"s":"")+'</span></div><div class="track"><div class="fill" style="width:'+(p.m/pmax*100)+'%;background:var(--out)"></div></div></div>').join("")+'</div>':'<p class="empty">Rien ce mois-ci.</p>';

  // Prêts
  const ls=[...S.prets].sort((a,b)=>(a.statut==="rembourse")-(b.statut==="rembourse")||(b.date||"").localeCompare(a.date||""));
  $("loans").innerHTML=ls.length?"":'<p class="empty">Aucun prêt enregistré.</p>';
  ls.slice(0,20).forEach(p=>{
    const reste=+p.montant-(+p.rembourse||0),done=p.statut==="rembourse";
    const late=!done&&p.echeance&&p.echeance<today();
    const el=document.createElement("div");el.className="item";
    el.innerHTML='<div class="hd"><div><h3></h3><p class="small muted"></p></div><span class="tag '+(done?"acc":late?"bad":"warn")+'">'+(done?"Remboursé":late?"En retard":"Reste "+fmt(reste))+'</span></div>'+(done?"":'<div class="row"><input type="number" min="0" step="0.01" placeholder="Montant rendu" style="max-width:150px"><button class="btn sm" type="button">Remboursement</button><button class="del" type="button">Supprimer</button></div>');
    el.querySelector("h3").textContent=(p.sens==="donne"?"Prêté à ":"Emprunté à ")+(p.personne||"?")+" · "+fmt(p.montant);
    el.querySelector("p").textContent=dlabel(p.date)+(p.echeance?" · échéance "+dlabel(p.echeance):"")+(p.contexte?" · "+p.contexte:"");
    if(!done){
      const inp=el.querySelector("input");inp.value=reste;
      el.querySelector(".btn").onclick=()=>repay(p,+inp.value);
      el.querySelector(".del").onclick=()=>{if(confirm("Supprimer ce prêt ?"))del("prets",p.id)};
    }
    $("loans").appendChild(el)});

  // Opérations
  const rows=[...mtx].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.created_at||"").localeCompare(a.created_at||""));
  $("rows").innerHTML="";
  rows.forEach(t=>{const tr=document.createElement("tr");
    tr.innerHTML='<td class="num"></td><td></td><td><span class="tag"></span></td><td></td><td class="r num"></td><td class="r"><button class="del" type="button">Supprimer</button></td>';
    tr.children[0].textContent=dlabel(t.date);
    const q=+t.quantite>1?(t.quantite+(t.unite?" "+t.unite:"")+" × "):"";
    tr.children[1].innerHTML=esc(q+(t.produit||catName(t.categorie)))+(t.devise==="FCFA"?'<span class="sub">'+Math.round(t.montant_orig).toLocaleString("fr-FR")+' FCFA</span>':"");
    tr.querySelector(".tag").textContent=catName(t.categorie);
    tr.children[3].innerHTML=[t.lieu,t.personne].filter(Boolean).map(esc).join(" · ")+(t.contexte?'<span class="sub">'+esc(t.contexte)+'</span>':"");
    tr.children[4].textContent=(t.type==="in"?"+":"−")+fmt(t.montant);
    tr.children[4].style.color=t.type==="in"?"var(--in)":"var(--out)";
    tr.querySelector(".del").onclick=()=>del("ops",t.id);
    $("rows").appendChild(tr)});
  $("emptyRows").hidden=rows.length>0;
}
function repay(p,amt){
  if(!(amt>0)){toast("Indique le montant rendu");return}
  const r=Math.min(+p.montant,(+p.rembourse||0)+amt);
  put("prets",{...p,rembourse:r,statut:r>=+p.montant?"rembourse":"en_cours"});
  put("ops",{id:uid(),type:p.sens==="donne"?"in":"out",montant:amt,devise:"MAD",montant_orig:amt,categorie:p.sens==="donne"?"remb_recu":"pret",produit:"Remboursement "+(p.sens==="donne"?"de ":"à ")+(p.personne||""),personne:p.personne,date:today(),pret_id:p.id,created_at:new Date().toISOString()});
  toast("Remboursement enregistré");renderBudget();
}

/* --- Saisie : phrase libre + aperçu modifiable --- */
$("qDate").value=today();
function blankOp(){return{kind:"op",type:"out",montant:"",devise:"MAD",produit:"",quantite:1,unite:"",categorie:"divers",lieu:"",personne:"",contexte:""}}
function blankLoan(){return{kind:"pret",sens:"donne",personne:"",montant:"",echeance:"",contexte:""}}
$("qManual").onclick=()=>{draft={items:[blankOp()],contexte_jour:""};renderDraft()};
$("qCancel").onclick=()=>{draft=null;renderDraft()};
$("qGo").onclick=async()=>{
  const txt=$("qText").value.trim();if(!txt){toast("Écris d'abord ce qui s'est passé");return}
  const b=$("qGo");b.disabled=true;b.textContent="Analyse…";
  try{
    const r=await ai("parse_jour",{texte:txt,date:$("qDate").value||today(),categories:[...OUT_CATS,...IN_CATS].map(c=>({id:c.id,nom:c.name})),personnes:S.personnes.map(p=>p.nom)});
    draft={items:[...(r.operations||[]).map(o=>({...blankOp(),...o,kind:"op"})),...(r.prets||[]).map(p=>({...blankLoan(),...p,kind:"pret"}))],contexte_jour:r.contexte_jour||""};
    if(!draft.items.length){toast("Aucun montant trouvé : complète à la main");draft.items=[blankOp()]}
  }catch(e){
    toast(e.message==="offline"?"Hors ligne : saisie manuelle":"Analyse indisponible : saisie manuelle");
    draft={items:[{...blankOp(),contexte:txt.slice(0,200)}],contexte_jour:""};
  }finally{b.disabled=false;b.textContent="Analyser"}
  renderDraft();
};
function renderDraft(){
  const box=$("qPreview");box.innerHTML="";$("qSaveRow").hidden=!draft;
  if(!draft)return;
  draft.items.forEach((it,idx)=>{
    const el=document.createElement("div");el.className="preview";
    const f=(k,label,type="text",extra="")=>'<label class="f">'+label+'<input data-k="'+k+'" type="'+type+'" '+extra+' value="'+esc(it[k]??"")+'"></label>';
    if(it.kind==="op"){
      el.innerHTML='<div class="hd"><div class="seg"><button type="button" data-ty="out" aria-pressed="'+(it.type==="out")+'">Dépense</button><button type="button" data-ty="in" aria-pressed="'+(it.type==="in")+'">Entrée</button></div><button class="del" type="button">Retirer</button></div>'+
        f("produit","Produit / objet")+
        '<label class="f">Montant<span class="amt"><input data-k="montant" type="number" inputmode="decimal" min="0" step="0.01" value="'+esc(it.montant)+'"><select data-k="devise"><option value="MAD"'+(it.devise!=="FCFA"?" selected":"")+'>DH</option><option value="FCFA"'+(it.devise==="FCFA"?" selected":"")+'>FCFA</option></select></span></label>'+
        f("quantite","Quantité","number",'min="0" step="0.01"')+f("unite","Unité")+
        f("categorie","Catégorie","text",'list="catList"')+f("lieu","Lieu")+f("personne","Personne")+f("contexte","Contexte / pourquoi");
      el.querySelectorAll("[data-ty]").forEach(b=>b.onclick=()=>{it.type=b.dataset.ty;renderDraft()});
    }else{
      el.innerHTML='<div class="hd"><div class="seg"><button type="button" data-se="donne" aria-pressed="'+(it.sens==="donne")+'">J\'ai prêté</button><button type="button" data-se="recu" aria-pressed="'+(it.sens==="recu")+'">On m\'a prêté</button></div><button class="del" type="button">Retirer</button></div>'+
        f("personne","Personne")+f("montant","Montant (DH)","number",'min="0" step="0.01"')+f("echeance","Échéance","date")+f("contexte","Contexte");
      el.querySelectorAll("[data-se]").forEach(b=>b.onclick=()=>{it.sens=b.dataset.se;renderDraft()});
    }
    el.querySelectorAll("[data-k]").forEach(i=>i.oninput=i.onchange=()=>{it[i.dataset.k]=i.value});
    el.querySelector(".del").onclick=()=>{draft.items.splice(idx,1);if(!draft.items.length)draft=null;renderDraft()};
    box.appendChild(el);
  });
  const add=document.createElement("div");add.className="row";
  add.innerHTML='<button class="btn ghost sm" type="button">+ Dépense ou entrée</button><button class="btn ghost sm" type="button">+ Prêt</button>'+(draft.contexte_jour?'<span class="small muted">Contexte du jour ajouté au journal</span>':"");
  add.children[0].onclick=()=>{draft.items.push(blankOp());renderDraft()};
  add.children[1].onclick=()=>{draft.items.push(blankLoan());renderDraft()};
  box.appendChild(add);
}
$("qSave").onclick=()=>{
  if(!draft)return;const date=$("qDate").value||today(),now=new Date().toISOString();let n=0;
  for(const it of draft.items){
    const raw=+it.montant;if(!(raw>0))continue;
    if(it.kind==="op"){
      const amt=it.devise==="FCFA"?raw/(+S.profil.taux||60):raw;
      put("ops",{id:uid(),type:it.type,montant:Math.round(amt*100)/100,devise:it.devise,montant_orig:raw,produit:it.produit||null,quantite:+it.quantite||1,unite:it.unite||null,categorie:it.categorie||(it.type==="in"?"autre_in":"divers"),lieu:it.lieu||null,personne:it.personne||null,contexte:it.contexte||null,date,source:$("qText").value.trim()||null,created_at:now});n++;
    }else{
      const pid=uid();
      put("prets",{id:pid,sens:it.sens,personne:it.personne||null,montant:raw,date,echeance:it.echeance||null,rembourse:0,statut:"en_cours",contexte:it.contexte||null,created_at:now});
      put("ops",{id:uid(),type:it.sens==="donne"?"out":"in",montant:raw,devise:"MAD",montant_orig:raw,produit:(it.sens==="donne"?"Prêt à ":"Prêt de ")+(it.personne||""),categorie:it.sens==="donne"?"pret_donne":"pret_recu",personne:it.personne||null,contexte:it.contexte||null,date,pret_id:pid,created_at:now});n++;
    }
  }
  if(draft.contexte_jour){
    const j=S.journal.find(x=>x.date===date);
    const recit=j&&j.recit?(j.recit.includes(draft.contexte_jour)?j.recit:j.recit+"\n"+draft.contexte_jour):draft.contexte_jour;
    put("journal",{...(j||{id:uid(),date}),recit});
  }
  if(!n){toast("Aucun montant valide");return}
  const d=new Date(date+"T12:00:00");view=new Date(d.getFullYear(),d.getMonth(),1);
  draft=null;$("qText").value="";renderDraft();fillCatList();renderBudget();toast(n+" ligne"+(n>1?"s":"")+" enregistrée"+(n>1?"s":""));
};

/* ================= JOURNAL ================= */
let jState={date:today(),humeur:null,energie:null,etat:null};
function scale(el,key){el.innerHTML=[1,2,3,4,5].map(n=>'<button type="button" aria-pressed="'+(jState[key]===n)+'">'+n+'</button>').join("");
  el.querySelectorAll("button").forEach((b,i)=>b.onclick=()=>{jState[key]=jState[key]===i+1?null:i+1;scale(el,key)})}
function loadJournalDay(){
  const j=S.journal.find(x=>x.date===jState.date);
  jState={date:jState.date,humeur:j?j.humeur:null,energie:j?j.energie:null,etat:j?j.etat:null};
  $("jDate").value=jState.date;$("jRecit").value=j?j.recit||"":"";$("jNote").value=j?j.note||"":"";
}
$("jDate").onchange=()=>{jState.date=$("jDate").value||today();loadJournalDay();renderJournal()};
$("jSave").onclick=()=>{
  const j=S.journal.find(x=>x.date===jState.date);
  put("journal",{...(j||{id:uid(),date:jState.date}),recit:$("jRecit").value.trim()||null,humeur:jState.humeur,energie:jState.energie,etat:jState.etat,note:$("jNote").value.trim()||null});
  toast("Journée enregistrée");renderJournal();
};
function renderJournal(){
  scale($("jHumeur"),"humeur");scale($("jEnergie"),"energie");
  const t=S.profil.type,E=t?ENNEA[t]:null;
  const opts=[["integration",E?"Intégration (vers "+E.i+")":"Intégration"],["neutre","Neutre"],["stress",E?"Stress (vers "+E.s+")":"Stress"]];
  $("jEtat").innerHTML=opts.map(o=>'<button type="button" data-e="'+o[0]+'" aria-pressed="'+(jState.etat===o[0])+'">'+o[1]+'</button>').join("");
  $("jEtat").querySelectorAll("button").forEach(b=>b.onclick=()=>{jState.etat=jState.etat===b.dataset.e?null:b.dataset.e;renderJournal()});
  $("jEtatHint").textContent=E?"Type "+t+", "+E.n+". En intégration tu prends les forces du "+E.i+" ("+ENNEA[E.i].n+"), sous stress les travers du "+E.s+" ("+ENNEA[E.s].n+").":"Choisis ton type dans Réglages pour voir tes routes.";
  $("jEtatHint").className="small muted";

  // Ce jour-là
  const d=jState.date,ops=S.ops.filter(o=>o.date===d),ids=S.idees.filter(i=>(i.created_at||"").slice(0,10)===d);
  const out=ops.filter(isOut).reduce((s,o)=>s+ +o.montant,0);
  $("jDay").innerHTML='<p class="small muted">'+dlabel(d)+' · '+ops.length+' opération'+(ops.length>1?"s":"")+' · '+fmt(out)+' dépensés · '+ids.length+' idée'+(ids.length>1?"s":"")+'</p>'+
    (ops.length?'<div class="list">'+ops.map(o=>'<div class="row" style="justify-content:space-between"><span>'+esc(o.produit||catName(o.categorie))+(o.contexte?' <span class="small muted">· '+esc(o.contexte)+'</span>':"")+'</span><b class="num" style="color:'+(o.type==="in"?"var(--in)":"var(--out)")+'">'+(o.type==="in"?"+":"−")+fmt(o.montant)+'</b></div>').join("")+'</div>':"")+
    (ids.length?'<div class="chips" style="margin-top:8px">'+ids.map(i=>'<span class="tag acc">'+esc(i.titre||i.texte.slice(0,40))+'</span>').join("")+'</div>':"");

  // Statistique état / dépenses
  const lim=ymd(new Date(Date.now()-90*864e5));
  const perDay={};S.ops.filter(o=>isOut(o)&&o.date>=lim&&!String(o.categorie).startsWith("pret")).forEach(o=>perDay[o.date]=(perDay[o.date]||0)+ +o.montant);
  $("jStat").innerHTML=["integration","neutre","stress"].map(e=>{const days=S.journal.filter(j=>j.etat===e&&j.date>=lim);const avg=days.length?days.reduce((s,j)=>s+(perDay[j.date]||0),0)/days.length:0;
    return '<div><span class="k"><span class="dot '+e+'"></span>'+(e==="integration"?"Intégration":e==="stress"?"Stress":"Neutre")+'</span><b class="num">'+(days.length?fmt(avg):"—")+'</b><span class="small muted">'+days.length+' jour'+(days.length>1?"s":"")+'</span></div>'}).join("");

  // Historique
  const hist=[...S.journal].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);
  $("jHist").innerHTML=hist.length?"":'<p class="empty">Ton journal est vide pour l\'instant.</p>';
  hist.forEach(j=>{const el=document.createElement("div");el.className="item";el.style.cursor="pointer";
    const sp=S.ops.filter(o=>o.date===j.date&&isOut(o)).reduce((s,o)=>s+ +o.montant,0);
    el.innerHTML='<div class="hd"><h3>'+(j.etat?'<span class="dot '+j.etat+'"></span>':"")+esc(dlabel(j.date))+'</h3><span class="small muted num">'+(j.humeur?"Humeur "+j.humeur+"/5 · ":"")+fmt(sp)+'</span></div>'+(j.recit?'<p class="small">'+esc(j.recit.slice(0,220))+(j.recit.length>220?"…":"")+'</p>':"");
    el.onclick=()=>{jState.date=j.date;loadJournalDay();renderJournal();window.scrollTo(0,0)};
    $("jHist").appendChild(el)});
}

/* ================= IDÉES ================= */
$("iGo").onclick=async()=>{
  const txt=$("iText").value.trim();if(!txt){toast("Écris ton idée");return}
  const b=$("iGo");b.disabled=true;b.textContent="Analyse…";
  const row={id:uid(),texte:txt,statut:"a_analyser",created_at:new Date().toISOString()};
  try{Object.assign(row,await analyseIdee(txt));$("iMsg").textContent=""}
  catch(e){$("iMsg").textContent=e.message==="offline"?"Hors ligne : idée gardée, à analyser plus tard.":"Analyse indisponible : idée gardée, à analyser plus tard."}
  put("idees",row);$("iText").value="";b.disabled=false;b.textContent="Analyser et classer";renderIdees();
};
async function analyseIdee(txt){
  const r=await ai("analyse_idee",{texte:txt,domaines:DOMAINES,ennea:enneaCtx(),idees_existantes:S.idees.filter(i=>i.titre).slice(0,40).map(i=>({titre:i.titre,domaine:i.domaine}))});
  return{titre:r.titre,resume:r.resume,domaine:DOMAINES.includes(r.domaine)?r.domaine:"Autre",tags:r.tags||[],potentiel:r.potentiel,effort:r.effort,action:r.prochaine_action,lecture_ennea:r.lecture_ennea,lien_os:r.lien_sanemi_os,statut:"nouvelle"};
}
$("iStatut").onchange=renderIdees;
function renderIdees(){
  const counts={};S.idees.forEach(i=>{const d=i.domaine||"À classer";counts[d]=(counts[d]||0)+1});
  $("iDom").innerHTML=['<button class="chip" type="button" data-d="" aria-pressed="'+(!domFilter)+'">Toutes ('+S.idees.length+')</button>',...Object.keys(counts).sort().map(d=>'<button class="chip" type="button" data-d="'+esc(d)+'" aria-pressed="'+(domFilter===d)+'">'+esc(d)+' ('+counts[d]+')</button>')].join("");
  $("iDom").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{domFilter=c.dataset.d;renderIdees()});
  const st=$("iStatut").value;
  const list=S.idees.filter(i=>(!domFilter||(i.domaine||"À classer")===domFilter)&&(!st||i.statut===st)).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""));
  $("iList").innerHTML=list.length?"":'<p class="empty">Aucune idée ici.</p>';
  list.forEach(i=>{
    const el=document.createElement("div");el.className="item";
    const pe=(i.potentiel?"Potentiel "+i.potentiel+"/5":"")+(i.effort?" · Effort "+i.effort+"/5":"");
    el.innerHTML='<div class="hd"><div><h3></h3><p class="small muted"></p></div><span class="tag acc"></span></div>'+
      (i.resume?'<p class="small r1"></p>':"")+
      (i.action?'<p class="small"><b>Prochaine action :</b> <span class="r2"></span></p>':"")+
      (i.lecture_ennea?'<p class="small"><b>Ton type :</b> <span class="r3"></span></p>':"")+
      (i.lien_os?'<p class="small"><b>Sanemi OS :</b> <span class="r4"></span></p>':"")+
      '<div class="meta"></div>'+
      '<div class="row"><select style="max-width:170px">'+Object.entries(STATUTS).map(([k,v])=>'<option value="'+k+'"'+(i.statut===k?" selected":"")+'>'+v+'</option>').join("")+'</select>'+(i.statut==="a_analyser"?'<button class="btn sm" type="button" data-a>Analyser</button>':"")+'<button class="del" type="button">Supprimer</button></div>';
    el.querySelector("h3").textContent=i.titre||i.texte.slice(0,80);
    el.querySelector("p.muted").textContent=new Date(i.created_at).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"})+(pe?" · "+pe:"");
    el.querySelector(".tag").textContent=i.domaine||"À classer";
    if(i.resume)el.querySelector(".r1").textContent=i.resume;
    if(i.action)el.querySelector(".r2").textContent=i.action;
    if(i.lecture_ennea)el.querySelector(".r3").textContent=i.lecture_ennea;
    if(i.lien_os)el.querySelector(".r4").textContent=i.lien_os;
    el.querySelector(".meta").innerHTML=(i.tags||[]).map(t=>'<span class="tag">'+esc(t)+'</span>').join("");
    el.querySelector("select").onchange=e=>{put("idees",{...i,statut:e.target.value});renderIdees()};
    const a=el.querySelector("[data-a]");if(a)a.onclick=async()=>{a.disabled=true;a.textContent="Analyse…";try{put("idees",{...i,...await analyseIdee(i.texte)});renderIdees()}catch(e){toast("Analyse indisponible");a.disabled=false;a.textContent="Analyser"}};
    el.querySelector(".del").onclick=()=>{if(confirm("Supprimer cette idée ?")){del("idees",i.id);renderIdees()}};
    $("iList").appendChild(el)});
}

/* ================= PERSONNES ================= */
function typeOptions(sel,withNone){sel.innerHTML=(withNone?'<option value="">Inconnu</option>':'<option value="">Non défini</option>')+Object.entries(ENNEA).map(([k,v])=>'<option value="'+k+'">'+k+' · '+v.n+'</option>').join("")}
async function addPerson(withAI){
  const nom=$("pNom").value.trim();if(!nom){toast("Indique un nom");return}
  const row={id:uid(),nom,relation:$("pRel").value.trim()||null,type:+$("pType").value||null,notes:$("pObs").value.trim()||null,created_at:new Date().toISOString()};
  if(withAI){
    if(!row.notes){toast("Décris son comportement pour que l'IA le profile");return}
    const b=$("pAI");b.disabled=true;b.textContent="Analyse…";
    try{const r=await ai("profil_personne",{nom,relation:row.relation,observations:row.notes,mon_profil:enneaCtx()});
      row.type=row.type||r.type_probable||null;row.aile=r.aile||null;row.analyse=r;}
    catch(e){toast("Analyse indisponible, personne enregistrée sans profil")}
    b.disabled=false;b.textContent="Enregistrer et profiler avec l'IA";
  }
  put("personnes",row);["pNom","pRel","pObs"].forEach(k=>$(k).value="");$("pType").value="";renderPersonnes();toast(nom+" ajouté");
}
$("pAdd").onclick=()=>addPerson(false);$("pAI").onclick=()=>addPerson(true);
function renderPersonnes(){
  if(!$("pType").options.length)typeOptions($("pType"),true);
  const list=[...S.personnes].sort((a,b)=>a.nom.localeCompare(b.nom));
  $("pList").innerHTML=list.length?"":'<p class="empty">Personne pour l\'instant.</p>';
  list.forEach(p=>{
    const E=p.type?ENNEA[p.type]:null,a=p.analyse||{};
    const lent=S.prets.filter(x=>x.personne&&x.personne.toLowerCase()===p.nom.toLowerCase()&&x.statut!=="rembourse");
    const el=document.createElement("div");el.className="item";
    el.innerHTML='<div class="hd"><div><h3></h3><p class="small muted"></p></div><span class="tag '+(E?"acc":"")+'"></span></div><div class="body small list" style="gap:6px"></div><div class="row"><select style="max-width:220px"></select><button class="del" type="button">Supprimer</button></div>';
    el.querySelector("h3").textContent=p.nom;
    el.querySelector("p").textContent=[p.relation,p.aile?"aile "+p.aile:null,lent.length?lent.length+" prêt(s) en cours":null].filter(Boolean).join(" · ");
    el.querySelector(".tag").textContent=E?"Type "+p.type:"Type inconnu";
    const body=el.querySelector(".body"),line=(t,v)=>{if(!v)return;const q=document.createElement("p");q.innerHTML="<b>"+t+" :</b> ";q.append(v);body.appendChild(q)};
    if(E){line("Profil",E.n+". Peur de fond : "+E.peur+".");line("Routes","En confiance il va vers le "+E.i+" ("+ENNEA[E.i].n+"), sous stress vers le "+E.s+" ("+ENNEA[E.s].n+").");line("Comment lui parler",a.comment_interagir||E.parler)}
    if(a.confiance)line("Confiance de l'IA",a.confiance+(a.alternatives&&a.alternatives.length?" · autres pistes : "+a.alternatives.join(", "):""));
    if(a.raisons)line("Pourquoi",a.raisons);
    if(a.avec_moi)line("Avec toi",a.avec_moi);
    if(p.notes)line("Notes",p.notes);
    const sel=el.querySelector("select");typeOptions(sel,true);sel.value=p.type||"";
    sel.onchange=()=>{put("personnes",{...p,type:+sel.value||null});renderPersonnes()};
    el.querySelector(".del").onclick=()=>{if(confirm("Supprimer "+p.nom+" ?")){del("personnes",p.id);renderPersonnes()}};
    $("pList").appendChild(el)});
}

/* ================= RÉGLAGES ================= */
function renderReglages(){
  const P=S.profil;typeOptions($("sType"),false);$("sType").value=P.type||"";$("sAile").value=P.aile||"";$("sSous").value=P.sous_type||"";
  const E=P.type?ENNEA[P.type]:null;
  $("sRoutes").textContent=E?"Route d'intégration : "+P.type+" → "+E.i+" ("+ENNEA[E.i].n+"). Route de stress : "+P.type+" → "+E.s+" ("+ENNEA[E.s].n+").":"Ton type sert au journal, à l'analyse de tes idées et à la lecture de ton entourage.";
  $("aInc").value=P.revenu;$("aRate").value=P.taux;
  $("alloc").innerHTML=OUT_CATS.map(c=>'<label class="f">'+esc(c.name)+' (DH)<input type="number" min="0" step="1" data-c="'+c.id+'" value="'+(+P.budgets[c.id]||0)+'"></label>').join("");
  $("alloc").querySelectorAll("input").forEach(i=>i.oninput=sumAlloc);$("aInc").oninput=sumAlloc;sumAlloc();
  $("uMail").textContent=user?"Connecté : "+user.email:"";
}
["sType","sAile","sSous"].forEach(k=>$(k).onchange=()=>{putProfil({type:+$("sType").value||null,aile:$("sAile").value.trim(),sous_type:$("sSous").value});renderReglages();toast("Profil enregistré")});
function readAlloc(){const b={};$("alloc").querySelectorAll("input").forEach(i=>b[i.dataset.c]=Math.max(0,+i.value||0));return{revenu:Math.max(0,+$("aInc").value||0),taux:Math.max(1,+$("aRate").value||60),budgets:b}}
function sumAlloc(){const a=readAlloc(),tot=Object.values(a.budgets).reduce((s,v)=>s+v,0),diff=a.revenu-tot;
  $("aSum").innerHTML='Alloué : <b>'+fmt(tot)+'</b> sur '+fmt(a.revenu)+' · '+(diff>=0?'<span style="color:var(--ok)">'+fmt(diff)+' non alloués</span>':'<span class="over">Il manque '+fmt(-diff)+'</span>')}
$("aSave").onclick=()=>{putProfil(readAlloc());toast("Répartition enregistrée")};

/* Sauvegarde */
function download(name,content,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
$("bJson").onclick=()=>download("budget-"+today()+".json",JSON.stringify({version:2,exporte_le:new Date().toISOString(),...S},null,2),"application/json");
$("bCsv").onclick=()=>{const k=ym(view),cols=["date","type","produit","quantite","unite","categorie","montant","devise","montant_orig","lieu","personne","contexte"];
  const q=v=>{const s=String(v??"");return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  const lines=[cols.join(";"),...S.ops.filter(o=>(o.date||"").startsWith(k)).sort((a,b)=>a.date.localeCompare(b.date)).map(o=>cols.map(c=>q(c==="categorie"?catName(o[c]):o[c])).join(";"))];
  download("budget-"+k+".csv","﻿"+lines.join("\n"),"text/csv;charset=utf-8")};
$("bImp").onclick=()=>$("bFile").click();
$("bFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;e.target.value="";
  try{const d=JSON.parse(await f.text());
    if(!confirm("Importer ce fichier ? Les éléments du fichier seront ajoutés ou remplaceront ceux qui ont le même identifiant."))return;
    let n=0;
    if(Array.isArray(d.tx)){d.tx.forEach(t=>{put("ops",{id:uid(),type:t.type,montant:t.amount,devise:t.orig?.cur||"MAD",montant_orig:t.orig?.amount||t.amount,categorie:t.cat,date:t.date,produit:t.note||null,created_at:new Date(t.createdAt||Date.now()).toISOString()});n++})}
    for(const k of Object.keys(TABLES))if(Array.isArray(d[k]))d[k].forEach(r=>{if(r&&r.id){const{user_id,...rest}=r;put(k,rest);n++}});
    if(d.profil){const{user_id,...p}=d.profil;putProfil(p)}else if(d.settings){putProfil({revenu:d.settings.income,taux:d.settings.rate,budgets:{...S.profil.budgets,...d.settings.budgets}})}
    renderAll();toast(n+" éléments importés");
  }catch(err){toast("Fichier illisible")}};
$("tTheme").onclick=()=>{const cur=document.documentElement.dataset.theme||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");const nx=cur==="dark"?"light":"dark";document.documentElement.dataset.theme=nx;LS.set("bp_theme",nx)};
{const th=LS.get("bp_theme",null);if(th)document.documentElement.dataset.theme=th}
$("uOut").onclick=async()=>{if(queue.length&&!confirm(queue.length+" modifications ne sont pas encore synchronisées. Te déconnecter quand même ?"))return;await db.auth.signOut();location.reload()};

/* ================= Rendu global ================= */
function renderAll(){fillCatList();if(tab==="budget")renderBudget();if(tab==="journal")renderJournal();if(tab==="idees")renderIdees();if(tab==="personnes")renderPersonnes();if(tab==="reglages")renderReglages();syncLabel()}

/* ================= Authentification ================= */
// Racine de l'app : ou renvoient les liens des e-mails Supabase.
const APP_URL=new URL("./",location.href).href;
// Apres un lien de confirmation, Supabase renvoie ici avec les jetons dans le
// fragment. L'app ne s'en sert pas : on nettoie l'adresse pour ne pas laisser
// un jeton dans l'historique et dans ce qui peut etre partage.
if(/access_token=|refresh_token=|type=(signup|recovery|invite|email_change)/.test(location.hash))
  history.replaceState(null,"",location.pathname+location.search);

async function authSubmit(signup){
  const email=$("aEmail").value.trim(),password=$("aPass").value;$("aMsg").textContent="";
  if(!email||password.length<6){$("aMsg").textContent="E-mail et mot de passe (6 caractères minimum) requis.";return}
  const r=signup?await db.auth.signUp({email,password,options:{emailRedirectTo:APP_URL}}):await db.auth.signInWithPassword({email,password});
  if(r.error){$("aMsg").textContent=r.error.message.includes("Invalid login")?"E-mail ou mot de passe incorrect.":r.error.message;return}
  if(signup&&!r.data.session){$("aMsg").textContent="Compte créé. Ouvre le lien reçu par e-mail pour le confirmer, puis connecte-toi.";return}
  start(r.data.session.user);
}
$("authForm").onsubmit=e=>{e.preventDefault();authSubmit(false)};
$("aSignup").onclick=()=>authSubmit(true);

function start(u){
  user=u;S=LS.get("sb_cache_"+u.id,S);S.profil={...DEF_PROFIL,...S.profil,budgets:{...DEF_PROFIL.budgets,...(S.profil.budgets||{})}};
  $("authView").hidden=true;$("appView").hidden=false;loadJournalDay();renderAll();loadAll();
}
(async()=>{
  const {data}=await db.auth.getSession();
  if(data.session)start(data.session.user);
  else{
    // Hors ligne avec une session précédente : on affiche le cache
    const last=LS.get("sb_last_user",null);
    if(!navigator.onLine&&last){start(last)}else{$("authView").hidden=false}
  }
  db.auth.onAuthStateChange((ev,session)=>{if(session&&session.user)LS.set("sb_last_user",{id:session.user.id,email:session.user.email})});
})();

// --- Mise a jour de la version installee ---
// Le service worker sert les fichiers depuis le cache avant le reseau : sans ce
// mecanisme, l'app installee sur l'ecran d'accueil garde sa version pour toujours.
// version.json est la seule source de verite ; le worker est enregistre sous
// sw.js?v=<version>, donc la version installee se lit sur son URL.
// On ne recharge jamais d'office : une saisie en cours serait perdue.
const VERSION_CHECK_MS=30*60*1000;
async function onlineVersion(){
  try{const r=await fetch("version.json",{cache:"no-store"});if(!r.ok)return null;const j=await r.json();return(j&&j.version)||null}catch(e){return null}
}
function installedVersion(reg){
  const w=reg&&(reg.active||reg.waiting||reg.installing);
  if(!w)return null;
  try{return new URL(w.scriptURL).searchParams.get("v")}catch(e){return null}
}
async function applyUpdate(btn){
  const label=btn?btn.textContent:"";
  if(btn){btn.disabled=true;btn.textContent="Mise à jour…"}
  // Vider le cache hors ligne alors qu'on n'a pas de reseau rendrait l'app
  // inutilisable : on verifie d'abord qu'on peut bien joindre le serveur.
  if(!await onlineVersion()){
    toast("Pas de réseau — réessaie plus tard");
    if(btn){btn.disabled=false;btn.textContent=label}
    return;
  }
  try{
    const regs=await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r=>r.unregister()));
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
  }catch(e){}
  // Les operations en attente vivent dans localStorage, que rien n'efface ici.
  location.reload();
}
function showUpdateBar(){
  if($("updateBar"))return;
  const d=document.createElement("div");
  d.id="updateBar";d.className="updbar";d.setAttribute("role","status");
  const s=document.createElement("span");s.textContent="Nouvelle version disponible";
  const b=document.createElement("button");b.type="button";b.className="btn sm";b.textContent="Mettre à jour";
  b.addEventListener("click",()=>applyUpdate(b));
  d.append(s,b);document.body.appendChild(d);
}
if("serviceWorker" in navigator)window.addEventListener("load",async()=>{
  const check=async()=>{
    const reg=await navigator.serviceWorker.getRegistration().catch(()=>null);
    const online=await onlineVersion();
    if(!reg){ // premiere visite, ou juste apres une mise a jour
      if(online!==null)navigator.serviceWorker.register("sw.js?v="+encodeURIComponent(online)).catch(()=>{});
      return;
    }
    // installedVersion vaut null pour un worker installe avant ce mecanisme :
    // c'est une ancienne version, donc on propose la mise a jour.
    if(online!==null&&online!==installedVersion(reg))showUpdateBar();
  };
  await check();
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")check()});
  setInterval(check,VERSION_CHECK_MS);
});
