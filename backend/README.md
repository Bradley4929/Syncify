# Syncify - Backend (starter)

Minimal Express + Socket.IO backend scaffold for Syncify.

Key endpoints:
- GET /login -> start Spotify OAuth (Authorization Code)
- GET /callback -> Spotify redirects here to complete auth
- GET /session-info -> returns whether user is authenticated (session cookie)
- POST /room/:roomId/command -> relay a command to room peers (server emits via socket.io)

Notes:
- This demo stores OAuth tokens in session (memory). For production use a database.
- Review redirect URIs and Spotify app settings.
- Railway deployment: set environment variables from .env.example in Railway dashboard.
