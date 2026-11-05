import {readCache,writeCache,cacheInfo} from './cache.js';

const ESPN=(process.env.ESPN_API_BASE_URL||'https://site.api.espn.com').replace(/\/$/,'');
const LEAGUES=[
 ['uefa.champions','UEFA Champions League','Europa'],['uefa.europa','UEFA Europa League','Europa'],
 ['uefa.europa.conf','UEFA Conference League','Europa'],['eng.1','Premier League','Anglia'],
 ['esp.1','La Liga','Hiszpania'],['ger.1','Bundesliga','Niemcy'],['ita.1','Serie A','Włochy'],
 ['fra.1','Ligue 1','Francja'],['ned.1','Eredivisie','Holandia'],['por.1','Primeira Liga','Portugalia'],
 ['pol.1','Ekstraklasa','Polska'],['eng.2','Championship','Anglia'],
 ['uefa.nations','UEFA Nations League','Europa'],['fifa.world','FIFA World Cup','Świat']
];
const LEAGUE_MAP=new Map(LEAGUES.map(x=>[x[0],x]));
const stats={requests:0,cacheHits:0,staleFallbacks:0,failedLeagues:[]};
const TTL={fixtures:180,details:90,team:900,squad:900};
const str=(v,f='')=>v===undefined||v===null||v===''?f:String(v);
const val=(...v)=>v.find(x=>x!==undefined&&x!==null&&x!=='');
const array=x=>Array.isArray(x)?x:[];
function dayUTC(date){
 const d=str(date,new Date().toISOString().slice(0,10));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d+'T00:00:00Z')))throw new Error('Nieprawidłowa data terminarza.');
 return d;
}
async function json(base,path,ttl,forceRefresh=false){
 const key='mm:v5:'+base+path,hit=await readCache(key);
 if(!forceRefresh&&hit&&hit.expires>Date.now()){stats.cacheHits++;return hit.data;}
 try{
  const r=await fetch(base+path,{headers:{accept:'application/json','user-agent':'MatchMind-AI/2.0'},signal:AbortSignal.timeout(9000)});
  stats.requests++;
  if(!r.ok)throw new Error('HTTP '+r.status+' ('+new URL(base).hostname+')');
  const d=await r.json();
  await writeCache(key,d,ttl);return d;
 }catch(e){if(!forceRefresh&&hit){stats.staleFallbacks++;return hit.data;}throw e;}
}
function state(s){
 const type=str(s?.type?.name||s?.type?.state||s?.type||s?.name||s?.state).toLowerCase();
 if(s?.type?.completed||/final|post|finish|complete/.test(type))return 'FT';
 if(/in|live|progress|half/.test(type))return 'LIVE';
 if(/cancel|postpon/.test(type))return 'POSTPONED';
 return 'NS';
}
function team(c){
 const t=c?.team||{};
 return {id:val(t.id,null),name:str(t.displayName||t.name||t.shortDisplayName,'Nieznana drużyna'),logo:str(t.logo||t.logos?.[0]?.href),slug:str(t.abbreviation||t.slug)};
}
function eventToMatch(e,league){
 const c=e.competitions?.[0]||{},parts=array(c.competitors);
 const home=parts.find(x=>x.homeAway==='home'),away=parts.find(x=>x.homeAway==='away');
 if(!e.id||!home||!away)return null;
 const when=val(c.date,e.date);
 if(!when||Number.isNaN(Date.parse(when)))return null;
 const l=LEAGUE_MAP.get(league)||[league,league,'Rozgrywki'];
 const id='espn:'+league+':'+str(e.id);
 return {id,slug:id,date:new Date(when).toISOString(),league:l[1],leagueId:league,country:l[2],
  round:str(e.week?.text||e.season?.type?.name||''),status:state(e.status||c.status),
  statusText:str(e.status?.type?.description||c.status?.type?.description),
  home:team(home),away:team(away),venue:str(c.venue?.fullName),
  elapsed:val(e.status?.displayClock,null),
  score:{home:home.score==null?null:Number(home.score),away:away.score==null?null:Number(away.score)},
  prediction:null,source:'ESPN'};
}

