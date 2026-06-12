# Production Deployment Guide - ownNBLM

**Last Updated:** June 12, 2026  
**Status:** Ready for deployment after fixing critical issues

---

## Overview

This guide walks you through deploying ownNBLM to production. The application has two parts:
1. **Frontend** (React + Vite) → Deploy to Vercel
2. **Backend** (FastAPI + PostgreSQL + Redis) → Deploy to always-on server

**Important:** Vercel serverless cannot run the FastAPI backend. You need a separate server for the backend.

---

## Architecture

```
┌─────────────────┐
│  Vercel CDN     │  Frontend (Static React app)
│  (Frontend)     │  - Serves index.html, JS, CSS
└────────┬────────┘  - Connects to backend API
         │
         │ HTTPS
         │
         ▼
┌─────────────────┐
│  Backend Server │  FastAPI application
│  (Render/Fly/   │  - API endpoints
│   Railway/VPS)  │  - PostgreSQL database
└─────────────────┘  - Huey task queue
```

---

## Prerequisites

- [x] GitHub account with repo access
- [x] Vercel account (free tier works)
- [ ] Backend hosting account (choose one):
  - Render.com (recommended for beginners)
  - Fly.io (better performance)
  - Railway.app (simplest)
  - VPS (advanced users)
- [ ] PostgreSQL database (often included with hosting)
- [ ] LiteLLM API key or OpenRouter API key
- [ ] Domain name (optional but recommended)

---

## Part 1: Backend Deployment

### Option A: Deploy to Render.com (Recommended)

**Pros:** Free tier, managed PostgreSQL, automatic HTTPS, easy setup  
**Cons:** Cold starts on free tier (~30s after inactivity)

#### Step 1: Create PostgreSQL Database

