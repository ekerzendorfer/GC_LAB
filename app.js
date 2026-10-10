(() => {
  "use strict";

  const VERSION = "0.3.2";
  const FLOW = {
    low: {label:"niedrig", value:0.8, efficiency:0.82},
    medium: {label:"mittel", value:1.2, efficiency:1.00},
    high: {label:"hoch", value:1.8, efficiency:0.78}
  };
  const DISPLAY_SPEED = {
    observe: {label:"Beobachten · 12×", factor:12},
    fast: {label:"Schnell · 60×", factor:60},
    instant: {label:"Sofort", factor:Infinity}
  };
  const REF_T = 100;
  const REF_TM = 0.80;
  const REF_PLATES = 550;
  const DETECTION_LIMIT = 0.01;

  let db = null;
  let history = [];
  let lastRun = null;
  let selectedHistoryIndex = null;
  let bridgeMode = bridgeRequested();
  let bridgeRun = null;
  let bridgeInput = null;
  let hubSample = null;
  let verificationMode = false;
  let verificationOriginalRun = null;
  let verificationStandardRun = null;
  let verificationSpikeRun = null;
  let verificationEvidence = {standard:false,spike:false};
  let runInProgress = false;
  let activeRunAnimation = null;
  let animationSequence = 0;
  let identificationAnimation = null;
  let identificationSequence = 0;
  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function bridgeRequested(){
    const params=new URLSearchParams(window.location.search);
    return params.get("bridge")==="1";
  }

  function loadAnalytikBridgeScript(){
    if(window.AnalytikBridge) return Promise.resolve(window.AnalytikBridge);
    return new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=new URL("../CHEMIE_ANALYTIK_HUB/bridge/chemie-analytik-bridge.js",window.location.href).toString();
      script.onload=()=>window.AnalytikBridge?resolve(window.AnalytikBridge):reject(new Error("Bridge-API fehlt."));
      script.onerror=()=>reject(new Error("CHEMIE_ANALYTIK_BRIDGE konnte nicht geladen werden."));
      document.head.appendChild(script);
    });
  }

  async function init(){
    bindEls();
    db = await loadData();
    populateControls();
    bindEvents();
    applyLevel();
    if(bridgeMode){
      els.sampleInfo.textContent="Hub-Probe wird geladen …";
      els.columnInfo.textContent=currentColumn().description_de;
    }else{
      updateInfo();
    }
    drawEmptyChromatogram();
    if(bridgeMode) await initAnalytikBridge();
  }

  function bindEls(){
    ["levelSelect","sampleSelect","columnSelect","lengthSelect","temperatureSelect","flowSelect","displaySpeedSelect",
      "sampleInfo","columnInfo","runBtn","resetBtn","chromCanvas","runStatus","methodFeedback",
      "runtimeMetric","peakCountMetric","rsMetric","qualityMetric","peakTable","historyTable",
      "bridgeContext","bridgeSampleLabel","bridgeRunLabel","bridgeMessage","bridgeAcceptBtn","bridgeReturnBtn","modeLabel",
      "verificationPanel","verificationHypothesis","verificationPeak","verificationMethod","standardRunBtn","spikeRunBtn",
      "standardEvidence","spikeEvidence","verificationLegend","verificationZoomCanvas","verificationZoomLegend",
      "identificationPanel","identMethodLabel","identIntro","identStandardButtons","identStandardTitle","identStandardInfo",
      "identPeakSelect","identAssignBtn","identCanvas","identAssignmentFeedback","identMapBody"]
      .forEach(id => els[id] = document.getElementById(id));
  }

  async function loadData(){
    const files = await Promise.all([
      fetch("data/gc-substances.json",{cache:"no-store"}).then(r=>{if(!r.ok) throw new Error("gc-substances.json fehlt"); return r.json();}),
      fetch("data/gc-columns.json",{cache:"no-store"}).then(r=>{if(!r.ok) throw new Error("gc-columns.json fehlt"); return r.json();}),
      fetch("data/gc-samples.json",{cache:"no-store"}).then(r=>{if(!r.ok) throw new Error("gc-samples.json fehlt"); return r.json();})
    ]);
    return {substances:files[0].substances, columns:files[1].columns, samples:files[2].samples};
  }

  function populateSampleOptions(){
    if(bridgeMode){
      els.sampleSelect.innerHTML='<option value="">Hub-Probe wird geladen …</option>';
      els.sampleSelect.disabled=true;
      return;
    }
    const current=els.sampleSelect.value;
    const basic=els.levelSelect.value==="basic";
    const choices=basic ? db.samples.filter(s=>s.composition.length<=2 && !s.unknown) : db.samples;

    if(basic){
      els.sampleSelect.innerHTML=choices.map(s=>'<option value="'+s.id+'">'+s.name_de+'</option>').join("");
    }else{
      const unknown=choices.filter(s=>s.unknown);
      const learning=choices.filter(s=>!s.unknown);
      els.sampleSelect.innerHTML=
        (learning.length?'<optgroup label="Lernproben">'+learning.map(s=>'<option value="'+s.id+'">'+s.name_de+'</option>').join("")+'</optgroup>':"")
        +(unknown.length?'<optgroup label="Unbekannte Proben">'+unknown.map(s=>'<option value="'+s.id+'">'+s.name_de+'</option>').join("")+'</optgroup>':"");
    }
    if(choices.some(s=>s.id===current)) els.sampleSelect.value=current;
  }

  function populateControls(){
    populateSampleOptions();
    els.columnSelect.innerHTML = db.columns.map(c=>'<option value="'+c.id+'">'+c.name_de+'</option>').join("");
    els.temperatureSelect.innerHTML = Array.from({length:8},(_,i)=>70+i*10).map(t=>'<option value="'+t+'" '+(t===100?"selected":"")+'>'+t+' °C</option>').join("");
  }

  function bindEvents(){
    els.levelSelect.addEventListener("change",()=>{applyLevel(); populateSampleOptions(); updateInfo();});
    els.sampleSelect.addEventListener("change",updateInfo);
    els.columnSelect.addEventListener("change",updateInfo);
    els.runBtn.addEventListener("click",runGc);
    els.historyTable.addEventListener("click",event=>{
      const row=event.target.closest("tr[data-history-index]");
      if(!row) return;
      showHistoryRun(Number(row.dataset.historyIndex));
    });
    els.resetBtn.addEventListener("click",resetSession);
    els.standardRunBtn.addEventListener("click",runVerificationStandard);
    els.spikeRunBtn.addEventListener("click",runVerificationSpike);
    els.identStandardButtons.addEventListener("click",event=>{
      const btn=event.target.closest("button[data-standard-id]");
      if(btn) runIdentificationStandard(btn.dataset.standardId);
    });
    els.identAssignBtn.addEventListener("click",assignIdentificationPeak);
  }

  function applyLevel(){
    const basic = els.levelSelect.value === "basic";
    if(basic){
      els.lengthSelect.value = "30";
      els.flowSelect.value = "medium";
    }
    els.lengthSelect.disabled = basic;
    els.flowSelect.disabled = basic;
  }

  function restoreControlLocks(){
    [els.levelSelect,els.sampleSelect,els.columnSelect,els.lengthSelect,els.temperatureSelect,els.flowSelect,els.displaySpeedSelect]
      .forEach(el=>{if(el) el.disabled=false;});
    applyLevel();
    if(bridgeMode){
      els.levelSelect.disabled=true;
      els.sampleSelect.disabled=true;
    }
    if(verificationMode) setMethodControls(verificationMethodFromInput());
  }

  function setRunControlsLocked(locked){
    if(locked){
      [els.levelSelect,els.sampleSelect,els.columnSelect,els.lengthSelect,els.temperatureSelect,els.flowSelect,els.displaySpeedSelect]
        .forEach(el=>{if(el) el.disabled=true;});
      els.runBtn.disabled=true;
      els.runBtn.textContent="Messung läuft …";
    }else{
      els.runBtn.disabled=false;
      els.runBtn.textContent="GC-Lauf starten";
      restoreControlLocks();
    }
  }

  function cancelRunAnimation(){
    animationSequence++;
    if(activeRunAnimation!==null){
      cancelAnimationFrame(activeRunAnimation);
      activeRunAnimation=null;
    }
    runInProgress=false;
  }

  function resetSession(){
    cancelRunAnimation();
    cancelIdentificationAnimation();
    history=[];
    lastRun=null;
    selectedHistoryIndex=null;
    setRunControlsLocked(false);
    renderHistory();
    resetMetrics();
    drawEmptyChromatogram();
    hideIdentification();
    setFeedback("Wähle eine Methode und starte den ersten Lauf.","neutral");
    updateBridgeAccept(null);
  }

  function updateInfo(){
    const sample = currentSample();
    const column = currentColumn();
    els.sampleInfo.textContent = sample.description_de;
    els.columnInfo.textContent = column.description_de;
  }

  function currentSample(){return bridgeMode && hubSample ? hubSample : (db.samples.find(x=>x.id===els.sampleSelect.value) || db.samples[0]);}
  function currentColumn(){return db.columns.find(x=>x.id===els.columnSelect.value) || db.columns[0];}
  function substance(id){return db.substances.find(x=>x.id===id);}

  function method(){
    return {
      column_id:els.columnSelect.value,
      length_m:Number(els.lengthSelect.value),
      temperature_c:Number(els.temperatureSelect.value),
      flow_key:els.flowSelect.value,
      flow_ml_min:FLOW[els.flowSelect.value].value
    };
  }

  function retentionFactor(sub, columnId, temperature){
    const p = sub.gc[columnId];
    return p.k_ref * Math.exp(p.temp_coeff * (REF_T - temperature));
  }

  function simulate(sample, m){
    const column = db.columns.find(x=>x.id===m.column_id);
    const flow = FLOW[m.flow_key];
    const tm = REF_TM * (m.length_m/30) * (1.2/m.flow_ml_min);
    const plates = REF_PLATES * (m.length_m/30) * flow.efficiency * column.efficiency_factor;

    let analytes = sample.composition.map(comp=>{
      const sub = substance(comp.substance_id);
      const k = retentionFactor(sub,m.column_id,m.temperature_c);
      const tr = tm*(1+k);
      const sigma = tr/Math.sqrt(plates);
      const width = 4*sigma;
      const responseArea = comp.fraction*sub.detector_response;
      return {substance:sub,fraction:comp.fraction,k,tr,sigma,width,responseArea};
    });

    const totalResponse = analytes.reduce((s,a)=>s+a.responseArea,0) || 1;
    analytes.forEach(a=>a.areaPercent=100*a.responseArea/totalResponse);
    analytes = analytes.filter(a=>a.responseArea/totalResponse >= DETECTION_LIMIT).sort((a,b)=>a.tr-b.tr);
    analytes.forEach((a,i)=>a.peakId=`P${i+1}`);

    const resolutions=[];
    for(let i=0;i<analytes.length-1;i++){
      const a=analytes[i], b=analytes[i+1];
      resolutions.push(2*(b.tr-a.tr)/(a.width+b.width));
    }
    const minRs = resolutions.length ? Math.min(...resolutions) : null;
    const last = analytes[analytes.length-1];
    const runtime = last ? last.tr + Math.max(0.35,5*last.sigma) : tm*2;
    const quality = qualityFor(minRs, analytes.length, runtime);
    const points = chromatogramPoints(analytes,runtime);

    return {method:m, sample, analytes, resolutions, minRs, runtime, quality, points, tm, plates};
  }

  function chromatogramPoints(analytes,runtime){
    const n=900, points=[];
    for(let i=0;i<n;i++){
      const t=runtime*i/(n-1);
      let y=0;
      analytes.forEach(a=>{
        const amp=a.responseArea/(a.sigma*Math.sqrt(2*Math.PI));
        y += amp*Math.exp(-0.5*Math.pow((t-a.tr)/a.sigma,2));
      });
      points.push({t,y});
    }
    return points;
  }

  function qualityFor(minRs, peakCount, runtime){
    if(peakCount===1) return {key:"single",label:"ein sauberer Peak",className:"good"};
    if(peakCount<1) return {key:"none",label:"kein Peak sichtbar",className:"warn"};
    if(minRs<1.0) return {key:"bad",label:"unzureichend",className:"bad"};
    if(minRs<1.5) return {key:"partial",label:"teilweise getrennt",className:"warn"};
    if(minRs>=3.0 && runtime>8) return {key:"slow",label:"sehr gut, aber langsam",className:"good"};
    return {key:"good",label:"analytisch brauchbar",className:"good"};
  }

  function feedbackFor(run){
    const m=run.method;
    if(run.analytes.length===0) return "Kein relevanter Peak ist sichtbar. Prüfe Probe, Detektionsgrenze und Methode.";
    if(run.analytes.length===1){
      return bridgeMode
        ? "Ein einzelner sauberer Peak ist sichtbar. Für nur einen detektierten Peak ist Rₛ nicht definiert; dieser Lauf kann an den Hub übernommen werden. Die Stoffidentität ist damit noch nicht geklärt."
        : "Ein einzelner sauberer Peak ist sichtbar. Für nur einen detektierten Peak ist Rₛ nicht definiert.";
    }
    if(run.minRs>=1.5){
      if(run.minRs>=3 && run.runtime>8) return `Rₛ = ${fmt(run.minRs,2)}: sehr gute Trennung, aber die Methode ist relativ langsam. Kürzere Säule, höhere Temperatur oder höherer Gasstrom könnten Zeit sparen.`;
      return bridgeMode
        ? `Rₛ = ${fmt(run.minRs,2)}: analytisch brauchbare Trennung. Dieser Lauf kann an den Proben-Hub übernommen werden.`
        : `Rₛ = ${fmt(run.minRs,2)}: analytisch brauchbare Trennung.`;
    }
    const hints=[];
    if(m.temperature_c>=120) hints.push("Temperatur senken, damit sich die Retentionsunterschiede stärker ausprägen");
    if(m.length_m===15) hints.push("eine längere Kapillarsäule wählen");
    if(m.flow_key==="high") hints.push("den Gasstrom auf mittel reduzieren");
    if(m.column_id==="COLUMN_NP") hints.push("die polare Phase testen, weil sie die Selektivität verändern kann");
    if(!hints.length) hints.push("systematisch jeweils nur einen Parameter verändern und die Selektivität vergleichen");
    return `Rₛ = ${fmt(run.minRs,2)}: noch nicht ausreichend. Versuche: ${hints.join("; ")}.`;
  }

  function runGc(){
    if(runInProgress) return;
    cancelIdentificationAnimation();
    hideIdentification();
    const run=simulate(currentSample(),method());
    const displayKey=els.displaySpeedSelect?.value || "observe";
    const display=DISPLAY_SPEED[displayKey] || DISPLAY_SPEED.observe;

    lastRun=null;
    updateBridgeAccept(null);

    if(!Number.isFinite(display.factor)){
      completeGcRun(run);
      return;
    }

    runInProgress=true;
    setRunControlsLocked(true);
    els.runStatus.className="status-pill running";
    els.runStatus.textContent="Messung läuft · 0,00 min";
    els.runtimeMetric.textContent="0,00 / "+fmt(run.runtime,2)+" min";
    els.peakCountMetric.textContent="…";
    els.rsMetric.textContent="…";
    els.qualityMetric.textContent="Messung läuft";
    els.peakTable.innerHTML='<tr><td colspan="4" class="muted">Detektorsignal wird aufgezeichnet – Auswertung nach Laufende.</td></tr>';
    setFeedback("Probe injiziert. Das Chromatogramm entsteht entlang der chromatographischen Zeitachse. Bildschirmdarstellung: "+display.label+".","neutral");
    drawChromatogramProgress(run,0);

    const token=++animationSequence;
    const startedAt=performance.now();

    const step=now=>{
      if(token!==animationSequence) return;
      const elapsedSeconds=(now-startedAt)/1000;
      const currentTime=Math.min(run.runtime,elapsedSeconds*display.factor/60);
      drawChromatogramProgress(run,currentTime);
      els.runStatus.textContent="Messung läuft · "+fmt(currentTime,2)+" min";
      els.runtimeMetric.textContent=fmt(currentTime,2)+" / "+fmt(run.runtime,2)+" min";

      if(currentTime>=run.runtime){
        activeRunAnimation=null;
        completeGcRun(run);
        return;
      }
      activeRunAnimation=requestAnimationFrame(step);
    };
    activeRunAnimation=requestAnimationFrame(step);
  }

  function completeGcRun(run){
    cancelRunAnimation();
    lastRun=run;
    history.push(run);
    selectedHistoryIndex=history.length-1;
    setRunControlsLocked(false);
    renderRun(run);
    renderHistory();
  }

  function renderRun(run){
    drawChromatogram(run);
    els.runStatus.className="status-pill";
    els.runStatus.textContent="Lauf abgeschlossen";
    els.runtimeMetric.textContent=`${fmt(run.runtime,2)} min`;
    els.peakCountMetric.textContent=String(run.analytes.length);
    els.rsMetric.textContent=run.minRs===null?"–":fmt(run.minRs,2);
    els.qualityMetric.textContent=run.quality.label;
    els.peakTable.innerHTML=run.analytes.map(a=>`<tr><td>${a.peakId}</td><td>${fmt(a.tr,2)}</td><td>${fmt(a.areaPercent,1)}</td><td>${fmt(a.width,2)}</td></tr>`).join("");
    setFeedback(feedbackFor(run),run.quality.className);
    updateBridgeAccept(run);
    renderIdentification(run);
  }

  function renderHistory(){
    if(!history.length){els.historyTable.innerHTML='<tr><td colspan="8" class="muted">Noch keine Läufe.</td></tr>';return;}
    els.historyTable.innerHTML=history.map((r,i)=>`<tr class="history-row ${i===selectedHistoryIndex?"selected":""}" data-history-index="${i}" title="Run ${i+1} anzeigen">
      <td>${i+1}</td><td>${r.method.column_id==="COLUMN_NP"?"unpolar":"polar"}</td><td>${r.method.length_m} m</td>
      <td>${r.method.temperature_c} °C</td><td>${FLOW[r.method.flow_key].label}</td><td>${fmt(r.runtime,2)} min</td>
      <td>${r.minRs===null?"–":fmt(r.minRs,2)}</td><td>${r.quality.label}</td></tr>`).join("");
  }

  function showHistoryRun(index){
    if(runInProgress) return;
    const run=history[index];
    if(!run) return;
    selectedHistoryIndex=index;
    lastRun=run;

    els.sampleSelect.value=run.sample.id;
    els.columnSelect.value=run.method.column_id;
    els.lengthSelect.value=String(run.method.length_m);
    els.temperatureSelect.value=String(run.method.temperature_c);
    els.flowSelect.value=run.method.flow_key;
    updateInfo();

    renderRun(run);
    els.runStatus.textContent=`Run ${index+1} aus Historie`;
    renderHistory();
  }


  function identificationEligible(run){
    return !!(!bridgeMode && run && run.analytes.length>=2 && run.minRs!==null && run.minRs>=1.5);
  }

  function identificationCandidateIds(run){
    const raw=Array.isArray(run?.sample?.candidate_pool) && run.sample.candidate_pool.length
      ? run.sample.candidate_pool
      : (run?.sample?.composition||[]).map(x=>x.substance_id);
    return [...new Set(raw)].filter(id=>substance(id));
  }

  function identificationState(run){
    if(!run.identification){
      run.identification={standards:{},assignments:{},activeSubstanceId:null};
    }
    return run.identification;
  }

  function cancelIdentificationAnimation(){
    identificationSequence++;
    if(identificationAnimation!==null){
      cancelAnimationFrame(identificationAnimation);
      identificationAnimation=null;
    }
  }

  function hideIdentification(){
    if(!els.identificationPanel) return;
    els.identificationPanel.classList.remove("active");
  }

  function identificationMethodLabel(run){
    const phase=run.method.column_id==="COLUMN_NP"?"unpolar":"polar";
    return phase+" · "+run.method.length_m+" m · "+run.method.temperature_c+" °C · "+FLOW[run.method.flow_key].label;
  }

  function identificationComplete(run,state){
    const assignedPeaks=new Set(Object.values(state.assignments).filter(x=>x&&x!=="NONE"));
    return run.analytes.every(a=>assignedPeaks.has(a.peakId));
  }

  function renderIdentification(run){
    if(!identificationEligible(run)){
      hideIdentification();
      return;
    }

    const state=identificationState(run);
    const candidates=identificationCandidateIds(run);
    els.identificationPanel.classList.add("active");
    els.identMethodLabel.textContent=identificationMethodLabel(run);
    const poolCount=candidates.length;
    els.identIntro.textContent=run.sample.unknown
      ? "Die Trennung ist ausreichend (min. Rₛ = "+fmt(run.minRs,2)+"). Es sind "+run.analytes.length+" getrennte Peaks sichtbar; zur Identifikation stehen "+poolCount+" mögliche Referenzstandards bereit. Nicht jeder Kandidat muss enthalten sein."
      : "Die Trennung ist ausreichend (min. Rₛ = "+fmt(run.minRs,2)+"). Referenzstandards werden jetzt unter exakt dieser Methode gemessen. Ordne danach den passenden Probenpeak zu.";

    els.identStandardButtons.innerHTML=candidates.map(id=>{
      const sub=substance(id);
      const measured=!!state.standards[id];
      const assigned=Object.prototype.hasOwnProperty.call(state.assignments,id);
      const cls=assigned?"assigned":(measured?"measured":"");
      const mark=assigned?"✓ ":(measured?"• ":"");
      return '<button type="button" class="secondary '+cls+'" data-standard-id="'+id+'">'+mark+sub.name_de+' messen</button>';
    }).join("");

    els.identPeakSelect.innerHTML='<option value="">Peak auswählen …</option>'
      +run.analytes.map(a=>'<option value="'+a.peakId+'">'+a.peakId+' · tR '+fmt(a.tr,2)+' min</option>').join("")
      +'<option value="NONE">kein passender Peak</option>';

    const activeId=state.activeSubstanceId;
    const standardRun=activeId?state.standards[activeId]:null;
    if(activeId && standardRun){
      const sub=substance(activeId);
      const a=standardRun.analytes[0];
      els.identStandardTitle.textContent="Referenzstandard: "+sub.name_de;
      els.identStandardInfo.textContent="Einzelpeak bei tR = "+fmt(a.tr,2)+" min. Vergleiche diese Retentionszeit mit den Peaks der Probe.";
      els.identPeakSelect.disabled=false;
      els.identAssignBtn.disabled=false;
      if(state.assignments[activeId]) els.identPeakSelect.value=state.assignments[activeId];
      drawIdentificationComparison(run,standardRun,standardRun.runtime,true);
    }else{
      els.identStandardTitle.textContent="Noch kein Referenzstandard gemessen";
      els.identStandardInfo.textContent="Wähle einen Standard aus dem Kandidatenpool.";
      els.identPeakSelect.disabled=true;
      els.identAssignBtn.disabled=true;
      drawIdentificationEmpty(run);
    }

    els.identMapBody.innerHTML=run.analytes.map(a=>{
      const match=Object.entries(state.assignments).find(([,peakId])=>peakId===a.peakId);
      const sid=match?match[0]:null;
      const std=sid?state.standards[sid]:null;
      const label=sid?substance(sid).name_de:"noch offen";
      const evidence=std?"Standard tR "+fmt(std.analytes[0].tr,2)+" min":"–";
      return '<tr><td>'+a.peakId+'</td><td>'+fmt(a.tr,2)+'</td><td>'+(sid?'<strong>'+label+'</strong>':'<span class="muted">'+label+'</span>')+'</td><td>'+evidence+'</td></tr>';
    }).join("");

    if(identificationComplete(run,state)){
      const identities=run.analytes.map(a=>{
        const hit=Object.entries(state.assignments).find(([,peakId])=>peakId===a.peakId);
        return hit?substance(hit[0]).name_de:null;
      }).filter(Boolean);
      els.identAssignmentFeedback.className="feedback good";
      els.identAssignmentFeedback.textContent=run.sample.unknown
        ? run.sample.name_de+" vollständig entziffert. Identifizierte Komponenten: "+identities.join(", ")+"."
        : "Chromatogramm vollständig entziffert: Alle Probenpeaks sind durch Referenzläufe zugeordnet.";
    }else if(!activeId){
      els.identAssignmentFeedback.className="feedback neutral";
      els.identAssignmentFeedback.textContent="Noch keine Peakzuordnung.";
    }
  }

  function runIdentificationStandard(substanceId){
    const run=lastRun;
    if(!identificationEligible(run)) return;
    const sub=substance(substanceId);
    if(!sub) return;

    cancelIdentificationAnimation();
    const state=identificationState(run);
    const standardSample={
      id:"STD_"+substanceId,
      name_de:"Referenzstandard "+sub.name_de,
      description_de:"Referenzstandard zur Peakzuordnung.",
      composition:[{substance_id:substanceId,fraction:0.25}]
    };
    const standardRun=simulate(standardSample,run.method);
    state.standards[substanceId]=standardRun;
    state.activeSubstanceId=substanceId;

    els.identStandardTitle.textContent="Referenzstandard: "+sub.name_de+" · Messung läuft";
    els.identStandardInfo.textContent="Referenzlauf unter unveränderten GC-Bedingungen · Schnellmodus 60×.";
    els.identPeakSelect.disabled=true;
    els.identAssignBtn.disabled=true;
    [...els.identStandardButtons.querySelectorAll("button")].forEach(btn=>btn.disabled=true);

    const token=++identificationSequence;
    const startedAt=performance.now();
    const step=now=>{
      if(token!==identificationSequence) return;
      const elapsedSeconds=(now-startedAt)/1000;
      const currentTime=Math.min(standardRun.runtime,elapsedSeconds);
      drawIdentificationComparison(run,standardRun,currentTime,false);
      els.identStandardInfo.textContent="Referenzlauf: "+fmt(currentTime,2)+" / "+fmt(standardRun.runtime,2)+" min · Darstellung 60×";

      if(currentTime>=standardRun.runtime){
        identificationAnimation=null;
        renderIdentification(run);
        els.identAssignmentFeedback.className="feedback neutral";
        els.identAssignmentFeedback.textContent="Standard "+sub.name_de+" gemessen. Vergleiche tR und ordne den passenden Peak zu.";
        return;
      }
      identificationAnimation=requestAnimationFrame(step);
    };
    identificationAnimation=requestAnimationFrame(step);
  }

  function identificationTolerance(standardAnalyte,peak){
    return Math.max(0.03,0.125*(standardAnalyte.width+peak.width));
  }

  function assignIdentificationPeak(){
    const run=lastRun;
    if(!identificationEligible(run)) return;
    const state=identificationState(run);
    const sid=state.activeSubstanceId;
    const standardRun=sid?state.standards[sid]:null;
    const selected=els.identPeakSelect.value;
    if(!sid || !standardRun || !selected) return;

    const standardAnalyte=standardRun.analytes[0];
    const matches=run.analytes.filter(p=>Math.abs(p.tr-standardAnalyte.tr)<=identificationTolerance(standardAnalyte,p));
    let correct=false;
    if(selected==="NONE"){
      correct=matches.length===0;
    }else{
      correct=matches.some(p=>p.peakId===selected);
    }

    if(!correct){
      els.identAssignmentFeedback.className="feedback bad";
      els.identAssignmentFeedback.textContent="Diese Zuordnung passt nicht zur Retentionszeit des Standards. Vergleiche die tR-Werte noch einmal.";
      return;
    }

    state.assignments[sid]=selected;
    renderIdentification(run);
    if(selected==="NONE"){
      els.identAssignmentFeedback.className="feedback good";
      els.identAssignmentFeedback.textContent=substance(sid).name_de+" besitzt unter dieser Methode keinen passenden Peak in der Probe.";
    }else if(!identificationComplete(run,state)){
      els.identAssignmentFeedback.className="feedback good";
      els.identAssignmentFeedback.textContent=substance(sid).name_de+" wurde "+selected+" zugeordnet. Messe den nächsten Referenzstandard.";
    }
  }

  function drawIdentificationEmpty(run){
    const canvas=els.identCanvas,ctx=canvas.getContext("2d");
    const maxY=Math.max(...run.points.map(p=>p.y),1e-6)*1.12;
    drawAxes(ctx,canvas,run.runtime,maxY);
    const pad={l:72,r:24,t:25,b:55},w=canvas.width-pad.l-pad.r,h=canvas.height-pad.t-pad.b;
    drawTrace(ctx,run,run.runtime,maxY,pad,w,h,"rgba(210,225,240,.55)",2,[7,5]);
    ctx.fillStyle="#91a7be";ctx.font="13px system-ui";ctx.fillText("Probe · Referenzstandard auswählen",pad.l+10,pad.t+18);
  }

  function drawIdentificationComparison(baseRun,standardRun,currentTime,complete){
    const canvas=els.identCanvas,ctx=canvas.getContext("2d");
    const xMax=Math.max(baseRun.runtime,standardRun.runtime);
    const visiblePoints=standardRun.points.filter(p=>p.t<=currentTime+1e-9);
    const maxY=Math.max(
      ...baseRun.points.map(p=>p.y),
      ...standardRun.points.map(p=>p.y),
      1e-6
    )*1.12;
    drawAxes(ctx,canvas,xMax,maxY);
    const pad={l:72,r:24,t:25,b:55},w=canvas.width-pad.l-pad.r,h=canvas.height-pad.t-pad.b;
    drawTrace(ctx,baseRun,xMax,maxY,pad,w,h,"rgba(210,225,240,.50)",2,[7,5]);

    const partial={...standardRun,points:visiblePoints};
    drawTrace(ctx,partial,xMax,maxY,pad,w,h,"#a78bfa",2.8,[]);

    ctx.font="bold 12px system-ui";ctx.textAlign="center";
    baseRun.analytes.forEach(a=>{
      const x=pad.l+w*a.tr/xMax;
      ctx.strokeStyle="rgba(255,255,255,.18)";ctx.setLineDash([3,4]);
      ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+h);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="#d9f7fb";ctx.fillText(a.peakId,x,pad.t+16);
    });
    ctx.textAlign="left";
    ctx.fillStyle="#b8c8da";ctx.font="12px system-ui";
    ctx.fillText("grau gestrichelt: Probe · violett: Referenzstandard",pad.l+10,pad.t+h-10);

    if(!complete){
      const x=pad.l+w*Math.min(currentTime,xMax)/xMax;
      ctx.strokeStyle="rgba(251,191,36,.75)";ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+h);ctx.stroke();ctx.setLineDash([]);
    }
  }

  function setBridgeBanner(message,isError=false){
    if(!els.bridgeContext) return;
    els.bridgeContext.classList.add("active");
    els.bridgeContext.classList.toggle("error",!!isError);
    els.bridgeMessage.textContent=message||"";
  }

  function updateBridgeAccept(run){
    if(!bridgeMode || !els.bridgeAcceptBtn || verificationMode) return;
    const threshold=Number(bridgeInput?.minimum_resolution ?? 1.5);
    const singleAllowed=bridgeInput?.single_peak_allowed !== false;
    const singlePeak=!!(run && run.analytes.length===1);
    const multiAccepted=!!(run && run.analytes.length>=2 && run.minRs!==null && run.minRs>=threshold);
    const accepted=(singleAllowed && singlePeak) || multiAccepted;
    els.bridgeAcceptBtn.disabled=!accepted;
    if(run){
      if(singleAllowed && singlePeak){
        setBridgeBanner("Ein sauberer Peak sichtbar. Rₛ ist für einen Einzelpeak nicht definiert; der Lauf kann übernommen werden.");
      }else if(multiAccepted){
        setBridgeBanner(`Mindestauflösung erreicht (Rₛ = ${fmt(run.minRs,2)}). Dieser Lauf kann übernommen werden.`);
      }else{
        setBridgeBanner(`Noch nicht ausreichend getrennt. Bei mehreren Peaks ist für die Rückgabe Rₛ ≥ ${fmt(threshold,1)} erforderlich.`);
      }
    }
  }

  function normalizeHubComposition(runtimeSample){
    const raw=Array.isArray(runtimeSample?.composition_internal) ? runtimeSample.composition_internal : [];
    const usable=raw
      .filter(x=>x && x.substance_id && Number.isFinite(Number(x.fraction_model)))
      .map(x=>({substance_id:x.substance_id,fraction:Number(x.fraction_model)}))
      .filter(x=>x.fraction>0 && substance(x.substance_id));
    const sum=usable.reduce((s,x)=>s+x.fraction,0);
    if(sum<=0) throw new Error("Die Runtime-Probe enthält keine verwertbare GC-Zusammensetzung.");
    return usable.map(x=>({substance_id:x.substance_id,fraction:x.fraction/sum}));
  }

  async function initAnalytikBridge(){
    const params=new URLSearchParams(window.location.search);
    const runId=params.get("run");
    try{
      if(!runId) throw new Error("run-Parameter fehlt.");
      await loadAnalytikBridgeScript();
      const run=window.AnalytikBridge.getRun(runId);
      if(!run) throw new Error("Der Analyse-Run wurde nicht gefunden.");
      if(run.app_id!=="GC_LAB") throw new Error("Der Run ist nicht für GC-LAB bestimmt.");
      if(!run.input || !["unknown_mixture","targeted_confirmation"].includes(run.input.mode)) throw new Error("Unbekannter GC-Auftrag.");

      bridgeRun=run;
      bridgeInput=run.input;
      const runtimeSample=bridgeInput.runtime_sample;
      hubSample={
        id:run.sample_id,
        name_de:bridgeInput.display_label || "Unbekannte Destillationsfraktion",
        description_de:"Runtime-Probe aus dem Proben-Hub.",
        composition:normalizeHubComposition(runtimeSample)
      };

      if(bridgeInput.mode==="targeted_confirmation"){
        verificationMode=true;
        initVerificationMode();
      }else{
        els.levelSelect.value="method";
        els.levelSelect.disabled=true;
        applyLevel();
        els.sampleSelect.innerHTML=`<option value="${run.sample_id}">${hubSample.name_de}</option>`;
        els.sampleSelect.disabled=true;
        els.sampleInfo.textContent=hubSample.description_de+" Stoffidentitäten und interne Zusammensetzung bleiben verborgen.";
        if(els.modeLabel) els.modeLabel.textContent="Analytik-Hub";
        els.bridgeSampleLabel.textContent=`${hubSample.name_de} · ${run.sample_id}`;
        els.bridgeRunLabel.textContent=run.run_id;
        els.bridgeAcceptBtn.disabled=true;
        els.bridgeAcceptBtn.textContent="Run an Hub übernehmen";
        els.bridgeAcceptBtn.addEventListener("click",sendBridgeResult);
        setBridgeBanner(bridgeInput.note || "Entwickle eine GC-Methode mit ausreichender Trennung.");
      }
      els.bridgeReturnBtn.addEventListener("click",()=>window.AnalytikBridge.returnToHub(bridgeRun));
    }catch(err){
      setBridgeBanner("Hub-Verbindung fehlgeschlagen: "+err.message,true);
      els.runBtn.disabled=true;
    }
  }

  function flowKeyForValue(value){
    const target=Number(value);
    return Object.keys(FLOW).reduce((best,key)=>
      Math.abs(FLOW[key].value-target)<Math.abs(FLOW[best].value-target)?key:best,"medium");
  }

  function verificationMethodFromInput(){
    const src=bridgeInput?.source_gc_method||{};
    return {
      column_id:src.column_id||src.column||"COLUMN_NP",
      length_m:Number(src.length_m??src.column_length_m??30),
      temperature_c:Number(src.temperature_c??100),
      flow_key:src.flow_key||flowKeyForValue(src.flow_ml_min??1.2),
      flow_ml_min:Number(src.flow_ml_min??FLOW[src.flow_key||"medium"]?.value??1.2)
    };
  }

  function setMethodControls(m){
    els.columnSelect.value=m.column_id;
    els.lengthSelect.value=String(m.length_m);
    els.temperatureSelect.value=String(m.temperature_c);
    els.flowSelect.value=m.flow_key;
    [els.columnSelect,els.lengthSelect,els.temperatureSelect,els.flowSelect,els.levelSelect].forEach(x=>x.disabled=true);
    els.columnInfo.textContent=currentColumn().description_de;
  }

  function initVerificationMode(){
    const hypothesisId=bridgeInput.hypothesis_substance_id;
    const hypothesis=substance(hypothesisId);
    if(!hypothesis) throw new Error("Der Referenzstandard ist im GC-LAB nicht kuratiert.");

    const m=verificationMethodFromInput();
    verificationOriginalRun=simulate(hubSample,m);

    els.levelSelect.value="method";
    setMethodControls(m);
    els.sampleSelect.innerHTML=`<option value="${bridgeRun.sample_id}">${hubSample.name_de}</option>`;
    els.sampleSelect.disabled=true;
    els.sampleInfo.textContent="Ausgangsprobe aus dem ursprünglichen GC-Lauf; für die Bestätigung werden exakt dieselben chromatographischen Bedingungen verwendet.";
    els.runBtn.style.display="none";
    els.resetBtn.style.display="none";
    els.verificationPanel.classList.add("active");
    if(els.modeLabel) els.modeLabel.textContent="Analytik-Hub · Bestätigung";

    const p=bridgeInput.source_peak||{};
    els.verificationHypothesis.textContent=bridgeInput.hypothesis_name_de||hypothesis.name_de;
    els.verificationPeak.textContent=`${p.peak_id||bridgeRun.peak_id||"Peak"} · tR ${fmt(p.retention_time_min,2)} min`;
    els.verificationMethod.textContent=`${m.column_id==="COLUMN_NP"?"unpolare":"polare"} Säule · ${m.length_m} m · ${m.temperature_c} °C · ${FLOW[m.flow_key].label} (${fmt(m.flow_ml_min,1)} mL/min)`;

    els.bridgeSampleLabel.textContent=`${hubSample.name_de} · ${bridgeRun.sample_id}`;
    els.bridgeRunLabel.textContent=bridgeRun.run_id;
    els.bridgeAcceptBtn.textContent="Identität an Hub bestätigen";
    els.bridgeAcceptBtn.disabled=true;
    els.bridgeAcceptBtn.addEventListener("click",sendVerificationResult);
    els.standardRunBtn.disabled=false;
    els.spikeRunBtn.disabled=true;
    setBridgeBanner("Gezielte chromatographische Bestätigung: zuerst Referenzstandard, danach Aufstockung derselben Probe.");
    renderVerificationOriginal();
  }

  function renderVerificationOriginal(){
    lastRun=verificationOriginalRun;
    renderRunMetricsOnly(verificationOriginalRun);
    drawChromatogram(verificationOriginalRun);
    els.runStatus.textContent="Original-GC rekonstruiert";
    setFeedback("Ausgangslauf rekonstruiert. Messe jetzt den gezielten Referenzstandard unter exakt denselben Bedingungen.","neutral");
    els.verificationLegend.textContent="Ausgangsprobe · ursprüngliche Peaklage als Bezug";
    drawVerificationTargetZoom(verificationRunsForMode("original"),"original");
  }

  function renderRunMetricsOnly(run){
    els.runtimeMetric.textContent=`${fmt(run.runtime,2)} min`;
    els.peakCountMetric.textContent=String(run.analytes.length);
    els.rsMetric.textContent=run.minRs===null?"–":fmt(run.minRs,2);
    els.qualityMetric.textContent=run.quality.label;
    els.peakTable.innerHTML=run.analytes.map(a=>`<tr><td>${a.peakId}</td><td>${fmt(a.tr,2)}</td><td>${fmt(a.areaPercent,1)}</td><td>${fmt(a.width,2)}</td></tr>`).join("");
  }

  function sourcePeak(){ return bridgeInput?.source_peak||{}; }

  function rtTolerance(){
    const width=Number(sourcePeak().width_min);
    return Math.max(0.03,Number.isFinite(width)?width*0.25:0.03);
  }

  function targetAnalyte(run){
    return run?.analytes?.find(a=>a.substance.id===bridgeInput.hypothesis_substance_id)||null;
  }

  function verificationStandardRatio(){
    const r=Number(bridgeInput?.verification_standard_ratio??0.60);
    return Number.isFinite(r)&&r>0?r:0.60;
  }

  function originalTargetAnalyte(){
    return targetAnalyte(verificationOriginalRun);
  }

  function runVerificationStandard(){
    const before=originalTargetAnalyte();
    if(!before){
      setFeedback("Der Zielpeak ist in der rekonstruierten Ausgangsprobe nicht vorhanden.","bad");
      return;
    }
    const ratio=verificationStandardRatio();
    const standard={
      id:"STD_CONFIRM",
      name_de:"Referenzstandard "+(bridgeInput.hypothesis_name_de||bridgeInput.hypothesis_substance_id),
      description_de:"Gezielter Referenzstandard zur Bestätigung der spektroskopisch gestützten Hypothese.",
      composition:[{substance_id:bridgeInput.hypothesis_substance_id,fraction:before.fraction*ratio}]
    };
    verificationStandardRun=simulate(standard,verificationMethodFromInput());
    const a=verificationStandardRun.analytes[0];
    const sourceTr=Number(sourcePeak().retention_time_min);
    const delta=Math.abs(a.tr-sourceTr);
    verificationEvidence.standard=delta<=rtTolerance();
    verificationEvidence.standardDelta=delta;
    verificationEvidence.standardTr=a.tr;

    drawVerificationComparison("standard");
    renderRunMetricsOnly(verificationStandardRun);
    els.runStatus.textContent="Referenzstandard gemessen";
    els.standardEvidence.className="verification-evidence "+(verificationEvidence.standard?"good":"bad");
    els.standardEvidence.innerHTML=verificationEvidence.standard
      ? `<strong>✓ Retentionszeit stimmt überein</strong><span>Standard: ${fmt(a.tr,2)} min · Zielpeak: ${fmt(sourceTr,2)} min · Δt = ${fmt(delta,3)} min</span>`
      : `<strong>✕ Retentionszeit passt nicht</strong><span>Δt = ${fmt(delta,3)} min</span>`;
    els.spikeRunBtn.disabled=!verificationEvidence.standard;
    setFeedback(
      verificationEvidence.standard
        ? "Referenzstandard gemessen: Die Retentionszeit stimmt mit dem Zielpeak überein. Die geringere Peakhöhe ist beabsichtigt; für die Identifikation zählt hier die Peaklage."
        : "Die Retentionszeit des Referenzstandards passt nicht zum Zielpeak.",
      verificationEvidence.standard?"good":"bad"
    );
    updateVerificationAccept();
  }
  function spikedSample(){
    const ratio=verificationStandardRatio();
    const before=originalTargetAnalyte();
    if(!before) throw new Error("Zielsubstanz fehlt in der Ausgangsprobe.");
    const addition=before.fraction*ratio;
    const composition=hubSample.composition.map(x=>({substance_id:x.substance_id,fraction:x.fraction}));
    const existing=composition.find(x=>x.substance_id===bridgeInput.hypothesis_substance_id);
    if(existing) existing.fraction+=addition;
    else composition.push({substance_id:bridgeInput.hypothesis_substance_id,fraction:addition});
    return {id:"SPIKED_SAMPLE",name_de:hubSample.name_de+" + Referenzstandard",description_de:"Aufgestockte Probe",composition};
  }

  function runVerificationSpike(){
    verificationSpikeRun=simulate(spikedSample(),verificationMethodFromInput());
    const before=targetAnalyte(verificationOriginalRun);
    const after=targetAnalyte(verificationSpikeRun);
    const sourceTr=Number(sourcePeak().retention_time_min);
    const sameRt=!!after && Math.abs(after.tr-sourceTr)<=rtTolerance();
    const growth=before&&after ? 100*(after.responseArea/before.responseArea-1) : 0;
    const originalIds=new Set(verificationOriginalRun.analytes.map(a=>a.substance.id));
    const noNew=verificationSpikeRun.analytes.every(a=>originalIds.has(a.substance.id));
    verificationEvidence.spike=!!(sameRt && noNew && growth>=15);
    verificationEvidence.spikeGrowth=growth;
    verificationEvidence.spikeTr=after?.tr??null;
    verificationEvidence.noNewPeak=noNew;

    drawVerificationComparison("spike");
    renderRunMetricsOnly(verificationSpikeRun);
    els.runStatus.textContent="Aufstockung gemessen";
    els.spikeEvidence.className="verification-evidence "+(verificationEvidence.spike?"good":"bad");
    els.spikeEvidence.innerHTML=verificationEvidence.spike
      ? `<strong>✓ Vorhandener Peak wird größer – kein neuer Peak</strong><span>Signalantwort am Zielpeak: +${fmt(growth,0)} % · tR ${fmt(after.tr,2)} min</span>`
      : `<strong>✕ Aufstockung bestätigt die Hypothese nicht eindeutig</strong><span>Peakwachstum ${fmt(growth,0)} % · neuer Peak: ${noNew?"nein":"ja"}</span>`;
    setFeedback(
      verificationEvidence.spike
        ? "Aufstockung gemessen: Die dritte Kurve zeigt am Zielpeak einen höheren Ausschlag, während die übrigen Peaks an ihrer Position bleiben."
        : "Die Aufstockung liefert noch keinen eindeutigen Bestätigungsbefund.",
      verificationEvidence.spike?"good":"bad"
    );
    updateVerificationAccept();
  }

  function verificationRunsForMode(mode){
    const runs=[{run:verificationOriginalRun,label:"Ausgangsprobe",stroke:"rgba(210,225,240,.58)",width:2,dash:[7,5]}];
    if(verificationStandardRun) runs.push({run:verificationStandardRun,label:"Referenzstandard",stroke:"#a78bfa",width:2.8,dash:[]});
    if(mode==="spike"&&verificationSpikeRun) runs.push({run:verificationSpikeRun,label:"aufgestockte Probe",stroke:"#54d2df",width:3.1,dash:[]});
    return runs;
  }

  function drawVerificationComparison(mode){
    const traces=verificationRunsForMode(mode);
    const canvas=els.chromCanvas,ctx=canvas.getContext("2d");
    const xMax=Math.max(...traces.map(x=>x.run.runtime));
    const maxY=Math.max(...traces.flatMap(x=>x.run.points.map(p=>p.y)),1e-6)*1.12;
    drawAxes(ctx,canvas,xMax,maxY);
    const pad={l:72,r:24,t:25,b:55},w=canvas.width-pad.l-pad.r,h=canvas.height-pad.t-pad.b;

    traces.forEach(t=>drawTrace(ctx,t.run,xMax,maxY,pad,w,h,t.stroke,t.width,t.dash));

    const sourceTr=Number(sourcePeak().retention_time_min);
    if(Number.isFinite(sourceTr)){
      const x=pad.l+w*sourceTr/xMax;
      ctx.strokeStyle="#f5c66a";ctx.lineWidth=1.6;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+h);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="#f5d58a";ctx.font="bold 13px system-ui";ctx.textAlign="center";ctx.fillText(sourcePeak().peak_id||bridgeRun.peak_id||"Ziel",x,pad.t+17);ctx.textAlign="left";
    }

    els.verificationLegend.textContent=mode==="spike"
      ? "grau gestrichelt: Ausgangsprobe · violett: Referenzstandard · türkis: aufgestockte Probe · gelb: Zielpeak"
      : "grau gestrichelt: Ausgangsprobe · violett: Referenzstandard · gelb: Zielpeak";

    drawVerificationTargetZoom(traces,mode);
  }

  function drawTrace(ctx,run,xMax,maxY,pad,w,h,stroke,width,dash){
    ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.setLineDash(dash||[]);ctx.beginPath();
    run.points.forEach((p,i)=>{
      const x=pad.l+w*p.t/xMax,y=pad.t+h-h*p.y/maxY;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    });
    ctx.stroke();ctx.setLineDash([]);
  }

  function drawVerificationTargetZoom(traces,mode){
    const canvas=els.verificationZoomCanvas,ctx=canvas.getContext("2d");
    const center=Number(sourcePeak().retention_time_min);
    const width0=Number(sourcePeak().width_min);
    const half=Math.max(0.18,Number.isFinite(width0)?width0*1.5:0.22);
    const xMin=Math.max(0,center-half),xMax=center+half;
    const pad={l:58,r:18,t:22,b:38},w=canvas.width-pad.l-pad.r,h=canvas.height-pad.t-pad.b;

    const localMax=Math.max(...traces.flatMap(t=>t.run.points.filter(p=>p.t>=xMin&&p.t<=xMax).map(p=>p.y)),1e-6)*1.15;
    ctx.fillStyle="#07101c";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle="#2b415f";ctx.lineWidth=1;
    for(let i=0;i<=4;i++){
      const x=pad.l+w*i/4;ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+h);ctx.stroke();
      ctx.fillStyle="#8ea4bd";ctx.font="11px system-ui";ctx.textAlign="center";ctx.fillText(fmt(xMin+(xMax-xMin)*i/4,2),x,pad.t+h+17);
    }
    for(let i=0;i<=3;i++){
      const y=pad.t+h-h*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+w,y);ctx.stroke();
    }
    traces.forEach(t=>{
      ctx.strokeStyle=t.stroke;ctx.lineWidth=t.width;ctx.setLineDash(t.dash||[]);ctx.beginPath();
      let begun=false;
      t.run.points.forEach(p=>{
        if(p.t<xMin||p.t>xMax) return;
        const x=pad.l+w*(p.t-xMin)/(xMax-xMin),y=pad.t+h-h*p.y/localMax;
        if(!begun){ctx.moveTo(x,y);begun=true;}else ctx.lineTo(x,y);
      });
      ctx.stroke();ctx.setLineDash([]);
    });
    const tx=pad.l+w*(center-xMin)/(xMax-xMin);
    ctx.strokeStyle="#f5c66a";ctx.lineWidth=1.5;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(tx,pad.t);ctx.lineTo(tx,pad.t+h);ctx.stroke();ctx.setLineDash([]);
    ctx.textAlign="left";
    els.verificationZoomLegend.textContent=mode==="spike"
      ? "Zielpeak vergrößert: Standard < Ausgangsprobe < aufgestockte Probe."
      : "Zielpeak vergrößert: Standard bewusst niedriger dosiert; Peaklage ist entscheidend.";
  }

  function updateVerificationAccept(){
    const ready=verificationEvidence.standard&&verificationEvidence.spike;
    els.bridgeAcceptBtn.disabled=!ready;
    if(ready) setBridgeBanner("Beide Belege erfüllt: Retentionszeit des Standards stimmt überein und die Aufstockung vergrößert denselben Peak ohne neuen Peak.");
  }

  function sendVerificationResult(){
    if(!verificationMode||!bridgeRun||!window.AnalytikBridge||!verificationEvidence.standard||!verificationEvidence.spike) return;
    const result={
      result_id:"RES_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
      run_id:bridgeRun.run_id,
      case_id:bridgeRun.case_id,
      sample_id:bridgeRun.sample_id,
      app_id:"GC_LAB",
      app_version:VERSION,
      analysis_type:"GC_CONFIRMATION",
      status:"completed",
      source:"app",
      source_result_id:bridgeRun.source_result_id||bridgeInput.source_result_id||null,
      peak_id:bridgeRun.peak_id||sourcePeak().peak_id||null,
      measurement:{
        source_peak_retention_time_min:Number(sourcePeak().retention_time_min),
        reference_standard:{
          substance_id:bridgeInput.hypothesis_substance_id,
          retention_time_min:Number(verificationEvidence.standardTr.toFixed(4)),
          delta_t_min:Number(verificationEvidence.standardDelta.toFixed(4))
        },
        spiking:{
          target_retention_time_min:Number(verificationEvidence.spikeTr.toFixed(4)),
          response_growth_percent:Number(verificationEvidence.spikeGrowth.toFixed(1)),
          new_peak_observed:!verificationEvidence.noNewPeak
        }
      },
      evaluation:{
        identity_status:"confirmed",
        confirmed_substance_id:bridgeInput.hypothesis_substance_id,
        confirmed_name_de:bridgeInput.hypothesis_name_de||substance(bridgeInput.hypothesis_substance_id)?.name_de||null,
        evidence:{reference_retention_match:true,spiking_same_peak_growth:true,no_new_peak:true}
      },
      created_at:new Date().toISOString()
    };
    const completed=window.AnalytikBridge.completeRun(bridgeRun.run_id,result);
    window.AnalytikBridge.returnToHub(completed);
  }

  function sendBridgeResult(){
    if(!bridgeMode || !bridgeRun || !lastRun || !window.AnalytikBridge) return;
    const threshold=Number(bridgeInput?.minimum_resolution ?? 1.5);
    const singleAllowed=bridgeInput?.single_peak_allowed !== false;
    const singlePeak=lastRun.analytes.length===1;
    const multiAccepted=lastRun.analytes.length>=2 && lastRun.minRs!==null && lastRun.minRs>=threshold;
    if(!((singleAllowed && singlePeak) || multiAccepted)) return;

    const peaks=lastRun.analytes.map(a=>({
      peak_id:a.peakId,
      retention_time_min:Number(a.tr.toFixed(4)),
      area:Number((a.responseArea*10000).toFixed(2)),
      area_percent:Number(a.areaPercent.toFixed(2)),
      width_min:Number(a.width.toFixed(4))
    }));
    const studentInterpretation={};
    const peakMap={};
    lastRun.analytes.forEach(a=>{
      studentInterpretation[a.peakId]={identity_status:"unknown"};
      peakMap[a.peakId]=a.substance.id;
    });

    const result={
      result_id:"RES_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
      run_id:bridgeRun.run_id,
      case_id:bridgeRun.case_id,
      sample_id:bridgeRun.sample_id,
      app_id:"GC_LAB",
      app_version:VERSION,
      analysis_type:"GC",
      status:"completed",
      source:"app",
      measurement:{
        column:lastRun.method.column_id,
        column_length_m:lastRun.method.length_m,
        temperature_c:lastRun.method.temperature_c,
        flow_ml_min:lastRun.method.flow_ml_min,
        runtime_min:Number(lastRun.runtime.toFixed(4)),
        peak_count:peaks.length,
        peaks,
        minimum_resolution:lastRun.minRs===null ? null : Number(lastRun.minRs.toFixed(4)),
        resolution_applicable:lastRun.analytes.length>=2
      },
      evaluation:{
        minimum_resolution:lastRun.minRs===null ? null : Number(lastRun.minRs.toFixed(4)),
        resolution_applicable:lastRun.analytes.length>=2,
        acceptance_threshold:threshold,
        acceptance_reason:singlePeak ? "single_detected_peak" : "minimum_resolution_met",
        accepted:true,
        attempts:history.length
      },
      student_interpretation:studentInterpretation,
      internal_payload:{
        peak_map:peakMap
      },
      created_at:new Date().toISOString()
    };

    const completed=window.AnalytikBridge.completeRun(bridgeRun.run_id,result);
    window.AnalytikBridge.returnToHub(completed);
  }

  function setFeedback(text,kind){
    els.methodFeedback.className=`feedback ${kind}`;
    els.methodFeedback.textContent=text;
  }

  function resetMetrics(){
    els.runStatus.className="status-pill";
    els.runStatus.textContent="bereit";
    [els.runtimeMetric,els.peakCountMetric,els.rsMetric,els.qualityMetric].forEach(e=>e.textContent="–");
    els.peakTable.innerHTML='<tr><td colspan="4" class="muted">Noch kein Lauf.</td></tr>';
  }

  function drawEmptyChromatogram(){
    const canvas=els.chromCanvas,ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawAxes(ctx,canvas,8,1);
    ctx.fillStyle="#71869e";ctx.font="18px system-ui";ctx.fillText("Noch kein GC-Lauf",canvas.width/2-75,canvas.height/2);
  }

  function drawChromatogramProgress(run,currentTime){
    drawChromatogramAt(run,currentTime,false);
  }

  function drawChromatogram(run){
    drawChromatogramAt(run,run.runtime,true);
  }

  function drawChromatogramAt(run,currentTime,showPeakLabels){
    const canvas=els.chromCanvas,ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const maxY=Math.max(...run.points.map(p=>p.y),1e-6)*1.12;
    drawAxes(ctx,canvas,run.runtime,maxY);
    const pad={l:72,r:24,t:25,b:55},w=canvas.width-pad.l-pad.r,h=canvas.height-pad.t-pad.b;
    const visible=run.points.filter(p=>p.t<=currentTime+1e-9);

    if(visible.length){
      ctx.strokeStyle="#54d2df";ctx.lineWidth=2.5;ctx.beginPath();
      visible.forEach((p,i)=>{
        const x=pad.l+w*p.t/run.runtime, y=pad.t+h-h*p.y/maxY;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();
    }

    if(showPeakLabels){
      ctx.font="bold 14px system-ui";ctx.textAlign="center";
      run.analytes.forEach(a=>{
        const x=pad.l+w*a.tr/run.runtime;
        ctx.strokeStyle="rgba(255,255,255,.20)";ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+h);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle="#d9f7fb";ctx.fillText(a.peakId,x,pad.t+18);
      });
      ctx.textAlign="left";
    }else if(currentTime<run.runtime){
      const x=pad.l+w*Math.max(0,Math.min(run.runtime,currentTime))/run.runtime;
      ctx.strokeStyle="rgba(251,191,36,.78)";ctx.lineWidth=1.5;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+h);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="#f6d778";ctx.font="bold 12px system-ui";ctx.textAlign="right";
      ctx.fillText("t = "+fmt(currentTime,2)+" min",Math.min(x-6,pad.l+w-6),pad.t+16);
      ctx.textAlign="left";
    }
  }

  function drawAxes(ctx,canvas,xMax,yMax){
    const pad={l:72,r:24,t:25,b:55},w=canvas.width-pad.l-pad.r,h=canvas.height-pad.t-pad.b;
    ctx.fillStyle="#07101c";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle="#2b415f";ctx.lineWidth=1;
    ctx.font="12px system-ui";ctx.fillStyle="#8ea4bd";ctx.textAlign="center";
    for(let i=0;i<=8;i++){
      const x=pad.l+w*i/8;ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+h);ctx.stroke();
      ctx.fillText(fmt(xMax*i/8,1),x,pad.t+h+20);
    }
    for(let i=0;i<=5;i++){
      const y=pad.t+h-h*i/5;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+w,y);ctx.stroke();
    }
    ctx.strokeStyle="#b8c8da";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(pad.l,pad.t);ctx.lineTo(pad.l,pad.t+h);ctx.lineTo(pad.l+w,pad.t+h);ctx.stroke();
    ctx.fillStyle="#a9bad0";ctx.fillText("Retentionszeit / min",pad.l+w/2,canvas.height-13);
    ctx.save();ctx.translate(18,pad.t+h/2);ctx.rotate(-Math.PI/2);ctx.fillText("Detektorsignal / a.u.",0,0);ctx.restore();
    ctx.textAlign="left";
  }

  function fmt(v,n=2){return Number(v).toLocaleString("de-AT",{minimumFractionDigits:n,maximumFractionDigits:n});}

  window.GCLab={version:VERSION,simulate:()=>simulate(currentSample(),method())};
})();