function scoreNumber(score){
 const raw=score&&typeof score==='object'?val(score.value,score.displayValue,score.score):score;
 if(raw===null||raw===undefined||raw==='')return null;
 const n=Number(raw);return Number.isFinite(n)?n:null;
}
function resultForTeam(event,teamId){
 const comp=event.competitions?.[0]||{},cs=array(comp.competitors);
 const own=cs.find(x=>String(x.team?.id)===String(teamId)),opp=cs.find(x=>String(x.team?.id)!==String(teamId));
 const status=event.status||comp.status;
 const completed=Boolean(status?.type?.completed)||state(status)==='FT';
 if(!own||!opp||!completed)return null;
 const gf=scoreNumber(own.score),ga=scoreNumber(opp.score);
 if(gf===null||ga===null)return null;
 const opponentRecord=val(opp.records?.find(r=>r.type==='total')?.summary,opp.records?.[0]?.summary,opp.record?.summary,opp.record,null);
 return {date:val(comp.date,event.date),opponent:opp.team?.displayName||opp.team?.name||'Rywal',opponentRecord:opponentRecord==null?null:String(opponentRecord),gf,ga,result:gf>ga?'W':gf===ga?'D':'L',venue:own.homeAway==='home'?'dom':own.homeAway==='away'?'wyjazd':'nieznane'};
}
function poisson(lambda,k){let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p;}
function estimateProbabilities(h,a){
 // Nie generuj procentów z domyślnych średnich, jeśli historia nie jest dostępna.
 // Minimum 3 zakończone mecze każdej drużyny ogranicza pozorne 50/50 bez danych.
 if(h.length<3||a.length<3)return null;
 const avg=(xs,k)=>xs.reduce((s,x)=>s+x[k],0)/xs.length;
 const hx=Math.max(.2,Math.min(3.8,(avg(h,'gf')+avg(a,'ga'))/2+.18));
 const ax=Math.max(.2,Math.min(3.5,(avg(a,'gf')+avg(h,'ga'))/2-.08));
 let home=0,draw=0,away=0;
 for(let x=0;x<=8;x++)for(let y=0;y<=8;y++){const p=poisson(hx,x)*poisson(ax,y);if(x>y)home+=p;else if(x===y)draw+=p;else away+=p;}
 const t=home+draw+away,n=Math.min(h.length,5)+Math.min(a.length,5);
 return {home:Math.round(home/t*100),draw:Math.round(draw/t*100),away:Math.round(away/t*100),source:'Model statystyczny MatchMind',confidence:n>=8?'średnia':'niska',sampleHome:h.length,sampleAway:a.length,expectedGoals:{home:Number(hx.toFixed(2)),away:Number(ax.toFixed(2))}};
}
const teamPromises=new Map();
async function teamContext(league,teamId,includeInjuries=false,forceRefresh=false){
 if(!teamId)return {form:[],injuries:[],notice:'Brak ID drużyny.'};
 const promiseKey=league+':'+teamId+':'+includeInjuries+(forceRefresh?':fresh':'');if(teamPromises.has(promiseKey))return teamPromises.get(promiseKey);
 const promise=(async()=>{
 const base='/apis/site/v2/sports/soccer/'+league+'/teams/'+encodeURIComponent(teamId);
 const [schedule,injuryData]=await Promise.all([
  json(ESPN,base+'/schedule',TTL.team,forceRefresh).catch(()=>null),
  includeInjuries?json(ESPN,base+'/injuries',TTL.team,forceRefresh).catch(()=>null):Promise.resolve(null)
 ]);
 const events=array(schedule?.events||schedule?.season?.events||schedule?.data?.events||schedule?.schedule?.events||schedule?.team?.events);
 const form=events.map(e=>resultForTeam(e,teamId)).filter(Boolean).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10);
 const injuries=array(injuryData?.items||injuryData?.injuries||injuryData?.athletes||injuryData?.data).map(x=>({
  name:x.athlete?.displayName||x.athlete?.fullName||x.displayName||x.name||'Zawodnik',
  status:x.status||x.type||x.details||'Status nieznany'
 })).slice(0,12);
 return {form,injuries,notice:!schedule?'Nie udało się pobrać terminarza drużyny.':form.length<3?'ESPN zwrócił terminarz, ale po odczytaniu wyników dostępnych jest tylko '+form.length+' zakończonych spotkań.':includeInjuries&&!injuryData?'Brak raportu kontuzji od dostawcy.':null};
 })();teamPromises.set(promiseKey,promise);try{return await promise;}finally{teamPromises.delete(promiseKey);}
}
async function enrichFixture(f,forceRefresh=false){
 const [h,a]=await Promise.all([teamContext(f.leagueId,f.home.id,false,forceRefresh),teamContext(f.leagueId,f.away.id,false,forceRefresh)]);
 return {...f,prediction:estimateProbabilities(h.form,a.form),preMatch:{home:h,away:a,notices:[h.notice,a.notice].filter(Boolean)}};
}
async function espnFixtures(day){
 const date=day.replace(/-/g,''),failed=[],settled=await Promise.allSettled(LEAGUES.map(async ([league])=>{
  const data=await json(ESPN,'/apis/site/v2/sports/soccer/'+league+'/scoreboard?dates='+date+'&limit=250',TTL.fixtures);
  if(!Array.isArray(data.events))throw new Error('Nieprawidłowa odpowiedź terminarza '+league);
  return data.events.map(e=>eventToMatch(e,league)).filter(Boolean);
 }));
 const byId=new Map();
 settled.forEach((s,i)=>{if(s.status==='fulfilled'){for(const m of s.value)byId.set(m.id,m);}else failed.push(LEAGUES[i][0]);});
 stats.failedLeagues=failed;
 return {fixtures:[...byId.values()].sort((a,b)=>a.date.localeCompare(b.date)),success:LEAGUES.length-failed.length,failed};
}

