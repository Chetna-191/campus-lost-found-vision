---
title: Campus Lost Found AI Microservice
emoji: 🔍
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# 🤖 Campus Lost & Found AI Microservice

FastAPI microservice providing real-time computer vision capabilities for the Campus Lost & Found platform:
1. **Custom Fine-Tuned YOLOv8 (`campus_best.pt`)**: Real-time object detection across 10 campus item classes (Wallet, Bottle, Bag, ID Card, Keys, Phone, Laptop, etc.).
2. **OpenAI CLIP (`openai/clip-vit-base-patch32`)**: Visual and multimodal text-to-photo embeddings for high-accuracy cosine similarity ranking.

---

## ⚡ API Endpoints

### 1. `GET /`
Health check and model status probe.
```json
{
  "status": "ok",
  "service": "campus-lostfound-ai",
  "device": "cpu",
  "models": {
    "yolov8": "campus_best.pt (custom fine-tuned)",
    "clip": "ready"
  }
}
```

### 2. `POST /detect`
Accepts a photo via multipart upload (`file`) and returns detected objects, bounding boxes, confidence scores, and the top detected class.

### 3. `POST /compare`
Accepts two image files (`file1` and `file2`) and computes visual similarity (0% - 100%) using normalized CLIP image embeddings.

### 4. `POST /compare-text`
Accepts a text query/description (`text`) and an item photo (`file`), returning multimodal CLIP cosine similarity (0% - 100%).

---

## 🚀 Deployment on Hugging Face Spaces

This service is containerized via Docker and pre-downloads model weights during the build stage to ensure zero cold-start delay upon receiving student requests.

To deploy on Hugging Face Spaces:
1. Create a new Space on [Hugging Face](https://huggingface.co/new-space).
2. Select **Docker** as the Space SDK.
3. Push the contents of the `ai-service/` directory to your Space repository.
4. Copy the direct App URL (e.g., `https://<your-username>-campus-lostfound-ai.hf.space`) and configure it as `AI_SERVICE_URL` in your Node.js backend.

