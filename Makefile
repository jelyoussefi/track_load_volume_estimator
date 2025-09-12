#----------------------------------------------------------------------------------------------------------------------
# Flags
#----------------------------------------------------------------------------------------------------------------------
SHELL:=/bin/bash
CURRENT_DIR := $(shell dirname $(realpath $(lastword $(MAKEFILE_LIST))))

TASK ?= segment
MODEL_SIZE ?= n
IMAGE_SIZE ?= 640
BATCH_SIZE ?= 16
EPOCHS ?= 20
TEST_IMAGE ?= ./datasets/building_materials/test/images/image_0058_jpg.rf.1b776fae09f8c75d003413923a30af00.jpg

MODEL_NAME = yolo11${MODEL_SIZE}-seg

DEVICE = CPU

#----------------------------------------------------------------------------------------------------------------------
# Docker Settings
#----------------------------------------------------------------------------------------------------------------------
DOCKER_IMAGE_NAME=track_load_volume_estimator
export DOCKER_BUILDKIT=1

DOCKER_RUN_PARAMS= \
	-it --rm -a stdout -a stderr  \
	-v ${CURRENT_DIR}:/workspace \
	-v /tmp/.X11-unix:/tmp/.X11-unix  -v ${HOME}/.Xauthority:/home/root/.Xauthority 
	
ifeq ($(DEVICE),CUDA)
	 DOCKER_RUN_PARAMS := ${DOCKER_RUN_PARAMS} --gpus all 
else
	 DOCKER_RUN_PARAMS := ${DOCKER_RUN_PARAMS} --privileged -v /dev:/dev
endif

DOCKER_RUN_PARAMS := ${DOCKER_RUN_PARAMS} ${DOCKER_IMAGE_NAME}

#----------------------------------------------------------------------------------------------------------------------
# Targets
#----------------------------------------------------------------------------------------------------------------------
default: run
.PHONY: build run download-dataset train monitor export test

build:
	@$(call msg, Building Docker image ${DOCKER_IMAGE_NAME} ...)
	@docker build . -t ${DOCKER_IMAGE_NAME}

train: build
	@$(call msg, Training the ${MODEL_NAME} model for helmet detection on ${DEVICE} ...)
	@sudo rm -rf ./runs/segment/${MODEL_NAME}*
	@docker run ${DOCKER_RUN_PARAMS} \
		yolo segment train \
			model=${MODEL_NAME}.pt name=${MODEL_NAME} data=building_materials.yaml \
			imgsz=${IMAGE_SIZE} epochs=${EPOCHS} batch=${BATCH_SIZE} device=${DEVICE}

# Monitoring the training
monitor: build
	@$(call msg, Starting TensorBoard monitoring on ${DEVICE} ...)
	docker run -p 6002:6002 ${DOCKER_RUN_PARAMS}  \
		bash -c "export TF_ENABLE_ONEDNN_OPTS=0 && \
		[ '$(DEVICE)' = 'CPU' ] && export CUDA_VISIBLE_DEVICES='' || true && \
		tensorboard --logdir=runs --bind_all --port=6006"

# Export the model to different formats
export: build
	@$(call msg, Exporting ${MODEL_NAME} model ...)
	@docker run ${DOCKER_RUN_PARAMS} \
		yolo task=${TASK} mode=export \
			model=runs/${TASK}/${MODEL_NAME}/weights/best.pt \
			format=openvino imgsz=${IMAGE_SIZE}

# Test the model with an input image
test: build
	@$(call msg, Running inference on ${TEST_IMAGE} using ${MODEL_NAME} model ...)
	@docker run ${DOCKER_RUN_PARAMS} bash -c "\
		yolo segment predict \
			model=runs/${TASK}/${MODEL_NAME}/weights/best.pt \
			source=${TEST_IMAGE} \
			imgsz=${IMAGE_SIZE} \
			save=True \
			save_txt=True \
			save_conf=True \
			project=. \
			name=output \
			exist_ok=True && \
		mv ./output/$(notdir ${TEST_IMAGE}) ./output.jpg "

run: build
	@$(call msg, Running the application ...)
	@docker run -p 5000:5000 ${DOCKER_RUN_PARAMS} bash -c "\
		python3 ./app.py \
			--model runs/segment/yolo11n-seg/weights/best.pt \
			--source1 streams/v1.mp4 \
			--source2 streams/v2.mp4 "

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
