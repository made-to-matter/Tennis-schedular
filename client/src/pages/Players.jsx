import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { players as playersApi, seasons as seasonsApi } from '../api';
import { TeamContext } from '../App';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PlayerForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', email: '', cell: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-control" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
        </div>
        <div className="form-group">
          <label className="form-label">Cell Phone</label>
          <input className="form-control" value={form.cell || ''} onChange={e => set('cell', e.target.value)} placeholder="+1 (555) 000-0000" />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => form.name && onSave(form)}>Save Player</button>
      </div>
    </>
  );
}

function BulkImportModal({ onSave, onCancel }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState([]);

  const parse = (raw) => {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
      const parts = line.split(/[,\t]+/).map(p => p.trim());
      return { name: parts[0] || '', email: parts[1] || '', cell: parts[2] || '' };
    }).filter(p => p.name);
  };

  useEffect(() => { setPreview(parse(text)); }, [text]);

  return (
    <>
      <div className="modal-body">
        <div className="alert alert-info">
          Paste players — one per line. Format: <strong>Name, Email, Cell</strong> (email/cell optional)
        </div>
        <div className="form-group">
          <label className="form-label">Paste player list</label>
          <textarea className="form-control" rows={8} value={text} onChange={e => setText(e.target.value)}
            placeholder={"John Smith, john@email.com, +15550001234\nJane Doe, jane@email.com\nBob Wilson"} />
        </div>
        {preview.length > 0 && (
          <div>
            <div className="section-title">Preview ({preview.length} players)</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Cell</th></tr></thead>
                <tbody>{preview.map((p, i) => <tr key={i}><td>{p.name}</td><td>{p.email || '—'}</td><td>{p.cell || '—'}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!preview.length} onClick={() => onSave(preview)}>Import {preview.length} Players</button>
      </div>
    </>
  );
}

export default function Players() {
  const { activeTeam } = useContext(TeamContext);
  const [playerList, setPlayerList] = useState([]);
  const [teamSeasons, setTeamSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [seasonPlayerIds, setSeasonPlayerIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const loadSeasonPlayers = async (season) => {
    if (!season) { setSeasonPlayerIds(new Set()); return; }
    const sp = await seasonsApi.getPlayers(season.id);
    setSeasonPlayerIds(new Set(sp.map(p => p.id)));
  };

  const load = async () => {
    const players = await playersApi.list();
    setPlayerList(players);
    if (activeTeam) {
      const seasons = await seasonsApi.list({ team_id: activeTeam.id });
      setTeamSeasons(seasons);
      const season = seasons[0] || null;
      setSelectedSeason(season);
      await loadSeasonPlayers(season);
    } else {
      setTeamSeasons([]);
      setSelectedSeason(null);
      setSeasonPlayerIds(new Set());
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [activeTeam]);

  const handleSeasonChange = async (seasonId) => {
    const season = teamSeasons.find(s => s.id === parseInt(seasonId)) || null;
    setSelectedSeason(season);
    await loadSeasonPlayers(season);
  };

  const handleToggleSeason = async (player) => {
    if (!selectedSeason) return;
    if (seasonPlayerIds.has(player.id)) {
      await seasonsApi.removePlayer(selectedSeason.id, player.id);
    } else {
      await seasonsApi.addPlayers(selectedSeason.id, [player.id]);
    }
    await loadSeasonPlayers(selectedSeason);
  };

  const handleSave = async (data) => {
    if (editing) { await playersApi.update(editing.id, { ...data, active: editing.active }); }
    else { await playersApi.create(data); }
    setModal(null); setEditing(null); load();
  };

  const handleBulkImport = async (players) => {
    await playersApi.import({ players });
    setModal(null); load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this player?')) return;
    await playersApi.delete(id); load();
  };

  const handleToggleActive = async (player) => {
    await playersApi.update(player.id, { ...player, active: player.active ? 0 : 1 });
    load();
  };

  const filtered = playerList.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.email || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Players</h1>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => setModal('bulk')}>Bulk Import</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setModal('add'); }}>+ Add Player</button>
        </div>
      </div>

      <div className="card">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input className="form-control" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <p>{search ? 'No players match your search.' : 'No players yet. Add your first player!'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Cell</th>
                  <th>Status</th>
                  {activeTeam && (
                    <th>
                      {teamSeasons.length === 0 ? (
                        <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>No seasons</span>
                      ) : teamSeasons.length === 1 ? (
                        <span>{teamSeasons[0].name}</span>
                      ) : (
                        <select
                          value={selectedSeason?.id || ''}
                          onChange={e => handleSeasonChange(e.target.value)}
                          style={{ fontSize: '0.85rem', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px', cursor: 'pointer' }}
                        >
                          {teamSeasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                    </th>
                  )}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/players/${p.id}`} style={{ color: '#1a5276', fontWeight: 500, textDecoration: 'none' }}>
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.email || <span className="text-muted">—</span>}</td>
                    <td>{p.cell || <span className="text-muted">—</span>}</td>
                    <td>
                      <span className={`badge ${p.active ? 'badge-green' : 'badge-gray'}`}>
                        {p.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {activeTeam && (
                      <td>
                        {selectedSeason ? (
                          <button
                            className="btn btn-sm"
                            style={seasonPlayerIds.has(p.id)
                              ? { background: '#f0fff4', color: '#276749', border: '1px solid #68d391', fontSize: '0.75rem' }
                              : { background: 'white', color: '#718096', border: '1px solid #e2e8f0', fontSize: '0.75rem' }
                            }
                            onClick={() => handleToggleSeason(p)}
                          >
                            {seasonPlayerIds.has(p.id) ? '✓ In Season' : '+ Add to Season'}
                          </button>
                        ) : (
                          <span className="text-muted text-sm">—</span>
                        )}
                      </td>
                    )}
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-outline btn-sm" onClick={() => { setEditing(p); setModal('edit'); }}>Edit</button>
                        <button className="btn btn-outline btn-sm" onClick={() => handleToggleActive(p)}>
                          {p.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => handleDelete(p.id)} title="Delete player" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fc8181', padding: '4px 6px', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'edit' ? 'Edit Player' : 'Add Player'} onClose={() => { setModal(null); setEditing(null); }}>
          <PlayerForm initial={editing} onSave={handleSave} onCancel={() => { setModal(null); setEditing(null); }} />
        </Modal>
      )}

      {modal === 'bulk' && (
        <Modal title="Bulk Import Players" onClose={() => setModal(null)}>
          <BulkImportModal onSave={handleBulkImport} onCancel={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
