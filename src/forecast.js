import {listForecasts,settleForecast,forecastStorage} from './cache.js';
import {getMatchBundle} from './sports.js';

const scoreStatus=b=>String(b?.fixture?.[0]?.fixture?.status?.short||b?.match?.status||'').toUpperCase();
const finalStatus=s=>['FT','AET','PEN','FINAL','FINISHED'].includes(s);
let lastSettlementCheck=0;
function outcome(home,away){return home>away?'home':home===away?'draw':'away';}
function scoreForecast(prediction,home,away){
 const actual=outcome(home,away),p=prediction.probabilities;
 let brier=null,logLoss=null,pickHit=null;
 if(p&&['home','draw','away'].every(k=>Number.isFinite(Number(p[k])))){
  const probs=['home','draw','away'].map(k=>Math.max(.0001,Math.min(.9999,Number(p[k])/100)));
  const total=probs.reduce((a,b)=>a+b,0),normalized=probs.map(x=>x/total),target=['home','draw','away'].map(k=>k===actual?1:0);
  brier=Number((normalized.reduce((s,x,i)=>s+(x-target[i])**2,0)/3).toFixed(5));
  logLoss=Number((-Math.log(normalized[['home','draw','away'].indexOf(actual)])).toFixed(5));
  pickHit=['home','draw','away'][normalized.indexOf(Math.max(...normalized))]===actual;
 }
 const totalGoals=home+away,expected=prediction.expectedGoals;
 return {actual,pickHit,brier,logLoss,over25Hit:prediction.over25!=null&&Number.isFinite(Number(prediction.over25))?((Number(prediction.over25)>=50)===(totalGoals>=3)):null,bttsHit:prediction.btts!=null&&Number.isFinite(Number(prediction.btts))?((Number(prediction.btts)>=50)===(home>0&&away>0)):null,goalsMae:expected&&Number.isFinite(expected.home)&&Number.isFinite(expected.away)?Number(((Math.abs(expected.home-home)+Math.abs(expected.away-away))/2).toFixed(3)):null};
}
export async function collectForecastMetrics(){
 const rows=await listForecasts(500);
 const pending=rows.filter(x=>x.status==='pending'&&new Date(x.kickoff).getTime()<=Date.now()&&Date.now()-new Date(x.kickoff).getTime()<14*86400000);
 let settledNow=0;
 if(Date.now()-lastSettlementCheck>120000){
  lastSettlementCheck=Date.now();
  await Promise.all(pending.slice(0,5).map(async row=>{
  try{
   const bundle=await getMatchBundle(row.matchId);
   if(!finalStatus(scoreStatus(bundle)))return;
   const goals=bundle.fixture?.[0]?.goals||bundle.match?.score||{};
   const home=Number(goals.home),away=Number(goals.away);
   if(!Number.isInteger(home)||!Number.isInteger(away))return;
   const metrics=scoreForecast(row.prediction,home,away);
   if(await settleForecast(row.matchId,home,away,metrics))settledNow++;
  }catch{}
  }));
 }
 const all=await listForecasts(1000),settled=all.filter(x=>x.status==='settled'),pendingCount=all.filter(x=>x.status==='pending').length;
 const avg=key=>{const xs=settled.map(x=>x.metrics?.[key]).filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number);return xs.length?Number((xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(4)):null;};
 const hits=key=>{const xs=settled.map(x=>x.metrics?.[key]).filter(x=>typeof x==='boolean');return xs.length?{hit:xs.filter(Boolean).length,total:xs.length,rate:Number((xs.filter(Boolean).length/xs.length*100).toFixed(1))}:null;};
 const scored=settled.filter(x=>typeof x.metrics?.pickHit==='boolean');
 const calibration=Array.from({length:5},(_,i)=>{const min=i*.2,max=(i+1)*.2;const bucket=settled.filter(x=>{const p=x.prediction?.probabilities;if(!p)return false;const top=Math.max(Number(p.home),Number(p.draw),Number(p.away))/100;return top>=min&&(i===4?top<=1:top<max);});return {range:Math.round(min*100)+'–'+Math.round(max*100)+'%',count:bucket.length,accuracy:bucket.length?Number((bucket.filter(x=>x.metrics?.pickHit).length/bucket.length*100).toFixed(1)):null,confidence:bucket.length?Number((bucket.reduce((s,x)=>s+Math.max(Number(x.prediction.probabilities.home),Number(x.prediction.probabilities.draw),Number(x.prediction.probabilities.away))/100,0)/bucket.length*100).toFixed(1)):null};});
 return {storage:forecastStorage(),total:all.length,settled:settled.length,pending:pendingCount,settledNow,accuracy:scored.length?{hit:scored.filter(x=>x.metrics.pickHit).length,total:scored.length,rate:Number((scored.filter(x=>x.metrics.pickHit).length/scored.length*100).toFixed(1))}:null,brier:avg('brier'),logLoss:avg('logLoss'),expectedGoalsMae:avg('goalsMae'),over25:hits('over25Hit'),btts:hits('bttsHit'),calibration,history:all.slice(0,100)};
}
