import React, { useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { matches as matchesApi, players as playersApi, availability as availApi, opponents as opponentsApi } from '../api';
import { TeamContext } from '../App';
import MatchForm from '../components/MatchForm';

// ---------------------------------------------------------------------------
// SMS URL helpers
//
// Platform differences:
//   iOS Safari:   sms://open?addresses=+1XXX,+1YYY&body=MSG
//                 The standard `sms:number` scheme only accepts a single
//                 recipient on iOS. The `sms://open?addresses=` variant is
//                 required to pre-populate multiple recipients in Messages.
//
//   Android:      smsto:number1,number2?body=MSG
//                 Most Android SMS apps honour the `smsto:` scheme with
//                 comma-separated numbers and a `?body=` parameter.
//
//   Fallback:     sms:number1,number2?body=MSG
//                 Desktop / unknown — opens whatever handler is registered.
//
// All numbers are normalised to E.164 (+1XXXXXXXXXX) before use.
// ---------------------------------------------------------------------------

/** Strip formatting from a phone number, return digits only. */
function normalizeUSPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null; // invalid — filter out
  return digits;
}

/** Build the platform-appropriate SMS URL for one or more recipients. */
function buildSmsUrl(numbers, message) {
  const valid = numbers.map(normalizeUSPhone).filter(Boolean);
  const encoded = encodeURIComponent(message);
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  if (isAndroid) {
    return `smsto:${valid.join(',')}?body=${encoded}`;
  }
  // iOS and macOS Messages both use the sms://open?addresses= variant
  return `sms://open?addresses=${valid.join(',')}&body=${encoded}`;
}

/** Open the SMS composer. Uses location.href (not window.open) for iOS reliability. */
function openGroupSms(numbers, message) {
  window.location.href = buildSmsUrl(numbers, message);
}

// Legacy single-cell cleaner kept for the individual `<a href>` links below
const cleanCell = (cell) => cell ? cell.replace(/\D/g, '') : '';

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
const formatTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
};

function buildMatchSlots(match, dateOptions) {
  const extras = dateOptions || [];
  if (extras.length === 0) {
    return [{ key: 'primary', match_date_option_id: null, date: match.match_date, time: match.match_time || null }];
  }
  return [
    { key: 'primary', match_date_option_id: null, date: match.match_date, time: match.match_time || null },
    ...extras.map(o => ({
      key: `opt-${o.id}`,
      match_date_option_id: o.id,
      date: o.option_date,
      time: o.option_time || null,
    })),
  ];
}

/** DB / API: 0 = no, 1 = yes, 2 = maybe */
function availNumeric(a) {
  const n = Number(a?.available);
  if (n === 2) return 2;
  if (n === 1) return 1;
  return 0;
}

function resolveLineDateTime(line, match) {
  if (line.match_date_option_id == null) {
    return { date: match.match_date, time: match.match_time || null };
  }
  const opt = (match.date_options || []).find(o => o.id === line.match_date_option_id);
  if (opt) return { date: opt.option_date, time: opt.option_time || null };
  return { date: match.match_date, time: match.match_time || null };
}

function formatAvailabilitySmsDates(match) {
  const opts = match.date_options || [];
  if (opts.length === 0) {
    return `📅 ${formatDate(match.match_date)}${match.match_time ? ` at ${formatTime(match.match_time)}` : ''}`;
  }
  const parts = [`${formatDate(match.match_date)}${match.match_time ? ` at ${formatTime(match.match_time)}` : ''} (primary)`];
  for (const o of opts) {
    parts.push(`${formatDate(o.option_date)}${o.option_time ? ` at ${formatTime(o.option_time)}` : ''}`);
  }
  return parts.join(' · ');
}

function buildLineupText(match) {
  const assignedLines = (match.lines || []).filter(l => l.players.length > 0);
  const sorted = [...assignedLines].sort((a, b) => {
    const order = t => t === 'singles' ? 0 : 1;
    if (order(a.line_type) !== order(b.line_type)) return order(a.line_type) - order(b.line_type);
    return (a.line_number || 0) - (b.line_number || 0);
  });
  const lineEntry = (l) => {
    const label = `${l.line_type === 'doubles' ? 'Doubles' : 'Singles'} Line ${l.line_number}:`;
    const names = [...new Set(l.players.map(p => p.name))].join(' & ');
    return `${label}\n${names}`;
  };
  const opponent = match.opponent_name || 'TBD';
  const headline = match.team_name ? `🎾 ${match.team_name} vs ${opponent}` : `Lineup vs ${opponent}`;
  const parts = [headline];
  const hasExtras = (match.date_options || []).length > 0;
  if (hasExtras) {
    const groups = [];
    const seen = new Map();
    for (const l of sorted) {
      const { date, time } = resolveLineDateTime(l, match);
      const key = `${date || ''}_${time || ''}`;
      if (!seen.has(key)) { seen.set(key, groups.length); groups.push({ date, time, lines: [l] }); }
      else groups[seen.get(key)].lines.push(l);
    }
    for (const g of groups) {
      parts.push('');
      parts.push(`📅 ${g.date ? formatDate(g.date) : 'Date TBD'}${g.time ? ` at ${formatTime(g.time)}` : ''}`);
      for (const ln of g.lines) { parts.push(''); parts.push(lineEntry(ln)); }
    }
  } else {
    parts.push('');
    parts.push(`📅 ${formatDate(match.match_date)}${match.match_time ? ` at ${formatTime(match.match_time)}` : ''}`);
    for (const l of sorted) { parts.push(''); parts.push(lineEntry(l)); }
  }
  return parts.join('\n');
}

