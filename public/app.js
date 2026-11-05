
const pickedMatches=new Set();
const FILTER_STORAGE_KEY='matchmind:selected-leagues:v1';
function readSavedLeagues(){try{const v=JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)||'null');return Array.isArray(v)?new Set(v.filter(x=>typeof x==='string')):null;}catch{return null;}}
function saveSelectedLeagues(){try{localStorage.setItem(FILTER_STORAGE_KEY,JSON.stringify([...selectedLeagues]));}catch{}}
let liveRefreshTimer=null,activeModalMatch=null;

function renderSquadOptions(){const select=$('squad-match-select');if(!select)return;const previous=select.value;const matches=[...allMatches].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));select.innerHTML='<option value="">Wybierz spotkanie z terminarza</option>'+matches.map(m=>'<option value="'+safe(m.id)+'">'+safe(m.home.name)+' — '+safe(m.away.name)+' · '+new Date(m.date).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</option>').join('');if(previous&&matches.some(m=>m.id===previous))select.value=previous;updateSquadButton();}
function updateSquadButton(){const select=$('squad-match-select'),button=$('squad-load');if(!select||!button)return;const match=allMatches.find(m=>m.id===select.value);button.disabled=!match||!(/^(espn|bsd):/.test(String(match.id)))||button.dataset.loading==='1';}
function squadPosition(p){const raw=String(p.position||'').toLowerCase();if(/goal|keeper|bramk/.test(raw)||/^(gk|gr)$/.test(raw))return 'GK';if(/defen|back|obron|centre.?back|full.?back/.test(raw)||/^(cb|lb|rb|lwb|rwb|dc|dd|de)$/.test(raw))return 'DEF';if(/mid|pomoc|wing|skrzyd/.test(raw)||/^(cm|dm|am|cdm|cam|mc|mdc|moc|lm|rm)$/.test(raw))return 'MID';if(/forward|strik|attack|napast|ofens/.test(raw)||/^(fw|st|cf|lw|rw|n)$/.test(raw))return 'FWD';return 'OTHER';}
function squadPlayerHtml(p){return '<div class="squad-player"><span class="squad-shirt">'+(p.number!=null?safe(p.number):'·')+'</span><span class="squad-player-info"><b>'+safe(p.name)+'</b><small>'+safe(p.position||'Pozycja niepodana')+(p.starter===true?' · Podstawowy':p.starter===false?' · Rezerwowy':'')+'</small></span></div>';}
function squadTeamHtml(team,index){const players=Array.isArray(team.players)?team.players:[];const starters=team.kind==='roster'?[]:players.filter(p=>p.starter!==false),bench=team.kind==='roster'?[]:players.filter(p=>p.starter===false);const pitch=['GK','DEF','MID','FWD','OTHER'].map(pos=>{const group=starters.filter(p=>squadPosition(p)===pos);return group.length?'<div class="squad-pitch-row">'+group.map(p=>'<div class="squad-pitch-player"><span class="squad-pitch-shirt">'+(p.number!=null?safe(p.number):'')+'</span><b>'+safe(p.name)+'</b><small>'+safe(p.position||'')+'</small></div>').join('')+'</div>':'';}).filter(Boolean).join('');return '<article class="squad-team-card"><header class="squad-team-head"><div><span class="eyebrow">'+(index===0?'GOSPODARZE':'GOŚCIE')+'</span><h3>'+safe(team.team||'Drużyna')+'</h3></div><span class="squad-formation">'+safe(team.formation?'Formacja '+team.formation:'Formacja niepodana')+'</span></header><div class="squad-pitch"><div class="squad-pitch-lines"><span class="squad-center-circle"></span><span class="squad-box-top"></span><span class="squad-box-bottom"></span></div><div class="squad-pitch-players">'+(pitch||'<p class="squad-no-players">'+(team.kind==='roster'?'Kadra drużyny — brak potwierdzonej jedenastki':'Brak potwierdzonej jedenastki')+'</p>')+'</div></div><div class="squad-roster"><h4>Zawodnicy · '+players.length+'</h4>'+players.map(squadPlayerHtml).join('')+'</div>'+(bench.length?'<div class="squad-bench"><h4>Rezerwowi · '+bench.length+'</h4>'+bench.map(squadPlayerHtml).join('')+'</div>':'')+'</article>';}
function renderSquadData(data,match){const groups=Array.isArray(data.lineups)?data.lineups:[];const injuries=Array.isArray(data.injuries)?data.injuries:[];const root=$('squad-content');if(!groups.length){root.innerHTML='<div class="squad-empty"><b>Dostawca nie udostępnia jeszcze składu ani kadry tego spotkania.</b><p>Sprawdź ponownie później.</p></div>';return;}const lineup=groups.some(g=>g.kind==='lineup');root.innerHTML='<div class="squad-match-heading"><div><span class="eyebrow">'+safe(match.league)+'</span><h3>'+safe(match.home.name)+' <span>vs</span> '+safe(match.away.name)+'</h3></div><span class="mm-source-tag">Źródło: '+safe(data.source||match.source||'dostawca danych')+' · '+(lineup?'skład meczowy':groups.some(g=>g.kind==='predicted')?'przewidywana jedenastka':'kadra drużyny')+'</span></div><div class="squad-teams-grid">'+groups.map(squadTeamHtml).join('')+'</div><section class="squad-absence-panel"><h3>Kontuzje i absencje</h3>'+(injuries.length?'<ul>'+injuries.map(x=>'<li><b>'+safe(x.name)+'</b> · '+safe(x.team||'')+' · '+safe(x.status)+'</li>').join('')+'</ul>':'<p class="squad-data-note">'+safe(data.source||match.source||'Dostawca')+' nie zwrócił rekordów absencji. Brak wpisów nie potwierdza pełnej dostępności zawodników.</p>')+'</section><p class="squad-data-note">'+(lineup?'Dane składu meczowego zwrócone przez dostawcę.':groups.some(g=>g.kind==='predicted')?'Dostawca zwrócił przewidywaną jedenastkę — nie jest to potwierdzony skład.':'Dostawca zwrócił kadrę drużyn, a nie potwierdzoną jedenastkę. Zawodnicy nie są oznaczani jako podstawowi.')+' Rozmieszczenie grupuje zawodników według pozycji zwróconej przez API.</p>';}
async function loadSquadSelection(){const match=allMatches.find(m=>m.id===$('squad-match-select')?.value);if(!match)return;const button=$('squad-load');button.dataset.loading='1';button.disabled=true;button.textContent='Pobieranie…';$('squad-content').innerHTML='<div class="loading">Pobieram dane składu…</div>';try{const response=await fetch('/api/matches/'+encodeURIComponent(match.id)+'/overview',{signal:AbortSignal.timeout(20000)}),data=await response.json();if(!response.ok)throw new Error(data.error||'Błąd pobierania składu');if($('squad-match-select').value===match.id)renderSquadData(data,match);}catch(error){$('squad-content').innerHTML='<div class="squad-empty">Nie udało się pobrać danych składu: '+safe(error.message)+'</div>';}finally{button.dataset.loading='0';button.textContent='Pobierz ponownie →';updateSquadButton();}}
function renderMatchOverview(data,m){
 const fixture=data.fixture?.[0],goals=fixture?.goals||{},events=Array.isArray(data.events)?data.events:[];
 const teams=data.statistics||[];
 const statNames=[['Posiadanie piłki','Ball Possession'],['Strzały','Total Shots'],['Strzały celne','Shots on Goal'],['Rzuty rożne','Corner Kicks'],['Faule','Fouls'],['Żółte kartki','Yellow Cards'],['Czerwone kartki','Red Cards'],['Spalone',' offsides']];
 const get=(team,key)=>(team?.statistics||[]).find(v=>String(v.type).toLowerCase()===key.toLowerCase())?.value??'—';
 const statHtml=teams.length?'<div class="mm-team-head"><span>'+safe(teams[0]?.team?.name||m.home.name)+'</span><span>'+safe(teams[1]?.team?.name||m.away.name)+'</span></div><div class="mm-stats">'+statNames.map(([label,key])=>'<div class="mm-stat"><span>'+label+'</span><strong>'+safe(get(teams[0],key))+' <i>·</i> '+safe(get(teams[1],key))+'</strong></div>').join('')+'</div>':'<p class="mm-empty">ESPN nie udostępnia szczegółowych statystyk dla tego spotkania.</p>';
 const goalsHtml=events.filter(e=>/goal/i.test(String(e.type))||/goal/i.test(String(e.detail))).map(e=>'<div class="mm-event"><b>'+safe(e.time?.elapsed??'?')+'’</b><span>'+safe(e.team?.name||'')+'</span><strong>'+safe(e.player?.name||e.detail||'Gol')+'</strong><small>'+safe(e.detail||'')+'</small></div>').join('');
 const score=goals.home!=null&&goals.away!=null?'<div class="mm-score"><span>'+safe(m.home.name)+'</span><strong>'+goals.home+' : '+goals.away+'</strong><span>'+safe(m.away.name)+'</span></div>':'';
 const status=fixture?.fixture?.status?.long||fixture?.fixture?.status?.short||'Status nieznany';
 const eventsHtml=goalsHtml||'<p class="mm-empty">Brak zdarzeń bramkowych w danych dostawcy.</p>';
 const pre=data.match?.preMatch,pred=data.match?.prediction;
 const formLine=(label,ctx)=>label+': '+(ctx?.form?.length?ctx.form.map(x=>x.result+' '+x.gf+':'+x.ga).join(' · '):'brak danych');
 const preHtml=pre?'<section><h3>Forma drużyn</h3><p>'+safe(formLine('Gospodarze',pre.home))+'</p><p>'+safe(formLine('Goście',pre.away))+'</p>'+(pre.notices?.length?'<p class="mm-empty">'+safe(pre.notices.join(' '))+'</p>':'')+'</section>':'';
 const predHtml=pred?'<section><h3>Szacowane szanse przedmeczowe</h3><div class="mm-stats"><div class="mm-stat"><span>1 · Gospodarze</span><strong>'+pred.home+'%</strong></div><div class="mm-stat"><span>X · Remis</span><strong>'+pred.draw+'%</strong></div><div class="mm-stat"><span>2 · Goście</span><strong>'+pred.away+'%</strong></div></div><p class="mm-empty">Pewność: '+safe(pred.confidence)+' · próbka: '+pred.sampleHome+' / '+pred.sampleAway+' ostatnich meczów. To estymacja statystyczna, nie kurs ani gwarancja.</p></section>':'';
 const body=$('mm-body');
 const report=body.querySelector('#mm-ai-report')?.outerHTML||'<div id="mm-ai-report" class="mm-report">Analiza AI ładuje się niezależnie od statystyk…</div>';
 body.innerHTML='<section><div class="mm-live-row"><h3>Wynik i przebieg</h3><span class="'+(data.live?'mm-live':'')+'">'+safe(status)+(data.live?' · NA ŻYWO':'')+'</span></div>'+score+'</section><section><h3>Statystyki meczu</h3>'+statHtml+'</section><section><h3>Bramki</h3>'+eventsHtml+'</section>'+predHtml+preHtml+'<section><h3>Analiza MatchMind</h3>'+report+'</section>';
}
async function refreshMatchOverview(m){
 const squadQuery=m.sportScoreSlug?'?sportScoreSlug='+encodeURIComponent(m.sportScoreSlug):'';const r=await fetch('/api/matches/'+encodeURIComponent(m.id)+'/overview'+squadQuery);const d=await r.json();if(!r.ok)throw new Error(d.error||'Nie udało się pobrać danych meczu');
 if(!$('match-modal')||$('match-modal').hidden)return;
 renderMatchOverview(d,m);
 if(d.live){if(liveRefreshTimer)clearInterval(liveRefreshTimer);liveRefreshTimer=setInterval(async()=>{if(!$('match-modal')||$('match-modal').hidden||!activeModalMatch){clearInterval(liveRefreshTimer);liveRefreshTimer=null;return;}try{await refreshMatchOverview(activeModalMatch);}catch(e){}} ,30000);}else if(liveRefreshTimer){clearInterval(liveRefreshTimer);liveRefreshTimer=null;}
}
async function openMatch(m){
 if(!m)return;activeModalMatch=m;
 if(!document.getElementById('match-modal'))document.body.insertAdjacentHTML('beforeend','<div class="match-modal" id="match-modal" hidden><div class="match-modal-shade" data-dismiss></div><section class="match-modal-card"><header><div><p class="eyebrow">MATCHMIND INSIGHT</p><h2 id="mm-title"></h2><p id="mm-meta" class="muted"></p></div><button class="mm-close" data-dismiss>×</button></header><div id="mm-body" class="mm-body">Pobieranie danych…</div></section></div>');
 const modal=$('match-modal');modal.hidden=false;
 $('mm-title').textContent=m.home.name+' — '+m.away.name;$('mm-meta').textContent=m.league+' · '+new Date(m.date).toLocaleString('pl-PL');
 document.querySelectorAll('[data-dismiss]').forEach(x=>x.onclick=()=>{modal.hidden=true;activeModalMatch=null;if(liveRefreshTimer){clearInterval(liveRefreshTimer);liveRefreshTimer=null;}});
 $('mm-body').innerHTML='<div class="loading">Pobieram wynik, statystyki i zdarzenia…</div><section><h3>Analiza MatchMind</h3><div id="mm-ai-report" class="mm-report">Przygotowuję raport AI…</div></section>';
 refreshMatchOverview(m).catch(e=>{if(activeModalMatch?.id!==m.id||$('match-modal')?.hidden)return;const previousReport=$('mm-ai-report')?.textContent||'Przygotowuję analizę na podstawie terminarza…';$('mm-body').innerHTML='<section><div class="mm-live-row"><h3>Szczegóły meczu</h3><span>Ograniczone dane</span></div><p class="mm-empty">ESPN nie zwrócił szczegółów spotkania: '+safe(e.message)+'. Raport poniżej spróbuje wykorzystać dane z terminarza.</p></section><section><h3>Analiza MatchMind</h3><div id="mm-ai-report" class="mm-report">Przygotowuję analizę na podstawie terminarza…</div></section>';$('mm-ai-report').textContent=previousReport;});
 fetch('/api/matches/'+encodeURIComponent(m.id)+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fixture:m,forceRefresh:false}),signal:AbortSignal.timeout(55000)}).then(r=>r.json()).then(a=>{
  if(!$('match-modal')||$('match-modal').hidden||activeModalMatch?.id!==m.id)return;
  const target=$('mm-ai-report');if(target){target.textContent=(a.report||a.error||'Brak raportu')+(a.llmNotice?'\n\nInformacja: '+a.llmNotice:'');target.insertAdjacentHTML('beforebegin','<p class="mm-cache-note">'+(a.cached?'Raport z cache':a.provider==='Abacus.AI'?'Raport wygenerowany przez Abacus.AI':a.provider==='Ollama'?'Raport wygenerowany przez Ollama':'Podsumowanie dostępnych danych')+'</p>');}
 }).catch(e=>{const target=$('mm-ai-report');if(target)target.textContent='Analiza niedostępna: '+e.message;});
}
function providerBadge(data){const p=data?.provider||'Tylko statystyki';const label=p==='Abacus.AI'?'Abacus.AI':p==='Ollama'?'Ollama':'Analiza statystyczna';return '<span class="mm-provider-badge">Silnik: '+safe(label)+(data?.model?' · '+safe(data.model):'')+'</span>';}
function quickStatsHtml(label,stats){
 if(!stats)return '<div class="mm-quick-team"><b>'+label+'</b><span>Brak wystarczających danych</span></div>';
 const windowLine=(name,w)=>w?'<span>'+name+': '+w.pointsPerMatch+' pkt/mecz · '+w.wins+'W '+w.draws+'R '+w.losses+'P · gole '+w.goalsFor+':'+w.goalsAgainst+'</span>':'';return '<div class="mm-quick-team"><b>'+label+'</b><span>'+stats.matches+' meczów · '+stats.record+'</span><span>Punkty/mecz: <b>'+stats.pointsPerMatch+'</b> · gole: <b>'+stats.goals+'</b></span>'+windowLine('Ostatnie 5',stats.last5)+windowLine('Ostatnie 10',stats.last10)+'<span>Trend 5 vs poprzednie 5: <b>'+safe(stats.trend)+'</b>'+(stats.trendDelta!==null?' ('+safe(stats.trendDelta)+' pkt/mecz)':'')+'</span><span>Seria: '+(stats.streak?.matches||0)+' × '+safe(({W:'wygrane',D:'remisy',L:'porażki'}[stats.streak?.result]||'—'))+'</span><span>Śr. gole: '+stats.goalsForPerMatch+' strzelone / '+stats.goalsAgainstPerMatch+' stracone</span><span>Czyste konta: '+stats.cleanSheets+' · bez gola: '+stats.failedToScore+'</span><span>BTTS: '+stats.btts+' · over 2.5: '+stats.over25+'</span><span>U siebie: '+(stats.home?stats.home.pointsPerMatch+' pkt/mecz':'brak danych')+' · wyjazd: '+(stats.away?stats.away.pointsPerMatch+' pkt/mecz':'brak danych')+'</span></div>';
}
function couponMatchHtml(r,i){
 const name='<b>'+(i+1)+'. '+safe(r.m.home?.name)+' — '+safe(r.m.away?.name)+'</b>';
 if(r.error)return '<article class="mm-pick">'+name+'<p class="mm-warning">Nie udało się ocenić: '+safe(r.error)+'</p></article>';
 const q=r.data.quick;
 if(!q)return '<article class="mm-pick">'+name+'<p class="mm-warning">Brak podsumowania statystycznego.</p></article>';
 const probsForRisk=q.probabilities?[q.probabilities.home,q.probabilities.draw,q.probabilities.away].map(Number).filter(Number.isFinite):[];
 const ranked=[...probsForRisk].sort((a,b)=>b-a),top=ranked[0]??0,margin=ranked.length>1?top-ranked[1]:0;
 const sample=Math.min(Number(q.home?.matches)||0,Number(q.away?.matches)||0);
 const risk=sample<3||!probsForRisk.length||top<45||margin<5?'Wysokie':top<58||margin<12||sample<5?'Umiarkowane':'Niższe';
 const riskClass=risk==='Wysokie'?'high':risk==='Umiarkowane'?'medium':'low';
 const riskReason=sample<3?'Mała próbka danych':!probsForRisk.length?'Brak prawdopodobieństw 1X2':top<45?'Brak wyraźnego faworyta':margin<5?'Bardzo mała różnica między typami':sample<5?'Ograniczona liczba meczów w próbce':'Wyraźniejszy sygnał statystyczny';
 const pick=q.pick?'<div class="mm-quick-pick"><small>NAJMOCNIEJSZE WSKAZANIE STATYSTYCZNE</small><strong>'+safe(q.pick.code)+' · '+safe(q.pick.label)+'</strong>'+(q.pick.probability!==null?' <span>'+safe(q.pick.probability)+'%</span>':'')+'<p>'+safe(q.rationale.join(' '))+'</p></div>':'<div class="mm-quick-pick"><strong>Brak podstaw do wskazania typu</strong><p>Za mało danych albo brak modelowych prawdopodobieństw.</p></div>';
 const probs=q.probabilities?'<div class="mm-quick-probs"><span>1: '+q.probabilities.home+'%</span><span>X: '+q.probabilities.draw+'%</span><span>2: '+q.probabilities.away+'%</span></div>':'';
 const g=q.goals;
 const candidates=[];
 if(q.probabilities){for(const [code,label,key] of [['1','Zwycięstwo gospodarzy','home'],['X','Remis','draw'],['2','Zwycięstwo gości','away']])candidates.push({market:code+' · '+label,probability:Number(q.probabilities[key])});}
 if(g?.available){candidates.push({market:'Over 1.5 gola',probability:Number(g.over15)},{market:'Over 2.5 gola',probability:Number(g.over25)},{market:'Over 3.5 gola',probability:Number(g.over35)},{market:'Obie drużyny strzelą (BTTS)',probability:Number(g.btts)});}
 const filtered=candidates.filter(x=>r.market==='goals'?/Over|BTTS/.test(x.market):r.market==='result'?/· Zwycięstwo|· Remis/.test(x.market):true).sort((a,b)=>b.probability-a.probability);
 const threshold=r.profile==='low'?76:r.profile==='high'?48:62;
 const best=filtered[0],recommendation=r.autoPick?'<div class="coupon-recommendation"><small>AUTOMATYCZNIE WYBRANY TYP · '+safe(r.autoPick.probability.toFixed(1))+'%</small><strong>'+safe(r.autoPick.market)+'</strong><span>'+safe(r.autoPick.reason)+'</span><label>Kurs u Twojego bukmachera (opcjonalnie)<input class="coupon-odds-input" type="number" min="1.01" step="0.01" inputmode="decimal" placeholder="np. 1.45"></label></div>':r.custom?'<div class="coupon-recommendation"><small>TYP Z TWOJEGO KUPONU</small><strong>'+safe(r.custom.market)+'</strong><span>'+(r.custom.odds?'Kurs wpisany przez Ciebie: '+safe(r.custom.odds):'Nie podano kursu')+'</span></div>':best&&best.probability>=threshold?'<div class="coupon-recommendation"><small>PROPOZYCJA STATYSTYCZNA · PRÓG '+threshold+'%</small><strong>'+safe(best.market)+'</strong><span>Szacowane prawdopodobieństwo: '+best.probability.toFixed(1)+'%</span><label>Kurs u Twojego bukmachera (opcjonalnie)<input class="coupon-odds-input" type="number" min="1.01" step="0.01" inputmode="decimal" placeholder="np. 1.45"></label></div>':'<div class="coupon-recommendation cautious"><small>BRAK ODPOWIEDNIO MOCNEGO SYGNAŁU</small><strong>Nie dokładamy typu na siłę</strong><span>'+(best?'Najlepsza dostępna estymacja: '+best.market+' · '+best.probability.toFixed(1)+'%.':'Brak wystarczających danych dla wybranych rynków.')+'</span></div>';
 const goalsHtml=g?.available?'<div class="mm-goals"><div class="mm-goals-head"><strong>Przewidywana liczba goli</strong><span>Model Poissona</span></div><div class="mm-goals-lambdas"><div><small>'+safe(r.m.home?.name||'Gospodarze')+'</small><b>'+g.lambdaHome.toFixed(2)+'</b><small>oczekiwane gole</small></div><div class="mm-goals-total"><small>Łącznie</small><b>'+g.lambdaTotal.toFixed(2)+'</b><small>gola</small></div><div><small>'+safe(r.m.away?.name||'Goście')+'</small><b>'+g.lambdaAway.toFixed(2)+'</b><small>oczekiwane gole</small></div></div><div class="mm-goals-markets"><span>Over 1.5 <b>'+g.over15+'%</b></span><span>Over 2.5 <b>'+g.over25+'%</b></span><span>Over 3.5 <b>'+g.over35+'%</b></span><span>Obie strzelą <b>'+g.btts+'%</b></span></div><p>Najbardziej prawdopodobny wynik: <b>'+g.mostLikelyScore+'</b> ('+g.scoreProbability+'%)</p><small>Próba: '+g.sampleHome+' / '+g.sampleAway+' meczów. '+safe(g.method)+'.</small></div>':'<div class="mm-goals mm-goals-missing">Szacowanie goli niedostępne: '+safe(g?.reason||'brak wystarczających danych')+'</div>';
 return '<article class="mm-pick">'+name+providerBadge(r.data)+'<div class="mm-risk '+riskClass+'"><strong>Ryzyko: '+risk+'</strong><span>'+riskReason+'</span></div>'+recommendation+pick+probs+goalsHtml+'<div class="mm-compare-title">Porównanie statystyk</div><div class="mm-quick-grid">'+quickStatsHtml(r.m.home?.name||'Gospodarze',q.home)+quickStatsHtml(r.m.away?.name||'Goście',q.away)+'</div><p class="mm-warning">'+safe(q.warning)+'</p></article>';
}
function renderCouponPicker(){
 const host=$('coupon-match-picker');if(!host)return;
 const list=allMatches;
 if(!list.length){host.innerHTML='<p class="muted">Brak spotkań dla wybranej daty. Zmień dzień w zakładce Mecze i wróć tutaj.</p>';return;}
 host.innerHTML=list.map(m=>'<label class="coupon-match-option"><input type="checkbox" data-coupon-pick="'+safe(m.id)+'" '+(pickedMatches.has(String(m.id))?'checked':'')+'><span><b>'+safe(m.home.name)+' — '+safe(m.away.name)+'</b><small>'+safe(m.league)+' · '+new Date(m.date).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</small></span><span class="coupon-match-status">'+safe(m.status||'Nadchodzący')+'</span></label>').join('');
 host.querySelectorAll('[data-coupon-pick]').forEach(input=>input.onchange=()=>{input.checked?pickedMatches.add(input.dataset.couponPick):pickedMatches.delete(input.dataset.couponPick);updateCouponCount();});
 updateCouponCount();
}
function updateCouponCount(){
 const count=pickedMatches.size;
 if($('coupon-picked-count'))$('coupon-picked-count').textContent=count+' wybranych';
 if($('coupon-generate'))$('coupon-generate').disabled=$('coupon-auto-mode')?.checked?!allMatches.length:count===0;
 if($('legacy-picked-count'))$('legacy-picked-count').textContent=count+' wybranych';
 if($('legacy-analyze'))$('legacy-analyze').disabled=count===0;
}
function addLegacyAnalysis(){
 const button=$('legacy-analyze'),out=$('legacy-analysis-result');
 if(!button||button.dataset.bound==='1')return;
 button.dataset.bound='1';
 button.addEventListener('click',async()=>{
  if(button.dataset.running==='1')return;
  const chosen=allMatches.filter(m=>pickedMatches.has(String(m.id)));
  if(!chosen.length)return;
  button.dataset.running='1';button.disabled=true;button.textContent='Analizuję…';out.hidden=false;
  out.innerHTML='<h3>Analiza zaznaczonych spotkań</h3><p class="muted">Oceniam '+chosen.length+' spotkań na podstawie danych dostępnych w MatchMind.</p>';
  try{
   const results=await Promise.all(chosen.map(async m=>{
    try{const response=await fetch('/api/matches/'+encodeURIComponent(m.id)+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fixture:m,forceRefresh:false}),signal:AbortSignal.timeout(55000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Błąd analizy');return {m,data};}
    catch(error){return {m,error:error?.message||'Nieznany błąd'};}
   }));
   out.innerHTML='<h3>Wyniki analizy · '+results.length+' spotkań</h3>'+results.map((r,i)=>couponMatchHtml({...r,market:'all',profile:'balanced'},i)).join('')+'<p class="mm-warning">Analiza opiera się na dostępnych statystykach. Nie stanowi gwarancji wyniku.</p>';
  }catch(error){out.innerHTML='<p class="mm-warning">'+safe(error?.message||'Nie udało się przeprowadzić analizy.')+'</p>';}
  finally{button.dataset.running='0';button.disabled=pickedMatches.size===0;button.textContent='Analizuj ponownie →';}
 });
 updateCouponCount();
}
function addBuilder(){
 renderCouponPicker();
 const autoMode=$('coupon-auto-mode'),manualPicker=$('coupon-manual-picker');
 if(autoMode&&manualPicker){manualPicker.hidden=autoMode.checked;autoMode.addEventListener('change',()=>{manualPicker.hidden=autoMode.checked;updateCouponCount();});}
 document.querySelectorAll('[data-coupon-mode]').forEach(button=>button.onclick=()=>{
  const consult=button.dataset.couponMode==='consult';
  document.querySelectorAll('[data-coupon-mode]').forEach(x=>x.classList.toggle('active',x===button));
  $('coupon-generate-panel').hidden=consult;$('coupon-consult-panel').hidden=!consult;$('coupon-builder-result').hidden=true;
 });
 const out=$('coupon-builder-result');
 async function analyzeFixtures(matches){
  const results=[];
  for(let i=0;i<matches.length;i+=3){
   const batch=matches.slice(i,i+3);
   const part=await Promise.all(batch.map(async m=>{
    try{
     const response=await fetch('/api/coupons/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fixture:m,forceRefresh:false}),signal:AbortSignal.timeout(55000)});
     const data=await response.json();if(!response.ok)throw new Error(data.error||'Błąd analizy');return {m,data};
    }catch(error){return {m,error:error?.message||'Nieznany błąd'};}
   }));
   results.push(...part);
  }
  return results;
 }
 function selectAutomaticCoupon(results,profile,market,count){
  const settings=profile==='low'?{threshold:76,minSample:7,floor:48,label:'Ostrożny'}:profile==='high'?{threshold:48,minSample:3,floor:38,label:'Agresywny'}:{threshold:62,minSample:5,floor:43,label:'Zrównoważony'};
  const {threshold,minSample,floor}=settings,options=[];
  for(const result of results){
   const q=result.data?.quick;if(!q)continue;
   const homeSample=Math.max(0,Number(q.home?.matches)||0),awaySample=Math.max(0,Number(q.away?.matches)||0);
   const sample=Math.min(homeSample,awaySample);if(sample<1)continue;
   const candidates=[],p=q.probabilities;
   if(p&&market!=='goals')candidates.push({market:'1 · Zwycięstwo gospodarzy',probability:Number(p.home)},{market:'X · Remis',probability:Number(p.draw)},{market:'2 · Zwycięstwo gości',probability:Number(p.away)});
   const g=q.goals;
   if(g?.available&&market!=='result')candidates.push({market:'Over 1.5 gola',probability:Number(g.over15)},{market:'Over 2.5 gola',probability:Number(g.over25)},{market:'Over 3.5 gola',probability:Number(g.over35)},{market:'Obie drużyny strzelą (BTTS)',probability:Number(g.btts)});
   const valid=candidates.filter(x=>Number.isFinite(x.probability)&&x.probability>=floor);
   if(!valid.length)continue;
   const ranked=valid.map(candidate=>{
    const probabilityGap=Math.max(0,threshold-candidate.probability);
    const sampleGap=Math.max(0,minSample-sample);
    const probabilityPenalty=probabilityGap*(profile==='low'?1.15:profile==='balanced'?0.8:0.45);
    const samplePenalty=sampleGap*(profile==='low'?2.2:profile==='balanced'?1.35:0.65);
    const score=candidate.probability-probabilityPenalty-samplePenalty;
    return {...candidate,score,belowTarget:candidate.probability<threshold,sampleFallback:sample<minSample};
   }).sort((a,b)=>b.score-a.score);
   const best=ranked[0],rationale=(q.rationale||[]).slice(0,2).join(' ')||'Wybór oparty na dostępnych prawdopodobieństwach modelu.';
   const notes=[];
   if(best.belowTarget)notes.push('Prawdopodobieństwo poniżej preferowanego progu '+threshold+'%');
   if(best.sampleFallback)notes.push('Próbka mniejsza niż preferowane '+minSample+' meczów');
   options.push({...result,autoPick:{...best,sample,reason:rationale+' Próba: '+sample+' meczów każdej drużyny.'+(notes.length?' Odstępstwa: '+notes.join('; ')+'.':'') }});
  }
  options.sort((a,b)=>b.autoPick.score-a.autoPick.score);
  const chosen=[],used=new Set();
  for(const option of options){if(used.has(String(option.m.id)))continue;chosen.push(option);used.add(String(option.m.id));if(chosen.length>=count)break;}
  const fallbackCount=chosen.filter(x=>x.autoPick.belowTarget||x.autoPick.sampleFallback).length;
  return {chosen,threshold,minSample,floor,eligible:options.length,profileLabel:settings.label,fallbackCount};
 }
 async function renderResults(results,{customLines=[],auto=false,profile='balanced',market='all',count=3}={}){
  const annotated=auto?results.map((r,i)=>({...r,profile,market,autoPick:r.autoPick})):results.map((r,i)=>({...r,custom:customLines[i]||null,profile,market}));
  out.innerHTML='<div class="coupon-result-head"><div><p class="eyebrow">MATCHMIND ANALYSIS</p><h3>'+(customLines.length?'Ocena Twojego kuponu':auto?'Automatycznie dobrany kupon':'Propozycja MatchMind AI')+'</h3></div><span>'+results.length+' zdarzeń</span></div>'+(auto?'<div class="coupon-auto-summary"><strong>Dobór automatyczny</strong><p>Przeanalizowano '+auto.scanned+' spotkań. Profil '+safe(auto.profileLabel||'')+': próg '+auto.threshold+'%, minimum próbki '+auto.minSample+' meczów każdej drużyny. Wybrano '+results.length+' z '+count+' żądanych pozycji. Każde zdarzenie pochodzi z osobnego meczu.</p><p>'+ (results.length?(auto.fallbackCount?'Dobór adaptacyjny: '+auto.fallbackCount+' z '+results.length+' typów odbiega od preferowanego progu lub wielkości próbki. Odstępstwa są oznaczone przy typach.':'Wszystkie wybrane typy spełniają preferowany próg i minimum próbki.'):'Brak użytecznych prawdopodobieństw w analizowanych danych. Spróbuj innego dnia lub rynku.')+'</p></div>':'')+annotated.map((r,i)=>couponMatchHtml(r,i)).join('')+(auto&&results.length?'<div class="coupon-auto-summary"><strong>Szacowana łączna szansa kuponu: '+auto.combined.toFixed(2)+'%</strong><p>To przybliżenie obliczone jako iloczyn prawdopodobieństw poszczególnych zdarzeń przy założeniu ich niezależności. Rzeczywista szansa może być inna; model nie uwzględnia wszystkich zależności.</p></div>':'')+'<div class="coupon-total-odds" id="coupon-total-odds">Łączny kurs: <strong>uzupełnij kursy</strong></div><p class="coupon-note">Kursy nie są pobierane automatycznie. Wprowadzone kursy są danymi użytkownika i nie są przez MatchMind weryfikowane.</p>';
  const recalculateTotal=()=>{const entered=customLines.length?customLines.map(x=>Number(String(x.odds||'').replace(',','.'))):[...out.querySelectorAll('.coupon-odds-input')].map(x=>Number(String(x.value||'').replace(',','.')));const total=$('coupon-total-odds');if(!total)return;const valid=entered.length&&entered.every(x=>Number.isFinite(x)&&x>=1.01);total.innerHTML=valid?'Łączny kurs wpisanych zdarzeń: <strong>'+entered.reduce((a,b)=>a*b,1).toFixed(2).replace('.',',')+'</strong>':'Łączny kurs: <strong>uzupełnij wszystkie kursy (opcjonalnie)</strong>';};
  out.querySelectorAll('.coupon-odds-input').forEach(input=>input.addEventListener('input',recalculateTotal));recalculateTotal();
 }
 async function runCoupon(matches,customLines=[]){
  const button=customLines.length?$('coupon-consult'):$('coupon-generate');
  if(button.dataset.running==='1'||!matches.length)return;
  button.dataset.running='1';button.disabled=true;button.textContent='Analizuję kupon…';out.hidden=false;
  out.innerHTML='<h3>Analiza wybranych zdarzeń</h3><p class="muted">Sprawdzam dostępne dane dla '+matches.length+' spotkań.</p>';
  try{
   const results=await analyzeFixtures(matches),profile=$('coupon-risk')?.value||'balanced',market=$('coupon-market')?.value||'all';
   await renderResults(results,{customLines,profile,market});
  }catch(error){out.innerHTML='<p class="mm-warning">'+safe(error?.message||'Nie udało się przeanalizować kuponu.')+'</p>';}
  finally{button.dataset.running='0';button.disabled=false;button.textContent=customLines.length?'Przeanalizuj mój kupon →':'Utwórz propozycję ponownie →';}
 }
 $('coupon-generate')?.addEventListener('click',async()=>{
  const button=$('coupon-generate');if(button.dataset.running==='1')return;
  const automatic=$('coupon-auto-mode')?.checked,count=Number($('coupon-count').value)||3;
  const chosen=automatic?allMatches.filter(m=>!['LIVE','FT','AET','PEN','CANCELLED','POSTPONED'].includes(String(m.status||'NS').toUpperCase())).slice(0,20):allMatches.filter(m=>pickedMatches.has(String(m.id))).slice(0,count);
  if(!chosen.length){out.hidden=false;out.innerHTML='<p class="mm-warning">Brak spotkań do analizy w aktualnie załadowanym terminarzu.</p>';return;}
  if(!automatic){runCoupon(chosen);return;}
  button.dataset.running='1';button.disabled=true;button.textContent='Szukam najbezpieczniejszych typów…';out.hidden=false;
  out.innerHTML='<h3>Automatyczny dobór kuponu</h3><p class="muted">Analizuję do '+chosen.length+' spotkań z terminarza. Nie musisz wybierać drużyn.</p>';
  try{
   const results=await analyzeFixtures(chosen),profile=$('coupon-risk')?.value||'balanced',market=$('coupon-market')?.value||'all',count=Number($('coupon-count').value)||3;
   const selection=selectAutomaticCoupon(results,profile,market,count);
   const combined=selection.chosen.reduce((value,item)=>value*(item.autoPick.probability/100),1)*100;
   await renderResults(selection.chosen,{auto:{scanned:chosen.length,threshold:selection.threshold,minSample:selection.minSample,profileLabel:selection.profileLabel,combined},profile,market,count});
  }catch(error){out.innerHTML='<p class="mm-warning">'+safe(error?.message||'Nie udało się automatycznie dobrać kuponu.')+'</p>';}
  finally{button.dataset.running='0';button.disabled=false;button.textContent='Utwórz propozycję kuponu →';}
 });
 $('coupon-consult')?.addEventListener('click',()=>{
  const lines=$('coupon-own-slip').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),matches=[],custom=[],missing=[];
  for(const line of lines){
   const parts=line.split('|').map(x=>x.trim()),fixtureText=parts[0]||'',teams=fixtureText.split(/\s+-\s+/);
   const match=allMatches.find(m=>teams.length>=2&&m.home.name.toLocaleLowerCase('pl').includes(teams[0].toLocaleLowerCase('pl'))&&m.away.name.toLocaleLowerCase('pl').includes(teams[1].toLocaleLowerCase('pl')));
   if(!match){missing.push(line);continue;}
   matches.push(match);custom.push({market:parts[1]||'Nie podano',odds:parts[2]||null});
  }
  if(missing.length){out.hidden=false;out.innerHTML='<h3>Nie rozpoznano wszystkich pozycji</h3><p class="coupon-note">Popraw nazwy drużyn tak, aby odpowiadały terminarzowi:</p><ul>'+missing.map(x=>'<li>'+safe(x)+'</li>').join('')+'</ul>';return;}
  if(matches.length)runCoupon(matches,custom);
  else if(!missing.length){out.hidden=false;out.innerHTML='<p class="coupon-note">Wpisz przynajmniej jedno zdarzenie w osobnym wierszu.</p>';}
 });
}
function performanceMetric(value,digits=2){return value==null?'—':Number(value).toFixed(digits).replace('.',',');}
function renderPerformance(data){
 const k=$('performance-kpis'),acc=data.accuracy;
 const cards=[
  ['TRAFNOŚĆ 1X2',acc?acc.rate+'%':'—',acc?acc.hit+' z '+acc.total+' trafień':'Brak rozliczonych prognoz'],
  ['BRIER SCORE',performanceMetric(data.brier,4),data.brier==null?'Wymaga danych':'Niżej oznacza lepiej · zakres 0–0,667'],
  ['BŁĄD GOLI (MAE)',performanceMetric(data.expectedGoalsMae,3),data.expectedGoalsMae==null?'Brak prognoz xG do oceny':'Średni błąd w golach na drużynę'],
  ['PRÓBKA',String(data.settled||0),(data.pending||0)+' oczekujących · '+(data.total||0)+' zapisanych']
 ];
 k.innerHTML=cards.map(x=>'<article><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+x[2]+'</small></article>').join('');
 $('performance-storage').textContent='Zapis: '+(data.storage||'nieznany');
 const bins=data.calibration||[];
 $('performance-calibration').innerHTML=bins.some(x=>x.count)?'<div class="calibration-legend"><span>Przedział pewności</span><span>Model / trafność</span></div>'+bins.map(x=>'<div class="calibration-row"><div class="calibration-range">'+safe(x.range)+'<small>'+x.count+' prognoz</small></div><div class="calibration-bars">'+(x.confidence==null?'<span class="muted">—</span>':'<div class="calibration-track"><i style="width:'+Math.max(0,Math.min(100,x.confidence))+'%"></i></div><div class="calibration-track actual"><i style="width:'+Math.max(0,Math.min(100,x.accuracy||0))+'%"></i></div>')+'</div><strong>'+(x.accuracy==null?'—':x.accuracy+'%')+'</strong></div>').join('')+'<div class="calibration-key"><span><i></i> Średnia pewność</span><span><i></i> Rzeczywista trafność</span></div>':'<div class="performance-empty">Za mało rozliczonych prognoz, aby ocenić kalibrację. Dane pojawią się po zakończeniu i zweryfikowaniu pierwszych spotkań.</div>';
 const quality=[['Log loss',performanceMetric(data.logLoss,4),'Niżej = lepiej'],['Over 2.5',data.over25?data.over25.rate+'%':'—',data.over25?data.over25.hit+' / '+data.over25.total+' trafień':'Brak ocenionych prognoz'],['Obie strzelą (BTTS)',data.btts?data.btts.rate+'%':'—',data.btts?data.btts.hit+' / '+data.btts.total+' trafień':'Brak ocenionych prognoz']];
 $('performance-quality').innerHTML=quality.map(x=>'<div class="quality-item"><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+x[2]+'</small></div>').join('');
 const rows=data.history||[];
 $('performance-history-list').innerHTML=rows.length?'<div class="history-table-wrap"><table class="history-table"><thead><tr><th>Mecz</th><th>Termin</th><th>Prognoza</th><th>Wynik</th><th>Status</th></tr></thead><tbody>'+rows.slice(0,15).map(x=>{const p=x.prediction||{},probs=p.probabilities;const pred=probs?['1','X','2'][['home','draw','away'].map(z=>Number(probs[z])||0).indexOf(Math.max(Number(probs.home)||0,Number(probs.draw)||0,Number(probs.away)||0))]:'xG '+(p.expectedGoals?.home??'—')+' : '+(p.expectedGoals?.away??'—');return '<tr><td><b>'+safe(x.home)+' — '+safe(x.away)+'</b><small>'+safe(x.league||'')+'</small></td><td>'+new Date(x.kickoff).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</td><td>'+safe(pred)+'</td><td>'+(x.status==='settled'?x.actualHome+' : '+x.actualAway:'—')+'</td><td><span class="history-status '+(x.status==='settled'?'done':'waiting')+'">'+(x.status==='settled'?'Rozliczony':'Oczekuje')+'</span></td></tr>';}).join('')+'</tbody></table></div>':'<div class="performance-empty">Nie ma jeszcze zapisanych prognoz. Otwórz analizę nadchodzącego meczu – MatchMind zapisze przedmeczową prognozę automatycznie.</div>';
}
async function loadPerformance(){
 const k=$('performance-kpis');if(!k)return;
 const button=$('performance-refresh');if(button){button.disabled=true;button.textContent='Aktualizuję…';}
 try{const response=await fetch('/api/performance',{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.error||'Błąd pobierania danych');renderPerformance(data);}
 catch(error){$('performance-calibration').innerHTML='<p class="performance-empty">Nie udało się pobrać historii: '+safe(error.message)+'</p>';}
 finally{if(button){button.disabled=false;button.textContent='Odśwież dane ↻';}}
}


function comparisonFixtureLabel(m){return m.home.name+' — '+m.away.name+' · '+m.league+' · '+new Date(m.date).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});}
function renderComparisonOptions(){
 const a=$('compare-match-a'),b=$('compare-match-b');if(!a||!b)return;
 const previousA=a.value,previousB=b.value;
 const options=allMatches.filter(m=>!['FT','AET','PEN','CANC','POSTPONED'].includes(String(m.status||'').toUpperCase()));
 const make=(select,previous,other)=>{select.innerHTML='<option value="">Wybierz spotkanie</option>'+options.filter(m=>String(m.id)!==other).map(m=>'<option value="'+safe(m.id)+'">'+safe(comparisonFixtureLabel(m))+'</option>').join('');if(options.some(m=>String(m.id)===previous&&String(m.id)!==other))select.value=previous;};
 make(a,previousA,b.value);make(b,previousB,a.value);$('compare-run').disabled=!(a.value&&b.value&&a.value!==b.value);
}
function comparisonStatsHtml(name,stats){
 if(!stats)return '<div class="compare-team"><h4>'+safe(name)+'</h4><p>Brak wystarczających danych o formie.</p></div>';
 const win=w=>w?w.pointsPerMatch+' pkt/mecz · '+w.wins+'W '+w.draws+'R '+w.losses+'P · '+w.goalsFor+':'+w.goalsAgainst:'brak danych';
 return '<div class="compare-team"><h4>'+safe(name)+'</h4><p><b>'+stats.matches+'</b> meczów · '+safe(stats.record)+'</p><p>Punkty/mecz: <b>'+stats.pointsPerMatch+'</b></p><p>Gole: <b>'+stats.goalsForPerMatch+'</b> strzelone / <b>'+stats.goalsAgainstPerMatch+'</b> stracone na mecz</p><p>Ostatnie 5: '+safe(win(stats.last5))+'</p><p>Ostatnie 10: '+safe(win(stats.last10))+'</p><p>Trend: <b>'+safe(stats.trend||'brak danych')+'</b></p><p>BTTS: '+stats.btts+'/'+stats.matches+' · Over 2.5: '+stats.over25+'/'+stats.matches+'</p></div>';
}
function comparisonMarkets(q){
 const g=q?.goals,p=q?.probabilities||{};
 const result={};
 const values={home:p.home??g?.homeWin,draw:p.draw??g?.draw,away:p.away??g?.awayWin,over15:g?.over15,over25:g?.over25,over35:g?.over35,btts:g?.btts};
 for(const [key,value] of Object.entries(values)){const n=Number(value);result[key]=value!==null&&value!==undefined&&Number.isFinite(n)?n:null;}
 return result;
}
function comparisonMarketName(key){return ({home:'1 · Wygrana gospodarzy',draw:'X · Remis',away:'2 · Wygrana gości',over15:'Over 1.5 gola',over25:'Over 2.5 gola',over35:'Over 3.5 gola',btts:'Obie drużyny strzelą (BTTS)'})[key];}
function compareResultHtml(a,b,ra,rb){
 const qa=ra.quick||{},qb=rb.quick||{},ma=comparisonMarkets(qa),mb=comparisonMarkets(qb);
 const markets=['home','draw','away','over15','over25','over35','btts'];
 const rows=markets.map(key=>{const x=ma[key],y=mb[key],delta=x===null||y===null?null:Number((x-y).toFixed(1));let verdict='Brak porównywalnych danych';if(delta!==null)verdict=Math.abs(delta)<2?'Praktycznie remis':delta>0?'Mecz A · wyższa estymacja':'Mecz B · wyższa estymacja';return '<tr><td>'+comparisonMarketName(key)+'</td><td>'+(x===null?'—':x.toFixed(1)+'%')+'</td><td>'+(y===null?'—':y.toFixed(1)+'%')+'</td><td>'+ (delta===null?'—':(delta>0?'+':'')+delta+' pp')+'</td><td>'+verdict+'</td></tr>';}).join('');
 const valid=markets.filter(k=>ma[k]!==null&&mb[k]!==null),winsA=valid.filter(k=>ma[k]>mb[k]+2).length,winsB=valid.filter(k=>mb[k]>ma[k]+2).length;
 const verdict=valid.length===0?'Nie można wskazać mocniejszego spotkania — brakuje wspólnych danych rynkowych.':winsA===winsB?'Porównanie jest wyrównane. Żaden mecz nie ma wyraźnej przewagi w większości dostępnych rynków.':winsA>winsB?'Mecz A ma wyższe estymacje w większej liczbie porównywanych rynków ('+winsA+' do '+winsB+').':'Mecz B ma wyższe estymacje w większej liczbie porównywanych rynków ('+winsB+' do '+winsA+').';
 const sampleA=Math.min(Number(qa.home?.matches)||0,Number(qa.away?.matches)||0),sampleB=Math.min(Number(qb.home?.matches)||0,Number(qb.away?.matches)||0);
 return '<div class="compare-verdict"><small>WERDYKT MATCHMIND</small><strong>'+verdict+'</strong><p>Mecz A: próbka '+sampleA+' · Mecz B: próbka '+sampleB+'. Różnica poniżej 2 punktów procentowych jest traktowana jako praktyczny remis.</p></div><h3>Porównanie spotkań</h3><div class="compare-games"><article><h4>Mecz A</h4><strong>'+safe(a.home.name)+' — '+safe(a.away.name)+'</strong><small>'+safe(a.league)+'</small></article><article><h4>Mecz B</h4><strong>'+safe(b.home.name)+' — '+safe(b.away.name)+'</strong><small>'+safe(b.league)+'</small></article></div><h3>Rynki i prawdopodobieństwa</h3><div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>Rynek</th><th>Mecz A</th><th>Mecz B</th><th>Różnica A−B</th><th>Wniosek</th></tr></thead><tbody>'+rows+'</tbody></table></div><h3>Forma drużyn · mecz A</h3><div class="compare-teams">'+comparisonStatsHtml(a.home.name,qa.home)+comparisonStatsHtml(a.away.name,qa.away)+'</div><h3>Forma drużyn · mecz B</h3><div class="compare-teams">'+comparisonStatsHtml(b.home.name,qb.home)+comparisonStatsHtml(b.away.name,qb.away)+'</div><p class="mm-warning">'+safe([qa.warning,qb.warning].filter(Boolean).join(' '))+'</p><p class="compare-footnote">Metoda: model Poissona dla rynków bramkowych; dla 1X2 użyto prawdopodobieństw dostawcy, jeśli są dostępne. Gdy ich brak, wynik 1X2 jest wyliczany z modelu goli. To estymacje, nie dane bukmacherskie.</p>';
}
function addComparison(){
 const a=$('compare-match-a'),b=$('compare-match-b'),button=$('compare-run'),out=$('compare-result');if(!a||!b||!button)return;
 a.addEventListener('change',renderComparisonOptions);b.addEventListener('change',renderComparisonOptions);
 button.addEventListener('click',async()=>{if(button.dataset.running==='1'||!a.value||!b.value||a.value===b.value)return;const first=allMatches.find(m=>String(m.id)===a.value),second=allMatches.find(m=>String(m.id)===b.value);if(!first||!second)return;
 button.dataset.running='1';button.disabled=true;button.textContent='Analizuję oba spotkania…';out.hidden=false;out.innerHTML='<p class="muted">Pobieram analizy dla dwóch spotkań z wykorzystaniem zapisanych danych i cache…</p>';
 try{const analyze=async m=>{const response=await fetch('/api/matches/'+encodeURIComponent(m.id)+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fixture:m,forceRefresh:false}),signal:AbortSignal.timeout(55000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Błąd analizy');return data;};const [ra,rb]=await Promise.all([analyze(first),analyze(second)]);out.innerHTML=compareResultHtml(first,second,ra,rb);}
 catch(error){out.innerHTML='<p class="mm-warning">Nie udało się porównać spotkań: '+safe(error.message)+'</p>';}
 finally{button.dataset.running='0';button.textContent='Porównaj ponownie →';renderComparisonOptions();}
 });
 renderComparisonOptions();
}

const matchesEl=document.querySelector('#matches'),$=id=>document.getElementById(id);let allMatches=[],selectedLeagues=readSavedLeagues(),leagueNames=[],leagueFilterInitialized=false;const now=new Date();$('match-date').value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');function safe(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}async function refreshStatus(){try{const d=await(await fetch('/api/health')).json(),f=d.footballApi||{};$('api-status').textContent=f.provider||'ESPN';$('api-remaining').textContent=f.provider||'ESPN';$('cache-hits').textContent=(f.cacheHits||0).toLocaleString('pl-PL');$('cache-detail').textContent=(f.cacheEntries||0)+' wpisów · '+(f.storage||'cache')+' · '+(f.limit||'');$('llm-status').textContent=d.llm?.enabled?'Aktywny':'Wkrótce';$('llm-model').textContent=d.llm?.model||'Ollama';}catch{$('api-status').textContent='Offline';}}function predictionMarkup(p){if(!p||p.home==null)return '<div class="no-prediction">Brak wystarczających danych do oszacowania</div>';const v=[p.home,p.draw,p.away],n=['1','X','2'],b=v.indexOf(Math.max(...v));return '<div class="prediction-title">SZACOWANE SZANSE · '+safe(p.source)+'</div><div class="prob-bars">'+v.map((x,i)=>'<span class="'+(i===b?'best':'')+'" style="width:'+Math.max(0,Math.min(100,x))+'%"></span>').join('')+'</div><div class="prob-labels">'+v.map((x,i)=>'<span>'+(i===b?'<b>':'')+n[i]+' '+Math.round(x)+'%'+(i===b?'</b>':'')+'</span>').join('')+'</div><div class="confidence">Największa szansa: '+(b===0?'gospodarze':b===1?'remis':'goście')+' · '+Math.round(v[b])+'% · pewność: '+safe(p.confidence||'nieznana')+'</div>';}function polishLeague(name){const key=String(name||'').trim().toLocaleLowerCase('en');const map={'uefa champions league':'Liga Mistrzów','champions league':'Liga Mistrzów','uefa europa league':'Liga Europy','europa league':'Liga Europy','uefa conference league':'Liga Konferencji Europy','conference league':'Liga Konferencji Europy','premier league':'Premier League','laliga':'La Liga','la liga':'La Liga','serie a':'Serie A','serie b':'Serie B','bundesliga':'Bundesliga','2. bundesliga':'2. Bundesliga','ligue 1':'Ligue 1','ligue 2':'Ligue 2','eredivisie':'Eredivisie','primeira liga':'Liga Portugalska','liga portugal':'Liga Portugalska','ekstraklasa':'Ekstraklasa','fa cup':'Puchar Anglii','copa del rey':'Puchar Króla','coppa italia':'Puchar Włoch','dfb pokal':'Puchar Niemiec','supercopa de espana':'Superpuchar Hiszpanii','uefa nations league':'Liga Narodów UEFA','world cup':'Mistrzostwa Świata','fifa world cup':'Mistrzostwa Świata'};return map[key]||name;}function polishCountry(name){const map={'England':'Anglia','Spain':'Hiszpania','Germany':'Niemcy','Italy':'Włochy','France':'Francja','Portugal':'Portugalia','Netherlands':'Holandia','Poland':'Polska','Scotland':'Szkocja','Turkey':'Turcja','Saudi Arabia':'Arabia Saudyjska','World':'Międzynarodowe'};return map[name]||name||'Rozgrywki';}function renderFilters(){leagueNames=[...new Set(allMatches.map(m=>m.league).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pl'));if(!leagueFilterInitialized){selectedLeagues=new Set([...(selectedLeagues||[]),...leagueNames]);leagueFilterInitialized=true;}const all=leagueNames.every(n=>selectedLeagues.has(n));const nav=$('league-filters');nav.innerHTML='<div class="league-picker"><button type="button" class="league-picker-trigger" id="league-picker-trigger" aria-expanded="false"><span class="picker-icon">☷</span><span>Wybierz ligi</span><strong>'+leagueNames.filter(n=>selectedLeagues.has(n)).length+' / '+leagueNames.length+'</strong><span class="picker-chevron">⌄</span></button><div class="league-picker-menu" id="league-picker-menu" hidden><div class="picker-menu-head"><span>Widoczne rozgrywki</span><div><button type="button" id="select-all-leagues">Wszystkie</button><button type="button" id="clear-leagues">Wyczyść</button></div></div><div class="league-check-list">'+leagueNames.map((n,i)=>'<label class="league-check"><input type="checkbox" value="'+safe(n)+'" '+(selectedLeagues.has(n)?'checked':'')+'><span>'+safe(n)+'</span></label>').join('')+'</div></div></div><span class="filter-summary">'+(all?'Wyświetlasz wszystkie ligi':selectedLeagues.size?'Wyświetlasz wybrane ligi':'Nie wybrano żadnej ligi')+'</span>';const trigger=$('league-picker-trigger'),menu=$('league-picker-menu');trigger.onclick=()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));};nav.querySelectorAll('input[type=checkbox]').forEach(input=>input.onchange=()=>{input.checked?selectedLeagues.add(input.value):selectedLeagues.delete(input.value);saveSelectedLeagues();renderFilters();renderMatches();$('league-picker-menu').hidden=false;$('league-picker-trigger').setAttribute('aria-expanded','true');});$('select-all-leagues').onclick=()=>{selectedLeagues=new Set([...selectedLeagues,...leagueNames]);saveSelectedLeagues();renderFilters();renderMatches();$('league-picker-menu').hidden=false;$('league-picker-trigger').setAttribute('aria-expanded','true');};$('clear-leagues').onclick=()=>{selectedLeagues.clear();saveSelectedLeagues();renderFilters();renderMatches();$('league-picker-menu').hidden=false;$('league-picker-trigger').setAttribute('aria-expanded','true');};} function renderMatches(){const q=$('search').value.trim().toLocaleLowerCase('pl-PL'),list=allMatches.filter(m=>selectedLeagues.has(m.league)&&[m.home.name,m.away.name,m.league,m.country].join(' ').toLocaleLowerCase('pl-PL').includes(q));if(!list.length){matchesEl.innerHTML='<div class="empty-state">Nie znaleziono spotkań. Zmień datę lub wyszukiwaną frazę.</div>';return;}const leagues=new Map();list.forEach(m=>{if(!leagues.has(m.league))leagues.set(m.league,[]);leagues.get(m.league).push(m);});matchesEl.innerHTML=[...leagues.entries()].sort((a,b)=>a[0].localeCompare(b[0],'pl')).map(([league,items])=>{const times=new Map();items.forEach(m=>{const t=new Date(m.date).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});if(!times.has(t))times.set(t,[]);times.get(t).push(m);});return '<section class="league-group"><div class="group-head"><div><div class="league-name">'+safe(league)+'</div><div class="league-meta">'+safe(items[0].country||'Rozgrywki')+' · '+items.length+' spotkań</div></div><div class="group-count">'+safe(items[0].round||'TERMINARZ')+'</div></div>'+[...times.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([time,ms])=>'<div class="time-block"><div class="time-label">'+time+'</div>'+ms.map(m=>'<article class="match"><label class="mm-check"><input type="checkbox" data-pick="'+safe(m.id)+'" '+(pickedMatches.has(String(m.id))?'checked':'')+'><span></span></label><div><div class="kickoff">'+time+'</div><div class="match-status">'+safe(m.status)+'</div></div><div class="teams"><div class="team">'+(m.home.logo?'<img src="'+safe(m.home.logo)+'" alt="">':'')+'<span class="team-name">'+safe(m.home.name)+'</span></div><div class="team">'+(m.away.logo?'<img src="'+safe(m.away.logo)+'" alt="">':'')+'<span class="team-name">'+safe(m.away.name)+'</span></div></div><div class="prediction">'+predictionMarkup(m.prediction)+'</div><div class="match-actions"><button data-id="'+safe(m.id)+'">Analizuj</button></div></article>').join('')+'</div>').join('')+'</section>';}).join('');matchesEl.querySelectorAll('input[data-pick]').forEach(x=>x.onchange=()=>{x.checked?pickedMatches.add(x.dataset.pick):pickedMatches.delete(x.dataset.pick);updateCouponCount();});matchesEl.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>openMatch(allMatches.find(m=>m.id===b.dataset.id)));}async function load(){matchesEl.innerHTML='<div class="loading">Pobieranie terminarza z ESPN + BSD…</div>';try{const r=await fetch('/api/fixtures?date='+encodeURIComponent($('match-date').value)),d=await r.json();if(!r.ok)throw new Error(d.error||'Błąd API');allMatches=(d.fixtures||[]).map(m=>({...m,league:polishLeague(m.league),country:polishCountry(m.country)}));renderFilters();renderMatches();renderCouponPicker();updateCouponCount();renderSquadOptions();if(d.notice){matchesEl.insertAdjacentHTML('afterbegin','<p class="mm-warning">'+safe(d.notice)+'</p>');}await refreshStatus();}catch(e){matchesEl.innerHTML='<div class="empty-state">Nie udało się pobrać terminarza: '+safe(e.message)+'</div>';}}function shiftMatchDate(days){const input=$('match-date');if(!input?.value)return;const [y,m,d]=input.value.split('-').map(Number);const date=new Date(y,m-1,d);date.setDate(date.getDate()+days);input.value=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');load();}function setMatchToday(){const d=new Date();$('match-date').value=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');load();}$('date-prev')?.addEventListener('click',()=>shiftMatchDate(-1));$('date-next')?.addEventListener('click',()=>shiftMatchDate(1));$('date-today')?.addEventListener('click',setMatchToday);$('refresh').onclick=load;$('match-date').onchange=load;$('search').oninput=renderMatches;function switchMainTab(tab){
 const performance=tab==='performance',coupons=tab==='coupons',compare=tab==='compare',squads=tab==='squads';
 $('performance').hidden=!performance;
 $('squads-workspace').hidden=!squads;
 $('compare-workspace').hidden=!compare;
 $('coupon-workspace').hidden=!coupons;
 $('matches-workspace').hidden=performance||coupons||compare||squads;
 document.querySelectorAll('.main-tab').forEach(button=>{const active=button.dataset.tab===tab;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');});
 if(performance)loadPerformance();
 if(coupons)renderCouponPicker();
 if(compare)renderComparisonOptions();
 if(squads)renderSquadOptions();
}
document.querySelectorAll('.main-tab').forEach(button=>button.addEventListener('click',()=>switchMainTab(button.dataset.tab)));
addBuilder();
addLegacyAnalysis();
addComparison();
$('squad-match-select')?.addEventListener('change',updateSquadButton);
$('squad-load')?.addEventListener('click',loadSquadSelection);
$('performance-refresh')?.addEventListener('click',loadPerformance);
load();refreshStatus();if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});