-- Lock down all application tables exposed from the public schema.
-- The app currently accesses data through the Express API using a direct DB connection,
-- so enabling RLS here prevents accidental access through Supabase's generated API.

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opponents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_line_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_co_captains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invite_tokens ENABLE ROW LEVEL SECURITY;
