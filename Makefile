#----------------------------------------------------------------------------------------------------------------------
# Flags
#----------------------------------------------------------------------------------------------------------------------
SHELL:=/bin/bash
CURRENT_DIR := $(shell dirname $(realpath $(lastword $(MAKEFILE_LIST))))

MODEL_SIZE ?= n
IMAGE_SIZE ?= 640
BATCH_SIZE ?= 16
EPOCHS ?= 100

# Roboflow API Key (set this or export it as environment variable)
ROBOFLOW_API_KEY ?= 

MODEL_NAME = yolo11${MODEL_SIZE}

#----------------------------------------------------------------------------------------------------------------------
# Docker Settings
#----------------------------------------------------------------------------------------------------------------------
DOCKER_IMAGE_NAME=track_load_volume_estimator
export DOCKER_BUILDKIT=1

DOCKER_RUN_PARAMS= \
	-it --rm -a stdout -a stderr  \
	--gpus all \
	-v ${CURRENT_DIR}:/workspace \
	-v /tmp/.X11-unix:/tmp/.X11-unix  -v ${HOME}/.Xauthority:/home/root/.Xauthority \
	${DOCKER_IMAGE_NAME}
	
#----------------------------------------------------------------------------------------------------------------------
# Targets
#----------------------------------------------------------------------------------------------------------------------
default: train
.PHONY: build download-dataset train monitor export

build:
	@$(call msg, Building Docker image ${DOCKER_IMAGE_NAME} ...)
	@docker build . -t ${DOCKER_IMAGE_NAME}

prepare-dataset: build
	@$(call msg, Downloading helmet dataset from Roboflow ...)
	@docker run ${DOCKER_RUN_PARAMS} /workspace/tools/prepare_dataset.sh

train: prepare-dataset
	@$(call msg, Training the ${MODEL_NAME} model for helmet detection ...)
	@sudo rm -rf ./runs/detect/${MODEL_NAME}*
	@docker run ${DOCKER_RUN_PARAMS} \
		yolo task=detect mode=train \
			model=${MODEL_NAME}.pt name=${MODEL_NAME} data=helmets.yaml \
			imgsz=${IMAGE_SIZE} epochs=${EPOCHS} batch=${BATCH_SIZE} \
			patience=20 save=True save_period=10 val=True plots=True verbose=True

# Monitoring the training
monitor:
	@$(call msg, Starting TensorBoard monitoring ...)
	@tensorboard --logdir=runs --bind_all --port=6006

# Export the model to different formats
export:
	@$(call msg, Exporting ${MODEL_NAME} model ...)
	@docker run ${DOCKER_RUN_PARAMS} \
		yolo task=detect mode=export \
			model=runs/detect/${MODEL_NAME}/weights/best.pt \
			format=onnx imgsz=${IMAGE_SIZE}

#----------------------------------------------------------------------------------------------------------------------
# Helper functions
#----------------------------------------------------------------------------------------------------------------------
define msg
	tput setaf 2 && \
	for i in $(shell seq 1 120 ); do echo -n "-"; done; echo  "" && \
	echo "         "$1 && \
	for i in $(shell seq 1 120 ); do echo -n "-"; done; echo "" && \
	tput sgr0
endef
