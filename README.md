# Syncify - Ready-to-deploy Starter

This repo is upgraded to be functional and deployable:
- Backend persists Spotify tokens in SQLite, refreshes tokens automatically, and exposes /spotify/command proxy endpoints.
- Frontend listens for room playback events and triggers the backend to perform Spotify playback actions for the signed-in user (so each person plays music using their own account).

Deployment checklist:
1. Create Spotify App in the Spotify Developer Dashboard.
2. Set the Redirect URI to: https://<your-backend-domain>/callback
3. In Railway (or another host), create service for backend and set env vars:
   - SPOTIFY_CLIENT_ID
   - SPOTIFY_CLIENT_SECRET
   - SPOTIFY_REDIRECT_URI
   - FRONTEND_ORIGIN
   - SESSION_SECRET
4. Ensure the frontend origin is set in FRONTEND_ORIGIN and frontend uses VITE_BACKEND_ORIGIN set to the backend URL.
5. Start backend (node backend/index.js) and frontend (npm run build & serve or deploy static files).

Limitations & next improvements:
- This starter stores tokens keyed by express-session id. For multi-device sign-in for same user, use a proper user model and persistent auth.
- Consider using HTTPS and secure cookies in production.
- Add device selection and Web Playback SDK integration for browser playback control.
