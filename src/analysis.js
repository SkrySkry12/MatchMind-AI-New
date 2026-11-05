import {getMatchBundle} from './sports.js';
import {getManualStats} from './store.js';
import {readCache,writeCache,saveForecast} from './cache.js';
const ANALYSIS_CACHE_TTL=20*60;
const DAY_MS=86400000;
function daysBetween(a,b){const x=Date.parse(a||''),y=Date.parse(b||'');return Number.isFinite(x)&&Number.isFinite(y)?Math.max(0,Math.floor((y-x)/DAY_MS)):null;}
function eventCards(events){return (Array.isArray(events)?events:[]).filter(e=>/red.?card|czerw|dismiss|sent.?off/i.test([e.type,e.detail,e.text,e.description].filter(Boolean).join(' '))).map(e=>({team:e.team?.name||e.team||null,player:e.player?.name||e.player||null,time:e.time?.elapsed||e.minute||null,detail:e.detail||e.text||e.description||e.type||'Czerwona kartka'}));}
const systemPrompt='Jesteś analitykiem piłkarskim MatchMind AI. Analizuj wyłącznie dostarczone fakty. Uwzględniaj ostatnie 5 meczów, gole strzelone i stracone, punkty na mecz, czyste konta, mecze bez gola, BTTS, over 2.5, serię wyników, przewagę własnego boiska, statystyki sezonowe oraz potwierdzone absencje. Nie traktuj samych zwycięstw i porażek jako pełnej analizy. Nie wymyślaj danych ani składów. Oddziel fakty od szacunków, wskaż brakujące dane i czynniki ryzyka. Nie zawyżaj pewności. Pisz po polsku, czytelnie, z krótkimi nagłówkami i maksymalnie 300 słowami.';
function summarizeWindow(form){
 if(!form.length)return null;
 const wins=form.filter(x=>x.result==='W').length,draws=form.filter(x=>x.result==='D').length,losses=form.filter(x=>x.result==='L').length;
 const goalsFor=form.reduce((n,x)=>n+(Number(x.gf)||0),0),goalsAgainst=form.reduce((n,x)=>n+(Number(x.ga)||0),0);
 const points=wins*3+draws,matches=form.length;
 return {matches,wins,draws,losses,points,pointsPerMatch:Number((points/matches).toFixed(2)),goalsFor,goalsAgainst,goalsForPerMatch:Number((goalsFor/matches).toFixed(2)),goalsAgainstPerMatch:Number((goalsAgainst/matches).toFixed(2)),cleanSheets:form.filter(x=>Number(x.ga)===0).length,failedToScore:form.filter(x=>Number(x.gf)===0).length,btts:form.filter(x=>Number(x.gf)>0&&Number(x.ga)>0).length,over25:form.filter(x=>(Number(x.gf)+Number(x.ga))>=3).length,goalDifference:goalsFor-goalsAgainst};
}
function summarizeForm(form){
 if(!Array.isArray(form)||!form.length)return null;
 const last5=summarizeWindow(form.slice(0,5)),last10=summarizeWindow(form.slice(0,10));
 const previous5=form.slice(5,10),previousSummary=summarizeWindow(previous5);
 const streakResult=form[0]?.result;let streak=0;for(const x of form){if(x.result!==streakResult)break;streak++;}
 const trendDelta=last5&&previousSummary?Number((last5.pointsPerMatch-previousSummary.pointsPerMatch).toFixed(2)):null;
 const trend=trendDelta===null?'brak porównywalnej próbki':trendDelta>=0.6?'wyraźna poprawa':trendDelta>=0.2?'lekka poprawa':trendDelta<=-0.6?'wyraźne pogorszenie':trendDelta<=-0.2?'lekkie pogorszenie':'stabilna forma';
 const venue=type=>summarizeWindow(form.filter(x=>x.venue===type));
 return {...last10,record:last10.wins+'W · '+last10.draws+'R · '+last10.losses+'P',last5,last10,previous5:previousSummary,trend,trendDelta,streak:{result:streakResult||null,matches:streak},home:venue('dom'),away:venue('wyjazd')};
}
function readableSeasonStats(statistics,homeName,awayName){
 if(!Array.isArray(statistics)||!statistics.length)return [];
 return statistics.map(group=>{
  const teamName=group?.team?.displayName||group?.team?.name||'Drużyna';
  const values=Array.isArray(group?.statistics)?group.statistics:[];
  const selected=values.filter(x=>/goal|assist|win|loss|draw|shot|clean|conced|possession|corner|card|save|game|match/i.test(String(x.type||''))).slice(0,12);
  if(!selected.length)return null;
  return teamName+': '+selected.map(x=>String(x.type)+': '+String(x.value??'brak')).join('; ')+'.';
 }).filter(Boolean);
}
function compactEvidence(evidence){
 const m=evidence.match,pre=m.match?.preMatch,teams={};
 for(const [side,label] of [['home','Gospodarze'],['away','Goście']]){
  const ctx=pre?.[side]||{},form=Array.isArray(ctx.form)?ctx.form:[],summary=summarizeForm(form);
  const kickoff=m.match?.date||m.match?.kickoff||m.match?.startTime;
  const restDays=form.length?daysBetween(form[0].date,kickoff):null;
  teams[side]={label,team:m.match?.[side]?.name||label,form:form.map(x=>({date:x.date,opponent:x.opponent,opponentRecord:x.opponentRecord||null,result:x.result,goalsFor:x.gf,goalsAgainst:x.ga,venue:x.venue})),summary,restDays,injuries:(ctx.injuries||[]).map(x=>({name:x.name,status:x.status})),notice:ctx.notice||null};
 }
 return {match:{home:m.match?.home?.name||m.match?.home?.displayName,away:m.match?.away?.name||m.match?.away?.displayName,league:m.match?.league,venue:m.match?.venue,kickoff:m.match?.date||m.match?.kickoff||null,prediction:m.match?.prediction||m.predictions},teams,seasonStats:readableSeasonStats(m.statistics),events:m.events||[],redCards:eventCards(m.events),lineups:(m.lineups||[]).map(g=>({team:g.team,kind:g.kind,formation:g.formation||null,players:(g.players||[]).map(p=>({name:p.name,position:p.position||null,starter:p.starter??null}))})),injuries:(m.injuries||[]).map(x=>({name:x.name,team:x.team||null,status:x.status||x.reason||null})),lineupCount:m.lineups?.length||0,injuryCount:m.injuries?.length||0,notices:pre?.notices||[],manualStatsCount:evidence.manual?.length||0};
}
function deterministicSummary(evidence){
 const m=evidence.match,compact=compactEvidence(evidence),parts=[];
 const p=compact.match.prediction;
 if(p)parts.push('Model wstępny 1/X/2: '+p.home+'/'+p.draw+'/'+p.away+'% (pewność '+(p.confidence||'nieokreślona')+', próba: '+(p.sampleHome??'?')+' meczów gospodarzy i '+(p.sampleAway??'?')+' gości).');
 for(const side of ['home','away']){
  const t=compact.teams[side],f=t.form,s=t.summary;
  if(s){
   parts.push(t.label+' — ostatnie '+s.matches+' meczów: '+s.wins+' zwycięstw, '+s.draws+' remisów, '+s.losses+' porażek; punkty/mecz '+s.pointsPerMatch+'; gole '+s.goalsFor+':'+s.goalsAgainst+' (średnio '+s.goalsForPerMatch+' strzelone i '+s.goalsAgainstPerMatch+' stracone na mecz).');
    if(s.last5&&s.last10)parts.push(t.label+' — forma 5/10: ostatnie 5: '+s.last5.pointsPerMatch+' pkt/mecz, bilans '+s.last5.goalsFor+':'+s.last5.goalsAgainst+'; ostatnie 10: '+s.last10.pointsPerMatch+' pkt/mecz, bilans '+s.last10.goalsFor+':'+s.last10.goalsAgainst+'. Trend względem poprzednich 5: '+s.trend+' ('+s.trendDelta+' pkt/mecz).');
    if(s.streak?.matches)parts.push(t.label+' — seria: '+s.streak.matches+' kolejnych '+({W:'zwycięstw',D:'remisów',L:'porażek'}[s.streak.result]||'wyników')+'.');
    if(s.home||s.away)parts.push(t.label+' — rozdział lokalizacji: u siebie '+(s.home?s.home.pointsPerMatch+' pkt/mecz, gole '+s.home.goalsFor+':'+s.home.goalsAgainst:'brak próbki')+'; na wyjeździe '+(s.away?s.away.pointsPerMatch+' pkt/mecz, gole '+s.away.goalsFor+':'+s.away.goalsAgainst:'brak próbki')+'.');
   parts.push(t.label+' — dodatkowe wskaźniki: czyste konta '+s.cleanSheets+'/'+s.matches+', bez zdobytej bramki '+s.failedToScore+'/'+s.matches+', obie drużyny strzelały '+s.btts+'/'+s.matches+', over 2.5 gola '+s.over25+'/'+s.matches+'. Trend punktowy ostatnich 3 spotkań: '+s.trend+'.');
   if(f.length)parts.push(t.label+' — wyniki chronologicznie od najnowszego: '+f.map(x=>x.result+' '+x.goalsFor+':'+x.goalsAgainst+' vs '+x.opponent+(x.venue?' ('+x.venue+')':'')).join('; ')+'.');
  }else parts.push(t.label+': brak wystarczającej historii wyników.');
  if(t.restDays!==null)parts.push(t.label+' — odpoczynek od ostatniego meczu: około '+t.restDays+' dni.');
  const records=f.filter(x=>x.opponentRecord).map(x=>x.opponent+': '+x.opponentRecord);if(records.length)parts.push(t.label+' — dostępne rekordy wcześniejszych rywali (surowe dane dostawcy): '+records.join('; ')+'.');
  if(t.injuries.length)parts.push(t.label+' — zgłoszone absencje: '+t.injuries.map(x=>x.name+' ('+x.status+')').join(', ')+'.');
  else parts.push(t.label+' — brak potwierdzonych danych o absencjach; nie oznacza to pełnego składu.');
 }
 if(compact.seasonStats.length)parts.push('Statystyki sezonowe: '+compact.seasonStats.join(' '));
 if(compact.lineupCount)parts.push('Dostępne wpisy składów: '+compact.lineupCount+'. Typ danych: '+compact.lineups.map(x=>x.kind).join(', ')+'. Kadra/roster nie jest traktowana jako potwierdzona jedenastka.');
 if(compact.injuries.length)parts.push('Absencje z danych szczegółowych: '+compact.injuries.map(x=>x.name+(x.team?' ('+x.team+')':'')+(x.status?' — '+x.status:'')).join('; ')+'.');
 if(compact.redCards.length)parts.push('Czerwone kartki wykryte w zdarzeniach tego meczu: '+compact.redCards.map(x=>(x.team||'Zespół')+(x.player?' — '+x.player:'')+(x.time?' ('+x.time+')':'')).join('; ')+'. Zdarzenia bieżącego meczu nie potwierdzają kartek w poprzednich spotkaniach.');
 if(compact.notices.length)parts.push('Ograniczenia: '+compact.notices.join(' '));
 if(evidence.manual?.length)parts.push('Dostępne są '+evidence.manual.length+' ręcznie dodane zestawy statystyk, ale ich pola wymagają weryfikacji przed użyciem.');
 if(!parts.length)parts.push('Brak wystarczających danych do rzetelnej analizy.');
 return parts.join('\n\n')+'\n\nWniosek: dane są niepełne, więc nie należy podawać wysokiej pewności. To analiza statystyczna, nie gwarancja wyniku.';
}
async function askAbacusAI(compact){
 const apiKey=process.env.ABACUS_API_KEY;
 if(!apiKey)throw new Error('Brak ABACUS_API_KEY — Abacus.AI nie jest skonfigurowany.');
 const base=(process.env.ABACUS_BASE_URL||'https://routellm.abacus.ai/v1').replace(/\/$/,'');
 const model=process.env.ABACUS_MODEL||'route-llm';
 const response=await fetch(base+'/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:systemPrompt},{role:'user',content:'Przygotuj zwięzłe podsumowanie meczu w sekcjach: forma i skuteczność, statystyki dodatkowe, absencje i skład, ocena ryzyka. Nie wymyślaj brakujących danych. Nie podawaj rekomendacji jako pewnego typu. Dane wejściowe:\n'+JSON.stringify(compact)}],temperature:0.15,max_tokens:500}),signal:AbortSignal.timeout(Number(process.env.ABACUS_TIMEOUT_MS||45000))});
 if(!response.ok){const detail=await response.text().catch(()=> '');throw new Error('Abacus.AI HTTP '+response.status+(detail?' — '+detail.slice(0,250):''));}
 const data=await response.json(),answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw new Error('Abacus.AI nie zwrócił raportu.');
 return {answer,model:data.model||model};
}
async function askLocalLLM(compact){
 if(process.env.LLM_ENABLED!=='true')throw new Error('Lokalny model AI jest wyłączony.');
 const base=(process.env.OLLAMA_BASE_URL||'http://ollama:11434').replace(/\/$/,'');
 const model=process.env.OLLAMA_MODEL||'qwen3:0.6b';
 const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:false,messages:[{role:'system',content:systemPrompt},{role:'user',content:'/no_think\nPrzygotuj raport z sekcjami: Forma i skuteczność; Statystyki dodatkowe; Absencje i skład; Ocena ryzyka. Wskaż, które dane są nieznane. Nie powtarzaj surowego JSON. Maksymalnie 300 słów:\n'+JSON.stringify(compact)}],options:{temperature:0.15,num_ctx:4096,num_predict:500,num_thread:4},keep_alive:'5m'}),signal:AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS||60000))});
 if(!response.ok)throw new Error('Ollama HTTP '+response.status);
 const data=await response.json();const answer=data.message?.content?.trim();
 if(!answer)throw new Error('Lokalny model nie zwrócił raportu.');
 return answer;
}

