# Campus Lost & Found Vision

An intelligent, AI-powered campus lost and found management platform designed to automate item recovery across university grounds. The system combines modern web technologies with computer vision to automatically detect item categories, calculate visual/text-to-photo similarities between lost and found belongings, facilitate safe in-app student communication, and enforce strict campus security and moderation standards.

---

## 🏛️ System Architecture

```
[ Frontend: Semantic HTML5 / Responsive CSS3 / Vanilla JS (Mobile-Ready) ]
                                   │
                                   ▼
          [ Backend: Node.js + Express.js API (Port 5050) ]
          │                    │                     │
          ▼                    ▼                     ▼
[ Supabase PostgreSQL ]  [ Supabase Storage ]  [ AI Microservice (Port 8000) ]
  • Students Roster        • Item Photos         • YOLOv8 Category Detection
  • Email OTP Hashes                             • CLIP Image-Image Similarity
  • In-App Chat Messages                         • CLIP Text-Image Similarity
  • Row Level Security
```

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, modern CSS3 (Custom warm aesthetic palette with `Fraunces` serif and `Poppins` sans-serif), Vanilla JavaScript (native Fetch API, polling for in-app chat).
- **Backend API**: Node.js, Express.js, `nodemailer`, `bcryptjs` (12 salt rounds), `jsonwebtoken` (1-day expiry), `express-rate-limit`, `helmet`, `cors`, and `multer`.
- **Database & Storage**: Supabase PostgreSQL with Row Level Security (RLS) policies and Supabase Cloud Storage bucket `item-photos`.
- **AI Microservice**: Python FastAPI, Uvicorn, PyTorch, Pillow.
- **Computer Vision & AI Models**:
  - **YOLOv8 (`yolov8n.pt`)**: Real-time multi-class object detection for automatic category prediction.
  - **OpenAI CLIP (`openai/clip-vit-base-patch32`)**: Visual and multimodal text-image feature vector embeddings and cosine similarity scoring.

---

## ⚙️ Environment Variables

Create a `.env` file in `campus-lostfound-backend/` based on `.env.example`:

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Node.js Express server port | `5050` (or injected by Render) |
| `NODE_ENV` | Environment mode (`development` / `production`) | `development` |
| `AI_SERVICE_URL` | URL of the AI FastAPI microservice | `http://127.0.0.1:8000` (or your HF Space URL) |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated or `*`) | `*` (or your production domain) |
| `SUPABASE_URL` | Supabase Project REST URL | `https://xxxx.supabase.co` |
| `SUPABASE_KEY` | Supabase Anon or Service Role Key | `eyJh...` |
| `JWT_SECRET` | Secret key for signing JWT tokens | `min_32_chars_random_secret` |
| `DEMO_MODE` | Enables 1-click demo login & presentation toolbar | `false` (set `true` for demo) |
| `TEXT_IMAGE_MATCH_THRESHOLD` | Cosine similarity threshold for text-to-photo matching | `22` |
| `SMTP_HOST` | SMTP server host (e.g., Gmail) | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_SECURE` | Use SSL (`true` for 465, `false` for 587) | `false` |
| `SMTP_USER` | Email address for sending OTPs | `campus.lostfound.service@gmail.com` |
| `SMTP_PASS` | 16-character Gmail App Password | `xxxx xxxx xxxx xxxx` |
| `SMTP_FROM` | Sender display name & email | `"Campus Lost & Found" <campus.lostfound.service@gmail.com>` |

### 📧 Production OTP Email Setup (Gmail App Password)
In production (`NODE_ENV=production`), real 6-digit OTP emails are dispatched to students' college email addresses using Nodemailer over TLS/STARTTLS.

To set up Gmail SMTP:
1. Enable **2-Step Verification** on your Google Account:
   - Go to [Google Account Security](https://myaccount.google.com/security).
   - Turn on **2-Step Verification**.
2. Generate an **App Password**:
   - Go to [Google App Passwords](https://myaccount.google.com/apppasswords).
   - App Name: `Campus Lost & Found`.
   - Click **Create** to receive a 16-character password (e.g., `abcd efgh ijkl mnop`).
3. Set the environment variables in your production host (or `.env`):
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-account@gmail.com
   SMTP_PASS=abcdefghijklmnop
   SMTP_FROM="Campus Lost & Found" <your-account@gmail.com>
   ```

