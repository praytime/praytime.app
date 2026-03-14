# Repository Guidelines

## Project Structure & Module Organization
`src/index.js` is the main frontend entry, with `src/index.html` as the HTML template. Service workers are bundled from `src/sw.js` and `src/firebase-messaging-sw.js`. Static assets such as favicons, the web manifest, and the custom `404.html` live in `src/static/` and are copied into `dist/` during builds. Firebase Cloud Functions are isolated under `functions/index.js`. Treat `dist/` as generated output for Firebase Hosting, not as a source directory.

## Build, Test, and Development Commands
Run `npm install` in the repo root for frontend dependencies. Use `cd functions && npm install` for Cloud Functions dependencies.

- `npm run build` builds the frontend into `dist/` in development mode.
- `npm run serve` serves Firebase Hosting locally at `http://localhost:5000`.
- `npm run predeploy` creates the production bundle used before Hosting deploys.
- `npm run deploy` deploys the Hosting target defined in `firebase.json`.
- `cd functions && npm run serve`, `npm run shell`, `npm run deploy`, and `npm run logs` cover local function emulation, deploys, and logs.

## Security & Configuration Tips
Do not add secrets directly to `src/` or `functions/`. Prefer Firebase-managed configuration for anything sensitive, and regenerate build output instead of editing files in `dist/`.
