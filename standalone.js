/* Biblioteca Clínica — modo independiente (teléfono). Autor: Dr. Juan Fernando Carvajal Estupiñán.
   Sustituye las capacidades de Claude por versiones locales:
   db -> IndexedDB, sample -> API de Anthropic (clave propia), mcp PubMed -> NCBI E-utilities, downloads -> descarga del navegador. */
(function(){
"use strict";
var LS=window.localStorage;
function lsGet(k,d){ try{ var v=LS.getItem(k); return v===null?d:v; }catch(e){ return d; } }
function lsSet(k,v){ try{ if(v) LS.setItem(k,v); else LS.removeItem(k); }catch(e){} }

window.__standalone={
  getKey:function(){ return lsGet("bc_apikey",""); },
  setKey:function(v){ lsSet("bc_apikey",v); },
  getModel:function(){ return lsGet("bc_model","claude-sonnet-5-5"); },
  setModel:function(v){ lsSet("bc_model",v); }
};

/* ---------- db: IndexedDB con caché en memoria ---------- */
var DBN="biblioteca-clinica", STORE="docs", mem={}, subs={}, ready=null;
function openDb(){
  return new Promise(function(res,rej){
    var r=indexedDB.open(DBN,1);
    r.onupgradeneeded=function(){ r.result.createObjectStore(STORE); };
    r.onsuccess=function(){ res(r.result); };
    r.onerror=function(){ rej(r.error); };
  });
}
function loadAll(){
  return openDb().then(function(db){
    return new Promise(function(res,rej){
      var out={}, tx=db.transaction(STORE,"readonly"), st=tx.objectStore(STORE), c=st.openCursor();
      c.onsuccess=function(){ var cur=c.result; if(cur){ out[cur.key]=cur.value; cur.continue(); } else res({db:db,data:out}); };
      c.onerror=function(){ rej(c.error); };
    });
  });
}
var idb=null;
function persist(key,val){
  if(!idb) return Promise.resolve();
  return new Promise(function(res,rej){
    var tx=idb.transaction(STORE,"readwrite"), st=tx.objectStore(STORE);
    if(val===null) st.delete(key); else st.put(val,key);
    tx.oncomplete=function(){ res(); }; tx.onerror=function(){ rej(tx.error); };
  });
}
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function isObj(x){ return x&&typeof x==="object"&&!Array.isArray(x); }
function merge(a,b){
  var o=Object.assign({},a);
  Object.keys(b).forEach(function(k){ o[k]=(isObj(b[k])&&isObj(o[k]))?merge(o[k],b[k]):b[k]; });
  return o;
}
function ids(col){ var p=col+"/"; return Object.keys(mem).filter(function(k){ return k.indexOf(p)===0; }); }
function snapOf(col){
  var docs=ids(col).map(function(k){ var id=k.slice(col.length+1), v=mem[k]; return {id:id,data:function(){ return clone(v); }}; });
  return {docs:docs,metadata:{fromCache:false}};
}
function notify(col){ (subs[col]||[]).forEach(function(f){ try{ f(snapOf(col)); }catch(e){} }); }
function newId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function docRef(col,id){
  return {
    id:id,
    get:function(){ var v=mem[col+"/"+id]; return Promise.resolve({id:id,exists:v!==undefined,data:function(){ return v===undefined?undefined:clone(v); }}); },
    set:function(o){ mem[col+"/"+id]=clone(o); return persist(col+"/"+id,mem[col+"/"+id]).then(function(){ notify(col); }); },
    update:function(patch){ var cur=mem[col+"/"+id]; if(cur===undefined) return Promise.reject({code:"not_found"}); mem[col+"/"+id]=merge(cur,clone(patch)); return persist(col+"/"+id,mem[col+"/"+id]).then(function(){ notify(col); }); },
    delete:function(){ delete mem[col+"/"+id]; return persist(col+"/"+id,null).then(function(){ notify(col); }); }
  };
}
var dbApi={
  collection:function(col){
    return {
      get:function(){ return Promise.resolve(snapOf(col)); },
      onSnapshot:function(cb){ (subs[col]=subs[col]||[]).push(cb); setTimeout(function(){ cb(snapOf(col)); },0); return function(){ subs[col]=(subs[col]||[]).filter(function(f){ return f!==cb; }); }; },
      add:function(o){ var id=newId(); return docRef(col,id).set(o).then(function(){ return {id:id}; }); },
      doc:function(id){ return docRef(col,id); }
    };
  }
};

/* ---------- sample: API de Anthropic con streaming ---------- */
function sample(prompt,opts){
  opts=opts||{};
  var key=window.__standalone.getKey();
  if(!key) return Promise.reject({code:"not_granted",message:"Falta la clave de API"});
  var body={model:window.__standalone.getModel(),max_tokens:opts.modelTier==="complex"?12000:6000,stream:true,messages:[{role:"user",content:String(prompt)}]};
  return fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body:JSON.stringify(body)
  }).then(function(r){
    if(!r.ok){
      return r.text().then(function(t){
        var msg=""; try{ msg=JSON.parse(t).error.message; }catch(e){ msg=t.slice(0,200); }
        var code=r.status===401||r.status===403?"not_granted":(r.status===429?"rate_limited":"api_"+r.status);
        throw {code:code,message:msg};
      });
    }
    var rd=r.body.getReader(), dec=new TextDecoder(), buf="", text="", trunc=false;
    function pump(){
      return rd.read().then(function(x){
        if(x.done) return {text:text,truncated:trunc};
        buf+=dec.decode(x.value,{stream:true});
        var parts=buf.split("\n"); buf=parts.pop();
        parts.forEach(function(line){
          if(line.indexOf("data:")!==0) return;
          var j; try{ j=JSON.parse(line.slice(5)); }catch(e){ return; }
          if(j.type==="content_block_delta"&&j.delta&&j.delta.type==="text_delta"){ text+=j.delta.text; if(opts.onText) try{ opts.onText({text:text}); }catch(e){} }
          else if(j.type==="message_delta"&&j.delta&&j.delta.stop_reason==="max_tokens") trunc=true;
          else if(j.type==="error") throw {code:"api_error",message:(j.error&&j.error.message)||"error"};
        });
        return pump();
      });
    }
    return pump();
  },function(e){
    if(e&&e.code) throw e;
    throw {code:"network",message:"Sin conexión con la API de Claude."};
  });
}

