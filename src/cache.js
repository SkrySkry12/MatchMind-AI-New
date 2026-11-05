import pg from 'pg';
const {Pool}=pg;
const memory=new Map();
let pool=null,dbReady=false,writesSinceCleanup=0;
export async function initCache(){
 if(!process.env.DATABASE_URL)return false;
 pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:3000,idleTimeoutMillis:30000});
 try{
  await pool.query(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY, payload JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_cache_expiry ON api_cache(expires_at)');
  await pool.query(`CREATE TABLE IF NOT EXISTS match_forecasts (match_id TEXT PRIMARY KEY,home_team TEXT NOT NULL,away_team TEXT NOT NULL,league TEXT,kickoff TIMESTAMPTZ NOT NULL,prediction JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),status TEXT NOT NULL DEFAULT 'pending',actual_home INTEGER,actual_away INTEGER,settled_at TIMESTAMPTZ,metrics JSONB)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_match_forecasts_status_kickoff ON match_forecasts(status,kickoff)');
  await pool.query('DELETE FROM api_cache WHERE expires_at < now()');
  dbReady=true;return true;
 }catch(error){console.error('Persistent cache unavailable; using memory cache:',error.message);return false;}
}
export async function readCache(key){
 if(dbReady){try{const r=await pool.query('SELECT payload, expires_at FROM api_cache WHERE cache_key=$1',[key]);if(r.rowCount)return {data:r.rows[0].payload,expires:new Date(r.rows[0].expires_at).getTime()};}catch(e){console.error('Cache read:',e.message);}}
 return memory.get(key)||null;
}
export async function writeCache(key,data,ttlSeconds){
 const expires=Date.now()+ttlSeconds*1000;memory.set(key,{data,expires});
 if(dbReady){try{await pool.query('INSERT INTO api_cache(cache_key,payload,expires_at,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at,updated_at=now()',[key,JSON.stringify(data),new Date(expires)]);writesSinceCleanup++;if(writesSinceCleanup>=100){writesSinceCleanup=0;await pool.query('DELETE FROM api_cache WHERE expires_at < now()');}}catch(e){console.error('Cache write:',e.message);}}
}
export function cacheInfo(){return {storage:dbReady?'PostgreSQL + memory':'memory fallback',persistent:dbReady,cacheEntries:memory.size};}

const forecastMemory=new Map();
export async function saveForecast(record){
 const id=String(record.matchId);
 if(dbReady){
  const q=await pool.query(`INSERT INTO match_forecasts(match_id,home_team,away_team,league,kickoff,prediction,created_at,status)
   VALUES($1,$2,$3,$4,$5,$6::jsonb,now(),'pending')
   ON CONFLICT(match_id) DO UPDATE SET home_team=EXCLUDED.home_team,away_team=EXCLUDED.away_team,league=EXCLUDED.league,kickoff=EXCLUDED.kickoff,prediction=EXCLUDED.prediction,created_at=now()
   WHERE match_forecasts.status='pending'
   RETURNING match_id`,[id,record.home,record.away,record.league,record.kickoff,JSON.stringify(record.prediction)]);
  return q.rowCount>0;
 }
 if(!forecastMemory.has(id))forecastMemory.set(id,{...record,createdAt:new Date().toISOString(),status:'pending'});
 return true;
}
export async function listForecasts(limit=250){
 if(dbReady){
  const q=await pool.query('SELECT match_id,home_team,away_team,league,kickoff,prediction,created_at,status,actual_home,actual_away,settled_at,metrics FROM match_forecasts ORDER BY kickoff DESC LIMIT $1',[Math.max(1,Math.min(1000,Number(limit)||250))]);
  return q.rows.map(r=>({matchId:r.match_id,home:r.home_team,away:r.away_team,league:r.league,kickoff:r.kickoff,prediction:r.prediction,createdAt:r.created_at,status:r.status,actualHome:r.actual_home,actualAway:r.actual_away,settledAt:r.settled_at,metrics:r.metrics}));
 }
 return [...forecastMemory.values()].sort((a,b)=>String(b.kickoff).localeCompare(String(a.kickoff))).slice(0,limit);
}
export async function settleForecast(matchId,homeGoals,awayGoals,metrics){
 if(dbReady){const q=await pool.query("UPDATE match_forecasts SET status='settled',actual_home=$2,actual_away=$3,settled_at=now(),metrics=$4::jsonb WHERE match_id=$1 AND status='pending' RETURNING match_id",[String(matchId),homeGoals,awayGoals,JSON.stringify(metrics)]);return q.rowCount>0;}
 const row=forecastMemory.get(String(matchId));if(!row||row.status!=='pending')return false;
 Object.assign(row,{status:'settled',actualHome:homeGoals,actualAway:awayGoals,settledAt:new Date().toISOString(),metrics});return true;
}
export function forecastStorage(){return dbReady?'PostgreSQL':'pamięć tymczasowa';}
