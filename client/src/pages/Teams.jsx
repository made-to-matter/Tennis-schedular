import React, { useContext, useEffect, useState } from 'react';
import { teams as teamsApi, players as playersApi } from '../api';
import { TeamContext } from '../App';

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

function TeamForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', description: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Team Name *</label>
          <input
            className="form-control"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g., Men's 3.5"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input
            className="form-control"
            value={form.description || ''}
            onChange={e => set('description', e.target.value)}
            placeholder="Optional notes about this team"
          />
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

function RosterPanel({ team, allPlayers, onChanged }) {
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadRoster = () => {
    teamsApi.getPlayers(team.id).then(data => { setTeamPlayers(data); setLoading(false); });
  };

  useEffect(() => { loadRoster(); }, [team.id]);

  const teamPlayerIds = new Set(teamPlayers.map(p => p.id));

  const handleAdd = async (player) => {
    await teamsApi.addPlayers(team.id, [player.id]);
    loadRoster();
    onChanged();
  };

  const handleRemove = async (player) => {
    await teamsApi.removePlayer(team.id, player.id);
    loadRoster();
    onChanged();
  };

  const activePlayers = allPlayers.filter(p => p.active);
  const notOnTeam = activePlayers.filter(p => !teamPlayerIds.has(p.id));
  const filtered = notOnTeam.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="text-muted text-sm">Loading roster...</div>;

  return (
    <div style={{ marginTop: 12 }}>
      <div className="section-title" style={{ marginBottom: 8 }}>Team Roster</div>

      {teamPlayers.length === 0 ? (
        <p className="text-muted text-sm">No players on this team yet.</p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {teamPlayers.map(p => (
            <div key={p.id} className="flex items-center gap-2" style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ flex: 1, fontSize: '0.9rem' }}>{p.name}</span>
              <button
                className="btn btn-sm"
                style={{ background: '#fff5f5', color: '#e53e3e', border: '1px solid #fc8181', fontSize: '0.75rem' }}
                onClick={() => handleRemove(p)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="section-title" style={{ marginBottom: 6 }}>Add Players</div>
      <input
        className="form-control"
        style={{ marginBottom: 8 }}
        placeholder="Search players..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <p className="text-muted text-sm">{search ? 'No matches.' : 'All active players are already on this team.'}</p>
        ) : (
          filtered.map(p => (
            <div key={p.id} className="flex items-center gap-2" style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ flex: 1, fontSize: '0.9rem' }}>{p.name}</span>
              <button
                className="btn btn-sm"
                style={{ background: '#f0fff4', color: '#276749', border: '1px solid #68d391', fontSize: '0.75rem' }}
                onClick={() => handleAdd(p)}
              >
                Add
              </button>
            </div>
          ))
        )}
      </div>
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
  const [expandedRoster, setExpandedRoster] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    const [t, p] = await Promise.all([teamsApi.list(), playersApi.list()]);
    setTeamList(t);
    setAllPlayers(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) await teamsApi.update(editing.id, data);
    else await teamsApi.create(data);
    setModal(null); setEditing(null);
    await load();
    refreshTeams();
  };

  const handleDeactivate = async (team) => {
    if (!confirm(`Deactivate "${team.name}"? It will be hidden from the team selector but data is preserved.`)) return;
    await teamsApi.deactivate(team.id);
    await load();
    refreshTeams();
  };

  const handleActivate = async (team) => {
    await teamsApi.activate(team.id);
    await load();
    refreshTeams();
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

      <div className="alert alert-info">
        Teams let you manage separate rosters and schedules. Use the team selector in the nav to filter the schedule and seasons by team.
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
            <div key={team.id} className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">{team.name}</div>
                  {team.description && (
                    <div className="text-muted text-sm" style={{ marginTop: 2 }}>{team.description}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setExpandedRoster(expandedRoster === team.id ? null : team.id)}
                  >
                    {expandedRoster === team.id ? 'Hide Roster' : 'Manage Roster'}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => { setEditing(team); setModal('form'); }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeactivate(team)}
                    title="Deactivate team"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fc8181', padding: '4px 6px', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                  </button>
                </div>
              </div>

              {expandedRoster === team.id && (
                <RosterPanel team={team} allPlayers={allPlayers} onChanged={load} />
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
                    <button className="btn btn-outline btn-sm" onClick={() => handleActivate(team)}>
                      Reactivate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modal === 'form' && (
        <Modal title={editing ? 'Edit Team' : 'New Team'} onClose={() => { setModal(null); setEditing(null); }}>
          <TeamForm
            initial={editing}
            onSave={handleSave}
            onCancel={() => { setModal(null); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
}
