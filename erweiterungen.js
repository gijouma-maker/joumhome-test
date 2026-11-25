/* JoumHome – Erweiterungen (Stand 23.11.2026)
   1) Nebenkostenabrechnung je Haus und Jahr (Finanzen › Nebenkosten)
   2) Wartungsplan je Haus mit Erinnerungen, Garantien, Jahreszeit-Tipps (Haus › Wartung)
   3) Geführte Hausbegehung mit Mängeln → Tickets und PDF (Haus › Begehung)
   4) KI-Erstantwort bei Schadensmeldungen der Mieter
   5) Zahlungs-Frühwarnung (Start + Mieter)
   6) Miete anpassen: Mietspiegel/Kappungsgrenze (§ 558 BGB), Indexmiete (§ 557b BGB), Brief
   7) Anlage V-Übersicht + Grundsteuer-Daten je Haus (Finanzen › Anlage V & Grundsteuer)
   8) Bewerber-Prüfung per KI (Neuvermietung › Interessenten)
   9) Briefe per Post: druckfertig + Einwurf-Einschreiben-Nachweis
   Alles ohne Gewähr, keine Rechts- oder Steuerberatung. */
(function(){
"use strict";
const r2=x=>Math.round((+x||0)*100)/100;
function pdfSafe(d){ const t=d.text.bind(d), sp=d.splitTextToSize.bind(d); d.text=(x,...a)=>t(pT(x),...a); d.splitTextToSize=(x,...a)=>sp(pT(x),...a); return d; }
const pT=x=>Array.isArray(x)?x.map(pT):String(x??"").replace(/m²/g,"qm").replace(/²/g,"2").replace(/[−–]/g,"-").replace(/[„“”]/g,'"').replace(/[’‘]/g,"'").replace(/…/g,"...").replace(/[✓⅓]/g,"");
const DAY=864e5;
const dParse=s=>{ if(!s) return null; const d=new Date(String(s).slice(0,10)+"T12:00:00"); return isNaN(d)?null:d; };
const dStr=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const addM=(s,n)=>{ const d=dParse(s)||new Date(); const t=new Date(d.getFullYear(),d.getMonth()+n,1,12); const last=new Date(t.getFullYear(),t.getMonth()+1,0,12).getDate(); t.setDate(Math.min(d.getDate(),last)); return dStr(t); };
const days=(a,b)=>Math.round((dParse(b)-dParse(a))/DAY);
const pct=n=>(Math.round(n*1000)/10).toLocaleString("de-DE")+" %";
const sel=(id,opts,v)=>`<select id="${id}">${opts.map(o=>{ const [k,l]=Array.isArray(o)?o:[o,o]; return `<option value="${esc(k)}"${String(k)===String(v??"")?" selected":""}>${esc(l)}</option>`; }).join("")}</select>`;
const inp=(id,v,t="text",ph="")=>`<input id="${id}" type="${t}"${t==="number"?' step="any" inputmode="decimal"':""} value="${v==null?"":esc(v)}"${ph?` placeholder="${esc(ph)}"`:""}>`;
const fld=(l,html,full)=>`<div class="field${full?" full":""}"><label>${esc(l)}</label>${html}</div>`;
const val=id=>{ const e=document.getElementById(id); return e?e.value.trim():""; };
const nval=id=>num(val(id).replace(",","."));
const objs=()=>list("objekte").sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
const wsOf=oid=>list("wohnungen").filter(w=>w.objektId===oid).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
async function dbSet(col,id,data){ await st.db.collection(col).doc(id).set(JSON.parse(JSON.stringify(data))); st.data[col]=st.data[col]||{}; st.data[col][id]={id,...data}; }
async function dbUpd(col,id,patch){ await st.db.collection(col).doc(id).update(JSON.parse(JSON.stringify(patch))); if(st.data[col]?.[id]) Object.assign(st.data[col][id],patch); }

/* ---------- Mietzeiten ---------- */
function mEnde(m){
  if(m.auszug) return m.auszug;
  const p=list("protokolle").filter(x=>x.mieterId===m.id&&String(x.art||"").startsWith("Rücknahme")).sort((a,b)=>String(b.datum).localeCompare(String(a.datum)))[0]; if(p?.datum) return p.datum;
  const k=list("vertraege").filter(v=>v.mieterId===m.id&&["kuendM","aufheb"].includes(v.tpl)&&v.status==="Unterschrieben"&&(v.felder?.gegenstand||"Wohnung")==="Wohnung").sort((a,b)=>String(b.datum||"").localeCompare(String(a.datum||"")))[0];
  if(k?.felder?.ende) return k.felder.ende;
  return null;
}
function perioden(wid,von,bis){
  const ms=list("mieter").filter(m=>m.wohnungId===wid&&m.beginn).sort((a,b)=>String(a.beginn).localeCompare(String(b.beginn)));
  const out=[];
  ms.forEach((m,i)=>{
    let e=mEnde(m); const nx=ms[i+1]; if(nx){ const vor=dStr(new Date(dParse(nx.beginn)-DAY)); if(!e||e>vor) e=vor; }
    if(!e&&m.aktiv===false) return;
    const a=m.beginn>von?m.beginn:von, b=(e&&e<bis)?e:bis;
    if(a<=b) out.push({m,von:a,bis:b,tage:days(a,b)+1});
  });
  return out;
}

/* =========================================================
   1) NEBENKOSTENABRECHNUNG
   ========================================================= */
const NK_KEYS=[["flaeche","Wohnfläche (m²)"],["personen","Personen"],["einheiten","Wohneinheiten"],["direkt","Direkt je Wohnung (z. B. Heizkostenabrechnung, Zähler)"]];
const NK_DEF={"Heizung/Brennstoff":"direkt","Wasser/Abwasser":"personen","Müllabfuhr":"personen"};
const FIX2KAT={"Wasser / Abwasser":"Wasser/Abwasser","Müllabfuhr":"Müllabfuhr","Reinigung / Hausmeister":"Hausmeister/Reinigung","Grundsteuer":"Grundsteuer","Versicherung":"Versicherung","Heizung / Brennstoff":"Heizung/Brennstoff","Stadtwerke (Strom/Gas)":"Strom (Allgemein)"};
const nkRec=(oid,y)=>st.data.nkabr?.[`${oid}_${y}`]||{};
function fixJahr(f,y){ const a=`${y}-01-01`, b=`${y}-12-31`; const s=f.seit&&f.seit>a?f.seit:a, e=f.bis&&f.bis<b?f.bis:b; if(s>e) return 0; const mon=(+e.slice(5,7))-(+s.slice(5,7))+1+12*((+e.slice(0,4))-(+s.slice(0,4))); return r2(fixMonat(f)*mon); }
function nkKosten(oid,y){
  const rec=nkRec(oid,y), as=list("ausgaben").filter(a=>a.objektId===oid&&String(a.datum||"").startsWith(String(y))&&a.umlage&&!isMK(a));
  const K={};
  const add=(kat,betrag,src,wid)=>{ const k=K[kat]=K[kat]||{kat,haus:0,direkt:{},quellen:[]}; if(wid) k.direkt[wid]=r2((k.direkt[wid]||0)+betrag); else k.haus=r2(k.haus+betrag); k.quellen.push(src); };
  as.forEach(a=>add(a.kategorie||"Sonstiges",+a.betrag||0,{t:`${fmtDate(a.datum)} ${a.haendler||a.beschreibung||a.kategorie}`,b:+a.betrag||0},a.wohnungId||""));
  const ausKat=new Set(as.map(a=>a.kategorie));
  const fx=[];
  list("fixkosten").filter(f=>f.objektId===oid&&FIX2KAT[f.kategorie]).forEach(f=>{ const kat=FIX2KAT[f.kategorie], b=fixJahr(f,y); if(!b) return; const def=!ausKat.has(kat); const on=rec.fix?.[f.id]??def; fx.push({id:f.id,kat,b,on,t:`${f.kategorie}${f.anbieter?" – "+f.anbieter:""} (laufende Kosten)`}); if(on) add(kat,b,{t:`${f.kategorie}${f.anbieter?" – "+f.anbieter:""} (laufend)`,b}); });
  const gs=st.data.objekte[oid]?.grundsteuer; const gj=gsJahr(gs);
  if(gj&&!ausKat.has("Grundsteuer")&&!fx.some(f=>f.kat==="Grundsteuer"&&f.on)){ const on=rec.gsOn??true; fx.push({id:"__gs",kat:"Grundsteuer",b:gj,on,t:"Grundsteuer laut Bescheid"}); if(on) add("Grundsteuer",gj,{t:"Grundsteuer laut Bescheid",b:gj}); }
  return {K,fx};
}
const CO2_ST=[[12,0,"unter 12"],[17,.1,"12 bis unter 17"],[22,.2,"17 bis unter 22"],[27,.3,"22 bis unter 27"],[32,.4,"27 bis unter 32"],[37,.5,"32 bis unter 37"],[42,.6,"37 bis unter 42"],[47,.7,"42 bis unter 47"],[52,.8,"47 bis unter 52"],[Infinity,.95,"52 und mehr"]];
const CO2_ART=["Gas","Heizöl","Fernwärme","Flüssiggas","Wärmepumpe / Strom","Holz / Pellets"];
function co2Calc(oid,y,K,ws){
  const rec=nkRec(oid,y), c=rec.co2||{}, HK=K["Heizung/Brennstoff"], R={aktiv:false,f:1,warn:[],c};
  if(!HK) return R; R.relevant=true;
  if(["Wärmepumpe / Strom","Holz / Pellets"].includes(c.art)){ R.frei=true; return R; }
  if(c.messdienst){ R.messdienst=true; return R; }
  const fl=ws.reduce((s,w)=>s+(+w.flaeche||0),0), kg=num(c.kg), kosten=num(c.kosten);
  if(!kg||!kosten||!fl){ R.warn.push("CO₂-Kosten fehlen (Pflicht seit 2023): kg CO₂ und CO₂-Kosten aus der Brennstoff- bzw. Versorgerrechnung eintragen – sonst dürfen Mieter ihren Heizkostenanteil um 3 % kürzen (§ 7 Abs. 4 CO2KostAufG)."); return R; }
  const kgm2=kg/fl, st0=CO2_ST.find(x=>kgm2<x[0]), pct=st0[1]*(c.halb?0.5:1);
  const key=rec.keys?.["Heizung/Brennstoff"]||NK_DEF["Heizung/Brennstoff"]||"flaeche";
  const dsum=Object.values(rec.direkt?.["Heizung/Brennstoff"]||{}).reduce((s,b)=>s+(+b||0),0);
  const Htot=(key==="direkt"?dsum:HK.haus)+Object.values(HK.direkt).reduce((s,b)=>s+b,0);
  const betragV=r2(kosten*pct), f=Htot>0?Math.max(0,1-betragV/Htot):1;
  Object.assign(R,{aktiv:true,kg,kosten,fl,kgm2,stufe:st0[2],pct,pctM:1-pct,betragV,f});
  return R;
}
function nkCalc(oid,y){
  y=String(y); const von=`${y}-01-01`, bis=`${y}-12-31`, D=days(von,bis)+1, rec=nkRec(oid,y), ws=wsOf(oid);
  const {K,fx}=nkKosten(oid,y);
  const CO=co2Calc(oid,y,K,ws); const HKx=K["Heizung/Brennstoff"];
  if(HKx&&CO.f<1){ HKx.haus=r2(HKx.haus*CO.f); Object.keys(HKx.direkt).forEach(w=>HKx.direkt[w]=r2(HKx.direkt[w]*CO.f)); }
  const P=[]; ws.forEach(w=>perioden(w.id,von,bis).forEach(p=>P.push({...p,w})));
  const flTot=ws.reduce((s,w)=>s+(+w.flaeche||0),0);
  const pTot=P.reduce((s,p)=>s+(+p.m.personen||1)*p.tage,0);
  const rows=P.map(p=>({p,anteile:[],summe:0}));
  const leer={summe:0,anteile:[]};
  const kats=Object.values(K).sort((a,b)=>KAT.indexOf(a.kat)-KAT.indexOf(b.kat));
  const warn=[...CO.warn];
  if(HKx&&(rec.keys?.["Heizung/Brennstoff"]||NK_DEF["Heizung/Brennstoff"])!=="direkt") warn.push("Heizkosten werden nicht nach Verbrauch verteilt – Mieter dürfen ihren Anteil dann um 15 % kürzen (§ 12 HeizKV). Besser: „Direkt je Wohnung“ mit den Werten vom Messdienst.");
  kats.forEach(k=>{
    const key=rec.keys?.[k.kat]||NK_DEF[k.kat]||"flaeche"; k.key=key;
    let verteilt=0;
    const share=(row,b,txt)=>{ b=r2(b); row.anteile.push({kat:k.kat,b,txt}); row.summe=r2(row.summe+b); verteilt+=b; };
    // Kosten, die schon einer Wohnung zugeordnet sind
    Object.entries(k.direkt).forEach(([wid,b])=>{ const ps=rows.filter(r=>r.p.w.id===wid); const sum=ps.reduce((s,r)=>s+r.p.tage,0); ps.forEach(r=>share(r,b*r.p.tage/D,`direkt ${wohn(wid)?.lage||wid}`)); const rest=b-b*sum/D; if(rest>0.004){ leer.anteile.push({kat:k.kat,b:r2(rest)}); leer.summe=r2(leer.summe+rest); } });
    const H=k.haus; if(!H) return;
    if(key==="flaeche"){
      if(!flTot){ warn.push(`${k.kat}: Wohnflächen fehlen – bitte bei den Wohnungen eintragen.`); }
      rows.forEach(r=>{ const f=+r.p.w.flaeche||0; if(flTot) share(r,H*f/flTot*r.p.tage/D,`${f} m² von ${flTot} m² · ${r.p.tage} Tage`); });
    } else if(key==="einheiten"){
      rows.forEach(r=>share(r,H/ws.length*r.p.tage/D,`1 von ${ws.length} Einheiten · ${r.p.tage} Tage`));
    } else if(key==="personen"){
      if(!pTot) warn.push(`${k.kat}: keine Personenzahlen.`);
      rows.forEach(r=>{ const pe=+r.p.m.personen||1; if(pTot) share(r,H*pe*r.p.tage/pTot,`${pe} Pers. · ${r.p.tage} Tage`); });
      if(rows.some(r=>!r.p.m.personen)) warn.push("Bei einigen Mietern fehlt die Personenzahl – es wird 1 Person angenommen.");
    } else if(key==="direkt"){
      const dv=rec.direkt?.[k.kat]||{}; const dsum=Object.values(dv).reduce((s,b)=>s+(+b||0),0);
      if(!dsum) warn.push(`${k.kat}: Beträge je Wohnung eintragen (z. B. aus der Heizkostenabrechnung des Messdienstes).`);
      const fk=k.kat==="Heizung/Brennstoff"?CO.f:1;
      ws.forEach(w=>{ const b=(+dv[w.id]||0)*fk; if(!b) return; const ps=rows.filter(r=>r.p.w.id===w.id); const sum=ps.reduce((s,r)=>s+r.p.tage,0); ps.forEach(r=>share(r,b*r.p.tage/D,`laut Einzelabrechnung ${w.lage||w.id}`)); const rest=b-b*sum/D; if(rest>0.004){ leer.anteile.push({kat:k.kat,b:r2(rest)}); leer.summe=r2(leer.summe+rest); } });
      if(dsum&&Math.abs(dsum*fk-H)>1) warn.push(`${k.kat}: Einzelbeträge (${eur(dsum)}) passen nicht zur Rechnung (${eur(H)}).`);
      return;
    }
    const rest=r2(H-rows.reduce((s,r)=>s+r.anteile.filter(a=>a.kat===k.kat&&!a.txt.startsWith("direkt")).reduce((x,a)=>x+a.b,0),0));
    if(rest>0.004&&key!=="personen"){ leer.anteile.push({kat:k.kat,b:rest}); leer.summe=r2(leer.summe+rest); }
  });
  // Vorauszahlungen
  rows.forEach(r=>{
    const w=r.p.w, nkM=+w.nk||0; let vz=0, mon=0;
    list("zahlungen").filter(z=>z.wohnungId===w.id&&z.monat>=r.p.von.slice(0,7)&&z.monat<=r.p.bis.slice(0,7)).forEach(z=>{ const so=+z.soll||sollOf(w.id), bz=+z.bezahlt||0; if(so>0&&nkM) vz+=Math.min(bz,so)*nkM/so; mon++; });
    r.vz=r2(vz); r.mon=mon; r.erg=r2(r.summe-r.vz);
  });
  const gesamt=r2(kats.reduce((s,k)=>s+k.haus+Object.values(k.direkt).reduce((a,b)=>a+b,0),0));
  return {y,von,bis,D,kats,fx,rows,leer,gesamt,warn,rec,co2:CO};
}
function vNK(){
  const os=objs(); if(!os.length) return finBack("nk")+emptyBox("Noch keine Häuser angelegt.");
  if(!st.nkO||!st.data.objekte[st.nkO]) st.nkO=os[0].id;
  const oid=st.nkO, y=String(st.year), R=nkCalc(oid,y), frist=`${+y+1}-12-31`;
  const keySel=k=>`<select data-nkkey="${esc(k.kat)}" aria-label="Verteilerschlüssel">${NK_KEYS.map(([v,l])=>`<option value="${v}"${v===k.key?" selected":""}>${esc(l)}</option>`).join("")}</select>`;
  return `${finBack("nk")}
  <div class="filters"><select data-change="nkO" aria-label="Haus">${os.map(o=>`<option value="${esc(o.id)}"${o.id===oid?" selected":""}>${esc(o.name||o.id)}</option>`).join("")}</select><select data-change="year" aria-label="Jahr">${yearOpts()}</select></div>
  <div class="kpis"><div class="kpi"><div class="v">${eur(R.gesamt)}</div><div class="l">Umlagefähige Kosten ${esc(y)}</div></div><div class="kpi"><div class="v">${R.rows.length}</div><div class="l">Mietzeiträume</div></div><div class="kpi ${R.leer.summe>0?"warn":""}"><div class="v">${eur(R.leer.summe)}</div><div class="l">Leerstand – trägt Vermieter</div></div><div class="kpi"><div class="v">${esc(fmtDate(frist))}</div><div class="l">Abrechnung spätestens bis</div></div></div>
  ${R.warn.length?`<div class="note warn">${R.warn.map(esc).join("<br>")}</div>`:""}
  <section class="card" style="display:flex;flex-direction:column;gap:8px"><div class="spread"><h3>Kosten & Verteilerschlüssel</h3><button class="btn sm" data-act="go" data-tab="geld" data-sub="ausgaben">Belege ›</button></div>
   ${R.kats.length?R.kats.map(k=>`<div class="nkrow"><div><b>${esc(k.kat)}</b><div class="small">${eur(k.haus+Object.values(k.direkt).reduce((a,b)=>a+b,0))} · ${k.quellen.length} Beleg${k.quellen.length>1?"e":""}</div></div>${keySel(k)}${k.key==="direkt"?`<button class="btn sm" data-act="nkDirekt" data-k="${esc(k.kat)}">Beträge je Wohnung</button>`:""}</div>`).join(""):`<div class="small">Keine umlagefähigen Kosten für ${esc(y)}. Belege mit „Umlagefähig auf Mieter“ erfassen oder laufende Kosten (Wasser, Müll, Versicherung …) anlegen.</div>`}
   ${R.fx.length?`<div class="small" style="margin-top:4px">Laufende Kosten (aus „Kredit & Kosten“) – Haken = in die Abrechnung übernehmen:</div>${R.fx.map(f=>`<label class="nkfx"><input type="checkbox" data-nkfix="${esc(f.id)}"${f.on?" checked":""}> <span>${esc(f.t)} · ${esc(f.kat)}</span><b class="num">${eur(f.b)}</b></label>`).join("")}`:""}
  </section>
  ${R.co2.relevant?co2Card(R):""}
  <section class="list"><div class="sec-title"><h2>Ergebnis je Mieter</h2><span>${R.rows.length}</span></div>
   ${R.rows.length?R.rows.map((r,i)=>{ const aus=R.rec.ausgleich?.[r.p.m.id+"_"+r.p.von]; return `<div class="item s-${r.erg>0?"warn":"ok"}"><div class="head"><div><b>${esc(r.p.m.name)}</b><div class="meta">${esc(r.p.w.lage||r.p.w.id)} · ${esc(fmtDate(r.p.von))}–${esc(fmtDate(r.p.bis))} (${r.p.tage} Tage)</div></div><div style="text-align:right"><b class="num">${r.erg>0?"Nachzahlung":"Guthaben"} ${eur(Math.abs(r.erg))}</b><div class="meta num">Kosten ${eur(r.summe)} − Vorauszahlung ${eur(r.vz)}</div></div></div>
     <div class="row"><button class="btn sm pri" data-act="nkPdf" data-i="${i}">Abrechnung (PDF)</button>${waBtn(r.p.m.telefon,nkWa(r,y),"WhatsApp")}<button class="btn sm" data-act="nkPost" data-i="${i}">Per Post</button>${aus?`<span class="pill ok">ausgeglichen ${esc(fmtDate(aus.datum))}</span>`:`<button class="btn sm ghost" data-act="nkAusgl" data-i="${i}">Als ausgeglichen markieren</button>`}</div></div>`; }).join(""):emptyBox("Keine Mieter mit Mietbeginn in diesem Jahr. Bitte beim Mieter den Mietbeginn eintragen.")}
  </section>
  <p class="small">Hinweise: Die Abrechnung muss dem Mieter spätestens 12 Monate nach Ende des Abrechnungsjahres zugehen (§ 556 Abs. 3 BGB) – für ${esc(y)} also bis ${esc(fmtDate(frist))}. Heiz- und Warmwasserkosten müssen zu 50–70 % nach Verbrauch verteilt werden (Heizkostenverordnung) – nutze dafür „Direkt je Wohnung“ mit den Werten aus der Abrechnung deines Messdienstes. Vorauszahlungen werden aus den erfassten Mieteingängen berechnet (NK-Anteil laut Wohnung). Ohne Gewähr, keine Rechtsberatung.</p>`;
}
function co2Card(R){
  const C=R.co2, c=C.c||{};
  return `<section class="card" style="display:flex;flex-direction:column;gap:8px"><div class="spread"><h3>CO₂-Kosten aufteilen</h3><button class="btn sm" data-act="co2Scan">Rechnung scannen</button></div>
  <div class="small">Pflicht seit 2023: Je schlechter das Haus gedämmt ist, desto mehr der CO₂-Kosten trägt der Vermieter (Stufenmodell CO2KostAufG). Die Werte stehen auf der Gas-/Öl-/Fernwärme-Rechnung.</div>
  <div class="fields">${fld("Heizung mit",sel("co_art",[["","– wählen –"],...CO2_ART.map(x=>[x,x])],c.art))}${fld("CO₂-Ausstoß kg (Jahr)",inp("co_kg",c.kg,"number"))}${fld("CO₂-Kosten € (Jahr)",inp("co_k",c.kosten,"number"))}</div>
  <label class="nkfx"><input type="checkbox" id="co_md"${c.messdienst?" checked":""}> <span>Messdienst (z. B. ista, Techem) hat die CO₂-Kosten schon aufgeteilt</span></label>
  <label class="nkfx"><input type="checkbox" id="co_h"${c.halb?" checked":""}> <span>Vermieteranteil halbieren (Denkmalschutz/Milieuschutz verhindert Sanierung)</span></label>
  <details><summary class="small">Keine CO₂-Angaben auf der Rechnung? Aus dem Verbrauch berechnen</summary><div class="fields" style="margin-top:8px">${fld("Verbrauch im Jahr",inp("co_v",c.verbrauch,"number"))}${fld("Einheit",sel("co_e",[["kwhHs","kWh Gas (wie auf der Rechnung, Brennwert)"],["kwhHi","kWh (Heizwert)"],["l","Liter Heizöl"]],c.einheit||"kwhHs"))}${fld("CO₂-Preis € je Tonne (2026: 55–65)",inp("co_p",c.preis??55,"number"))}</div><div class="row"><button class="btn sm" id="co_calc">Berechnen</button><span class="small">Emissionsfaktoren nach EBeV: Erdgas 0,201 kg/kWh (Heizwert), Heizöl 2,68 kg/Liter; Kosten inkl. 19 % USt.</span></div></details>
  <div class="row"><button class="btn sm pri" id="co_save">Speichern</button>${c.kg?`<button class="btn sm ghost" data-act="co2Scan" data-add="1">Weitere Rechnung dazurechnen</button>`:""}</div>
  ${C.aktiv?`<div class="note info">${esc(C.kgm2.toFixed(1).replace(".",","))} kg CO₂/m² · Stufe „${esc(C.stufe)}“ → Vermieter ${Math.round(C.pct*100)} %, Mieter ${Math.round(C.pctM*100)} %. Vom Heizungsbetrag werden ${eur(C.betragV)} abgezogen und von dir getragen.</div>`:C.frei?`<div class="small">Keine CO₂-Aufteilung nötig (kein fossiler Brennstoff).</div>`:C.messdienst?`<div class="small">Aufteilung macht der Messdienst – nichts weiter zu tun.</div>`:""}</section>`;
}
function nkWa(r,y){ return `Hallo ${r.p.m.name},\n\nanbei die Betriebskostenabrechnung ${y} für Ihre Wohnung (${r.p.w.lage||""}).\n\nKosten: ${eur(r.summe)}\nIhre Vorauszahlungen: ${eur(r.vz)}\n${r.erg>0?`Nachzahlung: ${eur(r.erg)} – bitte innerhalb von 30 Tagen überweisen.`:`Guthaben: ${eur(-r.erg)} – ich überweise es Ihnen bzw. verrechne es mit der nächsten Miete.`}\n\nDie Abrechnung als PDF schicke ich Ihnen mit. Die Belege können Sie gern einsehen.\n\nViele Grüße\n${st.cfg?.name||""}`; }
function nkPdfBlob(oid,y,r){
  const {jsPDF}=window.jspdf; const d=new jsPDF({unit:"mm",format:"a4"}); pdfSafe(d); const c=st.cfg||{}, o=st.data.objekte[oid]||{};
  jhLogo(d,170,14,18,20.6);
  d.setFont("helvetica","normal"); d.setFontSize(8.5); d.setTextColor(90); d.text([c.name,c.adresse].filter(Boolean).join(" · ")||"",20,40);
  d.setTextColor(0); d.setFontSize(11); d.text(addrLines(r.p.m),20,48);
  d.text(`${c.ort||""}${c.ort?", ":""}${fmtDate(today())}`,190,80,{align:"right"});
  d.setFont("helvetica","bold"); d.text(`Betriebskostenabrechnung ${y}`,20,92); d.setFont("helvetica","normal"); d.setFontSize(10);
  let yy=100; const line=(t,b,bold)=>{ if(yy>270){ d.addPage(); yy=20; } if(bold) d.setFont("helvetica","bold"); d.text(d.splitTextToSize(t,130),20,yy); if(b!=null) d.text(b,190,yy,{align:"right"}); if(bold) d.setFont("helvetica","normal"); yy+=Math.max(5.5,d.splitTextToSize(t,130).length*5); };
  d.text(d.splitTextToSize(`Sehr geehrte/r ${r.p.m.name}, für Ihre Wohnung ${[o.adresse,r.p.w.lage].filter(Boolean).join(", ")} rechne ich die Betriebskosten für den Zeitraum ${fmtDate(r.p.von)} bis ${fmtDate(r.p.bis)} (${r.p.tage} Tage) wie folgt ab:`,170),20,yy); yy+=14;
  d.setFontSize(9); d.setTextColor(90); d.text("Kostenart · Verteilung",20,yy); d.text("Ihr Anteil",190,yy,{align:"right"}); d.setTextColor(0); yy+=5; d.line(20,yy-3,190,yy-3);
  const R=nkCalc(oid,y);
  r.anteile.forEach(a=>{ const k=R.kats.find(x=>x.kat===a.kat); const ges=k?eur(k.haus+Object.values(k.direkt).reduce((s,b)=>s+b,0)):""; line(`${a.kat} (gesamt ${ges}) – ${(NK_KEYS.find(x=>x[0]===k?.key)||["",""])[1]}: ${a.txt}`,eur(a.b)); });
  d.setFontSize(10); yy+=2; d.line(20,yy-3,190,yy-3);
  line("Summe Ihrer Betriebskosten",eur(r.summe),true);
  line(`abzüglich Ihrer Vorauszahlungen (${r.mon} Monate)`,"− "+eur(r.vz));
  line(r.erg>0?"Nachzahlung":"Guthaben",eur(Math.abs(r.erg)),true); yy+=4;
  if(R.co2?.aktiv&&r.anteile.some(a=>a.kat==="Heizung/Brennstoff")){ d.setFontSize(9); line(`CO2-Kosten (CO2KostAufG): Ausstoß des Gebäudes ${R.co2.kgm2.toFixed(1).replace(".",",")} kg CO2/m² und Jahr, Stufe "${R.co2.stufe}". Aufteilung: Mieter ${Math.round(R.co2.pctM*100)} %, Vermieter ${Math.round(R.co2.pct*100)} %. CO2-Kosten gesamt ${eur(R.co2.kosten)}, davon trägt der Vermieter ${eur(R.co2.betragV)}; dieser Betrag ist in den Heizkosten oben bereits abgezogen.`); d.setFontSize(10); yy+=2; }
  else if(R.co2?.messdienst&&r.anteile.some(a=>a.kat==="Heizung/Brennstoff")){ d.setFontSize(9); line("Die Aufteilung der CO2-Kosten nach CO2KostAufG ist in der beigefügten Heizkostenabrechnung des Messdienstes ausgewiesen."); d.setFontSize(10); yy+=2; }
  const bank=(typeof bankLine==="function"?bankLine():"").trim();
  d.text(d.splitTextToSize(r.erg>0?`Bitte überweisen Sie die Nachzahlung innerhalb von 30 Tagen nach Zugang dieser Abrechnung.${bank?" "+bank:""}`:`Das Guthaben überweise ich Ihnen bzw. verrechne es mit der nächsten Mietzahlung.`,170),20,yy); yy+=12;
  d.text(d.splitTextToSize("Sie können die Belege zu dieser Abrechnung nach Absprache gern einsehen. Einwendungen gegen die Abrechnung teilen Sie mir bitte spätestens bis zum Ablauf des zwölften Monats nach Zugang mit (§ 556 Abs. 3 BGB).",170),20,yy); yy+=16;
  d.text(["Mit freundlichen Grüßen","",c.name||""],20,yy);
  return d.output("blob");
}

/* =========================================================
   2) WARTUNGSPLAN
   ========================================================= */
const WT_STD=[
 ["Heizungswartung (Fachbetrieb)",12,"Technik","Ideal im Spätsommer vor der Heizperiode."],
 ["Schornsteinfeger / Feuerstättenschau",12,"Technik","Termin kommt meist vom Bezirksschornsteinfeger – Kosten sind umlagefähig."],
 ["Rauchmelder prüfen",12,"Sicherheit","In NRW Pflicht in Schlaf-, Kinderzimmern und Fluren. Wartung jährlich; wer zuständig ist, regelt der Mietvertrag."],
 ["Dachrinnen und Fallrohre reinigen",12,"Außen","Nach dem Laubfall im Spätherbst."],
 ["Außenwasserhähne entleeren (Frostschutz)",12,"Außen","Vor dem ersten Frost im Oktober/November."],
 ["Treppenhaus- und Außenbeleuchtung prüfen",6,"Sicherheit","Verkehrssicherungspflicht – vor allem im Winter."],
 ["Feuerlöscher prüfen (falls vorhanden)",24,"Sicherheit","Prüfung alle 2 Jahre durch Fachbetrieb."],
 ["Elektro-Check (E-Check)",48,"Technik","Empfohlen alle 4 Jahre bei Mietwohnungen."],
 ["Garten: Hecke und Bäume schneiden",12,"Außen","Großer Rückschnitt nur 1.10.–28.2. (Naturschutz)."],
 ["Legionellenprüfung Trinkwasser",36,"Technik","Nur Pflicht bei Großanlage (Speicher über 400 l oder über 3 l Leitungsinhalt) mit Duschen in vermieteten Wohnungen."]
];
const SAISON={0:["Streupflicht bei Glätte: Wege früh räumen (Hausordnung/Hausmeister).","Heizungsdruck prüfen, Mieter an richtiges Lüften erinnern (Schimmel)."],1:["Hecken-Rückschnitt nur noch bis 28.2. erlaubt.","Streusalz-Vorrat prüfen."],2:["Dachrinnen und Dach nach dem Winter auf Schäden prüfen.","Außenwasserhähne wieder öffnen, wenn kein Frost mehr kommt."],3:["Garten startklar machen, Rasenmäher warten.","Kehrwochen-Plan und Gartenregeln an die Mieter senden."],4:["Fassade und Fenster außen auf Schäden prüfen.","Nebenkostenabrechnung des Vorjahres – Frist bis 31.12. im Blick behalten."],5:["Sommer: Mieter an Lüften bei Hitze und Gießen im Garten erinnern."],6:["Gute Zeit für Malerarbeiten außen und Reparaturen am Dach."],7:["Heizungswartung vor der Heizperiode beauftragen."],8:["Heizung vor dem Winter testen, Heizkörper entlüften lassen.","Dachrinnen-Reinigung nach dem Laubfall einplanen."],9:["Außenwasserhähne entleeren, bevor der erste Frost kommt.","Streusalz und Schneeschieber bereitstellen."],10:["Dachrinnen und Fallrohre vom Laub befreien.","Beleuchtung in Treppenhaus und Eingang prüfen (früh dunkel)."],11:["Frostschutz: unbeheizte Räume, Keller und Garagen prüfen.","Nebenkostenabrechnung des Vorjahres muss bis 31.12. beim Mieter sein."]};
function wtNext(t){ return t.naechste||(t.letzte?addM(t.letzte,+t.intervall||12):today()); }
function wtState(t){ const n=wtNext(t), dd=days(today(),n); return {n,dd,c:dd<0?"bad":dd<=30?"warn":"ok",txt:dd<0?`überfällig seit ${-dd} Tagen`:dd===0?"heute fällig":dd<=30?`fällig in ${dd} Tagen`:`nächstes Mal ${fmtDate(n)}`}; }
function garantien(oid){
  const out=[];
  list("inventar").filter(x=>(!oid||x.objektId===oid)&&x.kaufdatum).forEach(x=>{ const bis=addM(x.kaufdatum,12*(+x.garantieJahre||2)); out.push({t:x.name||"Gegenstand",bis,q:"Inventar",oid:x.objektId}); });
  list("ausgaben").filter(a=>(!oid||a.objektId===oid)&&a.datum&&["Möbel/Ausstattung","Reparatur/Handwerker"].includes(a.kategorie)&&(+a.betrag||0)>=50).forEach(a=>{ const bis=addM(a.datum,a.kategorie==="Reparatur/Handwerker"?60:24); out.push({t:`${a.beschreibung||a.haendler||a.kategorie}${a.haendler?" ("+a.haendler+")":""}`,bis,q:a.kategorie==="Reparatur/Handwerker"?"Handwerker (5 J. bei Bauwerk)":"Kauf (2 J. Gewährleistung)",oid:a.objektId}); });
  return out.filter(g=>g.bis>=today()).sort((a,b)=>a.bis.localeCompare(b.bis));
}
function vWartung(oid){
  const ts=list("wartung").filter(t=>t.objektId===oid).map(t=>({t,s:wtState(t)})).sort((a,b)=>a.s.n.localeCompare(b.s.n));
  const g=garantien(oid), mo=new Date().getMonth();
  return `<div class="row"><button class="btn pri" data-act="wtNew" data-o="${esc(oid)}">Aufgabe hinzufügen</button>${ts.length?"":`<button class="btn" data-act="wtStd" data-o="${esc(oid)}">Standard-Aufgaben anlegen</button>`}</div>
  <section class="card"><h3>Jetzt in der Jahreszeit (${esc(MONATE[mo])})</h3><ul class="small" style="margin:6px 0 0;padding-inline-start:18px">${(SAISON[mo]||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>
  <section class="list"><div class="sec-title"><h2>Wartung & Prüfungen</h2><span>${ts.length}</span></div>
  ${ts.length?ts.map(({t,s})=>`<div class="item s-${s.c}"><div class="head"><div><b>${esc(t.titel)}</b><div class="meta">alle ${esc(t.intervall)} Monate${t.letzte?` · zuletzt ${esc(fmtDate(t.letzte))}`:""}${t.firma?` · ${esc(t.firma)}`:""}</div>${t.notiz?`<div class="small">${esc(t.notiz)}</div>`:""}</div><span class="pill ${s.c}">${esc(s.txt)}</span></div>
   <div class="row"><button class="btn sm pri" data-act="wtDone" data-id="${esc(t.id)}">Erledigt</button><button class="btn sm" data-act="wtKosten" data-id="${esc(t.id)}">Kosten erfassen</button><button class="btn sm ghost" data-act="wtEdit" data-id="${esc(t.id)}">Bearbeiten</button></div></div>`).join(""):emptyBox("Noch kein Wartungsplan. Tipp: „Standard-Aufgaben anlegen“ – Heizung, Schornsteinfeger, Rauchmelder, Dachrinne, Frostschutz u. a.")}
  </section>
  <section class="list"><div class="sec-title"><h2>Garantie & Gewährleistung</h2><span>${g.length}</span></div>
  ${g.length?g.slice(0,12).map(x=>{ const dd=days(today(),x.bis); return `<div class="item s-${dd<=60?"warn":"neutral"}"><div class="head"><div><b>${esc(x.t)}</b><div class="meta">${esc(x.q)}</div></div><span class="pill ${dd<=60?"warn":"neutral"}">bis ${esc(fmtDate(x.bis))}</span></div></div>`; }).join(""):emptyBox("Keine laufenden Fristen. Fristen entstehen automatisch aus Inventar (Kaufdatum) und Belegen für Möbel/Ausstattung und Handwerker.")}
  <p class="small">Gesetzliche Gewährleistung: 2 Jahre bei Kauf, 5 Jahre bei Arbeiten am Bauwerk (§ 634a BGB). Herstellergarantien können länger sein – im Inventar „Garantie Jahre“ eintragen.</p></section>`;
}
function wtForm(id,oid){
  const t=id?st.data.wartung[id]:{objektId:oid,intervall:12};
  openSheet(`<div class="spread"><h2>${id?"Aufgabe bearbeiten":"Neue Wartungsaufgabe"}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>
  <div class="fields">${fld("Was?",inp("wt_t",t.titel,"text","z. B. Heizungswartung"),1)}${fld("Alle … Monate",inp("wt_i",t.intervall,"number"))}${fld("Zuletzt erledigt",inp("wt_l",t.letzte,"date"))}${fld("Nächster Termin (leer = automatisch)",inp("wt_n",t.naechste,"date"))}${fld("Firma / zuständig",inp("wt_f",t.firma),0)}${fld("Notiz",inp("wt_no",t.notiz),1)}</div>
  <div class="row end">${id?`<button class="btn danger" id="wt_x">Löschen</button>`:""}<button class="btn" data-act="close">Abbrechen</button><button class="btn pri" id="wt_ok">Speichern</button></div>`);
  $("#wt_ok").onclick=async()=>{ const ti=val("wt_t"); if(!ti){ toast("Bitte eintragen, was zu tun ist"); return; } const d={...t,titel:ti,intervall:nval("wt_i")||12,letzte:val("wt_l"),naechste:val("wt_n"),firma:val("wt_f"),notiz:val("wt_no")}; delete d.id; try{ await dbSet("wartung",id||newId("wt"),d); closeSheet(); toast("Gespeichert"); render(); }catch(e){ toast("Speichern fehlgeschlagen"); } };
  const x=$("#wt_x"); if(x) x.onclick=async()=>{ if(!await ask("Aufgabe löschen?","Löschen")) return; await st.db.collection("wartung").doc(id).delete(); closeSheet(); toast("Gelöscht"); };
}

/* =========================================================
   3) HAUSBEGEHUNG
   ========================================================= */
const BG_LISTE=[
 ["Außen",["Dach (Ziegel, Moos, sichtbare Schäden)","Dachrinnen und Fallrohre","Fassade und Putz (Risse, Feuchte)","Fenster und Rollläden von außen","Hauseingang, Haustür, Schloss","Klingel- und Briefkastenanlage","Außenbeleuchtung","Wege, Treppen, Stolperstellen","Mülltonnenplatz","Garten, Bäume, Zaun"]],
 ["Treppenhaus",["Beleuchtung und Lichtschalter","Geländer und Handlauf fest","Wände, Boden, Stufen","Fluchtweg frei (nichts abgestellt)","Rauchmelder im Flur (falls vorhanden)"]],
 ["Keller & Dachboden",["Feuchtigkeit, Schimmel, Geruch","Wasserleitungen, Absperrhähne","Zähler zugänglich und lesbar","Fenster und Lichtschächte","Ordnung (Sperrmüll, Brandlast)"]],
 ["Technik",["Heizung: Druck, Fehlermeldungen, Geräusche","Warmwasser","Sicherungskasten, FI-Schalter","Lüftung / Abluft"]]
];
let BG=null;
function vBegehung(oid){
  const bs=list("begehungen").filter(b=>b.objektId===oid).sort((a,b)=>String(b.datum).localeCompare(String(a.datum)));
  return `<div class="row"><button class="btn pri" data-act="bgNew" data-o="${esc(oid)}">Neue Begehung starten</button></div>
  <p class="small">Geh Punkt für Punkt durchs Haus: OK oder Mangel antippen, bei Mängeln Foto und Notiz. Am Ende werden aus allen Mängeln automatisch Tickets und ein PDF-Bericht.</p>
  <div class="list">${bs.length?bs.map(b=>{ const mg=(b.punkte||[]).filter(p=>p.s==="mangel").length; return `<div class="item tap" data-act="bgOpen" data-id="${esc(b.id)}" role="button" tabindex="0"><div class="head"><div><b>Begehung ${esc(fmtDate(b.datum))}</b><div class="meta">${(b.punkte||[]).filter(p=>p.s).length} von ${(b.punkte||[]).length} Punkten geprüft${b.status==="Abgeschlossen"?" · abgeschlossen":" · in Arbeit"}</div></div>${mg?`<span class="pill bad">${mg} Mängel</span>`:`<span class="pill ok">ohne Mängel</span>`}</div></div>`; }).join(""):emptyBox("Noch keine Begehung. Empfehlung: 1–2 × im Jahr (Frühjahr und Herbst).")}</div>`;
}
function bgOpen(oid,id){
  const b=id?JSON.parse(JSON.stringify(st.data.begehungen[id])):{id:newId("bg"),objektId:oid,datum:today(),status:"In Arbeit",punkte:BG_LISTE.flatMap(([g,ps])=>ps.map(p=>({g,p,s:"",n:"",w:"",foto:""})))};
  BG={b,pend:{}}; bgRender();
}
function bgRender(){
  const b=BG.b, ws=wsOf(b.objektId), done=b.punkte.filter(p=>p.s).length;
  openSheet(`<div class="spread"><h2>Begehung ${esc(objName(b.objektId))}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>
  <div class="small">${done} von ${b.punkte.length} Punkten · ${esc(fmtDate(b.datum))}</div>
  ${BG_LISTE.map(([g])=>`<section class="card bgsec"><h3>${esc(g)}</h3>${b.punkte.map((p,i)=>p.g!==g?"":`<div class="bgp s-${p.s||"x"}"><div class="bgl">${esc(p.p)}</div><div class="bgb"><button data-bgs="${i}" data-v="ok" aria-pressed="${p.s==="ok"}">OK</button><button data-bgs="${i}" data-v="mangel" aria-pressed="${p.s==="mangel"}">Mangel</button><button data-bgs="${i}" data-v="na" aria-pressed="${p.s==="na"}">–</button></div>
   ${p.s==="mangel"?`<div class="bgm"><input data-bgn="${i}" type="text" placeholder="Was ist los?" value="${esc(p.n)}"><select data-bgw="${i}" aria-label="Betrifft"><option value="">Gemeinschaft / Haus</option>${ws.map(w=>`<option value="${esc(w.id)}"${w.id===p.w?" selected":""}>${esc(w.lage||w.id)}</option>`).join("")}</select><label class="btn sm">${typeof CAMSVG!=="undefined"?CAMSVG:""}<span>${p.foto||BG.pend[i]?"Foto ✓":"Foto"}</span><input class="hide" type="file" accept="image/*" capture="environment" data-bgf="${i}"></label>${p.ticket?`<span class="pill neutral">Ticket ${esc(p.ticket)}</span>`:""}</div>`:""}</div>`).join("")}</section>`).join("")}
  <div class="row end">${b.status==="Abgeschlossen"?`<button class="btn" id="bg_pdf">Bericht (PDF)</button>`:""}<button class="btn" id="bg_save">Zwischenspeichern</button><button class="btn pri" id="bg_fin">Abschließen → Tickets + PDF</button></div>`);
  const S=$("#sheet");
  S.querySelectorAll("[data-bgs]").forEach(x=>x.onclick=()=>{ const p=b.punkte[+x.dataset.bgs]; p.s=p.s===x.dataset.v?"":x.dataset.v; const y=S.scrollTop; bgRender(); $("#sheet").scrollTop=y; });
  S.querySelectorAll("[data-bgn]").forEach(x=>x.oninput=()=>{ b.punkte[+x.dataset.bgn].n=x.value; });
  S.querySelectorAll("[data-bgw]").forEach(x=>x.onchange=()=>{ b.punkte[+x.dataset.bgw].w=x.value; });
  S.querySelectorAll("[data-bgf]").forEach(x=>x.onchange=async()=>{ const f=x.files[0]; if(!f) return; BG.pend[+x.dataset.bgf]=await compress(f); const y=S.scrollTop; bgRender(); $("#sheet").scrollTop=y; });
  const bp=$("#bg_pdf"); if(bp) bp.onclick=async()=>saveFile(`Begehung_${(objName(b.objektId)||"Haus").replace(/\s+/g,"_")}_${b.datum}.pdf`,await bgPdf(b));
  $("#bg_save").onclick=()=>bgSave(false); $("#bg_fin").onclick=()=>bgSave(true);
}
async function bgSave(fin){
  const b=BG.b; const btn=$(fin?"#bg_fin":"#bg_save"); if(btn){ btn.disabled=true; btn.textContent="Speichert …"; }
  try{
    for(const i in BG.pend){ if(st.assets) b.punkte[i].foto=(await st.assets.upload(BG.pend[i])).id; } BG.pend={};
    let n=0;
    if(fin){
      const ws=wsOf(b.objektId);
      for(const p of b.punkte){ if(p.s!=="mangel"||p.ticket) continue; const wid=p.w||ws[0]?.id; if(!wid) continue;
        const nr=nextNr(), tid="sch-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6), now=new Date().toISOString();
        await st.db.collection("schaeden").doc(tid).set({nr,datum:today(),wohnungId:wid,beschreibung:`${p.w?"":"[Haus/Gemeinschaft] "}${p.g}: ${p.p}${p.n?" – "+p.n:""}`,status:"Gemeldet",prio:"Normal",quelle:"Selbst festgestellt",gemeldetVon:"Hausbegehung",fotoAsset:p.foto||null,geaendert:now,verlauf:[{t:now,text:`Ticket eröffnet – Hausbegehung ${fmtDate(b.datum)}`}]});
        st.data.schaeden[tid]={id:tid,nr}; p.ticket="#"+nr; n++; }
      b.status="Abgeschlossen";
    }
    const {id,...d}=b; await dbSet("begehungen",id,d);
    if(fin){ closeSheet(); BG=null; render(); toast(n?`${n} Ticket${n>1?"s":""} erstellt – Bericht wird erstellt …`:"Begehung abgeschlossen – Bericht wird erstellt …"); try{ const pdf=await bgPdf(b); await saveFile(`Begehung_${(objName(b.objektId)||"Haus").replace(/\s+/g,"_")}_${b.datum}.pdf`,pdf); }catch(e){ console.error(e); toast("Bericht konnte nicht erstellt werden"); } }
    else { toast("Zwischengespeichert"); if(btn){ btn.disabled=false; btn.textContent="Zwischenspeichern"; } }
  }catch(e){ console.error(e); toast("Speichern fehlgeschlagen"); if(btn){ btn.disabled=false; btn.textContent=fin?"Abschließen → Tickets + PDF":"Zwischenspeichern"; } }
}
async function bgPdf(b){
  const {jsPDF}=window.jspdf; const d=new jsPDF({unit:"mm",format:"a4"}); pdfSafe(d); const o=st.data.objekte[b.objektId]||{};
  jhLogo(d,172,10,16,18.3);
  d.setFont("helvetica","bold"); d.setFontSize(16); d.text("Bericht Hausbegehung",20,22); d.setFont("helvetica","normal"); d.setFontSize(10);
  d.text([`${o.name||""}${o.adresse?" – "+o.adresse:""}`,`Datum: ${fmtDate(b.datum)} · geprüft von: ${st.cfg?.name||""}`],20,30);
  let y=44; const mg=b.punkte.filter(p=>p.s==="mangel");
  d.setFont("helvetica","bold"); d.text(`Ergebnis: ${mg.length} Mängel, ${b.punkte.filter(p=>p.s==="ok").length} Punkte in Ordnung`,20,y); d.setFont("helvetica","normal"); y+=8;
  for(const [g] of BG_LISTE){ if(y>265){ d.addPage(); y=20; } d.setFont("helvetica","bold"); d.text(g,20,y); d.setFont("helvetica","normal"); y+=6;
    for(const p of b.punkte.filter(p=>p.g===g)){ const st2=p.s==="ok"?"OK":p.s==="mangel"?"MANGEL":p.s==="na"?"–":"nicht geprüft"; const t=d.splitTextToSize(`${p.p}${p.n?" – "+p.n:""}${p.w?` (${wohn(p.w)?.lage||p.w})`:""}${p.ticket?` · Ticket ${p.ticket}`:""}`,140); if(y+t.length*5>280){ d.addPage(); y=20; } d.text(t,24,y); if(p.s==="mangel") d.setFont("helvetica","bold"); d.text(st2,190,y,{align:"right"}); d.setFont("helvetica","normal"); y+=t.length*5+1.5; } y+=3; }
  for(const p of mg.filter(p=>p.foto)){ try{ const r=await fetch(assetUrl(p.foto)); const du=await blobToDataUrl(await compress(await r.blob(),1000)); const im=new Image(); im.src=du; await im.decode(); const h=Math.min(90,80*im.naturalHeight/im.naturalWidth), w=h*im.naturalWidth/im.naturalHeight; if(y+h+10>279){ d.addPage(); y=20; } d.setFontSize(9); d.text(d.splitTextToSize(`${p.p}${p.n?" – "+p.n:""}`,170),20,y); y+=4; d.addImage(du,"JPEG",20,y,w,h); y+=h+6; d.setFontSize(10); }catch(e){} }
  return d.output("blob");
}

/* =========================================================
   4) KI-ERSTANTWORT BEI SCHADENSMELDUNG (Mieter)
   ========================================================= */
async function kiSchaden(it,foto){
  if(!st.sample||window.__jhVoice||st.preview) return true;
  const sh=$("#sheet"); const btns=sh&&sh.querySelector(".row.end"); if(!btns) return true;
  let box=document.getElementById("kiErst"); if(!box){ box=document.createElement("div"); box.id="kiErst"; btns.insertAdjacentElement("beforebegin",box); }
  box.innerHTML=`<div class="ai"><span class="spin"></span><span>${esc(tr("KI schaut sich deine Meldung an …"))}</span></div>`;
  const L=(typeof LANGS!=="undefined"&&LANGS.find(x=>x[0]===st.lang)?.[1])||"Deutsch";
  const r=await aiJson(`Ein Mieter in Deutschland meldet einen Schaden in seiner Mietwohnung: "${String(it.text||"").replace(/"/g,"'")}"${foto?" (Foto anbei)":""}.
Antworte nur mit JSON: {"notfall":true/false,"sofort":"was JETZT zur Sicherheit zu tun ist oder leer","dringend":true/false,"tipp":"einfache, ungefährliche Selbsthilfe, die ein Laie machen darf, oder leer","selbstLoesbar":true/false,"fragen":["max. 2 kurze Rückfragen, die dem Vermieter helfen"],"kategorie":"Sanitär|Heizung|Elektro|Fenster/Türen|Schimmel/Feuchte|Schloss/Schlüssel|Sonstiges"}
Notfall = Gasgeruch, Wasser läuft unkontrolliert, Brand/Rauch, Strom an Wasser, Einsturzgefahr. Bei Gasgeruch: kein Licht schalten, Fenster auf, Haus verlassen, 112 bzw. Gasversorger anrufen. Keine Elektro- oder Gasarbeiten als Tipp. Schreibe die Texte in dieser Sprache: ${L}.`,foto?[foto]:null);
  if(r.err||!r.v){ box.remove(); return true; }
  const v=r.v, p=pm(), tel=p?.vermieter?.telefon;
  return await new Promise(res=>{
    box.innerHTML=`<section class="card" style="display:flex;flex-direction:column;gap:8px">
      ${v.notfall?`<div class="note bad"><b>${esc(tr("Notfall"))}:</b> ${esc(v.sofort||"")}<div class="row" style="margin-top:6px"><a class="btn sm pri" href="tel:112">112</a>${tel?`<a class="btn sm" href="tel:${esc(tel)}">${esc(tr("Vermieter anrufen"))}</a>`:""}</div></div>`:(v.sofort?`<div class="note warn">${esc(v.sofort)}</div>`:"")}
      ${v.tipp?`<div><b>${esc(tr("Tipp"))}:</b> ${esc(v.tipp)}<div class="small">${esc(tr("KI-Hinweis ohne Gewähr – im Zweifel nichts selbst reparieren und auf den Vermieter warten."))}</div></div>`:""}
      ${(v.fragen||[]).slice(0,2).map((q,i)=>`<div class="field full"><label for="kiQ${i}">${esc(q)}</label><input id="kiQ${i}" type="text"></div>`).join("")}
      <div class="row end">${v.selbstLoesbar&&!v.notfall?`<button class="btn" id="kiOk">${esc(tr("Hat geholfen – nicht senden"))}</button>`:""}<button class="btn pri" id="kiSend">${esc(tr("Jetzt senden"))}</button></div></section>`;
    btns.classList.add("hide");
    const ok=$("#kiOk"); if(ok) ok.onclick=()=>{ closeSheet(); toast(tr("Super – nichts gesendet.")); res(false); };
    $("#kiSend").onclick=()=>{ const ans=(v.fragen||[]).slice(0,2).map((q,i)=>{ const a=val("kiQ"+i); return a?`${q} ${a}`:""; }).filter(Boolean); if(ans.length) it.text=`${it.text}\n${ans.join("\n")}`; if(v.dringend||v.notfall) it.dringend=true; it.kiKat=v.kategorie||""; if(v.tipp) it.kiTipp=String(v.tipp).slice(0,200); btns.classList.remove("hide"); box.innerHTML=`<div class="small">${esc(tr("Wird gesendet …"))}</div>`; res(true); };
  });
}

/* =========================================================
   5) ZAHLUNGS-FRÜHWARNUNG
   ========================================================= */
function zahlTrend(m){
  const cym=curYm();
  const zs=list("zahlungen").filter(z=>z.wohnungId===m.wohnungId&&(!m.beginn||z.monat>=m.beginn.slice(0,7))&&z.monat<=cym).sort((a,b)=>a.monat.localeCompare(b.monat)).slice(-6);
  const pts=zs.map(z=>{ const so=+z.soll||0, bz=+z.bezahlt||0; let d=null; if(z.eingang) d=days(`${z.monat}-03`,z.eingang); else if(bz<so&&z.monat<cym) d=30; return {z,d,teil:bz>0&&bz<so-0.5,offen:bz<=0&&so>0&&(z.monat<cym||new Date().getDate()>3)}; });
  const last3=pts.slice(-3), prev=pts.slice(-6,-3);
  const late=last3.filter(p=>(p.d!=null&&p.d>0)||p.offen).length, teil=last3.filter(p=>p.teil).length;
  const av=a=>{ const x=a.filter(p=>p.d!=null); return x.length?x.reduce((s,p)=>s+p.d,0)/x.length:null; };
  const aR=av(last3), aP=av(prev);
  const steig=aR!=null&&aP!=null&&aR-aP>=4&&aR>0;
  const warn=pts.length>=3&&(late>=2||teil>=2||steig);
  const txt=late>=2?`${late} der letzten 3 Mieten zu spät`:teil>=2?`${teil} der letzten 3 Mieten nur teilweise`:steig?`zahlt zunehmend später (Ø ${Math.round(aR)} Tage nach dem 3.)`:"";
  return {pts,warn,txt,aR};
}
function trendChart(T){
  if(!T.pts.length) return `<div class="small">Noch keine Mieteingänge.</div>`;
  const mx=Math.max(10,...T.pts.map(p=>p.d||0));
  return `<div class="ztrend">${T.pts.map(p=>{ const d=p.d; const h=d==null?4:Math.max(4,Math.min(100,(Math.max(0,d)+2)/(mx+2)*100)); const c=p.offen?"bad":d!=null&&d>0?"warn":"ok"; return `<div class="zt"><div class="zb ${c}" style="height:${h}%" title="${esc(fmtYm(p.z.monat))}: ${d==null?"–":d<=0?"pünktlich":d+" Tage zu spät"}"></div><span>${esc(fmtYm(p.z.monat).slice(0,3))}</span></div>`; }).join("")}</div><div class="small">Balken = Tage nach dem 3. des Monats (je höher, desto später).</div>`;
}

/* =========================================================
   6) MIETE ANPASSEN
   ========================================================= */
function mietCalc(m){
  const w=wohn(m.wohnungId)||{}, o=st.data.objekte[w.objektId]||{};
  const kalt=num(m.kalt)??num(w.kalt), fl=num(w.flaeche), ms=num(o.mietspiegel), kap=o.kappung15?0.15:0.20, art=m.mietart||"Standard";
  const last=m.letzteErhoehung||m.beginn||null, t=today();
  const R={m,w,o,kalt,fl,ms,kap,art,last,ok:false,neu:null,info:[],warn:[]};
  if(!kalt){ R.warn.push("Kaltmiete fehlt beim Mieter bzw. der Wohnung."); return R; }
  const zug=t; const zd=dParse(zug);
  if(art==="Staffel"){ R.info.push("Staffelmiete: Erhöhungen stehen fest im Vertrag – eine Erhöhung nach Mietspiegel oder Index ist während der Staffel ausgeschlossen (§ 557a BGB)."); return R; }
  if(art==="Index"){
    const vpi=num(st.markt?.vpi), basis=num(m.vpiBasis);
    if(!basis) R.warn.push("Index-Stand bei der letzten Anpassung (bzw. bei Vertragsbeginn) beim Mieter eintragen.");
    if(!vpi) R.warn.push("Aktuellen Verbraucherpreisindex oben eintragen.");
    const ab=last?addM(last,12):null; R.frueh=ab;
    if(ab&&ab>t) R.warn.push(`Die Miete muss mindestens 1 Jahr unverändert sein – Erklärung frühestens ab ${fmtDate(ab)} (§ 557b BGB).`);
    if(vpi&&basis){ R.neu=r2(kalt*vpi/basis); R.vpi=vpi; R.basis=basis; R.aend=vpi/basis-1; R.wirksam=dStr(new Date(zd.getFullYear(),zd.getMonth()+2,1,12)); R.ok=R.neu>kalt&&!(ab&&ab>t); if(R.neu<=kalt) R.info.push("Der Index ist nicht gestiegen – keine Erhöhung."); }
    return R;
  }
  const seit3=addM(t,-36);
  const erh=(m.erhoehungen||[]).filter(e=>e.datum>=seit3).sort((a,b)=>a.datum.localeCompare(b.datum));
  const basis3=erh.length?num(erh[0].alt):kalt; R.basis3=basis3;
  const maxKap=r2(basis3*(1+kap)); R.maxKap=maxKap;
  const maxMS=ms&&fl?r2(ms*fl):null; R.maxMS=maxMS;
  if(!ms) R.warn.push("Ortsübliche Vergleichsmiete (€/m², z. B. aus dem Mietspiegel) beim Haus eintragen – sie ist die Obergrenze und Begründung.");
  if(!fl) R.warn.push("Wohnfläche bei der Wohnung eintragen.");
  const frueh=last?addM(last,12):null; R.frueh=frueh;
  if(frueh&&frueh>t) R.warn.push(`Erhöhungsverlangen frühestens ab ${fmtDate(frueh)} (1 Jahr nach Einzug bzw. letzter Erhöhung).`);
  let wirk=dStr(new Date(zd.getFullYear(),zd.getMonth()+3,1,12)); const s15=last?addM(last,15):null; if(s15&&s15>wirk) wirk=s15; R.wirksam=wirk;
  R.frist=dStr(new Date(zd.getFullYear(),zd.getMonth()+3,0,12));
  const ziel=maxMS!=null?Math.min(maxMS,maxKap):null;
  if(ziel!=null){ R.neu=r2(Math.floor(ziel*100)/100); R.ok=R.neu>kalt+0.5&&!(frueh&&frueh>t); if(R.neu<=kalt+0.5) R.info.push(maxMS<=kalt?"Die Miete liegt schon auf oder über der Vergleichsmiete – keine Erhöhung möglich.":"Die Kappungsgrenze ist ausgeschöpft."); }
  R.grenze=maxMS!=null&&maxMS<maxKap?"Vergleichsmiete":"Kappungsgrenze";
  return R;
}
function mietCard(R,full){
  const m=R.m;
  return `<div class="item s-${R.ok?"ok":R.warn.length?"warn":"neutral"}"><div class="head"><div><b>${esc(m.name)}</b><div class="meta">${esc(wohnFull(m.wohnungId))} · ${esc(R.art==="Standard"?"Vergleichsmiete (§ 558)":R.art==="Index"?"Indexmiete (§ 557b)":"Staffelmiete")}${R.last?` · letzte Änderung ${esc(fmtDate(R.last))}`:""}</div></div><div style="text-align:right"><b class="num">${R.kalt?eur(R.kalt):"–"}</b><div class="meta">${R.fl&&R.kalt?esc((R.kalt/R.fl).toFixed(2).replace(".",","))+" €/m²":""}</div></div></div>
  ${R.neu!=null&&R.neu>R.kalt?`<div class="row"><span class="pill ${R.ok?"ok":"neutral"}">möglich: ${eur(R.neu)} (+${eur(R.neu-R.kalt)} / Monat)</span>${R.art==="Standard"?`<span class="small">Grenze: ${esc(R.grenze)}${R.maxMS?` · Vergleichsmiete ${eur(R.maxMS)}`:""} · Kappung ${Math.round(R.kap*100)} % = ${eur(R.maxKap)}</span>`:`<span class="small">Index ${esc(String(R.basis))} → ${esc(String(R.vpi))} (${pct(R.aend)})</span>`}</div>`:""}
  ${[...R.warn,...R.info].map(t=>`<div class="small">• ${esc(t)}</div>`).join("")}
  ${(m.erhoehungGeplant)?`<div class="note info">Neue Miete ${eur(m.erhoehungGeplant.neu)} ab ${esc(fmtDate(m.erhoehungGeplant.datum))} vereinbart. ${m.erhoehungGeplant.datum<=today()?`<button class="btn sm pri" data-act="maApply" data-id="${esc(m.id)}">Jetzt übernehmen</button>`:""}</div>`:""}
  <div class="row">${R.neu!=null&&R.neu>R.kalt?`<button class="btn sm pri" data-act="maBrief" data-id="${esc(m.id)}">${R.art==="Index"?"Erklärung (PDF)":"Mieterhöhungsverlangen (PDF)"}</button><button class="btn sm" data-act="maZust" data-id="${esc(m.id)}">${R.art==="Index"?"Als versendet eintragen":"Zustimmung eintragen"}</button>`:""}<button class="btn sm ghost" data-act="edit" data-col="mieter" data-id="${esc(m.id)}">Mietart / Daten</button>${full?"":""}</div></div>`;
}
function vMietanp(){
  const ms=list("mieter").filter(m=>m.aktiv!==false&&m.wohnungId).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const Rs=ms.map(mietCalc), mk=st.markt||{};
  return `${finBack("mietanp")}
  <section class="card" style="display:flex;flex-direction:column;gap:8px"><h3>Verbraucherpreisindex (für Indexmieten)</h3>
   <div class="fields">${fld("VPI aktuell (2020 = 100)",inp("ma_vpi",mk.vpi,"number","z. B. 123,0"))}${fld("Monat",inp("ma_vpim",mk.vpiMonat,"month"))}</div>
   <div class="row"><button class="btn sm" id="ma_vpis">Speichern</button><span class="small">Wert vom Statistischen Bundesamt (destatis.de, „Verbraucherpreisindex“) eintragen.</span></div></section>
  <section class="list"><div class="sec-title"><h2>Mieter</h2><span>${Rs.filter(R=>R.ok).length} mit möglicher Erhöhung</span></div>
  ${Rs.length?Rs.sort((a,b)=>(b.ok-a.ok)).map(R=>mietCard(R)).join(""):emptyBox("Keine aktiven Mieter.")}</section>
  <p class="small">Regeln (§ 558 BGB): Erhöhung bis zur ortsüblichen Vergleichsmiete, frühestens 1 Jahr nach Einzug/letzter Erhöhung verlangen, wirksam ab dem 3. Monat nach Zugang und nicht vor 15 Monaten seit der letzten Änderung; in 3 Jahren höchstens +20 % (in Gebieten mit Verordnung +15 % – beim Haus einstellbar; Bad Salzuflen: 20 %). Der Mieter muss zustimmen (Frist: Ende des 2. Monats nach Zugang). Indexmiete (§ 557b): Änderung per Erklärung, frühestens 1 Jahr nach der letzten, wirksam ab dem übernächsten Monat. Musterbriefe ohne Gewähr – keine Rechtsberatung.</p>`;
}
function maPdf(R){
  const m=R.m, c=st.cfg||{}, o=R.o, w=R.w;
  let betreff, body;
  if(R.art==="Index"){
    betreff=`Anpassung der Miete nach § 557b BGB (Indexmiete) – ${[o.adresse,w.lage].filter(Boolean).join(", ")}`;
    body=`Sehr geehrte/r ${m.name},\n\nin unserem Mietvertrag ist eine Indexmiete vereinbart. Der vom Statistischen Bundesamt ermittelte Verbraucherpreisindex für Deutschland (2020 = 100) hat sich seit der letzten Mietfestsetzung wie folgt verändert:\n\nIndex bei der letzten Festsetzung: ${String(R.basis).replace(".",",")}\nIndex aktuell${st.markt?.vpiMonat?` (${fmtYm(st.markt.vpiMonat)})`:""}: ${String(R.vpi).replace(".",",")}\nVeränderung: ${pct(R.aend)}\n\nDie Nettokaltmiete ändert sich daher von ${eur(R.kalt)} auf ${eur(R.neu)} monatlich. Die neue Miete ist ab dem ${fmtDate(R.wirksam)} zu zahlen (§ 557b Abs. 3 BGB). Die Betriebskostenvorauszahlungen bleiben unverändert.\n\nMit freundlichen Grüßen\n\n${c.name||""}`;
  } else {
    betreff=`Mieterhöhungsverlangen nach § 558 BGB – ${[o.adresse,w.lage].filter(Boolean).join(", ")}`;
    body=`Sehr geehrte/r ${m.name},\n\nSie zahlen für die Wohnung derzeit eine Nettokaltmiete von ${eur(R.kalt)} (${(R.kalt/R.fl).toFixed(2).replace(".",",")} €/m² bei ${String(R.fl).replace(".",",")} m²). Die Miete ist seit ${fmtDate(R.last)} unverändert.\n\nIch bitte Sie, einer Erhöhung der Nettokaltmiete auf ${eur(R.neu)} monatlich (${(R.neu/R.fl).toFixed(2).replace(".",",")} €/m²) mit Wirkung ab dem ${fmtDate(R.wirksam)} zuzustimmen.\n\nBegründung: Die ortsübliche Vergleichsmiete für vergleichbare Wohnungen beträgt ${String(R.ms).replace(".",",")} €/m²${o.mietspiegelQuelle?` (${o.mietspiegelQuelle})`:""}. Die verlangte Miete übersteigt diese nicht. Die Kappungsgrenze von ${Math.round(R.kap*100)} % innerhalb von drei Jahren wird eingehalten (Ausgangsmiete ${eur(R.basis3)}, Höchstbetrag ${eur(R.maxKap)}).\n\nBitte erteilen Sie Ihre Zustimmung bis zum ${fmtDate(R.frist)} – am einfachsten, indem Sie diesen Brief unterschrieben zurückgeben. Die Betriebskostenvorauszahlungen bleiben unverändert.\n\nMit freundlichen Grüßen\n\n${c.name||""}\n\n\n— — — — — — — — — — — — — — — —\nZustimmung: Ich stimme der Erhöhung der Nettokaltmiete auf ${eur(R.neu)} ab dem ${fmtDate(R.wirksam)} zu.\n\nOrt, Datum, Unterschrift: ______________________________`;
  }
  return {blob:letter({toLines:addrLines(m),betreff:pT(betreff),body:pT(body)}),name:`${R.art==="Index"?"Indexanpassung":"Mieterhoehung"}_${String(m.name).replace(/\s+/g,"_")}_${today()}.pdf`,titel:R.art==="Index"?"Indexmiete-Anpassung":"Mieterhöhungsverlangen"};
}

/* =========================================================
   7) ANLAGE V + GRUNDSTEUER
   ========================================================= */
function gsJahr(g){ if(!g) return 0; if(num(g.jahresbetrag)) return num(g.jahresbetrag); if(num(g.messbetrag)&&num(g.hebesatz)) return r2(num(g.messbetrag)*num(g.hebesatz)/100); return 0; }
function gsFaellig(g,y){ if(!gsJahr(g)) return []; const j=gsJahr(g); if(g.zahlweise==="jährlich") return [{d:`${y}-07-01`,b:j}]; return ["02-15","05-15","08-15","11-15"].map(x=>({d:`${y}-${x}`,b:r2(j/4)})); }
function anlvCalc(oid,y){
  y=String(y); const as=list("ausgaben").filter(a=>a.objektId===oid&&String(a.datum||"").startsWith(y));
  let miete=0, uml=0;
  list("zahlungen").filter(z=>z.monat.startsWith(y)&&wohn(z.wohnungId)?.objektId===oid).forEach(z=>{ const w=wohn(z.wohnungId), so=+z.soll||sollOf(w.id), bz=+z.bezahlt||0, nk=+w.nk||0; const u=so>0?bz*Math.min(1,nk/so):0; uml+=u; miete+=bz-u; });
  const nkNach=list("nkabr").filter(r=>r.objektId===oid).flatMap(r=>Object.values(r.ausgleich||{})).filter(a=>String(a.datum).startsWith(y)).reduce((s,a)=>s+(+a.betrag||0),0);
  const erstattet=as.filter(a=>isMK(a)&&a.erstattet).reduce((s,a)=>s+(+a.betrag||0),0);
  const vm=as.filter(a=>!isMK(a)); const S=ks=>r2(vm.filter(a=>ks.includes(a.kategorie)).reduce((s,a)=>s+(+a.betrag||0),0));
  const ausKat=new Set(vm.map(a=>a.kategorie));
  let fixBK=0, fixSonst=0; list("fixkosten").filter(f=>f.objektId===oid).forEach(f=>{ const k=FIX2KAT[f.kategorie]; const b=fixJahr(f,y); if(!b) return; if(k&&!ausKat.has(k)) fixBK+=b; else if(f.kategorie==="Hausgeld / Rücklage"||f.kategorie==="Internet / TV") fixSonst+=b; });
  const gs=st.data.objekte[oid]?.grundsteuer; const gsB=(!ausKat.has("Grundsteuer")&&!list("fixkosten").some(f=>f.objektId===oid&&f.kategorie==="Grundsteuer"))?gsJahr(gs):0;
  const sc=steuerCalc(oid,y);
  const L=[
   ["Einnahmen",null],
   ["Mieteinnahmen für Wohnungen (ohne Umlagen)",r2(miete)],
   ["Umlagen (Nebenkosten-Vorauszahlungen)",r2(uml)],
   ["Nachzahlungen (+) / Erstattungen (−) aus Nebenkostenabrechnungen",r2(nkNach)],
   ["Sonstige Einnahmen (z. B. vom Mieter erstattete Kosten)",r2(erstattet)],
   ["Werbungskosten",null],
   ["Absetzung für Abnutzung (AfA) Gebäude",r2(sc.afa)],
   ["Schuldzinsen (ohne Tilgung)",r2(sc.z)],
   ["Erhaltungsaufwendungen (sofort abziehbar)",S(["Reparatur/Handwerker","Material/Baumarkt"])],
   ["Grundsteuer, Straßenreinigung, Müllabfuhr, Wasser, Heizung, Strom, Schornsteinfeger, Versicherungen, Hausmeister, Garten",r2(S(UMLAGE_KAT)+fixBK+gsB)],
   ["Sonstige Werbungskosten (Anwalt, Möbel bis 800 € netto, Kontoführung, Fahrten …)",r2(S(["Rechtsanwalt/Gericht","Möbel/Ausstattung","Sonstiges"])+fixSonst)]
  ];
  const ein=L.slice(1,5).reduce((s,x)=>s+(x[1]||0),0), wk=L.slice(6).reduce((s,x)=>s+(x[1]||0),0);
  return {L,ein:r2(ein),wk:r2(wk),erg:r2(ein-wk),zinsFehlt:sc.zins==null,kaufFehlt:!sc.b};
}
function vAnlV(){
  const os=objs(); if(!os.length) return finBack("anlv")+emptyBox("Noch keine Häuser angelegt.");
  if(!st.fObj||!st.data.objekte[st.fObj]) st.fObj=os[0].id; const oid=st.fObj, o=st.data.objekte[oid], y=String(st.year), A=anlvCalc(oid,y), g=o.grundsteuer||{}, gj=gsJahr(g);
  return `${finBack("anlv")}
  <div class="filters"><select data-change="fObj" aria-label="Haus">${os.map(x=>`<option value="${esc(x.id)}"${x.id===oid?" selected":""}>${esc(x.name||x.id)}</option>`).join("")}</select><select data-change="year" aria-label="Jahr">${yearOpts()}</select></div>
  <section class="card tablewrap"><h3>Anlage V ${esc(y)} – ${esc(o.name||oid)}</h3><table class="ja"><tbody>
   ${A.L.map(([t,b])=>b==null?`<tr><td colspan="2"><b>${esc(t)}</b></td></tr>`:`<tr><td>${esc(t)}</td><td class="n">${eur(b)}</td></tr>`).join("")}
   <tr><td><b>Summe Einnahmen</b></td><td class="n"><b>${eur(A.ein)}</b></td></tr><tr><td><b>Summe Werbungskosten</b></td><td class="n"><b>${eur(A.wk)}</b></td></tr><tr><td><b>Einkünfte (Überschuss / Verlust)</b></td><td class="n"><b>${eur(A.erg)}</b></td></tr></tbody></table>
   <div class="row"><button class="btn sm pri" data-act="anlvCsv">CSV / Excel</button><button class="btn sm" data-act="anlvCopy">Werte kopieren</button><button class="btn sm" data-act="stb">An Steuerberater</button></div>
   ${A.kaufFehlt?`<div class="small">• Kaufdaten fehlen – ohne sie keine AfA. <button class="btn sm" data-act="finHaus" data-o="${esc(oid)}">Eintragen</button></div>`:""}${A.zinsFehlt?`<div class="small">• Kreditzinsen ${esc(y)} fehlen (Zinsbescheinigung scannen unter Finanzen › Haus).</div>`:""}
   <p class="small" style="margin:6px 0 0">Bezeichnungen wie in ELSTER (Anlage V). Die Zeilennummern ändern sich jedes Jahr – deshalb ohne Nummer. Für jedes Haus eine eigene Anlage V. Möbel über 800 € netto werden über die Nutzungsdauer abgeschrieben. Größere Renovierungen in den ersten 3 Jahren nach Kauf: 15-%-Grenze beachten. Ohne Gewähr – mit Steuerberater abstimmen.</p></section>
  <section class="card" style="display:flex;flex-direction:column;gap:8px"><div class="spread"><h3>Grundsteuer</h3><button class="btn sm pri" data-act="gsScan" data-o="${esc(oid)}">Bescheid scannen</button></div>
   <div class="fields">${fld("Aktenzeichen",inp("gs_az",g.aktenzeichen))}${fld("Grundsteuerwert €",inp("gs_w",g.grundsteuerwert,"number"))}${fld("Messbetrag €",inp("gs_m",g.messbetrag,"number"))}${fld("Hebesatz %",inp("gs_h",g.hebesatz,"number"))}${fld("Jahresbetrag € (leer = Messbetrag × Hebesatz)",inp("gs_j",g.jahresbetrag,"number"))}${fld("Zahlweise",sel("gs_z",["vierteljährlich","jährlich"],g.zahlweise||"vierteljährlich"))}</div>
   <div class="row"><button class="btn sm" id="gs_save">Speichern</button>${gj?`<span class="small">${eur(gj)} pro Jahr · fällig ${gsFaellig(g,y).map(f=>fmtDate(f.d).slice(0,6)).join(", ")} · umlagefähig (fließt automatisch in die Nebenkostenabrechnung, wenn kein Beleg vorhanden)</span>`:""}</div></section>`;
}

/* =========================================================
   9) BRIEF PER POST
   ========================================================= */
function postSheet({blob,name,titel,mieterId}){
  openSheet(`<div class="spread"><h2>Per Post versenden</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>
  <ol class="small" style="padding-inline-start:18px;margin:0;display:flex;flex-direction:column;gap:6px"><li>PDF speichern und ausdrucken – Adresse sitzt passend für Fensterumschläge (DIN lang).</li><li>Für einen Nachweis als <b>Einwurf-Einschreiben</b> in der Postfiliale abgeben. Die Post bestätigt dann die Zustellung in den Briefkasten.</li><li>Sendungsnummer hier eintragen – sie wird beim Mieter gespeichert.</li></ol>
  <div class="row"><button class="btn pri" id="ps_dl">PDF speichern / drucken</button></div>
  <div class="fields">${fld("Versandart",sel("ps_art",["Einwurf-Einschreiben","Einschreiben mit Rückschein","Normaler Brief","Persönlich übergeben (mit Zeuge)"]))}${fld("Sendungsnummer (optional)",inp("ps_nr"))}${fld("Versendet am",inp("ps_d",today(),"date"))}</div>
  <div class="row end"><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" id="ps_ok">Versand eintragen</button></div>
  <p class="small">Ein direkter Online-Briefversand aus der App ist erst mit eigenem Server möglich (Stufe 3) – die Post bietet für Privatkunden keinen PDF-Upload mehr an.</p>`);
  $("#ps_dl").onclick=()=>saveFile(name,blob);
  $("#ps_ok").onclick=async()=>{ if(!mieterId){ closeSheet(); toast("Eingetragen"); return; } const m=st.data.mieter[mieterId]; const post=[...(m.post||[]),{datum:val("ps_d")||today(),titel,art:val("ps_art"),nr:val("ps_nr")}].slice(-50); try{ await dbUpd("mieter",mieterId,{post}); closeSheet(); toast("Versand eingetragen"); render(); }catch(e){ toast("Speichern fehlgeschlagen"); } };
}

/* =========================================================
   Mieter-Details, Start-Hinweise
   ========================================================= */
function mieterExtra(m){
  const T=zahlTrend(m), R=mietCalc(m);
  return `<section class="card" style="display:flex;flex-direction:column;gap:6px"><div class="spread"><h3>Zahlungsverhalten</h3>${T.warn?`<span class="pill warn">Frühwarnung</span>`:`<span class="pill ok">unauffällig</span>`}</div>${T.warn?`<div class="small"><b>${esc(T.txt)}</b> – am besten freundlich nachfragen, bevor ein Rückstand entsteht.</div><div class="row">${waBtn(m.telefon,`Hallo ${m.name},\n\nmir ist aufgefallen, dass die Miete zuletzt später als vereinbart (bis zum 3. des Monats) eingegangen ist. Ist alles in Ordnung? Falls es gerade schwierig ist, sprechen Sie mich bitte an – wir finden eine Lösung.\n\nViele Grüße\n${st.cfg?.name||""}`,"Freundlich nachfragen")}</div>`:""}${trendChart(T)}</section>
  <section class="list"><div class="sec-title"><h3>Miete anpassen</h3></div>${mietCard(R)}</section>
  ${(m.post||[]).length?`<section class="card"><h3>Postausgang</h3>${m.post.slice().reverse().map(p=>`<div class="small">${esc(fmtDate(p.datum))} · ${esc(p.titel)} · ${esc(p.art)}${p.nr?` · Nr. ${esc(p.nr)}`:""}</div>`).join("")}</section>`:""}`;
}
function extraAttention(att){
  list("mieter").filter(m=>m.aktiv!==false&&m.wohnungId).forEach(m=>{ const T=zahlTrend(m); if(T.warn) att.push({c:"warn",t:"Zahlungs-Frühwarnung",s:`${m.name} · ${T.txt}`,a:`<button class="btn sm" data-act="openMieter" data-id="${esc(m.id)}">Ansehen</button>`});
    if(m.erhoehungGeplant&&m.erhoehungGeplant.datum<=today()) att.push({c:"warn",t:"Neue Miete gilt ab heute",s:`${m.name} · ${eur(m.erhoehungGeplant.neu)} ab ${fmtDate(m.erhoehungGeplant.datum)}`,a:`<button class="btn sm pri" data-act="maApply" data-id="${esc(m.id)}">Übernehmen</button>`}); });
  list("wartung").forEach(t=>{ const s=wtState(t); if(s.dd<=14) att.push({c:s.dd<0?"bad":"warn",t:`Wartung: ${t.titel}`,s:`${objName(t.objektId)} · ${s.txt}`,a:`<button class="btn sm pri" data-act="wtDone" data-id="${esc(t.id)}">Erledigt</button><button class="btn sm" data-act="wtGo" data-o="${esc(t.objektId)}">Plan</button>`}); });
  const y=today().slice(0,4); list("objekte").forEach(o=>gsFaellig(o.grundsteuer,y).forEach(f=>{ const dd=days(today(),f.d); if(dd>=0&&dd<=7) att.push({c:"warn",t:`Grundsteuer fällig ${fmtDate(f.d)}`,s:`${o.name||o.id} · ${eur(f.b)}`,a:`<button class="btn sm" data-act="go" data-tab="geld" data-sub="anlv">Ansehen</button>`}); }));
  const ly=String(+y-1); if(today()>=`${y}-10-01`) list("objekte").forEach(o=>{ const R=nkCalc(o.id,ly); if(R.gesamt>0&&R.rows.length&&!st.data.nkabr?.[`${o.id}_${ly}`]?.erstellt) att.push({c:today()>=`${y}-12-01`?"bad":"warn",t:`Nebenkostenabrechnung ${ly} fehlt`,s:`${o.name||o.id} · muss bis 31.12.${y} beim Mieter sein`,a:`<button class="btn sm pri" data-act="nkGo" data-o="${esc(o.id)}" data-y="${ly}">Erstellen</button>`}); });
}

/* =========================================================
   Aktionen
   ========================================================= */
function nkRow(i){ const R=nkCalc(st.nkO,String(st.year)); return R.rows[+i]; }
async function nkMark(){ const id=`${st.nkO}_${st.year}`; const rec=st.data.nkabr?.[id]||{objektId:st.nkO,jahr:String(st.year)}; if(!rec.erstellt){ const {id:_,...d}=rec; await dbSet("nkabr",id,{...d,objektId:st.nkO,jahr:String(st.year),erstellt:today()}); } }
Object.assign(ACT,{
  nkGo:d=>{ closeSheet(); st.nkO=d.o; st.year=d.y; st.tab="geld"; st.sub.geld="nk"; st.objekt=null; render(); window.scrollTo(0,0); },
  nkDirekt:d=>{ const oid=st.nkO, y=String(st.year), id=`${oid}_${y}`, rec=nkRec(oid,y), dv=rec.direkt?.[d.k]||{}, ws=wsOf(oid);
    openSheet(`<div class="spread"><h2>${esc(d.k)} je Wohnung</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="small">Beträge aus der Einzelabrechnung (z. B. Heizkostenabrechnung von Ista, Techem, Brunata) bzw. nach Zählerständen.</div><div class="fields">${ws.map(w=>fld(`${w.lage||w.id}${mieterOf(w.id)?" – "+mieterOf(w.id).name:""}`,inp("nkd_"+w.id,dv[w.id],"number"))).join("")}</div><div class="row end"><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" id="nkd_ok">Speichern</button></div>`);
    $("#nkd_ok").onclick=async()=>{ const nv={}; ws.forEach(w=>{ const v=nval("nkd_"+w.id); if(v) nv[w.id]=v; }); const {id:_,...base}=rec; await dbSet("nkabr",id,{...base,objektId:oid,jahr:y,direkt:{...(rec.direkt||{}),[d.k]:nv}}); closeSheet(); toast("Gespeichert"); render(); }; },
  nkPdf:async d=>{ const r=nkRow(d.i); if(!r) return; await saveFile(`Nebenkostenabrechnung_${st.year}_${String(r.p.m.name).replace(/\s+/g,"_")}.pdf`,nkPdfBlob(st.nkO,String(st.year),r)); nkMark().catch(()=>{}); },
  nkPost:d=>{ const r=nkRow(d.i); if(!r) return; nkMark().catch(()=>{}); postSheet({blob:nkPdfBlob(st.nkO,String(st.year),r),name:`Nebenkostenabrechnung_${st.year}_${String(r.p.m.name).replace(/\s+/g,"_")}.pdf`,titel:`Nebenkostenabrechnung ${st.year}`,mieterId:r.p.m.id}); },
  nkAusgl:async d=>{ const r=nkRow(d.i); if(!r) return; const id=`${st.nkO}_${st.year}`, rec=st.data.nkabr?.[id]||{}; const {id:_,...base}=rec; await dbSet("nkabr",id,{...base,objektId:st.nkO,jahr:String(st.year),ausgleich:{...(rec.ausgleich||{}),[r.p.m.id+"_"+r.p.von]:{datum:today(),betrag:r.erg}}}); toast(r.erg>0?"Nachzahlung als erhalten eingetragen":"Guthaben als ausgezahlt eingetragen"); render(); },
  wtNew:d=>wtForm(null,d.o), wtEdit:d=>wtForm(d.id),
  wtGo:d=>{ closeSheet(); st.tab="haeuser"; st.mieter=null; st.objekt=d.o; st.osub="wartung"; render(); window.scrollTo(0,0); },
  wtStd:async d=>{ for(const [titel,intervall,bereich,notiz] of WT_STD) await dbSet("wartung",newId("wt"),{objektId:d.o,titel,intervall,bereich,notiz,letzte:"",naechste:""}); toast(`${WT_STD.length} Aufgaben angelegt – bitte „zuletzt erledigt“ eintragen`); render(); },
  wtDone:async d=>{ const t=st.data.wartung[d.id]; if(!t) return; await dbUpd("wartung",d.id,{letzte:today(),naechste:""}); toast(`Erledigt – nächstes Mal ${fmtDate(addM(today(),+t.intervall||12))}`); render(); },
  wtKosten:d=>{ const t=st.data.wartung[d.id]; if(!t) return; openForm("ausgaben",null,{objektId:t.objektId,kategorie:/schornstein|heizung|rauch|legionell|feuerl|e-check/i.test(t.titel)?"Schornsteinfeger/Wartung":/garten|hecke/i.test(t.titel)?"Gartenpflege":"Reparatur/Handwerker",umlage:/schornstein|heizung|rauch|legionell|garten|hecke|dachrinne/i.test(t.titel),beschreibung:t.titel,haendler:t.firma||""}); },
  bgNew:d=>bgOpen(d.o,null), bgOpen:d=>{ const b=st.data.begehungen[d.id]; if(b) bgOpen(b.objektId,d.id); },
  maBrief:async d=>{ const m=st.data.mieter[d.id]; if(!m) return; const R=mietCalc(m); if(!(R.neu>R.kalt)){ toast("Keine Erhöhung möglich"); return; } if(R.warn.length&&!await ask(`Hinweis: ${R.warn.join(" ")} Trotzdem Brief erstellen?`,"Erstellen")) return; const P=maPdf(R);
    openSheet(`<div class="spread"><h2>${esc(P.titel)}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="small">${esc(m.name)}: ${eur(R.kalt)} → ${eur(R.neu)} ab ${esc(fmtDate(R.wirksam))}</div><div class="row"><button class="btn pri" id="ma_dl">PDF speichern</button><button class="btn" id="ma_post">Per Post (Einschreiben)</button>${m.email?`<a class="btn" href="mailto:${esc(m.email)}?subject=${encodeURIComponent(P.titel)}">E-Mail</a>`:""}</div><p class="small">Textform genügt (z. B. Brief, E-Mail mit PDF). Für den Zugangsnachweis ist ein Einwurf-Einschreiben am sichersten.</p>`);
    $("#ma_dl").onclick=()=>saveFile(P.name,P.blob); $("#ma_post").onclick=()=>postSheet({blob:P.blob,name:P.name,titel:P.titel,mieterId:m.id}); },
  maZust:async d=>{ const m=st.data.mieter[d.id]; if(!m) return; const R=mietCalc(m); if(!(R.neu>R.kalt)) return;
    openSheet(`<div class="spread"><h2>${R.art==="Index"?"Anpassung eintragen":"Zustimmung eintragen"}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="fields">${fld("Neue Kaltmiete €",inp("mz_n",R.neu,"number"))}${fld("Gilt ab",inp("mz_d",R.wirksam,"date"))}</div><div class="row end"><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" id="mz_ok">Speichern</button></div>`);
    $("#mz_ok").onclick=async()=>{ const neu=nval("mz_n"), ab=val("mz_d"); if(!neu||!ab){ toast("Bitte Betrag und Datum"); return; } const g={neu,datum:ab,alt:R.kalt,art:R.art,vpi:R.vpi||null}; await dbUpd("mieter",m.id,{erhoehungGeplant:g}); closeSheet(); if(ab<=today()) await ACT.maApply({id:m.id}); else { toast(`Vorgemerkt – ab ${fmtDate(ab)} erinnert dich die App`); render(); } }; },
  maApply:async d=>{ const m=st.data.mieter[d.id]; const g=m?.erhoehungGeplant; if(!g) return; const patch={kalt:g.neu,letzteErhoehung:g.datum,erhoehungen:[...(m.erhoehungen||[]),{datum:g.datum,alt:g.alt,neu:g.neu,art:g.art}],erhoehungGeplant:null}; if(g.art==="Index"&&g.vpi) patch.vpiBasis=g.vpi; await dbUpd("mieter",m.id,patch); if(wohn(m.wohnungId)) await dbUpd("wohnungen",m.wohnungId,{kalt:g.neu}); toast(`Neue Kaltmiete ${eur(g.neu)} übernommen`); render(); },
  anlvCsv:async()=>{ const oid=st.fObj, y=String(st.year), A=anlvCalc(oid,y); const rows=[["Anlage V",y,objName(oid)],...A.L.map(([t,b])=>[t,b==null?"":String(b).replace(".",",")]),["Summe Einnahmen",String(A.ein).replace(".",",")],["Summe Werbungskosten",String(A.wk).replace(".",",")],["Einkünfte",String(A.erg).replace(".",",")]]; const csv="﻿"+rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(";")).join("\r\n"); await saveFile(`AnlageV_${y}_${String(objName(oid)).replace(/\s+/g,"_")}.csv`,new Blob([csv],{type:"text/csv"})); },
  anlvCopy:async()=>{ const A=anlvCalc(st.fObj,String(st.year)); const t=A.L.filter(x=>x[1]!=null).map(([t,b])=>`${t}: ${eur(b)}`).join("\n")+`\nEinkünfte: ${eur(A.erg)}`; try{ await navigator.clipboard.writeText(t); toast("Kopiert"); }catch(e){ toast("Kopieren nicht möglich"); } },
  gsScan:async d=>{ const oid=d.o; const files=await scanPages({multi:true,title:"Grundsteuerbescheid scannen",tip:"Alle Seiten des Bescheids der Stadt fotografieren."}); if(!files.length){ render(); return; }
    const imgs=await Promise.all(files.map(f=>compress(f))); openSheet(`<div class="ai"><span class="spin"></span><span>KI liest den Grundsteuerbescheid …</span></div>`);
    const r=await aiJson(`Die Fotos zeigen einen deutschen Grundsteuerbescheid (Stadt/Gemeinde) oder Grundsteuermessbescheid (Finanzamt). Antworte nur mit JSON: {"aktenzeichen":"oder null","grundsteuerwert":Zahl oder null,"messbetrag":Zahl oder null,"hebesatz":Zahl in Prozent oder null,"jahresbetrag":Grundsteuer pro Jahr als Zahl oder null,"zahlweise":"vierteljährlich|jährlich","adresse":"oder null"}`,imgs);
    closeSheet(); if(r.err){ toast(r.err); render(); return; } const v=r.v||{}; const o=st.data.objekte[oid]; const g={...(o.grundsteuer||{})}; ["aktenzeichen","grundsteuerwert","messbetrag","hebesatz","jahresbetrag"].forEach(k=>{ if(v[k]!=null&&v[k]!=="") g[k]=k==="aktenzeichen"?String(v[k]):num(v[k]); }); if(v.zahlweise) g.zahlweise=v.zahlweise; if(st.assets){ try{ g.bescheid=(await st.assets.upload(await imagesToPdf(imgs))).id; }catch(e){} } await dbUpd("objekte",oid,{grundsteuer:g}); toast(`Bescheid gelesen${v.adresse?" – "+v.adresse:""}. Bitte Werte prüfen.`); render(); },
  insPruef:async d=>{ const x=INS; if(!x) return; const p=(x.leute||[]).find(q=>q.id===d.v); if(!p) return; const wid=x.wohnungId;
    if(!p.pruefung&&!["Selbstauskunft","Zusage"].includes(p.status)){ if(!await ask(`Datenschutz: Einkommensnachweise und Schufa-Auskunft darfst du erst verlangen, wenn du ${p.name} die Wohnung geben willst (Vertragsabschluss steht bevor). Status jetzt auf „Selbstauskunft“ setzen und fortfahren?`,"Ja, fortfahren")) return; p.status="Selbstauskunft"; await insSave(x,""); }
    const files=await scanPages({multi:true,title:`Unterlagen von ${p.name}`,tip:"Gehaltsnachweise, Schufa-Auskunft, Mietschuldenfreiheit, Selbstauskunft – nur mit Einverständnis des Interessenten. Die Fotos werden nicht gespeichert."}); if(!files.length){ openInserat(wid,"leute"); return; }
    const imgs=await Promise.all(files.map(f=>compress(f))); openSheet(`<div class="ai"><span class="spin"></span><span>KI prüft ${imgs.length} Seite${imgs.length>1?"n":""} …</span></div>`);
    const warm=(num(x.kalt)||0)+(num(x.nk)||0);
    const r=await aiJson(`Die Fotos zeigen Bewerbungsunterlagen eines Mietinteressenten in Deutschland (z. B. Gehaltsabrechnungen, Arbeitsvertrag, Schufa-Auskunft, Mietschuldenfreiheitsbescheinigung, Selbstauskunft, Rentenbescheid). Antworte nur mit JSON:
{"name":"Name laut Unterlagen oder null","dokumente":["erkannte Dokumentarten"],"nettoMonat":durchschnittliches Netto pro Monat als Zahl oder null,"arbeitgeber":"oder null","beschaeftigung":"unbefristet|befristet|Probezeit|selbständig|Rente|Sozialleistung|unbekannt","schufaScore":Prozentwert oder null,"negativeintraege":true/false/null,"mietschuldenfrei":true/false/null,"auffaelligkeiten":["z. B. Namen passen nicht zusammen, Dokument unleserlich, Daten älter als 3 Monate, mögliche Bearbeitung"]}
Nur Angaben aus den Dokumenten, nichts erfinden.`,imgs);
    if(r.err){ closeSheet(); toast(r.err); openInserat(wid,"leute"); return; }
    const v=r.v||{}; const q=v.nettoMonat&&warm?warm/v.nettoMonat:null;
    const amp=v.negativeintraege===true||(q!=null&&q>0.4)?"rot":(q==null||q>0.33||(v.auffaelligkeiten||[]).length||["befristet","Probezeit"].includes(v.beschaeftigung))?"gelb":"grün";
    p.pruefung={datum:today(),...v,warm,quote:q?r2(q):null,ampel:amp};
    await insSave(x,"Prüfung gespeichert");
    openSheet(`<div class="spread"><h2>Prüfung: ${esc(p.name)}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>${bwBox(p)}<div class="row end"><button class="btn pri" id="bw_back">Zurück zur Neuvermietung</button></div>`);
    $("#bw_back").onclick=()=>openInserat(wid,"leute"); }
});
function bwBox(p){ const v=p.pruefung||{}; const c={grün:"ok",gelb:"warn",rot:"bad"}[v.ampel]||"neutral";
  return `<section class="card" style="display:flex;flex-direction:column;gap:6px"><div class="spread"><b>Ergebnis</b><span class="pill ${c}">${esc(v.ampel==="grün"?"passt":v.ampel==="gelb"?"genauer prüfen":"Risiko")}</span></div>
  <dl class="kv"><dt>Netto / Monat</dt><dd>${v.nettoMonat?eur(v.nettoMonat):"–"}</dd><dt>Warmmiete</dt><dd>${v.warm?eur(v.warm):"–"}</dd><dt>Mietbelastung</dt><dd>${v.quote!=null?pct(v.quote)+(v.quote<=0.33?" (gut, bis ⅓)":v.quote<=0.4?" (knapp)":" (hoch)"):"–"}</dd><dt>Beschäftigung</dt><dd>${esc(v.beschaeftigung||"–")}${v.arbeitgeber?" · "+esc(v.arbeitgeber):""}</dd><dt>Schufa</dt><dd>${v.schufaScore!=null?esc(String(v.schufaScore))+" %":"–"}${v.negativeintraege===true?" · Negativeinträge!":v.negativeintraege===false?" · keine Negativeinträge":""}</dd><dt>Mietschuldenfrei</dt><dd>${v.mietschuldenfrei===true?"ja":v.mietschuldenfrei===false?"nein":"–"}</dd><dt>Unterlagen</dt><dd>${esc((v.dokumente||[]).join(", ")||"–")}</dd></dl>
  ${(v.auffaelligkeiten||[]).length?`<div class="note warn">${v.auffaelligkeiten.map(esc).join("<br>")}</div>`:""}
  <p class="small" style="margin:0">KI-Hilfe, keine Bonitätsauskunft. Entscheidung immer selbst treffen – nicht nach Herkunft, Religion, Geschlecht, Alter usw. (AGG). Unterlagen nur mit Einverständnis prüfen; die Fotos werden nicht gespeichert, nur dieses Ergebnis. Bei Absage Ergebnis löschen.</p></section>`; }

/* Änderungen in Formularen (Selects/Checkboxen) */
document.addEventListener("change",async e=>{
  const t=e.target; if(!t||!t.dataset) return;
  if(t.dataset.nkkey){ const oid=st.nkO, y=String(st.year), id=`${oid}_${y}`, rec=st.data.nkabr?.[id]||{}; const {id:_,...base}=rec; try{ await dbSet("nkabr",id,{...base,objektId:oid,jahr:y,keys:{...(rec.keys||{}),[t.dataset.nkkey]:t.value}}); render(); }catch(x){ toast("Speichern fehlgeschlagen"); } }
  if(t.dataset.nkfix){ const oid=st.nkO, y=String(st.year), id=`${oid}_${y}`, rec=st.data.nkabr?.[id]||{}; const {id:_,...base}=rec; const patch=t.dataset.nkfix==="__gs"?{gsOn:t.checked}:{fix:{...(rec.fix||{}),[t.dataset.nkfix]:t.checked}}; try{ await dbSet("nkabr",id,{...base,objektId:oid,jahr:y,...patch}); render(); }catch(x){ toast("Speichern fehlgeschlagen"); } }
});
document.addEventListener("click",async e=>{
  const b=e.target.closest&&e.target.closest("button"); if(!b) return;
  if(b.id==="ma_vpis"){ const d={vpi:nval("ma_vpi"),vpiMonat:val("ma_vpim")}; try{ await st.db.doc("config/markt").set(d); st.markt=d; toast("Gespeichert"); render(); }catch(x){ toast("Speichern fehlgeschlagen"); } }
  if(b.id==="gs_save"){ const oid=st.fObj, o=st.data.objekte[oid]; const g={...(o.grundsteuer||{}),aktenzeichen:val("gs_az"),grundsteuerwert:nval("gs_w"),messbetrag:nval("gs_m"),hebesatz:nval("gs_h"),jahresbetrag:nval("gs_j"),zahlweise:val("gs_z")}; try{ await dbUpd("objekte",oid,{grundsteuer:g}); toast("Grundsteuer gespeichert"); render(); }catch(x){ toast("Speichern fehlgeschlagen"); } }
});

/* CSS */
const css=document.createElement("style");
css.textContent=`.nkrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line)}.nkrow>div{flex:1;min-width:160px}.nkrow select{max-width:100%}
.nkfx{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0}.nkfx span{flex:1}
.bgsec{display:flex;flex-direction:column;gap:2px;padding:12px}.bgp{border-top:1px solid var(--line);padding:8px 0;display:flex;flex-direction:column;gap:6px}.bgp .bgl{font-size:14px}.bgb{display:flex;gap:6px}.bgb button{flex:1;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:10px;padding:8px 0;font:inherit;font-weight:600;cursor:pointer}.bgb button[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}.bgp.s-mangel .bgl{font-weight:700}.bgm{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.bgm input,.bgm select{flex:1;min-width:140px}
.ztrend{display:flex;align-items:flex-end;gap:6px;height:70px;padding-top:4px}.zt{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end}.zt span{font-size:10.5px;color:var(--muted)}.zb{width:100%;max-width:28px;border-radius:5px 5px 2px 2px;background:var(--surface2)}.zb.warn{background:var(--muted)}.zb.bad{background:var(--ink)}.zb.ok{background:var(--line)}`;
document.head.appendChild(css);

/* =========================================================
   11) CO₂-Speichern/Scannen, DATENSICHERUNG, KAUTION, FRISTEN, RENDITE, DATENSCHUTZ
   ========================================================= */
async function nkPatch(patch){ const oid=st.nkO, y=String(st.year), id=`${oid}_${y}`, rec=st.data.nkabr?.[id]||{}; const {id:_,...base}=rec; await dbSet("nkabr",id,{...base,objektId:oid,jahr:y,...patch}); }
document.addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest("#co_calc"); if(!b) return; const v=nval("co_v"), u=val("co_e"), pr=nval("co_p")||55; if(!v){ toast("Bitte Verbrauch eintragen"); return; }
  const kg=u==="l"?v*0.845*42.8*0.074:(u==="kwhHi"?v:v/1.11)*0.20088; $("#co_kg").value=Math.round(kg); $("#co_k").value=r2(kg/1000*pr*1.19); toast(`≈ ${Math.round(kg).toLocaleString("de-DE")} kg CO₂ – bitte „Speichern“`); });
