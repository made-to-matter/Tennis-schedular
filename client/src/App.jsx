import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Players from './pages/Players';
import Schedule from './pages/Schedule';
import MatchDetail from './pages/MatchDetail';
import Seasons from './pages/Seasons';
import PlayerRecord from './pages/PlayerRecord';
import AvailabilityPublic from './pages/AvailabilityPublic';

function Nav() {
  const loc = useLocation();
  const isPublic = loc.pathname.startsWith('/availability/');
  if (isPublic) return null;

  return (
    <nav className="nav">
      <NavLink to="/" className="nav-brand">🎾 Tennis Scheduler</NavLink>
      <div className="nav-tabs">
        <NavLink to="/" end className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Schedule</NavLink>
        <NavLink to="/players" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Players</NavLink>
        <NavLink to="/seasons" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>Seasons</NavLink>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Nav />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Schedule />} />
            <Route path="/players" element={<Players />} />
            <Route path="/players/:id" element={<PlayerRecord />} />
            <Route path="/seasons" element={<Seasons />} />
            <Route path="/matches/:id" element={<MatchDetail />} />
            <Route path="/availability/:token" element={<AvailabilityPublic />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
