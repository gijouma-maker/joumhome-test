/* JoumHome – GitHub-Modus
   Läuft nur, wenn die Seite NICHT in Claude geöffnet ist (window.claude fehlt), z. B. auf GitHub Pages.
   Ersetzt Claudes Datenbank durch Speicher im Browser (localStorage), Fotos/PDFs durch IndexedDB,
   legt beim ersten Start Beispieldaten an und erkennt die Rolle über den Link:
     ohne Zusatz              = Master-Admin
     ?rolle=admin             = Admin
     ?rolle=mieter&id=<id>    = Mieter
     ?rolle=handwerker&id=<id>= Handwerker
   Wichtig: Jede Person/jedes Gerät hat eigene Daten. Keine echte Sicherheit (Rolle steht im Link). */
(function(){
  if (window.claude && window.claude.use) return;

  var STORE = "jh_test_v1", IDB = "jh_dateien", IDB_STORE = "f";
  var P = new URLSearchParams(location.search);
  var ROLLE = (P.get("rolle") || "").toLowerCase();
  var RID = P.get("id") || "";
  window.__jhGithub = { rolle: ROLLE || "master", id: RID, store: STORE };

  /* ---------- Datenbank im Browser ---------- */
  function makeDB(key){
    var S = {};
    try { S = JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch(e){ S = {}; }
    if (typeof S !== "object" || Array.isArray(S)) S = {};
    for (var k in S) if (!S[k] || typeof S[k] !== "object" || Array.isArray(S[k])) delete S[k];
    var subs = [], saveT = null;
    var save = function(){ clearTimeout(saveT); saveT = setTimeout(function(){ try { localStorage.setItem(key, JSON.stringify(S)); } catch(e){ console.warn("Speicher voll?", e); } }, 250); };
    var clone = function(o){ return o == null ? o : JSON.parse(JSON.stringify(o)); };
    var notify = function(c){ setTimeout(function(){ subs.filter(function(x){ return x.c === c; }).forEach(function(x){ x.fire(); }); }, 0); };
    var sub = function(x){ subs.push(x); setTimeout(x.fire, 0); return function(){ var i = subs.indexOf(x); if (i >= 0) subs.splice(i, 1); }; };
    var dsnap = function(c, id){ return { id: id, exists: !!(S[c] && S[c][id]), data: function(){ return clone(S[c] && S[c][id]); } }; };
    var ref = function(c, id){ return {
      id: id,
      toString: function(){ return c + "/" + id; },
      set: async function(d, opt){ S[c] = S[c] || {}; if (opt && opt.merge) S[c][id] = Object.assign(S[c][id] || {}, clone(d)); else S[c][id] = clone(d) || {}; save(); notify(c); },
      update: async function(p){ S[c] = S[c] || {}; var cur = S[c][id] = S[c][id] || {};
        for (var k in p){ var v = clone(p[k]);
          if (k.indexOf(".") >= 0){ var ks = k.split("."), o = cur; for (var i = 0; i < ks.length - 1; i++){ if (!o[ks[i]] || typeof o[ks[i]] !== "object") o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length-1]] = v; }
          else cur[k] = v; }
        save(); notify(c); },
      delete: async function(){ if (S[c]) delete S[c][id]; save(); notify(c); },
      get: async function(){ return dsnap(c, id); },
      onSnapshot: function(cb, err){ return sub({ c: c, fire: function(){ try { cb(dsnap(c, id)); } catch(e){ console.error(e); } } }); }
    }; };
    var qsnap = function(c){ var ids = Object.keys(S[c] || {}); return { docs: ids.map(function(id){ return { id: id, exists: true, data: function(){ return clone(S[c][id]); } }; }), size: ids.length, empty: !ids.length }; };
    return {
      collection: function(c){ return {
        doc: function(id){ return ref(c, id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6))); },
        get: async function(){ return qsnap(c); },
        onSnapshot: function(cb){ return sub({ c: c, fire: function(){ try { cb(qsnap(c)); } catch(e){ console.error(e); } } }); }
      }; },
      doc: function(p){ var i = p.indexOf("/"); return ref(p.slice(0, i), p.slice(i + 1)); },
      _S: function(){ return S; },
      _reset: function(){ S = {}; try { localStorage.removeItem(key); } catch(e){} }
    };
  }

  /* ---------- Fotos & PDFs in IndexedDB ---------- */
  var URLS = {};
  function idb(){ return new Promise(function(res, rej){ try { var r = indexedDB.open(IDB, 1); r.onupgradeneeded = function(){ r.result.createObjectStore(IDB_STORE); }; r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); }; } catch(e){ rej(e); } }); }
  function tx(mode, fn){ return idb().then(function(db){ return new Promise(function(res, rej){ var t = db.transaction(IDB_STORE, mode), s = t.objectStore(IDB_STORE), out = fn(s); t.oncomplete = function(){ res(out && out.result !== undefined ? out.result : out); }; t.onerror = function(){ rej(t.error); }; }); }); }
  var preload = idb().then(function(db){ return new Promise(function(res){
    try { var t = db.transaction(IDB_STORE, "readonly"), s = t.objectStore(IDB_STORE), c = s.openCursor();
      c.onsuccess = function(){ var cur = c.result; if (cur){ try { URLS[cur.key] = URL.createObjectURL(cur.value); } catch(e){} cur.continue(); } else res(); };
      c.onerror = function(){ res(); };
    } catch(e){ res(); } }); }).catch(function(){});
  window.__jhAsset = function(id){ if (!id) return ""; if (/^(blob:|data:|https?:)/.test(id)) return id; return URLS[id] || ""; };
  var assets = {
    upload: async function(b){ var id = "gh-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      try { await tx("readwrite", function(s){ return s.put(b, id); }); } catch(e){ console.warn("Datei nicht gespeichert", e); }
      URLS[id] = URL.createObjectURL(b); return { id: id, url: URLS[id] }; },
    write: function(b){ return assets.upload(b); },
    delete: async function(id){ try { await tx("readwrite", function(s){ return s.delete(id); }); } catch(e){} if (URLS[id]){ try { URL.revokeObjectURL(URLS[id]); } catch(e){} delete URLS[id]; } return true; }
  };

  /* ---------- Download ---------- */
  var downloads = { save: async function(o){ var u = URL.createObjectURL(o.data), a = document.createElement("a"); a.href = u; a.download = o.filename || "datei"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 4000); } };

  var DB = makeDB(STORE);
  var MYID = ROLLE === "mieter" ? "gh-mieter-" + RID : ROLLE === "handwerker" ? "gh-hw-" + RID : ROLLE === "admin" ? "gh-admin" : "gh-master";

  /* ---------- Beispieldaten ---------- */
  async function seed(){
    var S = DB._S(); if (S.objekte && Object.keys(S.objekte).length) return;
    var ym = curYm(), prev = ymAdd(ym, -1), t = today(), now = new Date().toISOString();
    var D = {
      objekte:{O1:{name:"Musterstraße 1",adresse:"Musterstraße 1, 10115 Berlin",garten:true},O2:{name:"Lindenweg 7",adresse:"Lindenweg 7, 50667 Köln",garten:false}},
      wohnungen:{"O1-W1":{objektId:"O1",lage:"EG links",flaeche:62,zimmer:2,status:"Vermietet",kalt:650,nk:180,extra:0},"O1-W2":{objektId:"O1",lage:"1. OG",flaeche:78,zimmer:3,status:"Vermietet",kalt:820,nk:210,extra:40},"O1-W3":{objektId:"O1",lage:"2. OG",flaeche:55,zimmer:2,status:"Leer",kalt:600,nk:160,extra:0},"O2-W1":{objektId:"O2",lage:"EG",flaeche:90,zimmer:4,status:"Vermietet",kalt:950,nk:240,extra:0}},
      mieter:{d1:{name:"Max Mustermann",wohnungId:"O1-W1",telefon:"0151 0000001",email:"max@example.com",sprache:"de",beginn:"2024-03-01",kaution:1950,kautionGezahlt:1950,aktiv:true,markt:true,feiern:true},d2:{name:"Ayşe Demir",wohnungId:"O1-W2",telefon:"0151 0000002",email:"ayse@example.com",sprache:"tr",beginn:"2026-08-01",kaution:2460,kautionGezahlt:800,aktiv:true,markt:true,feiern:true},d3:{name:"Elena Petrova",wohnungId:"O2-W1",telefon:"0151 0000003",sprache:"ru",beginn:"2023-01-01",kaution:2850,kautionGezahlt:2850,aktiv:true,markt:true,feiern:true}},
      zahlungen:{z1:{wohnungId:"O1-W1",monat:prev,soll:830,bezahlt:830,eingang:prev+"-02"},z2:{wohnungId:"O1-W2",monat:prev,soll:1070,bezahlt:0},z3:{wohnungId:"O2-W1",monat:prev,soll:1190,bezahlt:1190,eingang:prev+"-01"},z4:{wohnungId:"O1-W1",monat:ym,soll:830,bezahlt:830,eingang:ym+"-01"},z5:{wohnungId:"O1-W2",monat:ym,soll:1070,bezahlt:500,eingang:ym+"-05"}},
      schaeden:{s1:{nr:1001,datum:t,wohnungId:"O1-W2",beschreibung:"Heizung im Bad wird nicht warm",status:"Gemeldet",prio:"Dringend",quelle:"Mieter per WhatsApp",verlauf:[{t:now,text:"Ticket eröffnet – Mieter per WhatsApp"}]},s2:{nr:1002,datum:t,wohnungId:"O2-W1",beschreibung:"Wasserhahn in der Küche tropft",status:"Gemeldet",prio:"Normal",quelle:"Mieter per Telefon",verlauf:[{t:now,text:"Ticket eröffnet – Mieter per Telefon"}]}},
      verstoesse:{v1:{nr:1003,datum:t,wohnungId:"O1-W1",art:"Biomüll in Restmüll",tstatus:"Neu",prio:"Normal",quelle:"Selbst festgestellt",verlauf:[{t:now,text:"Ticket eröffnet"}]}},
      handwerker:{hd1:{typ:"Handwerker",name:"Tom Beispiel",firma:"Beispiel Haustechnik",gewerk:"Heizung",telefon:"0170 0000010",email:"info@example.com"},hd2:{typ:"Handwerker",name:"Lena Klempner",firma:"Klempnerei Klar",gewerk:"Sanitär",telefon:"0170 0000011"},hd3:{typ:"Anwalt",name:"RA Dr. Muster",firma:"Kanzlei Muster",gewerk:"Mietrecht",email:"kanzlei@example.com"}},
      ausgaben:{a1:{datum:t,betrag:84.9,objektId:"O1",kategorie:"Material/Baumarkt",kostentraeger:"Vermieter",haendler:"Baumarkt",beschreibung:"Silikon, Dichtungen"},a2:{datum:prev+"-15",betrag:320,objektId:"O1",kategorie:"Gartenpflege",kostentraeger:"Vermieter",umlage:true,haendler:"Gartenservice",beschreibung:"Heckenschnitt"}},
      auftraege:{auf1:{typ:"Handwerker",nr:1,hwId:"hd1",hwName:"Tom Beispiel",firma:"Beispiel Haustechnik",gewerk:"Heizung",telefon:"0170 0000010",objektId:"O1",wohnungId:"O1-W2",mieterId:"d2",ticketCol:"schaeden",ticketId:"s1",ticketNr:1001,titel:"Heizung im Bad wird nicht warm",text:"Heizkörper im Bad bleibt kalt, bitte prüfen und entlüften.",prio:"Dringend",mieterKontakt:true,fotos:[],status:"Beauftragt",datum:t,verlauf:[{t:now,text:"Auftrag an Tom Beispiel angelegt"}]},auf2:{typ:"Handwerker",nr:2,hwId:"hd2",hwName:"Lena Klempner",firma:"Klempnerei Klar",gewerk:"Sanitär",telefon:"0170 0000011",objektId:"O2",wohnungId:"O2-W1",mieterId:"d3",ticketCol:"schaeden",ticketId:"s2",ticketNr:1002,titel:"Wasserhahn in der Küche tropft",text:"Dichtung am Küchenwasserhahn tauschen.",prio:"Normal",mieterKontakt:true,fotos:[],status:"Beauftragt",datum:t,verlauf:[{t:now,text:"Auftrag an Lena Klempner angelegt"}]}},
      garten:{g1:{objektId:"O1",wohnungId:"O1-W1",datum:ymAdd(ym,1)+"-06",von:"14:00",bis:"19:00",anlass:"Geburtstag",status:"Angefragt"}},
      brett:{b1:{objektId:"O1",art:"Info vom Vermieter",datum:t,text:"Am Samstag wird die Heizung gewartet. Bitte Zugang zu den Heizkörpern ermöglichen.",status:"Aktiv"}}
    };
    for (var c in D) for (var id in D[c]) await DB.collection(c).doc(id).set(Object.assign({}, D[c][id], { geaendert: now }));
    if (!(S.config && S.config.vermieter && S.config.vermieter.name)) await DB.doc("config/vermieter").set({name:"Erika Vermieterin",adresse:"Beispielallee 5, 10115 Berlin",ort:"Berlin",telefon:"030 000000",email:"vermieter@example.com",iban:"DE00 0000 0000 0000 0000 00",bank:"Demo-Bank"});
  }

  /* Für Mieter/Handwerker: Portal-Daten aus den Browser-Daten erzeugen (wie es sonst der Vermieter tut) */
  async function portalVorbereiten(){
    var S = DB._S();
    if (ROLLE === "mieter"){
      var ms = S.mieter || {}, mid = (RID && ms[RID]) ? RID : Object.keys(ms).find(function(k){ return ms[k].aktiv !== false; });
      if (!mid) return;
      await DB.collection("mieter").doc(mid).update({ userId: MYID, userName: ms[mid].name || "" });
    } else if (ROLLE === "handwerker"){
      var hs = S.handwerker || {}, hid = (RID && hs[RID]) ? RID : Object.keys(hs).find(function(k){ return (hs[k].typ || "Handwerker") === "Handwerker"; });
      if (!hid) return;
      await DB.collection("handwerker").doc(hid).update({ userId: MYID, userName: hs[hid].name || "" });
    } else return;
    var S2 = DB._S(), alt = { role: st.role, loaded: st.loaded, db: st.db, data: st.data, cfg: st.cfg };
    try {
      st.db = DB; st.role = "master"; st.loaded = true; st.cfg = (S2.config && S2.config.vermieter) || {};
      st.data = {}; COLS.forEach(function(c){ st.data[c] = {}; var src = S2[c] || {}; for (var k in src) st.data[c][k] = Object.assign({ id: k }, JSON.parse(JSON.stringify(src[k]))); });
      await syncPortalsNow();
    } catch(e){ console.warn("Portal", e); }
    finally { st.role = alt.role; st.loaded = alt.loaded; st.db = alt.db; st.data = alt.data; st.cfg = alt.cfg; st.portalLast = {}; }
  }

  var bereit = null;
  function vorbereiten(){ if (!bereit) bereit = (async function(){ await preload; try { await seed(); } catch(e){ console.warn("Beispieldaten", e); } await new Promise(function(r){ setTimeout(r, 400); }); await portalVorbereiten(); })(); return bereit; }

  var user = {
    isOwner: async function(){ return !ROLLE; },
    canEdit: async function(){ return !ROLLE || ROLLE === "admin"; },
    id: async function(){ return MYID; },
    search: async function(){ return []; },
    profiles: async function(){ return []; }
  };

  window.claude = { github: true, use: async function(name){
    if (name === "db"){ await vorbereiten(); return DB; }
    if (name === "assets") return assets;
    if (name === "downloads") return downloads;
    if (name === "user"){ await vorbereiten(); return user; }
    if (name === "tts") return window.__webTts || null;
    return null; /* KI (sample), Diktat usw. gibt es auf GitHub nicht */
  } };

  /* ---------- Test-Links versenden (nur Master auf Start) ---------- */
  function basis(){ return location.origin + location.pathname.replace(/index\.html$/, ""); }
  function linkFuer(r, id){ return basis() + "?rolle=" + r + (id ? "&id=" + encodeURIComponent(id) : ""); }
  function karte(){
    var ms = Object.entries(DB._S().mieter || {}).filter(function(e){ return e[1].aktiv !== false; });
    var hs = Object.entries(DB._S().handwerker || {}).filter(function(e){ return (e[1].typ || "Handwerker") === "Handwerker"; });
    var zeile = function(name, l){ var wa = "https://wa.me/?text=" + encodeURIComponent("Hallo " + name + ", hier ist dein Test-Link für JoumHome:\n" + l + "\n\nAlle Daten bleiben nur auf deinem Handy.");
      return '<div class="mrow" style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 0"><span>' + esc(name) + '</span><span class="row" style="gap:6px;margin:0"><a class="btn sm pri" target="_blank" rel="noopener" href="' + esc(wa) + '">WhatsApp</a><button class="btn sm" data-ghcopy="' + esc(l) + '">Kopieren</button></span></div>'; };
    var h = '<section class="card" id="ghLinks" style="display:flex;flex-direction:column;gap:6px"><details><summary style="cursor:pointer"><b>Link versenden</b> <span class="small">· Testversion auf GitHub</span></summary>'
      + '<div class="small" style="margin:6px 0">Jede Person bekommt ihre eigene Ansicht. Die Daten bleiben nur auf ihrem Gerät – Eingaben anderer siehst du hier nicht.</div>'
      + zeile("Admin / Vermieter", linkFuer("admin"))
      + (ms.length ? '<div class="small" style="margin-top:6px">Mieter</div>' + ms.map(function(e){ return zeile(e[1].name || e[0], linkFuer("mieter", e[0])); }).join("") : "")
      + (hs.length ? '<div class="small" style="margin-top:6px">Handwerker</div>' + hs.map(function(e){ return zeile(e[1].name || e[0], linkFuer("handwerker", e[0])); }).join("") : "")
      + '<div class="row" style="margin-top:8px"><button class="btn sm ghost" data-ghreset="1">Testdaten auf diesem Gerät löschen</button></div></details></section>';
    return h;
  }
  document.addEventListener("click", async function(e){
    var c = e.target.closest && e.target.closest("[data-ghcopy]");
    if (c){ try { await navigator.clipboard.writeText(c.getAttribute("data-ghcopy")); toast("Link kopiert"); } catch(err){ prompt("Link kopieren:", c.getAttribute("data-ghcopy")); } return; }
    var r = e.target.closest && e.target.closest("[data-ghreset]");
    if (r){ if (!confirm("Alle Testdaten und Fotos auf diesem Gerät löschen und mit Beispieldaten neu starten?")) return; DB._reset(); try { indexedDB.deleteDatabase(IDB); } catch(err){} setTimeout(function(){ location.reload(); }, 300); }
  });
  var mo = new MutationObserver(function(){
    try {
      if (ROLLE || typeof st === "undefined" || st.role !== "master" || st.tab !== "start" || !st.loaded) return;
      var m = document.getElementById("main"); if (!m || document.getElementById("ghLinks")) return;
      m.insertAdjacentHTML("afterbegin", karte());
    } catch(err){}
  });
  document.addEventListener("DOMContentLoaded", function(){ var m = document.getElementById("main"); if (m) mo.observe(m, { childList: true }); });
})();
