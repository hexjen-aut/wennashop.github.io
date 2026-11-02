/* Mini client Supabase (auth, REST, fonctions) : juste ce dont l'app a besoin. */
(function(){
  function createClient(url,key,opts){
    const SK=(opts&&opts.auth&&opts.auth.storageKey)||"sb-auth";
    const listeners=[];
    const load=()=>{try{return JSON.parse(localStorage.getItem(SK))}catch(e){return null}};
    const store=s=>{try{s?localStorage.setItem(SK,JSON.stringify(s)):localStorage.removeItem(SK)}catch(e){}listeners.forEach(f=>f(s?"SIGNED_IN":"SIGNED_OUT",s))};
    const norm=d=>d&&d.access_token?{access_token:d.access_token,refresh_token:d.refresh_token,expires_at:d.expires_at||Math.floor(Date.now()/1000)+(d.expires_in||3600),user:d.user}:null;
    async function call(path,{method="GET",body,headers={},auth=true}={}){
      let s=auth?await session():null;
      try{
        const r=await fetch(url+path,{method,headers:{apikey:key,"Content-Type":"application/json",...(s?{Authorization:"Bearer "+s.access_token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
        const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch(e){data=txt}
        if(!r.ok)return{data:null,error:{status:r.status,message:(data&&(data.msg||data.message||data.error_description||data.error))||("Erreur "+r.status)}};
        return{data,error:null};
      }catch(e){return{data:null,error:{message:"network: Failed to fetch"}}}
    }
    let refreshing=null;
    async function session(){
      const s=load();if(!s)return null;
      if(s.expires_at-60>Date.now()/1000||!navigator.onLine)return s;
      if(!refreshing)refreshing=(async()=>{
        try{const r=await fetch(url+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:s.refresh_token})});
          if(r.ok){const n=norm(await r.json());store(n);return n}
          if(r.status===400||r.status===401){store(null);return null}
          return s;
        }catch(e){return s}finally{setTimeout(()=>refreshing=null,0)}})();
      return refreshing;
    }
    const auth={
      async getSession(){return{data:{session:await session()}}},
      async signInWithPassword({email,password}){const r=await call("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password},auth:false});if(r.error)return{data:{},error:r.error};const s=norm(r.data);store(s);return{data:{session:s,user:s.user},error:null}},
      // redirect_to : ou l'e-mail de confirmation renvoie. Sans lui, Supabase
      // utilise la Site URL du projet, qui pointe vers une autre app.
      // L'URL doit etre autorisee dans Supabase, sinon elle est ignoree.
      async signUp({email,password,options}){const rt=options&&options.emailRedirectTo;const r=await call("/auth/v1/signup"+(rt?"?redirect_to="+encodeURIComponent(rt):""),{method:"POST",body:{email,password},auth:false});if(r.error)return{data:{},error:r.error};const s=norm(r.data);if(s)store(s);return{data:{session:s,user:s?s.user:r.data},error:null}},
      async resetPasswordForEmail(email,options){const rt=options&&options.redirectTo;return call("/auth/v1/recover"+(rt?"?redirect_to="+encodeURIComponent(rt):""),{method:"POST",body:{email},auth:false})},
      async signOut(){await call("/auth/v1/logout",{method:"POST"});store(null);return{error:null}},
      onAuthStateChange(cb){listeners.push(cb);const s=load();if(s)cb("INITIAL_SESSION",s);return{data:{subscription:{unsubscribe(){}}}}}
    };
    class Q{
      constructor(t){this.t=t;this.p=new URLSearchParams();this.m="GET";this.h={};this.b=undefined;this.one=false}
      select(c){this.p.set("select",c||"*");return this}
      order(c,o){this.p.append("order",c+"."+(o&&o.ascending===false?"desc":"asc"));return this}
      limit(n){this.p.set("limit",n);return this}
      eq(c,v){this.p.append(c,"eq."+v);return this}
      maybeSingle(){this.one=true;return this}
      upsert(row,o){this.m="POST";this.b=row;this.h.Prefer="resolution=merge-duplicates,return=minimal";if(o&&o.onConflict)this.p.set("on_conflict",o.onConflict);return this}
      delete(){this.m="DELETE";this.h.Prefer="return=minimal";return this}
      then(res,rej){return call("/rest/v1/"+this.t+"?"+this.p.toString(),{method:this.m,body:this.b,headers:this.h}).then(r=>{if(!r.error&&this.one)r.data=Array.isArray(r.data)?(r.data[0]||null):r.data;return r}).then(res,rej)}
    }
    return{
      auth,
      from:t=>new Q(t),
      functions:{invoke:async(name,{body}={})=>{const r=await call("/functions/v1/"+name,{method:"POST",body});return r}}
    };
  }
  window.supabase={createClient};
})();