document.addEventListener("click",async e=>{ const b=e.target.closest&&e.target.closest("#co_save"); if(!b) return;
  const rec=nkRec(st.nkO,String(st.year)); const c={...(rec.co2||{}),art:val("co_art"),kg:nval("co_kg"),kosten:nval("co_k"),messdienst:$("#co_md").checked,halb:$("#co_h").checked}; if($("#co_v")){ c.verbrauch=nval("co_v"); c.einheit=val("co_e"); c.preis=nval("co_p"); }
  try{ await nkPatch({co2:c}); toast("CO₂-Angaben gespeichert"); render(); }catch(x){ toast("Speichern fehlgeschlagen"); } });

/* ---- Datensicherung ---- */
let bkRun=false;
async function autoBackup(force){
  if(bkRun||st.role!=="master"||!st.db||!st.assets||!st.loaded||st.backup===undefined) return; const B=st.backup||{};
  if(!force&&B.last&&days(B.last,today())<7) return; bkRun=true;
  try{ const daten={}; for(const c of COLS) if(!["portal","eingang","hwportal","hweingang"].includes(c)) daten[c]=Object.values(st.data[c]||{});
    const n=Object.values(daten).reduce((s,x)=>s+x.length,0);
    const blob=new Blob([JSON.stringify({app:"JoumHome",typ:"sicherung",version:1,erstellt:new Date().toISOString(),config:{vermieter:st.cfg||{},markt:st.markt||{},vertragsvorgaben:st.vtVorg||{}},daten})],{type:"application/json"});
    const up=await st.assets.upload(blob); const liste=[{datum:new Date().toISOString(),asset:up.id,n,mb:r2(blob.size/1048576)},...(B.liste||[])].slice(0,8);
    const nb={...B,last:today(),liste}; await st.db.doc("config/backup").set(nb); st.backup=nb; if(force) toast(`Sicherung erstellt (${n} Einträge)`);
  }catch(x){ console.warn("Sicherung",x); if(force) toast("Sicherung fehlgeschlagen"); } finally{ bkRun=false; }
}
setInterval(()=>{ try{ autoBackup(false); }catch(e){} },60000); setTimeout(()=>{ try{ autoBackup(false); }catch(e){} },8000);
function bkSheet(){
  const B=st.backup||{};
  openSheet(`<div class="spread"><h2>Datensicherung</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>
  <div class="small">Die App sichert jede Woche automatisch alle Einträge (die letzten 8 Sicherungen bleiben). Damit kannst du versehentlich Gelöschtes zurückholen. Fotos und PDFs sind darin nicht enthalten – dafür einmal im Monat die <b>Komplett-Sicherung</b> herunterladen und auf deinem Handy/PC oder in einer Cloud ablegen.</div>
  <div class="row"><button class="btn pri" data-act="bkNow">Jetzt sichern</button><button class="btn" data-act="bkFull">Komplett-Sicherung (ZIP mit Fotos)</button></div><div class="small" id="umSt"></div>
  <section class="list"><div class="sec-title"><h3>Automatische Sicherungen</h3><span>${(B.liste||[]).length}</span></div>
  ${(B.liste||[]).map((x,i)=>`<div class="item"><div class="head"><div><b>${esc(fmtDate(x.datum.slice(0,10)))} ${esc(x.datum.slice(11,16))}</b><div class="meta">${x.n} Einträge · ${String(x.mb).replace(".",",")} MB</div></div></div><div class="row"><button class="btn sm" data-act="bkRestore" data-i="${i}">Gelöschtes zurückholen</button><a class="btn sm ghost" href="${esc(assetUrl(x.asset))}" download="JoumHome-Sicherung_${esc(x.datum.slice(0,10))}.json" target="_blank" rel="noopener">Herunterladen</a></div></div>`).join("")||emptyBox("Noch keine Sicherung – tippe auf „Jetzt sichern“.")}</section>
  ${B.full?`<div class="small">Letzte Komplett-Sicherung: ${esc(fmtDate(B.full))}</div>`:""}`);
}
async function bkRestore(i){
  const x=(st.backup?.liste||[])[+i]; if(!x) return; openSheet(`<div class="ai"><span class="spin"></span><span>Sicherung wird gelesen …</span></div>`);
  let j; try{ j=await (await fetch(assetUrl(x.asset))).json(); }catch(e){ closeSheet(); toast("Sicherung nicht lesbar"); return; }
  const fehlt=[]; for(const [c,arr] of Object.entries(j.daten||{})) for(const d of arr||[]) if(d&&d.id&&!st.data[c]?.[d.id]) fehlt.push({c,d});
  const lab=(c,d)=>`${{objekte:"Haus",wohnungen:"Wohnung",mieter:"Mieter",ausgaben:"Ausgabe",zahlungen:"Mieteingang",schaeden:"Schaden",verstoesse:"Verstoß",vertraege:"Vertrag",zaehler:"Zählerstand",inventar:"Inventar",auftraege:"Auftrag",handwerker:"Kontakt",wartung:"Wartung",dokumente:"Dokument"}[c]||c}: ${d.name||d.titel||d.beschreibung||d.haendler||d.art||d.monat||d.datum||d.id}`;
  openSheet(`<div class="spread"><h2>Gelöschtes zurückholen</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="small">Sicherung vom ${esc(fmtDate(x.datum.slice(0,10)))}: ${fehlt.length} Einträge sind dort, aber heute nicht mehr in der App.</div>
  <div class="list">${fehlt.slice(0,200).map((f,k)=>`<label class="nkfx"><input type="checkbox" data-rs="${k}"> <span>${esc(String(lab(f.c,f.d)).slice(0,90))}</span></label>`).join("")||emptyBox("Nichts fehlt – alles da.")}</div>
  ${fehlt.length?`<div class="row end"><button class="btn pri" id="rs_ok">Ausgewählte zurückholen</button></div>`:""}`);
  const ok=$("#rs_ok"); if(ok) ok.onclick=async()=>{ const sel=[...document.querySelectorAll("[data-rs]")].filter(x=>x.checked).map(x=>fehlt[+x.dataset.rs]); if(!sel.length){ toast("Bitte auswählen"); return; } for(const f of sel){ const {id,...d}=f.d; await st.db.collection(f.c).doc(id).set(d); } closeSheet(); toast(`${sel.length} Einträge zurückgeholt`); };
}