const BSD='https://sports.bzzoiro.com';
const BSD_LEAGUE_ID=25;
function bsdTeam(raw){
 const t=raw?.team||raw||{};
 return {id:val(t.id,t.team_id,null),name:str(t.name||t.display_name||t.displayName||t.short_name,'Nieznana drużyna'),logo:str(t.logo||t.logo_url||t.badge),slug:str(t.short_name||t.abbreviation||'')};
}
function bsdStatus(raw){
 const s=str(raw?.status?.name||raw?.status?.short||raw?.status||raw?.state||'upcoming').toLowerCase();
 if(/live|in.?play/.test(s))return 'LIVE';
 if(/finish|complete|ended/.test(s))return 'FT';
 if(/postpon/.test(s))return 'POSTPONED';
 if(/cancel|abandon/.test(s))return 'CANCELLED';
 return 'NS';
}
function bsdEventToMatch(e){
 const home=bsdTeam(e.home_team||e.home||e.homeTeam||e.teams?.home||e.competitors?.find(x=>x.home_away==='home'||x.homeAway==='home'));
 const away=bsdTeam(e.away_team||e.away||e.awayTeam||e.teams?.away||e.competitors?.find(x=>x.home_away==='away'||x.homeAway==='away'));
 const when=val(e.kickoff_at,e.start_time,e.date,e.match_date,e.datetime,e.utc_date);
 const id=val(e.id,e.event_id);
 if(!id||!when||!home.name||!away.name||Number.isNaN(Date.parse(when)))return null;
 const score=e.score||{},hs=val(score.home,e.home_score,e.home_goals),as=val(score.away,e.away_score,e.away_goals);
 const status=bsdStatus(e);
 return {id:'bsd:'+String(id),slug:'bsd:'+String(id),date:new Date(when).toISOString(),league:'Ekstraklasa',leagueId:'pol.1',country:'Polska',round:str(e.round_label||e.round_name||e.round||e.matchday||''),status,statusText:str(e.status_display||e.status?.label||e.status||''),home,away,venue:str(e.venue?.name||e.venue_name||e.stadium||''),elapsed:val(e.current_minute,e.minute,null),score:{home:hs==null?null:Number(hs),away:as==null?null:Number(as)},prediction:null,source:'BSD',providerEventId:String(id)};
}
async function bsdJson(path,ttl=TTL.fixtures,forceRefresh=false){
 const token=process.env.BSD_API_TOKEN;
 if(!token)throw new Error('Brak BSD_API_TOKEN w konfiguracji serwera.');
 const key='mm:bsd:v1:'+path,hit=await readCache(key);
 if(!forceRefresh&&hit&&hit.expires>Date.now()){stats.cacheHits++;return hit.data;}
 try{
  const response=await fetch(BSD+path,{headers:{accept:'application/json',authorization:'Token '+token},signal:AbortSignal.timeout(12000)});
  stats.requests++;
  if(!response.ok)throw new Error(response.status===401?'BSD odrzucił token (401). Sprawdź BSD_API_TOKEN w Coolify.':'BSD API HTTP '+response.status);
  const data=await response.json();await writeCache(key,data,ttl);return data;
 }catch(error){if(!forceRefresh&&hit){stats.staleFallbacks++;return hit.data;}throw error;}
}
async function bsdFixtures(day){
 if(!process.env.BSD_API_TOKEN)return {fixtures:[],notice:null};
 const query=new URLSearchParams({league_id:String(BSD_LEAGUE_ID),date_from:day,date_to:day,limit:'200'});
 try{
  const data=await bsdJson('/api/v2/events/?'+query.toString(),TTL.fixtures);
  const rows=array(data.results||data.events||data.items||data.data);
  return {fixtures:rows.map(bsdEventToMatch).filter(Boolean),notice:null};
 }catch(error){return {fixtures:[],notice:'BSD: '+error.message};}
}
function bsdPlayers(raw){
 const groups=[];
 const container=raw?.data||raw?.lineups&&!Array.isArray(raw.lineups)?(raw.data||raw.lineups):raw;
 const sources=Array.isArray(container?.lineups)?container.lineups:[container?.home,container?.away,container?.home_team,container?.away_team].filter(Boolean);
 for(const [index,g] of sources.entries()){
  const teamName=str(g.team?.name||g.team_name||g.name|| (index===0?'Gospodarze':'Goście'));
  const xi=array(g.starting_xi||g.startingXI||g.starting||g.players||g.lineup);
  const bench=array(g.substitutes||g.bench||g.subs);
  const mapPlayer=(p,starter)=>({name:str(p.player?.name||p.name||p.full_name||p.player_name,''),number:val(p.shirt_number,p.jersey_number,p.number,p.shirt,null),position:str(p.position?.name||p.position_name||p.position||''),starter});
  const players=[...xi.map(p=>mapPlayer(p,true)),...bench.map(p=>mapPlayer(p,false))].filter(p=>p.name);
  if(players.length)groups.push({team:teamName,formation:str(g.formation||g.formation_name||''),players,kind:(raw.lineup_status||container.lineup_status)==='predicted'||g.lineup_status==='predicted'?'predicted':'lineup'});
 }
 return groups;
}
async function bsdBundle(id,forceRefresh=false){
 const match=/^bsd:(\d+)$/.exec(id);
 if(!match)throw new Error('Nieprawidłowy identyfikator meczu BSD.');
 const eventId=match[1];
 const [detail,lineupData]=await Promise.all([
  bsdJson('/api/v2/events/'+eventId+'/',TTL.details,forceRefresh),
  bsdJson('/api/v2/events/'+eventId+'/lineups/',TTL.squad,forceRefresh).catch(()=>null)
 ]);
 const fixture=bsdEventToMatch({...detail,id:eventId});
 if(!fixture)throw new Error('BSD nie zwrócił danych drużyn lub daty spotkania.');
 const lineups=bsdPlayers(lineupData||detail.lineups||{});
 const unavailable=detail.unavailable_players||lineupData?.unavailable_players||[];
 const injuries=array(unavailable).flatMap(group=>{
  const teamName=str(group.team?.name||group.team_name||group.team||'');
  return array(group.players||group.athletes||group.unavailable_players).map(p=>({name:str(p.name||p.player?.name||p.full_name,'Zawodnik'),team:teamName,status:str(p.status||p.reason||p.type,'Niedostępny')}));
 });
 const status=fixture.status;
 return {source:'BSD',fixture:[{fixture:{status:{short:status,long:fixture.statusText}},goals:fixture.score,teams:{home:fixture.home,away:fixture.away}}],match:fixture,statistics:[],events:[],lineups,squadKind:lineups.some(g=>g.kind==='lineup')?'lineup':lineups.length?'predicted':null,players:[],injuries,predictions:null,live:status==='LIVE',refreshAfterSeconds:status==='LIVE'?30:null,attribution:{label:'BSD · Bzzoiro Sports Data',url:'https://sports.bzzoiro.com/leagues/25/'}};
}

