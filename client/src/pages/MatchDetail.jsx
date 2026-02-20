import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { matches as matchesApi, players as playersApi, availability as availApi } from '../api';

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

// Player assignment for a line
function AssignModal({ line, allPlayers, availability, onSave, onCancel }) {
  const maxPlayers = line.line_type === 'doubles' ? 2 : 1;
  const currentIds = line.players.map(p => p.player_id);
  const [selected, setSelected] = useState(currentIds);
  const [filter, setFilter] = useState('all'); // all | available

  const availableIds = new Set(availability.filter(a => a.available === 1).map(a => a.player_id));

  const toggle = (id) => {
    if (selected.includes(id)) {
      setSelected(prev => prev.filter(x => x !== id));
    } else if (selected.length < maxPlayers) {
      setSelected(prev => [...prev, id]);
    }
  };

  const displayPlayers = filter === 'available'
    ? allPlayers.filter(p => availableIds.has(p.id))
    : allPlayers;

  return (
    <>
      <div className="modal-body">
        <div className="alert alert-info">
          Select {maxPlayers === 1 ? '1 player' : 'up to 2 players'} for {line.line_type} Line {line.line_number}.
          {selected.length > 0 && <span> <strong>{selected.length}/{maxPlayers} selected.</strong></span>}
        </div>

        <div className="flex gap-2 mb-3">
          <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('all')}>All Players</button>
          <button className={`btn btn-sm ${filter === 'available' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('available')}>Available ({availableIds.size})</button>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {displayPlayers.filter(p => p.active).map(p => {
            const isSelected = selected.includes(p.id);
            const isAvail = availableIds.has(p.id);
            return (
              <div key={p.id} className="flex items-center gap-2 p-3 rounded border mb-2"
                style={{ background: isSelected ? '#ebf8ff' : 'white', borderColor: isSelected ? '#4299e1' : '#e2e8f0', cursor: 'pointer' }}
                onClick={() => toggle(p.id)}>
                <input type="checkbox" checked={isSelected} onChange={() => toggle(p.id)} />
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  {p.cell && <span className="text-muted text-sm" style={{ marginLeft: 8 }}>{p.cell}</span>}
                </div>
                {isAvail && <span className="badge badge-green">Available</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(selected)}>Assign Players</button>
      </div>
    </>
  );
}

// Score entry for a line
function ScoreModal({ line, onSave, onCancel }) {
  const existing = line.score || {};
  const [form, setForm] = useState({
    set1_us: existing.set1_us ?? '', set1_them: existing.set1_them ?? '',
    set2_us: existing.set2_us ?? '', set2_them: existing.set2_them ?? '',
    set3_us: existing.set3_us ?? '', set3_them: existing.set3_them ?? '',
    result: existing.result || '', notes: existing.notes || ''
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const SetRow = ({ n }) => (
    <div className="flex items-center gap-2 mb-2">
      <span className="form-label" style={{ width: 45, marginBottom: 0, flexShrink: 0 }}>Set {n}</span>
      <input className="form-control score-num" type="number" min="0" max="99" placeholder="Us" value={form[`set${n}_us`]} onChange={e => set(`set${n}_us`, e.target.value)} />
      <span style={{ color: '#718096' }}>–</span>
      <input className="form-control score-num" type="number" min="0" max="99" placeholder="Them" value={form[`set${n}_them`]} onChange={e => set(`set${n}_them`, e.target.value)} />
    </div>
  );

  return (
    <>
      <div className="modal-body">
        <p className="text-sm text-muted mb-3">{line.line_type.charAt(0).toUpperCase() + line.line_type.slice(1)} Line {line.line_number}</p>
        <SetRow n={1} /> <SetRow n={2} /> <SetRow n={3} />
        <div className="form-group mt-3">
          <label className="form-label">Result</label>
          <div className="flex gap-3">
            {['win', 'loss', 'default_win', 'default_loss'].map(r => (
              <label key={r} className="form-check">
                <input type="radio" checked={form.result === r} onChange={() => set('result', r)} />
                {r.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(form)}>Save Score</button>
      </div>
    </>
  );
}

// SMS notifications modal
function SmsModal({ links, onSend, onCancel, type }) {
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  const hasCells = links.some(l => l.player?.cell || l.cell);

  const handleSend = async () => {
    setSending(true);
    const messages = links.map(l => ({
      to: l.player?.cell || l.cell,
      body: l.message || l.body,
    })).filter(m => m.to);
    try {
      const r = await onSend(messages);
      setResults(r);
    } catch (e) {
      setResults({ error: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {results ? (
          <div>
            {results.error ? (
              <div className="alert alert-error">{results.error}</div>
            ) : (
              <>
                <div className="alert alert-success">Messages sent!</div>
                {results.results?.map((r, i) => (
                  <div key={i} className="text-sm mb-1">
                    {r.to}: <span className={`badge ${r.status === 'sent' ? 'badge-green' : 'badge-red'}`}>{r.status}</span>
                    {r.error && ` — ${r.error}`}
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <>
            {!hasCells && <div className="alert alert-warning">Some players have no cell number and won't receive SMS.</div>}
            <div className="alert alert-info">Preview of messages to be sent ({links.length} total):</div>
            {links.slice(0, 5).map((l, i) => (
              <div key={i} className="mb-3">
                <div className="text-sm text-muted mb-1">{l.player?.name || l.name} ({l.player?.cell || l.cell || 'no cell'})</div>
                <div className="sms-preview">{l.message || l.body}</div>
              </div>
            ))}
            {links.length > 5 && <p className="text-muted text-sm">...and {links.length - 5} more.</p>}
          </>
        )}
      </div>
      <div className="modal-footer">
        {results ? (
          <button className="btn btn-primary" onClick={onCancel}>Close</button>
        ) : (
          <>
            <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
            <button className="btn btn-success" onClick={handleSend} disabled={sending}>
              {sending ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Sending...</> : `Send ${links.filter(l => l.player?.cell || l.cell).length} SMS`}
            </button>
          </>
        )}
      </div>
    </>
  );
}

// Copy-to-clipboard link list
function LinksModal({ links, onClose }) {
  const [copied, setCopied] = useState(null);
  const copy = (text, id) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000); });
  };
  return (
    <>
      <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <div className="alert alert-info">Share these links with players. They can click to mark availability.</div>
        {links.map((l, i) => (
          <div key={i} className="flex items-center gap-2 mb-2 p-3 rounded border bg-gray">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{l.player.name}</div>
              <div className="text-sm text-muted" style={{ wordBreak: 'break-all' }}>{l.link}</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => copy(l.link, i)}>
              {copied === i ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline btn-sm" onClick={() => {
          const all = links.map(l => `${l.player.name}: ${l.link}`).join('\n');
          navigator.clipboard.writeText(all);
        }}>Copy All</button>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </>
  );
}

function LineCard({ line, allPlayers, availability, matchId, onAssign, onScore, onLineUpdate, useCustomDates }) {
  const getScoreSummary = (score) => {
    if (!score) return null;
    const sets = [];
    if (score.set1_us !== null && score.set1_us !== undefined) sets.push(`${score.set1_us}-${score.set1_them}`);
    if (score.set2_us !== null && score.set2_us !== undefined) sets.push(`${score.set2_us}-${score.set2_them}`);
    if (score.set3_us !== null && score.set3_us !== undefined) sets.push(`${score.set3_us}-${score.set3_them}`);
    return sets.join(', ');
  };

  return (
    <div className="line-card">
      <div className="line-card-header">
        <div>
          <div style={{ fontWeight: 600 }}>
            {line.line_type.charAt(0).toUpperCase() + line.line_type.slice(1)} Line {line.line_number}
          </div>
          {useCustomDates && (
            <div className="text-muted text-sm">
              {line.custom_date ? formatDate(line.custom_date) : 'No date set'}
              {line.custom_time ? ` at ${formatTime(line.custom_time)}` : ''}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => onAssign(line)}>Assign Players</button>
          <button className="btn btn-outline btn-sm" onClick={() => onScore(line)}>
            {line.score ? 'Update Score' : 'Enter Score'}
          </button>
        </div>
      </div>

      <div className="mb-2">
        {line.players.length === 0 ? (
          <span className="text-muted text-sm">No players assigned</span>
        ) : (
          line.players.map(p => (
            <Link key={p.id} to={`/players/${p.player_id}`} className="player-chip" style={{ textDecoration: 'none' }}>
              👤 {p.name}
            </Link>
          ))
        )}
      </div>

      {line.score && (
        <div className="flex items-center gap-2">
          <span className={`badge ${line.score.result === 'win' || line.score.result === 'default_win' ? 'badge-green' : 'badge-red'}`}>
            {line.score.result?.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </span>
          {getScoreSummary(line.score) && <span className="text-sm text-muted">{getScoreSummary(line.score)}</span>}
        </div>
      )}
    </div>
  );
}

export default function MatchDetail() {
  const { id } = useParams();
  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selectedLine, setSelectedLine] = useState(null);
  const [availLinks, setAvailLinks] = useState([]);
  const [smsMessages, setSmsMessages] = useState([]);

  const load = useCallback(async () => {
    const [m, p] = await Promise.all([matchesApi.get(id), playersApi.list()]);
    setMatch(m); setPlayers(p); setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async (line) => { setSelectedLine(line); setModal('assign'); };
  const handleScore = async (line) => { setSelectedLine(line); setModal('score'); };

  const handleSaveAssignment = async (playerIds) => {
    await matchesApi.assignPlayers(id, selectedLine.id, playerIds);
    setModal(null); load();
  };

  const handleSaveScore = async (scoreData) => {
    await matchesApi.saveScore(id, selectedLine.id, scoreData);
    setModal(null); load();
  };

  const handleStatusChange = async (status) => {
    await matchesApi.update(id, { ...match, status, lines: undefined });
    load();
  };

  const handleNotifyAvailability = async () => {
    const baseUrl = window.location.origin;
    const res = await availApi.notifyMatch(id, baseUrl);
    setAvailLinks(res.links);
    setModal('links');
  };

  const handleNotifyAvailabilitySms = async () => {
    const baseUrl = window.location.origin;
    const res = await availApi.notifyMatch(id, baseUrl);
    setAvailLinks(res.links);
    setModal('avail-sms');
  };

  const handleNotifyAssignment = async () => {
    const res = await availApi.notifyAssignment(id);
    setSmsMessages(res.messages);
    setModal('assign-sms');
  };

  const handleSendSms = async (messages) => {
    return await availApi.sendSms(messages);
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!match) return <div className="card"><p>Match not found.</p></div>;

  const dateStr = formatDate(match.match_date);
  const timeStr = match.match_time ? formatTime(match.match_time) : '';

  const availByPlayer = {};
  for (const a of match.availability) {
    if (!availByPlayer[a.player_id]) availByPlayer[a.player_id] = [];
    availByPlayer[a.player_id].push(a);
  }

  const availableCount = new Set(match.availability.filter(a => a.available === 1).map(a => a.player_id)).size;
  const respondedCount = new Set(match.availability.map(a => a.player_id)).size;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link to="/" className="btn btn-outline btn-sm">← Schedule</Link>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          vs {match.opponent_name || 'TBD'}
        </h1>
      </div>

      {/* Match Info */}
      <div className="card">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex gap-2 mb-2 flex-wrap">
              <span className={`badge ${match.is_home ? 'badge-blue' : 'badge-orange'}`}>{match.is_home ? 'Home' : 'Away'}</span>
              <span className={`badge ${match.status === 'completed' ? 'badge-green' : match.status === 'cancelled' ? 'badge-red' : 'badge-blue'}`}>{match.status}</span>
              {match.season_name && <span className="badge badge-gray">{match.season_name}</span>}
            </div>
            <div style={{ fontSize: '1.05rem', marginBottom: 4 }}>
              {dateStr}{timeStr ? ` at ${timeStr}` : ''}
            </div>
            {!match.is_home && match.away_address && (
              <div className="text-muted text-sm">📍 {match.away_address}</div>
            )}
            {match.notes && <div className="text-muted text-sm mt-1">📝 {match.notes}</div>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {match.status !== 'completed' && <button className="btn btn-success btn-sm" onClick={() => handleStatusChange('completed')}>Mark Complete</button>}
            {match.status !== 'cancelled' && <button className="btn btn-danger btn-sm" onClick={() => handleStatusChange('cancelled')}>Cancel Match</button>}
            {match.status === 'cancelled' && <button className="btn btn-outline btn-sm" onClick={() => handleStatusChange('scheduled')}>Reschedule</button>}
          </div>
        </div>
      </div>

      {/* Availability Section */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Player Availability</div>
            <div className="text-muted text-sm">{respondedCount} responded · {availableCount} available</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={handleNotifyAvailability}>Get Links</button>
            <button className="btn btn-primary btn-sm" onClick={handleNotifyAvailabilitySms}>Send SMS</button>
          </div>
        </div>

        {match.availability.length === 0 ? (
          <p className="text-muted text-sm">No responses yet. Send availability links to players.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Status</th><th>Responded</th></tr></thead>
              <tbody>
                {Object.values(
                  match.availability.reduce((acc, a) => {
                    if (!acc[a.player_id]) acc[a.player_id] = { ...a, available: a.available };
                    else if (a.available === 1) acc[a.player_id].available = 1;
                    return acc;
                  }, {})
                ).map(a => (
                  <tr key={a.player_id}>
                    <td>{a.name}</td>
                    <td>
                      <span className={`badge ${a.available === 1 ? 'badge-green' : a.available === 0 ? 'badge-red' : 'badge-gray'}`}>
                        {a.available === 1 ? 'Available' : a.available === 0 ? 'Unavailable' : 'No Response'}
                      </span>
                    </td>
                    <td className="text-sm text-muted">{a.response_date ? new Date(a.response_date).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lines Section */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Lines & Assignments</div>
          <button className="btn btn-primary btn-sm" onClick={handleNotifyAssignment}>Notify Team</button>
        </div>
        {match.lines.length === 0 ? (
          <p className="text-muted text-sm">No lines configured for this match.</p>
        ) : (
          match.lines.map(line => (
            <LineCard
              key={line.id}
              line={line}
              allPlayers={players}
              availability={match.availability}
              matchId={id}
              onAssign={handleAssign}
              onScore={handleScore}
              useCustomDates={match.use_custom_dates}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {modal === 'assign' && selectedLine && (
        <Modal title={`Assign — ${selectedLine.line_type} Line ${selectedLine.line_number}`} wide onClose={() => setModal(null)}>
          <AssignModal
            line={selectedLine}
            allPlayers={players}
            availability={match.availability}
            onSave={handleSaveAssignment}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {modal === 'score' && selectedLine && (
        <Modal title={`Score — ${selectedLine.line_type} Line ${selectedLine.line_number}`} onClose={() => setModal(null)}>
          <ScoreModal line={selectedLine} onSave={handleSaveScore} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {modal === 'links' && (
        <Modal title="Availability Links" wide onClose={() => setModal(null)}>
          <LinksModal links={availLinks} onClose={() => setModal(null)} />
        </Modal>
      )}

      {modal === 'avail-sms' && (
        <Modal title="Send Availability SMS" wide onClose={() => setModal(null)}>
          <SmsModal links={availLinks} onSend={handleSendSms} onCancel={() => setModal(null)} type="avail" />
        </Modal>
      )}

      {modal === 'assign-sms' && (
        <Modal title="Notify Team of Assignments" wide onClose={() => setModal(null)}>
          <SmsModal
            links={smsMessages.map(m => ({ player: m.player, cell: m.player?.cell, body: m.body }))}
            onSend={handleSendSms}
            onCancel={() => setModal(null)}
            type="assign"
          />
        </Modal>
      )}
    </div>
  );
}
