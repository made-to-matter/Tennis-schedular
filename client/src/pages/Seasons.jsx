import React, { useEffect, useState } from 'react';
import { seasons as seasonsApi } from '../api';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

const defaultLine = () => ({ line_number: 1, line_type: 'doubles' });

function SeasonForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial || { name: '', default_day_of_week: 0, default_time: '13:00', line_templates: [] }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addLine = () => {
    const next = (form.line_templates.length > 0 ? Math.max(...form.line_templates.map(l => l.line_number)) : 0) + 1;
    set('line_templates', [...form.line_templates, { line_number: next, line_type: 'doubles' }]);
  };

  const updateLine = (idx, field, val) => {
    const updated = [...form.line_templates];
    updated[idx] = { ...updated[idx], [field]: field === 'line_number' ? parseInt(val) : val };
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
          {form.line_templates.length === 0 && <p className="text-muted text-sm">No lines configured. Add lines above.</p>}
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

export default function Seasons() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => seasonsApi.list().then(setList).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) await seasonsApi.update(editing.id, data);
    else await seasonsApi.create(data);
    setModal(null); setEditing(null); load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this season? Matches will remain but season association will be lost.')) return;
    await seasonsApi.delete(id); load();
  };

  const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Seasons & Line Templates</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModal('form'); }}>+ New Season</button>
      </div>

      <div className="alert alert-info">
        Seasons define your default schedule (day/time) and line configuration. When creating matches, these defaults are auto-applied.
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🗓️</div>
            <p>No seasons yet. Create a season to set up your default schedule.</p>
          </div>
        </div>
      ) : (
        list.map(s => (
          <div key={s.id} className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{s.name}</div>
                <div className="text-muted text-sm" style={{ marginTop: 2 }}>
                  {s.default_day_of_week !== null ? `${DAYS[s.default_day_of_week]}s` : 'No default day'}
                  {s.default_time ? ` at ${formatTime(s.default_time)}` : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-outline btn-sm" onClick={() => { setEditing(s); setModal('form'); }}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Delete</button>
              </div>
            </div>
            <div>
              <div className="section-title">Lines</div>
              {s.line_templates.length === 0 ? (
                <p className="text-muted text-sm">No line template configured.</p>
              ) : (
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {s.line_templates.map(l => (
                    <span key={l.id} className={`badge ${l.line_type === 'doubles' ? 'badge-blue' : 'badge-orange'}`}>
                      {l.line_type === 'doubles' ? '🎾' : '🏃'} {l.line_type.charAt(0).toUpperCase() + l.line_type.slice(1)} Line {l.line_number}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {modal === 'form' && (
        <Modal title={editing ? 'Edit Season' : 'New Season'} onClose={() => { setModal(null); setEditing(null); }}>
          <SeasonForm initial={editing} onSave={handleSave} onCancel={() => { setModal(null); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}
