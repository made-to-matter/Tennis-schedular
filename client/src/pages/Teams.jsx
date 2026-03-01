import React, { useContext, useEffect, useState } from 'react';
import { teams as teamsApi, players as playersApi, seasons as seasonsApi } from '../api';
import { TeamContext } from '../App';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Shared icon button — ghost style, no border
function IconBtn({ onClick, title, color = '#a0aec0', children, stopPropagation = false }) {
  return (
    <button
      onClick={e => { if (stopPropagation) e.stopPropagation(); onClick(e); }}
      title={title}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', color,
        padding: '4px 5px', borderRadius: 4, display: 'inline-flex', alignItems: 'center',
        lineHeight: 1, flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

const PencilIcon = ({ size = 15 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const TrashIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const DeactivateIcon = ({ size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>
);

const ChevronIcon = ({ open, size = 15 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TeamForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', description: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Team Name *</label>
          <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g., Men's 3.5" />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-control" value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Optional notes about this team" />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => form.name && onSave(form)}>
          {initial ? 'Update Team' : 'Create Team'}
        </button>
      </div>
    </>
  );
}

function SeasonForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial || { name: '', default_day_of_week: 0, default_time: '13:00', line_templates: [] }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const nextNumForType = (type, exclude = -1) => {
    const same = form.line_templates.filter((l, i) => i !== exclude && l.line_type === type);
    return same.length > 0 ? Math.max(...same.map(l => l.line_number)) + 1 : 1;
  };
  const addLine = () => {
    set('line_templates', [...form.line_templates, { line_number: nextNumForType('doubles'), line_type: 'doubles' }]);
  };
  const updateLine = (idx, field, val) => {
    const updated = [...form.line_templates];
    if (field === 'line_type') {
      const same = updated.filter((l, i) => i !== idx && l.line_type === val);
      const newNum = same.length > 0 ? Math.max(...same.map(l => l.line_number)) + 1 : 1;
      updated[idx] = { ...updated[idx], line_type: val, line_number: newNum };
    } else {
      updated[idx] = { ...updated[idx], [field]: field === 'line_number' ? parseInt(val) : val };
    }
    set('line_templates', updated);
  };
  const removeLine = (idx) => set('line_templates', form.line_templates.filter((_, i) => i !== idx));

  return (
    <>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Season Name *</label>
          <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g., Spring 2025" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Default Play Day</label>
            <select className="form-control" value={form.default_day_of_week ?? 0} onChange={e => set('default_day_of_week', parseInt(e.target.value))}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Default Start Time</label>
            <input className="form-control" type="time" value={form.default_time || ''} onChange={e => set('default_time', e.target.value)} />
          </div>
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginTop: 4 }}>
          <div className="flex justify-between items-center mb-2">
            <span className="section-title" style={{ marginBottom: 0 }}>Line Template</span>
            <button className="btn btn-outline btn-sm" onClick={addLine}>+ Add Line</button>
          </div>
          <div className="alert alert-info" style={{ marginBottom: 12 }}>
            These lines are used as defaults when creating matches for this season.
          </div>
          {form.line_templates.length === 0 && <p className="text-muted text-sm">No lines configured.</p>}
          {form.line_templates.map((line, idx) => (
            <div key={idx} className="flex gap-2 items-center mb-2">
              <div style={{ flex: 1 }}>
                <input className="form-control" type="number" min="1" value={line.line_number} onChange={e => updateLine(idx, 'line_number', e.target.value)} placeholder="Line #" />
              </div>
              <div style={{ flex: 2 }}>
                <select className="form-control" value={line.line_type} onChange={e => updateLine(idx, 'line_type', e.target.value)}>
                  <option value="doubles">Doubles</option>
                  <option value="singles">Singles</option>
                </select>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => removeLine(idx)}>✕</button>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => form.name && onSave(form)}>Save Season</button>
      </div>
    </>
  );
}

function SeasonRosterPanel({ season, allPlayers, onChanged }) {
  const [seasonPlayers, setSeasonPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRoster = () => {
    setLoading(true);
    seasonsApi.getPlayers(season.id)
      .then(data => { setSeasonPlayers(data); setLoading(false); })
      .catch(err => { setError(err?.response?.data?.error || err.message); setLoading(false); });
  };

  useEffect(() => { loadRoster(); }, [season.id]);

  const seasonPlayerIds = new Set(seasonPlayers.map(p => p.id));

  const handleAdd = async (player) => {
    await seasonsApi.addPlayers(season.id, [player.id]);
    loadRoster();
    onChanged();
  };

  const handleRemove = async (player) => {
    await seasonsApi.removePlayer(season.id, player.id);
    loadRoster();
    onChanged();
  };

  const pool = allPlayers.filter(p => p.active && !seasonPlayerIds.has(p.id));
  const filtered = pool.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="text-muted text-sm" style={{ padding: '8px 0 4px 22px' }}>Loading...</div>;
  if (error) return <div className="text-sm" style={{ padding: '8px 0 4px 22px', color: '#e53e3e' }}>{error}</div>;

  return (
    <div style={{ paddingLeft: 22, paddingTop: 10 }}>
      {seasonPlayers.length === 0 ? (
        <p className="text-muted text-sm" style={{ marginBottom: 8 }}>No players yet.</p>
      ) : (
        <div style={{ marginBottom: 10 }}>
          {seasonPlayers.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ flex: 1, fontSize: '0.875rem' }}>{p.name}</span>
              <button
                onClick={() => handleRemove(p)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fc8181', fontSize: '0.75rem', padding: '2px 6px' }}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        className="form-control"
        style={{ marginBottom: 6, fontSize: '0.875rem' }}
        placeholder="Search players to add…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div style={{ maxHeight: 150, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <p className="text-muted text-sm">{search ? 'No matches.' : 'All players already added.'}</p>
        ) : (
          filtered.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ flex: 1, fontSize: '0.875rem' }}>{p.name}</span>
              <button
                onClick={() => handleAdd(p)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#68d391', fontSize: '0.75rem', padding: '2px 6px' }}
              >
                + add
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SeasonsPanel({ team, allPlayers, onSeasonsChanged }) {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [expandedSeasonRoster, setExpandedSeasonRoster] = useState(null);

  const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  const loadSeasons = () => {
    seasonsApi.list({ team_id: team.id }).then(data => { setSeasons(data); setLoading(false); });
  };

  useEffect(() => { loadSeasons(); }, [team.id]);

  const handleSave = async (data) => {
    if (editing) await seasonsApi.update(editing.id, data);
    else await seasonsApi.create({ ...data, team_id: team.id });
    setModal(null); setEditing(null);
    loadSeasons(); onSeasonsChanged();
  };

  const handleDelete = async (season) => {
    if (!confirm(`Delete "${season.name}"?`)) return;
    await seasonsApi.delete(season.id);
    loadSeasons(); onSeasonsChanged();
  };

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
      {/* Seasons header + inline new button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#718096' }}>
          Seasons
        </span>
        <button
          className="btn btn-outline btn-sm"
          style={{ fontSize: '0.78rem', padding: '3px 10px' }}
          onClick={() => { setEditing(null); setModal('season-form'); }}
        >
          + New Season
        </button>
      </div>

      {loading ? (
        <div className="text-muted text-sm">Loading…</div>
      ) : seasons.length === 0 ? (
        <p className="text-muted text-sm">No seasons yet.</p>
      ) : (
        <div>
          {seasons.map((s, idx) => (
            <div key={s.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #f0f0f0' }}>
              {/* Season row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', cursor: 'pointer' }}
                onClick={() => setExpandedSeasonRoster(expandedSeasonRoster === s.id ? null : s.id)}
              >
                <ChevronIcon open={expandedSeasonRoster === s.id} size={13} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.name}</span>
                  <span className="text-muted" style={{ fontSize: '0.8rem', marginLeft: 8 }}>
                    {s.default_day_of_week !== null ? `${DAYS[s.default_day_of_week]}s` : ''}
                    {s.default_time ? ` · ${formatTime(s.default_time)}` : ''}
                    {s.line_templates?.length > 0 ? ` · ${s.line_templates.length} lines` : ''}
                  </span>
                </div>
                <IconBtn
                  onClick={() => { setEditing(s); setModal('season-form'); }}
                  title="Edit season"
                  stopPropagation
                >
                  <PencilIcon size={13} />
                </IconBtn>
                <IconBtn
                  onClick={() => handleDelete(s)}
                  title="Delete season"
                  color="#fc8181"
                  stopPropagation
                >
                  <TrashIcon size={13} />
                </IconBtn>
              </div>

              {expandedSeasonRoster === s.id && (
                <SeasonRosterPanel season={s} allPlayers={allPlayers} onChanged={loadSeasons} />
              )}
            </div>
          ))}
        </div>
      )}

      {modal === 'season-form' && (
        <Modal title={editing ? 'Edit Season' : 'New Season'} onClose={() => { setModal(null); setEditing(null); }}>
          <SeasonForm initial={editing} onSave={handleSave} onCancel={() => { setModal(null); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

export default function Teams() {
  const { refreshTeams } = useContext(TeamContext);
  const [teamList, setTeamList] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    const [t, p] = await Promise.all([teamsApi.list(), playersApi.list()]);
    setTeamList(t);
    setAllPlayers(p);
    setExpanded(prev => {
      const next = { ...prev };
      t.filter(team => team.active).forEach(team => {
        if (!(team.id in next)) next[team.id] = 'seasons';
      });
      return next;
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSeasons = (teamId) => {
    setExpanded(prev => ({ ...prev, [teamId]: prev[teamId] === 'seasons' ? null : 'seasons' }));
  };

  const handleSave = async (data) => {
    if (editing) await teamsApi.update(editing.id, data);
    else await teamsApi.create(data);
    setModal(null); setEditing(null);
    await load(); refreshTeams();
  };

  const handleDeactivate = async (team) => {
    if (!confirm(`Deactivate "${team.name}"?`)) return;
    await teamsApi.deactivate(team.id);
    await load(); refreshTeams();
  };

  const handleActivate = async (team) => {
    await teamsApi.activate(team.id);
    await load(); refreshTeams();
  };

  const activeTeams = teamList.filter(t => t.active);
  const inactiveTeams = teamList.filter(t => !t.active);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Teams</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModal('form'); }}>
          + New Team
        </button>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : activeTeams.length === 0 && inactiveTeams.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🎾</div>
            <p>No teams yet. Create your first team to get started!</p>
          </div>
        </div>
      ) : (
        <>
          {activeTeams.map(team => (
            <div key={team.id} className="card" style={{ padding: '14px 18px' }}>
              {/* Team header row — click left side to expand/collapse */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', minWidth: 0 }}
                  onClick={() => toggleSeasons(team.id)}
                >
                  <ChevronIcon open={expanded[team.id] === 'seasons'} size={16} />
                  <div style={{ minWidth: 0 }}>
                    <div className="card-title" style={{ marginBottom: 0 }}>{team.name}</div>
                    {team.description && (
                      <div className="text-muted text-sm">{team.description}</div>
                    )}
                  </div>
                </div>
                {/* Icon actions — stop propagation so they don't toggle */}
                <IconBtn onClick={() => { setEditing(team); setModal('form'); }} title="Edit team" stopPropagation>
                  <PencilIcon size={15} />
                </IconBtn>
                <IconBtn onClick={() => handleDeactivate(team)} title="Deactivate team" color="#fc8181" stopPropagation>
                  <DeactivateIcon size={15} />
                </IconBtn>
              </div>

              {expanded[team.id] === 'seasons' && (
                <SeasonsPanel team={team} allPlayers={allPlayers} onSeasonsChanged={() => {}} />
              )}
            </div>
          ))}

          {inactiveTeams.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowInactive(s => !s)}
                style={{ marginBottom: 12 }}
              >
                {showInactive ? 'Hide' : 'Show'} Inactive Teams ({inactiveTeams.length})
              </button>
              {showInactive && inactiveTeams.map(team => (
                <div key={team.id} className="card" style={{ opacity: 0.65 }}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{team.name} <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>Inactive</span></div>
                      {team.description && <div className="text-muted text-sm">{team.description}</div>}
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => handleActivate(team)}>Reactivate</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modal === 'form' && (
        <Modal title={editing ? 'Edit Team' : 'New Team'} onClose={() => { setModal(null); setEditing(null); }}>
          <TeamForm initial={editing} onSave={handleSave} onCancel={() => { setModal(null); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}
