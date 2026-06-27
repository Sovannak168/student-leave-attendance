
## Step-by-Step Local Setup Guide (No Docker)

### Prerequisites to Install

Run each command in PowerShell **as Administrator** (`Win+X → Windows PowerShell (Admin)`):

---

### 1. Node.js 20 LTS ✅ (Installing now)
```powershell
winget install --id OpenJS.NodeJS.20 --silent --accept-package-agreements --accept-source-agreements
```

---

### 2. PostgreSQL 17 (with PostGIS)

PostgreSQL 17 includes **StackBuilder** which lets you install PostGIS afterward:

```powershell
winget install --id PostgreSQL.PostgreSQL.17 --silent --accept-package-agreements --accept-source-agreements
```

After PostgreSQL installs:
1. Open **StackBuilder** from the Start Menu (it comes bundled with PostgreSQL)
2. Select your PostgreSQL 17 installation → click **Next**
3. Under "Spatial Extensions" → check **PostGIS** → click **Next** to install
4. StackBuilder will download and install PostGIS automatically

---

### 3. Redis on Windows

```powershell
winget install --id Redis.Redis --silent --accept-package-agreements --accept-source-agreements
```

This installs Redis as a Windows Service. It will start automatically.

---

### 4. After All Installs — **RESTART PowerShell** (critical for PATH)

Open a **new** PowerShell terminal, then verify:
```powershell
node --version     # Should show: v20.x.x
npm --version      # Should show: 10.x.x
psql --version     # Should show: psql (PostgreSQL) 17.x
redis-cli ping     # Should show: PONG
```

---

### 5. Create Database & Apply Schema

```powershell
# Create the database (password is 'postgres' by default from winget install)
psql -U postgres -c "CREATE DATABASE student_geofence;"

# Apply schema (creates all tables + enables PostGIS & uuid-ossp)
psql -U postgres -d student_geofence -f "C:\Users\sovannak\Desktop\DUC\backend\src\db\schema.sql"

# Verify PostGIS is working
psql -U postgres -d student_geofence -c "SELECT PostGIS_version();"
```

---

### 6. Start the Backend

```powershell
cd C:\Users\sovannak\Desktop\DUC\backend
npm install
npm run dev
```
✅ Backend API running at http://localhost:5000/health

---

### 7. Start the Admin Dashboard

Open a **second** PowerShell terminal:
```powershell
cd C:\Users\sovannak\Desktop\DUC\admin-dashboard
npm install
npm run dev
```
✅ Admin Dashboard at 



---

### 8. Create Your Admin Account

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admin@school.com","password":"Admin123!","role":"ADMIN"}'
```

Then open http://localhost:3000 and log in with those credentials.

---

### Common Issues

| Problem | Fix |
|---|---|
| `psql` not found after PostgreSQL install | Restart PowerShell — the installer adds to PATH |
| PostgreSQL password prompt | Default password from winget install is usually `postgres` |
| `redis-cli ping` fails | Run `net start Redis` to start the Redis service |
| Backend can't connect to DB | Check `backend/.env` → `DATABASE_URL` matches your postgres credentials |
