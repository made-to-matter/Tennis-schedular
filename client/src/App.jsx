import React, { createContext, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Players from './pages/Players';
import Schedule from './pages/Schedule';
import MatchDetail from './pages/MatchDetail';
import PlayerRecord from './pages/PlayerRecord';
import AvailabilityPublic from './pages/AvailabilityPublic';
import Teams from './pages/Teams';
import Login from './pages/Login';
import { teams as teamsApi, seasons as seasonsApi } from './api';
import { supabase } from './lib/supabase';

export const TeamContext = createContext({
  activeTeam: null, setActiveTeam: () => {}, teams: [],
  activeSeason: null, setActiveSeason: () => {}, teamSeasons: [],
  refreshTeams: () => {},
});

const LS_KEY = 'tennis_active_team_id';

function TeamSelector({ teams, activeTeam, setActiveTeam, teamSeasons, activeSeason, setActiveSeason }) {
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
        className="team-selector-btn"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 8, padding: '5px 12px', color: 'white', cursor: 'pointer',
          fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        <span className="team-label-full">{activeTeam ? activeTeam.name : 'All Teams'}</span>
        <span className="team-label-short">{activeTeam ? activeTeam.name.split(' ')[0] : 'Teams'}</span>
        {activeSeason && (
          <span style={{
            background: 'rgba(255,255,255,0.2)', borderRadius: 9999,
            padding: '1px 7px', fontSize: '0.72rem', fontWeight: 500, marginLeft: 2,
          }}>
            {activeSeason.name}
          </span>
        )}
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
          {activeTeam && teamSeasons.length > 0 && (
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 14px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a0aec0', marginBottom: 8 }}>
                Season
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {teamSeasons.map(s => {
                  const isActive = activeSeason?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setActiveSeason(s); setOpen(false); }}
                      style={{
                        padding: '5px 12px', borderRadius: 9999,
                        border: `1.5px solid ${isActive ? '#1a5276' : '#e2e8f0'}`,
                        background: isActive ? '#1a5276' : 'white',
                        color: isActive ? 'white' : '#4a5568',
                        fontSize: '0.85rem', fontWeight: isActive ? 600 : 400,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
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

function ProfileMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(user?.user_metadata?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    const updates = { data: { full_name: name } };
    if (email !== user?.email) updates.email = email;
    if (password) updates.password = password;
    const { error } = await supabase.auth.updateUser(updates);
    setSaving(false);
    if (error) setMsg({ type: 'error', text: error.message });
    else { setMsg({ type: 'ok', text: 'Saved.' }); setPassword(''); }
  };

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0] || '?').toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Profile"
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.35)',
          color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {initials}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1000,
          background: 'white', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0', width: 260, padding: '16px',
        }}>
          {/* Greeting header */}
          <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#2d3748' }}>
              Coach {name.split(' ').filter(Boolean).slice(-1)[0] || user?.email?.split('@')[0] || '—'}
            </div>
          </div>

          {/* Edit profile toggle */}
          <button
            onClick={() => { setEditOpen(o => !o); setMsg(null); }}
            style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 0 10px', fontSize: '0.875rem', color: '#4a90d9',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: editOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            Edit profile
          </button>

          {editOpen && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a0aec0', marginBottom: 4 }}>Display Name</div>
                <input
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a0aec0', marginBottom: 4 }}>Email</div>
                <input
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a0aec0', marginBottom: 4 }}>New Password</div>
                <input
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>

              {msg && (
                <div style={{ fontSize: '0.8rem', marginBottom: 10, color: msg.type === 'error' ? '#e53e3e' : '#38a169' }}>
                  {msg.text}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  width: '100%', padding: '8px', borderRadius: 8, border: 'none',
                  background: '#4a90d9', color: 'white', fontWeight: 600, fontSize: '0.875rem',
                  cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, marginBottom: 10,
                }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          )}

          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
            <button
              onClick={onLogout}
              style={{
                width: '100%', padding: '7px', borderRadius: 8, border: '1px solid #e2e8f0',
                background: 'white', color: '#718096', fontSize: '0.875rem', cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Nav({ teams, activeTeam, setActiveTeam, teamSeasons, activeSeason, setActiveSeason, user, onLogout }) {
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isPublic = loc.pathname.startsWith('/availability/match/');

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);

  if (isPublic) return null;

  return (
    <>
      <nav className="nav">
        <NavLink to="/" className="nav-brand">
          <span className="nav-brand-icon">🎾</span>
          Tennis Scheduler
        </NavLink>
        <TeamSelector teams={teams} activeTeam={activeTeam} setActiveTeam={setActiveTeam}
          teamSeasons={teamSeasons} activeSeason={activeSeason} setActiveSeason={setActiveSeason} />
        {/* Desktop tabs */}
        <div className="nav-tabs">
          <NavLink to="/" end className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Schedule</NavLink>
          <NavLink to="/players" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Players</NavLink>
          <NavLink to="/teams" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Teams</NavLink>
        </div>
        {/* Mobile hamburger */}
        <button
          className="nav-hamburger"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Menu"
        >
          {menuOpen
            ? <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            : <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          }
        </button>
        <ProfileMenu user={user} onLogout={onLogout} />
      </nav>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <div className="nav-drawer">
          <NavLink to="/" end className={({ isActive }) => `nav-drawer-item${isActive ? ' active' : ''}`}>Schedule</NavLink>
          <NavLink to="/players" className={({ isActive }) => `nav-drawer-item${isActive ? ' active' : ''}`}>Players</NavLink>
          <NavLink to="/teams" className={({ isActive }) => `nav-drawer-item${isActive ? ' active' : ''}`}>Teams</NavLink>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [teamList, setTeamList] = useState([]);
  const [activeTeam, setActiveTeamState] = useState(null);
  const [activeSeason, setActiveSeasonState] = useState(null);
  const [teamSeasons, setTeamSeasons] = useState([]);

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

  // Load seasons when active team changes
  useEffect(() => {
    if (!activeTeam || !session) { setTeamSeasons([]); setActiveSeasonState(null); return; }
    seasonsApi.list({ team_id: activeTeam.id }).then(seasons => {
      setTeamSeasons(seasons);
      setActiveSeasonState(prev => {
        if (prev && seasons.find(s => s.id === prev.id)) return prev;
        return seasons[0] || null;
      });
    }).catch(() => {});
  }, [activeTeam, session]);

  const setActiveTeam = (team) => {
    setActiveTeamState(team);
    setActiveSeasonState(null);
    localStorage.setItem(LS_KEY, team ? team.id : '');
  };

  const setActiveSeason = (season) => setActiveSeasonState(season);

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
    <TeamContext.Provider value={{ activeTeam, setActiveTeam, teams: teamList, refreshTeams, activeSeason, setActiveSeason, teamSeasons }}>
      <BrowserRouter>
        <div className="app">
          <Nav
            teams={teamList}
            activeTeam={activeTeam}
            setActiveTeam={setActiveTeam}
            teamSeasons={teamSeasons}
            activeSeason={activeSeason}
            setActiveSeason={setActiveSeason}
            user={session?.user}
            onLogout={handleLogout}
          />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Schedule />} />
              <Route path="/players" element={<Players />} />
              <Route path="/players/:id" element={<PlayerRecord />} />
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