/* ---- Kautionsabrechnung ---- */
function kautionSheet(mid){
  const m=st.data.mieter[mid]; if(!m) return; const ka=m.kautionAbr||{};
  let offenMiete=0; try{ offenMiete=buildPortal(m).miete.offen||0; }catch(e){}
  const mk=list("ausgaben").filter(a=>a.wohnungId===m.wohnungId&&isMK(a)&&!a.erstattet&&(!m.beginn||String(a.datum)>=m.beginn)).reduce((s,a)=>s+(+a.betrag||0),0);
  const prot=list("protokolle").filter(p=>p.mieterId===m.id&&String(p.art||"").startsWith("Rücknahme")).sort((a,b)=>String(b.datum).localeCompare(String(a.datum)))[0];
  const maengel=(prot?.raeume||[]).filter(r=>r.zustand==="Mangel").map(r=>`${r.raum||r.name||"Raum"}${r.notiz?" – "+r.notiz:""}`);
  const ende=mEnde(m); const pruef=ende?addM(ende,6):null;
  const P=ka.posten||[...(offenMiete>0?[{t:"Offene Miete",b:r2(offenMiete)}]:[]),...(mk>0?[{t:"Vom Mieter verursachte Kosten (Tickets)",b:r2(mk)}]:[]),...maengel.map(t=>({t:`Schaden: ${t}`,b:0}))];
  openSheet(`<div class="spread"><h2>Kautionsabrechnung – ${esc(m.name)}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>
  <div class="small">${ende?`Mietende ${esc(fmtDate(ende))}. `:""}Du darfst nach dem Auszug in angemessener Zeit prüfen, ob noch Forderungen bestehen (oft bis ca. 6 Monate, je nach Fall). Für eine zu erwartende Nebenkosten-Nachzahlung darfst du einen angemessenen Teil bis zur Abrechnung einbehalten. Die Kautionszinsen gehören dem Mieter.</div>
  <div class="fields">${fld("Kaution gezahlt €",inp("ka_k",ka.kaution??m.kautionGezahlt??m.kaution,"number"))}${fld("Zinsen / Erträge Kautionskonto €",inp("ka_z",ka.zinsen??"","number"))}${fld("Einbehalt für Nebenkosten (noch nicht abgerechnet) €",inp("ka_nk",ka.nk??"","number"),1)}${fld("Grund für den Einbehalt",inp("ka_nkg",ka.nkg||`Betriebskostenabrechnung ${today().slice(0,4)} steht noch aus`),1)}</div>
  <section class="card" style="display:flex;flex-direction:column;gap:6px"><h3>Abzüge</h3><div id="ka_p">${P.map((x,i)=>`<div class="row" style="flex-wrap:nowrap"><input data-kt="${i}" type="text" value="${esc(x.t)}" style="flex:1"><input data-kb="${i}" type="number" step="any" value="${x.b||""}" style="width:110px" placeholder="€"></div>`).join("")}</div><button class="btn sm ghost" id="ka_add">+ Posten</button>
  ${maengel.length?`<div class="small">Mängel aus dem Rücknahmeprotokoll übernommen – Betrag eintragen (Kostenvoranschlag/Rechnung). Normale Abnutzung darf nicht abgezogen werden.</div>`:""}</section>
  <div class="fields">${fld("Anschrift des Mieters für den Brief (neue Adresse)",inp("ka_adr",ka.adr||addrLines(m).slice(1).join(", ")),1)}</div>
  <div class="note info" id="ka_sum"></div>
  <div class="row end"><button class="btn" id="ka_save">Speichern</button><button class="btn" id="ka_post">Per Post</button><button class="btn pri" id="ka_pdf">Abrechnung (PDF)</button></div>${pruef?`<div class="small">Merkposten: Abrechnung möglichst bis ca. ${esc(fmtDate(pruef))}.</div>`:""}`);
  const rd=()=>{ const posten=[...document.querySelectorAll("[data-kt]")].map(x=>({t:x.value.trim(),b:num(document.querySelector(`[data-kb="${x.dataset.kt}"]`).value)||0})).filter(x=>x.t||x.b); const k=nval("ka_k")||0, z=nval("ka_z")||0, nk=nval("ka_nk")||0; const ab=posten.reduce((s,x)=>s+x.b,0); return {kaution:k,zinsen:z,nk,nkg:val("ka_nkg"),posten,adr:val("ka_adr"),abzug:r2(ab),aus:r2(k+z-ab-nk)}; };
  const upd=()=>{ const v=rd(); $("#ka_sum").innerHTML=`Kaution ${eur(v.kaution)} + Zinsen ${eur(v.zinsen)} − Abzüge ${eur(v.abzug)} − Einbehalt ${eur(v.nk)} = <b>${v.aus>=0?"Auszahlung":"Restforderung"} ${eur(Math.abs(v.aus))}</b>`; };
  $("#sheet").addEventListener("input",upd); upd();
  $("#ka_add").onclick=()=>{ const i=document.querySelectorAll("[data-kt]").length; $("#ka_p").insertAdjacentHTML("beforeend",`<div class="row" style="flex-wrap:nowrap"><input data-kt="${i}" type="text" placeholder="z. B. Reinigung, Schlüssel" style="flex:1"><input data-kb="${i}" type="number" step="any" style="width:110px" placeholder="€"></div>`); };
  const save=async()=>{ const v=rd(); await dbUpd("mieter",m.id,{kautionAbr:{...v,datum:today()}}); return v; };
  const pdf=v=>{ const c=st.cfg||{}; const body=`Sehr geehrte/r ${m.name},\n\nnach Beendigung des Mietverhältnisses über die Wohnung ${wohnFull(m.wohnungId)}${ende?` zum ${fmtDate(ende)}`:""} rechne ich die Mietkaution wie folgt ab:\n\nGezahlte Kaution: ${eur(v.kaution)}\nZinsen/Erträge: ${eur(v.zinsen)}\n${v.posten.map(x=>`abzüglich ${x.t}: ${eur(x.b)}`).join("\n")}${v.nk?`\nvorläufiger Einbehalt (${v.nkg||"ausstehende Betriebskostenabrechnung"}): ${eur(v.nk)}`:""}\n\n${v.aus>=0?`Auszahlungsbetrag: ${eur(v.aus)}\n\nDen Betrag überweise ich in den nächsten Tagen auf Ihr Konto. Bitte teilen Sie mir dafür Ihre aktuelle Bankverbindung mit, falls sie sich geändert hat.`:`Offener Restbetrag zu Ihren Lasten: ${eur(-v.aus)}\n\nBitte überweisen Sie diesen Betrag innerhalb von 14 Tagen.${typeof bankLine==="function"?bankLine():""}`}${v.nk?`\n\nÜber den Einbehalt rechne ich ab, sobald die Betriebskostenabrechnung vorliegt.`:""}\n\nMit freundlichen Grüßen\n\n${c.name||""}`;
    const lines=[m.name,...String(v.adr||"").split(",").map(x=>x.trim()).filter(Boolean)]; return letter({toLines:lines,betreff:`Abrechnung der Mietkaution – ${wohnFull(m.wohnungId)}`,body:pT(body)}); };
  $("#ka_save").onclick=async()=>{ await save(); toast("Gespeichert"); };
  $("#ka_pdf").onclick=async()=>{ const v=await save(); await saveFile(`Kautionsabrechnung_${String(m.name).replace(/\s+/g,"_")}_${today()}.pdf`,pdf(v)); };
  $("#ka_post").onclick=async()=>{ const v=await save(); postSheet({blob:pdf(v),name:`Kautionsabrechnung_${String(m.name).replace(/\s+/g,"_")}.pdf`,titel:"Kautionsabrechnung",mieterId:m.id}); };
}

