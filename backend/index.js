// Express + Socket.IO backend for Syncify (functional starter)
// - SQLite for token persistence (per-session)
// - Token refresh logic
// - /spotify/* endpoints that act on behalf of the session owner
const express = require('express');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_ORIGIN || '*' },
  cookie: false
});

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*', credentials: true }));
app.use(express.json());
app.use(cookieParser());
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me';
const sess = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
});
app.use(sess);

// SQLite DB to persist tokens per session
const dbFile = path.join(__dirname, 'tokens.db');
const db = new sqlite3.Database(dbFile);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS tokens (
    session_id TEXT PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER
  )`);
});

// Spotify OAuth config
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:8888/callback';

const scopes = [
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-email',
  'user-read-private'
].join(' ');

function saveTokensForSession(sessionId, access_token, refresh_token, expires_in) {
  const expires_at = Date.now() + expires_in * 1000;
  db.run(`INSERT OR REPLACE INTO tokens (session_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)`,
    [sessionId, access_token, refresh_token, expires_at]);
}
function getTokensForSession(sessionId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT access_token, refresh_token, expires_at FROM tokens WHERE session_id = ?`, [sessionId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}
async function refreshAccessTokenIfNeeded(sessionId) {
  const tokens = await getTokensForSession(sessionId);
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - 5000) {
    // Still valid
    return tokens.access_token;
  }
  // Refresh
  try {
    const resp = await axios({
      method: 'post',
      url: 'https://accounts.spotify.com/api/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token
      },
      auth: { username: CLIENT_ID, password: CLIENT_SECRET }
    });
    const data = resp.data;
    const new_access = data.access_token;
    const expires_in = data.expires_in || 3600;
    // Spotify may not return a new refresh_token, keep old one if not present
    const refresh_token = data.refresh_token || tokens.refresh_token;
    saveTokensForSession(sessionId, new_access, refresh_token, expires_in);
    return new_access;
  } catch (err) {
    console.error('Failed to refresh token', err.response ? err.response.data : err.message);
    return null;
  }
}

app.get('/login', (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  req.session.state = state;
  const url = 'https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    '&client_id=' + encodeURIComponent(CLIENT_ID) +
    '&scope=' + encodeURIComponent(scopes) +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
    '&state=' + encodeURIComponent(state);
  res.redirect(url);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  if (state === null || state !== req.session.state) {
    return res.status(400).send('State mismatch');
  }
  try {
    const tokenResp = await axios({
      method: 'post',
      url: 'https://accounts.spotify.com/api/token',
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: CLIENT_ID, password: CLIENT_SECRET }
    });
    const data = tokenResp.data;
    req.session.authenticated = true;
    // Persist tokens in SQLite by session id
    saveTokensForSession(req.sessionID, data.access_token, data.refresh_token, data.expires_in);
    const frontend = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
    return res.redirect(frontend + '/auth-success');
  } catch (err) {
    console.error('Callback error', err.response ? err.response.data : err.message);
    return res.status(500).send('Spotify auth failed');
  }
});

app.get('/session-info', async (req, res) => {
  const tokens = await getTokensForSession(req.sessionID);
  res.json({ authenticated: !!tokens, hasToken: !!tokens });
});

// Proxy endpoint for frontend to instruct Spotify API for the current session user
app.post('/spotify/command', async (req, res) => {
  // expected body: { action: 'play'|'pause'|'seek'|'transfer', device_id?, track_uri?, position_ms? }
  const action = req.body.action;
  const sessionId = req.sessionID;
  const access_token = await refreshAccessTokenIfNeeded(sessionId);
  if (!access_token) return res.status(401).json({ error: 'Not authenticated with Spotify' });
  try {
    if (action === 'play') {
      const { track_uri, position_ms } = req.body;
      const playBody = {};
      if (track_uri) playBody.uris = [track_uri];
      // issue play
      await axios({
        method: 'put',
        url: 'https://api.spotify.com/v1/me/player/play',
        headers: { Authorization: 'Bearer ' + access_token },
        params: {},
        data: playBody
      });
      if (typeof position_ms === 'number') {
        await axios({
          method: 'put',
          url: `https://api.spotify.com/v1/me/player/seek?position_ms=${position_ms}`,
          headers: { Authorization: 'Bearer ' + access_token },
        });
      }
      return res.json({ ok: true });
    } else if (action === 'pause') {
      await axios({
        method: 'put',
        url: 'https://api.spotify.com/v1/me/player/pause',
        headers: { Authorization: 'Bearer ' + access_token },
      });
      return res.json({ ok: true });
    } else if (action === 'seek') {
      const { position_ms } = req.body;
      await axios({
        method: 'put',
        url: `https://api.spotify.com/v1/me/player/seek?position_ms=${position_ms}`,
        headers: { Authorization: 'Bearer ' + access_token },
      });
      return res.json({ ok: true });
    } else if (action === 'transfer') {
      const { device_id } = req.body;
      await axios({
        method: 'put',
        url: 'https://api.spotify.com/v1/me/player',
        headers: { Authorization: 'Bearer ' + access_token },
        data: { device_ids: [device_id], play: false }
      });
      return res.json({ ok: true });
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('Spotify command error', err.response ? err.response.data : err.message);
    return res.status(500).json({ error: 'Spotify API error' });
  }
});

// Room command relay (same as before)
app.post('/room/:roomId/command', (req, res) => {
  const roomId = req.params.roomId;
  const cmd = req.body;
  io.to(roomId).emit('playback-command', cmd);
  return res.json({ ok: true });
});

// Socket.IO realtime layer
io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  socket.on('join-room', ({ roomId, userName }) => {
    socket.join(roomId);
    socket.data.userName = userName;
    io.to(roomId).emit('peer-joined', { id: socket.id, userName });
  });
  socket.on('leave-room', ({ roomId }) => {
    socket.leave(roomId);
    io.to(roomId).emit('peer-left', { id: socket.id, userName: socket.data.userName });
  });
  socket.on('playback-event', (payload) => {
    if (!payload.roomId) return;
    socket.to(payload.roomId).emit('playback-event', payload);
  });
  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 8888;
server.listen(PORT, () => {
  console.log('Syncify backend listening on', PORT);
});
