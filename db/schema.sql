CREATE TABLE IF NOT EXISTS matches (id BIGINT PRIMARY KEY, league_id BIGINT, kickoff TIMESTAMPTZ NOT NULL, home_team TEXT NOT NULL, away_team TEXT NOT NULL, status TEXT, source TEXT NOT NULL DEFAULT 'api-football', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS team_statistics (id BIGSERIAL PRIMARY KEY, match_id BIGINT REFERENCES matches(id) ON DELETE CASCADE, team_name TEXT NOT NULL, sample_size INTEGER NOT NULL CHECK(sample_size>0), stats JSONB NOT NULL, source TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff);
CREATE INDEX IF NOT EXISTS idx_team_statistics_match ON team_statistics(match_id);
