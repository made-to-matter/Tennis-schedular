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

// Works on iOS over HTTP (no HTTPS required)
function copyText(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  legacyCopy(text);
  return Promise.resolve();
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

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
  const currentIds = [...new Set(line.players.map(p => p.player_id))];
  const [selected, setSelected] = useState(currentIds);
  const [filter, setFilter] = useState('available'); // all | available

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
        <button className="btn btn-primary" onClick={() => onSave([...new Set(selected)])}>Assign Players</button>
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


// 3-column availability grid with inline captain editing
function AvailabilityColumns({ match, players, matchId, onUpdate }) {
  const [editing, setEditing] = useState(null); // player_id being edited
  const [saving, setSaving] = useState(false);

  const byPlayer = match.availability.reduce((acc, a) => {
    if (!acc[a.player_id]) acc[a.player_id] = { ...a };
    else if (a.available === 1) acc[a.player_id].available = 1;
    return acc;
  }, {});
  const respondedIds = new Set(Object.keys(byPlayer).map(Number));
  const available   = Object.values(byPlayer).filter(a => a.available === 1);
  const unavailable = Object.values(byPlayer).filter(a => a.available !== 1);
  const noResponse  = players.filter(p => p.active && !respondedIds.has(p.id));

  const setStatus = async (playerId, availableVal) => {
    setSaving(true);
    try {
      await availApi.respondForTeam(matchId, playerId, [{ match_line_id: null, available: availableVal }]);
      onUpdate();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const PlayerRow = ({ playerId, name }) => {
    const isEditing = editing === playerId;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontSize: '0.9rem' }}>{name}</span>
        {isEditing ? (
          <div className="flex gap-1">
            <button className="btn btn-sm" style={{ background: '#27ae60', color: 'white', padding: '2px 8px', fontSize: '0.75rem' }} disabled={saving} onClick={() => setStatus(playerId, true)}>✓</button>
            <button className="btn btn-sm" style={{ background: '#e53e3e', color: 'white', padding: '2px 8px', fontSize: '0.75rem' }} disabled={saving} onClick={() => setStatus(playerId, false)}>✕</button>
            <button className="btn btn-outline btn-sm" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={() => setEditing(null)}>–</button>
          </div>
        ) : (
          <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem', opacity: 0.5 }} onClick={() => setEditing(playerId)}>Edit</button>
        )}
      </div>
    );
  };

  const Col = ({ label, color, items }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color, marginBottom: 8 }}>
        {label} ({items.length})
      </div>
      {items.length === 0
        ? <div className="text-muted text-sm">—</div>
        : items.map(p => <PlayerRow key={p.player_id || p.id} playerId={p.player_id || p.id} name={p.name} />)
      }
    </div>
  );

  return (
    <div className="avail-cols">
      <Col label="Available"     color="#27ae60" items={available}   />
      <Col label="Not Available" color="#e53e3e" items={unavailable} />
      <Col label="No Response"   color="#718096" items={noResponse}  />
    </div>
  );
}

