# Use NVIDIA PyTorch base image with CUDA support
FROM nvidia/cuda:12.9.1-cudnn-devel-ubuntu24.04

# Set working directory
WORKDIR /workspace

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Update system packages
RUN apt-get update && apt-get install -y \
    git \
    wget \
    curl \
    vim \
    unzip \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgeos-dev \
    ffmpeg \
    x11-apps \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN apt-get update && apt-get install -y python3-pip
#RUN pip install --break-system-packages --upgrade pip 

# Install Python dependencies
RUN pip install --break-system-packages \
    ultralytics \
    opencv-python-headless \
    pillow \
    matplotlib \
    seaborn \
    pandas \
    numpy \
    scipy \
    scikit-learn \
    tensorboard \
    wandb \
    roboflow \
    supervision \
    labelimg \
    jupyter \
    notebook \
    ipywidgets

# Install additional PyTorch vision packages
RUN pip install  --break-system-packages \
	torchvision torchaudio --index-url https://download.pytorch.org/whl/cu129

RUN pip install  --break-system-packages \
    openvino-dev
RUN pip install  --break-system-packages \
    flask
