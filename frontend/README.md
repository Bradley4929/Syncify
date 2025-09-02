# Syncify - Frontend (ready)

This frontend now listens for playback events from the Socket.IO server and will call the backend to perform Spotify Web API commands
on behalf of the signed-in user (so each client plays music via their own Spotify account).

Important notes:
- Each user must complete Spotify OAuth (click Login with Spotify). The backend stores tokens by session.
- Make sure the app is served over HTTPS in production (Spotify Web Playback SDK requires HTTPS & valid redirect).

To run locally:
1. Set VITE_BACKEND_ORIGIN in frontend/.env to your backend origin (e.g. http://localhost:8888)
2. npm install
3. npm run start

To deploy:
- Deploy the backend to Railway and set env vars from backend/.env.example.
- Deploy frontend to a static host and set FRONTEND_ORIGIN in backend to your frontend origin.
