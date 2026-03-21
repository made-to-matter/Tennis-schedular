import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { availability as availApi } from '../api';

const PLAYER_STORAGE_KEY = 'tennis_player_id';

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};
const formatTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
};

/** Primary + extra options; each slot has stable key and API match_date_option_id (null = primary). */
function buildMatchSlots(match, dateOptions) {
  const extras = dateOptions || [];
  const primary = {
    key: 'primary',
    match_date_option_id: null,
    date: match.match_date,
    time: match.match_time || null,
    label: 'Primary date',
  };
  if (extras.length === 0) return [primary];
  return [
    primary,
    ...extras.map(o => ({
      key: `opt-${o.id}`,
      match_date_option_id: o.id,
      date: o.option_date,
      time: o.option_time || null,
      label: 'Extra option',
    })),
  ];
}

function slotDisplay(slot) {
  return {
    dateStr: slot.date ? formatDate(slot.date) : 'Date TBD',
    timeStr: slot.time ? formatTime(slot.time) : null,
  };
}

/** Stored / API: 0 = no, 1 = yes, 2 = maybe */
function dbAvailCode(v) {
  const n = Number(v);
  if (n === 2) return 2;
  if (n === 1) return 1;
  return 0;
}

function availabilityLabel(code) {
  if (code === 1) return 'Available';
  if (code === 2) return 'Maybe';
  return 'Unavailable';
}

function availabilityBadgeClass(code) {
  if (code === 1) return 'badge-green';
  if (code === 2) return 'badge-orange';
  return 'badge-red';
}

