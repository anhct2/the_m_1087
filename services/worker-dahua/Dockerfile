FROM python:3.11-slim

WORKDIR /app

# FFmpeg + runtime libs cho Dahua SDK (libgomp cho OpenMP)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgomp1 \
        libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies trước để tận dụng Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Source code (bao gồm sdk/linux64/ với .whl và .so files)
COPY . .

# Cài Dahua NetSDK Python wrapper
RUN pip install --no-cache-dir sdk/linux64/NetSDK-2.0.0.1-py3-none-linux_x86_64.whl

# LD_LIBRARY_PATH để linker tìm được các .so phụ thuộc của Dahua SDK
# NetSDK tự tìm .so trong package, nhưng set thêm để đảm bảo
ENV LD_LIBRARY_PATH=/app/sdk/linux64:$LD_LIBRARY_PATH
ENV PYTHONUNBUFFERED=1

CMD ["python", "-u", "main.py"]
