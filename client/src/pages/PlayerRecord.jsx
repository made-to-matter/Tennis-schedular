import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { players as playersApi } from '../api';

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function PlayerRecord() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    playersApi.get(id).then(setData).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!data) return <div className="card"><p>Player not found.</p></div>;

  const { player, history, record } = data;
  const pct = record.played > 0 ? Math.round((record.wins / record.played) * 100) : 0;

  const singlesHistory = history.filter(h => h.line_type === 'singles');
  const doublesHistory = history.filter(h => h.line_type === 'doubles');
  const singlesWins = singlesHistory.filter(h => h.result === 'win' || h.result === 'default_win').length;
  const doublesWins = doublesHistory.filter(h => h.result === 'win' || h.result === 'default_win').length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link to="/players" className="btn btn-outline btn-sm">← Players</Link>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{player.name}</h1>
        <span className={`badge ${player.active ? 'badge-green' : 'badge-gray'}`}>{player.active ? 'Active' : 'Inactive'}</span>
      </div>

      <div className="card">
        <div className="grid-3" style={{ gap: 16, marginBottom: 0 }}>
          {player.email && <div><div className="text-muted text-sm">Email</div><div>{player.email}</div></div>}
          {player.cell && <div><div className="text-muted text-sm">Cell</div><div>{player.cell}</div></div>}
          <div><div className="text-muted text-sm">Member Since</div><div>{new Date(player.created_at).toLocaleDateString()}</div></div>
        </div>
      </div>

      {/* Record Summary */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#27ae60' }}>{record.wins}</div>
          <div className="stat-label">Wins</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#e74c3c' }}>{record.losses}</div>
          <div className="stat-label">Losses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pct}%</div>
          <div className="stat-label">Win Rate ({record.played} played)</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title mb-2">Singles</div>
          <div className="text-muted text-sm">
            {singlesWins}W – {singlesHistory.length - singlesWins}L
            {singlesHistory.length > 0 ? ` (${Math.round(singlesWins / singlesHistory.length * 100)}%)` : ''}
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title mb-2">Doubles</div>
          <div className="text-muted text-sm">
            {doublesWins}W – {doublesHistory.length - doublesWins}L
            {doublesHistory.length > 0 ? ` (${Math.round(doublesWins / doublesHistory.length * 100)}%)` : ''}
          </div>
        </div>
      </div>

      {/* Match History */}
      <div className="card">
        <div className="card-title mb-3">Match History</div>
        {history.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <p>No match history yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opponent</th>
                  <th>Line</th>
                  <th>Partner</th>
                  <th>Score</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => {
                  const sets = [];
                  if (h.set1_us !== null) sets.push(`${h.set1_us}-${h.set1_them}`);
                  if (h.set2_us !== null) sets.push(`${h.set2_us}-${h.set2_them}`);
                  if (h.set3_us !== null) sets.push(`${h.set3_us}-${h.set3_them}`);
                  return (
                    <tr key={i}>
                      <td>{formatDate(h.match_date)}</td>
                      <td>{h.opponent_name || '—'}</td>
                      <td>
                        <span className={`badge ${h.line_type === 'doubles' ? 'badge-blue' : 'badge-orange'}`}>
                          {h.line_type.charAt(0).toUpperCase() + h.line_type.slice(1)} {h.line_number}
                        </span>
                      </td>
                      <td className="text-sm">{h.partner_names || '—'}</td>
                      <td className="text-sm">{sets.length ? sets.join(', ') : '—'}</td>
                      <td>
                        {h.result ? (
                          <span className={`badge ${h.result === 'win' || h.result === 'default_win' ? 'badge-green' : 'badge-red'}`}>
                            {h.result.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
