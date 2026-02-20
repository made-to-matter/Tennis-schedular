import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const players = {
  list: () => api.get('/players').then(r => r.data),
  get: (id) => api.get(`/players/${id}`).then(r => r.data),
  create: (data) => api.post('/players', data).then(r => r.data),
  update: (id, data) => api.put(`/players/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/players/${id}`).then(r => r.data),
  import: (data) => api.post('/players/import', data).then(r => r.data),
};

export const opponents = {
  list: () => api.get('/opponents').then(r => r.data),
  create: (data) => api.post('/opponents', data).then(r => r.data),
  update: (id, data) => api.put(`/opponents/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/opponents/${id}`).then(r => r.data),
};

export const seasons = {
  list: () => api.get('/seasons').then(r => r.data),
  get: (id) => api.get(`/seasons/${id}`).then(r => r.data),
  create: (data) => api.post('/seasons', data).then(r => r.data),
  update: (id, data) => api.put(`/seasons/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/seasons/${id}`).then(r => r.data),
};

export const matches = {
  list: () => api.get('/matches').then(r => r.data),
  get: (id) => api.get(`/matches/${id}`).then(r => r.data),
  create: (data) => api.post('/matches', data).then(r => r.data),
  update: (id, data) => api.put(`/matches/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/matches/${id}`).then(r => r.data),
  updateLine: (matchId, lineId, data) => api.patch(`/matches/${matchId}/lines/${lineId}`, data).then(r => r.data),
  assignPlayers: (matchId, lineId, player_ids) => api.post(`/matches/${matchId}/lines/${lineId}/players`, { player_ids }).then(r => r.data),
  saveScore: (matchId, lineId, data) => api.post(`/matches/${matchId}/lines/${lineId}/score`, data).then(r => r.data),
};

export const availability = {
  forMatch: (matchId) => api.get(`/availability/match/${matchId}`).then(r => r.data),
  getByToken: (token) => api.get(`/availability/respond/${token}`).then(r => r.data),
  respondByToken: (token, responses) => api.post(`/availability/respond/${token}`, { responses }).then(r => r.data),
  notifyMatch: (matchId, base_url) => api.post(`/availability/notify/${matchId}`, { base_url }).then(r => r.data),
  sendSms: (messages) => api.post('/availability/send-sms', { messages }).then(r => r.data),
  notifyAssignment: (matchId) => api.post(`/availability/notify-assignment/${matchId}`).then(r => r.data),
};

export default api;
