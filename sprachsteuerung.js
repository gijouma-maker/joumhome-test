/* JoumHome – Sprachsteuerung
   1) Diktieren im Browser (Web Speech API), wenn Claudes Diktat fehlt (z. B. GitHub, Safari).
   2) Mikrofon-Knopf „Sprechen“: Satz sagen → App erkennt die Aktion und öffnet das passende,
      schon ausgefüllte Formular (Verstoß, Schaden, Ausgabe, Zählerstand, Mieteingang, Aushang,
      Garten, Bereich öffnen). Gespeichert wird erst, wenn man selbst auf „Speichern/Senden“ tippt.
   Mit Claude-KI wird der Satz von der KI verstanden, sonst über eingebaute Wortregeln. */
(function(){
  /* ---------- 1) Browser-Diktat ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var LANGMAP = { de:"de-DE", en:"en-US", tr:"tr-TR", ar:"ar-SA", ru:"ru-RU", pl:"pl-PL", uk:"uk-UA", ro:"ro-RO", it:"it-IT", fr:"fr-FR", es:"es-ES", hr:"hr-HR", sr:"sr-RS", bg:"bg-BG", el:"el-GR", fa:"fa-IR", ku:"tr-TR", hi:"hi-IN" };
  if (SR){
    var rec = null, on = false, FIN = [], PAR = [], STA = [];
    window.__webDict = {
      web: true,
      active: function(){ return on; },
      onFinal: function(f){ FIN.push(f); }, onPartial: function(f){ PAR.push(f); }, onState: function(f){ STA.push(f); },
      start: function(opts){ return new Promise(function(res, rej){
        try {
          if (rec){ try { rec.abort(); } catch(e){} }
          rec = new SR();
          var L = (opts && opts.language) || document.documentElement.lang || "de";
          rec.lang = LANGMAP[L] || L; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
          var started = false;
          rec.onstart = function(){ started = true; on = true; STA.forEach(function(f){ f({ state: "listening" }); }); res(); };
          rec.onresult = function(e){ var interim = "";
            for (var i = e.resultIndex; i < e.results.length; i++){ var r = e.results[i];
              if (r.isFinal){ var t = r[0].transcript.trim(); if (t) FIN.forEach(function(f){ f({ text: t + " " }); }); }
              else interim += r[0].transcript; }
            PAR.forEach(function(f){ f({ text: interim }); }); };
          rec.onerror = function(e){ var c = (e.error === "not-allowed" || e.error === "service-not-allowed") ? "not_granted" : (e.error === "no-speech" || e.error === "aborted") ? "stopped" : "unavailable"; if (!started) rej({ code: c }); };
          rec.onend = function(){ on = false; PAR.forEach(function(f){ f({ text: "" }); }); STA.forEach(function(f){ f({ state: "idle" }); }); };
          rec.start();
        } catch(e){ rej({ code: "unavailable" }); }
      }); },
      stop: function(){ try { if (rec) rec.stop(); } catch(e){} return Promise.resolve(); }
    };
  }

  /* ---------- 2) Sprachbefehle ---------- */
  var low = function(s){ return String(s || "").toLowerCase().replace(/ß/g, "ss").normalize("NFC"); };
  var cap = function(s){ s = String(s || "").trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
  var has = function(t, re){ return re.test(t); };

  function wohnungen(){ return list("wohnungen").map(function(w){ var o = st.data.objekte[w.objektId] || {}; var m = mieterOf(w.id); return { w: w, o: o, m: m }; }); }

  function findeWohnung(t){
    var best = null, bestS = 0, objOnly = null, objS = 0;
    var lageTok = [
      [/\b(eg|erdgeschoss|parterre)\b/, /eg|erdgeschoss|parterre/],
      [/\b(1\.? ?og|erste[nrs]? (stock|etage|og|obergeschoss)|1\. stock|ersten stock)\b/, /1\.? ?og|1\. ?stock|erste/],
      [/\b(2\.? ?og|zweite[nrs]? (stock|etage|og|obergeschoss)|2\. stock)\b/, /2\.? ?og|2\. ?stock|zweite/],
      [/\b(3\.? ?og|dritte[nrs]? (stock|etage|og|obergeschoss)|3\. stock)\b/, /3\.? ?og|3\. ?stock|dritte/],
      [/\b(dg|dachgeschoss|dach)\b/, /dg|dach/],
      [/\b(ug|keller|souterrain|untergeschoss)\b/, /ug|keller|souterrain/],
      [/\blinks\b/, /links/], [/\brechts\b/, /rechts/], [/\bmitte\b/, /mitte/]
    ];
    wohnungen().forEach(function(x){
      var s = 0, os = 0;
      if (x.m && x.m.name) low(x.m.name).split(/[\s\-]+/).forEach(function(p){ if (p.length >= 3 && new RegExp("\\b" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(t)) s += 6; });
      var on = low((x.o.name || "") + " " + (x.o.adresse || ""));
      on.split(/[\s,]+/).forEach(function(p){ if (p.length >= 4 && !/^(str|strasse|weg|platz|allee)$/.test(p) && t.indexOf(p) >= 0) os += 2; });
      var hn = (x.o.name || "").match(/\d+/); if (hn && os && new RegExp("\\b" + hn[0] + "\\b").test(t)) os += 1;
      var lg = low(x.w.lage || "");
      lageTok.forEach(function(p){ if (p[0].test(t) && p[1].test(lg)) s += 3; });
      s += os;
      if (s > bestS){ bestS = s; best = x; }
      if (os > objS){ objS = os; objOnly = x.o; }
    });
    var r = {};
    if (best && bestS >= 3){ r.wohnungId = best.w.id; r.objektId = best.w.objektId; }
    else if (objOnly){ r.objektId = objOnly.id; }
    var objs = list("objekte"); if (!r.objektId && objs.length === 1) r.objektId = objs[0].id;
    return r;
  }

  function zahl(t){ var m = t.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/); if (!m) return null; return Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : "")); }
  function betrag(t){ var m = t.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(€|euro|eur\b)/); if (m) return Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : "")); return null; }
  function verstossArt(t){
    var R = [[/bio|essensrest|kompost/, "Biomüll in Restmüll"], [/gelb/, "Falsches in Gelber Tonne"], [/papier|karton|pappe/, "Papiertonne falsch befüllt"], [/glas|flasche/, "Glas falsch entsorgt"],
      [/sperrm|matratze|sofa|möbel/, "Sperrmüll abgestellt"], [/neben (der|die) tonne|neben den tonnen/, "Müll neben der Tonne"], [/kehrwoche|treppe (nicht )?(geputzt|gereinigt)|nicht geputzt/, "Kehrwoche nicht erledigt"],
      [/garten/, "Garten nicht gepflegt"], [/treppenhaus|keller|zugestellt|fahrrad|kinderwagen|flur/, "Treppenhaus/Keller zugestellt"], [/ruhe|lärm|laut|musik|party|nachts|bohren/, "Ruhezeiten nicht eingehalten"]];
    for (var i = 0; i < R.length; i++) if (R[i][0].test(t)) return R[i][1];
    return "Sonstiges";
  }
  function zaehlerArt(t){ if (/warm/.test(t) && /wasser/.test(t)) return "Wasser warm"; if (/wasser/.test(t)) return "Wasser kalt"; if (/gas/.test(t)) return "Gas"; if (/wärmemenge|waermemenge/.test(t)) return "Wärmemenge"; if (/heiz/.test(t)) return "Heizung (Heizkostenverteiler)"; if (/strom/.test(t)) return "Strom"; return ""; }
  function kategorie(t){
    var R = [[/heiz|öl|oel|pellet|brennstoff/, "Heizung/Brennstoff"], [/wasser|abwasser/, "Wasser/Abwasser"], [/strom/, "Strom (Allgemein)"], [/müllabfuhr|abfall/, "Müllabfuhr"], [/grundsteuer/, "Grundsteuer"], [/versicherung/, "Versicherung"],
      [/hausmeister|reinigung|putz/, "Hausmeister/Reinigung"], [/garten|hecke|rasen/, "Gartenpflege"], [/schornstein|wartung/, "Schornsteinfeger/Wartung"], [/handwerker|reparatur|klempner|elektriker|monteur/, "Reparatur/Handwerker"],
      [/baumarkt|obi|hornbach|bauhaus|toom|hagebau|material|farbe|silikon|schraube|dichtung|werkzeug/, "Material/Baumarkt"], [/möbel|moebel|ikea|küche|kueche|lampe|ausstattung|waschmaschine|kühlschrank/, "Möbel/Ausstattung"], [/anwalt|gericht/, "Rechtsanwalt/Gericht"]];
    for (var i = 0; i < R.length; i++) if (R[i][0].test(t)) return R[i][1];
    return "Sonstiges";
  }
  function haendler(orig){ var m = orig.match(/\bbei (?:der |dem |den )?([A-ZÄÖÜ][\wäöüß&\-]+(?: [A-ZÄÖÜ][\wäöüß&\-]+)?)/); return m ? m[1] : ""; }
  function datum(t){
    var d = new Date(); d.setHours(12, 0, 0, 0);
    var iso = function(x){ return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
    if (/übermorgen|uebermorgen/.test(t)){ d.setDate(d.getDate() + 2); return iso(d); }
    if (/morgen/.test(t)){ d.setDate(d.getDate() + 1); return iso(d); }
    if (/heute/.test(t)) return iso(d);
    var tage = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
    for (var i = 0; i < 7; i++) if (new RegExp("\\b" + tage[i]).test(t)){ var diff = (i - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + diff); return iso(d); }
    var m = t.match(/\b(\d{1,2})\.\s?(\d{1,2})\.?(\d{2,4})?/);
    if (m){ var y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : d.getFullYear(); var x = new Date(y, Number(m[2]) - 1, Number(m[1]), 12); if (!m[3] && x < d) x.setFullYear(y + 1); return iso(x); }
    return "";
  }
  function zeiten(t){ var m = t.match(/(?:von|ab)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?\s*(?:bis)\s*(\d{1,2})(?:[:.](\d{2}))?/); if (!m) return {}; var f = function(h, mi){ return String(h).padStart(2, "0") + ":" + (mi || "00"); }; return { von: f(m[1], m[2]), bis: f(m[3], m[4]) }; }

  var NAV = [[/finanz|geld|steuer|einnahme|ausgabenübersicht/, "geld", "Finanzen"], [/häuser|haeuser|wohnungen|objekte|mieterliste|alle mieter/, "haeuser", "Häuser"], [/aufträge|auftraege|handwerker/, "hw", "Aufträge"],
    [/tickets|meldungen|schäden|schaeden|verstösse|verstoesse/, "tickets", "Tickets"], [/gemeinschaft|schwarze[sn]? brett|aushänge/, "gemein", "Gemeinschaft"], [/start|übersicht|uebersicht|home/, "start", "Start"]];

  function regeln(orig){
    var t = low(orig), tenant = isTenant();
    var prio = /dringend|sofort|notfall|eilig|schnell/.test(t) ? "Dringend" : "Normal";
    var W = tenant ? {} : findeWohnung(t);
    var navigiere = /^(öffne|oeffne|zeig|zeige|geh|gehe|wechsel|wechsle|bring mich|zu den|zur|zum)\b/.test(t) || /\b(öffnen|oeffnen|anzeigen|zeigen)\b\s*$/.test(t);
    if (navigiere && !tenant){ for (var i = 0; i < NAV.length; i++) if (NAV[i][0].test(t)) return { aktion: "bereich", tab: NAV[i][1], name: NAV[i][2] }; }
    if (/miete/.test(t) && /(bezahlt|gezahlt|eingegangen|überwiesen|ueberwiesen|erhalten|mieteingang)/.test(t) && !tenant) return Object.assign({ aktion: "mieteingang", bezahlt: betrag(t) || zahl(t) }, W);
    if (/zählerstand|zaehlerstand|zähler|zaehler/.test(t)){ var n = t.match(/(?:stand|steht auf|bei|ist)\s*(\d[\d.,]*)/); var stand = n ? Number(n[1].replace(/\.(?=\d{3})/g, "").replace(",", ".")) : zahl(t.replace(/\b\d{1,2}\.\s?og\b/g, "")); return Object.assign({ aktion: "zaehler", art: zaehlerArt(t), stand: stand }, W); }
    if (/versto(ss|ß)|hausordnung|biomüll|biomuell|restmüll|tonne|ruhezeit|lärm|laerm|zu laut|sperrmüll|zugestellt|kehrwoche (nicht|wieder)|nicht geputzt|müll (im|in|neben)/.test(t)) return Object.assign({ aktion: "verstoss", art: verstossArt(t), prio: prio, text: cap(orig) }, W);
    if (/schaden|kaputt|defekt|tropft|undicht|leck|läuft aus|funktioniert nicht|geht nicht|schimmel|verstopft|zerbrochen|gebrochen|riss|klemmt|kein warmwasser|keine heizung|kalt bleibt|bleibt kalt|wird nicht warm|nicht warm|ist kalt|keine heizung|kein strom|kein licht|heizung (ist |bleibt )?(kalt|aus)|ausgefallen|wasserschaden/.test(t)) return Object.assign({ aktion: "schaden", prio: prio, text: cap(orig) }, W);
    if (/aushang|schwarze[sn]? brett|zu verschenken|verschenke|verkaufe|zu verkaufen|suche |gesucht/.test(t)){ var art = /verschenk/.test(t) ? "Zu verschenken" : /verkauf/.test(t) ? "Zu verkaufen" : /such/.test(t) ? "Gesucht" : /feier|geburtstag|party/.test(t) ? "Feier / Geburtstag" : (tenant ? "Sonstiges" : "Info vom Vermieter"); var tx = orig.replace(/^.*?(aushang|schwarze[sn]? brett)\s*(:|mit|erstellen|machen)?\s*/i, ""); return Object.assign({ aktion: "aushang", art: art, text: cap(tx || orig), preis: betrag(t) }, W); }
    if (/garten/.test(t) && /(reserv|buchen|grill|feier|nutzen)/.test(t)){ var z = zeiten(t); return Object.assign({ aktion: "garten", datum: datum(t), von: z.von, bis: z.bis, anlass: /geburtstag/.test(t) ? "Geburtstag" : /grill/.test(t) ? "Grillen" : "" }, W); }
    if (!tenant && (/ausgabe|gekauft|kassenbon|beleg|rechnung|bezahlt|gezahlt|kosten/.test(t) || betrag(t) != null)){ return Object.assign({ aktion: "ausgabe", betrag: betrag(t) || zahl(t), kategorie: kategorie(t), haendler: haendler(orig), text: cap(orig) }, W); }
    if (!tenant){ for (var j = 0; j < NAV.length; j++) if (NAV[j][0].test(t) && t.split(/\s+/).length <= 4) return { aktion: "bereich", tab: NAV[j][1], name: NAV[j][2] }; }
    return { aktion: "unklar" };
  }

  async function perKi(orig){
    if (!st.sample) return null;
    try { if (typeof nutzen === "function" && !(await nutzen("ki"))) return null; } catch(e){ return null; }
    var tenant = isTenant();
    var ws = tenant ? "" : wohnungen().map(function(x){ return x.w.id + " = " + (x.o.name || x.w.objektId) + ", " + (x.w.lage || "") + (x.m ? ", Mieter " + x.m.name : ", leer"); }).join("\n");
    var ob = tenant ? "" : list("objekte").map(function(o){ return o.id + " = " + (o.name || "") + (o.adresse ? " (" + o.adresse + ")" : ""); }).join("\n");
    var aktionen = tenant
      ? 'schaden {text, prio}; verstoss {art, text}; zaehler {art, stand}; aushang {art, text, preis}; garten {datum, von, bis, anlass}; unklar {}'
      : 'verstoss {wohnungId, art, prio, text}; schaden {wohnungId, prio, text}; ausgabe {objektId, wohnungId, betrag, kategorie, haendler, text}; zaehler {wohnungId, art, stand}; mieteingang {wohnungId, bezahlt}; aushang {objektId, art, text, preis}; garten {objektId, wohnungId, datum, von, bis, anlass}; bereich {tab} (tab: start|haeuser|hw|geld|tickets|gemein); unklar {}';
    var p = "Du übersetzt einen gesprochenen Satz in eine Aktion der Vermieter-App JoumHome. Antworte NUR mit einem JSON-Objekt, ohne weiteren Text.\n"
      + "Heute ist " + today() + ". Rolle: " + (tenant ? "Mieter" : "Vermieter") + ".\n"
      + "Aktionen mit Feldern: " + aktionen + "\n"
      + "Pflicht: Feld \"aktion\". Datum als JJJJ-MM-TT, Zeiten als HH:MM, Beträge als Zahl. prio: Normal|Dringend. text = kurze, saubere Beschreibung auf Deutsch.\n"
      + "art bei verstoss genau eins von: " + VERSTOSS.join(" | ") + "\n"
      + "art bei zaehler genau eins von: " + ZAEHLER.join(" | ") + "\n"
      + "kategorie bei ausgabe genau eins von: " + KAT.join(" | ") + "\n"
      + "art bei aushang genau eins von: " + BRETT_ART.join(" | ") + "\n"
      + (tenant ? "" : "Wohnungen (id = Haus, Lage, Mieter):\n" + ws + "\nHäuser:\n" + ob + "\nNimm nur IDs aus diesen Listen; wenn unklar, Feld weglassen.\n")
      + "Satz: \"" + orig.replace(/"/g, "'") + "\"";
    try {
      var r = await st.sample([{ role: "user", content: p }], { cache: false });
      var m = String(r && r.text || "").match(/\{[\s\S]*\}/); if (!m) return null;
      var a = JSON.parse(m[0]); if (!a || !a.aktion) return null;
      if (a.wohnungId && !st.data.wohnungen[a.wohnungId]) delete a.wohnungId;
      if (a.objektId && !st.data.objekte[a.objektId]) delete a.objektId;
      if (a.wohnungId && !a.objektId) a.objektId = st.data.wohnungen[a.wohnungId].objektId;
      return a;
    } catch(e){ console.warn("KI-Sprachbefehl", e); return null; }
  }

  var HINWEIS = '<div class="note info" style="margin-bottom:8px">🎤 Per Sprache ausgefüllt – bitte kurz prüfen und dann speichern.</div>';
  function banner(){ var sh = document.getElementById("sheet"); var f = sh && sh.querySelector(".fields"); if (f) f.insertAdjacentHTML("beforebegin", HINWEIS); }
  function setM(k, v){ if (v == null || v === "") return; var el = document.getElementById("m_" + k); if (!el) return; if (el.type === "checkbox") el.checked = !!v; else el.value = v; }
  var clean = function(o){ var r = {}; for (var k in o) if (o[k] != null && o[k] !== "") r[k] = o[k]; return r; };

  function ausfuehren(a){
    var tenant = isTenant(), msg = "";
    if (a.aktion === "bereich"){ closeSheet(); ACT.tab({ tab: a.tab }); toast((a.name || "Bereich") + " geöffnet"); return true; }
    if (tenant){
      var map = { schaden: "schaden", verstoss: "verstoss", zaehler: "zaehler", aushang: "brett", garten: "garten" };
      var typ = map[a.aktion]; if (!typ) return false;
      openMForm(typ); banner();
      if (typ === "schaden"){ setM("text", a.text); setM("dringend", a.prio === "Dringend"); }
      if (typ === "verstoss"){ setM("art", a.art); setM("text", a.text); }
      if (typ === "zaehler"){ setM("art", a.art); setM("stand", a.stand); }
      if (typ === "brett"){ setM("art", a.art === "Info vom Vermieter" ? "Sonstiges" : a.art); setM("text", a.text); setM("preis", a.preis); }
      if (typ === "garten"){ setM("datum", a.datum); setM("von", a.von); setM("bis", a.bis); setM("anlass", a.anlass); }
      msg = "Ich habe das Formular ausgefüllt. Bitte prüfen und auf Senden tippen.";
    } else {
      var w = a.wohnungId && st.data.wohnungen[a.wohnungId]; if (w && !a.objektId) a.objektId = w.objektId;
      if (a.aktion === "verstoss") openForm("verstoesse", null, clean({ wohnungId: a.wohnungId, art: a.art || "Sonstiges", prio: a.prio, notiz: a.text, quelle: "Selbst festgestellt" }));
      else if (a.aktion === "schaden") openForm("schaeden", null, clean({ wohnungId: a.wohnungId, beschreibung: a.text, prio: a.prio }));
      else if (a.aktion === "ausgabe") openForm("ausgaben", null, clean({ betrag: a.betrag, objektId: a.objektId, wohnungId: a.wohnungId, kategorie: a.kategorie, haendler: a.haendler, beschreibung: a.text }));
      else if (a.aktion === "zaehler") openForm("zaehler", null, clean({ wohnungId: a.wohnungId, art: a.art, stand: a.stand }));
      else if (a.aktion === "mieteingang") openForm("zahlungen", null, clean({ wohnungId: a.wohnungId, bezahlt: a.bezahlt, eingang: today(), monat: curYm() }));
      else if (a.aktion === "aushang") openForm("brett", null, clean({ objektId: a.objektId, art: a.art, text: a.text, preis: a.preis }));
      else if (a.aktion === "garten") openForm("garten", null, clean({ objektId: a.objektId, wohnungId: a.wohnungId, datum: a.datum, von: a.von, bis: a.bis, anlass: a.anlass }));
      else return false;
      banner();
      var fehlt = [];
      if (/verstoss|schaden|zaehler|mieteingang/.test(a.aktion) && !a.wohnungId) fehlt.push("die Wohnung");
      if (a.aktion === "ausgabe" && !a.betrag) fehlt.push("den Betrag");
      if (a.aktion === "zaehler" && !a.stand) fehlt.push("den Zählerstand");
      msg = fehlt.length ? "Formular ausgefüllt. Bitte noch " + fehlt.join(" und ") + " auswählen, dann speichern." : "Formular ausgefüllt. Bitte prüfen und speichern.";
    }
    toast(msg); try { if (st.tts && st.speakHints !== false) say(msg); } catch(e){}
    return true;
  }

  function beispiele(){
    return isTenant()
      ? ["Die Heizung im Bad bleibt kalt, dringend", "Biomüll war wieder im Restmüll", "Mein Stromzähler steht auf 12345", "Garten reservieren am Samstag von 14 bis 18 Uhr"]
      : ["Verstoß Musterstraße 1 EG links: Biomüll im Restmüll", "Schaden bei Demir, Wasserhahn tropft", "Ausgabe 84,90 Euro bei Obi für Silikon", "Zählerstand Strom 1. OG 12345", "Miete von Mustermann 830 Euro bezahlt", "Öffne Finanzen"];
  }

  function sheetHtml(){
    var micOk = !!st.dict;
    return '<div class="spread"><h2>Sprechen</h2><button class="btn sm ghost" data-act="close">Schließen</button></div>'
      + '<div class="small">' + (micOk ? "Tippe auf das Mikrofon und sag einfach, was du erledigen möchtest. Ich öffne das passende Formular schon ausgefüllt." : "Spracheingabe ist in diesem Browser nicht verfügbar (am besten Chrome, Edge oder Safari). Du kannst den Satz aber hier eintippen.") + '</div>'
      + (micOk ? '<div style="display:flex;justify-content:center;margin:14px 0 6px"><button type="button" class="mic vc-big" data-act="vcMic" data-target="vcTxt" aria-label="Sprechen">' + MIC_SVG + '</button></div>' : "")
      + '<div class="small mic-live" id="vcTxt_live" style="text-align:center;min-height:18px"></div>'
      + '<div class="field full"><textarea id="vcTxt" class="fx" rows="2" placeholder="z. B. ' + esc(beispiele()[0]) + '"></textarea></div>'
      + '<div class="row end"><button class="btn pri" data-act="vcGo" id="vcGoBtn">Ausführen</button></div>'
      + '<div id="vcOut"></div>'
      + '<div class="small" style="margin-top:6px">Beispiele:</div><div class="chips">' + beispiele().map(function(b){ return '<button data-act="vcEx" data-q="' + esc(b) + '">' + esc(b) + '</button>'; }).join("") + '</div>';
  }

  var watch = null, warAktiv = false;
  function oeffnen(){
    openSheet(sheetHtml());
    var ta = document.getElementById("vcTxt");
    if (ta) ta.addEventListener("keydown", function(e){ if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); los(); } });
    clearInterval(watch); warAktiv = false;
    watch = setInterval(function(){
      var t = document.getElementById("vcTxt"); if (!t){ clearInterval(watch); if (warAktiv && st.dict && st.dict.active()) st.dict.stop().catch(function(){}); return; }
      var a = !!(st.dict && st.dict.active());
      var b = document.querySelector(".vc-big"); if (b) b.classList.toggle("rec", a);
      if (warAktiv && !a && t.value.trim()) setTimeout(los, 350);
      warAktiv = a;
    }, 300);
    if (st.dict) setTimeout(function(){ micStart("vcTxt"); }, 250);
  }

  var busy = false;
  async function los(){
    var t = document.getElementById("vcTxt"); if (!t || busy) return;
    var text = t.value.trim(); if (!text){ toast("Bitte etwas sagen oder eintippen"); return; }
    if (st.dict && st.dict.active()){ warAktiv = false; await st.dict.stop().catch(function(){}); }
    busy = true; var out = document.getElementById("vcOut"), btn = document.getElementById("vcGoBtn");
    if (btn){ btn.disabled = true; btn.textContent = "Verstehe …"; }
    try {
      var a = await perKi(text);
      if (!a || a.aktion === "unklar") { var r = regeln(text); if (r.aktion !== "unklar" || !a) a = r; }
      clearInterval(watch);
      if (!ausfuehren(a)){
        if (out) out.innerHTML = '<div class="note warn" style="margin-top:8px">Das habe ich nicht verstanden. Sag z. B. „Verstoß …“, „Schaden …“, „Ausgabe … Euro“ oder „Zählerstand …“.'
          + (st.sample ? ' <button class="btn sm" data-act="vcKi">Stattdessen KI-Assistent fragen</button>' : "") + '</div>';
        try { if (st.tts) say("Das habe ich nicht verstanden. Bitte noch einmal anders sagen."); } catch(e){}
      }
    } catch(e){ console.error(e); toast("Hat nicht geklappt – bitte noch einmal"); }
    busy = false; if (btn && document.body.contains(btn)){ btn.disabled = false; btn.textContent = "Ausführen"; }
  }

  function knopfZeigen(){
    var b = document.getElementById("vcFab"); if (!b) return;
    var ok = false; try { ok = st.loaded && !st.noDb && !st.preview && (isAdmin() || st.role === "mieter"); } catch(e){}
    b.classList.toggle("hide", !ok);
  }

  function init(){
    if (typeof ACT === "undefined" || typeof st === "undefined") return;
    var css = document.createElement("style");
    css.textContent = "#vcFab{bottom:calc(156px + env(safe-area-inset-bottom))}body.hasS #vcFab{bottom:calc(204px + env(safe-area-inset-bottom))}#kiFab.hide~#vcFab{bottom:calc(92px + env(safe-area-inset-bottom))}body.hasS #kiFab.hide~#vcFab{bottom:calc(140px + env(safe-area-inset-bottom))}"
      + ".vc-big{position:static!important;inset:auto!important;transform:none!important;width:84px!important;height:84px!important;border-radius:50%!important;display:grid!important;place-items:center;background:var(--hi)!important;color:var(--hi-ink)!important;border:0!important;cursor:pointer}.vc-big.rec{background:#e5484d!important;color:#fff!important}.vc-big svg{width:38px;height:38px}"
      + ".vc-big.rec{animation:vcPuls 1.2s ease-in-out infinite}@keyframes vcPuls{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.45)}50%{box-shadow:0 0 0 16px rgba(255,255,255,0)}}";
    document.head.appendChild(css);
    var kf = document.getElementById("kiFab");
    var b = document.createElement("button");
    b.className = "fab hide"; b.id = "vcFab"; b.setAttribute("data-act", "vcOpen"); b.setAttribute("aria-label", "Sprechen"); b.title = "Per Sprache erledigen";
    b.innerHTML = MIC_SVG.replace("<svg ", '<svg width="24" height="24" ');
    if (kf && kf.parentNode) kf.parentNode.insertBefore(b, kf.nextSibling); else document.body.appendChild(b);
    Object.assign(ACT, {
      vcOpen: function(){ oeffnen(); },
      vcGo: function(){ return los(); },
      vcMic: function(){ warAktiv = false; micStart("vcTxt"); },
      vcEx: function(d){ var t = document.getElementById("vcTxt"); if (t){ t.value = d.q; los(); } },
      vcKi: function(){ var t = document.getElementById("vcTxt"); var q = t ? t.value : ""; closeSheet(); openChat(); var c = document.getElementById("chatTxt"); if (c){ c.value = q; sendChat(); } }
    });
    if (typeof HINT2 === "object") HINT2.vcOpen = ["Sprechen", "Sag einfach, was du tun möchtest – z. B. einen Verstoß oder Schaden melden. Das Formular wird automatisch ausgefüllt."];
    setInterval(knopfZeigen, 700); knopfZeigen();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
