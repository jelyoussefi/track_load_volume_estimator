#!/usr/bin/env python3
"""
Flask Web Server for Dual Camera YOLO11 Segmentation
For truck load volume estimation using brick detection

Features:
- Dual video stream processing
- Real-time YOLO segmentation
- Web interface with side-by-side display
- Volume estimation calculations
- REST API endpoints
- Processing pause/resume for calibration

Author: AI Assistant
Version: 1.2.0
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

class DualCameraYOLO:
    """Dual camera YOLO processing engine"""
    
    def __init__(self, model_path: str, confidence: float = 0.5):
        self.model_path = model_path
        self.confidence = confidence
        self.model = None
        self.class_names = {}
        self.colors = []
        
        # Video capture objects
        self.cap1 = None
        self.cap2 = None
        
        # Frame queues for threading
        self.frame_queue1 = Queue(maxsize=2)
        self.frame_queue2 = Queue(maxsize=2)
        
        # Processing flags
        self.processing = False
        self.processing_paused = False
        self.threads = []
        
        # Statistics with thread lock
        self.stats_lock = threading.Lock()
        self.stats = {
            'camera1': {'fps': 0.0, 'objects': 0, 'total_area': 0.0},
            'camera2': {'fps': 0.0, 'objects': 0, 'total_area': 0.0},
            'volume_estimate': 0.0
        }
        
        self._load_model()
    
    def _load_model(self):
        """Load YOLO model"""
        try:
            logger.info(f"Loading YOLO model: {self.model_path}")
            self.model = YOLO(self.model_path)
            self.class_names = self.model.names
            
            # Generate colors for visualization
            np.random.seed(42)
            self.colors = [(np.random.randint(0, 255), 
                           np.random.randint(0, 255), 
                           np.random.randint(0, 255)) 
                          for _ in range(len(self.class_names))]
            
            logger.info(f"Model loaded successfully. Classes: {self.class_names}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise
    
    def start_streams(self, source1: str, source2: str):
        """Start both video streams"""
        try:
            # Initialize video captures
            self.cap1 = cv2.VideoCapture(source1)
            self.cap2 = cv2.VideoCapture(source2)
            
            if not self.cap1.isOpened():
                raise ValueError(f"Cannot open camera 1: {source1}")
            if not self.cap2.isOpened():
                raise ValueError(f"Cannot open camera 2: {source2}")
            
            # Set camera properties for better performance
            for cap in [self.cap1, self.cap2]:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                cap.set(cv2.CAP_PROP_FPS, 30)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer to get latest frames
            
            self.processing = True
            self.processing_paused = False
            
            # Clear queues
            while not self.frame_queue1.empty():
                try:
                    self.frame_queue1.get_nowait()
                except Empty:
                    break
            while not self.frame_queue2.empty():
                try:
                    self.frame_queue2.get_nowait()
                except Empty:
                    break
            
            # Start processing threads
            thread1 = threading.Thread(target=self._process_camera, args=(1, self.cap1))
            thread2 = threading.Thread(target=self._process_camera, args=(2, self.cap2))
            
            thread1.daemon = True
            thread2.daemon = True
            
            thread1.start()
            thread2.start()
            
            self.threads = [thread1, thread2]
            
            logger.info("Both camera streams started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start streams: {e}")
            self.stop_streams()
            raise
    
    def pause_processing(self):
        """Pause YOLO processing while keeping streams alive"""
        with self.stats_lock:
            self.processing_paused = True
        logger.info("YOLO processing paused for calibration - video streams will show RAW frames only")

    def resume_processing(self):
        """Resume YOLO processing after calibration"""
        with self.stats_lock:
            self.processing_paused = False
        logger.info("YOLO processing resumed after calibration - YOLO inference restarted")
    
    def is_paused(self) -> bool:
        """Check if processing is currently paused"""
        with self.stats_lock:
            return self.processing_paused
    
    def _process_camera(self, camera_id: int, cap: cv2.VideoCapture):
        """Process individual camera stream"""
        frame_queue = self.frame_queue1 if camera_id == 1 else self.frame_queue2
        fps_counter = 0
        fps_start = time.time()
        last_stats_update = time.time()
        frozen_frame = None  # Store the last frame before pausing
        
        logger.info(f"Started processing camera {camera_id}")
        
        while self.processing and cap.isOpened():
            # Check if processing is paused
            with self.stats_lock:
                is_paused = self.processing_paused
            
            if is_paused:
                # During calibration: freeze video by reusing the last frame
                if frozen_frame is not None:
                    try:
                        # Clear queue and put the frozen frame
                        while not frame_queue.empty():
                            try:
                                frame_queue.get_nowait()
                            except Empty:
                                break
                        frame_queue.put_nowait(frozen_frame.copy())
                    except:
                        pass
                
                # Don't read new frames during calibration - this freezes the video
                time.sleep(0.1)  # Reduce CPU usage while paused
                continue
            
            # Normal operation: read new frames
            ret, frame = cap.read()
            if not ret:
                logger.warning(f"Camera {camera_id}: Failed to read frame")
                time.sleep(0.1)
                continue
            
            # Store this frame as the potential frozen frame for calibration
            frozen_frame = frame.copy()
            
            try:
                # Run YOLO inference
                start_time = time.time()
                results = self.model.predict(
                    source=frame,
                    conf=self.confidence,
                    save=False,
                    verbose=False
                )
                inference_time = time.time() - start_time
                
                # Extract detections
                detections = self._extract_detections(results)
                
                # Draw annotations
                annotated_frame = self._draw_detections(frame, detections)
                
                # Calculate statistics
                total_area = sum(self._calculate_mask_area(det['mask']) 
                               for det in detections if det['mask'] is not None)
                
                # Update FPS calculation
                fps_counter += 1
                current_time = time.time()
                
                if current_time - fps_start >= 1.0:  # Update FPS every second
                    current_fps = fps_counter / (current_time - fps_start)
                    fps_counter = 0
                    fps_start = current_time
                    
                    # Update stats with thread safety
                    with self.stats_lock:
                        self.stats[f'camera{camera_id}']['fps'] = current_fps
                
                # Update other stats every frame
                with self.stats_lock:
                    self.stats[f'camera{camera_id}']['objects'] = len(detections)
                    self.stats[f'camera{camera_id}']['total_area'] = total_area
                
                # Log stats occasionally for debugging (reduced frequency)
                if current_time - last_stats_update >= 30.0:  # Log every 30 seconds instead of 10
                    with self.stats_lock:
                        logger.debug(f"Camera {camera_id}: FPS={self.stats[f'camera{camera_id}']['fps']:.1f}, Objects={len(detections)}, Area={total_area:.0f}")
                    last_stats_update = current_time
                
                # Update frame queue (non-blocking)
                try:
                    # Clear old frames and add new one
                    while not frame_queue.empty():
                        try:
                            frame_queue.get_nowait()
                        except Empty:
                            break
                    frame_queue.put_nowait(annotated_frame)
                except:
                    # Queue operations failed, continue
                    pass
                    
            except Exception as e:
                logger.error(f"Camera {camera_id} processing error: {e}")
                # Put original frame on error
                try:
                    while not frame_queue.empty():
                        try:
                            frame_queue.get_nowait()
                        except Empty:
                            break
                    frame_queue.put_nowait(frame)
                except:
                    pass
        
        logger.info(f"Stopped processing camera {camera_id}")
    
    def _extract_detections(self, results) -> List[Dict]:
        """Extract detections from YOLO results"""
        detections = []
        for result in results:
            if result.boxes is not None:
                boxes = result.boxes
                masks = result.masks
                
                for i, box in enumerate(boxes):
                    conf = float(box.conf.item())
                    cls_id = int(box.cls.item())
                    class_name = self.class_names.get(cls_id, f"class_{cls_id}")
                    x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                    
                    # Extract mask if available
                    mask_data = None
                    if masks is not None and i < len(masks):
                        mask_data = masks.data[i].cpu().numpy()
                    
                    detections.append({
                        'class_id': cls_id,
                        'class_name': class_name,
                        'confidence': conf,
                        'bbox': (x1, y1, x2, y2),
                        'mask': mask_data
                    })
        return detections
    
    def _draw_detections(self, image: np.ndarray, detections: List[Dict]) -> np.ndarray:
        """Draw detections on image"""
        result_image = image.copy()
        
        for det in detections:
            x1, y1, x2, y2 = det['bbox']
            color = self.colors[det['class_id'] % len(self.colors)]
            
            # Draw bounding box
            cv2.rectangle(result_image, (x1, y1), (x2, y2), color, 2)
            
            # Draw label
            label = f"{det['class_name']}: {det['confidence']:.2f}"
            (label_w, label_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            
            # Label background
            cv2.rectangle(result_image, (x1, y1 - label_h - 10), (x1 + label_w, y1), color, -1)
            cv2.putText(result_image, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            
            # Draw mask overlay
            if det['mask'] is not None:
                mask = det['mask']
                if mask.shape != image.shape[:2]:
                    mask = cv2.resize(mask, (image.shape[1], image.shape[0]))
                
                colored_mask = np.zeros_like(result_image)
                colored_mask[mask > 0.5] = color
                result_image = cv2.addWeighted(result_image, 1.0, colored_mask, 0.3, 0)
        
        return result_image
    
    def _calculate_mask_area(self, mask: np.ndarray) -> float:
        """Calculate area of segmentation mask"""
        if mask is None:
            return 0.0
        return float(np.sum(mask > 0.5))
    
    def get_frame(self, camera_id: int) -> Optional[bytes]:
        """Get latest frame from camera queue"""
        frame_queue = self.frame_queue1 if camera_id == 1 else self.frame_queue2
        
        try:
            # Get most recent frame, discard older ones
            frame = None
            while not frame_queue.empty():
                try:
                    frame = frame_queue.get_nowait()
                except Empty:
                    break
            
            if frame is not None:
                # Encode frame as JPEG
                ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if ret:
                    return buffer.tobytes()
        except Exception as e:
            logger.error(f"Error getting frame from camera {camera_id}: {e}")
        
        return None
    
    def get_stats(self) -> Dict:
        """Get current statistics safely"""
        with self.stats_lock:
            stats = self.stats.copy()
            # Add pause status to stats
            stats['processing_paused'] = self.processing_paused
            return stats
    
    def estimate_volume(self) -> float:
        """Estimate volume based on both camera views"""
        with self.stats_lock:
            # Simple volume estimation based on total segmented area
            # The JavaScript will handle calibrated calculations
            area1 = self.stats['camera1']['total_area']
            area2 = self.stats['camera2']['total_area']
            
            # Basic volume estimation (this needs proper calibration)
            # Using average area and assuming some depth relationship
            avg_area = (area1 + area2) / 2
            estimated_volume = avg_area * 0.01  # Scale factor - needs calibration
            
            self.stats['volume_estimate'] = estimated_volume
            return estimated_volume
    
    def stop_streams(self):
        """Stop all streams and cleanup"""
        logger.info("Stopping camera streams...")
        self.processing = False
        
        # Wait for threads to finish
        for thread in self.threads:
            if thread.is_alive():
                thread.join(timeout=3)
        
        # Release video captures
        if self.cap1:
            self.cap1.release()
        if self.cap2:
            self.cap2.release()
        
        # Clear queues
        while not self.frame_queue1.empty():
            try:
                self.frame_queue1.get_nowait()
            except Empty:
                break
        while not self.frame_queue2.empty():
            try:
                self.frame_queue2.get_nowait()
            except Empty:
                break
        
        logger.info("All streams stopped")

# Flask application
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'

# Global YOLO processor
yolo_processor = None

@app.route('/')
def index():
    """Main page with dual camera view"""
    return render_template('index.html')

@app.route('/video_feed/<int:camera_id>')
def video_feed(camera_id):
    """Video streaming route for each camera"""
    def generate():
        while True:
            if yolo_processor and yolo_processor.processing:
                frame = yolo_processor.get_frame(camera_id)
                if frame:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                else:
                    # No frame available, wait a bit
                    time.sleep(0.1)
            else:
                # No processor or not processing, wait longer
                time.sleep(0.5)
    
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/stats')
def get_stats():
    """Get current processing statistics"""
    if yolo_processor and yolo_processor.processing:
        # Update volume estimate
        yolo_processor.estimate_volume()
        
        # Get stats safely
        stats = yolo_processor.get_stats()
        
        return jsonify(stats)
    else:
        return jsonify({'error': 'Processor not initialized or not running'})

@app.route('/api/pause', methods=['POST'])
def pause_processing():
    """Pause YOLO processing for calibration"""
    global yolo_processor
    
    try:
        if yolo_processor and yolo_processor.processing:
            yolo_processor.pause_processing()
            logger.info("Processing paused via API request")
            return jsonify({'status': 'success', 'message': 'Processing paused'})
        else:
            return jsonify({'status': 'error', 'message': 'No active processing to pause'})
    
    except Exception as e:
        logger.error(f"Failed to pause processing: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/resume', methods=['POST'])
def resume_processing():
    """Resume YOLO processing after calibration"""
    global yolo_processor
    
    try:
        if yolo_processor and yolo_processor.processing:
            yolo_processor.resume_processing()
            logger.info("Processing resumed via API request")
            return jsonify({'status': 'success', 'message': 'Processing resumed'})
        else:
            return jsonify({'status': 'error', 'message': 'No active processing to resume'})
    
    except Exception as e:
        logger.error(f"Failed to resume processing: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/status')
def get_status():
    """Get current system status"""
    global yolo_processor
    
    status = {
        'processing': False,
        'paused': False,
        'cameras_active': {'camera1': False, 'camera2': False}
    }
    
    if yolo_processor:
        status['processing'] = yolo_processor.processing
        status['paused'] = yolo_processor.is_paused()
        
        # Check camera status
        if yolo_processor.cap1 and yolo_processor.cap1.isOpened():
            status['cameras_active']['camera1'] = True
        if yolo_processor.cap2 and yolo_processor.cap2.isOpened():
            status['cameras_active']['camera2'] = True
    
    return jsonify(status)

@app.route('/api/start', methods=['POST'])
def start_processing():
    """Start dual camera processing"""
    global yolo_processor
    
    try:
        data = request.get_json() or {}
        model_path = data.get('model_path', 'yolo11n-seg.pt')
        source1 = data.get('source1', 0)
        source2 = data.get('source2', 1)
        confidence = data.get('confidence', 0.5)
        
        if yolo_processor:
            yolo_processor.stop_streams()
        
        yolo_processor = DualCameraYOLO(model_path, confidence)
        yolo_processor.start_streams(source1, source2)
        
        logger.info(f"Processing started via API: cameras {source1}, {source2}")
        return jsonify({'status': 'success', 'message': 'Processing started'})
    
    except Exception as e:
        logger.error(f"Failed to start processing: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/stop', methods=['POST'])
def stop_processing():
    """Stop dual camera processing"""
    global yolo_processor
    
    try:
        if yolo_processor:
            yolo_processor.stop_streams()
            yolo_processor = None
        
        logger.info("Processing stopped via API request")
        return jsonify({'status': 'success', 'message': 'Processing stopped'})
    
    except Exception as e:
        logger.error(f"Failed to stop processing: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# Health check endpoint
@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'version': '1.2.0'
    })

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Dual Camera YOLO Flask Server')
    parser.add_argument('--host', default='0.0.0.0', help='Host address')
    parser.add_argument('--port', type=int, default=5000, help='Port number')
    parser.add_argument('--model', default='yolo11n-seg.pt', help='YOLO model path')
    parser.add_argument('--source1', default=0, help='Camera 1 source')
    parser.add_argument('--source2', default=1, help='Camera 2 source')
    parser.add_argument('--conf', type=float, default=0.5, help='Confidence threshold')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    parser.add_argument('--no-auto-start', action='store_true', help='Disable auto-start processing')
    
    args = parser.parse_args()
    
    # Set debug logging level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Auto-start processing if sources provided and not disabled
    if not args.no_auto_start and args.model and os.path.exists(args.model):
        try:
            yolo_processor = DualCameraYOLO(args.model, args.conf)
            yolo_processor.start_streams(args.source1, args.source2)
            logger.info("Auto-started dual camera processing")
        except Exception as e:
            logger.error(f"Failed to auto-start: {e}")
    
    # Run Flask app with minimal logging
    import sys
    import os
    
    # Redirect stderr to suppress Flask startup messages if not in debug mode
    if not args.debug:
        # Create a custom log file for important messages only
        class CustomLogFilter(logging.Filter):
            def filter(self, record):
                # Only allow important application messages, not HTTP requests
                return (
                    'werkzeug' not in record.name and
                    not record.getMessage().startswith('172.') and
                    not 'GET /' in record.getMessage() and
                    not 'POST /' in record.getMessage()
                )
        
        # Apply the filter to the root logger
        for handler in logging.root.handlers:
            handler.addFilter(CustomLogFilter())
    
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)