/* ---------- descargas ---------- */
var MIME={json:"application/json",html:"text/html",pdf:"application/pdf",txt:"text/plain",md:"text/markdown"};
var downloadsApi={
  save:function(o){
    return new Promise(function(res,rej){
      try{
        var ext=(o.filename.split(".").pop()||"").toLowerCase(), d=o.data;
        var blob=(d instanceof Blob)?d:new Blob([d],{type:(MIME[ext]||"application/octet-stream")+(typeof d==="string"?";charset=utf-8":"")});
        var file; try{ file=new File([blob],o.filename,{type:blob.type}); }catch(e){}
        if(file&&navigator.canShare&&navigator.canShare({files:[file]})&&/Android|iPhone|iPad/i.test(navigator.userAgent)){
          navigator.share({files:[file],title:o.filename}).then(res,function(e){ if(e&&e.name==="AbortError") rej({code:"declined"}); else save2(); });
        } else save2();
        function save2(){
          var u=URL.createObjectURL(blob), a=document.createElement("a");
          a.href=u; a.download=o.filename; document.body.appendChild(a); a.click();
          setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(u); },4000); res();
        }
      }catch(e){ rej(e); }
    });
  }
};

/* ---------- PubMed: NCBI E-utilities ---------- */
var EU="https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
function eu(path,params){
  var q=Object.keys(params).map(function(k){ return encodeURIComponent(k)+"="+encodeURIComponent(params[k]); }).join("&");
  return fetch(EU+path+"?"+q+"&tool=biblioteca-clinica").then(function(r){ if(!r.ok) throw {code:"pubmed_"+r.status,message:"PubMed respondió "+r.status}; return r; },function(){ throw {code:"network",message:"Sin conexión con PubMed."}; });
}
function txt(n,sel){ var e=n.querySelector(sel); return e?(e.textContent||"").trim():""; }
function parseArticles(xml){
  var doc=new DOMParser().parseFromString(xml,"text/xml"), out=[];
  Array.prototype.forEach.call(doc.querySelectorAll("PubmedArticle"),function(pa){
    var art=pa.querySelector("MedlineCitation > Article"); if(!art) return;
    var ab=Array.prototype.map.call(art.querySelectorAll("Abstract > AbstractText"),function(t){ var l=t.getAttribute("Label"); return (l?l+": ":"")+(t.textContent||"").trim(); }).join("\n");
    var ids={pmid:txt(pa,"MedlineCitation > PMID")};
    Array.prototype.forEach.call(pa.querySelectorAll("PubmedData > ArticleIdList > ArticleId"),function(a){ var t=a.getAttribute("IdType"); if(t==="doi") ids.doi=(a.textContent||"").trim(); if(t==="pmc") ids.pmc=(a.textContent||"").trim(); });
    if(!ids.doi){ var el=art.querySelector('ELocationID[EIdType="doi"]'); if(el) ids.doi=(el.textContent||"").trim(); }
    var y=txt(art,"Journal > JournalIssue > PubDate > Year");
    if(!y){ var md=txt(art,"Journal > JournalIssue > PubDate > MedlineDate"); var mm=md.match(/\d{4}/); y=mm?mm[0]:""; }
    if(!y) y=txt(art,"ArticleDate > Year");
    out.push({
      identifiers:ids,
      title:(art.querySelector("ArticleTitle")||{}).textContent||"",
      abstract:ab,
      journal:{iso_abbreviation:txt(pa,"MedlineJournalInfo > MedlineTA")||txt(art,"Journal > ISOAbbreviation"),title:txt(art,"Journal > Title")},
      authors:Array.prototype.map.call(art.querySelectorAll("AuthorList > Author"),function(a){ return {last_name:txt(a,"LastName")||txt(a,"CollectiveName"),initials:txt(a,"Initials")}; }),
      publication_date:{year:y},
      citation:{volume:txt(art,"Journal > JournalIssue > Volume"),issue:txt(art,"Journal > JournalIssue > Issue"),pages:txt(art,"Pagination > MedlinePgn")||txt(art,"ELocationID")},
      article_types:Array.prototype.map.call(art.querySelectorAll("PublicationTypeList > PublicationType"),function(t){ return (t.textContent||"").trim(); }),
      keywords:Array.prototype.map.call(pa.querySelectorAll("KeywordList > Keyword"),function(k){ return (k.textContent||"").trim(); })
    });
  });
  return out;
}
var pubmed={
  search_articles:function(inp){
    var p={db:"pubmed",term:inp.query,retmax:inp.max_results||10,retmode:"json",sort:inp.sort==="date"?"pub+date":"relevance"};
    if(p.sort==="pub+date") p.sort="pub_date";
    if(inp.date_from){ p.datetype="pdat"; p.mindate=String(inp.date_from).slice(0,4); p.maxdate="3000"; }
    return eu("esearch.fcgi",p).then(function(r){ return r.json(); }).then(function(j){
      var e=j.esearchresult||{};
      return {pmids:e.idlist||[],total_count:Number(e.count||0),query_translation:e.querytranslation||""};
    });
  },
  get_article_metadata:function(inp){
    var list=(inp.pmids||[]).join(",");
    if(!list) return Promise.resolve({articles:[]});
    return eu("efetch.fcgi",{db:"pubmed",id:list,retmode:"xml"}).then(function(r){ return r.text(); }).then(function(x){ return {articles:parseArticles(x)}; });
  }
};
var mcpApi={
  hasServer:function(n){ return n==="PubMed"; },
  server:function(n){ if(n!=="PubMed") return Promise.reject({code:"server_not_connected"}); return Promise.resolve(pubmed); },
  callTool:function(n,t,i){ if(n!=="PubMed"||!pubmed[t]) return Promise.reject({code:"server_not_connected"}); return pubmed[t](i); }
};

/* ---------- puente con la app ---------- */
ready=loadAll().then(function(r){ idb=r.db; Object.keys(r.data).forEach(function(k){ mem[k]=r.data[k]; }); }).catch(function(){ idb=null; });
window.claude={
  use:function(name){
    return ready.then(function(){
      if(name==="db") return dbApi;
      if(name==="sample") return sample;
      if(name==="downloads") return downloadsApi;
      if(name==="mcp") return mcpApi;
      if(name==="user") return {name:"Dr. Juan Fernando Carvajal Estupiñán"};
      throw {code:"unsupported"};
    });
  }
};
/* almacenamiento persistente: evita que el navegador borre la biblioteca */
try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist(); }catch(e){}
/* service worker */
if("serviceWorker" in navigator){ window.addEventListener("load",function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); }); }
})();
