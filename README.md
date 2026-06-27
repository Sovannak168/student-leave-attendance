# 🛡️ Student Management & Geofencing System

A full-stack real-time student monitoring platform with GPS geofencing, dynamic QR-based gate access, and a live admin dashboard.

## Architecture Overview

```
┌──────────────────────┐    WebSocket / REST API    ┌──────────────────────────┐
│   Flutter Mobile App │ ◄──────────────────────── ▶│  Node.js / Express       │
│  (Student & Guard)   │                            │  Backend API             │
└──────────────────────┘                            │  Port 5000               │
                                                    └──────────┬───────────────┘
┌──────────────────────┐    WebSocket / REST API              │
│  Next.js Admin       │ ◄────────────────────────────────────┤
│  Dashboard           │                                      │
│  Port 3000           │                            ┌─────────▼───────────────┐
└──────────────────────┘                            │  PostgreSQL + PostGIS    │
                                                    │  Port 5432              │
                                                    └─────────────────────────┘
                                                    ┌─────────────────────────┐
                                                    │  Redis (Socket.IO)      │
                                                    │  Port 6379              │
                                                    └─────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 15 + PostGIS 3.4 (Spatial Queries) |
| Real-time | Socket.IO + Redis Adapter |
| Admin UI | Next.js 14 + Tailwind CSS + Leaflet Maps |
| Mobile | Flutter 3.x (iOS & Android) |
| Auth | JWT + Device UUID Binding |
| Maps | OpenStreetMap via Leaflet (no API key required) |

---

## Quick Start (Docker — Recommended)

### Prerequisites
- Docker Desktop installed and running
- Git

### 1. Clone and Start All Services

```bash
git clone <your-repo-url>
cd DUC

# Start PostgreSQL, Redis, Backend, and Admin Dashboard
docker compose up -d

# View logs
docker compose logs -f backend
```

### 2. Verify Services
- **Backend API**: http://localhost:5000/health
- **Admin Dashboard**: http://localhost:3000

> ⚠️ On first run, `schema.sql` is automatically applied to the database.

---

## Local Development Setup (No Docker)

### Prerequisites
- Node.js 20+
- PostgreSQL 15 with PostGIS extension
- Redis 7+
- Flutter SDK 3.x
- `psql` CLI

### Step 1: Database Setup

```bash
# Create database
psql -U postgres -c "CREATE DATABASE student_geofence;"

# Apply schema (installs uuid-ossp + postgis extensions and creates all tables)
psql -U postgres -d student_geofence -f backend/src/db/schema.sql

# Verify PostGIS is active
psql -U postgres -d student_geofence -c "SELECT PostGIS_version();"
```

### Step 2: Backend

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials (see Environment Variables below)

# Start development server (with hot reload)
npm run dev
```

Backend runs on **http://localhost:5000**

### Step 3: Admin Dashboard

```bash
cd admin-dashboard

# Install dependencies (includes leaflet for maps)
npm install

# Start development server
npm run dev
```

Dashboard runs on **http://localhost:3000**

### Step 4: Flutter Mobile App

```bash
cd mobile-app

# Install Flutter dependencies
flutter pub get

# Run on Android emulator or connected device
flutter run

# For iOS simulator (macOS only)
flutter run -d iPhone
```

> **Android Emulator Note**: The API base URL is pre-configured to `http://10.0.2.2:5000` which routes to your `localhost` from the Android emulator. For a physical Android device, change `ApiService.baseUrl` to your machine's local IP address (e.g., `http://192.168.1.x:5000`).

---

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/student_geofence
JWT_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_STRING_IN_PRODUCTION
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

> ⚠️ **Critical**: Change `JWT_SECRET` before any production deployment.

---

## API Reference

### Authentication
| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register student/guard/admin |
| `POST` | `/api/auth/login` | Public | Login (binds device UUID) |
| `GET` | `/api/auth/me` | Any | Get authenticated user info |
| `POST` | `/api/auth/reset-device` | Admin | Reset device binding |

