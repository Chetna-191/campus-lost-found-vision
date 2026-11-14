FROM python:3.10-slim

# Set container working directory
WORKDIR /app

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRANSFORMERS_CACHE=/app/cache \
    HF_HOME=/app/cache \
    PORT=7860

# Install essential system libraries required by OpenCV & Ultralytics YOLO
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install lightweight CPU-only PyTorch first
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Copy requirements and install python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download CLIP model weights during Docker build to prevent cold-start download latency
RUN python -c "from transformers import CLIPModel, CLIPProcessor; CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32'); CLIPModel.from_pretrained('openai/clip-vit-base-patch32')"

# Copy application source code and custom fine-tuned campus YOLOv8 weights
COPY main.py .
COPY models/campus_best.pt ./models/campus_best.pt

# Expose Hugging Face Spaces standard port
EXPOSE 7860

# Start Uvicorn ASGI server binding to 0.0.0.0:7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]