1. Go to [render.com](https://render.com) and sign in
2. Click "New +" → "PostgreSQL"
3. Configure:
   - Name: `ownnblm-db`
   - Database: `ownnblm`
   - User: `ownnblm_user`
   - Region: Choose closest to users
   - Instance Type: Free (or paid for better performance)
4. Click "Create Database"
5. **Save the connection details** (Internal Database URL)

#### Step 2: Create Web Service

1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - Name: `ownnblm-api`
   - Region: Same as database
   - Branch: `main`
   - Root Directory: `backend`
   - Runtime: `Python 3`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Instance Type: Free (or Starter $7/mo for no cold starts)

#### Step 3: Set Environment Variables

In Render dashboard, go to your web service → Environment → Add Environment Variables:

```bash
# Database (use Internal Database URL from Step 1)
DATABASE_URL=postgresql://ownnblm_user:password@host/ownnblm

# Security
SECRET_KEY=<generate-with: openssl rand -hex 32>
ENVIRONMENT=production

# CORS - Allow your Vercel domain
CORS_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com

# LLM Provider (choose one)
LITELLM_API_KEY=sk-your-key
# OR
OPENROUTER_API_KEY=sk-or-v1-your-key

# LLM Configuration
DEFAULT_LLM_MODEL=anthropic/claude-sonnet-4-6
LLM_BURN_ENABLED=true
LLM_BURN_BUDGET_USD=10.00

# Storage (local for now, S3 optional)
STORAGE_BACKEND=local
STORAGE_PATH=/var/data/uploads

# Auth
AUTH_RESTRICTED=true
AUTH_ALLOWLIST=your-email@example.com,team@example.com

# Optional: Huey task queue (Redis)
HUEY_REDIS_URL=redis://localhost:6379/0

# Optional: Sentry for error tracking
SENTRY_DSN=https://your-sentry-dsn
```

#### Step 4: Deploy

1. Click "Create Web Service"
2. Wait for build (~3-5 minutes)
3. Once deployed, note the URL: `https://ownnblm-api.onrender.com`
4. Test: Visit `https://ownnblm-api.onrender.com/health` - should return JSON

#### Step 5: Run Database Migrations

1. In Render dashboard, go to your web service → Shell
2. Run migrations:
```bash
cd backend
alembic upgrade head
```

3. Seed initial data (optional):
```bash
python -m app.scripts.seed_dev_data
```

---

### Option B: Deploy to Fly.io

**Pros:** Better performance, global edge network  
**Cons:** Slightly more complex setup

#### Step 1: Install Fly CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

#### Step 2: Login and Create App

```bash
fly auth login
cd backend
fly launch
```

Follow prompts:
- App name: `ownnblm-api` (or auto-generated)
- Region: Choose closest to users
- PostgreSQL: Yes → create a new Postgres database
- Redis: Yes (for Huey task queue)

#### Step 3: Set Environment Variables

```bash
fly secrets set \
  SECRET_KEY=$(openssl rand -hex 32) \
  ENVIRONMENT=production \
  CORS_ORIGINS=https://your-app.vercel.app \
  LITELLM_API_KEY=sk-your-key \
  DEFAULT_LLM_MODEL=anthropic/claude-sonnet-4-6 \
  LLM_BURN_ENABLED=true \
  LLM_BURN_BUDGET_USD=10.00 \
  AUTH_RESTRICTED=true \
  AUTH_ALLOWLIST=your-email@example.com
```

#### Step 4: Deploy

```bash
fly deploy
```

#### Step 5: Run Migrations

```bash
fly ssh console
cd backend
alembic upgrade head
exit
```

Your API is now live at `https://ownnblm-api.fly.dev`

---

### Option C: Deploy to Railway.app

**Pros:** Simplest setup, great developer experience  
**Cons:** No free tier (trial credits available)

#### Step 1: Create Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository

#### Step 2: Add Services

1. Click "New Service" → "Database" → "PostgreSQL"
2. Click "New Service" → "Database" → "Redis" (optional, for Huey)

#### Step 3: Configure Backend Service

1. Select the backend service
2. Settings → Configure:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

#### Step 4: Set Environment Variables

In Variables tab, add:
- `DATABASE_URL` → Reference PostgreSQL service
- `SECRET_KEY` → Generate with `openssl rand -hex 32`
- `ENVIRONMENT` → `production`
- `CORS_ORIGINS` → Your Vercel URL
- `LITELLM_API_KEY` → Your API key
- (See full list above in Render instructions)

#### Step 5: Deploy

Railway will auto-deploy. Your API will be at a generated URL like `https://ownnblm-api-production.up.railway.app`

---

### Option D: Deploy to VPS (Advanced)

**Pros:** Full control, cost-effective long-term  
**Cons:** Requires server management skills

#### Requirements
- Ubuntu 22.04 LTS server
- 2GB+ RAM
- SSH access
- Domain name with A record pointing to server IP

#### Step 1: Provision Server

```bash
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y python3.11 python3.11-venv python3-pip postgresql postgresql-contrib redis-server nginx certbot python3-certbot-nginx git

# Create app user
useradd -m -s /bin/bash ownnblm
```

#### Step 2: Setup PostgreSQL

```bash
sudo -u postgres psql

CREATE DATABASE ownnblm;
CREATE USER ownnblm_user WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE ownnblm TO ownnblm_user;
\q
```

#### Step 3: Deploy Application

```bash
# Switch to app user
su - ownnblm

# Clone repo
git clone https://github.com/yourusername/ownNBLM.git
cd ownNBLM/backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://ownnblm_user:your-secure-password@localhost/ownnblm
SECRET_KEY=$(openssl rand -hex 32)
ENVIRONMENT=production
CORS_ORIGINS=https://your-domain.com
LITELLM_API_KEY=sk-your-key
DEFAULT_LLM_MODEL=anthropic/claude-sonnet-4-6
EOF

# Run migrations
alembic upgrade head
```

#### Step 4: Setup Systemd Service

```bash
# As root, create service file
sudo nano /etc/systemd/system/ownnblm.service
```

Paste:
```ini
[Unit]
Description=ownNBLM FastAPI Application
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=ownnblm
WorkingDirectory=/home/ownnblm/ownNBLM/backend
Environment="PATH=/home/ownnblm/ownNBLM/backend/venv/bin"
ExecStart=/home/ownnblm/ownNBLM/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable ownnblm
sudo systemctl start ownnblm
sudo systemctl status ownnblm
```

#### Step 5: Setup Nginx

```bash
sudo nano /etc/nginx/sites-available/ownnblm
```

Paste:
```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ownnblm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d api.your-domain.com
```

Your API is now live at `https://api.your-domain.com`

---

## Part 2: Frontend Deployment to Vercel

### Step 1: Prepare Frontend

Ensure `frontend/.env.production` exists:
```bash
# This file is for build-time variables only
# Runtime variables go in Vercel dashboard
```

### Step 2: Deploy to Vercel

#### Via Dashboard (Easiest)

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Configure:
   - Framework Preset: Vite
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

5. **Environment Variables** (most important step!):
   Click "Environment Variables" and add:
   
   ```
   Key: VITE_API_URL
   Value: https://ownnblm-api.onrender.com
   (or your backend URL from Part 1)
   
   Environments: Production, Preview, Development (check all)
   ```

6. Click "Deploy"

#### Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
cd frontend
vercel --prod

# Set environment variable
vercel env add VITE_API_URL production
# Enter your backend URL when prompted
```

### Step 3: Verify Deployment

1. Visit your Vercel URL: `https://your-app.vercel.app`
2. Open browser console (F12)
3. Check for errors
4. Try logging in with your allowlisted email
5. Upload a test document
6. Test chat functionality

### Step 4: Custom Domain (Optional)

1. In Vercel dashboard → Settings → Domains
2. Add your domain: `app.yourdomain.com`
3. Follow DNS configuration instructions
4. Update `CORS_ORIGINS` in backend to include new domain

---

## Part 3: Post-Deployment Configuration

### Update Backend CORS

Make sure your backend's `CORS_ORIGINS` includes your Vercel domain:

**Render.com:**
- Go to web service → Environment
- Update `CORS_ORIGINS` to:
  ```
  https://your-app.vercel.app,https://app.yourdomain.com
  ```
- Click "Save Changes" (will redeploy)

**Fly.io:**
```bash
fly secrets set CORS_ORIGINS=https://your-app.vercel.app,https://app.yourdomain.com
```

**Railway:**
- Go to service → Variables
- Update `CORS_ORIGINS`
- Railway will auto-redeploy

### Test Full Flow

1. ✅ Visit frontend URL
2. ✅ Check browser console - no errors
3. ✅ Login with allowlisted email
4. ✅ Upload a test PDF
5. ✅ Create a notebook
6. ✅ Start a chat session
7. ✅ Ask a question about uploaded document
8. ✅ Check LLM response arrives correctly

---

## Part 4: Monitoring & Maintenance

### Setup Error Monitoring (Highly Recommended)

#### Sentry Integration

1. Create account at [sentry.io](https://sentry.io)
2. Create new project → Python (for backend)
3. Copy DSN
4. Add to backend environment variables:
   ```
   SENTRY_DSN=https://your-sentry-dsn@sentry.io/123456
   ```

### Health Checks

Setup uptime monitoring with:
- **UptimeRobot** (free)
- **BetterUptime**
- **Pingdom**

Monitor endpoint: `https://your-api.com/health`

### Database Backups

**Render:**
- Backups included on paid plans
- Manual backup via dashboard

**Fly.io:**
```bash
fly postgres backup create
```

**Railway:**
- Automatic daily backups on Pro plan

**VPS:**
Setup cron job:
```bash
sudo crontab -e

# Daily backup at 2am
0 2 * * * pg_dump -U ownnblm_user ownnblm > /backup/ownnblm_$(date +\%Y\%m\%d).sql
```

### Log Monitoring

**Render:** View logs in dashboard  
**Fly.io:** `fly logs`  
**Railway:** View logs in dashboard  
**VPS:** `sudo journalctl -u ownnblm -f`

---

## Troubleshooting

### Frontend shows "Internal Server Error"

**Cause:** Frontend can't reach backend  
**Fix:**
1. Check `VITE_API_URL` is set correctly in Vercel
2. Test backend directly: `curl https://your-api.com/health`
3. Check backend logs for errors
4. Verify CORS is configured correctly

### "Cannot connect to server" error

**Cause:** Backend is down or unreachable  
**Fix:**
1. Check backend health: `curl https://your-api.com/health`
2. Review backend logs
3. Restart backend service
4. Check database connection

### "Session expired" immediately after login

**Cause:** Frontend and backend on different domains with cookies  
**Fix:**
1. Ensure `allow_credentials=True` in CORS
2. Verify `CORS_ORIGINS` matches exactly (no trailing slash)
3. Use HTTPS on both frontend and backend

### "Failed to load resource: 500" errors

**Cause:** Backend exceptions  
**Fix:**
1. Check backend logs for stack traces
2. Verify environment variables are set
3. Check database connection
4. Ensure migrations are run

### Cold start delays (Render free tier)

**Cause:** Free tier spins down after inactivity  
**Fix:**
1. Upgrade to paid plan ($7/mo - no cold starts)
2. Setup external pinger to keep it warm
3. Show "Waking up server..." message to users

### Database connection errors

**Cause:** Wrong DATABASE_URL or connection limit  
**Fix:**
1. Verify DATABASE_URL format
2. Check database is running
3. Increase connection pool size
4. Consider upgrading database plan

---

## Security Checklist

- [ ] `AUTH_RESTRICTED=true` in production
- [ ] `CORS_ORIGINS` limited to your domains only
- [ ] `SECRET_KEY` is randomly generated (32+ chars)
- [ ] HTTPS enabled on both frontend and backend
- [ ] PostgreSQL not exposed to public internet
- [ ] Environment variables set (not hardcoded)
- [ ] Sentry or error monitoring configured
- [ ] Database backups enabled
- [ ] Rate limiting configured
- [ ] Content Security Policy headers set

---

## Scaling Considerations

### When to scale backend:
- Response time > 2 seconds
- CPU usage > 70% consistently
- Memory usage > 80%
- Database connection pool exhausted

### Scaling options:
1. **Vertical:** Upgrade to larger instance
2. **Horizontal:** Add more instances + load balancer
3. **Database:** Upgrade to dedicated PostgreSQL
4. **Cache:** Add Redis for caching

---

## Cost Estimates

### Free Tier (Good for testing)
- Backend: Render Free ($0) - with cold starts
- Database: Render Free PostgreSQL ($0) - 256MB
- Frontend: Vercel Free ($0)
- **Total: $0/month**
- **Limitation:** Cold starts, limited resources

### Starter (Recommended for small teams)
- Backend: Render Starter ($7/mo) - no cold starts
- Database: Render PostgreSQL ($7/mo) - 512MB
- Frontend: Vercel Free ($0)
- **Total: $14/month**
- **Good for:** 1-10 users, moderate usage

### Production (Growing teams)
- Backend: Render Pro ($25/mo) - 2GB RAM
- Database: Render PostgreSQL ($15/mo) - 1GB
- Frontend: Vercel Pro ($20/mo) - custom domains
- Monitoring: Sentry ($0-26/mo)
- **Total: $60-86/month**
- **Good for:** 10-50 users, high availability

---

## Next Steps

1. ✅ Follow Part 1 to deploy backend
2. ✅ Follow Part 2 to deploy frontend
3. ✅ Complete Part 3 configuration
4. ✅ Test full application flow
5. ✅ Setup monitoring (Part 4)
6. ✅ Review security checklist
7. ✅ Plan for scaling

**Questions?** Check the troubleshooting section or create an issue on GitHub.

**Production Ready Checklist:** See `QA_AUDIT_REPORT.md`