> **Note on OTP in Development**: If SMTP credentials are not configured and `NODE_ENV != 'production'`, 6-digit OTP codes are logged directly to the server terminal:
> ```
> [DEV OTP] Recipient: student@campus.edu | Purpose: verification
> [DEV OTP] 6-Digit Code: >>> 123456 <<< (Expires in 10 mins)
> ```

---

## 🗄️ Database Migrations (Run in Order)

Execute the migration scripts in the **Supabase SQL Editor** in the following sequential order:

1. **`migrations/01_initial_schema.sql`**
   - Base tables (`users`, `categories`, `locations`, `lost_item`, `found_item`, `item_match`, `notifications`).
2. **`migrations/02_enable_rls_policies.sql`**
   - Row Level Security (RLS) policies allowing backend API operations.
3. **`migrations/05_chat_and_details.sql`**
   - Detailed lost item attributes (`color`, `brand`, `distinguishing_marks`, `contents_details`).
   - `messages` table for privacy-preserving in-app chat between matched parties.
4. **`migrations/06_hardening_admin.sql`**
   - Enrolled student roster whitelist table (`students`).
   - Hashed OTP storage table (`email_otp`).
   - Security hardening columns on `users` (`email_verified`, `failed_attempts`, `locked_until`, `is_admin`).

---

## 🎓 Importing the Student Roster Whitelist

Account registration is strictly restricted to students present in the official university roster.

1. Ensure `roster.csv` exists in the backend root directory (or pass a custom path).
   Format:
   ```csv
   reg_no,name,college_email
   RA57943391863820,Rahul Sharma,rahul.demo@campus.edu
   RA71974882626888,Priya Verma,priya.demo@campus.edu
   RA24110030105720,Aman Gupta,aman.gupta@campus.edu
   RA24110030105721,Sneha Patel,sneha.patel@campus.edu
   RA24110030105722,Admin Officer,admin@campus.edu
   ```

2. Run the import script:
   ```bash
   node scripts/import-roster.js
   ```

---

## 🚀 How to Run Both Services

### Terminal 1: AI Microservice (FastAPI + CLIP + YOLOv8)
```powershell
cd campus-lostfound-backend/ai-service
.\venv\Scripts\activate
uvicorn main:app --host 127.0.0.1 --port 8000
```

### Terminal 2: Node.js Express Backend & Web Platform
```powershell
cd campus-lostfound-backend
npm install
node server.js
```

### Accessing the Web Application
Open your browser and navigate to:
```
http://localhost:5050
```

---

## ☁️ Production Deployment Guide

The platform is designed as a decoupled cloud architecture:
- **Backend & Web Portal**: Deployed as a Web Service on **Render** (Node.js runtime with reverse proxy trust and automated Blueprint `render.yaml`).
- **AI Microservice**: Can be run locally and exposed via Cloudflare Tunnel (`scripts/start-ai.ps1`) or containerized via Docker on **Hugging Face Spaces**.

```
[ User Browser ] ────> [ Render Web Service (Node.js + Frontend) - Singapore ]
                               │                 │
                               ▼                 ▼
                     [ Supabase DB/Storage ]   [ AI Microservice (Cloudflare Tunnel or HF Space) ]
```

---

### Step 1: Start or Deploy the AI Microservice

Choose **Option A** (Instant local GPU/CPU runner with Cloudflare Tunnel) or **Option B** (Free Cloud Docker on Hugging Face Spaces).

#### Option A (Recommended for Local Dev & Testing): Cloudflare Tunnel
A turnkey PowerShell script `scripts/start-ai.ps1` is provided to activate the Python environment, start Uvicorn in a dedicated window, launch Cloudflare Tunnel, and display the public URL:

1. Run the script in PowerShell:
   ```powershell
   .\scripts\start-ai.ps1
   ```
2. The script:
   - Activates `ai-service/venv`
   - Starts Uvicorn on `http://127.0.0.1:8000` in a new window
   - Launches `cloudflared tunnel --url http://127.0.0.1:8000`
   - Automatically detects and copies the public `https://<random-subdomain>.trycloudflare.com` URL to your clipboard.
3. Keep this terminal open while using the application. Paste this URL as `AI_SERVICE_URL` in your Render configuration.

