import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const BACKEND = import.meta.env.VITE_BACKEND_ORIGIN || 'http://localhost:8888';

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState('');
  const socketRef = useRef(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    socketRef.current = io(BACKEND, { withCredentials: true });
    socketRef.current.on('connect', () => console.log('socket connected', socketRef.current.id));
    socketRef.current.on('playback-event', (payload) => {
      setEvents(e => [payload, ...e].slice(0, 20));
    });
    socketRef.current.on('peer-joined', (p) => {
      setEvents(e => [{ type: 'peer-joined', ...p }, ...e]);
    });
    return () => {
      socketRef.current && socketRef.current.disconnect();
    };
  }, []);

  function createRoom() {
    const id = Math.random().toString(36).slice(2,9);
    setRoomId(id);
  }
  function joinRoom() {
    if (!roomId || !name) return alert('enter room id and name');
    socketRef.current.emit('join-room', { roomId, userName: name });
    setJoined(true);
  }
  function sendPlayback(type) {
    const payload = { roomId, type, position_ms: 0, sender: name, timestamp: Date.now() };
    socketRef.current.emit('playback-event', payload);
    setEvents(e => [payload, ...e].slice(0,20));
  }

  return (
    <div className="container">
      <h1>Syncify (starter)</h1>

      <div className="card">
        <h3>Authentication</h3>
        <p>Click below to login with Spotify (opens backend OAuth).</p>
        <a href={BACKEND + '/login'}><button>Login with Spotify</button></a>
        <p>After successful login the backend keeps tokens in session. The frontend uses socket.io for real-time sync.</p>
      </div>

      <div className="card">
        <h3>Room</h3>
        <div style={{marginBottom:10}}>
          <button onClick={createRoom}>Create random room</button>
          <input style={{marginLeft:10}} placeholder="room id" value={roomId} onChange={e=>setRoomId(e.target.value)} />
        </div>
        <div style={{marginBottom:10}}>
          <input placeholder="your name" value={name} onChange={e=>setName(e.target.value)} />
          <button style={{marginLeft:8}} onClick={joinRoom}>Join</button>
        </div>
        {joined && <div>
          <p>Joined room <b>{roomId}</b> as <b>{name}</b>.</p>
          <div>
            <button onClick={()=>sendPlayback('play')}>Send play</button>
            <button onClick={()=>sendPlayback('pause')}>Send pause</button>
            <button onClick={()=>sendPlayback('seek')}>Send seek (0)</button>
          </div>
        </div>}
      </div>

      <div className="card">
        <h3>Recent events</h3>
        <ul>
          {events.map((ev, i) => <li key={i}>{ev.type || ev.event || 'event'} — {ev.sender || ev.userName || ''} — {new Date(ev.timestamp || Date.now()).toLocaleTimeString()}</li>)}
        </ul>
      </div>

      <div style={{marginTop:20}}>
        <small>This is a starter scaffold. See README for full deployment & how to connect the client to Spotify playback APIs.</small>
      </div>
    </div>
  );
}