// Assignment notification — copyable lineup + group text + individual SMS links
function AssignmentNotifyModal({ match, messages, onClose }) {
  const [copied, setCopied] = useState(false);
  const [textSent, setTextSent] = useState(false);

  const assignedLines = (match.lines || []).filter(l => l.players.length > 0);
  const teamPrefix = match.team_name ? `🎾 ${match.team_name}\n\n` : '';

  const lineLabel = (l) => {
    const label = `${l.line_type === 'doubles' ? 'Doubles' : 'Singles'} Line ${l.line_number}`;
    return `${label}: ${[...new Set(l.players.map(p => p.name))].join(' & ')}`;
  };

  let lineupText;
  if (match.use_custom_dates) {
    const groups = [];
    const seen = new Map();
    for (const l of assignedLines) {
      const key = `${l.custom_date || ''}_${l.custom_time || ''}`;
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({ date: l.custom_date, time: l.custom_time, lines: [l] });
      } else {
        groups[seen.get(key)].lines.push(l);
      }
    }
    const parts = [`${teamPrefix}Lineup vs ${match.opponent_name || 'TBD'}:`];
    for (const g of groups) {
      const dateLabel = g.date ? formatDate(g.date) : 'Date TBD';
      const timeLabel = g.time ? ` at ${formatTime(g.time)}` : '';
      parts.push(`\n${dateLabel}${timeLabel}`);
      for (const l of g.lines) parts.push(`  ${lineLabel(l)}`);
    }
    lineupText = parts.join('\n');
  } else {
    lineupText = [
      `${teamPrefix}Lineup vs ${match.opponent_name || 'TBD'} on ${formatDate(match.match_date)}${match.match_time ? ' at ' + formatTime(match.match_time) : ''}:`,
      ...assignedLines.map(lineLabel),
    ].join('\n');
  }

  const copyLineup = () => {
    copyText(lineupText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleGroupText = () => {
    window.open(`sms:&body=${encodeURIComponent(lineupText)}`);
    setTextSent(true);
    setTimeout(() => setTextSent(false), 3000);
  };

  return (
    <>
      <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

        {assignedLines.length === 0 && (
          <div className="alert alert-warning">No players assigned to any lines yet.</div>
        )}

        {/* Text Team + Copy Lineup */}
        <div className="flex gap-2" style={{ marginBottom: 20 }}>
          <button className={`btn btn-sm ${textSent ? 'btn-success' : 'btn-primary'}`} onClick={handleGroupText}>
            {textSent ? '✓ Opened!' : '📱 Text Team'}
          </button>
          <button className={`btn btn-sm ${copied ? 'btn-success' : 'btn-outline'}`} onClick={copyLineup}>
            {copied ? '✓ Copied!' : 'Copy Lineup'}
          </button>
        </div>

        {/* Individual texts */}
        {messages.length > 0 && (
          <>
            <div className="card-title mb-2">Text Individual Players</div>
            {messages.map((m, i) => (
              <div key={i} className="flex items-center gap-2 p-3 rounded border mb-2" style={{ background: 'white' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{m.player.name}</div>
                  <div className="text-sm text-muted">{m.body}</div>
                </div>
                {m.player.cell ? (
                  <a
                    href={`sms:${m.player.cell}?body=${encodeURIComponent(m.body)}`}
                    className="btn btn-outline btn-sm"
                    style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}
                  >
                    Text
                  </a>
                ) : (
                  <span className="text-muted text-sm">No number</span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="modal-footer">
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
  const [smsMessages, setSmsMessages] = useState([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [availTextSent, setAvailTextSent] = useState(false);

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

  const handleCopyTeamLink = () => {
    const link = `${window.location.origin}/availability/match/${id}`;
    copyText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleNotifyAssignment = async () => {
    const res = await availApi.notifyAssignment(id);
    setSmsMessages(res.messages);
    setModal('assign-sms');
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!match) return <div className="card"><p>Match not found.</p></div>;

  const dateStr = formatDate(match.match_date);
  const timeStr = match.match_time ? formatTime(match.match_time) : '';

  const availableCount = new Set(match.availability.filter(a => a.available === 1).map(a => a.player_id)).size;
  const respondedCount = new Set(match.availability.map(a => a.player_id)).size;

  const teamLink = `${window.location.origin}/availability/match/${id}`;
  const teamPrefix = match.team_name ? `🎾 ${match.team_name}\n\n` : '';
  const availSmsBody = `${teamPrefix}Mark your availability for our match vs ${match.opponent_name || 'TBD'} on ${formatDate(match.match_date)}: ${teamLink}`;

  const handleTextTeamAvail = () => {
    window.open(`sms:&body=${encodeURIComponent(availSmsBody)}`);
    setAvailTextSent(true);
    setTimeout(() => setAvailTextSent(false), 3000);
  };

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
        <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
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
        <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
          {match.status !== 'completed' && <button className="btn btn-success btn-sm" onClick={() => handleStatusChange('completed')}>Mark Complete</button>}
          {match.status !== 'cancelled' && (
            <button
              className="btn btn-sm"
              style={{ background: 'white', color: '#e53e3e', border: '1.5px solid #e53e3e' }}
              onClick={() => { if (confirm('Are you sure you want to cancel this match?')) handleStatusChange('cancelled'); }}
            >
              Cancel Match
            </button>
          )}
          {match.status === 'cancelled' && <button className="btn btn-outline btn-sm" onClick={() => handleStatusChange('scheduled')}>Reschedule</button>}
        </div>
      </div>

      {/* Availability Section */}
      <div className="card">
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="card-title">Player Availability</div>
              <div className="text-muted text-sm">{respondedCount} responded · {availableCount} available</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-outline btn-sm" onClick={handleCopyTeamLink}>
                {copiedLink ? '✓ Copied!' : 'Copy Link'}
              </button>
              <button className={`btn btn-sm ${availTextSent ? 'btn-success' : 'btn-primary'}`} onClick={handleTextTeamAvail}>
                {availTextSent ? '✓ Opened!' : '📱 Text Team'}
              </button>
            </div>
          </div>
        </div>

        <AvailabilityColumns
          match={match}
          players={players}
          matchId={id}
          onUpdate={load}
        />
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

      {modal === 'assign-sms' && (
        <Modal title="Notify Team" wide onClose={() => setModal(null)}>
          <AssignmentNotifyModal match={match} messages={smsMessages} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
