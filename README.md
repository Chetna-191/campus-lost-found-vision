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
| `SUPABASE_URL` | Supabase Project REST URL | `https://xxxx.supabase.co` |
| `SUPABASE_KEY` | Supabase Anon or Service Role Key | `eyJh...` |
| `JWT_SECRET` | Secret key for signing JWT tokens | `min_32_chars_random_secret` |
| `PORT` | Node.js Express server port | `5050` |
| `NODE_ENV` | Environment mode (`development` / `production`) | `development` |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated or `*`) | `*` |
| `DEMO_MODE` | Enables 1-click demo login & presentation toolbar | `false` (set `true` for demo) |
| `TEXT_IMAGE_MATCH_THRESHOLD` | Cosine similarity threshold for text-to-photo matching | `22` |
| `SMTP_HOST` | SMTP server host (e.g., Gmail / Outlook) | `smtp.gmail.com` (optional in dev) |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_SECURE` | Use SSL (`true` for 465, `false` for 587) | `false` |
| `SMTP_USER` | Email address for sending OTPs | `lostfound@campus.edu` |
| `SMTP_PASS` | App password / SMTP authentication token | `your_app_password` |
| `SMTP_FROM` | Sender display name & email | `"Campus Lost & Found" <lostfound@campus.edu>` |

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
