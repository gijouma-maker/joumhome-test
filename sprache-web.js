/* JoumHome – Sprachausgabe über den Browser (für GitHub Pages / ohne Claude-Anmeldung)
   Nutzt die eingebaute Vorlesefunktion von Chrome, Edge, Safari, Android und iPhone. */
(function(){
  if(!("speechSynthesis" in window) || window.__webTts) return;
  var S=window.speechSynthesis, cbs=[];
  var MALE=/\b(male|mann|daniel|markus|stefan|thomas|yannick|conrad|killian|florian|guy|ryan|andrew|christopher|eric|davis|tony|george|james|david|mark|jorge|pablo|diego|alvaro|henri|paul|thomas|dmitri|dmitry|pavel|maxim|ahmet|tolga|hamed|naayf|shakir)\b/i;
  var FEMALE=/\b(female|frau|anna|petra|helena|katja|hedda|marlene|vicki|amala|zira|samantha|karen|susan|hazel|jenny|aria|emma|sonia|libby|elena|laura|lucia|paulina|monica|irina|svetlana|ekaterina|milena|yelda|filiz|emel|zariyah|salma|hoda|julie|amelie|denise|audrey|google deutsch|google fran)\b/i;
  function fire(s){ cbs.forEach(function(c){ try{ c({state:s}); }catch(e){} }); }
  function pick(lang,voice){
    var vs=S.getVoices()||[], L=String(lang||"de-DE").toLowerCase(), two=L.slice(0,2);
    var c=vs.filter(function(v){ return String(v.lang).toLowerCase().replace("_","-")===L; });
    if(!c.length) c=vs.filter(function(v){ return String(v.lang).toLowerCase().indexOf(two)===0; });
    if(!c.length) return null;
    var male=(voice==="rounded"||voice==="glassy"), want=male?MALE:FEMALE, other=male?FEMALE:MALE;
    return c.filter(function(v){ return want.test(v.name); })[0] || c.filter(function(v){ return !other.test(v.name); })[0] || c[0];
  }
  var tts={ web:true,
    speak:function(text,o){ o=o||{}; return new Promise(function(res,rej){
      try{ S.cancel(); var u=new SpeechSynthesisUtterance(String(text).slice(0,2000));
        u.lang=o.language||document.documentElement.lang||"de-DE"; var v=pick(u.lang,o.voice); if(v) u.voice=v;
        u.rate=Math.max(0.7,Math.min(1.5,Number(o.rate)||1)); if(o.voice==="rounded") u.pitch=0.85;
        u.onend=function(){ fire("idle"); res(); }; u.onerror=function(e){ fire("idle"); rej({code:(e&&e.error)||"error"}); };
        fire("speaking"); S.speak(u); }catch(e){ rej({code:"error"}); } }); },
    stop:function(){ S.cancel(); fire("idle"); },
    onState:function(cb){ cbs.push(cb); return function(){}; }
  };
  try{ S.getVoices(); S.onvoiceschanged=function(){ S.getVoices(); }; }catch(e){}
  window.__webTts=tts;
  /* In die App einhängen, wenn Claude keine Sprachausgabe liefert */
  function attach(){ try{
    if(typeof st==="undefined") return false;
    if(!st.tts){ st.tts=tts; }
    var b=document.getElementById("ttsBtn"); if(b){ b.classList.remove("hide"); b.classList.toggle("on",!!st.speakHints); }
    if(typeof render==="function") render();
    return true; }catch(e){ return false; } }
  var n=0, t=setInterval(function(){ n++; if((typeof st!=="undefined" && document.getElementById("ttsBtn") && n>3 && attach()) || n>40) clearInterval(t); },300);
})();
