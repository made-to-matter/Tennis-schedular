import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { availability as availApi } from '../api';

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};
const formatTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
};

export default function AvailabilityPublic() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [responses, setResponses] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    availApi.getByToken(token)
      .then(d => {
        setData(d);
        // Pre-fill existing responses
        const existing = {};
        for (const a of d.currentAvailability) {
          const key = a.match_line_id || 'match';
          existing[key] = a.available === 1;
        }
        setResponses(existing);
      })
      .catch(e => setError(e.response?.data?.error || 'Link not found or expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  const setResponse = (key, val) => setResponses(r => ({ ...r, [key]: val }));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let responseArr = [];
      if (data.match.use_custom_dates && data.lines) {
        responseArr = data.lines.map(l => ({
          match_line_id: l.id,
          available: responses[l.id] === true,
        }));
      } else {
        responseArr = [{
          match_line_id: null,
          available: responses['match'] === true,
        }];
      }
      await availApi.respondByToken(token, responseArr);
      setSubmitted(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Error saving response.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎾</div>
        <h2 style={{ marginBottom: 12 }}>Oops!</h2>
        <div className="alert alert-error">{error}</div>
      </div>
    </div>
  );

  const { match, player, lines } = data;
  const useCustom = match.use_custom_dates && lines && lines.length > 0;

  if (submitted) return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎾</div>
        <h2 style={{ marginBottom: 12, color: '#27ae60' }}>Thank you!</h2>
        <p>Your availability has been saved, {player.name}.</p>
        <p className="text-muted text-sm" style={{ marginTop: 8 }}>The captain will assign players to lines and let you know.</p>
        <div className="card" style={{ marginTop: 20, textAlign: 'left' }}>
          <div className="card-title mb-2">Your Responses</div>
          {useCustom ? (
            lines.map(l => (
              <div key={l.id} className="record-row">
                <div>
                  <strong>{l.line_type.charAt(0).toUpperCase() + l.line_type.slice(1)} Line {l.line_number}</strong>
                  <div className="text-sm text-muted">{l.custom_date ? formatDate(l.custom_date) : ''} {l.custom_time ? formatTime(l.custom_time) : ''}</div>
                </div>
                <span className={`badge ${responses[l.id] ? 'badge-green' : 'badge-red'}`}>
                  {responses[l.id] ? 'Available' : 'Unavailable'}
                </span>
              </div>
            ))
          ) : (
            <div className="record-row">
              <div><strong>Match Day</strong></div>
              <span className={`badge ${responses['match'] ? 'badge-green' : 'badge-red'}`}>
                {responses['match'] ? 'Available' : 'Unavailable'}
              </span>
            </div>
          )}
        </div>
        <button className="btn btn-outline mt-4" onClick={() => setSubmitted(false)}>Update Response</button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🎾</div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Tennis Match Availability</h1>
        <p style={{ color: '#718096' }}>Hi {player.name}! Please let your captain know if you can play.</p>
      </div>

      {/* Match Info */}
      <div className="card">
        <div className="card-title mb-3">Match Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div className="text-muted text-sm">Opponent</div>
            <div style={{ fontWeight: 600 }}>{match.opponent_name || 'TBD'}</div>
          </div>
          <div>
            <div className="text-muted text-sm">Location</div>
            <div style={{ fontWeight: 600 }}>{match.is_home ? 'Home' : 'Away'}</div>
          </div>
          <div>
            <div className="text-muted text-sm">Date</div>
            <div>{formatDate(match.match_date)}</div>
          </div>
          <div>
            <div className="text-muted text-sm">Time</div>
            <div>{match.match_time ? formatTime(match.match_time) : 'TBD'}</div>
          </div>
          {!match.is_home && match.away_address && (
            <div style={{ gridColumn: '1/-1' }}>
              <div className="text-muted text-sm">Address</div>
              <div>{match.away_address}</div>
            </div>
          )}
        </div>
      </div>

      {/* Availability Selection */}
      {useCustom ? (
        <div className="card">
          <div className="card-title mb-2">Which lines can you play?</div>
          <p className="text-muted text-sm mb-3">Different lines play on different dates. Check each one you're available for.</p>
          {lines.map(l => (
            <div key={l.id} className="line-card" style={{ marginBottom: 12 }}>
              <div className="flex justify-between items-center mb-2">
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {l.line_type.charAt(0).toUpperCase() + l.line_type.slice(1)} Line {l.line_number}
                  </div>
                  {l.custom_date && <div className="text-sm text-muted">{formatDate(l.custom_date)}{l.custom_time ? ` at ${formatTime(l.custom_time)}` : ''}</div>}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  className={`avail-btn avail-btn-yes${responses[l.id] === true ? ' selected' : ''}`}
                  onClick={() => setResponse(l.id, true)}
                >
                  ✓ Available
                </button>
                <button
                  className={`avail-btn avail-btn-no${responses[l.id] === false ? ' selected' : ''}`}
                  onClick={() => setResponse(l.id, false)}
                >
                  ✕ Can't Play
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-title mb-3">Can you play this match?</div>
          <div className="flex gap-4">
            <button
              className={`avail-btn avail-btn-yes${responses['match'] === true ? ' selected' : ''}`}
              style={{ flex: 1, justifyContent: 'center', display: 'flex' }}
              onClick={() => setResponse('match', true)}
            >
              ✓ Yes, I'm Available
            </button>
            <button
              className={`avail-btn avail-btn-no${responses['match'] === false ? ' selected' : ''}`}
              style={{ flex: 1, justifyContent: 'center', display: 'flex' }}
              onClick={() => setResponse('match', false)}
            >
              ✕ Can't Play
            </button>
          </div>
        </div>
      )}

      <button
        className="btn btn-primary btn-lg btn-full"
        onClick={handleSubmit}
        disabled={submitting || (useCustom ? lines.every(l => responses[l.id] === undefined) : responses['match'] === undefined)}
      >
        {submitting ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Saving...</> : 'Submit Availability'}
      </button>

      <p className="text-muted text-sm" style={{ textAlign: 'center', marginTop: 12 }}>
        You can update your response at any time using this link.
      </p>
    </div>
  );
}