export async function getFixtures(date){
 const day=dayUTC(date),[primary,bsd]=await Promise.all([espnFixtures(day),bsdFixtures(day)]);
 if(primary.success===0&&!bsd.fixtures.length)throw new Error('ESPN ani BSD nie zwróciły terminarza dla wybranej daty. Spróbuj ponownie później.');
 const notice=[primary.failed.length?'Nie udało się pobrać części rozgrywek: '+primary.failed.join(', ')+'.':null,bsd.notice].filter(Boolean).join(' ')||null;
 const espnPoland=primary.fixtures.filter(f=>f.leagueId==='pol.1');\n // Prefer BSD for Ekstraklasa, but keep ESPN as a fallback when BSD is empty/unavailable.\n const polishFixtures=bsd.fixtures.length?bsd.fixtures:espnPoland;\n const combined=[...primary.fixtures.filter(f=>f.leagueId!=='pol.1'),...polishFixtures];
 const enriched=await Promise.all(combined.map(f=>f.source==='BSD'?f:enrichFixture(f).catch(()=>({...f,prediction:null,preMatch:null}))));
 return {source:'ESPN + BSD',fixtures:enriched,updated:new Date().toISOString(),notice,failedLeagues:primary.failed,
  attribution:{label:'ESPN',url:'https://www.espn.com/soccer/'}};
}
function detailTeams(data,fixture){
 const comps=array(data?.header?.competitions),c=comps[0]||{};
 return array(c.competitors).length?c.competitors:array(data?.boxscore?.teams).map(t=>({team:t.team,homeAway:t.homeAway,score:t.score}));
}
function statsFromBox(data){
 return array(data?.boxscore?.players).length||array(data?.boxscore?.teams).length
  ?array(data?.boxscore?.teams).map(t=>({team:t.team,statistics:array(t.statistics).map(s=>({type:s.label||s.name||s.abbreviation,value:val(s.displayValue,s.value,'—')}))}))
  :[];
}
function eventsFromSummary(data){
 const raw=array(data?.details).length?data.details:array(data?.scoringPlays).length?data.scoringPlays:array(data?.plays);
 return raw.map(e=>({type:str(e.type?.text||e.type?.name||e.type),detail:str(e.text||e.description||e.shortText),
  time:{elapsed:val(e.clock?.displayValue,e.clock?.value,e.time?.elapsed,'?')},team:{name:str(e.team?.displayName||e.team?.name)},
  player:{name:str(e.athletesInvolved?.[0]?.displayName||e.player?.displayName)}}));
}
function espnPlayer(p){
 const athlete=p.athlete||p.player||p;
 const name=str(athlete.displayName||athlete.fullName||athlete.name||p.displayName||p.name,'');
 if(!name)return null;
 const pos=p.position?.displayName||p.position?.name||p.position||athlete.position?.displayName||athlete.position?.name||'';
 const starter=p.starter===true||p.isStarter===true?true:p.starter===false||p.isStarter===false?false:null;
 return {name,number:val(p.jersey,p.jerseyNumber,p.number,athlete.jersey,null),position:str(pos),starter};
}
function espnRosterGroups(raw,homeName,awayName){
 const groups=[];
 const entries=array(raw?.rosters||raw?.lineups||raw?.boxscore?.players);
 for(const entry of entries){
  const teamName=str(entry.team?.displayName||entry.team?.name||entry.displayName||entry.name);
  const athletes=array(entry.roster||entry.players||entry.athletes||entry.statistics?.[0]?.athletes);
  const players=athletes.map(espnPlayer).filter(Boolean);
  if(players.length)groups.push({team:teamName||'Drużyna',formation:str(entry.formation?.displayName||entry.formation?.name||entry.formation),players,kind:players.some(p=>p.starter!==null)?'lineup':'roster'});
 }
 if(groups.length===1&&groups[0].players.length){
  const all=groups[0].players,home=all.filter(p=>p.team==='home'),away=all.filter(p=>p.team==='away');
  if(home.length&&away.length)return [{team:homeName,players:home,kind:'lineup'},{team:awayName,players:away,kind:'lineup'}];
 }
 return groups;
}
async function teamRoster(league,teamId,forceRefresh=false){
 const data=await json(ESPN,'/apis/site/v2/sports/soccer/'+league+'/teams/'+encodeURIComponent(teamId)+'/roster',TTL.squad,forceRefresh);
 const athletes=array(data?.athletes||data?.roster||data?.players||data?.items);
 const players=athletes.flatMap(group=>array(group.items||group.athletes||group.roster).length?array(group.items||group.athletes||group.roster):[group]).map(espnPlayer).filter(Boolean);
 return players;
}
async function espnBundle(id,forceRefresh=false){
 const match=/^espn:([a-z0-9._-]+):(\d+)$/.exec(id);
 if(!match||!LEAGUE_MAP.has(match[1]))throw new Error('Nieprawidłowy identyfikator meczu ESPN.');
 const [,league,event]=match;
 const d=await json(ESPN,'/apis/site/v2/sports/soccer/'+league+'/summary?event='+event,TTL.details,forceRefresh);
 const header=d.header||{},competition=header.competitions?.[0]||{},raw={
  id:event,date:competition.date||header.date,
  competitions:[{...competition,competitors:detailTeams(d)}],
  status:competition.status||header.status
 };
 const mapped=eventToMatch(raw,league);
 if(!mapped)throw new Error('ESPN nie zwrócił zespołów lub daty spotkania.');
 const statistics=statsFromBox(d),events=eventsFromSummary(d);
 let lineups=espnRosterGroups(d,mapped.home.name,mapped.away.name),squadKind=lineups.some(g=>g.kind==='lineup')?'lineup':lineups.length?'roster':null;
 const [homeContext,awayContext]=await Promise.all([teamContext(league,mapped.home.id,true,forceRefresh),teamContext(league,mapped.away.id,true,forceRefresh)]);
 if(lineups.length<2){
  const rosters=await Promise.all([teamRoster(league,mapped.home.id,forceRefresh).catch(()=>[]),teamRoster(league,mapped.away.id,forceRefresh).catch(()=>[])]);
  for(const [index,teamName] of [mapped.home.name,mapped.away.name].entries()){
   if(lineups.some(g=>String(g.team||'').toLowerCase()===teamName.toLowerCase()))continue;
   if(rosters[index].length)lineups.push({team:teamName,players:rosters[index],kind:'roster'});
  }
  if(lineups.length)squadKind=lineups.some(g=>g.kind==='lineup')?'lineup':'roster';
 }
 const injuries=[...homeContext.injuries.map(x=>({...x,team:mapped.home.name})),...awayContext.injuries.map(x=>({...x,team:mapped.away.name}))];
 const prediction=estimateProbabilities(homeContext.form,awayContext.form);
 return {source:'ESPN',fixture:[{fixture:{status:{short:mapped.status,long:mapped.statusText}},goals:mapped.score,teams:{home:mapped.home,away:mapped.away}}],
  match:{...mapped,prediction,preMatch:{home:homeContext,away:awayContext,notices:[homeContext.notice,awayContext.notice].filter(Boolean)}},statistics,events,lineups,squadKind,players:[],injuries,predictions:prediction,live:mapped.status==='LIVE',
  refreshAfterSeconds:mapped.status==='LIVE'?30:null,attribution:{label:'ESPN',url:'https://www.espn.com/soccer/'}};
}
export async function getMatchBundle(id,options={}){
 const key=str(id).trim(),forceRefresh=options.forceRefresh===true;
 if(key.startsWith('espn:'))return espnBundle(key,forceRefresh);
 if(key.startsWith('bsd:'))return bsdBundle(key,forceRefresh);
 throw new Error('Nieznany identyfikator meczu. Odśwież terminarz.');
}
export async function getFixtureStats(id){
 const bundle=await getMatchBundle(id);
 return {source:bundle.source,stats:bundle.statistics,events:bundle.events};
}
export function getApiUsage(){
 return {...stats,...cacheInfo(),configured:true,provider:'ESPN',
  remaining:null,limit:'Źródła publiczne; dostępność zależy od dostawcy'};
}
