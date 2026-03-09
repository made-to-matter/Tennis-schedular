import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { matches as matchesApi, seasons as seasonsApi, opponents as opponentsApi } from '../api';
import { TeamContext } from '../App';
import MatchForm from '../components/MatchForm';

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 700 } : {}}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  scheduled: 'badge-blue',
  completed: 'badge-green',
  cancelled: 'badge-red',
};

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
};


export default function Schedule() {
  const { activeTeam, activeSeason } = useContext(TeamContext);
  const [matchList, setMatchList] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [opponents, setOpponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const load = async () => {
    const params = activeTeam ? { team_id: activeTeam.id } : {};
    const [m, s, o] = await Promise.all([matchesApi.list(params), seasonsApi.list(params), opponentsApi.list()]);
    setMatchList(m); setSeasons(s); setOpponents(o);
    setLoading(false);
  };
  useEffect(() => { load(); }, [activeTeam, activeSeason]);

  const handleSave = async (data) => {
    const payload = { ...data, team_id: activeTeam?.id || null };
    if (editing) await matchesApi.update(editing.id, payload);
    else await matchesApi.create(payload);
    setModal(null); setEditing(null); load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this match?')) return;
    await matchesApi.delete(id); load();
  };

  const handleAddOpponent = async (name) => {
    const o = await opponentsApi.create({ name });
    setOpponents(prev => [...prev, o]);
    return o;
  };

  const filtered = matchList.filter(m =>
    (!activeSeason || m.season_id == null || String(m.season_id) === String(activeSeason.id)) &&
    (filterStatus === 'all' || m.status === filterStatus)
  );
  const upcoming = filtered.filter(m => m.match_date >= new Date().toISOString().slice(0, 10) && m.status === 'scheduled');
  const past = filtered.filter(m => !(m.match_date >= new Date().toISOString().slice(0, 10) && m.status === 'scheduled'));

  const MatchCard = ({ m }) => (
    <div className="card match-card" style={{ marginBottom: 12, padding: '14px 16px' }}>
      {/* Badges */}
      <div className="flex items-center gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
        <span className={`badge ${STATUS_BADGE[m.status] || 'badge-gray'}`}>{m.status}</span>
        <span className={`badge ${m.is_home ? 'badge-blue' : 'badge-orange'}`}>{m.is_home ? 'Home' : 'Away'}</span>
        {m.season_name && <span className="badge badge-gray">{m.season_name}</span>}
      </div>
      {/* Opponent name — full width, no competition */}
      <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 2 }}>
        vs {m.opponent_name || <span className="text-muted" style={{ fontWeight: 400 }}>TBD</span>}
      </div>
      <div className="text-muted text-sm" style={{ marginBottom: 12 }}>
        {formatDate(m.match_date)}{m.match_time ? ` at ${formatTime(m.match_time)}` : ''}
        {!m.is_home && m.away_address ? ` — ${m.away_address}` : ''}
      </div>
      {/* Action row — Manage stretches, Edit and delete are compact */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid #f0f4f8', paddingTop: 12 }}>
        <Link to={`/matches/${m.id}`} className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }}>Manage</Link>
        <button className="btn btn-outline btn-sm" style={{ flexShrink: 0 }} onClick={async () => { const full = await matchesApi.get(m.id); setEditing(full); setModal('form'); }}>Edit</button>
        <button onClick={() => handleDelete(m.id)} title="Delete match" style={{ background: 'none', border: '1px solid #e2e8f0', cursor: 'pointer', color: '#fc8181', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flexShrink: 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Schedule</h1>
        <div className="flex items-center gap-2">
          {!activeTeam && <span className="text-muted text-sm">Select a team first</span>}
          <button
            className="btn btn-primary btn-sm"
            disabled={!activeTeam}
            onClick={() => { setEditing(null); setModal('form'); }}
          >+ New Match</button>
        </div>
      </div>

      <div className="card" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
          {['all', 'scheduled', 'completed', 'cancelled'].map(s => (
            <button key={s} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-outline'}`}
              style={{ flexShrink: 0 }}
              onClick={() => setFilterStatus(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🗓️</div>
            <p>No matches scheduled yet. Create your first match!</p>
          </div>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 10 }}>Upcoming ({upcoming.length})</div>
              {upcoming.map(m => <MatchCard key={m.id} m={m} />)}
            </div>
          )}
          {past.length > 0 && (
            <div style={{ marginTop: upcoming.length ? 16 : 0 }}>
              <div className="section-title" style={{ marginBottom: 10 }}>Past / Completed ({past.length})</div>
              {past.map(m => <MatchCard key={m.id} m={m} />)}
            </div>
          )}
        </>
      )}

      {modal === 'form' && (
        <Modal title={editing ? 'Edit Match' : 'New Match'} wide onClose={() => { setModal(null); setEditing(null); }}>
          <MatchForm initial={editing} seasons={seasons} opponents={opponents} onSave={handleSave} onCancel={() => { setModal(null); setEditing(null); }} onAddOpponent={handleAddOpponent} />
        </Modal>
      )}
    </div>
  );
}
