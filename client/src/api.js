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

export const teams = {
  list: () => api.get('/teams').then(r => r.data),
  create: (data) => api.post('/teams', data).then(r => r.data),
  update: (id, data) => api.put(`/teams/${id}`, data).then(r => r.data),
  deactivate: (id) => api.patch(`/teams/${id}/deactivate`).then(r => r.data),
  activate: (id) => api.patch(`/teams/${id}/activate`).then(r => r.data),
  getPlayers: (id) => api.get(`/teams/${id}/players`).then(r => r.data),
  addPlayers: (id, player_ids) => api.post(`/teams/${id}/players`, { player_ids }).then(r => r.data),
  removePlayer: (id, playerId) => api.delete(`/teams/${id}/players/${playerId}`).then(r => r.data),
};

export const seasons = {
  list: (params) => api.get('/seasons', { params }).then(r => r.data),
  get: (id) => api.get(`/seasons/${id}`).then(r => r.data),
  create: (data) => api.post('/seasons', data).then(r => r.data),
  update: (id, data) => api.put(`/seasons/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/seasons/${id}`).then(r => r.data),
};

export const matches = {
  list: (params) => api.get('/matches', { params }).then(r => r.data),
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
  getForTeam: (matchId) => api.get(`/availability/match/${matchId}/team`).then(r => r.data),
  getPlayerAvailability: (matchId, playerId) => api.get(`/availability/match/${matchId}/player/${playerId}`).then(r => r.data),
  respondForTeam: (matchId, player_id, responses) => api.post(`/availability/match/${matchId}/respond`, { player_id, responses }).then(r => r.data),
  notifyMatch: (matchId, base_url) => api.post(`/availability/notify/${matchId}`, { base_url }).then(r => r.data),
  sendSms: (messages) => api.post('/availability/send-sms', { messages }).then(r => r.data),
  notifyAssignment: (matchId) => api.post(`/availability/notify-assignment/${matchId}`).then(r => r.data),
};

export default api;
