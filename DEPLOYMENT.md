# 🚀 Free Deployment Guide

This guide describes how to deploy the Student Management & Geofencing System for free using **Neon** (PostgreSQL + PostGIS), **Render** (Node.js backend), and **Vercel** (Next.js admin dashboard).

---

## 📂 Architecture Overview

*   **Database (Neon)**: Hosts PostgreSQL + PostGIS (Spatial Data).
*   **Backend (Render)**: Runs the Express REST API and WebSockets server.
*   **Frontend (Vercel)**: Hosts the Next.js Admin Dashboard.

---

## 🛠️ Step 1: Database Setup on Neon (Free Postgres)

[Neon](https://neon.tech/) offers a generous free serverless PostgreSQL database with PostGIS support.

1.  **Sign Up / Log In**: Go to [neon.tech](https://neon.tech/) and create a free account.
2.  **Create a New Project**:
    *   Name: `student-geofence`
    *   Postgres Version: `15` or `16`
    *   Region: Choose the closest region to you (e.g., US East).
3.  **Get the Connection String**:
    *   On the Neon dashboard, find the **Connection Details** section.
    *   Select **Pooled Connection** (optional, but recommended for serverless) or standard connection.
    *   Copy the connection string (looks like `postgresql://<user>:<password>@<host>/neondb?sslmode=require`).
4.  *Note: There is no need to manually import SQL schemas! The backend will automatically apply `schema.sql` and seed default demo data on its first startup.*

---

## 🚀 Step 2: Deploy Backend on Render (Free Node.js Hosting)

[Render](https://render.com/) allows you to host Web Services (Express APIs) for free.

1.  **Sign Up / Log In**: Go to [render.com](https://render.com/) and connect your GitHub account.
2.  **Create a New Web Service**:
    *   Click **New +** and select **Web Service**.
    *   Connect the GitHub repository containing your project.
3.  **Configure Service Details**:
    *   **Name**: `student-geofence-backend`
    *   **Region**: Same region as your Neon database (minimizes latency).
    *   **Runtime**: `Node`
    *   **Root Directory**: `backend`
    *   **Build Command**: `npm run build`
    *   **Start Command**: `npm start`
    *   **Instance Type**: `Free`
4.  **Configure Environment Variables**:
    Click **Advanced** -> **Add Environment Variable** and configure the following:
    *   `PORT` = `10000` (Render default port)
    *   `NODE_ENV` = `production`
    *   `DATABASE_URL` = *(Your Neon Connection String)*
    *   `JWT_SECRET` = *(Choose a secure random string)*
5.  **Deploy**: Click **Create Web Service**.
    *   Render will build and start the service.
    *   Once deployed, copy your service URL (e.g., `https://student-geofence-backend.onrender.com`).
    *   Verify the backend is live by opening `https://your-backend-url.onrender.com/health` in your browser.

---

## 💻 Step 3: Deploy Frontend on Vercel (Free Next.js Hosting)

[Vercel](https://vercel.com/) is the native and most optimized platform to deploy Next.js applications for free.

1.  **Sign Up / Log In**: Go to [vercel.com](https://vercel.com/) and log in using GitHub.
2.  **Import Your Project**:
    *   Click **Add New...** -> **Project**.
    *   Select your GitHub repository.
3.  **Configure Project Settings**:
    *   **Framework Preset**: `Next.js`
    *   **Root Directory**: Click *Edit* and select the `admin-dashboard` folder.
4.  **Configure Environment Variables**:
    Add the following environment variables:
    *   `NEXT_PUBLIC_API_URL` = `https://your-backend-url.onrender.com/api` (Replace with your actual Render URL)
    *   `NEXT_PUBLIC_SOCKET_URL` = `https://your-backend-url.onrender.com` (Replace with your actual Render URL)
5.  **Deploy**: Click **Deploy**.
    *   Vercel will compile and host the dashboard in under 2 minutes.
    *   Once complete, you will receive a production URL (e.g., `https://your-project.vercel.app`).

---

## 🔑 Step 4: Login & Verify the Setup

Since the database auto-seeds on first startup, you can log in immediately to the admin dashboard using the default demo accounts:

*   **Admin Dashboard URL**: *(Your Vercel URL)*
*   **Admin Account**:
    *   **Email**: `admin@gmail.com`
    *   **Password**: `password123`
*   **Guard Account**:
    *   **Email**: `guard@gmail.com`
    *   **Password**: `password123`
*   **Student Simulator Account**:
    *   **Email**: `student1@gmail.com`
    *   **Password**: `password123`

### Verification Steps
1. Open your Vercel Admin Dashboard URL.
2. Log in with the **Admin Account** details.
3. Go to the **Geofences** tab: You should see a default `Main Campus Geofence` preloaded on the map.
4. Go to the **GPS Simulator** panel: Try registering or connecting the default student. The student simulator is pre-configured with coordinates inside the `Main Campus Geofence`, and you will see the active tracking indicator update in real-time.
