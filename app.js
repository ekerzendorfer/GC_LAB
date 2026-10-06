(() => {
  "use strict";

  const VERSION = "0.1.1";
  const FLOW = {
    low: {label:"niedrig", value:0.8, efficiency:0.82},
    medium: {label:"mittel", value:1.2, efficiency:1.00},
    high: {label:"hoch", value:1.8, efficiency:0.78}
  };
  const REF_T = 100;
  const REF_TM = 0.80;
  const REF_PLATES = 550;
  const DETECTION_LIMIT = 0.01;

  let db = null;
  let history = [];
  let lastRun = null;
  let selectedHistoryIndex = null;
  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init(){
    bindEls();
    db = await loadData();
    populateControls();
    bindEvents();
    applyLevel();
    updateInfo();
    drawEmptyChromatogram();
  }

  function bindEls(){
    ["levelSelect","sampleSelect","columnSelect","lengthSelect","temperatureSelect","flowSelect",
      "sampleInfo","columnInfo","runBtn","resetBtn","chromCanvas","runStatus","methodFeedback",
      "runtimeMetric","peakCountMetric","rsMetric","qualityMetric","peakTable","historyTable"]
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

  function populateControls(){
    els.sampleSelect.innerHTML = db.samples.map(s=>`<option value="${s.id}">${s.name_de}</option>`).join("");
    els.columnSelect.innerHTML = db.columns.map(c=>`<option value="${c.id}">${c.name_de}</option>`).join("");
    els.temperatureSelect.innerHTML = Array.from({length:8},(_,i)=>70+i*10).map(t=>`<option value="${t}" ${t===100?"selected":""}>${t} °C</option>`).join("");
  }

  function bindEvents(){
    els.levelSelect.addEventListener("change",()=>{applyLevel(); updateInfo();});
    els.sampleSelect.addEventListener("change",updateInfo);
    els.columnSelect.addEventListener("change",updateInfo);
    els.runBtn.addEventListener("click",runGc);
    els.historyTable.addEventListener("click",event=>{
      const row=event.target.closest("tr[data-history-index]");
      if(!row) return;
      showHistoryRun(Number(row.dataset.historyIndex));
    });
    els.resetBtn.addEventListener("click",()=>{history=[]; lastRun=null; selectedHistoryIndex=null; renderHistory(); resetMetrics(); drawEmptyChromatogram(); setFeedback("Wähle eine Methode und starte den ersten Lauf.","neutral");});
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

  function updateInfo(){
    const sample = currentSample();
    const column = currentColumn();
    els.sampleInfo.textContent = sample.description_de;
    els.columnInfo.textContent = column.description_de;
  }

  function currentSample(){return db.samples.find(x=>x.id===els.sampleSelect.value) || db.samples[0];}
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
    if(peakCount<2) return {key:"single",label:"ein Peak sichtbar",className:"warn"};
    if(minRs<1.0) return {key:"bad",label:"unzureichend",className:"bad"};
    if(minRs<1.5) return {key:"partial",label:"teilweise getrennt",className:"warn"};
    if(minRs>=3.0 && runtime>8) return {key:"slow",label:"sehr gut, aber langsam",className:"good"};
    return {key:"good",label:"analytisch brauchbar",className:"good"};
  }

  function feedbackFor(run){
    const m=run.method;
    if(run.analytes.length<2) return "Nur ein relevanter Peak ist sichtbar. Prüfe Probe, Detektionsgrenze und Methode.";
    if(run.minRs>=1.5){
      if(run.minRs>=3 && run.runtime>8) return `Rₛ = ${fmt(run.minRs,2)}: sehr gute Trennung, aber die Methode ist relativ langsam. Kürzere Säule, höhere Temperatur oder höherer Gasstrom könnten Zeit sparen.`;
      return `Rₛ = ${fmt(run.minRs,2)}: analytisch brauchbare Trennung. Dieser Lauf würde die Hub-Freigabeschwelle Rₛ ≥ 1,5 erfüllen.`;
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
    const run=simulate(currentSample(),method());
    lastRun=run;
    history.push(run);
    selectedHistoryIndex=history.length-1;
    renderRun(run);
    renderHistory();
  }

  function renderRun(run){
    drawChromatogram(run);
    els.runStatus.textContent="Lauf abgeschlossen";
    els.runtimeMetric.textContent=`${fmt(run.runtime,2)} min`;
    els.peakCountMetric.textContent=String(run.analytes.length);
    els.rsMetric.textContent=run.minRs===null?"–":fmt(run.minRs,2);
    els.qualityMetric.textContent=run.quality.label;
    els.peakTable.innerHTML=run.analytes.map(a=>`<tr><td>${a.peakId}</td><td>${fmt(a.tr,2)}</td><td>${fmt(a.areaPercent,1)}</td><td>${fmt(a.width,2)}</td></tr>`).join("");
    setFeedback(feedbackFor(run),run.quality.className);
  }

  function renderHistory(){
    if(!history.length){els.historyTable.innerHTML='<tr><td colspan="8" class="muted">Noch keine Läufe.</td></tr>';return;}
    els.historyTable.innerHTML=history.map((r,i)=>`<tr class="history-row ${i===selectedHistoryIndex?"selected":""}" data-history-index="${i}" title="Run ${i+1} anzeigen">
      <td>${i+1}</td><td>${r.method.column_id==="COLUMN_NP"?"unpolar":"polar"}</td><td>${r.method.length_m} m</td>
      <td>${r.method.temperature_c} °C</td><td>${FLOW[r.method.flow_key].label}</td><td>${fmt(r.runtime,2)} min</td>
      <td>${r.minRs===null?"–":fmt(r.minRs,2)}</td><td>${r.quality.label}</td></tr>`).join("");
  }

  function showHistoryRun(index){
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

  function setFeedback(text,kind){
    els.methodFeedback.className=`feedback ${kind}`;
    els.methodFeedback.textContent=text;
  }

  function resetMetrics(){
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

  function drawChromatogram(run){
    const canvas=els.chromCanvas,ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const maxY=Math.max(...run.points.map(p=>p.y),1e-6)*1.12;
    drawAxes(ctx,canvas,run.runtime,maxY);
    const pad={l:72,r:24,t:25,b:55},w=canvas.width-pad.l-pad.r,h=canvas.height-pad.t-pad.b;
    ctx.strokeStyle="#54d2df";ctx.lineWidth=2.5;ctx.beginPath();
    run.points.forEach((p,i)=>{
      const x=pad.l+w*p.t/run.runtime, y=pad.t+h-h*p.y/maxY;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    ctx.font="bold 14px system-ui";ctx.textAlign="center";
    run.analytes.forEach(a=>{
      const x=pad.l+w*a.tr/run.runtime;
      ctx.strokeStyle="rgba(255,255,255,.20)";ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+h);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="#d9f7fb";ctx.fillText(a.peakId,x,pad.t+18);
    });
    ctx.textAlign="left";
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
