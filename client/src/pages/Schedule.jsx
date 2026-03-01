import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { matches as matchesApi, seasons as seasonsApi, opponents as opponentsApi } from '../api';
import { TeamContext } from '../App';

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

function MatchForm({ initial, seasons, opponents, onSave, onCancel, onAddOpponent }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(initial ? { ...initial, lines: initial.lines || [] } : {
    season_id: '', opponent_id: '', match_date: '', match_time: '',
    is_home: 1, away_address: '', use_custom_dates: 0, notes: '',
    lines: []
  });
  const [newOpponent, setNewOpponent] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSeasonChange = (seasonId) => {
    set('season_id', seasonId);
    if (seasonId) {
      const s = seasons.find(s => s.id === parseInt(seasonId));
      if (s && s.line_templates.length > 0 && form.lines.length === 0) {
        set('lines', s.line_templates.map(l => ({ line_number: l.line_number, line_type: l.line_type })));
      }
      if (s && s.default_time && !form.match_time) set('match_time', s.default_time);
    }
  };

  const addLine = () => {
    const next = form.lines.length > 0 ? Math.max(...form.lines.map(l => l.line_number)) + 1 : 1;
    set('lines', [...form.lines, { line_number: next, line_type: 'doubles', custom_date: '', custom_time: '' }]);
  };

  const updateLine = (idx, field, val) => {
    const updated = [...form.lines];
    updated[idx] = { ...updated[idx], [field]: field === 'line_number' ? parseInt(val) : val };
    set('lines', updated);
  };

  const removeLine = (idx) => set('lines', form.lines.filter((_, i) => i !== idx));

  return (
    <>
      <div className="modal-body">
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Season</label>
            <select className="form-control" value={form.season_id || ''} onChange={e => handleSeasonChange(e.target.value)}>
              <option value="">No Season</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Opponent Club</label>
            <div className="flex gap-2">
              <select className="form-control" value={form.opponent_id || ''} onChange={e => set('opponent_id', e.target.value)}>
                <option value="">Select opponent</option>
                {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-2">
              <input className="form-control" placeholder="Or add new..." value={newOpponent} onChange={e => setNewOpponent(e.target.value)} />
              <button className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={async () => { if (newOpponent) { const o = await onAddOpponent(newOpponent); set('opponent_id', o.id); setNewOpponent(''); } }}>Add</button>
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Match Date *</label>
            <input className="form-control" type="date" value={form.match_date} onChange={e => set('match_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Start Time</label>
            <input className="form-control" type="time" value={form.match_time || ''} onChange={e => set('match_time', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <div className="flex gap-4">
            <label className="form-check">
              <input type="radio" checked={!!form.is_home} onChange={() => set('is_home', 1)} /> Home
            </label>
            <label className="form-check">
              <input type="radio" checked={!form.is_home} onChange={() => set('is_home', 0)} /> Away
            </label>
          </div>
        </div>

        {!form.is_home && (
          <div className="form-group">
            <label className="form-label">Away Venue Address</label>
            <input className="form-control" value={form.away_address || ''} onChange={e => set('away_address', e.target.value)} placeholder="Club name, street, city..." />
          </div>
        )}

        <div className="form-group">
          <label className="form-check">
            <input type="checkbox" checked={!!form.use_custom_dates} onChange={e => set('use_custom_dates', e.target.checked ? 1 : 0)} />
            Use custom date/time per line (e.g., different courts play on different days)
          </label>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
          <div className="flex justify-between items-center mb-2">
            <span className="section-title" style={{ marginBottom: 0 }}>Lines</span>
            <button className="btn btn-outline btn-sm" onClick={addLine}>+ Add Line</button>
          </div>
          {form.lines.length === 0 && <p className="text-muted text-sm">No lines. Add lines or select a season with a template.</p>}
          {form.lines.map((line, idx) => (
            <div key={idx} className="line-card">
              <div className="flex gap-2 items-center">
                <div style={{ flex: '0 0 80px' }}>
                  <label className="form-label">Line #</label>
                  <input className="form-control" type="number" min="1" value={line.line_number} onChange={e => updateLine(idx, 'line_number', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Type</label>
                  <select className="form-control" value={line.line_type} onChange={e => updateLine(idx, 'line_type', e.target.value)}>
                    <option value="doubles">Doubles</option>
                    <option value="singles">Singles</option>
                  </select>
                </div>
                {form.use_custom_dates && <>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Date</label>
                    <input className="form-control" type="date" value={line.custom_date || ''} onChange={e => updateLine(idx, 'custom_date', e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Time</label>
                    <input className="form-control" type="time" value={line.custom_time || ''} onChange={e => updateLine(idx, 'custom_time', e.target.value)} />
                  </div>
                </>}
                <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
                  <button className="btn btn-danger btn-sm" onClick={() => removeLine(idx)}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="form-group mt-3">
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => form.match_date && onSave(form)}>
          {isEdit ? 'Update Match' : 'Create Match'}
        </button>
      </div>
    </>
  );
}

export default function Schedule() {
  const { activeTeam } = useContext(TeamContext);
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
  useEffect(() => { load(); }, [activeTeam]);

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

  const filtered = matchList.filter(m => filterStatus === 'all' || m.status === filterStatus);
  const upcoming = filtered.filter(m => m.match_date >= new Date().toISOString().slice(0, 10) && m.status === 'scheduled');
  const past = filtered.filter(m => !(m.match_date >= new Date().toISOString().slice(0, 10) && m.status === 'scheduled'));

  const MatchCard = ({ m }) => (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="flex items-center gap-2 mb-1" style={{ flexWrap: 'wrap' }}>
        <span className={`badge ${STATUS_BADGE[m.status] || 'badge-gray'}`}>{m.status}</span>
        <span className={`badge ${m.is_home ? 'badge-blue' : 'badge-orange'}`}>{m.is_home ? 'Home' : 'Away'}</span>
        {m.season_name && <span className="badge badge-gray">{m.season_name}</span>}
      </div>
      <div className="flex items-center" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
        <div style={{ fontWeight: 600, fontSize: '1rem' }}>
          vs {m.opponent_name || <span className="text-muted">TBD</span>}
        </div>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          <Link to={`/matches/${m.id}`} className="btn btn-primary btn-sm">Manage</Link>
          <button className="btn btn-outline btn-sm" onClick={() => { setEditing(m); setModal('form'); }}>Edit</button>
          <button onClick={() => handleDelete(m.id)} title="Delete match" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fc8181', padding: '6px', borderRadius: 6, display: 'flex', alignItems: 'center', minWidth: 36, minHeight: 36, justifyContent: 'center' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
      <div className="text-muted text-sm">
        {formatDate(m.match_date)}{m.match_time ? ` at ${formatTime(m.match_time)}` : ''}
        {!m.is_home && m.away_address ? ` — ${m.away_address}` : ''}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Schedule</h1>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setModal('form'); }}>+ New Match</button>
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
      ) : matchList.length === 0 ? (
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
