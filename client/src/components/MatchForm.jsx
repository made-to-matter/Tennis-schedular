import React, { useState } from 'react';

function normalizeInitial(initial) {
  return {
    ...initial,
    lines: (initial.lines || []).map(l => ({
      line_number: l.line_number,
      line_type: l.line_type,
    })),
    date_options: (initial.date_options || []).map((o, i) => ({
      option_date: o.option_date || '',
      option_time: o.option_time || '',
      sort_order: o.sort_order != null ? o.sort_order : i,
    })),
  };
}

export default function MatchForm({ initial, seasons, opponents, onSave, onCancel, onAddOpponent, onCancelMatch }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    initial
      ? normalizeInitial(initial)
      : {
          season_id: '',
          opponent_id: '',
          match_date: '',
          match_time: '',
          is_home: 1,
          away_address: '',
          notes: '',
          lines: [],
          date_options: [],
        }
  );
  const [newOpponent, setNewOpponent] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSeasonChange = (seasonId) => {
    set('season_id', seasonId);
    if (seasonId) {
      const s = seasons.find(s => s.id === parseInt(seasonId));
      if (s && s.line_templates && s.line_templates.length > 0 && form.lines.length === 0) {
        set('lines', s.line_templates.map(l => ({ line_number: l.line_number, line_type: l.line_type })));
      }
      if (s && s.default_time && !form.match_time) set('match_time', s.default_time);
    }
  };

  const addLine = () => {
    const same = form.lines.filter(l => l.line_type === 'doubles');
    const next = same.length > 0 ? Math.max(...same.map(l => l.line_number)) + 1 : 1;
    set('lines', [...form.lines, { line_number: next, line_type: 'doubles' }]);
  };

  const updateLine = (idx, field, val) => {
    const updated = [...form.lines];
    if (field === 'line_type') {
      const same = updated.filter((l, i) => i !== idx && l.line_type === val);
      const newNum = same.length > 0 ? Math.max(...same.map(l => l.line_number)) + 1 : 1;
      updated[idx] = { ...updated[idx], line_type: val, line_number: newNum };
    } else {
      updated[idx] = { ...updated[idx], [field]: field === 'line_number' ? parseInt(val) : val };
    }
    set('lines', updated);
  };

  const removeLine = (idx) => set('lines', form.lines.filter((_, i) => i !== idx));

  const addDateOption = () => {
    set('date_options', [...form.date_options, { option_date: '', option_time: '' }]);
  };

  const updateDateOption = (idx, field, val) => {
    const next = [...form.date_options];
    next[idx] = { ...next[idx], [field]: val };
    set('date_options', next);
  };

  const removeDateOption = (idx) => {
    set('date_options', form.date_options.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!form.match_date) return;
    const filledOptions = form.date_options.filter(o => o.option_date);
    if (isEdit && (initial.date_options || []).length > filledOptions.length) {
      if (!confirm('Removing date options will delete saved availability for those slots. Continue?')) return;
    }
    const date_options = filledOptions.map((o, i) => ({
      option_date: o.option_date,
      option_time: o.option_time || null,
      sort_order: i,
    }));
    const {
      season_id, opponent_id, match_date, match_time, is_home, away_address, notes, lines,
    } = form;
    onSave({
      season_id,
      opponent_id,
      match_date,
      match_time,
      is_home,
      away_address,
      notes,
      lines,
      date_options,
    });
  };

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
          <div className="flex justify-between items-center mb-2">
            <label className="form-label" style={{ marginBottom: 0 }}>Extra date options</label>
            <button type="button" className="btn btn-outline btn-sm" onClick={addDateOption}>Add date option</button>
          </div>
          <p className="text-muted text-sm" style={{ marginTop: 0 }}>
            Optional additional days/times for this match. Players mark availability for each; you assign a slot per line on the match page.
          </p>
          {form.date_options.length === 0 ? (
            <p className="text-muted text-sm">None — only the primary match date above.</p>
          ) : (
            form.date_options.map((opt, idx) => (
              <div key={idx} className="line-card" style={{ marginBottom: 10 }}>
                <div className="flex gap-2 items-end flex-wrap">
                  <div style={{ flex: '1 1 140px' }}>
                    <label className="form-label">Date</label>
                    <input className="form-control" type="date" value={opt.option_date || ''} onChange={e => updateDateOption(idx, 'option_date', e.target.value)} />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <label className="form-label">Time (optional)</label>
                    <input className="form-control" type="time" value={opt.option_time || ''} onChange={e => updateDateOption(idx, 'option_time', e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" style={{ marginBottom: 2 }} onClick={() => removeDateOption(idx)}>✕</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
          <div className="flex justify-between items-center mb-2">
            <span className="section-title" style={{ marginBottom: 0 }}>Lines</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={addLine}>+ Add Line</button>
          </div>
          {form.lines.length === 0 && <p className="text-muted text-sm">No lines. Add lines or select a season with a template.</p>}
          {[...form.lines.map((line, idx) => ({ ...line, _idx: idx }))]
            .sort((a, b) => {
              if (a.line_type !== b.line_type) return a.line_type === 'singles' ? -1 : 1;
              return a.line_number - b.line_number;
            })
            .map(line => (
            <div key={line._idx} className="line-card">
              <div className="flex gap-2 items-center">
                <div style={{ flex: '0 0 80px' }}>
                  <label className="form-label">Line #</label>
                  <input className="form-control" type="number" min="1" value={line.line_number} onChange={e => updateLine(line._idx, 'line_number', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Type</label>
                  <select className="form-control" value={line.line_type} onChange={e => updateLine(line._idx, 'line_type', e.target.value)}>
                    <option value="singles">Singles</option>
                    <option value="doubles">Doubles</option>
                  </select>
                </div>
                <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLine(line._idx)}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="form-group mt-3">
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." />
        </div>

        {onCancelMatch && (
          <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 16 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ color: '#e53e3e', borderColor: '#e53e3e', width: '100%' }}
              onClick={() => { if (confirm('Are you sure you want to cancel this match?')) { onCancel(); onCancelMatch(); } }}
            >
              Cancel Match
            </button>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={handleSubmit}>
          {isEdit ? 'Update Match' : 'Create Match'}
        </button>
      </div>
    </>
  );
}