### Geofences
| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/api/geofences` | Admin | Create polygon geofence |
| `GET` | `/api/geofences` | Any | List all geofences |
| `GET` | `/api/geofences/:id` | Any | Get single geofence |
| `PUT` | `/api/geofences/:id` | Admin | Update geofence |
| `DELETE` | `/api/geofences/:id` | Admin | Delete geofence |

### Leave Permissions
| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/api/permissions` | Student | Request leave |
| `GET` | `/api/permissions` | Any | List requests |
| `PUT` | `/api/permissions/:id` | Admin | Approve/Reject |
| `GET` | `/api/permissions/active/qr` | Student | Generate 30s QR JWT |

### Exit Logs
| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/api/exit-logs/scan` | Guard | Scan & validate QR code |
| `GET` | `/api/exit-logs` | Admin/Guard | View gate audit log |

---

## WebSocket Events

### Client → Server
| Event | Emitter | Payload | Description |
|---|---|---|---|
| `location_update` | Student | `{ lat, lng }` | Stream GPS coordinates |

### Server → Client
| Event | Receiver | Payload | Description |
|---|---|---|---|
| `student_location` | Admin room | `{ studentId, name, rollNumber, lat, lng, status }` | Live location broadcast |
| `geofence_alert` | Admin room | `{ ...location, alertMessage }` | Out-of-bounds breach alert |
| `student_geofence_warning` | Student socket | `{ message }` | Warning sent back to student |

---

## Testing with the Built-in GPS Simulator

The Admin Dashboard includes a **GPS Simulator** panel (accessible from the sidebar) that lets you test the full geofencing pipeline without a physical mobile device:

1. Log in as Admin → go to the **GPS Simulator** tab
2. Fill in student credentials (or use the default: `student1@gmail.com`)
3. Click **"Register & Connect"** (first time) or **"Login & Connect"**
4. Once connected, click **"📍 Emit Inside"** or **"🚨 Emit Outside"**
5. Watch the **Live Tracking** map and **alert console** update in real-time

---

## Setting Up Your First Admin Account

Since there's no admin creation UI, create the first admin directly via the API:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "YourSecurePassword",
    "role": "ADMIN"
  }'
```

Then log in at http://localhost:3000 with those credentials.

---

## Flutter App Screens

| Screen | Role | Features |
|---|---|---|
| `LoginScreen` | All | Email/password login, role detection, device UUID binding |
| `StudentDashboard` | Student | GPS toggle, live geofence status, 30s QR pass display, leave request form |
| `GuardDashboard` | Guard | Live QR scanner, validation result dialogs, scan logging |

---

## Project Structure

```
DUC/
├── backend/
│   ├── src/
│   │   ├── controllers/     # Route handlers (auth, geofence, permission, exitLog)
│   │   ├── db/              # PostgreSQL pool + schema.sql
│   │   ├── middleware/       # JWT auth middleware
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # Socket.IO server, geofenceService (ST_Contains)
│   │   ├── types/           # TypeScript types
│   │   ├── app.ts           # Express app
│   │   └── server.ts        # HTTP + Socket.IO bootstrap + cron
│   ├── Dockerfile
│   └── package.json
│
├── admin-dashboard/
│   ├── src/
│   │   ├── app/             # Next.js App Router (page.tsx, layout.tsx, globals.css)
│   │   └── components/      # MapComponent.tsx (Leaflet map)
│   ├── Dockerfile
│   ├── next.config.js
│   └── package.json
│
├── mobile-app/
│   ├── lib/
│   │   ├── main.dart        # App entry + session checker
│   │   ├── screens/         # login_screen, student_dashboard, guard_dashboard
│   │   └── services/        # api_service, location_service
│   └── pubspec.yaml
│
├── docker-compose.yml
└── README.md
```