/* ---- Fristen-Kalender ---- */
function fristen(){
  const E=[], t=today(), bis=addM(t,18), von=addM(t,-1);
  const add=(d,titel,info,art,c)=>{ if(d&&d>=von&&d<=bis) E.push({d,titel,info:info||"",art,c:c||"neutral"}); };
  list("wartung").forEach(w=>add(wtNext(w),`Wartung: ${w.titel}`,objName(w.objektId),"Wartung"));
  const y=+t.slice(0,4); list("objekte").forEach(o=>{ [y-1,y].forEach(j=>{ const R=nkCalc(o.id,String(j)); if(R.gesamt>0&&R.rows.length&&!st.data.nkabr?.[`${o.id}_${j}`]?.erstellt) add(`${j+1}-12-31`,`Nebenkostenabrechnung ${j} muss beim Mieter sein`,o.name||o.id,"Nebenkosten","bad"); }); [y,y+1].forEach(j=>gsFaellig(o.grundsteuer,j).forEach(f=>add(f.d,`Grundsteuer ${eur(f.b)} fällig`,o.name||o.id,"Grundsteuer"))); });
  list("mieter").filter(m=>m.aktiv!==false&&m.wohnungId).forEach(m=>{ const R=mietCalc(m); if(R.frueh&&R.art!=="Staffel"&&R.frueh>t) add(R.frueh,`Mieterhöhung möglich: ${m.name}`,R.art==="Index"?"Indexmiete":"Vergleichsmiete","Miete");
    if(m.erhoehungGeplant) add(m.erhoehungGeplant.datum,`Neue Miete gilt: ${m.name} ${eur(m.erhoehungGeplant.neu)}`,"","Miete","warn");
    const e=mEnde(m); if(e){ add(e,`Mietende: ${m.name}`,wohnFull(m.wohnungId),"Mieter","warn"); if(!m.kautionAbr) add(addM(e,6),`Kaution abrechnen: ${m.name}`,"spätestens ungefähr","Kaution","warn"); } });
  garantien().forEach(g=>add(g.bis,`Garantie/Gewährleistung endet: ${g.t}`,objName(g.oid),"Garantie"));
  list("vertraege").filter(v=>v.status==="Wartet auf Mieter").forEach(v=>add(t,`Unterschrift ausstehend: ${v.titel}`,st.data.mieter[v.mieterId]?.name||"","Vertrag"));
  return E.sort((a,b)=>a.d.localeCompare(b.d));
}
function icsOf(E){ const esc2=x=>String(x).replace(/\\/g,"\\\\").replace(/;/g,"\;").replace(/,/g,"\\,").replace(/\n/g,"\\n"); const st0=new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z";
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//JoumHome//Fristen//DE","CALSCALE:GREGORIAN",...E.flatMap((e,i)=>{ const d=e.d.replace(/-/g,""), d2=addM(e.d,0); const nx=new Date(dParse(e.d).getTime()+864e5); const dn=dStr(nx).replace(/-/g,""); return ["BEGIN:VEVENT",`UID:jh-${d}-${i}-${Math.random().toString(36).slice(2,8)}@joumhome`,`DTSTAMP:${st0}`,`DTSTART;VALUE=DATE:${d}`,`DTEND;VALUE=DATE:${dn}`,`SUMMARY:${esc2(e.titel)}`,`DESCRIPTION:${esc2([e.art,e.info].filter(Boolean).join(" – "))}`,"BEGIN:VALARM","ACTION:DISPLAY","TRIGGER:-P3D",`DESCRIPTION:${esc2(e.titel)}`,"END:VALARM","END:VEVENT"]; }),"END:VCALENDAR"].join("\r\n"); }
function fristenSheet(){
  const E=fristen(), t=today(); const g={}; E.forEach(e=>{ const k=e.d.slice(0,7); (g[k]=g[k]||[]).push(e); });
  openSheet(`<div class="spread"><h2>Fristen & Termine</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>
  <div class="row"><button class="btn pri" data-act="icsAll">Alle in Handy-Kalender (${E.length})</button></div><div class="small">Lädt eine Kalender-Datei (.ics) – antippen und „Alle hinzufügen“. Mit Erinnerung 3 Tage vorher.</div>
  ${Object.keys(g).map(k=>`<section class="list"><div class="sec-title"><h3>${esc(fmtYm(k))}</h3><span>${g[k].length}</span></div>${g[k].map(e=>`<div class="item s-${e.d<t?"bad":e.c}"><div class="head"><div><b>${esc(e.titel)}</b><div class="meta">${esc(fmtDate(e.d))}${e.info?" · "+esc(e.info):""} · ${esc(e.art)}</div></div>${e.d<t?`<span class="pill bad">überfällig</span>`:""}</div></div>`).join("")}</section>`).join("")||emptyBox("Keine Fristen in den nächsten 18 Monaten.")}`);
}

/* ---- Rendite je Wohnung ---- */
function renditeCalc(){
  const out=[];
  list("objekte").forEach(o=>{ const ws=wsOf(o.id); const flTot=ws.reduce((s,w)=>s+(+w.flaeche||0),0)||1; const k=o.kauf||{}; const kp=(num(k.kaufpreis)||0)+(num(k.gest)||0)+(num(k.notar)||0)+(num(k.makler)||0)+(num(k.sonstNK)||0);
    const kredit=list("fixkosten").filter(f=>f.objektId===o.id&&/kredit/i.test(f.kategorie||"")&&fixAktiv(f)).reduce((s,f)=>s+fixMonat(f),0);
    const seit=addM(today(),-12);
    const hausK=list("ausgaben").filter(a=>a.objektId===o.id&&!a.wohnungId&&!isMK(a)&&!a.umlage&&String(a.datum)>=seit).reduce((s,a)=>s+(+a.betrag||0),0);
    ws.forEach(w=>{ const ant=(+w.flaeche||0)/flTot||(1/ws.length); const kalt=+w.kalt||0;
      const ist=list("zahlungen").filter(z=>z.wohnungId===w.id&&z.monat>=seit.slice(0,7)).reduce((s,z)=>s+(+z.bezahlt||0),0);
      const occ=perioden(w.id,seit,today()).reduce((x,p)=>x+p.tage,0), tot=days(seit,today())+1; const leerM=Math.round((1-Math.min(1,occ/tot))*12*10)/10;
      const eigK=list("ausgaben").filter(a=>a.wohnungId===w.id&&!isMK(a)&&!a.umlage&&String(a.datum)>=seit).reduce((s,a)=>s+(+a.betrag||0),0)+hausK*ant;
      const kpA=kp*ant, jk=kalt*12;
      out.push({o,w,m:mieterOf(w.id),kalt,jk,ist:r2(ist),leerM:Math.max(0,Math.min(12,leerM)),leerKost:r2(Math.max(0,Math.min(12,leerM))*kalt),kosten:r2(eigK),kpA:r2(kpA),brutto:kpA?jk/kpA:null,netto:kpA?(jk-eigK)/kpA:null,cf:r2(kalt-kredit*ant-eigK/12)}); }); });
  return out;
}
function vRendite(){
  const R=renditeCalc().sort((a,b)=>(b.netto??-9)-(a.netto??-9));
  return `${finBack("rendite")}
  <div class="small">Letzte 12 Monate. Kaufpreis und Kredit werden nach Wohnfläche auf die Wohnungen verteilt. Rendite vor Steuern, ohne Wertsteigerung.</div>
  <div class="list">${R.length?R.map(x=>`<div class="item s-${x.cf<0?"bad":x.netto!=null&&x.netto<0.03?"warn":"ok"}"><div class="head"><div><b>${esc(x.o.name||x.o.id)} · ${esc(x.w.lage||x.w.id)}</b><div class="meta">${esc(x.m?.name||"leer")} · ${x.w.flaeche?esc(String(x.w.flaeche))+" m²":"Fläche fehlt"}</div></div><div style="text-align:right"><b>${x.netto!=null?pct(x.netto):"–"}</b><div class="meta">Netto-Rendite</div></div></div>
   <dl class="kv"><dt>Kaltmiete / Jahr</dt><dd>${eur(x.jk)}</dd><dt>Tatsächlich eingegangen</dt><dd>${eur(x.ist)}</dd><dt>Leerstand</dt><dd>${x.leerM?`${String(x.leerM).replace(".",",")} Monate ≈ ${eur(x.leerKost)} entgangen`:"keiner"}</dd><dt>Kosten (nicht umlagefähig)</dt><dd>${eur(x.kosten)}</dd><dt>Anteil Kaufpreis inkl. Nebenkosten</dt><dd>${x.kpA?eur(x.kpA):"Kaufdaten fehlen"}</dd><dt>Brutto-Rendite</dt><dd>${x.brutto!=null?pct(x.brutto):"–"}</dd><dt>Cashflow / Monat</dt><dd>${x.cf>=0?"+":"−"}${eur(Math.abs(x.cf))}</dd></dl></div>`).join(""):emptyBox("Noch keine Wohnungen.")}</div>
  <p class="small">Netto-Rendite = (Jahreskaltmiete − nicht umlagefähige Kosten) ÷ Kaufpreisanteil. Cashflow = Kaltmiete − Kreditrate-Anteil − Kosten. Schätzung, keine Anlageberatung.</p>`;
}

/* ---- Datenschutzhinweise (Art. 13 DSGVO) ---- */
function dsText(){ const c=isTenant()?(pm()?.vermieter||{}):(st.cfg||{}); return `Datenschutzhinweise für Mieterinnen und Mieter (Art. 13 DSGVO)

1. Verantwortlich: ${c.name||"[Name]"}, ${c.adresse||"[Anschrift]"}${c.telefon?", Tel. "+c.telefon:""}${c.email?", E-Mail "+c.email:""}.

2. Welche Daten und wozu: Name, Kontaktdaten, Anschrift, Mietbeginn, Miete und Zahlungen, Kaution, Zählerstände, Meldungen (Schäden, Hausordnung) mit Fotos, Nachrichten, Verträge und Protokolle. Zweck: Durchführung des Mietverhältnisses (Art. 6 Abs. 1 lit. b DSGVO), gesetzliche Pflichten wie Nebenkostenabrechnung und Steuer (lit. c) sowie berechtigte Interessen wie Hausordnung und Instandhaltung (lit. f). Kontakt per WhatsApp nur mit Ihrer Einwilligung (lit. a), jederzeit widerrufbar.

3. Hilfsmittel: Ich verwalte die Daten mit der App „JoumHome“. Für das Auslesen von Belegen und Fotos sowie für Texthilfen wird ein KI-Dienst (Anthropic) als Auftragsverarbeiter eingesetzt; dabei können Daten in die USA übermittelt werden (EU-Standardvertragsklauseln). ${window.JH?"Die App läuft auf einem Server in Deutschland (Hetzner, Nürnberg).":""}

4. Weitergabe: an Handwerker nur, soweit für einen Auftrag nötig (Name/Telefon nur mit Ihrem Einverständnis), an Steuerberater, Messdienst, Behörden oder Anwalt nur, soweit erforderlich.

5. Zahlungs- und Hausordnungs-Übersicht („Score“): Sie dient nur meiner eigenen Verwaltung, wird nicht weitergegeben und Sie können sie in Ihrer App einsehen. Es gibt keine automatisierte Entscheidung.

6. Speicherdauer: für die Dauer des Mietverhältnisses; danach so lange, wie Ansprüche bestehen können (in der Regel 3 Jahre) bzw. gesetzliche Aufbewahrungsfristen gelten (bis zu 10 Jahre für steuerlich relevante Unterlagen).

7. Ihre Rechte: Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch gegen Verarbeitung aus berechtigtem Interesse sowie Widerruf erteilter Einwilligungen. Beschwerde bei einer Datenschutz-Aufsichtsbehörde, z. B. der LDI NRW.

Stand: ${fmtDate(today())}`; }
function dsSheet(){ const T=dsText(); openSheet(`<div class="spread"><h2>Datenschutzhinweise</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="card" style="white-space:pre-wrap;font-size:13px;line-height:1.5">${esc(T)}</div>${isTenant()?"":`<div class="row end"><button class="btn pri" id="ds_pdf">Als PDF</button></div><div class="small">Muster ohne Gewähr – bitte prüfen und ergänzen. Mieter sehen den Text in ihrer App unter Profil.</div>`}`); const b=$("#ds_pdf"); if(b) b.onclick=()=>{ const {jsPDF}=window.jspdf; const d=new jsPDF({unit:"mm",format:"a4"}); jhLogo(d,172,10,16,18.3); d.setFont("helvetica","normal"); d.setFontSize(10); let y=24; for(const ln of d.splitTextToSize(T,170)){ if(y>276){ d.addPage(); y=20; } d.text(ln,20,y); y+=5; } saveFile(`Datenschutzhinweise_Mieter.pdf`,d.output("blob")); }; }

Object.assign(ACT,{
  co2Scan:async(d={})=>{ const files=await scanPages({multi:true,title:"Brennstoff-/Versorgerrechnung",tip:"Seite mit den CO₂-Angaben fotografieren (Gas, Öl, Fernwärme)."}); if(!files.length){ render(); return; } const imgs=await Promise.all(files.map(f=>compress(f))); openSheet(`<div class="ai"><span class="spin"></span><span>KI liest die CO₂-Angaben …</span></div>`);
    const r=await aiJson(`Die Fotos zeigen eine deutsche Gas-, Heizöl- oder Fernwärmerechnung. Lies die Angaben nach CO2KostAufG/BEHG. Antworte nur mit JSON {"art":"Gas|Heizöl|Fernwärme|Flüssiggas","kg":CO2-Ausstoß in kg als Zahl oder null (Tonnen × 1000),"kosten":CO2-Kosten in Euro brutto als Zahl oder null,"zeitraum":"oder null"}`,imgs); closeSheet();
    if(r.err||!r.v){ toast(r.err||"Nicht gelesen"); render(); return; } const rec=nkRec(st.nkO,String(st.year)); const c={...(rec.co2||{})}; const add=d.add==="1"; if(r.v.art) c.art=r.v.art; if(num(r.v.kg)) c.kg=r2((add?(+c.kg||0):0)+num(r.v.kg)); if(num(r.v.kosten)) c.kosten=r2((add?(+c.kosten||0):0)+num(r.v.kosten)); await nkPatch({co2:c}); toast(`CO₂-Angaben gelesen${r.v.zeitraum?" ("+r.v.zeitraum+")":""} – bitte prüfen`); render(); },
  bkOpen:()=>bkSheet(), bkNow:async()=>{ await autoBackup(true); bkSheet(); }, bkRestore:d=>bkRestore(d.i),
  bkFull:async()=>{ if(typeof umzugExport!=="function"){ toast("Hier nicht verfügbar"); return; } await umzugExport(); try{ const nb={...(st.backup||{}),full:today()}; await st.db.doc("config/backup").set(nb); st.backup=nb; }catch(e){} },
  kaution:d=>kautionSheet(d.id), fristen:()=>fristenSheet(),
  icsAll:async()=>{ const E=fristen(); await saveFile(`JoumHome-Fristen_${today()}.ics`,new Blob([icsOf(E)],{type:"text/calendar"})); },
  dsInfo:()=>dsSheet()
});
function extraAttention2(att){
  if(st.role==="master"&&st.backup!==undefined){ const B=st.backup||{}; if(!B.full||days(B.full,today())>31) att.push({c:"neutral",t:"Komplett-Sicherung herunterladen",s:B.full?`Letzte am ${fmtDate(B.full)} – einmal im Monat empfohlen`:"Noch nie – sichert alle Daten mit Fotos und PDFs als ZIP",a:`<button class="btn sm" data-act="bkOpen">Datensicherung</button>`}); }
  list("mieter").forEach(m=>{ const e=mEnde(m); if(e&&e<=today()&&!m.kautionAbr&&(+m.kautionGezahlt||+m.kaution)) att.push({c:"warn",t:`Kaution abrechnen: ${m.name}`,s:`Mietende ${fmtDate(e)}`,a:`<button class="btn sm pri" data-act="kaution" data-id="${esc(m.id)}">Kautionsabrechnung</button>`}); });
  const n=fristen().filter(e=>e.d>=today()&&days(today(),e.d)<=30).length; att.push({c:"neutral",t:`Fristen & Termine`,s:n?`${n} in den nächsten 30 Tagen`:"Alles im Blick – Kalender ansehen oder ins Handy übernehmen",a:`<button class="btn sm" data-act="fristen">Kalender</button>`});
}
const _mx=mieterExtra; mieterExtra=function(m){ const ka=m.kautionAbr; return _mx(m)+`<section class="card" style="display:flex;flex-direction:column;gap:6px"><div class="spread"><h3>Kaution</h3>${ka?`<span class="pill ok">abgerechnet ${esc(fmtDate(ka.datum))}</span>`:""}</div><div class="small">Gezahlt ${eur(+m.kautionGezahlt||0)} von ${eur(+m.kaution||0)}${mEnde(m)?` · Mietende ${esc(fmtDate(mEnde(m)))}`:""}</div><div class="row"><button class="btn sm" data-act="kaution" data-id="${esc(m.id)}">Kautionsabrechnung</button></div></section>`; };

/* =========================================================
   12) BELEG → TICKET & KOSTENTRÄGER (z. B. Transporter für einen Schaden)
   ========================================================= */
function belegTicketsOf(){ const grenze=addM(today(),-3); return tickets().filter(t=>t.s!=="Erledigt"||String(t.d.geaendert||t.d.datum||"").slice(0,10)>=grenze).sort((a,b)=>(+b.d.nr||0)-(+a.d.nr||0)).slice(0,40); }
function belegTicketListe(h){ const L=belegTicketsOf(); return L.length?L.map(t=>`#${t.d.nr} ${t.col==="schaeden"?"Schaden":"Verstoß"}: ${tTitle(t.col,t.d).slice(0,70)} (${wohnFull(t.d.wohnungId)}${mieterOf(t.d.wohnungId)?", Mieter "+mieterOf(t.d.wohnungId).name:""})`).join("; "):"keine"; }
function belegZuordnung(form,v,o){
  if(!form||form!==F) return; const ctx=o?.hidden?.ticketId?{col:o.hidden.ticketCol,id:o.hidden.ticketId}:null;
  const L=belegTicketsOf(); const byNr=nr=>L.find(t=>String(t.d.nr)===String(nr).replace("#",""));
  const vor=ctx?L.find(t=>t.col===ctx.col&&t.d.id===ctx.id)||{col:ctx.col,d:st.data[ctx.col]?.[ctx.id]}:(v.ticketNr?byNr(v.ticketNr):null);
  if(!ctx&&!v.vermietung&&!vor){ belegVerbund(form,v); return; }
  let box=document.getElementById("zuoBox"); if(!box){ box=document.createElement("div"); box.id="zuoBox"; box.className="card"; box.style.cssText="display:flex;flex-direction:column;gap:8px"; const anchor=document.getElementById("posBox")||document.getElementById("aiBox"); if(anchor) anchor.insertAdjacentElement("afterend",box); else $("#sheet .fields")?.insertAdjacentElement("beforebegin",box); }
  const sel0=vor?.d?`${vor.col}|${vor.d.id}`:"";
  const title=v.vermietung?`${v.vermietArt||"Mietfahrzeug / Mietgerät"} erkannt`:ctx?"Wer zahlt diese Kosten?":"Passt zu einem Ticket?";
  box.innerHTML=`<b>${esc(title)}</b>
   <div class="small">${v.vermietung?"Wurde das für einen Schaden oder eine Reparatur gemietet? Dann ordne es dem Ticket zu und entscheide, wer zahlt.":ctx?"Du entscheidest: Übernimmst du die Kosten oder hat der Mieter den Schaden verursacht?":`Die KI meint: passt zu Ticket #${esc(String(vor.d.nr))}${v.ticketGrund?" – "+esc(v.ticketGrund):""}. Bitte bestätigen.`}</div>
   <div class="field full"><label for="zuo_t">Ticket</label><select id="zuo_t"><option value="">– kein Ticket –</option>${L.map(t=>`<option value="${t.col}|${esc(t.d.id)}"${`${t.col}|${t.d.id}`===sel0?" selected":""}>#${esc(String(t.d.nr))} ${esc(tTitle(t.col,t.d).slice(0,50))} · ${esc(wohnFull(t.d.wohnungId))}</option>`).join("")}${vor?.d&&!L.includes(vor)?`<option value="${sel0}" selected>#${esc(String(vor.d.nr))} ${esc(tTitle(vor.col,vor.d).slice(0,50))}</option>`:""}</select></div>
   <div class="row"><button type="button" class="btn sm" data-zk="Vermieter">Vermieter übernimmt</button><button type="button" class="btn sm" data-zk="Mieter (verursacht)">Mieter zahlt (hat es verursacht)</button></div>
   <div class="small" id="zuo_info"></div>`;
  const apply=()=>{ const tv=$("#zuo_t").value; const kt=document.getElementById("f_kostentraeger")?.value||"Vermieter";
    box.querySelectorAll("[data-zk]").forEach(b=>b.classList.toggle("pri",b.dataset.zk===kt));
    form.hidden=form.hidden||{};
    if(tv){ const [col,id]=tv.split("|"); const t=st.data[col]?.[id]; form.hidden.ticketCol=col; form.hidden.ticketId=id;
      if(t?.wohnungId){ const w=wohn(t.wohnungId); const fo=document.getElementById("f_objektId"); if(fo&&w){ fo.value=w.objektId; fo.dispatchEvent(new Event("change",{bubbles:true})); } setTimeout(()=>{ const fw=document.getElementById("f_wohnungId"); if(fw){ fw.value=t.wohnungId; } },50); }
      const fb=document.getElementById("f_beschreibung"); const pre=`${v.vermietung?(v.vermietArt||"Miete")+" für ":""}#${t?.nr} `; if(fb&&!fb.value.includes(`#${t?.nr}`)) fb.value=(pre+(fb.value||tTitle(col,t))).slice(0,140);
    } else { delete form.hidden.ticketCol; delete form.hidden.ticketId; }
    const m=tv?mieterOf(st.data[tv.split("|")[0]]?.[tv.split("|")[1]]?.wohnungId):null;
    $("#zuo_info").textContent=kt==="Mieter (verursacht)"?`Wird beim Mieter${m?" "+m.name:""} als Forderung geführt (Ticket, Zahlungen/Mahnung). Für den Steuerberater: erst einmal deine Ausgabe; wenn der Mieter zahlt, „Vom Mieter erstattet“ anhaken – dann zählt es als Einnahme.`:`Du trägst die Kosten – für den Steuerberater als Werbungskosten (${document.getElementById("f_kategorie")?.value||"Reparatur"}).`; };
  box.querySelectorAll("[data-zk]").forEach(b=>b.onclick=()=>{ const k=document.getElementById("f_kostentraeger"); if(k){ k.value=b.dataset.zk; k.dispatchEvent(new Event("change",{bubbles:true})); } if(b.dataset.zk==="Mieter (verursacht)"){ const u=document.getElementById("f_umlage"); if(u) u.checked=false; } if(v.vermietung){ const kk=document.getElementById("f_kategorie"); if(kk&&$("#zuo_t").value) kk.value="Reparatur/Handwerker"; } apply(); });
  $("#zuo_t").onchange=apply;
  if(v.vermietung&&(vor||ctx)){ const kk=document.getElementById("f_kategorie"); if(kk) kk.value="Reparatur/Handwerker"; }
  apply();
  belegVerbund(form,v);
  if(v.vermietung||vor){ const t=document.getElementById("aiTxt"); if(t) t.textContent=(t.textContent||"")+` · ${v.vermietung?(v.vermietArt||"Miete")+" erkannt":"Ticket #"+vor.d.nr+" vorgeschlagen"} – bitte unten zuordnen und entscheiden, wer zahlt.`; }
}