function poissonProbability(lambda,k){let value=Math.exp(-lambda);for(let i=1;i<=k;i++)value*=lambda/i;return value;}
function expectedGoalsModel(home,away){
 if(!home||!away||home.matches<3||away.matches<3)return {available:false,reason:'Za mało danych: potrzeba co najmniej 3 meczów każdej drużyny.'};
 const weighted=(s,key)=>{const a=s.last5?.[key],b=s.last10?.[key],base=s[key];return Number.isFinite(a)&&Number.isFinite(b)?a*.65+b*.35:Number.isFinite(base)?base:1.25;};
 const venueRate=(s,venue,key)=>{const v=s[venue];return v&&v.matches>=3?{value:v[key],matches:v.matches}:null;};
 const shrink=(value,n,prior=1.25)=>prior+(value-prior)*(n/(n+7));
 const hAtt=venueRate(home,'home','goalsForPerMatch'),hDef=venueRate(home,'home','goalsAgainstPerMatch');
 const aAtt=venueRate(away,'away','goalsForPerMatch'),aDef=venueRate(away,'away','goalsAgainstPerMatch');
 const homeAttack=shrink(hAtt?.value??weighted(home,'goalsForPerMatch'),hAtt?.matches??home.matches);
 const homeDefence=shrink(hDef?.value??weighted(home,'goalsAgainstPerMatch'),hDef?.matches??home.matches);
 const awayAttack=shrink(aAtt?.value??weighted(away,'goalsForPerMatch'),aAtt?.matches??away.matches);
 const awayDefence=shrink(aDef?.value??weighted(away,'goalsAgainstPerMatch'),aDef?.matches??away.matches);
 const lambdaHome=Math.max(.2,Math.min(3.8,(homeAttack+awayDefence)/2*1.07));
 const lambdaAway=Math.max(.2,Math.min(3.8,(awayAttack+homeDefence)/2*.93));
 const maxGoals=10,ph=Array.from({length:maxGoals+1},(_,k)=>poissonProbability(lambdaHome,k)),pa=Array.from({length:maxGoals+1},(_,k)=>poissonProbability(lambdaAway,k));
 let homeWin=0,draw=0,awayWin=0,over15=0,over25=0,over35=0,btts=0,best={score:'',probability:0};
 for(let h=0;h<=maxGoals;h++)for(let a=0;a<=maxGoals;a++){const prob=ph[h]*pa[a];if(h>a)homeWin+=prob;else if(h===a)draw+=prob;else awayWin+=prob;if(h+a>=2)over15+=prob;if(h+a>=3)over25+=prob;if(h+a>=4)over35+=prob;if(h>0&&a>0)btts+=prob;if(prob>best.probability)best={score:h+':'+a,probability:prob};}
 const sample=Math.min(home.matches,away.matches),venueUsed=!!(hAtt&&aAtt);
 const confidence=sample>=8&&venueUsed?'umiarkowana':sample>=5?'ograniczona':'niska';
 return {available:true,lambdaHome:Number(lambdaHome.toFixed(2)),lambdaAway:Number(lambdaAway.toFixed(2)),lambdaTotal:Number((lambdaHome+lambdaAway).toFixed(2)),homeWin:Number((homeWin*100).toFixed(1)),draw:Number((draw*100).toFixed(1)),awayWin:Number((awayWin*100).toFixed(1)),over15:Number((over15*100).toFixed(1)),over25:Number((over25*100).toFixed(1)),over35:Number((over35*100).toFixed(1)),btts:Number((btts*100).toFixed(1)),mostLikelyScore:best.score,scoreProbability:Number((best.probability*100).toFixed(1)),sampleHome:home.matches,sampleAway:away.matches,venueSplitUsed:venueUsed,confidence,method:'Poisson · forma 5/10 (65/35) · split dom/wyjazd przy próbie ≥3 · regresja do średniej bazowej · korekta boiska'};
}
function buildQuickReadout(compact){
 const home=compact.teams.home.summary,away=compact.teams.away.summary,goals=expectedGoalsModel(home,away);
 const labels=['1 · '+(compact.match.home||'Gospodarze'),'X · Remis','2 · '+(compact.match.away||'Goście')];
 let probabilities=goals.available?{home:goals.homeWin,draw:goals.draw,away:goals.awayWin,source:'MatchMind Poisson'}:null;
 const provider=compact.match.prediction;
 if(probabilities&&provider){const pv=[Number(provider.home),Number(provider.draw),Number(provider.away)];if(pv.every(Number.isFinite)&&pv.every(x=>x>=0&&x<=100)){const sum=pv.reduce((a,b)=>a+b,0);if(sum>0){probabilities={home:Number((probabilities.home*.8+pv[0]/sum*100*.2).toFixed(1)),draw:Number((probabilities.draw*.8+pv[1]/sum*100*.2).toFixed(1)),away:Number((probabilities.away*.8+pv[2]/sum*100*.2).toFixed(1)),source:'Poisson + 20% model dostawcy'};}}}
 const values=probabilities?[probabilities.home,probabilities.draw,probabilities.away]:null;
 let pick=null,rationale=[];
 if(values){const index=values.indexOf(Math.max(...values));pick={code:['1','X','2'][index],label:labels[index],probability:values[index],confidence:goals.confidence||'niska'};rationale.push('Szanse 1/X/2 wyliczono z rozkładu goli'+(probabilities.source==='Poisson + 20% model dostawcy'?' z niewielką korektą prognozy dostawcy.':'.'));}
 if(home&&away){if(home.pointsPerMatch>away.pointsPerMatch)rationale.push('Gospodarze zdobywali więcej punktów na mecz ('+home.pointsPerMatch+' vs '+away.pointsPerMatch+').');else if(away.pointsPerMatch>home.pointsPerMatch)rationale.push('Goście zdobywali więcej punktów na mecz ('+away.pointsPerMatch+' vs '+home.pointsPerMatch+').');}
 const stats=side=>side?{matches:side.matches,record:side.record,pointsPerMatch:side.pointsPerMatch,goals:side.goalsFor+':'+side.goalsAgainst,goalsForPerMatch:side.goalsForPerMatch,goalsAgainstPerMatch:side.goalsAgainstPerMatch,cleanSheets:side.cleanSheets,failedToScore:side.failedToScore,btts:side.btts,over25:side.over25,trend:side.trend,trendDelta:side.trendDelta,last5:side.last5,last10:side.last10,previous5:side.previous5,streak:side.streak,home:side.home,away:side.away}:null;
 return {pick,probabilities,goals,confidence:goals.confidence||'brak modelu',sampleHome:home?.matches||0,sampleAway:away?.matches||0,home:stats(home),away:stats(away),rationale,warning:!goals.available?'Próbka danych jest zbyt mała. Brak procentowej prognozy 1X2.':'Estymacje statystyczne, nie gwarancja wyniku. Model nie ma danych xG ani potwierdzonych składów, jeśli nie zostały dostarczone.'};
}
export async function analyzeMatch(matchId,extra={}){
 const model=process.env.OLLAMA_MODEL||'qwen3:0.6b',forceRefresh=extra.forceRefresh===true;
 const cacheKey='analysis:v14:'+String(matchId)+':'+model;
 const cached=await readCache(cacheKey);
 if(!forceRefresh&&cached&&cached.expires>Date.now())return {...cached.data,cached:true};
 let match,providerNotice=null;
 try{match=await getMatchBundle(matchId,{forceRefresh});}catch(error){
  if(!extra.fixture)throw error;
  providerNotice='Dostawca nie udostępnił szczegółów meczu ('+error.message+'). Wykorzystano tylko dane terminarza.';
  match={source:'ESPN/BSD',match:extra.fixture,fixture:[],statistics:[],events:[],lineups:[],players:[],injuries:[],predictions:null,live:extra.fixture.status==='LIVE'};
 }
 const manual=await getManualStats(matchId),evidence={match,manual};
 const compact=compactEvidence(evidence);
 let report,mode='statistics-only',provider=null,usedModel=null,llmNotice=providerNotice;
 if(process.env.ABACUS_API_KEY){
  try{const abacus=await askAbacusAI(compact);report=abacus.answer;mode='abacus-ai';provider='Abacus.AI';usedModel=abacus.model;}
  catch(error){
   llmNotice=[providerNotice,'Abacus.AI niedostępny: '+error.message].filter(Boolean).join(' ');
   if(process.env.LLM_ENABLED==='true'){
    try{report=await askLocalLLM(compact);mode='local-llm';provider='Ollama';usedModel=model;}
    catch(localError){report=deterministicSummary(evidence);llmNotice+='; Ollama niedostępny: '+localError.message+'. Wyświetlono analizę statystyczną.';}
   }else report=deterministicSummary(evidence);
  }
 }else if(process.env.LLM_ENABLED==='true'){
  try{report=await askLocalLLM(compact);mode='local-llm';provider='Ollama';usedModel=model;}
  catch(error){report=deterministicSummary(evidence);llmNotice=[providerNotice,'Model lokalny niedostępny: '+error.message+'. Wyświetlono analizę statystyczną.'].filter(Boolean).join(' ');}
 }else report=deterministicSummary(evidence);
 const quick=buildQuickReadout(compact);
 const result={mode,provider,model:usedModel,report,quick,llmNotice,cached:false};
 const fixture=match.match||extra.fixture||{},kickoff=fixture.date||fixture.kickoff||fixture.startTime;
 const kickoffMs=Date.parse(kickoff||'');
 const status=String(fixture.status||'NS').toUpperCase();
 if(Number.isFinite(kickoffMs)&&kickoffMs>Date.now()&&!['LIVE','FT','AET','PEN','POSTPONED','CANCELLED'].includes(status)){
  const probabilities=quick.probabilities;
  const goals=quick.goals?.available?quick.goals:null;
  if(probabilities||goals?.available){
   try{await saveForecast({matchId:String(matchId),home:fixture.home?.name||fixture.home?.displayName||'Gospodarze',away:fixture.away?.name||fixture.away?.displayName||'Goście',league:fixture.league||null,kickoff:new Date(kickoffMs).toISOString(),prediction:{probabilities,expectedGoals:goals?{home:goals.lambdaHome,away:goals.lambdaAway}:null,over25:goals?.over25??null,btts:goals?.btts??null,pick:quick.pick?.code||null}});}catch(error){console.error('Forecast history save failed:',error.message);}
  }
 }
 if(mode!=='statistics-only')await writeCache(cacheKey,result,ANALYSIS_CACHE_TTL);
 return result;
}
