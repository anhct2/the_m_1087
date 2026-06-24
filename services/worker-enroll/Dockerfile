# services/worker-enroll/Dockerfile
# Build & run trên f87 (192.168.1.200) — KHÔNG deploy lên VPS
# docker compose -f docker-compose.f87.yml up -d --build

FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-dev python3-pip \
    build-essential \
    libgl1 libglib2.0-0 libsm6 libxext6 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Thứ tự cài quan trọng (từ kinh nghiệm thực tế)
RUN pip install -U pip && \
    pip install "numpy<2" && \
    pip install nvidia-cudnn-cu12==9.1.0.70 && \
    pip install onnxruntime-gpu==1.18.1 \
        --extra-index-url https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/ && \
    pip install insightface==0.7.3 && \
    pip install onnxruntime-gpu==1.18.1 --force-reinstall \
        --extra-index-url https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/ && \
    pip install -r requirements.txt

COPY src/ /app/

# cuDNN 9 path (nvidia-cudnn-cu12)
ENV LD_LIBRARY_PATH="/usr/local/lib/python3/dist-packages/nvidia/cudnn/lib:/usr/local/lib/python3.10/dist-packages/nvidia/cudnn/lib:${LD_LIBRARY_PATH}"
ENV INSIGHTFACE_HOME=/app/models

RUN mkdir -p /app/models /app/logs

CMD ["python3", "main.py"]