/* =========================================================
   13) ZUSAMMENGEHÖRIGE BELEGE (z. B. Tür + Anhänger am selben Tag)
   ========================================================= */
const SPERR_RE=/\b(t[üu]r|haust[üu]r|zarge|fenster|badewanne|duschwanne|dusch|waschmaschine|trockner|k[üu]hlschrank|herd|backofen|sp[üu]lmaschine|k[üu]che|schrank|sofa|couch|matratze|bett|heizk[öo]rper|boiler|therme|gipskarton|rigips|osb|platten|laminat|parkett|fliesen|balken|bretter|kantholz|zement|estrich|beton|m[öo]bel|regal|zaun|t[üu]rblatt|container|sperrm[üu]ll)/i;
const MIET_RE=/\b(transporter|anh[äa]nger|mietwagen|sprinter|kleinbus|lkw|vermietung|mietger[äa]t|leihger[äa]t|container)\b/i;
const istSperrig=a=>!!a.sperrig||SPERR_RE.test([a.beschreibung,a.sperrigArtikel,...(a.positionen||[]).filter(p=>!p.privat).map(p=>p.text)].join(" "));
const istMiete=a=>!!a.vermietung||MIET_RE.test([a.beschreibung,a.haendler,a.vermietArt].join(" "));
const kurz=a=>`${a.vermietArt||a.sperrigArtikel||a.beschreibung||a.kategorie||"Beleg"}${a.haendler?" ("+a.haendler+")":""}, ${eur(a.betrag)}`.slice(0,80);
function partnerBelege(datum,rolle,eigeneId){
  if(!datum) return [];
  return list("ausgaben").filter(a=>a.id!==eigeneId&&a.datum&&Math.abs(days(a.datum,datum))<=1&&(rolle==="miete"?istSperrig(a):istMiete(a))).sort((a,b)=>Math.abs(days(a.datum,datum))-Math.abs(days(b.datum,datum)));
}
function belegVerbund(form,v){
  if(!form||form!==F) return; const datum=val("f_datum")||v.datum; const rolle=v.vermietung?"miete":(v.sperrig?"kauf":null); if(!rolle) return;
  form.hidden=form.hidden||{}; Object.assign(form.hidden,{vermietung:!!v.vermietung,vermietArt:v.vermietArt||null,sperrig:!!v.sperrig,sperrigArtikel:v.sperrigArtikel||null});
  const P=partnerBelege(datum,rolle,null); if(!P.length) return;
  let box=document.getElementById("vbBox"); if(!box){ box=document.createElement("div"); box.id="vbBox"; box.className="card"; box.style.cssText="display:flex;flex-direction:column;gap:8px"; const anchor=document.getElementById("zuoBox")||document.getElementById("posBox")||document.getElementById("aiBox"); if(anchor) anchor.insertAdjacentElement("afterend",box); }
  box.innerHTML=`<b>${rolle==="miete"?"Passender Einkauf am selben Tag":"Am selben Tag gemietet"}</b>
   <div class="small">${rolle==="miete"?`Der ${esc(v.vermietArt||"Transporter")} wurde vermutlich für diesen sperrigen Einkauf gebraucht:`:`Für ${esc(v.sperrigArtikel||"diesen Einkauf")} wurde vermutlich das gemietet:`}</div>
   ${P.slice(0,4).map((a,i)=>{ const t=a.ticketId?st.data[a.ticketCol]?.[a.ticketId]:null; return `<label class="nkfx"><input type="radio" name="vb" value="${esc(a.id)}"${i===0?" checked":""}> <span>${esc(fmtDate(a.datum))} · ${esc(kurz(a))}${t?` · Ticket #${esc(String(t.nr))}`:""} · ${isMK(a)?"Mieter zahlt":"Vermieter"}</span></label>`; }).join("")}
   <label class="nkfx"><input type="radio" name="vb" value=""> <span>Gehört nicht zusammen</span></label>
   <div class="small">Verknüpfte Belege bekommen dasselbe Ticket, dieselbe Wohnung und denselben Kostenträger.</div>`;
  const pick=()=>{ const id=box.querySelector("input[name=vb]:checked")?.value; return id?st.data.ausgaben[id]:null; };
  const uebernehmen=()=>{ const a=pick(); if(!a) return; if(rolle==="miete"&&a.ticketId){ const s0=document.getElementById("zuo_t"); const key=`${a.ticketCol}|${a.ticketId}`; if(s0){ if(![...s0.options].some(o=>o.value===key)){ const t=st.data[a.ticketCol]?.[a.ticketId]; s0.insertAdjacentHTML("beforeend",`<option value="${esc(key)}">#${esc(String(t?.nr||""))} ${esc(tTitle(a.ticketCol,t||{}).slice(0,50))}</option>`); } s0.value=key; s0.dispatchEvent(new Event("change")); } }
    const fo=document.getElementById("f_objektId"); if(fo&&a.objektId&&fo.value!==a.objektId){ fo.value=a.objektId; fo.dispatchEvent(new Event("change",{bubbles:true})); } setTimeout(()=>{ const fw=document.getElementById("f_wohnungId"); if(fw&&a.wohnungId) fw.value=a.wohnungId; },60);
    if(rolle==="miete"){ const k=document.getElementById("f_kostentraeger"); if(k){ k.value=a.kostentraeger||"Vermieter"; k.dispatchEvent(new Event("change",{bubbles:true})); } document.querySelectorAll("#zuoBox [data-zk]").forEach(b=>b.classList.toggle("pri",b.dataset.zk===(a.kostentraeger||"Vermieter"))); const kk=document.getElementById("f_kategorie"); if(kk) kk.value="Reparatur/Handwerker"; } };
  box.querySelectorAll("input[name=vb]").forEach(r=>r.onchange=uebernehmen); uebernehmen();
  form.afterSave=async(id,data)=>{ const a=pick(); if(!a) return; const me=kurz({...data,...form.hidden}); const gruppe=a.gruppe||("grp-"+a.id);
    const patchMe={gruppe,mitBeleg:kurz(a)}; const patchA={gruppe,mitBeleg:me};
    if(rolle==="kauf"){ ["ticketCol","ticketId","kostentraeger","objektId","wohnungId"].forEach(k=>{ if(data[k]!=null&&data[k]!=="") patchA[k]=data[k]; }); if(data.ticketId) patchA.kategorie="Reparatur/Handwerker"; }
    await st.db.collection("ausgaben").doc(id).update(patchMe); await st.db.collection("ausgaben").doc(a.id).update(patchA);
    if(rolle==="kauf"&&data.ticketId&&!a.ticketId&&typeof logT==="function") await logT(data.ticketCol,data.ticketId,`${a.vermietArt||"Mietfahrzeug"} ${eur(a.betrag)} mit verknüpft – ${isMK(data)?"trägt Mieter":"trägt Vermieter"}`).catch(()=>{});
    toast(`Mit „${kurz(a)}“ verknüpft`); };
}

/* =========================================================
   14) WLAN je Mieter (eigenes Passwort, Sperre bei Rückstand nach TKG-Regeln)
   ========================================================= */
const WL_SYS=[["fritzrep","FRITZ!Box + Repeater pro Wohnung"],["unifi","UniFi (Private Pre-Shared Keys)"],["omada","TP-Link Omada (PPSK)"],["fritz","FRITZ!Box"],["anderes","Anderes System"]];
const WORTE=["Apfel","Birke","Ahorn","Wolke","Sonne","Kiesel","Linde","Fluss","Hafen","Mond","Tanne","Stern","Feder","Welle","Insel","Moos","Nebel","Falke","Biber","Otter","Rabe","Quelle","Wiese","Eiche","Kranich","Lerche","Bucht","Dachs","Fuchs","Meise"];
function wlKey(){ const r=new Uint32Array(4); crypto.getRandomValues(r); return `${WORTE[r[0]%WORTE.length]}-${WORTE[r[1]%WORTE.length]}-${WORTE[r[2]%WORTE.length]}-${String(1000+r[3]%9000)}`; }
function wlSysOf(m){ return st.data.objekte[wohn(m.wohnungId)?.objektId]?.wlan?.system||"unifi"; }
function wlSsidVorschlag(m){ const w=wohn(m.wohnungId); const nn=String(m.name||"").trim().split(/\s+/).pop()||"Mieter"; const t=x=>String(x||"").replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/Ä/g,"Ae").replace(/Ö/g,"Oe").replace(/Ü/g,"Ue").replace(/ß/g,"ss").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,""); return ("WLAN-"+t(nn)+(w?.lage?"-"+t(w.lage):"")).slice(0,32); }
function wlSsid(m){ const W=m.wlan||{}; const o=st.data.objekte[wohn(m.wohnungId)?.objektId]||{}; return (o.wlan?.system==="fritzrep"&&W.ssid)?W.ssid:(o.wlan?.ssid||""); }
function wlVlan(m){ const ws=wsOf(wohn(m.wohnungId)?.objektId||""); const i=ws.findIndex(w=>w.id===m.wohnungId); return 10+10*Math.max(0,i); }
function wlMonate(m){ const W=m.wlan||{}; const start=(W.seit||m.beginn||today()).slice(0,7); const out=[]; let ym=start; const cur=curYm(); const faellig=new Date().getDate()>3?cur:addM(cur+"-01",-1).slice(0,7); let n=0; while(ym<=faellig&&n<36){ out.push(ym); ym=addM(ym+"-01",1).slice(0,7); n++; } return out; }
function wlBezahlt(m,ym){ const W=m.wlan||{}; if(W.bezahlt&&W.bezahlt[ym]!=null) return !!W.bezahlt[ym]; if(W.zahlweise==="mit Miete"){ const z=list("zahlungen").find(z=>z.wohnungId===m.wohnungId&&z.monat===ym); return !!z&&(+z.bezahlt||0)>=(+z.soll||sollOf(m.wohnungId))+(+W.gebuehr||0)-0.5; } return false; }
function wlRueck(m){ const W=m.wlan||{}; if(W.art!=="separat"||!(+W.gebuehr)) return {betrag:0,monate:[]}; const of=wlMonate(m).filter(ym=>!wlBezahlt(m,ym)); return {betrag:r2(of.length*(+W.gebuehr)),monate:of}; }
function wlState(m){ const W=m.wlan||{}, R=wlRueck(m); const ange=W.angedrohtAm?days(W.angedrohtAm,today()):null;
  const darfAndrohen=W.art==="separat"&&W.status!=="gesperrt"&&R.betrag>=100&&!W.angedrohtAm;
  const darfSperren=W.art==="separat"&&W.status!=="gesperrt"&&R.betrag>=100&&ange!=null&&ange>=14;
  return {W,R,ange,darfAndrohen,darfSperren}; }
