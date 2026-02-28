import React, { createContext, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Players from './pages/Players';
import Schedule from './pages/Schedule';
import MatchDetail from './pages/MatchDetail';
import Seasons from './pages/Seasons';
import PlayerRecord from './pages/PlayerRecord';
import AvailabilityPublic from './pages/AvailabilityPublic';
import Teams from './pages/Teams';
import Login from './pages/Login';
import { teams as teamsApi } from './api';
import { supabase } from './lib/supabase';

export const TeamContext = createContext({ activeTeam: null, setActiveTeam: () => {}, teams: [] });

const LS_KEY = 'tennis_active_team_id';

function TeamSelector({ teams, activeTeam, setActiveTeam }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (team) => {
    setActiveTeam(team);
    localStorage.setItem(LS_KEY, team ? team.id : '');
    setOpen(false);
  };

  const activeTeams = teams.filter(t => t.active);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 8, padding: '5px 12px', color: 'white', cursor: 'pointer',
          fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'nowrap'
        }}
      >
        {activeTeam ? activeTeam.name : 'All Teams'}
        <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 1000,
          background: 'white', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          minWidth: 180, overflow: 'hidden', border: '1px solid #e2e8f0'
        }}>
          <div
            onClick={() => select(null)}
            style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
              gap: 8, fontSize: '0.9rem', color: '#2d3748',
              background: !activeTeam ? '#ebf8ff' : 'white',
              fontWeight: !activeTeam ? 600 : 400
            }}
          >
            All Teams {!activeTeam && '✓'}
          </div>
          {activeTeams.length > 0 && (
            <div style={{ borderTop: '1px solid #e2e8f0' }}>
              {activeTeams.map(t => (
                <div
                  key={t.id}
                  onClick={() => select(t)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    gap: 8, fontSize: '0.9rem', color: '#2d3748',
                    background: activeTeam?.id === t.id ? '#ebf8ff' : 'white',
                    fontWeight: activeTeam?.id === t.id ? 600 : 400
                  }}
                >
                  {t.name} {activeTeam?.id === t.id && '✓'}
                </div>
              ))}
            </div>
          )}
          <div style={{ borderTop: '1px solid #e2e8f0' }}>
            <div
              onClick={() => { setOpen(false); navigate('/teams'); }}
              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.85rem', color: '#4a90d9' }}
            >
              Manage Teams →
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Nav({ teams, activeTeam, setActiveTeam, userEmail, onLogout }) {
  const loc = useLocation();
  const isPublic = loc.pathname.startsWith('/availability/match/');
  if (isPublic) return null;

  return (
    <nav className="nav">
      <NavLink to="/" className="nav-brand">
        <span className="nav-brand-icon">🎾</span>
        Tennis Scheduler
      </NavLink>
      <TeamSelector teams={teams} activeTeam={activeTeam} setActiveTeam={setActiveTeam} />
      <div className="nav-tabs">
        <NavLink to="/" end className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Schedule</NavLink>
        <NavLink to="/players" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Players</NavLink>
        <NavLink to="/seasons" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Seasons</NavLink>
        <NavLink to="/teams" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Teams</NavLink>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
        {userEmail && (
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userEmail}
          </span>
        )}
        <button
          onClick={onLogout}
          style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8, padding: '5px 12px', color: 'white', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 500
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [teamList, setTeamList] = useState([]);
  const [activeTeam, setActiveTeamState] = useState(null);

  // Bootstrap auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
      if (!session) {
        setTeamList([]);
        setActiveTeamState(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load teams when authenticated
  useEffect(() => {
    if (!session) return;
    teamsApi.list().then(data => {
      setTeamList(data);
      const savedId = localStorage.getItem(LS_KEY);
      if (savedId) {
        const found = data.find(t => t.id === parseInt(savedId) && t.active);
        if (found) setActiveTeamState(found);
      }
    }).catch(() => {});
  }, [session]);

  const setActiveTeam = (team) => {
    setActiveTeamState(team);
    localStorage.setItem(LS_KEY, team ? team.id : '');
  };

  const refreshTeams = () => {
    teamsApi.list().then(data => {
      setTeamList(data);
      if (activeTeam) {
        const updated = data.find(t => t.id === activeTeam.id);
        if (updated) setActiveTeamState(updated);
        else setActiveTeamState(null);
      }
    }).catch(() => {});
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(LS_KEY);
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7fafc' }}>
        <div style={{ color: '#718096', fontSize: '1rem' }}>Loading…</div>
      </div>
    );
  }

  // Public availability pages skip auth entirely — handle before session check
  const isPublicPath = window.location.pathname.startsWith('/availability/match/');

  if (!session && !isPublicPath) {
    return <Login />;
  }

  return (
    <TeamContext.Provider value={{ activeTeam, setActiveTeam, teams: teamList, refreshTeams }}>
      <BrowserRouter>
        <div className="app">
          <Nav
            teams={teamList}
            activeTeam={activeTeam}
            setActiveTeam={setActiveTeam}
            userEmail={session?.user?.email}
            onLogout={handleLogout}
          />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Schedule />} />
              <Route path="/players" element={<Players />} />
              <Route path="/players/:id" element={<PlayerRecord />} />
              <Route path="/seasons" element={<Seasons />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/matches/:id" element={<MatchDetail />} />
              <Route path="/availability/match/:matchId" element={<AvailabilityPublic />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </TeamContext.Provider>
  );
}
