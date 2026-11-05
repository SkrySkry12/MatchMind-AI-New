const records = new Map();
export async function saveManualStats(matchId, payload) {
  const entry={...payload, updatedAt:new Date().toISOString()};
  const list=records.get(String(matchId))||[];
  list.push(entry); records.set(String(matchId),list); return entry;
}
export async function getManualStats(matchId) { return records.get(String(matchId))||[]; }