function wlAnleitung(o,m,was){ const sys=o?.wlan?.system||"unifi", ssid=o?.wlan?.ssid||"(Netzname)", W=m.wlan||{}, lage=wohn(m.wohnungId)?.lage||m.wohnungId;
  if(sys==="fritzrep"){ const rs=W.ssid||wlSsidVorschlag(m);
    if(was==="sperren") return `Im Haus-WLAN mit dem Handy oder Laptop „fritz.repeater“ bzw. die Adresse des Repeaters in ${lage} öffnen (oder in der FRITZ!Box unter Heimnetz → Mesh auf den Repeater „${rs}“ tippen) → WLAN → Sicherheit → WLAN-Netzwerkschlüssel ersetzen durch „${W.sperrKey||"(neuer Schlüssel)"}“ → Übernehmen. Diesen Schlüssel bekommt der Mieter NICHT – alle seine Geräte fliegen sofort raus.`;
    return `Repeater in ${lage} in die Steckdose stecken. WICHTIG: nicht mit der WPS-/Connect-Taste koppeln (sonst übernimmt er Namen und Passwort der FRITZ!Box). Stattdessen: Handy mit dem WLAN „FRITZ!Repeater …“ verbinden → „fritz.repeater“ öffnen → Assistent: als WLAN-Brücke mit der FRITZ!Box „${ssid}“ verbinden → danach unter WLAN → Funknetz den Namen „${rs}“ und unter WLAN → Sicherheit den Schlüssel „${W.key}“ eintragen → Übernehmen.`; }
  if(sys==="unifi") return was==="sperren"?`UniFi Network öffnen → Einstellungen → WiFi → „${ssid}“ → Private Pre-Shared Keys → Eintrag „${lage}“ löschen → Übernehmen. Alle Geräte mit diesem Passwort werden sofort getrennt.`:`UniFi Network → Einstellungen → WiFi → „${ssid}“ → Private Pre-Shared Keys → „Hinzufügen“: Passwort „${W.key}“, Netzwerk/VLAN ${W.vlan||wlVlan(m)}, Name „${lage}“ → Übernehmen.`;
  if(sys==="omada") return was==="sperren"?`Omada Controller → Einstellungen → Profile → PPSK → Eintrag „${lage}“ löschen bzw. deaktivieren → Speichern. Alle Geräte mit diesem Passwort werden getrennt.`:`Omada Controller → Profile → PPSK → Eintrag „${lage}“: Passwort „${W.key}“, VLAN ${W.vlan||wlVlan(m)} → Speichern.`;
  if(sys==="fritz") return `Tipp: Stell im Tab WLAN das System auf „FRITZ!Box + Repeater pro Wohnung“. Achtung: Eine FRITZ!Box kann kein eigenes Passwort je Wohnung im selben Netz. Möglich ist nur, das Passwort für alle zu ändern (dann sind alle Mieter draußen) oder für diese Wohnung einen eigenen Access Point bzw. eine eigene FRITZ!Box zu nutzen. Für getrennte Passwörter empfehle ich UniFi oder Omada mit PPSK.`;
  return was==="sperren"?`Im Router/Controller das Passwort „${W.oldKey||W.key}“ für ${lage} löschen oder deaktivieren.`:`Im Router/Controller für ${lage} das Passwort „${W.key}“ eintragen.`;
}
function wlQr(ssid,key,px=180){ if(typeof qrcode!=="function"||!ssid||!key) return ""; const e=x=>String(x).replace(/([\;,:"])/g,"\\$1"); try{ const q=qrcode(0,"M"); q.addData(`WIFI:T:WPA;S:${e(ssid)};P:${e(key)};;`); q.make(); const n=q.getModuleCount(), c=Math.max(2,Math.floor(px/(n+8))); return `<div style="background:#fff;padding:${c*4}px;border-radius:10px;display:inline-block;line-height:0">${q.createSvgTag({cellSize:c,margin:0,scalable:false})}</div>`; }catch(e){ return ""; } }
function vWlan(oid){
  const o=st.data.objekte[oid]||{}, C=o.wlan||{}; const ms=list("mieter").filter(m=>m.aktiv!==false&&wohn(m.wohnungId)?.objektId===oid);
  return `<section class="card" style="display:flex;flex-direction:column;gap:8px"><h3>WLAN des Hauses</h3>
   <div class="fields">${fld(C.system==="fritzrep"?"Netz der FRITZ!Box im Haus":"Netzname (SSID)",inp("wl_ssid",C.ssid,"text","z. B. Riestestrasse16"))}${fld("System",sel("wl_sys",WL_SYS,C.system||"unifi"))}</div>
   <div class="row"><button class="btn sm pri" id="wl_save" data-o="${esc(oid)}">Speichern</button></div>
   ${C.system==="fritzrep"?`<div class="small">Jede Wohnung bekommt einen eigenen FRITZ!Repeater mit eigenem Netznamen (z. B. „WLAN-Demir-1OG“) und eigenem Passwort. Gesperrt wird, indem du am Repeater dieser Wohnung den Schlüssel änderst – alle Geräte des Mieters fliegen raus, die anderen merken nichts. Das Passwort der FRITZ!Box selbst bekommt kein Mieter. Gut zu wissen: Repeater hängen per Funk an der FRITZ!Box und teilen sich deren Geschwindigkeit; Mieter im selben Haus-Netz können sich gegenseitig „sehen“ (Drucker, Fernseher).</div>`:`<div class="small">Jede Wohnung bekommt ein eigenes Passwort im selben Netz (PPSK). Wird ein Passwort gelöscht, fliegen alle Geräte raus, die es benutzen – die anderen Mieter merken nichts. Die App steuert den Router nicht direkt; sie zeigt dir den genauen Handgriff (mit eigenem Server ist später Automatik möglich).</div>`}</section>
  <section class="list"><div class="sec-title"><h2>WLAN je Mieter</h2><span>${ms.length}</span></div>
  ${ms.map(m=>{ const S=wlState(m), W=S.W; const st0=W.status==="gesperrt"?"bad":S.R.betrag>=100?"warn":"ok";
    return `<div class="item s-${W.art?st0:"neutral"}"><div class="head"><div><b>${esc(m.name)}</b><div class="meta">${esc(wohnFull(m.wohnungId))}${W.art?` · ${esc(W.art==="separat"?`eigene Gebühr ${eur(+W.gebuehr||0)}/Monat`:W.art==="inklusive"?"in der Miete enthalten":"kein Internet")}`:" · noch nicht eingerichtet"}</div></div>${W.status==="gesperrt"?`<span class="pill bad">gesperrt</span>`:W.key?`<span class="pill ok">aktiv</span>`:""}</div>
     ${W.key&&W.status!=="gesperrt"?`<div class="small">${C.system==="fritzrep"?`Repeater: <b>${esc(W.ssid||wlSsidVorschlag(m))}</b> · `:""}Passwort: <b>${esc(W.key)}</b>${C.system==="fritzrep"?"":` · VLAN ${esc(String(W.vlan||wlVlan(m)))}`}</div>`:""}${W.ssid&&C.system==="fritzrep"&&W.ssid!==wlSsidVorschlag(m)&&W.mieterName&&W.mieterName!==m.name?`<div class="small">Name passt nicht mehr zum Mieter → unter Einstellungen ändern.</div>`:""}
     ${W.art==="separat"?`<div class="small">${S.R.betrag>0?`Offen: ${eur(S.R.betrag)} (${S.R.monate.map((y=>fmtYm(y,"de"))).join(", ")})`:"Internet-Gebühr bezahlt"}${W.angedrohtAm?` · Sperre angedroht am ${esc(fmtDate(W.angedrohtAm))}${S.ange<14?` (Sperre frühestens ab ${esc(fmtDate(addM(W.angedrohtAm,0)&&dStr(new Date(dParse(W.angedrohtAm).getTime()+14*864e5))))})`:""}`:""}</div>`:""}
     <div class="row"><button class="btn sm" data-act="wlEdit" data-id="${esc(m.id)}">${W.art?"Einstellungen":"Einrichten"}</button>${W.art==="separat"?`<button class="btn sm" data-act="wlPay" data-id="${esc(m.id)}">Zahlungen</button>`:""}${W.key&&W.status!=="gesperrt"?`<button class="btn sm" data-act="wlNeu" data-id="${esc(m.id)}">Neues Passwort</button>`:""}${S.darfAndrohen?`<button class="btn sm pri" data-act="wlDroh" data-id="${esc(m.id)}">Sperre androhen</button>`:""}${S.darfSperren?`<button class="btn sm danger" data-act="wlSperr" data-id="${esc(m.id)}">Sperren</button>`:""}${W.status==="gesperrt"?`<button class="btn sm pri" data-act="wlFrei" data-id="${esc(m.id)}">Entsperren</button>`:""}${W.art?`<button class="btn sm ghost" data-act="wlBriefe" data-id="${esc(m.id)}">Briefe</button>`:""}</div></div>`; }).join("")||emptyBox("Keine aktiven Mieter in diesem Haus.")}</section>
  <p class="small">Sperren nur, wenn Internet als eigene Leistung mit eigener Gebühr vereinbart ist (Muster: „Vereinbarung Internet/WLAN“), mindestens 100 € offen sind und die Sperre 2 Wochen vorher schriftlich angedroht wurde – angelehnt an § 61 TKG. Ist Internet in der Miete enthalten, darf es wegen Mietrückstand nicht abgeschaltet werden (unzulässige Versorgungssperre). Keine Rechtsberatung.</p>`;
}
async function wlSet(m,patch,log){ const W={...(m.wlan||{}),...patch}; if(log) W.log=[...(W.log||[]),{t:new Date().toISOString(),text:log}].slice(-30); await dbUpd("mieter",m.id,{wlan:W}); if(typeof syncPortals==="function") syncPortals(); return W; }
function wlShowKey(m,titel){ const o=st.data.objekte[wohn(m.wohnungId)?.objektId]||{}, W=m.wlan||{};
  openSheet(`<div class="spread"><h2>${esc(titel)}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>
  <div class="note info">${esc(wlAnleitung(o,m,"anlegen"))}</div>
  <div style="text-align:center">${wlQr(wlSsid(m),W.key,200)}</div><div class="small" style="text-align:center">Netz: <b>${esc(wlSsid(m)||"–")}</b> · Passwort: <b>${esc(W.key)}</b></div>
  <div class="row">${waBtn(m.telefon,`Hallo ${m.name},\n\nIhr WLAN-Zugang:\nNetz: ${wlSsid(m)}\nPasswort: ${W.key}\n\nDas Passwort gilt nur für Ihre Wohnung – bitte nicht weitergeben. Sie finden es auch in der App unter „Mein WLAN“ (mit QR-Code).\n\nViele Grüße\n${st.cfg?.name||""}`,"Per WhatsApp senden")}<button class="btn sm" id="wl_cp">Passwort kopieren</button></div>
  <div class="small">Der Mieter sieht das Passwort auch in seiner App unter „Mein WLAN“.</div>`);
  $("#wl_cp").onclick=async()=>{ try{ await navigator.clipboard.writeText(W.key); toast("Kopiert"); }catch(e){} };
}
function wlTile(){ const p=pm(); const w=p?.wlan; if(!w) return "";
  return `<section class="card" style="display:flex;flex-direction:column;gap:8px"><div class="spread"><h3>${esc(tr("Mein WLAN"))}</h3>${w.status==="gesperrt"?`<span class="pill bad">${esc(tr("gesperrt"))}</span>`:`<span class="pill ok">${esc(tr("aktiv"))}</span>`}</div>
  ${w.status==="gesperrt"?`<div class="small">${esc(tr("Dein Internet-Zugang ist gesperrt, weil die Internet-Gebühr offen ist"))}: ${eur(w.rueckstand||0)}. ${esc(tr("Nach Zahlung bekommst du ein neues Passwort."))}</div>`:`<div class="small">${esc(tr("Netz"))}: <b>${esc(w.ssid||"")}</b></div><div class="small">${esc(tr("Passwort"))}: <b id="wlK" data-k="${esc(w.key||"")}">••••••••</b> <button class="btn sm ghost" id="wlShow" type="button">${esc(tr("Anzeigen"))}</button></div>
  <div style="text-align:center">${wlQr(w.ssid,w.key,170)}</div><div class="small" style="text-align:center">${esc(tr("QR-Code mit der Handy-Kamera scannen – fertig."))}</div>
  ${w.angedroht?`<div class="note warn">${esc(tr("Internet-Gebühr offen"))}: ${eur(w.rueckstand||0)} – ${esc(tr("Sperre angekündigt ab"))} ${esc(fmtDate(w.sperreAb))}.</div>`:""}
  <div class="small">${esc(tr("Nur für deine Wohnung – bitte nicht weitergeben."))}</div>`}
  <button class="btn sm" data-act="speed" type="button">${esc(tr("Speedtest starten"))}</button></section>`; }
document.addEventListener("click",async e=>{ const b=e.target.closest&&e.target.closest("#wl_save,#wlShow"); if(!b) return;
  if(b.id==="wlShow"){ const k=$("#wlK"); if(k) k.textContent=k.textContent.startsWith("•")?k.dataset.k:"••••••••"; return; }
  const oid=b.dataset.o; try{ await dbUpd("objekte",oid,{wlan:{...(st.data.objekte[oid].wlan||{}),ssid:val("wl_ssid"),system:val("wl_sys")}}); toast("Gespeichert"); if(typeof syncPortals==="function") syncPortals(); render(); }catch(x){ toast("Speichern fehlgeschlagen"); } });
Object.assign(ACT,{
  wlEdit:d=>{ const m=st.data.mieter[d.id]; if(!m) return; const W=m.wlan||{};
    openSheet(`<div class="spread"><h2>WLAN – ${esc(m.name)}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>
    <div class="fields">${fld("Internet",sel("wle_art",[["separat","Eigene Leistung mit monatlicher Gebühr"],["inklusive","In der Miete enthalten"],["keins","Kein Internet über mich"]],W.art||"separat"),1)}${fld("Gebühr € pro Monat",inp("wle_g",W.gebuehr,"number"))}${fld("Bezahlung",sel("wle_z",[["mit Miete","Mit der Miete überwiesen"],["separat","Eigene Überweisung (von Hand abhaken)"]],W.zahlweise||"mit Miete"))}${fld("Gilt ab",inp("wle_s",W.seit||m.beginn||today(),"date"))}${wlSysOf(m)==="fritzrep"?fld("Netzname des Repeaters",inp("wle_n",W.ssid||wlSsidVorschlag(m),"text"),1):fld("VLAN",inp("wle_v",W.vlan||wlVlan(m),"number"))}</div>
    <div class="note warn">Vor dem ersten Mieter mit Gebühr: 1) Erlaubt dein Internetvertrag die Weitergabe gegen Geld? 2) Meldepflicht bei der Bundesnetzagentur prüfen (Internet gegen Entgelt). Keine Rechtsberatung.</div><div class="small">Tipp: Für eine Sperre bei Nichtzahlung braucht es die schriftliche „Vereinbarung Internet/WLAN“ (unter Muster-Verträge → Zusatzverträge).</div>
    <div class="row end"><button class="btn" data-act="close">Abbrechen</button><button class="btn" data-act="wlVtr" data-id="${esc(m.id)}">Vereinbarung erstellen</button><button class="btn pri" id="wle_ok">Speichern</button></div>`);
    $("#wle_ok").onclick=async()=>{ const art=val("wle_art"); const patch={art,gebuehr:nval("wle_g")||0,zahlweise:val("wle_z"),seit:val("wle_s"),vlan:(document.getElementById("wle_v")?nval("wle_v"):null)||W.vlan||wlVlan(m)}; if(document.getElementById("wle_n")){ patch.ssid=(val("wle_n")||wlSsidVorschlag(m)).slice(0,32); patch.mieterName=m.name; } if(art==="keins"){ patch.status=null; } else if(!W.key){ patch.key=wlKey(); patch.status="aktiv"; }
      const W2=await wlSet(m,patch,W.art?"Einstellungen geändert":"WLAN eingerichtet"); closeSheet(); if(!W.key&&W2.key){ m.wlan=W2; wlShowKey(m,"WLAN-Zugang eingerichtet"); } else { toast("Gespeichert"); render(); } }; },
  wlNeu:async d=>{ const m=st.data.mieter[d.id]; if(!m) return; if(!await ask("Neues Passwort erzeugen? Alle Geräte mit dem alten Passwort fliegen raus, sobald du es im Router löschst.","Neu erzeugen")) return; const old=m.wlan?.key; const W=await wlSet(m,{key:wlKey(),oldKey:old},"Neues Passwort erzeugt"); m.wlan=W; wlShowKey(m,"Neues WLAN-Passwort"); },
  wlPay:d=>{ const m=st.data.mieter[d.id]; if(!m) return; const ms=wlMonate(m).slice(-12).reverse();
    openSheet(`<div class="spread"><h2>Internet-Zahlungen – ${esc(m.name)}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="small">${eur(+m.wlan?.gebuehr||0)} pro Monat. ${m.wlan?.zahlweise==="mit Miete"?"Automatisch bezahlt, wenn der Mieteingang Miete + Internet abdeckt – hier kannst du es von Hand ändern.":"Bezahlte Monate abhaken."}</div><div class="list">${ms.map(ym=>`<label class="nkfx"><input type="checkbox" data-wym="${ym}"${wlBezahlt(m,ym)?" checked":""}> <span>${esc(fmtYm(ym,"de"))}</span></label>`).join("")||emptyBox("Noch keine fälligen Monate.")}</div><div class="row end"><button class="btn pri" id="wlp_ok">Speichern</button></div>`);
    $("#wlp_ok").onclick=async()=>{ const bz={...(m.wlan?.bezahlt||{})}; document.querySelectorAll("[data-wym]").forEach(x=>{ bz[x.dataset.wym]=x.checked; }); const W=await wlSet(m,{bezahlt:bz}); m.wlan=W; const R=wlRueck(m); const patch={}; if(R.betrag<100&&W.angedrohtAm){ patch.angedrohtAm=null; } if(Object.keys(patch).length) await wlSet(m,patch,"Rückstand unter 100 € – Androhung erledigt"); closeSheet(); toast("Gespeichert"); render(); }; },
  wlDroh:async d=>{ const m=st.data.mieter[d.id]; if(!m) return; const S=wlState(m); if(!S.darfAndrohen) return; const ab=dStr(new Date(Date.now()+15*864e5));
    const body=`Sehr geehrte/r ${m.name},\n\nfür die Bereitstellung des Internet-/WLAN-Zugangs (Vereinbarung über ${eur(+S.W.gebuehr)} monatlich) sind folgende Beträge offen:\n\n${S.R.monate.map(ym=>`${fmtYm(ym,"de")}: ${eur(+S.W.gebuehr)}`).join("\n")}\nGesamt: ${eur(S.R.betrag)}\n\nBitte überweisen Sie den Betrag bis zum ${fmtDate(dStr(new Date(Date.now()+14*864e5)))}.${typeof bankLine==="function"?" "+bankLine():""}\n\nSollte der Betrag bis dahin nicht eingegangen sein, werde ich den Internet-/WLAN-Zugang frühestens ab dem ${fmtDate(ab)} sperren. Die Sperre betrifft ausschließlich den Internetzugang, nicht die Wohnung oder andere Leistungen. Sie wird nach Ausgleich des Rückstands unverzüglich aufgehoben.\n\nSie haben die Möglichkeit, gegen die Sperre gerichtlichen Rechtsschutz in Anspruch zu nehmen.\n\nMit freundlichen Grüßen\n\n${st.cfg?.name||""}`;
    const blob=letter({toLines:addrLines(m),betreff:"Offene Internet-Gebühr – Ankündigung einer Sperre des Internetzugangs",body:pT(body)});
    await wlSet(m,{angedrohtAm:today(),sperreAb:ab},`Sperre angedroht (${eur(S.R.betrag)} offen)`);
    openSheet(`<div class="spread"><h2>Sperre androhen</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="small">Die Androhung muss den Mieter mindestens 2 Wochen vor der Sperre schriftlich erreichen. Am sichersten per Einwurf-Einschreiben; der Mieter sieht den Hinweis zusätzlich in seiner App.</div><div class="row"><button class="btn pri" id="wd_dl">PDF speichern</button><button class="btn" id="wd_post">Per Post</button>${waBtn(m.telefon,`Hallo ${m.name}, für Ihr Internet sind ${eur(S.R.betrag)} offen. Bitte bis ${fmtDate(dStr(new Date(Date.now()+14*864e5)))} überweisen, sonst muss ich den Internetzugang ab ${fmtDate(ab)} sperren. Den Brief erhalten Sie zusätzlich per Post. Viele Grüße ${st.cfg?.name||""}`,"WhatsApp")}</div>`);
    $("#wd_dl").onclick=()=>saveFile(`Androhung_Internetsperre_${String(m.name).replace(/\s+/g,"_")}.pdf`,blob); $("#wd_post").onclick=()=>postSheet({blob,name:`Androhung_Internetsperre.pdf`,titel:"Androhung Internetsperre",mieterId:m.id}); },
  wlSperr:async d=>{ const m=st.data.mieter[d.id]; if(!m) return; const S=wlState(m); if(!S.darfSperren){ toast("Sperre noch nicht zulässig"); return; } if(!await ask(`Internet von ${m.name} sperren? Offen: ${eur(S.R.betrag)}.`,"Sperren")) return; const o=st.data.objekte[wohn(m.wohnungId)?.objektId]||{};
    const W=await wlSet(m,{status:"gesperrt",oldKey:S.W.key,key:null,gesperrtAm:today(),sperrKey:wlSysOf(m)==="fritzrep"?wlKey():null},`Gesperrt (${eur(S.R.betrag)} offen)`); m.wlan=W;
    openSheet(`<div class="spread"><h2>${wlSysOf(m)==="fritzrep"?"Jetzt am Repeater sperren":"Jetzt im Router sperren"}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="note warn">${esc(wlAnleitung(o,m,"sperren"))}</div><div class="small">In der App ist der Zugang gesperrt und das Passwort beim Mieter ausgeblendet. Wirklich getrennt werden die Geräte erst mit dem Handgriff oben.</div><div class="row end"><button class="btn" data-act="wlBrief" data-k="wlSperre" data-id="${esc(m.id)}">Mitteilung an Mieter (Brief)</button><button class="btn pri" data-act="close">Erledigt</button></div>`); },
  wlFrei:async d=>{ const m=st.data.mieter[d.id]; if(!m) return; const R=wlRueck(m); if(R.betrag>0&&!await ask(`Es sind noch ${eur(R.betrag)} offen. Trotzdem entsperren?`,"Entsperren")) return;
    const W=await wlSet(m,{status:"aktiv",key:wlKey(),angedrohtAm:null,sperreAb:null,sperrKey:null},"Entsperrt – neues Passwort"); m.wlan=W; wlShowKey(m,"Entsperrt – neues Passwort"); },
  wlVtr:d=>{ const m=st.data.mieter[d.id]; if(!m) return; const w=wohn(m.wohnungId), o=w?st.data.objekte[w.objektId]:null, W=m.wlan||{}; closeSheet();
    openVertrag("wlan",{mieterId:m.id,felder:{...ctxDef({m,w,o}),mAdr:[o?.adresse,w?.lage].filter(Boolean).join(", "),objAdr:o?.adresse||"",lage:w?.lage||"",beginn:W.seit||today(),gebuehr:W.gebuehr||null,ssid:wlSsid(m)}}); },
  wlBriefe:d=>{ const m=st.data.mieter[d.id]; if(!m) return; openSheet(`<div class="spread"><h2>Internet-Briefe – ${esc(m.name)}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="small">Alle Felder sind schon ausgefüllt. Du prüfst, unterschreibst und schickst per Post, App oder WhatsApp.</div><div class="list">${["wlan","wlDroh","wlSperre","wlFrei","wlKuendV"].map(k=>`<button class="vrow" data-act="${k==="wlan"?"wlVtr":"wlBrief"}" data-k="${k}" data-id="${esc(m.id)}"><span class="vt"><b>${esc(VTPL[k].t)}</b><small class="vk">${esc(VTPL[k].d)}</small></span><span class="chev">›</span></button>`).join("")}</div>`); },
  wlBrief:d=>{ const m=st.data.mieter[d.id]; if(!m||!VTPL[d.k]) return; closeSheet(); openVertrag(d.k,{mieterId:m.id,felder:wlBriefFelder(d.k,m)}); },
  wlGo:d=>{ closeSheet(); st.tab="haeuser"; st.mieter=null; st.objekt=d.o; st.osub="wlan"; render(); window.scrollTo(0,0); }
});
if(typeof VTPL==="object"&&!VTPL.wlan){
  VTPL.wlan={t:"Vereinbarung Internet/WLAN",d:"Internetzugang über das Haus-WLAN mit eigenem Passwort, monatlicher Gebühr und Regeln zur Sperre.",f:[...CTX_F,
   {k:"objAdr",l:"Anschrift der Wohnung",t:"text",full:1},{k:"lage",l:"Lage",t:"text"},{k:"beginn",l:"Gilt ab",t:"date",req:1},{k:"gebuehr",l:"Gebühr pro Monat €",t:"number",req:1},
   {k:"bandbreite",l:"Bandbreite (ca.)",t:"text"},{k:"ssid",l:"Netzname",t:"text"},{k:"sonst",l:"Sonstiges",t:"textarea",full:1}],
   text:v=>`Zwischen ${VS(v.vName)} – „Vermieter“ – und ${VS(v.mName)} – „Mieter“ – wird für die Wohnung ${VS(v.lage)}, ${VS(v.objAdr)} folgende Zusatzvereinbarung zum Mietvertrag geschlossen. Sie ist vom Mietvertrag unabhängig und gesondert kündbar.

§ 1 Leistung
Der Vermieter stellt dem Mieter ab ${VD(v.beginn)} einen Internetzugang über das Haus-WLAN „${VS(v.ssid)}“ zur Verfügung${v.bandbreite?` (Bandbreite ca. ${v.bandbreite}, je nach Auslastung)`:""}. Der Mieter erhält ein eigenes Passwort, das nur für seine Wohnung gilt. Er darf es nicht an Dritte außerhalb seines Haushalts weitergeben.

§ 2 Entgelt
Der Mieter zahlt dafür monatlich ${VE(v.gebuehr)}, fällig zusammen mit der Miete bis zum 3. Werktag des Monats.

§ 3 Nutzung
Der Mieter nutzt den Zugang nur im Rahmen der Gesetze. Er ist für seine Nutzung und Inhalte selbst verantwortlich. Bei begründetem Verdacht auf Missbrauch darf der Vermieter den Zugang vorübergehend sperren.

§ 4 Sperre bei Zahlungsverzug
Ist der Mieter mit Zahlungen aus dieser Vereinbarung mit mindestens 100 EUR in Verzug, darf der Vermieter den Internetzugang sperren, nachdem er die Sperre mindestens zwei Wochen vorher schriftlich angedroht und auf die Möglichkeit gerichtlichen Rechtsschutzes hingewiesen hat. Die Sperre betrifft nur den Internetzugang. Nach Ausgleich des Rückstands wird der Zugang unverzüglich mit einem neuen Passwort wieder freigeschaltet.

§ 5 Keine Mietsache, freie Wahl
Der Internetzugang ist nicht Bestandteil der Mietsache. Bei Störungen wird nur die Internet-Gebühr anteilig erstattet; die Miete bleibt davon unberührt. Der Mieter kann jederzeit einen eigenen Internetanschluss bei einem Anbieter seiner Wahl nutzen.

§ 6 Laufzeit
Die Vereinbarung läuft auf unbestimmte Zeit und kann von beiden Seiten mit einer Frist von einem Monat zum Monatsende in Textform gekündigt werden. Sie endet spätestens mit dem Mietverhältnis.

§ 7 Sonstiges
${v.sonst?v.sonst:"Keine weiteren Vereinbarungen."}`};
  const BF=[...CTX_F,{k:"lage",l:"Wohnung / Lage",t:"text"}];
  VTPL.wlDroh={t:"Ankündigung einer Sperre des Internetzugangs",einseitig:1,d:"Brief bei offener Internet-Gebühr ab 100 €: Zahlungsfrist und Sperre frühestens 2 Wochen später.",f:[...BF,
   {k:"gebuehr",l:"Gebühr pro Monat €",t:"number"},{k:"monate",l:"Offene Monate",t:"text",full:1},{k:"offen",l:"Offener Betrag €",t:"number",req:1},{k:"frist",l:"Zahlen bis",t:"date",req:1},{k:"sperreAb",l:"Sperre frühestens ab",t:"date",req:1}],
   text:v=>`Offene Internet-Gebühr – Ankündigung einer Sperre des Internetzugangs (Wohnung ${VS(v.lage)})

Sehr geehrte/r ${VS(v.mName)},

aus der Vereinbarung über den Internet-/WLAN-Zugang${v.gebuehr?` (${VE(v.gebuehr)} monatlich)`:""} sind folgende Beträge offen${v.monate?`: ${v.monate}`:""}.
Offener Gesamtbetrag: ${VE(v.offen)}

Bitte überweisen Sie diesen Betrag bis zum ${VD(v.frist)}.

Ist der Betrag bis dahin nicht eingegangen, werde ich Ihren Internet-/WLAN-Zugang frühestens ab dem ${VD(v.sperreAb)} sperren. Die Sperre betrifft ausschließlich den Internetzugang, nicht die Wohnung und keine anderen Leistungen. Nach Ausgleich des Rückstands wird der Zugang unverzüglich mit einem neuen Passwort wieder freigeschaltet.

Sie haben die Möglichkeit, gegen die Sperre gerichtlichen Rechtsschutz in Anspruch zu nehmen.

Mit freundlichen Grüßen`};
  VTPL.wlSperre={t:"Mitteilung über die Sperre des Internetzugangs",einseitig:1,d:"Bestätigt dem Mieter, dass der Internetzugang gesperrt wurde und wie er wieder freigeschaltet wird.",f:[...BF,
   {k:"angedroht",l:"Sperre angekündigt am",t:"date",req:1},{k:"gesperrt",l:"Gesperrt seit",t:"date",req:1},{k:"offen",l:"Offener Betrag €",t:"number",req:1}],
   text:v=>`Sperre Ihres Internetzugangs (Wohnung ${VS(v.lage)})

Sehr geehrte/r ${VS(v.mName)},

mit Schreiben vom ${VD(v.angedroht)} habe ich Ihnen die Sperre Ihres Internet-/WLAN-Zugangs angekündigt. Da der offene Betrag von ${VE(v.offen)} bis heute nicht ausgeglichen wurde, ist Ihr Internetzugang seit dem ${VD(v.gesperrt)} gesperrt. Ihr bisheriges WLAN-Passwort ist ungültig; alle Geräte, die es verwendet haben, sind getrennt.

Die Sperre betrifft ausschließlich den Internetzugang. Ihre Wohnung und alle anderen Leistungen sind davon nicht berührt.

Sobald der offene Betrag bei mir eingegangen ist, schalte ich den Zugang unverzüglich wieder frei. Sie erhalten dann ein neues Passwort.

Mit freundlichen Grüßen`};
  VTPL.wlFrei={t:"Freischaltung des Internetzugangs",einseitig:1,d:"Bestätigt die Freischaltung bzw. ein neues WLAN-Passwort.",f:[...BF,
   {k:"ab",l:"Freigeschaltet ab",t:"date",req:1},{k:"ssid",l:"Netzname",t:"text"},{k:"key",l:"Neues Passwort (optional – sonst nur in der App)",t:"text",full:1}],
   text:v=>`Freischaltung Ihres Internetzugangs (Wohnung ${VS(v.lage)})

Sehr geehrte/r ${VS(v.mName)},

Ihr Internet-/WLAN-Zugang ist ab dem ${VD(v.ab)} wieder freigeschaltet. Aus Sicherheitsgründen gilt ein neues Passwort; das alte Passwort funktioniert nicht mehr.

Netzname: ${VS(v.ssid)}
${v.key?`Passwort: ${v.key}`:"Das neue Passwort und einen QR-Code finden Sie in der JoumHome-App unter „Mein WLAN“."}

Das Passwort gilt nur für Ihren Haushalt. Bitte geben Sie es nicht an Dritte weiter.

Mit freundlichen Grüßen`};
  VTPL.wlKuendV={t:"Kündigung der Internet-Vereinbarung (Vermieter)",einseitig:1,d:"Kündigung nur des Internet-/WLAN-Zugangs mit 1 Monat Frist zum Monatsende. Der Mietvertrag läuft weiter.",f:[...BF,
   {k:"vertragVom",l:"Vereinbarung vom",t:"date"},{k:"ende",l:"Endet zum",t:"date",req:1},{k:"grund",l:"Grund (optional)",t:"textarea",full:1}],
   text:v=>`Kündigung der Vereinbarung über den Internet-/WLAN-Zugang (Wohnung ${VS(v.lage)})

Sehr geehrte/r ${VS(v.mName)},

hiermit kündige ich die Vereinbarung über den Internet-/WLAN-Zugang${v.vertragVom?` vom ${VD(v.vertragVom)}`:""} fristgerecht zum ${VD(v.ende)}.${v.grund?`\n\nGrund: ${v.grund}`:""}

Ab diesem Tag ist der Internetzugang über das Haus-WLAN beendet und die monatliche Gebühr entfällt. Ihr Mietvertrag über die Wohnung bleibt davon unberührt und läuft unverändert weiter.

Bitte kümmern Sie sich rechtzeitig um einen eigenen Internetanschluss.

Mit freundlichen Grüßen`};
  try{ const g=VGRUPPEN.find(x=>x[0]==="Zusatzverträge"); if(g) g[1]=g[1].filter(k=>k!=="wlan"); if(!VGRUPPEN.some(x=>x[0]==="Internet / WLAN")){ const i=VGRUPPEN.findIndex(x=>x[0]==="Zusatzverträge"); VGRUPPEN.splice(i+1,0,["Internet / WLAN",["wlan","wlDroh","wlSperre","wlFrei","wlKuendV"]]); } }catch(e){}
}
function wlBriefFelder(k,m){ const w=wohn(m.wohnungId), o=w?st.data.objekte[w.objektId]:null, W=m.wlan||{}, R=wlRueck(m);
  const b={...ctxDef({m,w,o}),mAdr:[o?.adresse,w?.lage].filter(Boolean).join(", "),lage:w?.lage||""};
  const plus=d=>dStr(new Date(Date.now()+d*864e5));
  if(k==="wlDroh") Object.assign(b,{gebuehr:W.gebuehr||null,monate:R.monate.map(y=>fmtYm(y,"de")).join(", "),offen:R.betrag||null,frist:plus(14),sperreAb:plus(15)});
  if(k==="wlSperre") Object.assign(b,{angedroht:W.angedrohtAm||"",gesperrt:W.gesperrtAm||today(),offen:R.betrag||null});
  if(k==="wlFrei") Object.assign(b,{ab:today(),ssid:wlSsid(m),key:""});
  if(k==="wlKuendV"){ const n=new Date(); Object.assign(b,{vertragVom:W.seit||"",ende:dStr(new Date(n.getFullYear(),n.getMonth()+2,0,12))}); }
  return b; }
function wlPortal(m){ const W=m.wlan; if(!W||!W.art||W.art==="keins") return null; const o=st.data.objekte[wohn(m.wohnungId)?.objektId]||{}; const R=wlRueck(m);
  return {ssid:wlSsid(m),key:W.status==="gesperrt"?null:W.key,status:W.status||"aktiv",rueckstand:R.betrag,angedroht:!!W.angedrohtAm&&W.status!=="gesperrt",sperreAb:W.sperreAb||null}; }
function eichAttention(att){ const y=new Date().getFullYear(); list("vertraege").filter(v=>v.tpl==="verbrauch"&&v.status!=="Beendet"&&v.felder?.eichjahr).forEach(v=>{ const f=v.felder; const n=/Strom/.test(f.medium||"")?8:5; const bis=(+f.eichjahr)+n; if(y>=bis){ const m=st.data.mieter[v.mieterId]; att.push({c:y>bis?"bad":"warn",t:`Eichfrist Zwischenzähler ${f.zaehlerNr||""}`,s:`${m?.name||""} · ${f.medium||""} · ${y>bis?"abgelaufen":"läuft Ende "+bis+" ab"} – neu eichen oder tauschen, sonst ist die Abrechnung angreifbar`,a:""}); } }); }
function wlAttention(att){ try{ eichAttention(att); }catch(e){} list("mieter").filter(m=>m.aktiv!==false&&m.wlan?.art==="separat").forEach(m=>{ const S=wlState(m); const oid=wohn(m.wohnungId)?.objektId;
  if(S.darfSperren) att.push({c:"bad",t:`Internet sperren möglich: ${m.name}`,s:`${eur(S.R.betrag)} offen, Sperre am ${fmtDate(S.W.angedrohtAm)} angedroht`,a:`<button class="btn sm" data-act="wlGo" data-o="${esc(oid)}">WLAN</button>`});
  else if(S.darfAndrohen) att.push({c:"warn",t:`Internet-Gebühr offen: ${m.name}`,s:`${eur(S.R.betrag)} – Sperre kann angedroht werden`,a:`<button class="btn sm" data-act="wlGo" data-o="${esc(oid)}">WLAN</button>`}); }); }

/* =========================================================
   15) Marktcheck 3: SEPA-Lastschrift, Steuerberater-Export, Wert & Vermögen, Mieter-Verlauf
   ========================================================= */
Object.assign(FIN_SUB,{sepa:"Miete per Lastschrift (SEPA)",export:"Export für Steuerberater",wert:"Wert & Vermögen"});
const xe=x=>String(x??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const sepaTxt=x=>String(x||"").replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/Ä/g,"Ae").replace(/Ö/g,"Oe").replace(/Ü/g,"Ue").replace(/ß/g,"ss").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9 \/\-?:().,'+]/g," ").replace(/\s+/g," ").trim();
const ibanN=x=>String(x||"").replace(/\s+/g,"").toUpperCase();
function ibanOk(x){ const i=ibanN(x); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) return false; const r=(i.slice(4)+i.slice(0,4)).replace(/[A-Z]/g,c=>c.charCodeAt(0)-55); let m=0; for(const d of r) m=(m*10+ +d)%97; return m===1; }
function sepaRef(m){ return ("JH-"+String(m.id).replace(/[^A-Za-z0-9]/g,"")).slice(0,35); }
function sepaMieter(){ return list("mieter").filter(m=>m.aktiv!==false&&m.sepa?.aktiv&&ibanOk(m.sepa.iban||m.iban)); }
function vFin_sepa(){
  const c=st.cfg||{}; const ms=list("mieter").filter(m=>m.aktiv!==false);
  const nm=addM(today(),1).slice(0,7); const ymSel=st.sepaYm||nm; const tag=st.sepaTag||`${ymSel}-03`;
  const ok=sepaMieter(); const sum=ok.reduce((s,m)=>s+sollOf(m.wohnungId),0);
  return `${finBack("sepa")}<section class="card" style="display:flex;flex-direction:column;gap:8px"><h3>Deine Daten als Zahlungsempfänger</h3>
   <div class="fields">${fld("Gläubiger-ID",inp("sp_gid",c.glaeubigerId,"text","DE98ZZZ09999999999"))}${fld("IBAN Mietkonto",inp("sp_iban",c.iban,"text"))}${fld("BIC (optional)",inp("sp_bic",c.bic,"text"))}${fld("Name auf dem Konto",inp("sp_nm",c.kontoName||c.name,"text"))}</div>
   <div class="row"><button class="btn sm pri" id="sp_save">Speichern</button></div>
   <div class="small">Die Gläubiger-ID bekommst du kostenlos online bei der Deutschen Bundesbank. Deine Bank muss Lastschriften für dein Konto freischalten (Inkassovereinbarung).</div></section>
  <section class="list"><div class="sec-title"><h2>Mandate der Mieter</h2><span>${ok.length}/${ms.length}</span></div>
  ${ms.map(m=>{ const S=m.sepa||{}; const ib=S.iban||m.iban; return `<div class="item s-${S.aktiv?"ok":"neutral"}"><div class="head"><div><b>${esc(m.name)}</b><div class="meta">${esc(wohnFull(m.wohnungId))} · ${eur(sollOf(m.wohnungId))}/Monat${ib?` · ${esc(ibanN(ib).replace(/(.{4})/g,"$1 ").trim())}`:""}</div></div>${S.aktiv?`<span class="pill ok">Mandat aktiv</span>`:`<span class="pill">kein Mandat</span>`}</div>
   ${ib&&!ibanOk(ib)?`<div class="small">IBAN ist ungültig – bitte prüfen.</div>`:""}
   <div class="row">${S.aktiv?`<button class="btn sm" data-act="spAus" data-id="${esc(m.id)}">Mandat beenden</button>`:`<button class="btn sm pri" data-act="spMandat" data-id="${esc(m.id)}">Mandat zur Unterschrift</button><button class="btn sm" data-act="spPapier" data-id="${esc(m.id)}">Liegt auf Papier vor</button>`}</div></div>`; }).join("")||emptyBox("Keine aktiven Mieter.")}</section>
  <section class="card" style="display:flex;flex-direction:column;gap:8px"><h3>Monatsdatei für deine Bank</h3>
   <div class="fields">${fld("Monat",inp("sp_ym",ymSel,"month"))}${fld("Einzug am",inp("sp_tag",tag,"date"))}</div>
   <div class="small">${ok.length} Mieter · zusammen ${eur(sum)}. Die Datei lädst du im Online-Banking unter „SEPA-Datei / Sammellastschrift hochladen“ hoch. Spätestens 2 Bankarbeitstage vor dem Einzugstag hochladen.</div>
   <div class="row"><button class="btn pri" id="sp_xml"${ok.length?"":" disabled"}>SEPA-Datei erstellen</button></div>
   <div class="small">Mieter können eine Lastschrift 8 Wochen lang zurückholen. Das siehst du dann wie gewohnt bei den Mieteingängen. Keine Rechtsberatung.</div></section>`;
}
function sepaXml(ms,tag){
  const c=st.cfg||{}; const now=new Date().toISOString().slice(0,19); const id=("JH"+Date.now()).slice(0,35);
  const rows=ms.map(m=>({m,betrag:r2(sollOf(m.wohnungId)),seq:m.sepa?.letzter?"RCUR":"FRST"})).filter(x=>x.betrag>0);
  const grp=["FRST","RCUR"].map(sq=>rows.filter(r=>r.seq===sq)).filter(g=>g.length);
  const ctrl=r2(rows.reduce((s,x)=>s+x.betrag,0)).toFixed(2);
  const pmt=g=>{ const sm=r2(g.reduce((s,x)=>s+x.betrag,0)).toFixed(2); return `<PmtInf><PmtInfId>${id}-${g[0].seq}</PmtInfId><PmtMtd>DD</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${g.length}</NbOfTxs><CtrlSum>${sm}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>${g[0].seq}</SeqTp></PmtTpInf><ReqdColltnDt>${tag}</ReqdColltnDt><Cdtr><Nm>${xe(sepaTxt(c.kontoName||c.name).slice(0,70))}</Nm></Cdtr><CdtrAcct><Id><IBAN>${ibanN(c.iban)}</IBAN></Id></CdtrAcct><CdtrAgt><FinInstnId>${c.bic?`<BICFI>${xe(String(c.bic).trim().toUpperCase())}</BICFI>`:`<Othr><Id>NOTPROVIDED</Id></Othr>`}</FinInstnId></CdtrAgt><ChrgBr>SLEV</ChrgBr><CdtrSchmeId><Id><PrvtId><Othr><Id>${xe(String(c.glaeubigerId).replace(/\s+/g,"").toUpperCase())}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
${g.map(({m,betrag})=>`<DrctDbtTxInf><PmtId><EndToEndId>${xe(("JH"+tag.replace(/-/g,"")+String(m.id).replace(/[^A-Za-z0-9]/g,"")).slice(0,35))}</EndToEndId></PmtId><InstdAmt Ccy="EUR">${betrag.toFixed(2)}</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>${xe(m.sepa.ref||sepaRef(m))}</MndtId><DtOfSgntr>${m.sepa.datum||today()}</DtOfSgntr></MndtRltdInf></DrctDbtTx><DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt><Dbtr><Nm>${xe(sepaTxt(m.sepa.kontoinhaber||m.name).slice(0,70))}</Nm></Dbtr><DbtrAcct><Id><IBAN>${ibanN(m.sepa.iban||m.iban)}</IBAN></Id></DbtrAcct><RmtInf><Ustrd>${xe(sepaTxt(`Miete ${fmtYm(tag.slice(0,7),"de")} ${wohn(m.wohnungId)?.lage||""}`).slice(0,140))}</Ustrd></RmtInf></DrctDbtTxInf>`).join("\n")}
</PmtInf>`; };
  return {n:rows.length,sum:ctrl,xml:`<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08"><CstmrDrctDbtInitn><GrpHdr><MsgId>${id}</MsgId><CreDtTm>${now}</CreDtTm><NbOfTxs>${rows.length}</NbOfTxs><CtrlSum>${ctrl}</CtrlSum><InitgPty><Nm>${xe(sepaTxt(c.kontoName||c.name).slice(0,70))}</Nm></InitgPty></GrpHdr>
${grp.map(pmt).join("\n")}
</CstmrDrctDbtInitn></Document>`};
}
if(typeof VTPL==="object"&&!VTPL.sepa){
  VTPL.sepa={t:"SEPA-Lastschriftmandat (Miete)",nurMieter:1,d:"Erlaubt dir, die Miete monatlich vom Konto des Mieters einzuziehen.",f:[...CTX_F,
   {k:"gid",l:"Gläubiger-ID",t:"text",req:1},{k:"ref",l:"Mandatsreferenz",t:"text",req:1},{k:"objAdr",l:"Wohnung",t:"text",full:1},{k:"betrag",l:"Monatlicher Betrag €",t:"number",req:1},{k:"tag",l:"Einzug jeweils am (Tag)",t:"number",def:3},
   {k:"inhaber",l:"Kontoinhaber",t:"text",req:1},{k:"iban",l:"IBAN des Mieters",t:"text",req:1}],
   text:v=>`Zahlungsempfänger: ${VS(v.vName)}, ${VS(v.vAdr)}
Gläubiger-Identifikationsnummer: ${VS(v.gid)}
Mandatsreferenz: ${VS(v.ref)}

SEPA-Lastschriftmandat
Ich ermächtige ${VS(v.vName)}, Zahlungen aus dem Mietverhältnis über die Wohnung ${VS(v.objAdr)} von meinem Konto mittels Lastschrift einzuziehen. Zugleich weise ich mein Kreditinstitut an, die von ${VS(v.vName)} auf mein Konto gezogenen Lastschriften einzulösen.

Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.

Vorabankündigung: Eingezogen wird monatlich die Miete, derzeit ${VE(v.betrag)}, jeweils am ${VS(v.tag||3)}. des Monats (fällt der Tag auf ein Wochenende oder einen Feiertag, am nächsten Bankarbeitstag). Ändert sich der Betrag, teilt der Vermieter dies mindestens 5 Tage vor dem Einzug in Textform mit.

Kontoinhaber: ${VS(v.inhaber)}
IBAN: ${VS(v.iban)}

Das Mandat kann jederzeit in Textform beim Vermieter widerrufen werden.`};
  try{ const g=VGRUPPEN.find(x=>x[0]==="Zusatzverträge"); if(g&&!g[1].includes("sepa")) g[1].push("sepa"); }catch(e){}
}
document.addEventListener("click",async e=>{ const b=e.target.closest&&e.target.closest("#sp_save,#sp_xml,#ex_csv,#ex_eur"); if(!b) return;
  if(b.id==="sp_save"){ const gid=val("sp_gid").replace(/\s+/g,"").toUpperCase(), ib=ibanN(val("sp_iban")); if(gid&&!/^[A-Z]{2}\d{2}ZZZ/.test(gid)){ toast("Gläubiger-ID sieht falsch aus (Beispiel DE98ZZZ09999999999)"); return; } if(ib&&!ibanOk(ib)){ toast("IBAN ist ungültig"); return; }
    const cf={...(st.cfg||{}),glaeubigerId:gid,iban:ib,bic:val("sp_bic").trim().toUpperCase(),kontoName:val("sp_nm")}; try{ await st.db.doc("config/vermieter").set(cf); st.cfg=cf; toast("Gespeichert"); render(); }catch(x){ toast("Speichern fehlgeschlagen"); } return; }
  if(b.id==="sp_xml"){ const c=st.cfg||{}; if(!c.glaeubigerId||!ibanOk(c.iban)){ toast("Bitte erst Gläubiger-ID und IBAN speichern"); return; } const ym=val("sp_ym"), tag=val("sp_tag"); st.sepaYm=ym; st.sepaTag=tag; if(!tag||tag<today()){ toast("Einzugsdatum muss in der Zukunft liegen"); return; }
    const ms=sepaMieter(); const X=sepaXml(ms,tag); saveFile(`SEPA_Lastschrift_${ym}.xml`,new Blob([X.xml],{type:"application/xml"}));
    for(const m of ms){ await dbUpd("mieter",m.id,{sepa:{...m.sepa,letzter:tag}}).catch(()=>{}); }
    toast(`Datei mit ${X.n} Lastschriften über ${eur(+X.sum)} erstellt`); return; }
  if(b.id==="ex_csv"){ const y=+val("ex_y"); const R=exRows(y); const head="Datum;Art;Haus;Wohnung;Kategorie;Text;Betrag;MwSt;Beleg"; const q=x=>`"${String(x??"").replace(/"/g,'""')}"`; const n=x=>(+x||0).toFixed(2).replace(".",",");
    const csv="﻿"+head+"\n"+R.map(r=>[r.datum,r.art,q(r.haus),q(r.wohnung),q(r.kat),q(r.text),n(r.betrag),n(r.mwst),q(r.beleg)].join(";")).join("\n"); saveFile(`Buchungen_${y}.csv`,new Blob([csv],{type:"text/csv"})); return; }
  if(b.id==="ex_eur"){ const y=+val("ex_y"); const E=eurCalc(y); const q=x=>`"${String(x??"").replace(/"/g,'""')}"`; const n=x=>(+x||0).toFixed(2).replace(".",",");
    let csv="﻿Haus;Posten;Betrag\n"; E.forEach(h=>{ csv+=`${q(h.name)};Mieteinnahmen;${n(h.ein)}\n`; Object.entries(h.kat).forEach(([k,v])=>{ csv+=`${q(h.name)};${q("Ausgabe: "+k)};${n(-v)}\n`; }); csv+=`${q(h.name)};Überschuss;${n(h.ein-h.aus)}\n`; }); saveFile(`Einnahmen-Ueberschuss_${y}.csv`,new Blob([csv],{type:"text/csv"})); return; }
});
Object.assign(ACT,{
  spMandat:d=>{ const m=st.data.mieter[d.id]; if(!m) return; const c=st.cfg||{}; if(!c.glaeubigerId){ toast("Bitte erst oben deine Gläubiger-ID speichern"); return; } const w=wohn(m.wohnungId), o=w?st.data.objekte[w.objektId]:null;
    openVertrag("sepa",{mieterId:m.id,felder:{...ctxDef({m,w,o}),gid:c.glaeubigerId,ref:sepaRef(m),objAdr:[o?.adresse,w?.lage].filter(Boolean).join(", "),betrag:sollOf(m.wohnungId)||null,tag:3,inhaber:m.name,iban:m.iban||""}}); },
  spPapier:async d=>{ const m=st.data.mieter[d.id]; if(!m) return; const ib=prompt("IBAN des Mieters laut Mandat:",m.iban||""); if(ib==null) return; if(!ibanOk(ib)){ toast("IBAN ist ungültig"); return; } const dat=prompt("Mandat unterschrieben am (JJJJ-MM-TT):",today()); if(!dat) return;
    await dbUpd("mieter",m.id,{iban:ibanN(ib),sepa:{aktiv:true,ref:sepaRef(m),datum:dat,iban:ibanN(ib),kontoinhaber:m.name,quelle:"Papier"}}); toast("Mandat gespeichert"); render(); },
  spAus:async d=>{ const m=st.data.mieter[d.id]; if(!m) return; if(!await ask(`Lastschrift-Mandat von ${m.name} beenden?`,"Beenden")) return; await dbUpd("mieter",m.id,{sepa:{...(m.sepa||{}),aktiv:false,beendet:today()}}); render(); }
});
/* Steuerberater-Export */
function exRows(y){ const ys=String(y); const R=[];
  list("zahlungen").filter(z=>(+z.bezahlt||0)>0&&String(z.eingang||z.monat||"").startsWith(ys)).forEach(z=>{ const w=wohn(z.wohnungId); R.push({datum:z.eingang||((z.monat||"")+"-01"),art:"Einnahme",haus:objName(w?.objektId),wohnung:w?.lage||"",kat:"Miete",text:`Miete ${z.monat||""}`,betrag:+z.bezahlt||0,mwst:0,beleg:""}); });
  list("ausgaben").filter(a=>String(a.datum||"").startsWith(ys)&&(+a.betrag||0)>0).forEach(a=>{ R.push({datum:a.datum,art:"Ausgabe",haus:objName(a.objektId),wohnung:wohn(a.wohnungId)?.lage||"",kat:a.kategorie||"Sonstiges",text:[a.haendler,a.beschreibung].filter(Boolean).join(" – ")+(a.kostentraeger==="Mieter"?" (vom Mieter zu zahlen)":"")+(a.umlage?" (umlagefähig)":""),betrag:-(+a.betrag||0),mwst:+a.mwst||0,beleg:a.belegAsset?assetUrl(a.belegAsset):""}); });
  return R.sort((a,b)=>String(a.datum).localeCompare(String(b.datum))); }
function eurCalc(y){ const R=exRows(y); const H={}; R.forEach(r=>{ const h=H[r.haus]||(H[r.haus]={name:r.haus||"ohne Haus",ein:0,aus:0,kat:{}}); if(r.betrag>0) h.ein+=r.betrag; else { h.aus+=-r.betrag; h.kat[r.kat]=(h.kat[r.kat]||0)+(-r.betrag); } }); return Object.values(H); }
function vFin_export(){ const y=+(st.exY||new Date().getFullYear()-(new Date().getMonth()<3?1:0)); const E=eurCalc(y);
  return `${finBack("export")}<section class="card" style="display:flex;flex-direction:column;gap:8px"><div class="fields">${fld("Jahr",`<select id="ex_y" onchange="st.exY=this.value;render()">${[0,1,2,3].map(i=>new Date().getFullYear()-i).map(j=>`<option${j===y?" selected":""}>${j}</option>`).join("")}</select>`)}</div>
   <div class="row"><button class="btn pri" id="ex_csv">Buchungsliste (CSV)</button><button class="btn" id="ex_eur">Einnahmen-Überschuss je Haus (CSV)</button><button class="btn" data-act="stb">Steuerberater-Paket (PDF + Excel)</button></div>
   <div class="small">Die CSV-Dateien öffnen sich in Excel. Dein Steuerberater kann sie in sein Programm (z. B. DATEV) einlesen. Jede Ausgabe enthält den Link zum Beleg.</div></section>
  <section class="list"><div class="sec-title"><h2>Einnahmen-Überschuss ${y}</h2></div>${E.map(h=>`<div class="item"><div class="head"><div><b>${esc(h.name)}</b><div class="meta">Einnahmen ${eur(h.ein)} · Ausgaben ${eur(h.aus)}</div></div><span class="pill ${h.ein-h.aus>=0?"ok":"bad"}">${eur(h.ein-h.aus)}</span></div>${Object.entries(h.kat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="small">${esc(k)}: ${eur(v)}</div>`).join("")}</div>`).join("")||emptyBox("Keine Buchungen in diesem Jahr.")}</section>
  <p class="small">Ohne Abschreibung (AfA) und Kreditzinsen aus Daueraufträgen – die stehen im Steuerberater-Paket und in Anlage V. Keine Steuerberatung.</p>`; }
/* Wert & Vermögen */
function wertOf(o){ const k=o.kauf||{}; const W=o.wert||{}; const wert=num(W.betrag)||num(k.kaufpreis)||0; const rest=num(W.restschuld)||0; const jm=wsOf(o.id).reduce((s,w)=>s+(+w.kalt||0),0)*12; return {wert,rest,ek:wert-rest,jm,quelle:W.betrag?(W.quelle||"eigene Schätzung"):(k.kaufpreis?"Kaufpreis":""),stand:W.stand||"",faktor:jm?wert/jm:0,brutto:wert?jm/wert:0,ltv:wert?rest/wert:0}; }
function vFin_wert(){ const os=list("objekte"); const A=os.map(o=>({o,...wertOf(o)})); const T=A.reduce((t,a)=>({wert:t.wert+a.wert,rest:t.rest+a.rest,jm:t.jm+a.jm}),{wert:0,rest:0,jm:0});
  return `${finBack("wert")}<section class="card"><h3>Gesamt</h3><dl class="kv"><dt>Wert aller Häuser</dt><dd>${eur(T.wert)}</dd><dt>Restschuld</dt><dd>${eur(T.rest)}</dd><dt>Dein Eigenkapital</dt><dd><b>${eur(T.wert-T.rest)}</b></dd><dt>Kaltmiete pro Jahr</dt><dd>${eur(T.jm)}</dd><dt>Bruttorendite</dt><dd>${T.wert?(T.jm/T.wert*100).toFixed(1).replace(".",",")+" %":"–"}</dd></dl></section>
  <section class="list"><div class="sec-title"><h2>Je Haus</h2><span>${os.length}</span></div>${A.map(a=>`<div class="item"><div class="head"><div><b>${esc(a.o.name||a.o.adresse||a.o.id)}</b><div class="meta">Wert ${eur(a.wert)}${a.quelle?` (${esc(a.quelle)}${a.stand?", "+esc(fmtDate(a.stand)):""})`:""} · Restschuld ${eur(a.rest)}</div></div><span class="pill ok">${eur(a.ek)}</span></div>
   <div class="small">Kaltmiete ${eur(a.jm)}/Jahr · Faktor ${a.faktor?a.faktor.toFixed(1).replace(".",","):"–"} · Bruttorendite ${a.brutto?(a.brutto*100).toFixed(1).replace(".",",")+" %":"–"} · Beleihung ${a.wert?Math.round(a.ltv*100)+" %":"–"}</div>
   <div class="row"><button class="btn sm" data-act="wertEdit" data-o="${esc(a.o.id)}">Wert & Restschuld eintragen</button></div></div>`).join("")||emptyBox("Noch keine Häuser.")}</section>
  <p class="small">Der Wert ist deine Schätzung (z. B. aus Bodenrichtwert, Gutachten oder Vergleichsangeboten). Die Restschuld steht auf dem Jahreskontoauszug deiner Bank.</p>`; }
ACT.wertEdit=d=>{ const o=st.data.objekte[d.o]; if(!o) return; const W=o.wert||{};
  openSheet(`<div class="spread"><h2>Wert – ${esc(o.name||"")}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="fields">${fld("Geschätzter Wert €",inp("we_b",W.betrag??o.kauf?.kaufpreis,"number"))}${fld("Quelle",inp("we_q",W.quelle,"text","z. B. Gutachten, Bank, eigene Schätzung"))}${fld("Restschuld aller Kredite €",inp("we_r",W.restschuld,"number"))}${fld("Stand",inp("we_s",W.stand||today(),"date"))}</div><div class="row end"><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" id="we_ok">Speichern</button></div>`);
  $("#we_ok").onclick=async()=>{ await dbUpd("objekte",o.id,{wert:{betrag:nval("we_b"),quelle:val("we_q"),restschuld:nval("we_r"),stand:val("we_s")}}); closeSheet(); toast("Gespeichert"); render(); }; };
/* Mieter-Verlauf je Wohnung */
function vVerlauf(oid){ const ws=wsOf(oid); const t=today();
  return `<section class="list"><div class="sec-title"><h2>Mieter-Verlauf je Wohnung</h2><span>${ws.length}</span></div>${ws.map(w=>{ const ms=list("mieter").filter(m=>m.wohnungId===w.id).sort((a,b)=>String(a.beginn||"").localeCompare(String(b.beginn||"")));
    const E=[]; let prevEnd=null; ms.forEach(m=>{ const end=m.auszug||(m.aktiv===false?(m.beendet||""):""); if(prevEnd&&m.beginn&&m.beginn>prevEnd){ const d=days(prevEnd,m.beginn); if(d>3) E.push(`<div class="small" style="color:var(--warn,#c80)">Leerstand ${d} Tage (${esc(fmtDate(prevEnd))} – ${esc(fmtDate(m.beginn))})</div>`); }
      const status=m.beginn&&m.beginn>t?"kommt":end&&end<=t?"früher":"aktuell"; const dauer=m.beginn?Math.max(0,Math.round(days(m.beginn,end&&end<t?end:t)/30.4)):0;
      E.push(`<div class="small"><span class="pill ${status==="aktuell"?"ok":status==="kommt"?"warn":""}">${status}</span> <b>${esc(m.name)}</b> · ${m.beginn?esc(fmtDate(m.beginn)):"?"} – ${end?esc(fmtDate(end)):"heute"}${status!=="kommt"&&dauer?` · ${dauer>=12?Math.floor(dauer/12)+" J. "+(dauer%12)+" M.":dauer+" Monate"}`:""}${m.kalt?` · ${eur(+m.kalt)} kalt`:""}</div>`); if(end) prevEnd=end; });
    return `<div class="item"><div class="head"><div><b>${esc(w.lage||w.id)}</b><div class="meta">${w.flaeche?esc(String(w.flaeche))+" m² · ":""}heute ${eur(+w.kalt||0)} kalt</div></div><span class="pill">${ms.length} Mieter</span></div>${E.join("")||`<div class="small">Noch keine Mieter erfasst.</div>`}</div>`; }).join("")||emptyBox("Keine Wohnungen.")}</section>`; }

/* öffentlich für index.html */
Object.assign(window,{vFin_sepa,vFin_export,vFin_wert,vVerlauf,ibanOk,sepaXml,vWlan,wlKey,wlVlan,wlSsid,wlSsidVorschlag,wlSysOf,wlBriefFelder,wlTile,wlPortal,wlAttention,belegZuordnung,belegTicketListe,vNK,vWartung,vBegehung,vMietanp,vAnlV,vRendite,kiSchaden,mieterExtra,extraAttention:(att)=>{ extraAttention(att); try{ extraAttention2(att); }catch(e){ console.warn(e); } try{ wlAttention(att); }catch(e){ console.warn(e); } },bwBox,postSheet,nkCalc,zahlTrend,mietCalc,anlvCalc,dsSheet,bkSheet,fristenSheet});
})();

/* =========================================================
   10) VERTRAGS-AUTOMATIK (23.11.2026)
   Anfrage per Ticket/Sprache → Vertrag wird automatisch erstellt → Mieter sieht Kurz-Übersicht
   („Bist du sicher? Das wird festgelegt …“) → unterschreibt in seiner App → Vermieter zeichnet gegen
   → PDF fertig bei Vermieter und Mieter. Nur die Unterschriften bleiben Handarbeit.
   ========================================================= */
(function(){
"use strict";
const ART2TPL={wlan:"wlan",stell:"stell",rate:"rate",verbrauch:"verbrauch",mietbesch:"mietbesch",wgb:"wgb"};
const ST_M="Wartet auf Mieter", ST_V="Wartet auf Vermieter", ST_P="Vorbereitet";
const sgOf=(T,v)=>T.signer?T.signer(v):(T.nurMieter?"M":T.einseitig?"V":"VM");
const SKIP=new Set(["vName","vAdr","mAdr","iban","bank","ort","sonst"]);
function vtSum(k,v){ const T=VTPL[k]; if(!T) return []; return T.f.filter(f=>!SKIP.has(f.k)&&f.t!=="textarea"&&v[f.k]!=null&&v[f.k]!==""&&v[f.k]!==false).map(f=>{ let x=v[f.k]; if(f.t==="date") x=fmtDate(x); else if(f.t==="number"&&/€/.test(f.l)) x=eur(x); else if(f.t==="bool") x="ja"; else if(f.t==="selectkv") x=(f.o.find(o=>o[0]===x)||[x,x])[1]; return [f.l.replace(/\s*\(.*?\)\s*/g," ").replace(/€/g,"").trim(),String(x)]; }).slice(0,14); }
function vtSumHtml(k,v){ const S=vtSum(k,v); if(!S.length) return ""; return `<section class="card" style="display:flex;flex-direction:column;gap:6px"><h3>${esc(tr("Kurz-Übersicht – das wird festgelegt"))}</h3><dl class="kv">${S.map(([l,x])=>`<dt>${esc(tr(l))}</dt><dd>${esc(x)}</dd>`).join("")}</dl></section>`; }
function vtVorgaben(){ return st.vtVorg||{}; }
function vtBuild(k,m,extra,zweck){
  const T=VTPL[k]; const w=wohn(m?.wohnungId), o=w?st.data.objekte[w.objektId]:null;
  const v={...ctxDef({m,w,o}),...Object.fromEntries(T.f.filter(f=>f.def).map(f=>[f.k,f.def]))};
  if(k==="wgb"){ v.personen=m?.name||""; v.datum=m?.beginn||today(); v.lage=w?.lage||""; v.art="Einzug"; }
  if(k!=="miet"&&!v.mAdr&&o) v.mAdr=[o.adresse,w?.lage].filter(Boolean).join(", ");
  if(zweck) v.zweck=zweck;
  const x=extra||{}; if(x.sArt) v.art=x.sArt; ["beginn","kennz","rate","ersteRate","medium"].forEach(q=>{ if(x[q]!=null&&x[q]!=="") v[q]=x[q]; });
  if(k==="rate"&&!v.rueckstand&&m){ try{ const p=buildPortal(m); if(p.miete.offen) v.rueckstand=p.miete.offen; }catch(e){} }
  const VG=vtVorgaben();
  if(k==="stell"&&!v.preis&&VG.stell?.[v.art||"Außenstellplatz"]) v.preis=VG.stell[v.art||"Außenstellplatz"];
  if(k==="verbrauch"&&!v.abschlag&&VG.abschlag?.[v.medium||"Strom"]) v.abschlag=VG.abschlag[v.medium||"Strom"];
  if(k==="stell"&&!v.beginn) v.beginn=today();
  if(k==="wlan"){ const W=m?.wlan||{}; v.objAdr=o?.adresse||""; v.lage=w?.lage||""; v.ssid=m?wlSsid(m):(o?.wlan?.ssid||""); if(m&&o?.wlan?.system==="fritzrep"&&!m.wlan?.ssid) v.ssid=wlSsidVorschlag(m); if(!v.gebuehr) v.gebuehr=W.gebuehr||VG.wlan?.gebuehr||null; if(!v.bandbreite&&VG.wlan?.bw) v.bandbreite=VG.wlan.bw; if(!v.beginn) v.beginn=today(); }
  const fehlt=T.f.filter(f=>f.req&&(v[f.k]==null||v[f.k]==="")).map(f=>f.l);
  return {v,fehlt,sg:sgOf(T,v)};
}
/* aus Mieter-Anfrage automatisch einen Vertrag machen (läuft in der Vermieter-App) */
async function vtAuto(anfId){
  const a=st.data.anfragen?.[anfId]; if(!a||a.vertragId) return; const k=ART2TPL[a.art]; if(!k||!VTPL[k]) return;
  const m=st.data.mieter[a.mieterId]; if(!m) return;
  const {v,fehlt,sg}=vtBuild(k,m,a.felder,a.zweck);
  const id="vtr-auto-"+anfId; const T=VTPL[k];
  const status=fehlt.length?ST_P:(sg==="V"?ST_V:(m.userId?ST_M:ST_P));
  const doc={tpl:k,titel:T.t,mieterId:m.id,wohnungId:m.wohnungId,objektId:wohn(m.wohnungId)?.objektId||"",felder:v,text:T.text(v),ort:v.ort||st.cfg?.ort||"",datum:today(),status,sg,fehlt,sigVermieter:null,sigMieter:null,pdfAsset:null,erstellt:new Date().toISOString(),von:"Automatik (Anfrage)",anfrageId:anfId};
  await st.db.collection("vertraege").doc(id).set(doc); st.data.vertraege[id]={id,...doc};
  await st.db.collection("anfragen").doc(anfId).update({status:status===ST_M?"Vertrag beim Mieter":status===ST_V?"Bitte unterschreiben":"Vertrag vorbereitet",vertragId:id}).catch(()=>{});
  if(typeof syncPortals==="function") syncPortals();
}
/* vorbereitete Verträge erneut prüfen (z. B. nachdem Preise hinterlegt wurden) */
let retryBusy=false;
async function vtRetry(){
  if(retryBusy||!st.db||!isAdmin()) return; retryBusy=true;
  try{ for(const v of list("vertraege").filter(x=>x.status===ST_P&&x.anfrageId&&String(x.von||"").startsWith("Automatik"))){
    const a=st.data.anfragen?.[v.anfrageId], m=st.data.mieter[v.mieterId]; if(!a||!m) continue;
    const {v:f,fehlt,sg}=vtBuild(v.tpl,m,a.felder,a.zweck); if(fehlt.length||(sg!=="V"&&!m.userId)) continue;
    const status=sg==="V"?ST_V:ST_M; const patch={felder:f,text:VTPL[v.tpl].text(f),fehlt:[],status,sg};
    await st.db.collection("vertraege").doc(v.id).update(patch); Object.assign(v,patch);
    await st.db.collection("anfragen").doc(v.anfrageId).update({status:status===ST_M?"Vertrag beim Mieter":"Bitte unterschreiben"}).catch(()=>{});
  } if(typeof syncPortals==="function") syncPortals(); }catch(e){ console.warn("vtRetry",e); }finally{ retryBusy=false; }
}
/* Daten für die Mieter-App */
function vtZuSign(m){ return list("vertraege").filter(v=>v.mieterId===m.id&&v.status===ST_M).map(v=>({id:v.id,titel:v.titel,tpl:v.tpl,text:String(v.text||"").slice(0,20000),sum:vtSum(v.tpl,v.felder||{}),datum:v.datum,vSigned:!!v.sigVermieter})); }
/* Unterschrift des Mieters kommt an */
async function vtSigIn(m,it){
  const v=st.data.vertraege?.[it.vertragId]; if(!v||v.mieterId!==m.id||v.sigEingang===it.id) return;
  if(it.abgelehnt){ await st.db.collection("vertraege").doc(v.id).update({status:"Vom Mieter abgelehnt",grund:it.grund||"",sigEingang:it.id}); v.status="Vom Mieter abgelehnt"; v.sigEingang=it.id; return; }
  const patch={sigMieter:it.sig||null,sigEingang:it.id,mieterSigniert:it.ts||new Date().toISOString(),eingangId:it.id,eingangVon:m.userId};
  Object.assign(v,patch);
  if(v.sigVermieter){ await st.db.collection("vertraege").doc(v.id).update(patch); await vtFinish(v.id); }
  else { patch.status=ST_V; v.status=ST_V; await st.db.collection("vertraege").doc(v.id).update(patch); }
}
async function blobOf(id){ if(!id) return null; try{ const r=await fetch(assetUrl(id)); return r.ok?await r.blob():null; }catch(e){ return null; } }
async function vtFinish(id){
  const v=st.data.vertraege[id]; if(!v) return; const T=VTPL[v.tpl]||{}; const sg=v.sg||sgOf(T,v.felder||{});
  const [svB,smB]=await Promise.all([blobOf(v.sigVermieter),blobOf(v.sigMieter)]);
  const pdf=await vertragPdf(v.titel,v.text,v.ort||st.cfg?.ort||"",v.datum||today(),v.felder||{},svB,smB,sg);
  let pdfId=null; if(st.assets) pdfId=(await st.assets.upload(pdf)).id;
  const patch={pdfAsset:pdfId,status:"Unterschrieben",fertig:new Date().toISOString()};
  await st.db.collection("vertraege").doc(id).update(patch); Object.assign(v,patch);
  if(v.anfrageId) await st.db.collection("anfragen").doc(v.anfrageId).update({status:"Erledigt",vertragId:id}).catch(()=>{});
  if(v.tpl==="sepa"&&v.mieterId){ const f=v.felder||{}; const ib=String(f.iban||"").replace(/\s+/g,"").toUpperCase(); await st.db.collection("mieter").doc(v.mieterId).update({iban:ib,sepa:{aktiv:true,ref:f.ref,datum:today(),iban:ib,kontoinhaber:f.inhaber||"",quelle:"App",vertragId:id}}).catch(()=>{}); }
  if(v.tpl==="wlan"&&v.mieterId){ const m=st.data.mieter[v.mieterId], f=v.felder||{}; if(m){ const W=m.wlan||{}; const nw={...W,...(st.data.objekte[wohn(m.wohnungId)?.objektId]?.wlan?.system==="fritzrep"&&!W.ssid?{ssid:wlSsidVorschlag(m),mieterName:m.name}:{}),art:"separat",gebuehr:+f.gebuehr||W.gebuehr||0,seit:f.beginn||W.seit||today(),zahlweise:W.zahlweise||"mit Miete",vlan:W.vlan||wlVlan(m),vereinbarung:id}; if(!nw.key&&nw.status!=="gesperrt"){ nw.key=wlKey(); nw.status="aktiv"; } await st.db.collection("mieter").doc(m.id).update({wlan:nw}).catch(()=>{}); m.wlan=nw; } }
  if(v.mieterId&&pdfId&&v.tpl==="miet") await st.db.collection("mieter").doc(v.mieterId).update({vertragAsset:pdfId}).catch(()=>{});
  if(typeof syncPortals==="function") syncPortals();
  return pdf;
}
/* Vermieter: an Mieter-App senden (aus der Vorschau) */
async function vtRemote({txt,SG,pV}){
  const m=st.data.mieter[VF.mieterId]; if(!m){ toast("Bitte oben einen Mieter auswählen"); return; }
  if(!m.userId){ toast(`${m.name} hat noch keinen App-Zugang – bitte vor Ort unterschreiben oder Zugang einrichten`); return; }
  const b=$("#vtRemote"); if(b){ b.disabled=true; b.textContent="Sendet …"; }
  try{
    let sv=null; if(pV?.used()&&st.assets) sv=(await st.assets.upload(await pV.blob())).id;
    const id=VF.id||("vtr-"+Date.now().toString(36));
    const doc={tpl:VF.k,titel:VTPL[VF.k].t,mieterId:m.id,wohnungId:VF.wohnungId||m.wohnungId||"",objektId:wohn(VF.wohnungId||m.wohnungId)?.objektId||"",felder:VF.v,text:txt,ort:$("#vtOrt")?.value.trim()||st.cfg?.ort||"",datum:$("#vtDat")?.value||today(),status:ST_M,sg:SG,sigVermieter:sv,sigMieter:null,pdfAsset:null,erstellt:new Date().toISOString(),von:st.myId||"",anfrageId:VF.anfrageId||null};
    await st.db.collection("vertraege").doc(id).set(doc); st.data.vertraege[id]={id,...doc};
    if(VF.anfrageId) await st.db.collection("anfragen").doc(VF.anfrageId).update({status:"Vertrag beim Mieter",vertragId:id}).catch(()=>{});
    closeSheet(); toast(`An ${m.name} gesendet – sobald unterschrieben, siehst du es auf Start`); if(typeof syncPortals==="function") syncPortals(); render();
  }catch(e){ console.error(e); toast("Senden fehlgeschlagen"); if(b){ b.disabled=false; b.textContent="An Mieter-App zur Unterschrift"; } }
}
/* Vermieter: gegenzeichnen / unterschreiben */
function vtCounter(id){
  const v=st.data.vertraege[id]; if(!v) return; const m=st.data.mieter[v.mieterId];
  openSheet(`<div class="spread"><div><div class="small">${esc(v.status)}</div><h2>${esc(v.titel)}</h2></div><button class="btn sm ghost" data-act="close">Schließen</button></div>
  ${v.sigMieter?`<div class="note info">${esc(m?.name||"Der Mieter")} hat am ${esc(fmtDate(v.mieterSigniert))} in der App unterschrieben.</div>`:""}
  ${vtSumHtml(v.tpl,v.felder||{})}
  <details class="card"><summary>Ganzen Text lesen</summary><div style="white-space:pre-wrap;font-size:13px;line-height:1.5;margin-top:8px">${esc(v.text||"")}</div></details>
  <section class="card" style="display:flex;flex-direction:column;gap:8px"><h3>Bist du sicher?</h3><div class="small">Mit deiner Unterschrift wird der Vertrag so wie oben gültig. Danach entsteht das PDF – mit Logo – bei dir und beim Mieter.</div>
   <div class="field"><label>Unterschrift ${esc(v.felder?.vName||"Vermieter")}</label><canvas class="sig" id="vcSig"></canvas><button class="btn sm ghost" id="vcClr">Löschen</button></div>
   <div class="field chk"><input type="checkbox" id="vcOk"><label for="vcOk">Ich habe die Übersicht geprüft und bin einverstanden.</label></div></section>
  <div class="row end"><button class="btn danger" id="vcNo">Ablehnen</button><button class="btn pri" id="vcYes">${v.sigMieter?"Gegenzeichnen & fertigstellen":"Unterschreiben & fertigstellen"}</button></div>`);
  let pad; setTimeout(()=>{ pad=sigPad($("#vcSig")); },60); $("#vcClr").onclick=()=>pad?.clear();
  $("#vcNo").onclick=async()=>{ if(!await ask("Vertrag ablehnen? Der Mieter sieht den Status.","Ablehnen")) return; await st.db.collection("vertraege").doc(id).update({status:"Abgelehnt"}); if(v.anfrageId) await st.db.collection("anfragen").doc(v.anfrageId).update({status:"Abgelehnt"}).catch(()=>{}); closeSheet(); toast("Abgelehnt"); };
  $("#vcYes").onclick=async()=>{ if(!pad?.used()){ toast("Bitte unterschreiben"); return; } if(!$("#vcOk").checked){ toast("Bitte bestätigen"); return; } const b=$("#vcYes"); b.disabled=true; b.textContent="Erstellt PDF …";
    try{ const sv=st.assets?(await st.assets.upload(await pad.blob())).id:null; await st.db.collection("vertraege").doc(id).update({sigVermieter:sv}); v.sigVermieter=sv; const pdf=await vtFinish(id); closeSheet(); toast("Vertrag fertig – liegt bei dir und beim Mieter"); if(pdf&&st.dl) saveFile(`${v.titel.replace(/[^\wäöüÄÖÜß]+/g,"_")}_${String(v.felder?.mName||"").replace(/\s+/g,"_")}_${today()}.pdf`,pdf); }
    catch(e){ console.error(e); toast("Fehlgeschlagen"); b.disabled=false; b.textContent="Unterschreiben & fertigstellen"; } };
}
/* Vorgaben (Preise) für automatische Verträge */
function vtVorgabenSheet(){
  const VG=vtVorgaben(), ST=["Außenstellplatz","Tiefgaragenstellplatz","Garage","Carport"], MD=["Strom","Wasser (kalt und warm)","Strom und Wasser"];
  openSheet(`<div class="spread"><h2>Vorgaben für automatische Verträge</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>
  <div class="small">Damit Verträge aus Mieter-Anfragen sofort fertig sind. Leere Felder fragt die App bei dir nach.</div>
  <h3>Stellplatz / Garage – Miete pro Monat</h3><div class="fields">${ST.map((s,i)=>`<div class="field"><label for="vg_s${i}">${esc(s)} €</label><input id="vg_s${i}" type="number" step="any" value="${VG.stell?.[s]??""}"></div>`).join("")}</div>
  <h3>Zwischenzähler – Abschlag pro Monat</h3><div class="fields">${MD.map((s,i)=>`<div class="field"><label for="vg_a${i}">${esc(s)} €</label><input id="vg_a${i}" type="number" step="any" value="${VG.abschlag?.[s]??""}"></div>`).join("")}</div>
  <h3>Internet / WLAN</h3><div class="fields"><div class="field"><label for="vg_wg">Gebühr pro Monat €</label><input id="vg_wg" type="number" step="any" value="${VG.wlan?.gebuehr??""}"></div><div class="field"><label for="vg_wb">Bandbreite (ca.)</label><input id="vg_wb" type="text" value="${esc(VG.wlan?.bw||"")}" placeholder="z. B. 100 Mbit/s"></div></div>
  <div class="row end"><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" id="vg_ok">Speichern</button></div>`);
  $("#vg_ok").onclick=async()=>{ const d={stell:{},abschlag:{},wlan:{gebuehr:num($("#vg_wg").value)||null,bw:$("#vg_wb").value.trim()}}; ST.forEach((s,i)=>{ const x=num($("#vg_s"+i).value); if(x) d.stell[s]=x; }); MD.forEach((s,i)=>{ const x=num($("#vg_a"+i).value); if(x) d.abschlag[s]=x; }); try{ await st.db.doc("config/vertragsvorgaben").set(d); st.vtVorg=d; closeSheet(); toast("Gespeichert"); vtRetry(); }catch(e){ toast("Speichern fehlgeschlagen"); } };
}
/* Mieter-App: Verträge zur Unterschrift */
function vtSignBlock(){
  const p=pm(); const xs=(p?.zuSign||[]); if(!xs.length) return "";
  const sent=new Set((st.ein?.items||[]).filter(i=>i.typ==="signatur").map(i=>i.vertragId));
  return `<section class="list"><div class="sec-title"><h2>${esc(tr("Zur Unterschrift"))}</h2><span>${xs.length}</span></div>${xs.map(x=>`<div class="item s-${sent.has(x.id)?"ok":"warn"}"><div class="head"><div><b>${esc(x.titel)}</b><div class="meta">${esc(fmtDate(x.datum))}</div></div>${sent.has(x.id)?`<span class="pill ok">${esc(tr("Unterschrieben – wartet auf Vermieter"))}</span>`:`<button class="btn sm pri" data-act="vtMSign" data-id="${esc(x.id)}">${esc(tr("Ansehen & unterschreiben"))}</button>`}</div></div>`).join("")}</section>`;
}
async function vtMSign(id){
  const p=pm(); const x=(p?.zuSign||[]).find(z=>z.id===id); if(!x) return;
  const L=(typeof LANGS!=="undefined"&&LANGS.find(q=>q[0]===st.lang)?.[1])||"Deutsch";
  openSheet(`<div class="spread"><h2>${esc(x.titel)}</h2><button class="btn sm ghost" data-act="close">${esc(tr("Schließen"))}</button></div>
  <div id="vtKi">${st.sample?`<div class="ai"><span class="spin"></span><span>${esc(tr("KI fasst den Vertrag für dich zusammen …"))}</span></div>`:""}</div>
  <section class="card" style="display:flex;flex-direction:column;gap:6px"><h3>${esc(tr("Das wird festgelegt"))}</h3><dl class="kv">${(x.sum||[]).map(([l,v])=>`<dt>${esc(tr(l))}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>
  <details class="card"><summary>${esc(tr("Ganzen Vertrag lesen"))}</summary><div style="white-space:pre-wrap;font-size:13px;line-height:1.5;margin-top:8px">${esc(x.text)}</div></details>
  <section class="card" style="display:flex;flex-direction:column;gap:8px"><h3>${esc(tr("Bist du sicher?"))}</h3><div class="small">${esc(tr("Mit deiner Unterschrift stimmst du allem oben zu. Danach unterschreibt dein Vermieter, und du findest den fertigen Vertrag unter „Meine Dokumente“."))}</div>
   <div class="field"><label>${esc(tr("Deine Unterschrift"))}</label><canvas class="sig" id="msSig"></canvas><button class="btn sm ghost" id="msClr">${esc(tr("Löschen"))}</button></div>
   <div class="field chk"><input type="checkbox" id="msOk"><label for="msOk">${esc(tr("Ich habe die Übersicht gelesen und bin einverstanden."))}</label></div></section>
  <div class="field full"><label for="msGrund">${esc(tr("Frage oder Grund, falls du nicht unterschreibst (optional)"))}</label><input id="msGrund" type="text"></div>
  <div class="row end"><button class="btn" id="msNo">${esc(tr("Nicht unterschreiben"))}</button><button class="btn pri" id="msYes">${esc(tr("Unterschreiben"))}</button></div>`);
  let pad; setTimeout(()=>{ pad=sigPad($("#msSig")); },60); $("#msClr").onclick=()=>pad?.clear();
  if(st.sample) aiJson(`Fasse diesen Vertrag für den Mieter in einfacher Sprache zusammen. Sprache: ${L}. Antworte nur mit JSON {"punkte":["höchstens 6 kurze Punkte: was wird festgelegt (Beträge, Termine, Pflichten, Kündigung)"],"achtung":"der wichtigste Punkt, auf den der Mieter achten sollte, oder leer"}\n\nVertrag "${x.titel}":\n${x.text.slice(0,12000)}`).then(r=>{ const b=$("#vtKi"); if(!b) return; if(r.err||!r.v){ b.innerHTML=""; return; } b.innerHTML=`<section class="card" style="display:flex;flex-direction:column;gap:6px"><h3>${esc(tr("Kurz erklärt (KI)"))}</h3><ul class="small" style="margin:0;padding-inline-start:18px">${(r.v.punkte||[]).slice(0,6).map(t=>`<li>${esc(t)}</li>`).join("")}</ul>${r.v.achtung?`<div class="note warn">${esc(r.v.achtung)}</div>`:""}</section>`; });
  $("#msNo").onclick=async()=>{ const g=$("#msGrund")?.value.trim()||""; if(!mOk()) return; await mSend({typ:"signatur",vertragId:id,abgelehnt:true,grund:g.slice(0,300),datum:today()}); closeSheet(); toast(tr("Gesendet")); render(); };
  $("#msYes").onclick=async()=>{ if(!pad?.used()){ toast(tr("Bitte unterschreiben")); return; } if(!$("#msOk").checked){ toast(tr("Bitte bestätigen")); return; } if(!mOk()) return; const b=$("#msYes"); b.disabled=true; b.textContent=tr("Sendet …");
    try{ const sig=st.assets?(await st.assets.upload(await pad.blob())).id:null; await mSend({typ:"signatur",vertragId:id,sig,datum:today()}); closeSheet(); toast(tr("Unterschrieben – dein Vermieter wird informiert")); render(); }catch(e){ toast(tr("Senden fehlgeschlagen")); b.disabled=false; b.textContent=tr("Unterschreiben"); } };
}
/* Start-Hinweise beim Vermieter */
function vtAttention(att){
  list("vertraege").forEach(v=>{ const m=st.data.mieter[v.mieterId]; const n=m?.name||v.felder?.mName||"";
    if(v.status===ST_V) att.unshift({c:"bad",t:v.sigMieter?`${n} hat unterschrieben – bitte gegenzeichnen`:`Bitte unterschreiben: ${v.titel}`,s:`${v.titel}${v.anfrageId?" · aus Anfrage":""}`,a:`<button class="btn sm pri" data-act="vtCounter" data-id="${esc(v.id)}">Ansehen & unterschreiben</button>`});
    else if(v.status===ST_P) att.unshift({c:"warn",t:`Vertrag vorbereitet: ${v.titel}`,s:`${n}${(v.fehlt||[]).length?" · bitte ergänzen: "+v.fehlt.join(", "):""}${m&&!m.userId?" · Mieter ohne App-Zugang":""}`,a:`<button class="btn sm pri" data-act="vtComplete" data-id="${esc(v.id)}">Ergänzen</button><button class="btn sm ghost" data-act="vtVorg">Preise hinterlegen</button>`});
    else if(v.status==="Vom Mieter abgelehnt") att.push({c:"warn",t:`${n} hat nicht unterschrieben`,s:`${v.titel}${v.grund?" – "+v.grund:""}`,a:`<button class="btn sm" data-act="vtrOpen" data-id="${esc(v.id)}">Ansehen</button>`});
    else if(v.status==="Unterschrieben"&&v.fertig&&Date.now()-new Date(v.fertig)<3*864e5&&(v.sigEingang||v.anfrageId)) att.push({c:"ok",t:`Vertrag fertig: ${v.titel}`,s:`${n} · ${fmtDate(v.fertig)}`,a:v.pdfAsset?`<a class="btn sm" href="${esc(assetUrl(v.pdfAsset))}" target="_blank" rel="noopener">PDF öffnen</a>`:""});
  });
  const wm=list("vertraege").filter(v=>v.status===ST_M); if(wm.length) att.push({c:"neutral",t:`${wm.length} Vertr${wm.length>1?"äge warten":"ag wartet"} auf die Unterschrift des Mieters`,s:wm.slice(0,3).map(v=>`${v.titel} – ${st.data.mieter[v.mieterId]?.name||""}`).join(" · "),a:""});
}
const _vtrOpen=ACT.vtrOpen;
Object.assign(ACT,{
  vtCounter:d=>vtCounter(d.id), vtMSign:d=>vtMSign(d.id), vtVorg:()=>vtVorgabenSheet(),
  vtComplete:d=>{ const v=st.data.vertraege[d.id]; if(!v) return; openVertrag(v.tpl,{mieterId:v.mieterId,felder:v.felder,id:v.id,anfrageId:v.anfrageId}); },
  vtrOpen:d=>{ const v=st.data.vertraege[d.id]; if(v&&(v.status===ST_V)) return vtCounter(d.id); if(v&&v.status===ST_P) return ACT.vtComplete(d); if(v&&v.status===ST_M){ openSheet(`<div class="spread"><h2>${esc(v.titel)}</h2><button class="btn sm ghost" data-act="close">Schließen</button></div><div class="note info">Wartet auf die Unterschrift von ${esc(st.data.mieter[v.mieterId]?.name||"dem Mieter")} in seiner App.</div>${vtSumHtml(v.tpl,v.felder||{})}<div class="row end"><button class="btn danger" id="vmX">Zurückziehen</button><button class="btn" data-act="close">OK</button></div>`); $("#vmX").onclick=async()=>{ await st.db.collection("vertraege").doc(v.id).update({status:"Entwurf"}); closeSheet(); toast("Zurückgezogen"); }; return; } return _vtrOpen?_vtrOpen(d):undefined; }
});
if(typeof HINT2==="object") HINT2.vtVorg=["Vorgaben für Verträge","Preise für Stellplatz, Garage und Zwischenzähler – damit Verträge aus Mieter-Anfragen sofort fertig sind."];
Object.assign(window,{vtRetry,vtAuto,vtZuSign,vtSigIn,vtSumHtml,vtRemote,vtSignBlock,vtAttention,vtCounter,vtFinish});
})();