// Shared icons
const SmsIcon = ({ size = 15 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const CopyIcon = ({ size = 15 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const CheckIcon = ({ size = 15 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const LinkIcon = ({ size = 15 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
/** Two silhouettes — line-ups / assigned players */
const TwoPeopleIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </svg>
);
/** Three people — same stroke language as TwoPeopleIcon (Lucide-style user silhouette ×3). */
const GroupPeopleIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// Single button → dropdown with SMS + Copy options (mobile-friendly)
function ShareMenu({ label, onSms, onCopy, align = 'right', hasSms = true, fullWidth = false, variant, smsOptions, smsLabel = 'Text Team' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
  };

  const handleSms = () => {
    onSms();
    setOpen(false);
  };

  const handleSmsOption = (fn) => {
    fn();
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: fullWidth ? '100%' : undefined,
          padding: '7px 12px', borderRadius: 8,
          background: variant === 'green' ? '#38a169' : variant === 'yellow' ? '#d69e2e' : 'white',
          border: variant === 'green' ? '1px solid #38a169' : variant === 'yellow' || variant === 'yellow-outline' ? '1.5px solid #d69e2e' : '1px solid #e2e8f0',
          color: variant === 'green' ? 'white' : variant === 'yellow' ? 'white' : variant === 'yellow-outline' ? '#b7791f' : '#4a5568',
          cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
          whiteSpace: 'nowrap', minHeight: 38,
        }}
      >
        {label}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.5 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', [align === 'right' ? 'right' : 'left']: 0,
          top: 'calc(100% + 6px)', zIndex: 200,
          background: 'white', borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.14)', border: '1px solid #e2e8f0',
          minWidth: 200, overflow: 'hidden',
        }}>
          {smsOptions ? smsOptions.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleSmsOption(opt.handler)}
              style={{
                width: '100%', padding: '14px 18px', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                fontSize: '0.95rem', color: '#2d3748', textAlign: 'left',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              {opt.icon ?? <SmsIcon size={18} />}
              {opt.label}
            </button>
          )) : hasSms && onSms && (
            <button
              onClick={handleSms}
              style={{
                width: '100%', padding: '14px 18px', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                fontSize: '0.95rem', color: '#2d3748', textAlign: 'left',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <SmsIcon size={18} />
              {smsLabel}
            </button>
          )}
          <button
            onClick={handleCopy}
            style={{
              width: '100%', padding: '14px 18px', background: 'none', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              fontSize: '0.95rem', color: copied ? '#38a169' : '#2d3748', textAlign: 'left',
            }}
          >
            {copied ? <CheckIcon size={18} /> : <LinkIcon size={18} />}
            {copied ? 'Copied!' : 'Copy Message'}
          </button>
        </div>
      )}
    </div>
  );
}

// Shared icon button style
const iconBtn = (active) => ({
  background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
  padding: '5px 7px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  color: active ? '#38a169' : '#718096',
});

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
function AssignModal({ line, allPlayers, availability, matchLines, lineSlotOptionId, onSave, onCancel }) {
  const maxPlayers = line.line_type === 'doubles' ? 2 : 1;
  const currentIds = [...new Set(line.players.map(p => p.player_id))];
  const [selected, setSelected] = useState(currentIds);
  const [filter, setFilter] = useState('available'); // all | available | maybe

  const slotAvail = availability.filter(a => {
    if (lineSlotOptionId == null || lineSlotOptionId === '') {
      return a.match_date_option_id == null;
    }
    return Number(a.match_date_option_id) === Number(lineSlotOptionId);
  });
  const availableIds = new Set(slotAvail.filter(a => availNumeric(a) === 1).map(a => a.player_id));
  const maybeIds = new Set(slotAvail.filter(a => availNumeric(a) === 2).map(a => a.player_id));

  // Players assigned to OTHER lines in this match (excluding current line's current players)
  const otherLinePlayerIds = new Set(
    (matchLines || [])
      .filter(l => l.id !== line.id)
      .flatMap(l => l.players.map(p => p.player_id))
  );

  const toggle = (id) => {
    if (otherLinePlayerIds.has(id)) return; // blocked
    if (selected.includes(id)) {
      setSelected(prev => prev.filter(x => x !== id));
    } else if (selected.length < maxPlayers) {
      setSelected(prev => [...prev, id]);
    }
  };

  const displayPlayers = filter === 'available'
    ? allPlayers.filter(p => availableIds.has(p.id) || otherLinePlayerIds.has(p.id))
    : filter === 'maybe'
      ? allPlayers.filter(p => maybeIds.has(p.id) || otherLinePlayerIds.has(p.id))
      : allPlayers;

  const sortedForAssign = [...displayPlayers.filter(p => p.active)].sort((a, b) => {
    if (filter === 'all') {
      const ma = maybeIds.has(a.id);
      const mb = maybeIds.has(b.id);
      if (ma !== mb) return ma ? 1 : -1;
    }
    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
  });

  return (
    <>
      <div className="modal-body">
        <div className="alert alert-info">
          Select {maxPlayers === 1 ? '1 player' : 'up to 2 players'} for {line.line_type} Line {line.line_number}.
          {selected.length > 0 && <span> <strong>{selected.length}/{maxPlayers} selected.</strong></span>}
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          <button type="button" className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('all')}>All Players</button>
          <button type="button" className={`btn btn-sm ${filter === 'available' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('available')}>Available ({availableIds.size})</button>
          <button type="button" className={`btn btn-sm ${filter === 'maybe' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('maybe')}>Maybe ({maybeIds.size})</button>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {sortedForAssign.map(p => {
            const isSelected = selected.includes(p.id);
            const isAvail = availableIds.has(p.id);
            const isMaybe = maybeIds.has(p.id);
            const isAssigned = otherLinePlayerIds.has(p.id);
            return (
              <div key={p.id} className="flex items-center gap-2 p-3 rounded border mb-2"
                style={{
                  background: isAssigned ? '#f7fafc' : isSelected ? '#ebf8ff' : 'white',
                  borderColor: isSelected ? '#4299e1' : '#e2e8f0',
                  cursor: isAssigned ? 'not-allowed' : 'pointer',
                  opacity: isAssigned ? 0.6 : 1,
                }}
                onClick={() => toggle(p.id)}>
                <input type="checkbox" checked={isSelected} disabled={isAssigned} onChange={() => toggle(p.id)} />
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  {p.cell && <span className="text-muted text-sm" style={{ marginLeft: 8 }}>{p.cell}</span>}
                </div>
                {isAssigned
                  ? <span className="badge badge-gray">Already Assigned</span>
                  : isAvail
                    ? <span className="badge badge-green">Available</span>
                    : isMaybe
                      ? <span className="badge badge-orange">Maybe</span>
                      : null
                }
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
function ScoreModal({ line, match, onSave, onCancel }) {
  const existing = line.score || {};
  const [form, setForm] = useState({
    set1_us: existing.set1_us ?? '', set1_them: existing.set1_them ?? '',
    set2_us: existing.set2_us ?? '', set2_them: existing.set2_them ?? '',
    set3_us: existing.set3_us ?? '', set3_them: existing.set3_them ?? '',
    result: existing.result || '', notes: existing.notes || ''
  });

  const numSets = match?.season_num_sets ?? 3;
  const seasonTiebreak = match?.season_last_set_tiebreak !== undefined ? !!match.season_last_set_tiebreak : true;

  // Default set3 tiebreak: use season setting if no existing data, else detect from scores
  const [set3IsTiebreak, setSet3IsTiebreak] = useState(() => {
    const u = existing.set3_us, t = existing.set3_them;
    if (u == null || u === '') return seasonTiebreak;
    return (Number(u) === 0 || Number(u) === 1) && (Number(t) === 0 || Number(t) === 1);
  });
  const [hideSet3, setHideSet3] = useState(numSets < 3);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inputRefs = useRef({});
  const notesRef = useRef(null);
  const fieldOrder = ['set1_us', 'set1_them', 'set2_us', 'set2_them', 'set3_us', 'set3_them'];

  // Smart detection: auto-set result and skip set 3 when sets 1 & 2 determine a winner
  useEffect(() => {
    const s1u = form.set1_us, s1t = form.set1_them;
    const s2u = form.set2_us, s2t = form.set2_them;
    if (s1u === '' || s1t === '' || s2u === '' || s2t === '') return;
    const weWon1 = Number(s1u) > Number(s1t);
    const weWon2 = Number(s2u) > Number(s2t);
    if (weWon1 && weWon2) {
      setForm(f => ({ ...f, result: 'win', set3_us: '', set3_them: '' }));
      setHideSet3(true);
      setTimeout(() => notesRef.current?.focus(), 50);
    } else if (!weWon1 && !weWon2) {
      setForm(f => ({ ...f, result: 'loss', set3_us: '', set3_them: '' }));
      setHideSet3(true);
      setTimeout(() => notesRef.current?.focus(), 50);
    } else if (numSets < 3) {
      // Split in 2-set match — hide set 3, let user pick result
      setHideSet3(true);
      setTimeout(() => notesRef.current?.focus(), 50);
    } else {
      setHideSet3(false);
    }
  }, [form.set1_us, form.set1_them, form.set2_us, form.set2_them]);

  const advance = (key) => {
    const idx = fieldOrder.indexOf(key);
    if (idx < fieldOrder.length - 1) {
      setTimeout(() => inputRefs.current[fieldOrder[idx + 1]]?.focus(), 0);
    }
  };

  const handleInput = (key, value, isTiebreak) => {
    if (isTiebreak && value !== '' && value !== '0' && value !== '1') return;
    setField(key, value);
    if (value.length >= 1) advance(key);
  };

  // Auto-detect result when tiebreak set 3 is complete
  useEffect(() => {
    if (!set3IsTiebreak || hideSet3) return;
    if (form.set3_us === '1' && form.set3_them === '0') {
      setForm(f => ({ ...f, result: 'win' }));
      setTimeout(() => notesRef.current?.focus(), 50);
    } else if (form.set3_us === '0' && form.set3_them === '1') {
      setForm(f => ({ ...f, result: 'loss' }));
      setTimeout(() => notesRef.current?.focus(), 50);
    }
  }, [form.set3_us, form.set3_them, set3IsTiebreak, hideSet3]);

  // Auto-detect result when set 3 is a full set and both scores entered
  useEffect(() => {
    if (set3IsTiebreak || hideSet3) return;
    if (form.set3_us === '' || form.set3_them === '') return;
    const weWon = Number(form.set3_us) > Number(form.set3_them);
    setForm(f => ({ ...f, result: weWon ? 'win' : 'loss' }));
    setTimeout(() => notesRef.current?.focus(), 50);
  }, [form.set3_us, form.set3_them, set3IsTiebreak, hideSet3]);

  const set3HasBoth = form.set3_us !== '' && form.set3_them !== '';
  const set3Invalid = !hideSet3 && set3IsTiebreak && set3HasBoth &&
    !((form.set3_us === '1' && form.set3_them === '0') || (form.set3_us === '0' && form.set3_them === '1'));

  const numStyle = () => ({
    width: 56, textAlign: 'center', padding: '9px 4px',
    border: '1.5px solid #cbd5e0',
    borderRadius: 8, fontSize: '1.2rem', fontWeight: 600,
    MozAppearance: 'textfield',
  });

  const ScoreInput = ({ field, isTiebreak = false }) => (
    <input
      ref={el => (inputRefs.current[field] = el)}
      className="no-spin"
      type="number" inputMode="numeric"
      min={0} max={isTiebreak ? 1 : 99}
      placeholder={field.endsWith('_us') ? 'Us' : 'Tm'}
      value={form[field]}
      onChange={e => handleInput(field, e.target.value, isTiebreak)}
      style={numStyle()}
    />
  );

  const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 };
  const labelStyle = { width: 48, fontWeight: 500, flexShrink: 0, fontSize: '0.9rem', color: '#4a5568' };
  const dash = <span style={{ color: '#718096', fontWeight: 700, fontSize: '1.1rem' }}>–</span>;

  return (
    <>
      <div className="modal-body">
        <p className="text-sm text-muted mb-4">{line.line_type.charAt(0).toUpperCase() + line.line_type.slice(1)} Line {line.line_number}</p>

        {[1, 2].map(n => (
          <div key={n} style={rowStyle}>
            <span style={labelStyle}>Set {n}</span>
            <ScoreInput field={`set${n}_us`} />
            {dash}
            <ScoreInput field={`set${n}_them`} />
          </div>
        ))}

        {/* Set 3 — hidden when sets 1 & 2 determine a clear winner */}
        {!hideSet3 && (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>Set 3</span>
              <ScoreInput field="set3_us" isTiebreak={set3IsTiebreak} />
              {dash}
              <ScoreInput field="set3_them" isTiebreak={set3IsTiebreak} />
              <button
                onClick={() => { setSet3IsTiebreak(b => !b); setField('set3_us', ''); setField('set3_them', ''); }}
                style={{
                  padding: '5px 10px', borderRadius: 12, border: '1px solid #e2e8f0',
                  background: set3IsTiebreak ? '#ebf8ff' : 'white',
                  color: set3IsTiebreak ? '#2b6cb0' : '#718096',
                  cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap',
                }}
              >
                {set3IsTiebreak ? 'Tie Breaker' : 'Set'}
              </button>
            </div>
            {set3IsTiebreak && (
              <p style={{ marginLeft: 58, fontSize: '0.72rem', color: set3Invalid ? '#d69e2e' : '#c0c9d4', marginTop: -6, marginBottom: 8 }}>
                must be 1 or 0
              </p>
            )}
          </>
        )}

        <div className="form-group mt-3">
          <label className="form-label">Result</label>
          <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
            {['win', 'loss', 'default_win', 'default_loss'].map(r => (
              <label key={r} className="form-check">
                <input type="radio" checked={form.result === r} onChange={() => setField('result', r)} />
                {r.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea ref={notesRef} className="form-control" rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={set3Invalid} onClick={() => onSave(form)}>Save Score</button>
      </div>
    </>
  );
}


// Availability: status tabs (counts = unique players), then grouped by date slot
function AvailabilityColumns({ match, players, matchId, onUpdate }) {
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('available');

  const teamLink = `${window.location.origin}/availability/match/${matchId}`;
  const opponent = match.opponent_name || 'TBD';
  const headline = match.team_name ? `🎾 ${match.team_name} vs ${opponent}\n\n` : '';
  const setStatusForSlot = async (playerId, slotOptionId, code) => {
    setSaving(true);
    try {
      await availApi.respondForTeam(matchId, playerId, [{ match_date_option_id: slotOptionId, available: code }]);
      onUpdate();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const slotPayload = useMemo(() => {
    const slots = buildMatchSlots(match, match.date_options || []);
    return slots.map((slot) => {
      const rows = match.availability.filter(a =>
        slot.match_date_option_id == null
          ? a.match_date_option_id == null
          : Number(a.match_date_option_id) === Number(slot.match_date_option_id)
      );
      const respondedIds = new Set(rows.map(a => a.player_id));
      const yes = rows.filter(a => availNumeric(a) === 1);
      const maybe = rows.filter(a => availNumeric(a) === 2);
      const no = rows.filter(a => {
        const v = availNumeric(a);
        return v !== 1 && v !== 2;
      });
      const noResponse = players.filter(p => p.active && !respondedIds.has(p.id));
      const slotTime = slot.time ? ` at ${formatTime(slot.time)}` : '';
      const slotTitle = `${formatDate(slot.date)}${slotTime}${slot.key === 'primary' ? ' (primary)' : ''}`;
      return {
        slot,
        rows,
        respondedIds,
        yes,
        maybe,
        no,
        noResponse,
        slotTitle,
      };
    });
  }, [match, players]);

  /** One player counted once per tab: e.g. "no response" = missing a row for any slot */
  const tabTotals = useMemo(() => {
    const slots = buildMatchSlots(match, match.date_options || []);
    const active = players.filter(p => p.active);
    const hasYes = new Set();
    const hasNo = new Set();
    const hasMaybe = new Set();
    const missingAnySlot = new Set();

    const rowForPlayerSlot = (playerId, slot) =>
      match.availability.find(a =>
        Number(a.player_id) === Number(playerId) &&
        (slot.match_date_option_id == null
          ? a.match_date_option_id == null
          : Number(a.match_date_option_id) === Number(slot.match_date_option_id))
      );

    for (const p of active) {
      for (const slot of slots) {
        const row = rowForPlayerSlot(p.id, slot);
        if (!row) {
          missingAnySlot.add(p.id);
        } else {
          const v = availNumeric(row);
          if (v === 1) hasYes.add(p.id);
          if (v === 0) hasNo.add(p.id);
          if (v === 2) hasMaybe.add(p.id);
        }
      }
    }

    return {
      available: hasYes.size,
      unavailable: hasNo.size,
      maybe: hasMaybe.size,
      no_response: missingAnySlot.size,
    };
  }, [match, players]);

  /** Players with zero availability rows for this match; Remind texts only them (match-level message, all dates). */
  const neverRespondedRemind = useMemo(() => {
    const idsWithRow = new Set((match.availability || []).map(a => Number(a.player_id)));
    const neverPlayers = players.filter(p => p.active && !idsWithRow.has(Number(p.id)));
    const noResponseCells = neverPlayers.filter(p => p.cell).map(p => p.cell);
    const datePart = formatAvailabilitySmsDates(match);
    const remindMsg = `${headline}Mark your availability${match.team_name ? '' : ` vs ${opponent}`} — ${datePart}: ${teamLink}`;
    return { noResponseCells, remindMsg, count: neverPlayers.length };
  }, [match.availability, match.team_name, players, headline, opponent, teamLink]);

  const tabs = [
    { id: 'available', label: 'Available', count: tabTotals.available },
    { id: 'unavailable', label: 'Not Available', count: tabTotals.unavailable },
    { id: 'maybe', label: 'Maybe', count: tabTotals.maybe },
    { id: 'no_response', label: 'No Response', count: tabTotals.no_response },
  ];

  const itemsForTab = (sp) => {
    if (activeTab === 'available') return sp.yes;
    if (activeTab === 'unavailable') return sp.no;
    if (activeTab === 'maybe') return sp.maybe;
    return sp.noResponse;
  };

  const PlayerRow = ({ slot, playerId, name }) => {
    const editKey = `${slot.key}:${playerId}`;
    const isEditing = editing === editKey;
    return (
      <div style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
        {isEditing ? (
          <>
            <div className="flex gap-2 flex-wrap" style={{ marginBottom: 4 }}>
              <button type="button" className="btn btn-sm" style={{ background: '#27ae60', color: 'white', minWidth: 38, minHeight: 38, fontSize: '0.9rem' }} disabled={saving} onClick={() => setStatusForSlot(playerId, slot.match_date_option_id, 1)} title="Available">✓</button>
              <button type="button" className="btn btn-sm" style={{ background: '#d69e2e', color: 'white', minWidth: 38, minHeight: 38, fontSize: '0.9rem' }} disabled={saving} onClick={() => setStatusForSlot(playerId, slot.match_date_option_id, 2)} title="Maybe">?</button>
              <button type="button" className="btn btn-sm" style={{ background: '#e53e3e', color: 'white', minWidth: 38, minHeight: 38, fontSize: '0.9rem' }} disabled={saving} onClick={() => setStatusForSlot(playerId, slot.match_date_option_id, 0)} title="Not available">✕</button>
              <button type="button" className="btn btn-outline btn-sm" style={{ minWidth: 38, minHeight: 38, fontSize: '0.9rem' }} onClick={() => setEditing(null)}>–</button>
            </div>
            <span style={{ fontSize: '0.9rem' }}>{name}</span>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.9rem' }}>{name}</span>
            <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem', opacity: 0.5 }} onClick={() => setEditing(editKey)}>Edit</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="avail-tab-row">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`btn btn-sm ${activeTab === t.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {activeTab === 'no_response' && neverRespondedRemind.count > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <ShareMenu
            label="Remind"
            smsLabel="Text Non-Replies"
            onSms={() => openGroupSms(neverRespondedRemind.noResponseCells, neverRespondedRemind.remindMsg)}
            onCopy={() => copyText(neverRespondedRemind.remindMsg)}
            hasSms={neverRespondedRemind.noResponseCells.length > 0}
            align="right"
            variant="yellow-outline"
          />
        </div>
      )}

      {slotPayload.map((sp) => {
        const { slot, slotTitle } = sp;
        const list = itemsForTab(sp);
        return (
          <div key={slot.key} className="avail-slot-section">
            <div className="avail-slot-header">{slotTitle}</div>
            <div className="avail-slot-body">
              {list.length === 0
                ? <div className="text-muted text-sm" style={{ padding: '4px 0' }}>—</div>
                : list.map(p => (
                  <PlayerRow
                    key={p.player_id || p.id}
                    slot={slot}
                    playerId={p.player_id || p.id}
                    name={p.name}
                  />
                ))
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Assignment notification — copyable lineup + group text + individual SMS links
function AssignmentNotifyModal({ match, messages, onClose }) {
  const [copied, setCopied] = useState(false);
  const [textSent, setTextSent] = useState(false);

  const lineupText = buildLineupText(match);
  const assignedLines = (match.lines || []).filter(l => l.players.length > 0);

  const copyLineup = () => {
    copyText(lineupText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const assignedCells = [...new Set(
    assignedLines.flatMap(l => l.players.map(p => p.cell).filter(Boolean))
  )];

  const handleGroupText = () => {
    openGroupSms(assignedCells, lineupText);
    setTextSent(true);
    setTimeout(() => setTextSent(false), 3000);
  };

  return (
    <>
      <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

        {assignedLines.length === 0 && (
          <div className="alert alert-warning">No players assigned to any lines yet.</div>
        )}

        {/* Lineup preview */}
        <pre style={{
          background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: '12px 14px', fontSize: '0.85rem', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', color: '#2d3748', marginBottom: 14, fontFamily: 'inherit',
        }}>
          {lineupText}
        </pre>

        {/* Send actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <button onClick={handleGroupText} title="Text lineup to team" style={iconBtn(textSent)}>
            {textSent ? <CheckIcon /> : <SmsIcon />}
          </button>
          <button onClick={copyLineup} title={copied ? 'Copied!' : 'Copy lineup text'} style={iconBtn(copied)}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>
            {textSent ? 'Opened SMS…' : copied ? 'Copied!' : 'Text or copy lineup'}
          </span>
        </div>

        {/* Per-player messages */}
        {messages.length > 0 && (
          <>
            <div style={{ fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a0aec0', marginBottom: 10 }}>
              Per-Player Messages
            </div>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: '1px solid #f0f0f0' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>{m.player.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#718096', lineHeight: 1.4 }}>{m.body}</div>
                </div>
                {m.player.cell ? (
                  <a
                    href={buildSmsUrl([m.player.cell], m.body)}
                    style={{ ...iconBtn(false), flexShrink: 0, textDecoration: 'none' }}
                    title={`Text ${m.player.name}`}
                  >
                    <SmsIcon />
                  </a>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: '#cbd5e0', flexShrink: 0 }}>no #</span>
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

function LineCard({ line, allPlayers, matchId, match, onAssign, onScore, onLineSlotChange, hasMultiDateOptions }) {
  const [slotSaving, setSlotSaving] = useState(false);
  const getScoreSummary = (score) => {
    if (!score) return null;
    const sets = [];
    if (score.set1_us !== null && score.set1_us !== undefined) sets.push(`${score.set1_us}-${score.set1_them}`);
    if (score.set2_us !== null && score.set2_us !== undefined) sets.push(`${score.set2_us}-${score.set2_them}`);
    if (score.set3_us !== null && score.set3_us !== undefined) sets.push(`${score.set3_us}-${score.set3_them}`);
    return sets.join(', ');
  };

  const assignedDetails = line.players.map(p => allPlayers.find(ap => ap.id === p.player_id)).filter(Boolean);
  const lineCells = assignedDetails.map(p => p.cell).filter(Boolean);
  const lineLabel = `${line.line_type.charAt(0).toUpperCase() + line.line_type.slice(1)} Line ${line.line_number}`;
  const { date: lineDate, time: lineTime } = resolveLineDateTime(line, match);
  const opp = match?.opponent_name || 'TBD';
  const reminderHeadline = match?.team_name ? `🎾 ${match.team_name} vs ${opp}\n\n` : '';
  const whenPart = `📅 ${lineDate ? formatDate(lineDate) : 'TBD'}${lineTime ? ` at ${formatTime(lineTime)}` : ''}`;
  const reminderMsg = match?.team_name
    ? `${reminderHeadline}Reminder: You're playing ${lineLabel} on ${whenPart}.`
    : `${reminderHeadline}Reminder: You're playing ${lineLabel} vs ${opp} on ${whenPart}.`;

  const handleReminderSms = () => openGroupSms(lineCells, reminderMsg);
  const handleReminderCopy = () => copyText(reminderMsg);

  const today = new Date().toISOString().slice(0, 10);
  const isMatchDay = lineDate && lineDate <= today;

  const handlePlayOnChange = async (e) => {
    const v = e.target.value;
    const optId = v === '' ? null : parseInt(v, 10);
    setSlotSaving(true);
    try {
      await matchesApi.updateLine(matchId, line.id, { match_date_option_id: Number.isFinite(optId) ? optId : null });
      onLineSlotChange?.();
    } finally {
      setSlotSaving(false);
    }
  };

  return (
    <div className="line-card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{lineLabel}</div>
        {hasMultiDateOptions && (
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Play on</label>
            <select
              className="form-control"
              style={{ fontSize: '0.9rem' }}
              value={line.match_date_option_id == null ? '' : String(line.match_date_option_id)}
              disabled={slotSaving}
              onChange={handlePlayOnChange}
            >
              <option value="">Primary — {formatDate(match.match_date)}{match.match_time ? ` · ${formatTime(match.match_time)}` : ''}</option>
              {(match.date_options || []).map(o => (
                <option key={o.id} value={String(o.id)}>
                  {formatDate(o.option_date)}{o.option_time ? ` · ${formatTime(o.option_time)}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {(lineDate || lineTime) && (
          <div className="text-muted text-sm" style={{ marginBottom: 6 }}>
            {lineDate ? formatDate(lineDate) : 'No date set'}
            {lineTime ? ` at ${formatTime(lineTime)}` : ''}
          </div>
        )}
        <div style={{ marginBottom: line.score ? 8 : 0 }}>
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

      {/* Right: action buttons stacked */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140, flexShrink: 0 }}>
        <button
          className={`btn btn-sm w-full ${line.players.length > 0 ? 'btn-outline' : 'btn-success'}`}
          onClick={() => onAssign(line)}
        >
          {line.players.length > 0 ? 'Edit Players' : 'Assign Players'}
        </button>
        <button
          className={`btn btn-sm w-full ${isMatchDay ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => onScore(line)}
        >
          {line.score ? 'Update Score' : 'Enter Score'}
        </button>
        {line.players.length > 0 && (
          <ShareMenu
            label="Send Reminder"
            onSms={lineCells.length > 0 ? handleReminderSms : null}
            onCopy={handleReminderCopy}
            hasSms={lineCells.length > 0}
            align="right"
            fullWidth
            variant="yellow-outline"
          />
        )}
      </div>
    </div>
  );
}

export default function MatchDetail() {
  const { id } = useParams();
  const { teamSeasons } = useContext(TeamContext);
  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [opponents, setOpponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selectedLine, setSelectedLine] = useState(null);
  const [smsMessages, setSmsMessages] = useState([]);
  const [editModal, setEditModal] = useState(false);

  const load = useCallback(async () => {
    const [m, p, o] = await Promise.all([matchesApi.get(id), playersApi.list(), opponentsApi.list()]);
    setMatch(m); setPlayers(p); setOpponents(o); setLoading(false);
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
    const { availability: _a, lines: _l, date_options: _d, ...safe } = match;
    await matchesApi.update(id, { ...safe, status });
    load();
  };

  const handleCopyTeamLink = () => {
    copyText(availSmsBody);
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
  const hasMultiDateOptions = (match.date_options || []).length > 0;

  const availableCount = new Set(match.availability.filter(a => availNumeric(a) === 1).map(a => a.player_id)).size;
  const maybeCount = new Set(match.availability.filter(a => availNumeric(a) === 2).map(a => a.player_id)).size;
  const respondedCount = new Set(match.availability.map(a => a.player_id)).size;

  const teamLink = `${window.location.origin}/availability/match/${id}`;
  const opponent = match.opponent_name || 'TBD';
  const availHeadline = match.team_name ? `🎾 ${match.team_name} vs ${opponent}\n\n` : '';
  const datePart = formatAvailabilitySmsDates(match);
  const availSmsBody = `${availHeadline}Mark your availability${match.team_name ? '' : ` vs ${opponent}`} — ${datePart}: ${teamLink}`;

  const lineupText = buildLineupText(match);
  const assignedLines = (match.lines || []).filter(l => l.players.length > 0);

  const allActiveCells = players.filter(p => p.active && p.cell).map(p => p.cell);
  const assignedLineCells = [...new Set(
    assignedLines.flatMap(l => l.players.map(p => p.cell).filter(Boolean))
  )];

  const handleTextTeamAvail = () => openGroupSms(allActiveCells, availSmsBody);
  const handleTextLineup = () => openGroupSms(assignedLineCells, lineupText);
  const handleTextTeamLineup = () => openGroupSms(allActiveCells, lineupText);

  const handleCopyLineup = () => {
    copyText(lineupText);
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
              <span className={`badge ${match.is_home ? 'badge-blue' : 'badge-orange'}`}>{match.is_home ? 'Home' : 'Away'}</span>
              <span className={`badge ${match.status === 'completed' ? 'badge-green' : match.status === 'cancelled' ? 'badge-red' : 'badge-blue'}`}>{match.status}</span>
              {match.season_name && <span className="badge badge-gray">{match.season_name}</span>}
            </div>
            <div style={{ fontSize: '1.05rem', marginBottom: 4 }}>
              {hasMultiDateOptions ? (
                <>
                  <div>{dateStr}{timeStr ? ` at ${timeStr}` : ''} <span className="text-muted text-sm">(primary)</span></div>
                  <ul className="text-muted text-sm" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {(match.date_options || []).map(o => (
                      <li key={o.id}>{formatDate(o.option_date)}{o.option_time ? ` at ${formatTime(o.option_time)}` : ''}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>{dateStr}{timeStr ? ` at ${timeStr}` : ''}</>
              )}
            </div>
            {!match.is_home && match.away_address && (
              <div className="text-muted text-sm">📍 {match.away_address}</div>
            )}
            {match.notes && <div className="text-muted text-sm mt-1">📝 {match.notes}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            {match.status !== 'completed' && (
              <button
                className="match-action-btn"
                style={{ background: '#38a169', color: 'white', border: '1.5px solid #38a169' }}
                onClick={() => { if (confirm('Mark this match as complete?')) handleStatusChange('completed'); }}
                title="Mark Complete"
              >
                <span className="btn-icon">✓</span>
                <span className="btn-label">Mark Complete</span>
              </button>
            )}
            <button
              className="match-action-btn btn-outline"
              onClick={() => setEditModal(true)}
              title="Edit Match"
            >
              <span className="btn-icon">✏</span>
              <span className="btn-label">Edit Match</span>
            </button>
            {match.status === 'cancelled' && (
              <button
                className="match-action-btn btn-outline"
                onClick={() => handleStatusChange('scheduled')}
                title="Reschedule"
              >
                <span className="btn-icon">↺</span>
                <span className="btn-label">Reschedule</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="match-detail-columns">
        {/* Availability Section */}
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card-title">Player Availability</div>
                <div className="text-muted text-sm">{respondedCount} responded · {availableCount} available · {maybeCount} maybe</div>
                <a href={teamLink} target="_blank" rel="noopener noreferrer" className="text-sm" style={{ color: '#3182ce', wordBreak: 'break-all' }}>{teamLink}</a>
              </div>
              <ShareMenu label="Request Availability" onSms={handleTextTeamAvail} onCopy={handleCopyTeamLink} variant="yellow" />
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
            <ShareMenu
              label="Send Line-ups"
              smsOptions={[
                { label: 'Send to Lines', handler: handleTextLineup, icon: <TwoPeopleIcon size={18} /> },
                { label: 'Send to Team', handler: handleTextTeamLineup, icon: <GroupPeopleIcon size={18} /> },
              ]}
              onCopy={handleCopyLineup}
              variant="yellow"
            />
          </div>
          {match.lines.length === 0 ? (
            <p className="text-muted text-sm">No lines configured for this match.</p>
          ) : (
            [...match.lines].sort((a, b) => {
              const typeOrder = t => t === 'singles' ? 0 : 1;
              if (typeOrder(a.line_type) !== typeOrder(b.line_type)) return typeOrder(a.line_type) - typeOrder(b.line_type);
              return (a.line_number || 0) - (b.line_number || 0);
            }).map(line => (
              <LineCard
                key={line.id}
                line={line}
                allPlayers={players}
                matchId={id}
                match={match}
                onAssign={handleAssign}
                onScore={handleScore}
                hasMultiDateOptions={hasMultiDateOptions}
                onLineSlotChange={load}
              />
            ))
          )}
        </div>
      </div>

      {/* Modals */}
      {modal === 'assign' && selectedLine && (
        <Modal title={`Assign — ${selectedLine.line_type} Line ${selectedLine.line_number}`} wide onClose={() => setModal(null)}>
          <AssignModal
            line={selectedLine}
            allPlayers={players}
            availability={match.availability}
            matchLines={match.lines}
            lineSlotOptionId={selectedLine.match_date_option_id}
            onSave={handleSaveAssignment}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {modal === 'score' && selectedLine && (
        <Modal title={`Score — ${selectedLine.line_type} Line ${selectedLine.line_number}`} onClose={() => setModal(null)}>
          <ScoreModal line={selectedLine} match={match} onSave={handleSaveScore} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {modal === 'assign-sms' && (
        <Modal title="Send Line-ups" wide onClose={() => setModal(null)}>
          <AssignmentNotifyModal match={match} messages={smsMessages} onClose={() => setModal(null)} />
        </Modal>
      )}

      {editModal && (
        <Modal title="Edit Match" wide onClose={() => setEditModal(false)}>
          <MatchForm
            initial={match}
            seasons={teamSeasons || []}
            opponents={opponents}
            onAddOpponent={async (name) => {
              const o = await opponentsApi.create({ name });
              setOpponents(prev => [...prev, o]);
              return o;
            }}
            onSave={async (formData) => {
              await matchesApi.update(id, formData);
              setEditModal(false);
              load();
            }}
            onCancel={() => setEditModal(false)}
            onCancelMatch={match.status !== 'cancelled' ? () => handleStatusChange('cancelled') : undefined}
          />
        </Modal>
      )}
    </div>
  );
}
