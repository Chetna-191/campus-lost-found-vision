import io
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from transformers import CLIPModel, CLIPProcessor
from ultralytics import YOLO

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_service")

# Global model references
models = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load machine learning models once at startup and clean up on shutdown."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Using device: {device}")

    # 1. Load YOLOv8 for object detection
    logger.info("Loading YOLOv8 model (yolov8n.pt)...")
    try:
        yolo_model = YOLO("yolov8n.pt")
        models["yolo"] = yolo_model
        logger.info("YOLOv8 loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load YOLOv8 model: {e}")
        raise e

    # 2. Load CLIP model and processor for embeddings & similarity
    logger.info("Loading CLIP model and processor (openai/clip-vit-base-patch32)...")
    try:
        clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
        clip_model.eval()
        models["clip_model"] = clip_model
        models["clip_processor"] = clip_processor
        models["device"] = device
        logger.info("CLIP model loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load CLIP model: {e}")
        raise e

    yield

    # Cleanup resources
    models.clear()
    logger.info("Models unloaded.")


app = FastAPI(
    title="Campus Lost & Found AI Microservice",
    version="1.0.0",
    description="Microservice providing YOLOv8 object detection and CLIP image embeddings / similarity comparisons.",
    lifespan=lifespan,
)

# Add CORS middleware to allow calls from frontend or backend services
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def load_image_from_upload(file: UploadFile) -> Image.Image:
    """Reads uploaded file content and converts it to a standard RGB PIL Image."""
    if not file.content_type or not file.content_type.startswith("image/"):
        logger.warning(f"File {file.filename} with content-type {file.content_type} is not recognized as an image.")

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Uploaded file '{file.filename}' is empty.",
            )
        image = Image.open(io.BytesIO(content)).convert("RGB")
        return image
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{file.filename}' is not a valid or supported image file.",
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Error reading image '{file.filename}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process image '{file.filename}': {str(e)}",
        )


def compute_clip_embedding(image: Image.Image) -> torch.Tensor:
    """Computes a normalized CLIP image embedding."""
    clip_model = models.get("clip_model")
    clip_processor = models.get("clip_processor")
    device = models.get("device", "cpu")

    if clip_model is None or clip_processor is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CLIP model is not initialized.",
        )

    inputs = clip_processor(images=image, return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = clip_model.get_image_features(**inputs)
        # Handle both tensor and ModelOutput dataclasses across transformer versions
        if isinstance(outputs, torch.Tensor):
            image_features = outputs
        elif hasattr(outputs, "image_embeds") and outputs.image_embeds is not None:
            image_features = outputs.image_embeds
        elif hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
            image_features = outputs.pooler_output
        else:
            image_features = outputs[0]

        # Normalize embedding vector to unit length
        image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)

    return image_features


@app.get("/")
def health_check():
    """Health check endpoint to verify that service and models are operational."""
    is_yolo_ready = "yolo" in models
    is_clip_ready = "clip_model" in models and "clip_processor" in models

    return {
        "status": "ok",
        "service": "campus-lostfound-ai",
        "device": models.get("device", "cpu"),
        "models": {
            "yolov8": "ready" if is_yolo_ready else "not_loaded",
            "clip": "ready" if is_clip_ready else "not_loaded",
        },
    }


@app.post("/detect")
async def detect_object(file: UploadFile = File(...)):
    """
    Accepts an image file and runs YOLOv8 detection.
    Returns the top detected class, confidence score, and list of all detections.
    """
    yolo_model = models.get("yolo")
    if yolo_model is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="YOLO model is not initialized.",
        )

    image = await load_image_from_upload(file)

    try:
        results = yolo_model(image)
        result = results[0]

        detections = []
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            class_name = result.names.get(class_id, str(class_id))
            conf = float(box.conf[0].item())
            xyxy = [float(x) for x in box.xyxy[0].tolist()]

            detections.append({
                "class_id": class_id,
                "class_name": class_name,
                "confidence": round(conf, 4),
                "bbox": xyxy,
            })

        # Sort detections by confidence descending
        detections.sort(key=lambda d: d["confidence"], reverse=True)

        if detections:
            top_detection = detections[0]
            return {
                "detected": True,
                "top_class": top_detection["class_name"],
                "confidence": top_detection["confidence"],
                "detections": detections,
            }
        else:
            return {
                "detected": False,
                "top_class": None,
                "confidence": 0.0,
                "detections": [],
            }

    except Exception as e:
        logger.error(f"Error during YOLO object detection: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Detection failed: {str(e)}",
        )


@app.post("/embed")
async def embed_image(file: UploadFile = File(...)):
    """
    Accepts an image file and returns its CLIP embedding as a JSON array of floats.
    """
    image = await load_image_from_upload(file)

    try:
        features = compute_clip_embedding(image)
        embedding_list: List[float] = features[0].cpu().tolist()

        return {
            "embedding": embedding_list,
            "dimension": len(embedding_list),
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Error computing CLIP embedding: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Embedding generation failed: {str(e)}",
        )


@app.post("/compare")
async def compare_images(
    file1: UploadFile = File(..., description="First image file"),
    file2: UploadFile = File(..., description="Second image file"),
):
    """
    Accepts two image files, extracts CLIP embeddings, and computes cosine similarity (0 to 100).
    """
    image1 = await load_image_from_upload(file1)
    image2 = await load_image_from_upload(file2)

    try:
        feat1 = compute_clip_embedding(image1)
        feat2 = compute_clip_embedding(image2)

        # Feat1 and Feat2 are already L2 normalized
        cosine_sim = torch.nn.functional.cosine_similarity(feat1, feat2, dim=-1).item()

        # Clamp cosine similarity between 0.0 and 1.0 and scale to 0 - 100 percentage
        clamped_sim = max(0.0, min(1.0, float(cosine_sim)))
        similarity_score = round(clamped_sim * 100.0, 2)

        return {
            "similarity": similarity_score,
            "raw_cosine_similarity": round(float(cosine_sim), 4),
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Error comparing images: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Image comparison failed: {str(e)}",
        )
