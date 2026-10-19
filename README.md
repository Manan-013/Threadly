<div align="center">

# Threadly

**Modern Open-Source Shared Inbox & Customer Service Desk for Gmail**

*Turn your existing Gmail into a high-powered team inbox with real-time collision detection, shared tags, SLA monitoring, internal team notes, and automated assignment.*

[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8.svg)](https://tailwindcss.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Features](#key-features) • [Architecture](#architecture) • [Quickstart](#quickstart-in-3-minutes) • [Gmail Integration](#how-gmail-sync-works) • [API & Sockets](#api--socket-reference) • [Contributing](#contributing)

</div>

---

## Why Threadly?

Traditional helpdesks like Zendesk, Front, and Intercom force support teams to abandon Gmail, juggle clunky external web portals, and pay hefty per-agent monthly subscriptions. Legacy shared inboxes often result in two agents accidentally responding to the same customer at once.

**Threadly** solves this by embedding directly into your team's existing **Gmail interface**:
- **Zero-Setup Gmail Sync**: Reads visible email threads and updates directly via the Chrome Extension DOM session—**no Google Cloud Console projects, API keys, or IMAP app passwords required**.
- **Real-Time Collision Detection**: Know immediately when another teammate is reading or typing a reply to a thread.
- **Embedded Directly in Gmail**: Access shared inboxes (Support, Sales, Billing), internal notes, and SLA timers without ever leaving `mail.google.com`.
- **100% Self-Hosted & Privacy-First**: All conversations, drafts, tags, and audit logs are stored securely in a local SQLite database that you own.

---

## Key Features

### In-Gmail Chrome Extension (Manifest V3)
- **Seamless Full View**: Toggle full-screen shared workspace directly inside the same Gmail tab with a single click or `Esc` key.
- **Sidebar Shared Folders**: Injects collaborative queues (*Unassigned*, *Mine*, *Assigned to me*, *Following*) directly beneath your native Gmail labels.
- **Sidecar Collaboration Panel**: View customer contact history, assign conversation owners, update tags, and monitor SLA countdowns right next to an open email.
- **Internal Yellow Notes**: Leave private `@mention` notes on email threads visible only to your teammates—customers will never see them.
- **Live Collision Warnings**: Shows real-time teammate avatar pulses and "Agent is typing..." alerts to prevent duplicate customer replies.

### Standalone Web Dashboard & Supervisor Suite
- **Multi-Channel Inbox**: Unified handling for Email, Live Chat, WhatsApp, and Voice inquiries.
- **Automated SLA & Load Balancing**: Configure First Response Time (FRT) and Resolution targets with automatic round-robin assignment.
- **Custom Dashboards & Reports**: Track team response velocity, ticket volume by tag, and download CSV audit reports.
- **CSAT Rating Surveys**: Automated 1-click customer satisfaction ratings injected into email signatures.
- **Shared Drafts & Split Private Replies**: Draft responses cooperatively with your team before dispatching to the client.

### Privacy & Authentication
- **Built-In Email & Password Auth**: Secure user registration and login powered by cryptographic `PBKDF2-SHA512` hashing.
- **Zero Third-Party Telemetry**: No tracking pixels, external data brokers, or proprietary cloud dependencies.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Google Chrome Tab                             │
│                         (https://mail.google.com)                       │
│                                                                         │
│   ┌───────────────────────────┐         ┌───────────────────────────┐   │
│   │ In-Gmail Left Navigation  │         │  Right-Side Collaboration │   │
│   │ • Support (Open/Mine)     │         │  • Assignee & SLA Timers  │   │
│   │ • Sales & Billing Queues  │         │  • Private Team Notes     │   │
│   │ • Unassigned Triage       │         │  • Customer Details       │   │
│   └───────────────────────────┘         └───────────────────────────┘   │
│                                                                         │
│   [Threadly Chrome Extension (Manifest V3 - Background Service Worker)] │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ REST / WebSocket (Port 4000)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Threadly Real-Time Backend                        │
│                      (Node.js + Express + Socket.io)                    │
│                                                                         │
│   • Collision Detection Hub          • Automated SLA Policy Engine      │
│   • Extension DOM Bulk Bridge        • Round-Robin Auto Assignment      │
│   • Local SQLite Database Engine     • Optional Google OAuth 2.0 Worker │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │ Proxy / JSON API (Port 5173)
                                     │
┌────────────────────────────────────┴────────────────────────────────────┐
│                    Standalone Supervisor Web Dashboard                  │
│                     (React 18 + Vite + Tailwind CSS)                    │
│                                                                         │
│   • Supervisor Admin Settings        • CSAT & Workload Analytics        │
│   • Custom Automation Builder        • Email Template Manager           │
│   • Embedded Full-Screen in Gmail    • Multi-Channel Chat Simulation    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quickstart in 3 Minutes

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher (Node 20+ recommended)
- Google Chrome browser (or any Chromium browser: Brave, Edge, Arc)
- `npm` or `yarn`

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/threadly.git
cd threadly
```

### 2. Start the Real-Time Backend
```bash
cd backend
npm install
npm start
```
*The backend boots on `http://localhost:4000` with an auto-initialized SQLite database at `backend/data/threadly.sqlite`.*

### 3. Start the Web Dashboard
In a new terminal window:
```bash
cd dashboard
npm install
npm run dev
```
*The dashboard launches on `http://localhost:5173`.*

### 4. Load the Chrome Extension
1. Open Google Chrome and go to `chrome://extensions/`.
2. Turn on the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the `extension/` directory inside this repository.
5. Open [Gmail](https://mail.google.com/) and refresh the page.

---

## How Gmail Sync Works

Threadly gives you two flexible ways to synchronize emails:

| Feature | Method 1: Chrome Extension Bridge (Recommended) | Method 2: Google OAuth 2.0 Cloud Sync (Optional) |
| :--- | :--- | :--- |
| **Setup Time** | **Instant (0 minutes)** | 5-10 minutes |
| **Google Cloud Setup** | **None** | Requires GCP Console Project |
| **Client Secrets / Keys** | **None** | Requires `CLIENT_ID` and `CLIENT_SECRET` |
| **How It Operates** | Runs directly inside your browser tab | Background server polling worker |
| **Privacy** | Zero data leaves your machine | Directly talks to Google REST API |

### Using Method 1: Zero-Setup Extension Bridge
1. Open [Gmail](https://mail.google.com/) in your browser with the Threadly extension loaded.
2. The extension automatically detects your inbox rows and synchronizes visible incoming emails and sent replies directly to your local Threadly server.
3. Click on any thread to view metadata, leave internal notes, or reassign conversation status.

### Using Method 2: Google Cloud OAuth 2.0 (Optional)
If you wish to enable 24/7 background polling when the browser is closed:
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and configure the **OAuth consent screen**.
3. Create an **OAuth 2.0 Client ID** with type *Web application*.
4. Add the Authorized Redirect URI:
   ```
   http://localhost:4000/api/auth/google/callback
   ```
5. Copy `backend/.env.example` to `backend/.env` and add your keys:
   ```env
   PORT=4000
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
   ```
6. In Threadly, open **Sync Gmail** and click **Sign in with Google**.

---

## Project Structure

```text
threadly/
├── backend/
│   ├── data/                 # SQLite database storage (git-ignored)
│   ├── src/
│   │   ├── db.js             # SQLite schema, migrations & password hashing
│   │   ├── engine.js         # SLA policy evaluator, sentiment & auto-routing
│   │   ├── gmailSync.js      # Extension bulk-sync parser & IMAP bridge
│   │   ├── googleAuth.js     # Google OAuth 2.0 & Gmail REST API integration
│   │   ├── seed.js           # Clean workspace initialization
│   │   └── server.js         # Express routes & Socket.io collision hub
│   ├── .env.example          # Environment variables template
│   └── package.json
│
├── dashboard/
│   ├── src/
│   │   ├── components/       # UI modals, collision bars, auth screens
│   │   │   ├── AuthScreen.tsx       # Email/password authentication
│   │   │   ├── AdminModal.tsx       # Workspace & team settings
│   │   │   ├── AnalyticsModal.tsx   # CSAT & performance reports
│   │   │   └── ThreadlyBrandIcon.tsx # Vector branding primitives
│   │   ├── App.tsx           # Main workspace & embedded Gmail controller
│   │   └── index.css         # Tailwind & Emil Kowalski micro-interactions
│   ├── vite.config.ts        # Vite dev server & API proxy
│   └── package.json
│
├── extension/
│   ├── manifest.json         # Chrome MV3 manifest configuration
│   ├── background.js         # Service worker & tab delegation
│   ├── content.js            # In-Gmail DOM injector, sidecar & sync engine
│   ├── content.css           # Seamless in-Gmail layout & animations
│   ├── popup.html            # Extension status popover
│   └── popup.js              # Quick launcher & health check
│
├── LICENSE                   # MIT License
└── README.md                 # Project documentation
```

---

## API & Socket Reference

### Core REST Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user with PBKDF2 hashed password |
| `POST` | `/api/auth/login` | Authenticate an existing user and receive session token |
| `GET` | `/api/bootstrap` | Fetch active workspace settings, team members, and inboxes |
| `GET` | `/api/conversations` | Query filtered conversations by inbox, assignee, or tag |
| `POST` | `/api/conversations` | Create a new ticket or log an external conversation |
| `POST` | `/api/conversations/:id/notes` | Add an internal private note with `@mentions` |
| `PATCH` | `/api/conversations/:id/assign` | Assign a ticket to a teammate |
| `POST` | `/api/gmail/extension-bulk-sync` | Bulk sync threads from the Chrome extension |

### Real-Time Socket.io Events

| Event Name | Direction | Payload Description |
| :--- | :--- | :--- |
| `join_conversation` | Client → Server | Join a thread room to broadcast viewer presence |
| `typing_status` | Client → Server | Notify teammates that an agent is drafting a reply |
| `presence_updated` | Server → Client | Active list of teammates currently viewing the ticket |
| `conversation_updated`| Server → Client | Real-time state push (new note, tag, or assignment change) |
| `setup_updated` | Server → Client | Step progress updates for workspace onboarding |

---

## Security & Data Privacy

- **Data Ownership**: All email threads, notes, and metrics remain strictly inside your local or self-hosted SQLite instance.
- **No Inbound Open Ports**: The Chrome extension communicates directly with your local or internal server.
- **Password Security**: Credentials are encrypted using `PBKDF2-SHA512` with unique salts.
- **Zero Third-Party Trackers**: No external analytics, telemetry, or remote script injections.

---

## Contributing

We love contributions! Whether you are fixing a bug, adding support for a new channel, or refining UI micro-interactions:

1. **Fork** the repository.
2. Create a feature branch:
   ```bash
   git checkout -b feature/awesome-feature
   ```
3. Commit your changes following clean commit guidelines:
   ```bash
   git commit -m "feat: add keyboard shortcut for tag selection"
   ```
4. Push to your branch:
   ```bash
   git push origin feature/awesome-feature
   ```
5. Open a **Pull Request**.

Please ensure that `npm run build` passes in `dashboard/` and no console errors are thrown before opening a PR.

---

## License

This project is licensed under the [MIT License](LICENSE) © 2026 Manan Ramani. You are free to modify, distribute, and self-host this software for commercial and private use.
