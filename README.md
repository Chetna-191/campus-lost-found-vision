# Campus Lost & Found Vision

An AI-powered campus lost and found management platform designed to automate item recovery across university grounds. The system combines modern web technologies with computer vision to automatically detect item categories and compute visual similarity between lost and found belongings. It provides students and campus staff with real-time match notifications, secure verification workflows, and intuitive reporting dashboards.

## Setup and Run Instructions

### 1. Environment Configuration
Copy `.env.example` to `.env` and fill in your Supabase and secret keys:
```bash
cp .env.example .env
```
Configure:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Supabase anon/public API key
- `JWT_SECRET`: Secret key for JWT session signing
- `PORT`: Server port (default: 5050)

### 2. Install Dependencies
Node.js dependencies:
```bash
npm install
```

Python AI microservice dependencies:
```bash
cd ai-service
python -m venv venv
.\venv\Scripts\activate  # On Windows
pip install -r requirements.txt
cd ..
```

### 3. Running the Application

Open two separate terminals to start both services:

#### Terminal 1 — AI Microservice (Port 8000)
```powershell
cd ai-service
.\venv\Scripts\uvicorn main:app --host 127.0.0.1 --port 8000
```

#### Terminal 2 — Node.js Express Backend & Web App (Port 5050)
```powershell
node server.js
```

### 4. Access the Platform
Open your browser and navigate to:
```
http://localhost:5050
```