export default function AvailabilityPublic() {
  const { matchId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [playerId, setPlayerId] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [responses, setResponses] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingMatch, setRefreshingMatch] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  useEffect(() => {
    availApi.getForTeam(matchId)
      .then(d => {
        setData(d);
        const savedId = parseInt(localStorage.getItem(PLAYER_STORAGE_KEY), 10);
        if (savedId && d.players.find(p => p.id === savedId)) {
          setPlayerId(savedId);
        }
      })
      .catch(e => setError(e.response?.data?.error || 'Match not found.'))
      .finally(() => setLoading(false));
  }, [matchId]);

  const dateOptions = data?.date_options || [];
  const slots = useMemo(
    () => (data?.match ? buildMatchSlots(data.match, dateOptions) : []),
    [data?.match, dateOptions]
  );
  const multiSlot = dateOptions.length > 0;

  useEffect(() => {
    if (!playerId || !data) return;
    setAvailLoading(true);
    setResponses({});
    availApi.getPlayerAvailability(matchId, playerId)
      .then(({ availability }) => {
        const existing = {};
        if (multiSlot) {
          for (const a of availability) {
            const c = dbAvailCode(a.available);
            if (a.match_date_option_id == null) existing.primary = c;
            else existing[`opt-${a.match_date_option_id}`] = c;
          }
        } else {
          const row = availability.find(x => x.match_date_option_id == null);
          if (row) {
            const c = dbAvailCode(row.available);
            existing.match = c;
            existing.primary = c;
          }
        }
        setResponses(existing);
      })
      .finally(() => setAvailLoading(false));
  }, [playerId, matchId, data, multiSlot]);

  const selectPlayer = (id) => {
    localStorage.setItem(PLAYER_STORAGE_KEY, String(id));
    setPlayerId(id);
    setSubmitted(false);
    setResponses({});
  };

  const switchPlayer = () => {
    setPlayerId(null);
    setSubmitted(false);
    setResponses({});
  };

  const setResponse = (key, val) => setResponses((r) => {
    if (!multiSlot && (key === 'match' || key === 'primary')) {
      return { ...r, match: val, primary: val };
    }
    return { ...r, [key]: val };
  });

  const handleUpdateResponse = async () => {
    setRefreshingMatch(true);
    setRefreshError(null);
    try {
      const d = await availApi.getForTeam(matchId);
      setData(d);
      setSubmitted(false);
    } catch (e) {
      setRefreshError(e.response?.data?.error || 'Could not reload match.');
    } finally {
      setRefreshingMatch(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let responseArr;
      if (multiSlot) {
        responseArr = slots.map(s => ({
          match_date_option_id: s.match_date_option_id,
          available: responses[s.key],
        }));
      } else {
        const v = responses.match !== undefined ? responses.match : responses.primary;
        responseArr = [{ match_date_option_id: null, available: v }];
      }
      await availApi.respondForTeam(matchId, playerId, responseArr);
      setSubmitted(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Error saving response.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisabled = multiSlot
    ? slots.some(s => responses[s.key] === undefined)
    : responses.match === undefined && responses.primary === undefined;

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

  const { match, players } = data;
  const selectedPlayer = players.find(p => p.id === playerId);

  if (!playerId) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🎾</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Tennis Match Availability</h1>
          <p style={{ color: '#718096' }}>
            vs {match.opponent_name || 'TBD'} &middot; {formatDate(match.match_date)}
            {multiSlot && <><br /><span className="text-sm">Multiple date options — pick your name to mark each.</span></>}
          </p>
        </div>
        <div className="card">
          <div className="card-title mb-3">Who are you?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {players.map(p => (
              <button
                key={p.id}
                className="btn btn-outline"
                style={{ justifyContent: 'center', padding: '14px 8px', fontWeight: 500, fontSize: '1rem' }}
                onClick={() => selectPlayer(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (availLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  if (submitted) return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎾</div>
        <h2 style={{ marginBottom: 12, color: '#27ae60' }}>Thank you!</h2>
        <p>Your availability has been saved, {selectedPlayer.name}.</p>
        <p className="text-muted text-sm" style={{ marginTop: 8 }}>The captain will assign players to lines and let you know.</p>
        <div className="card" style={{ marginTop: 20, textAlign: 'left' }}>
          <div className="card-title mb-2">Your Responses</div>
          {multiSlot ? (
            slots.map(s => {
              const { dateStr, timeStr } = slotDisplay(s);
              const code = responses[s.key];
              return (
                <div key={s.key} className="record-row">
                  <div>
                    <strong>{dateStr}</strong>
                    {s.key === 'primary' && <div className="text-xs text-muted">Primary</div>}
                    {timeStr && <div className="text-sm text-muted">{timeStr}</div>}
                  </div>
                  <span className={`badge ${availabilityBadgeClass(code)}`}>
                    {availabilityLabel(code)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="record-row">
              <div><strong>Match Day</strong></div>
              <span className={`badge ${availabilityBadgeClass(responses.match ?? responses.primary)}`}>
                {availabilityLabel(responses.match ?? responses.primary)}
              </span>
            </div>
          )}
        </div>
        {refreshError && (
          <div className="alert alert-error" style={{ marginTop: 16, textAlign: 'left' }}>{refreshError}</div>
        )}
        <div className="flex gap-3 mt-4" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-outline"
            disabled={refreshingMatch}
            onClick={handleUpdateResponse}
          >
            {refreshingMatch ? (
              <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 8, verticalAlign: 'middle' }} /> Loading…</>
            ) : (
              'Update Response'
            )}
          </button>
          <button type="button" className="btn btn-outline" disabled={refreshingMatch} onClick={switchPlayer}>Not {selectedPlayer.name}?</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🎾</div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Tennis Match Availability</h1>
        <p style={{ color: '#718096' }}>
          Hi {selectedPlayer.name}!{' '}
          <button
            type="button"
            onClick={switchPlayer}
            style={{ background: 'none', border: 'none', color: '#4299e1', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}
          >
            Not you?
          </button>
        </p>
      </div>

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
          <div style={{ gridColumn: multiSlot ? '1 / -1' : 'auto' }}>
            <div className="text-muted text-sm">{multiSlot ? 'Date options' : 'Date'}</div>
            {multiSlot ? (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.95rem' }}>
                <li>{formatDate(match.match_date)}{match.match_time ? ` · ${formatTime(match.match_time)}` : ''} <span className="text-muted">(primary)</span></li>
                {dateOptions.map(o => (
                  <li key={o.id}>
                    {formatDate(o.option_date)}{o.option_time ? ` · ${formatTime(o.option_time)}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <div>{formatDate(match.match_date)}</div>
            )}
          </div>
          {!multiSlot && (
            <div>
              <div className="text-muted text-sm">Time</div>
              <div>{match.match_time ? formatTime(match.match_time) : 'TBD'}</div>
            </div>
          )}
          {!match.is_home && match.away_address && (
            <div style={{ gridColumn: '1/-1' }}>
              <div className="text-muted text-sm">Address</div>
              <div>{match.away_address}</div>
            </div>
          )}
        </div>
      </div>

      {multiSlot ? (
        <div className="card">
          <div className="card-title mb-2">Which dates can you play?</div>
          {slots.length > 1 && (
            <p className="text-muted text-sm mb-3">Mark your availability for each option below.</p>
          )}
          {slots.map(s => {
            const { dateStr, timeStr } = slotDisplay(s);
            return (
              <div key={s.key} className="line-card" style={{ marginBottom: 12 }}>
                <div className="flex justify-between items-center mb-2">
                  <div style={{ fontWeight: 600 }}>
                    {dateStr}
                    {s.key === 'primary' && <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>(primary)</span>}
                    {timeStr && <span style={{ fontWeight: 400, marginLeft: 6 }} className="text-muted">at {timeStr}</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    className={`avail-btn avail-btn-yes${responses[s.key] === 1 ? ' selected' : ''}`}
                    onClick={() => setResponse(s.key, 1)}
                  >
                    ✓ Available
                  </button>
                  <button
                    type="button"
                    className={`avail-btn avail-btn-maybe${responses[s.key] === 2 ? ' selected' : ''}`}
                    onClick={() => setResponse(s.key, 2)}
                  >
                    ? Maybe
                  </button>
                  <button
                    type="button"
                    className={`avail-btn avail-btn-no${responses[s.key] === 0 ? ' selected' : ''}`}
                    onClick={() => setResponse(s.key, 0)}
                  >
                    ✕ Can&apos;t Play
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="card-title mb-3">Can you play this match?</div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className={`avail-btn avail-btn-yes${responses.match === 1 ? ' selected' : ''}`}
              style={{ flex: '1 1 140px', justifyContent: 'center', display: 'flex' }}
              onClick={() => setResponse('match', 1)}
            >
              ✓ Available
            </button>
            <button
              type="button"
              className={`avail-btn avail-btn-maybe${responses.match === 2 ? ' selected' : ''}`}
              style={{ flex: '1 1 140px', justifyContent: 'center', display: 'flex' }}
              onClick={() => setResponse('match', 2)}
            >
              ? Maybe
            </button>
            <button
              type="button"
              className={`avail-btn avail-btn-no${responses.match === 0 ? ' selected' : ''}`}
              style={{ flex: '1 1 140px', justifyContent: 'center', display: 'flex' }}
              onClick={() => setResponse('match', 0)}
            >
              ✕ Can&apos;t Play
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-lg btn-full"
        onClick={handleSubmit}
        disabled={submitting || submitDisabled}
      >
        {submitting ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Saving...</> : 'Submit Availability'}
      </button>

      <p className="text-muted text-sm" style={{ textAlign: 'center', marginTop: 12 }}>
        You can update your response at any time using this link.
      </p>
    </div>
  );
}