#### Option B: Cloud Docker on Hugging Face Spaces
1. **Create Space**:
   - Go to [Hugging Face Spaces](https://huggingface.co/new-space).
   - Space Name: `campus-lostfound-ai`
   - Space SDK: Select **Docker** &rarr; **Blank**.
   - License: `MIT`.
   - Visibility: `Public`.
2. **Push the AI Service Code**:
   ```bash
   cd campus-lostfound-backend/ai-service
   git init
   git remote add space https://huggingface.co/spaces/<your-username>/campus-lostfound-ai
   git add Dockerfile README.md main.py requirements.txt models/campus_best.pt
   git commit -m "feat: deploy campus lost found AI microservice"
   git push space main
   ```
3. Copy your live Space URL (e.g., `https://<your-username>-campus-lostfound-ai.hf.space`) for `AI_SERVICE_URL`.

---

### Step 2: Deploy Backend & Web Portal to Render

#### Option 1: 1-Click Blueprint Deploy with `render.yaml` (Fastest)

The repository includes a ready-to-use Render Blueprint specification (`render.yaml`):
- **Region**: Singapore
- **Plan**: Free Node Web Service
- **Build**: `npm install`
- **Start**: `npm start`
- **Health Check**: `/health`
- **Pre-configured Environment Variables**: All non-sensitive variables are populated (`NODE_ENV=production`, `DEMO_MODE=true`, `CORS_ORIGIN=*`, `TEXT_IMAGE_MATCH_THRESHOLD=22`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`). Secret variables have `sync: false`, so Render simply prompts you to paste the values.

**Deployment Steps**:
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** &rarr; **Blueprint**.
3. Connect your repository `campus-lost-found-vision` and select the `main` branch.
4. Render will read `render.yaml` and prompt you to input the values for the `sync: false` variables:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `JWT_SECRET`
   - `AI_SERVICE_URL` (from Step 1)
   - `SMTP_USER`
   - `SMTP_PASS` (16-character Gmail App Password)
   - `SMTP_FROM`
5. Click **Apply**. Render will automatically provision, build, and deploy the service in Singapore!

---

#### Option 2: Manual Web Service Setup on Render

1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** &rarr; **Web Service**.
2. Connect your GitHub repository (`campus-lost-found-vision`).
3. Set the following configuration:
   - **Name**: `campus-lostfound-backend`
   - **Region**: `Singapore`
   - **Environment**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. Under the **Environment** tab, configure the environment variables:

   | Key | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | Enables production security & real email delivery |
   | `DEMO_MODE` | `true` | Enables 1-click demo logins & presentation toolbar |
   | `AI_SERVICE_URL` | `https://xxxx.trycloudflare.com` or HF Space URL | AI service URL from Step 1 |
   | `SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase project URL |
   | `SUPABASE_KEY` | `eyJh...` | Supabase service-role or anon key |
   | `JWT_SECRET` | `your_production_jwt_secret_min_32_chars` | Used for student and admin sessions |
   | `CORS_ORIGIN` | `*` | Or specify your Render domain |
   | `TEXT_IMAGE_MATCH_THRESHOLD` | `22` | CLIP matching threshold |
   | `SMTP_HOST` | `smtp.gmail.com` | For student verification emails |
   | `SMTP_PORT` | `587` | Standard STARTTLS port |
   | `SMTP_SECURE` | `false` | False for 587; true for 465 |
   | `SMTP_USER` | `your-service@gmail.com` | Gmail account |
   | `SMTP_PASS` | `your-16-char-app-password` | Google App Password (no spaces) |
   | `SMTP_FROM` | `"Campus Lost & Found" <your-service@gmail.com>` | Sender header |

5. Click **Create Web Service**. Render will build and deploy the application. Open your live `.onrender.com` URL to use the platform!

---

## 🎯 Custom YOLOv8 Training Pipeline (10 Campus Item Classes)

The system includes automated training scripts under `scripts/train_yolo/` to fine-tune YOLOv8 on 10 high-frequency university campus belongings:
`['ID Card', 'Keys', 'Bottle', 'Backpack', 'Phone', 'Laptop', 'Book', 'Wallet', 'Umbrella', 'Earphones']`.

### Local training

Run the commands below in exact order on Windows (with an NVIDIA CUDA GPU) to train locally inside `scripts/train_yolo/`:

1. **Create and activate a Python virtual environment in `scripts/train_yolo`**:
   ```powershell
   cd scripts/train_yolo
   python -m venv venv
   .\venv\Scripts\activate
   ```
2. **Install PyTorch with CUDA (`cu124`) FIRST** *(must be installed before `requirements-train.txt` so the CUDA build is not overwritten)*:
   ```powershell
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
   ```
3. **Verify CUDA GPU availability** *(must print `True`)*:
   ```powershell
   python -c "import torch; print(torch.cuda.is_available())"
   ```
4. **Install remaining training dependencies**:
   ```powershell
   pip install -r requirements-train.txt
   ```
5. **Download the 6 Roboflow datasets** *(reads `ROBOFLOW_API_KEY` env var or prompts interactively; skips already downloaded datasets)*:
   ```powershell
   python download_datasets.py
   ```
6. **Merge & remap dataset classes**:
   ```powershell
   python merge_datasets.py
   ```
7. **Fine-tune YOLOv8n** *(auto-detects GPU `device 0` and defaults to `--workers 2` for Windows; copies `best.pt` to `ai-service/models/campus_best.pt`)*:
   ```powershell
   python train.py --epochs 50 --imgsz 640 --workers 2
   ```
   - Optional quick test on 25% of data: `python train.py --epochs 20 --fraction 0.25`
   - Resume an interrupted run from `last.pt`: `python train.py --resume`

### Google Colab & Deployment:
- **Google Colab Cloud Training**: Open and execute `scripts/train_yolo/train_colab.ipynb` on Google Colab for free T4 GPU acceleration, then place the downloaded `best.pt` at `ai-service/models/campus_best.pt`.
- **Automatic Production Deployment**: When `ai-service` starts, it automatically checks for `models/campus_best.pt`. If present, it loads the fine-tuned campus model; otherwise, it falls back to standard `yolov8n.pt`.

### 📚 Dataset Attribution & Licenses

The custom campus YOLOv8 detector is trained on open-source datasets exported from Roboflow Universe:

| # | Dataset & Roboflow Source | Raw Classes | Mapped Target Class | License |
|---|---|---|---|---|
| 1 | `student-card/student-card-xrkhm/1` | `student-card` | **ID Card** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| 2 | `samples/keys-jcx6v/1` | `keys-F8z5` | **Keys** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| 3 | `senior-project-final-datasets/wallet-nfk4a/2` | `Wallet` | **Wallet** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| 4 | `breathless/bottle-ewqkq/8` | `bottle` | **Bottle** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| 5 | `test-djdmx/backpack-enkb9/1` | `backpack` *(dropped: handbag, paper bag)* | **Backpack** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| 6 | `s-workspace-gtpuo/phone-and-laptop/1` | `phone`, `laptop` | **Phone**, **Laptop** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

> **Dynamic Class Build**: The dataset merger dynamically builds the active class list exclusively from classes with annotated instances. Classes with no training data yet (Book, Umbrella, Earphones) are skipped gracefully without failing, and any class with fewer than 100 bounding boxes emits a class-balance warning.


---

## 🔒 Security & Feature Highlights

1. **Roster Whitelist & College Email Binding**:
   - Signup requires student registration number (`RA + 14 digits`) to exist in the `students` whitelist table.
   - The provided email must strictly match the registered `college_email`.
2. **Two-Factor Email Verification**:
   - 6-digit OTP code sent after signup and for password resets.
   - 10-minute expiry, max 5 verification attempts.
   - Login blocked until `email_verified = true`.
3. **Brute-Force & Lockout Protection**:
   - 15-minute temporary lockout after 5 consecutive failed login attempts.
   - Rate limiting on login, signup, and OTP verification endpoints (`express-rate-limit`).
   - Generic error messages to prevent account enumeration.
4. **Strong Password Policies**:
   - Minimum 8 characters, uppercase, lowercase, digit, and special character.
   - Bcrypt hashing with 12 rounds.
   - Rejects passwords containing the student's registration number, first name, last name, or entries from common weak password dictionaries.
5. **Privacy-Preserving In-App Chat & Security Desk Handover**:
   - Communication is isolated to matched item owners via `/match.html`.
   - Contact numbers and personal emails are never exposed.
   - Campus security desk designated as official physical handover checkpoint.
6. **Campus Moderation & Admin Portal (`/admin.html`)**:
   - Restricted to accounts with `is_admin = true`.
   - Live platform metrics (total users, lost items, found items, matches, returned cases).
   - Searchable student roster, item moderation, and match case resolution.
   - Admin link in navbar visible exclusively to administrators.
