#!/usr/bin/env python3
"""
Flask Web Server for Dual Camera YOLO11 (Truck Detect + Brick Segment)
- Detect trucks with a detection model (COCO-pretrained or custom)
- For each detected truck bbox, crop and run a bricks segmentation model
- Map the brick masks back to the original frame coordinates
- Keep the same dual-camera + calibration scaffolding

Author: AI Assistant (two-model update)
Version: 2.1.2 - Fixed model fusion error and optimized UI layout
"""

import os
import sys
import time
import json
import logging
import threading
from pathlib import Path
from queue import Queue, Empty
from typing import Dict, List, Tuple, Optional

import cv2
import numpy as np
from flask import Flask, render_template, Response, request, jsonify
from ultralytics import YOLO

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global calibration config
calibration_config = None
calibration_config_path = None

def clamp(val, lo, hi):
    return max(lo, min(hi, val))

class DualCameraYOLO:
    """Dual camera processing using two models:
       - detector: trucks (boxes)
       - segmenter: bricks (masks) within each truck bbox
    """
    def __init__(
        self,
        det_model_path: str,
        seg_model_path: str,
        det_conf: float = 0.35,
        seg_conf: float = 0.35,
        truck_class_id: int = 7,   # COCO: 7 == 'truck'
        crop_margin: float = 0.06  # expand bbox by 6% each side
    ):
        self.det_model_path = det_model_path
        self.seg_model_path = seg_model_path
        self.det_conf = det_conf
        self.seg_conf = seg_conf
        self.truck_class_id = truck_class_id
        self.crop_margin = crop_margin

        self.det_model = None
        self.seg_model = None

        # Names (best-effort; detector likely COCO with 'truck')
        self.det_names = {}
        self.seg_names = {}

        # Video capture
        self.cap1 = None
        self.cap2 = None

        # Frame queues
        self.frame_queue1 = Queue(maxsize=2)
        self.frame_queue2 = Queue(maxsize=2)

        # Processing flags
        self.processing = False
        self.processing_paused = False
        self.threads = []

        # Stats - Updated to use brick_area for segmentation masks
        self.stats_lock = threading.Lock()
        self.stats = {
            'camera1': {
                'fps': 0.0, 
                'trucks': 0, 
                'objects': 0,  # Total brick objects detected
                'total_area': 0.0,  # For backward compatibility (same as brick_area)
                'brick_area': 0.0   # Segmentation mask area in pixels
            },
            'camera2': {
                'fps': 0.0, 
                'trucks': 0, 
                'objects': 0,
                'total_area': 0.0,
                'brick_area': 0.0
            },
            'volume_estimate': 0.0
        }

        self._load_models()

    def _load_models(self):
        """Load YOLO detection and segmentation models."""
        try:
            logger.info(f"Loading DET model: {self.det_model_path}")
            self.det_model = YOLO(self.det_model_path)
            self.det_names = self.det_model.names
            
            # Try to fuse model for speed, but continue if it fails
            try:
                self.det_model.model.fuse()
                logger.info("DET model fused successfully")
            except (AttributeError, RuntimeError) as e:
                logger.warning(f"Could not fuse det model (non-critical): {e}")

            logger.info(f"Loading SEG model: {self.seg_model_path}")
            self.seg_model = YOLO(self.seg_model_path)
            self.seg_names = self.seg_model.names
            logger.info(f"SEG classes: {self.seg_names}")
            
            # Try to fuse model for speed, but continue if it fails
            try:
                self.seg_model.model.fuse()
                logger.info("SEG model fused successfully")
            except (AttributeError, RuntimeError) as e:
                logger.warning(f"Could not fuse seg model (non-critical): {e}")

            # Visualization colors (per seg class; fallback to 10 colors)
            np.random.seed(42)
            n_colors = max(len(self.seg_names), 10)
            self.colors = [(int(np.random.randint(0,255)),
                            int(np.random.randint(0,255)),
                            int(np.random.randint(0,255))) for _ in range(n_colors)]

        except Exception as e:
            logger.error(f"Failed to load models: {e}")
            raise

    def start_streams(self, source1: str, source2: str):
        """Start both video streams"""
        try:
            self.cap1 = cv2.VideoCapture(source1)
            self.cap2 = cv2.VideoCapture(source2)

            if not self.cap1.isOpened():
                raise ValueError(f"Cannot open camera 1: {source1}")
            if not self.cap2.isOpened():
                raise ValueError(f"Cannot open camera 2: {source2}")

            # Basic capture hints
            for cap in [self.cap1, self.cap2]:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                cap.set(cv2.CAP_PROP_FPS, 30)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            self.processing = True
            self.processing_paused = False

            # Clear queues
            for q in (self.frame_queue1, self.frame_queue2):
                while not q.empty():
                    try: q.get_nowait()
                    except Empty: break

            # Start threads
            t1 = threading.Thread(target=self._process_camera, args=(1, self.cap1), daemon=True)
            t2 = threading.Thread(target=self._process_camera, args=(2, self.cap2), daemon=True)
            t1.start(); t2.start()
            self.threads = [t1, t2]

            logger.info("Both camera streams started successfully")
        except Exception as e:
            logger.error(f"Failed to start streams: {e}")
            self.stop_streams()
            raise

    def pause_processing(self):
        with self.stats_lock:
            self.processing_paused = True
        logger.info("Processing paused.")

    def resume_processing(self):
        with self.stats_lock:
            self.processing_paused = False
        logger.info("Processing resumed.")

    def is_paused(self) -> bool:
        with self.stats_lock:
            return self.processing_paused

    # ===== Core per-camera loop =====
    def _process_camera(self, camera_id: int, cap: cv2.VideoCapture):
        frame_queue = self.frame_queue1 if camera_id == 1 else self.frame_queue2
        fps_counter, fps_start = 0, time.time()
        last_debug_log = time.time()
        frozen_frame = None

        logger.info(f"Started processing camera {camera_id}")

        while self.processing and cap.isOpened():
            with self.stats_lock:
                paused = self.processing_paused

            if paused:
                if frozen_frame is not None:
                    try:
                        while not frame_queue.empty():
                            try: frame_queue.get_nowait()
                            except Empty: break
                        frame_queue.put_nowait(frozen_frame.copy())
                    except: pass
                time.sleep(0.1)
                continue

            ret, frame = cap.read()
            if not ret:
                time.sleep(0.05)
                continue

            frozen_frame = frame.copy()
            H, W = frame.shape[:2]

            try:
                # 1) DETECT TRUCKS on full frame
                det_results = self.det_model.predict(
                    source=frame, conf=self.det_conf, verbose=False
                )
                truck_boxes = self._extract_truck_boxes(det_results, W, H)

                # 2) For each truck, run SEG on the cropped region
                seg_dets = []
                brick_masks_full = []  # masks mapped to full-frame
                total_brick_area = 0.0
                
                for (x1, y1, x2, y2) in truck_boxes:
                    # Expand bbox by margin
                    bw, bh = x2 - x1, y2 - y1
                    dx = int(bw * self.crop_margin)
                    dy = int(bh * self.crop_margin)
                    cx1 = clamp(x1 - dx, 0, W - 1)
                    cy1 = clamp(y1 - dy, 0, H - 1)
                    cx2 = clamp(x2 + dx, 0, W - 1)
                    cy2 = clamp(y2 + dy, 0, H - 1)

                    crop = frame[cy1:cy2, cx1:cx2]
                    if crop.size == 0:  # safety
                        continue

                    seg_results = self.seg_model.predict(
                        source=crop, conf=self.seg_conf, verbose=False
                    )

                    # Extract brick masks (all seg classes) and map to full frame
                    masks = self._extract_seg_masks(seg_results, crop.shape[:2])
                    for m in masks:
                        # m is crop-sized (h,w) bool/float mask; map to full frame
                        full_mask = np.zeros((H, W), dtype=np.uint8)
                        h, w = m.shape[:2]
                        # If mask isn't exactly crop size, resize
                        if (h, w) != (cy2 - cy1, cx2 - cx1):
                            m = cv2.resize(m.astype(np.float32), (cx2 - cx1, cy2 - cy1))
                        full_mask[cy1:cy2, cx1:cx2] = (m > 0.5).astype(np.uint8)
                        brick_masks_full.append(full_mask)
                        
                        # Calculate area
                        mask_area = np.sum(full_mask > 0)
                        total_brick_area += mask_area

                        # Save seg det info (for stats)
                        seg_dets.append({'bbox': (cx1, cy1, cx2, cy2), 'area': mask_area})

                # 3) Compose annotated frame: draw truck boxes and brick masks
                annotated = frame.copy()
                
                # Draw brick masks first (semi-transparent overlay)
                for idx, m in enumerate(brick_masks_full):
                    color = self.colors[idx % len(self.colors)]
                    colored = np.zeros_like(annotated)
                    colored[m > 0] = color
                    annotated = cv2.addWeighted(annotated, 1.0, colored, 0.35, 0)

                # Draw truck boxes with labels
                for (x1, y1, x2, y2) in truck_boxes:
                    color = (0, 180, 255)
                    cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                    label = f"truck"
                    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                    cv2.rectangle(annotated, (x1, y1 - th - 6), (x1 + tw, y1), color, -1)
                    cv2.putText(annotated, label, (x1, y1 - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

                # Update FPS
                fps_counter += 1
                now = time.time()
                if now - fps_start >= 1.0:
                    fps = fps_counter / (now - fps_start)
                    fps_counter, fps_start = 0, now
                    with self.stats_lock:
                        self.stats[f'camera{camera_id}']['fps'] = float(fps)

                # Update stats each frame - using segmentation area
                with self.stats_lock:
                    self.stats[f'camera{camera_id}']['trucks'] = len(truck_boxes)
                    self.stats[f'camera{camera_id}']['objects'] = len(brick_masks_full)
                    self.stats[f'camera{camera_id}']['brick_area'] = float(total_brick_area)
                    # For backward compatibility with frontend
                    self.stats[f'camera{camera_id}']['total_area'] = float(total_brick_area)

                # Occasionally log
                if now - last_debug_log >= 20.0:
                    with self.stats_lock:
                        s = self.stats[f'camera{camera_id}']
                        logger.debug(f"C{camera_id}: FPS={s['fps']:.1f} trucks={s['trucks']} " +
                                   f"bricks={s['objects']} area={s['brick_area']:.0f}px")
                    last_debug_log = now

                # Push frame to queue (non-blocking)
                try:
                    while not frame_queue.empty():
                        try: frame_queue.get_nowait()
                        except Empty: break
                    frame_queue.put_nowait(annotated)
                except: pass

            except Exception as e:
                logger.exception(f"Camera {camera_id} processing error: {e}")
                try:
                    while not frame_queue.empty():
                        try: frame_queue.get_nowait()
                        except Empty: break
                    frame_queue.put_nowait(frame)
                except: pass

        logger.info(f"Stopped processing camera {camera_id}")

    # ===== Helpers =====
    def _extract_truck_boxes(self, det_results, W: int, H: int) -> List[Tuple[int,int,int,int]]:
        """Return list of (x1,y1,x2,y2) for trucks only"""
        boxes_out = []
        for res in det_results:
            if not hasattr(res, 'boxes') or res.boxes is None or len(res.boxes) == 0:
                continue
            for b in res.boxes:
                cls_id = int(b.cls.item())
                if cls_id != self.truck_class_id:
                    continue
                x1, y1, x2, y2 = map(int, b.xyxy[0].cpu().numpy())
                # clamp in frame
                x1 = clamp(x1, 0, W - 1); y1 = clamp(y1, 0, H - 1)
                x2 = clamp(x2, 0, W - 1); y2 = clamp(y2, 0, H - 1)
                if x2 > x1 and y2 > y1:
                    boxes_out.append((x1, y1, x2, y2))
        return boxes_out

    def _extract_seg_masks(self, seg_results, crop_hw: Tuple[int, int]) -> List[np.ndarray]:
        """Return list of binary masks (as float/uint8) per object from seg model.
           Ensures the masks are the crop size (h,w).
        """
        masks_out = []
        for res in seg_results:
            masks = getattr(res, 'masks', None)
            if masks is None or getattr(masks, 'data', None) is None:
                continue
            # masks.data is (N, Mh, Mw),
            # try to resize to crop size (h,w) if needed
            data = masks.data.cpu().numpy()  # float [0..1]
            for i in range(data.shape[0]):
                m = data[i]
                # ensure 2D
                if m.ndim == 3:
                    m = m[0]
                h, w = crop_hw
                if (m.shape[0], m.shape[1]) != (h, w):
                    m = cv2.resize(m.astype(np.float32), (w, h))
                masks_out.append(m)
        return masks_out

    def get_frame(self, camera_id: int) -> Optional[bytes]:
        frame_queue = self.frame_queue1 if camera_id == 1 else self.frame_queue2
        try:
            frame = None
            while not frame_queue.empty():
                try: frame = frame_queue.get_nowait()
                except Empty: break
            if frame is not None:
                ok, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if ok:
                    return buf.tobytes()
        except Exception as e:
            logger.error(f"Error getting frame from camera {camera_id}: {e}")
        return None

    def get_stats(self) -> Dict:
        with self.stats_lock:
            stats = self.stats.copy()
            stats['processing_paused'] = self.processing_paused
            return stats

    def estimate_volume(self) -> float:
        """Estimate volume using brick segmentation area.
           Note: Frontend will use calibrated 3D calculations for accuracy.
        """
        with self.stats_lock:
            area1 = self.stats['camera1']['brick_area']
            area2 = self.stats['camera2']['brick_area']
            avg_area = (area1 + area2) / 2.0
            # Basic estimate - frontend will do proper calibrated calculation
            est = avg_area * 0.01
            self.stats['volume_estimate'] = est
            return est

    def stop_streams(self):
        logger.info("Stopping camera streams...")
        self.processing = False
        for t in self.threads:
            if t.is_alive():
                t.join(timeout=3)
        if self.cap1: self.cap1.release()
        if self.cap2: self.cap2.release()
        for q in (self.frame_queue1, self.frame_queue2):
            while not q.empty():
                try: q.get_nowait()
                except Empty: break
        logger.info("All streams stopped")

# Flask application
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'

# Global processor
yolo_processor = None

@app.route('/')
def index():
    """Main page with dual camera view"""
    return render_template('index.html')

@app.route('/video_feed/<int:camera_id>')
def video_feed(camera_id):
    def generate():
        while True:
            if yolo_processor and yolo_processor.processing:
                frame = yolo_processor.get_frame(camera_id)
                if frame:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                else:
                    time.sleep(0.05)
            else:
                time.sleep(0.3)
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/stats')
def get_stats():
    if yolo_processor and yolo_processor.processing:
        yolo_processor.estimate_volume()
        return jsonify(yolo_processor.get_stats())
    return jsonify({'error': 'Processor not initialized or not running'})

@app.route('/api/pause', methods=['POST'])
def pause_processing():
    try:
        if yolo_processor and yolo_processor.processing:
            yolo_processor.pause_processing()
            return jsonify({'status': 'success', 'message': 'Processing paused'})
        return jsonify({'status': 'error', 'message': 'No active processing to pause'})
    except Exception as e:
        logger.error(f"Pause error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/resume', methods=['POST'])
def resume_processing():
    try:
        if yolo_processor and yolo_processor.processing:
            yolo_processor.resume_processing()
            return jsonify({'status': 'success', 'message': 'Processing resumed'})
        return jsonify({'status': 'error', 'message': 'No active processing to resume'})
    except Exception as e:
        logger.error(f"Resume error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/status')
def get_status():
    status = {'processing': False, 'paused': False, 'cameras_active': {'camera1': False, 'camera2': False}}
    if yolo_processor:
        status['processing'] = yolo_processor.processing
        status['paused'] = yolo_processor.is_paused()
        if yolo_processor.cap1 and yolo_processor.cap1.isOpened():
            status['cameras_active']['camera1'] = True
        if yolo_processor.cap2 and yolo_processor.cap2.isOpened():
            status['cameras_active']['camera2'] = True
    return jsonify(status)

@app.route('/api/start', methods=['POST'])
def start_processing():
    global yolo_processor
    try:
        data = request.get_json() or {}

        # Backward-compat: model_path acts as seg model if det_model_path not given
        det_model_path = data.get('det_model_path', 'yolo11n.pt')
        seg_model_path = data.get('seg_model_path', data.get('model_path', 'yolo11n-seg.pt'))

        source1 = data.get('source1', 0)
        source2 = data.get('source2', 1)

        # thresholds
        det_conf = float(data.get('det_conf', 0.35))
        seg_conf = float(data.get('seg_conf', 0.35))

        # COCO truck id default 7
        truck_class_id = int(data.get('truck_class_id', 7))
        crop_margin = float(data.get('crop_margin', 0.06))

        if yolo_processor:
            yolo_processor.stop_streams()

        yolo_processor = DualCameraYOLO(
            det_model_path=det_model_path,
            seg_model_path=seg_model_path,
            det_conf=det_conf,
            seg_conf=seg_conf,
            truck_class_id=truck_class_id,
            crop_margin=crop_margin
        )
        yolo_processor.start_streams(source1, source2)

        logger.info(f"Started with DET={det_model_path}, SEG={seg_model_path}, truck_id={truck_class_id}")
        return jsonify({'status': 'success', 'message': 'Processing started'})

    except Exception as e:
        logger.error(f"Start error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/stop', methods=['POST'])
def stop_processing():
    global yolo_processor
    try:
        if yolo_processor:
            yolo_processor.stop_streams()
            yolo_processor = None
        return jsonify({'status': 'success', 'message': 'Processing stopped'})
    except Exception as e:
        logger.error(f"Stop error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/calibration/save', methods=['POST'])
def save_calibration():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'No data provided'}), 400
        save_path = './calibration_data.json'
        with open(save_path, 'w') as f:
            json.dump(data, f, indent=2)
        logger.info(f"Calibration saved to {save_path}")
        return jsonify({'status': 'success', 'message': 'Calibration saved', 'path': save_path})
    except Exception as e:
        logger.error(f"Calibration save error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/calibration/load', methods=['GET'])
def load_calibration_api():
    try:
        load_path = './calibration_data.json'
        if not os.path.exists(load_path):
            return jsonify({'status': 'error', 'message': 'No saved calibration found'}), 404
        with open(load_path, 'r') as f:
            data = json.load(f)
        logger.info(f"Calibration loaded from {load_path}")
        return jsonify(data)
    except Exception as e:
        logger.error(f"Calibration load error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/calibration/config', methods=['GET'])
def get_calibration_config():
    """Serve the calibration configuration (measurements, camera heights, etc.)"""
    global calibration_config
    try:
        if calibration_config is None:
            return jsonify({'status': 'error', 'message': 'No calibration config loaded'}), 404
        return jsonify(calibration_config)
    except Exception as e:
        logger.error(f"Calibration config error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# Health check endpoint
@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'version': '2.1.2',
        'calibration_loaded': calibration_config is not None
    })

def load_calibration_config(config_path: str) -> Optional[Dict]:
    try:
        if not os.path.exists(config_path):
            logger.warning(f"Calibration config not found: {config_path}")
            return None
        with open(config_path, 'r') as f:
            config = json.load(f)
        logger.info(f"Calibration config loaded from {config_path}")
        return config
    except Exception as e:
        logger.error(f"Failed to load calibration config: {e}")
        return None

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Dual Camera YOLO Flask Server (DET truck + SEG bricks)')
    parser.add_argument('--host', default='0.0.0.0', help='Host address')
    parser.add_argument('--port', type=int, default=80, help='Port number')
    parser.add_argument('--det', default='yolo11n.pt', help='Detection model path (trucks)')
    parser.add_argument('--seg', default='yolo11n-seg.pt', help='Segmentation model path (bricks)')
    parser.add_argument('--source1', default=0, help='Camera 1 source')
    parser.add_argument('--source2', default=1, help='Camera 2 source')
    parser.add_argument('--det-conf', type=float, default=0.35, help='Detector confidence')
    parser.add_argument('--seg-conf', type=float, default=0.35, help='Segmenter confidence')
    parser.add_argument('--truck-class-id', type=int, default=7, help='Truck class id (COCO=7)')
    parser.add_argument('--crop-margin', type=float, default=0.06, help='Relative bbox padding')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    parser.add_argument('--calibration-config', default='./calibration.json', help='Path to calibration config JSON file')
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    calibration_config_path = args.calibration_config
    calibration_config = load_calibration_config(calibration_config_path)

    try:
        yolo_processor = DualCameraYOLO(
            det_model_path=args.det,
            seg_model_path=args.seg,
            det_conf=args.det_conf,
            seg_conf=args.seg_conf,
            truck_class_id=args.truck_class_id,
            crop_margin=args.crop_margin
        )
        yolo_processor.start_streams(args.source1, args.source2)
    except Exception as e:
        logger.error(f"Failed to start: {e}")

    # Reduce werkzeug noise when not debugging
    if not args.debug:
        class _Filter(logging.Filter):
            def filter(self, record):
                return ('werkzeug' not in record.name)
        for h in logging.root.handlers:
            h.addFilter(_Filter())

    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)
