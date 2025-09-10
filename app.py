#!/usr/bin/env python3
"""
Simple Production YOLO11 Segmentation Inference Script

A clean, production-ready script for YOLO11 segmentation on images, videos, and webcam streams.

Usage: 
  python yolo_inference.py --model path/to/model.pt --input path/to/image.jpg
  python yolo_inference.py --model path/to/model.pt --input path/to/video.mp4
  python yolo_inference.py --model path/to/model.pt --input 0  # webcam

Author: AI Assistant
Version: 1.0.0
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path
from typing import List, Tuple, Union

import cv2
import numpy as np
from ultralytics import YOLO

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# Suppress ultralytics verbose output
logging.getLogger("ultralytics").setLevel(logging.WARNING)

class YOLOInference:
    """Simple YOLO11 segmentation inference engine"""
    
    def __init__(self, model_path: str, confidence: float = 0.5, device: str = "auto"):
        """
        Initialize YOLO inference engine
        
        Args:
            model_path: Path to YOLO model (.pt file)
            confidence: Confidence threshold (0.0-1.0)
            device: Device to use ("auto", "cpu", "cuda")
        """
        self.confidence = confidence
        self.device = self._setup_device(device)
        
        # Load model
        logger.info(f"Loading model: {os.path.basename(model_path)}")
        try:
            self.model = YOLO(model_path)
            self.class_names = self.model.names
            logger.info(f"Model loaded successfully on {self.device}")
            logger.info(f"Classes: {len(self.class_names)} categories")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            sys.exit(1)
        
        # Generate colors for visualization
        np.random.seed(42)
        self.colors = [(np.random.randint(0, 255), 
                       np.random.randint(0, 255), 
                       np.random.randint(0, 255)) for _ in range(len(self.class_names))]
    
    def _setup_device(self, device: str) -> str:
        """Setup and validate device"""
        if device == "auto":
            if cv2.cuda.getCudaEnabledDeviceCount() > 0:
                device = "cuda"
                logger.info("CUDA detected, using GPU")
            else:
                device = "cpu"
                logger.info("Using CPU")
        return device
    
    def _get_input_type(self, input_source: str) -> str:
        """Determine input type: image, video, or webcam"""
        # Check if it's a webcam (numeric)
        if input_source.isdigit():
            return "webcam"
        
        # Check if file exists
        if not os.path.exists(input_source):
            raise FileNotFoundError(f"Input not found: {input_source}")
        
        # Check file extension
        ext = Path(input_source).suffix.lower()
        if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp']:
            return "image"
        elif ext in ['.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v']:
            return "video"
        else:
            logger.warning(f"Unknown file type: {ext}, treating as image")
            return "image"
    
    def predict_image(self, image_path: str) -> Tuple[List, float]:
        """
        Run inference on single image
        
        Args:
            image_path: Path to input image
            
        Returns:
            (detections, inference_time)
        """
        logger.info(f"Processing: {os.path.basename(image_path)}")
        
        # Run inference
        start_time = time.time()
        try:
            results = self.model.predict(
                source=image_path,
                conf=self.confidence,
                device=self.device,
                save=False,
                verbose=False
            )
            inference_time = time.time() - start_time
            
            # Extract detections
            detections = self._extract_detections(results)
            
            logger.info(f"Found {len(detections)} objects in {inference_time:.3f}s ({1/inference_time:.1f} FPS)")
            return detections, inference_time
            
        except Exception as e:
            logger.error(f"Inference failed: {e}")
            raise
    
    def predict_video(self, video_source: Union[str, int], save_path: str = None) -> None:
        """
        Run inference on video stream (file or webcam)
        
        Args:
            video_source: Path to video file or webcam index (int)
            save_path: Optional path to save output video
        """
        # Open video source
        cap = cv2.VideoCapture(video_source)
        if not cap.isOpened():
            raise ValueError(f"Could not open video source: {video_source}")
        
        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        is_webcam = isinstance(video_source, int) or video_source.isdigit()
        
        if is_webcam:
            logger.info(f"Starting webcam stream (Press 'q' to quit)")
        else:
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            logger.info(f"Processing video: {os.path.basename(str(video_source))} ({total_frames} frames, {fps} FPS)")
        
        # Setup video writer if saving
        out = None
        if save_path and not is_webcam:
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(save_path, fourcc, fps, (width, height))
            logger.info(f"Saving output to: {save_path}")
        
        frame_count = 0
        total_inference_time = 0
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    if is_webcam:
                        logger.error("Failed to read from webcam")
                        break
                    else:
                        logger.info("Video processing completed")
                        break
                
                # Run inference on frame
                start_time = time.time()
                
                # Convert frame to temporary file for YOLO (or use direct frame processing)
                temp_results = self.model.predict(
                    source=frame,
                    conf=self.confidence,
                    device=self.device,
                    save=False,
                    verbose=False
                )
                
                inference_time = time.time() - start_time
                total_inference_time += inference_time
                
                # Extract and visualize detections
                detections = self._extract_detections(temp_results)
                annotated_frame = self._draw_detections(frame, detections)
                
                # Add performance info
                fps_current = 1.0 / inference_time if inference_time > 0 else 0
                info_text = f"FPS: {fps_current:.1f} | Objects: {len(detections)}"
                cv2.putText(annotated_frame, info_text, (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                
                # Save frame if output video is specified
                if out:
                    out.write(annotated_frame)
                
                # Display frame
                cv2.imshow("YOLO Live Inference - Press 'q' to quit", annotated_frame)
                
                # Check for quit
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    logger.info("Quit requested by user")
                    break
                
                frame_count += 1
                
                # Progress update for video files
                if not is_webcam and frame_count % 30 == 0:
                    progress = (frame_count / total_frames) * 100
                    avg_fps = frame_count / total_inference_time if total_inference_time > 0 else 0
                    logger.info(f"Progress: {progress:.1f}% | Avg FPS: {avg_fps:.1f}")
        
        except KeyboardInterrupt:
            logger.info("Processing interrupted by user")
        
        finally:
            # Cleanup
            cap.release()
            if out:
                out.release()
            cv2.destroyAllWindows()
            
            # Final statistics
            if frame_count > 0:
                avg_fps = frame_count / total_inference_time if total_inference_time > 0 else 0
                logger.info(f"Processed {frame_count} frames | Average FPS: {avg_fps:.1f}")
    
    def _extract_detections(self, results) -> List:
        """Extract detections from YOLO results"""
        detections = []
        for result in results:
            if result.boxes is not None:
                boxes = result.boxes
                masks = result.masks
                
                for i, box in enumerate(boxes):
                    # Basic detection info
                    conf = float(box.conf.item())
                    cls_id = int(box.cls.item())
                    class_name = self.class_names.get(cls_id, f"class_{cls_id}")
                    x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                    
                    # Mask info if available
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
    
    def _draw_detections(self, image: np.ndarray, detections: List) -> np.ndarray:
        """Draw detections on image"""
        result_image = image.copy()
        
        for det in detections:
            x1, y1, x2, y2 = det['bbox']
            color = self.colors[det['class_id'] % len(self.colors)]
            
            # Draw bounding box
            cv2.rectangle(result_image, (x1, y1), (x2, y2), color, 2)
            
            # Draw label
            label = f"{det['class_name']}: {det['confidence']:.2f}"
            (label_w, label_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            
            # Label background
            cv2.rectangle(result_image, (x1, y1 - label_h - 10), (x1 + label_w, y1), color, -1)
            cv2.putText(result_image, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            # Draw mask if available
            if det['mask'] is not None:
                mask = det['mask']
                if mask.shape != image.shape[:2]:
                    mask = cv2.resize(mask, (image.shape[1], image.shape[0]))
                
                # Create colored mask overlay
                colored_mask = np.zeros_like(result_image)
                colored_mask[mask > 0.5] = color
                result_image = cv2.addWeighted(result_image, 1.0, colored_mask, 0.3, 0)
        
        return result_image
    
    def visualize_image(self, image_path: str, detections: List, save_path: str = None, show: bool = True) -> np.ndarray:
        """
        Visualize detection results for single image
        
        Args:
            image_path: Path to original image
            detections: List of detection dictionaries
            save_path: Optional path to save result
            show: Whether to display the image
            
        Returns:
            Annotated image
        """
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not load image: {image_path}")
        
        result_image = self._draw_detections(image, detections)
        
        # Add summary info
        info_text = f"Objects: {len(detections)}"
        cv2.putText(result_image, info_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        # Save if requested
        if save_path:
            success = cv2.imwrite(save_path, result_image)
            if success:
                logger.info(f"Result saved: {save_path}")
            else:
                logger.error(f"Failed to save: {save_path}")
        
        # Show if requested
        if show:
            cv2.imshow("YOLO Results - Press any key to close", result_image)
            cv2.waitKey(0)
            cv2.destroyAllWindows()
        
        return result_image
    
    def print_results(self, detections: List, inference_time: float, input_name: str):
        """Print formatted results"""
        print(f"\n{'='*50}")
        print(f"RESULTS: {os.path.basename(input_name)}")
        print(f"{'='*50}")
        print(f"Inference time: {inference_time:.3f}s")
        print(f"FPS: {1/inference_time:.1f}")
        print(f"Objects detected: {len(detections)}")
        
        if detections:
            print(f"\nDetections:")
            for i, det in enumerate(detections, 1):
                mask_info = f" (mask: {np.sum(det['mask'] > 0.5):.0f}px)" if det['mask'] is not None else ""
                print(f"  {i}. {det['class_name']}: {det['confidence']:.3f}{mask_info}")
        else:
            print("No objects detected")
        print(f"{'='*50}")

def main():
    """Main function with minimal argument parsing"""
    parser = argparse.ArgumentParser(
        description="Simple YOLO11 Segmentation Inference for Images, Videos, and Webcam",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    # Required arguments
    parser.add_argument("--model", "-m", required=True, 
                       help="Path to YOLO model (.pt file)")
    parser.add_argument("--input", "-i", required=True, 
                       help="Input source: image path, video path, or webcam index (0, 1, etc.)")
    
    # Optional arguments
    parser.add_argument("--conf", "-c", type=float, default=0.5,
                       help="Confidence threshold (0.0-1.0)")
    parser.add_argument("--device", "-d", default="auto", 
                       choices=["auto", "cpu", "cuda"],
                       help="Device to use for inference")
    parser.add_argument("--save", "-s", 
                       help="Path to save output (image/video)")
    parser.add_argument("--no-show", action="store_true",
                       help="Don't display the result window")
    
    args = parser.parse_args()
    
    # Validate model
    if not os.path.exists(args.model):
        logger.error(f"Model file not found: {args.model}")
        sys.exit(1)
    
    try:
        # Initialize inference engine
        engine = YOLOInference(args.model, args.conf, args.device)
        
        # Determine input type
        input_type = engine._get_input_type(args.input)
        logger.info(f"Input type detected: {input_type}")
        
        if input_type == "image":
            # Process single image
            detections, inference_time = engine.predict_image(args.input)
            
            # Print results
            engine.print_results(detections, inference_time, args.input)
            
            # Visualize results
            if detections or not args.no_show:
                engine.visualize_image(
                    args.input, 
                    detections, 
                    save_path=args.save,
                    show=not args.no_show
                )
        
        elif input_type in ["video", "webcam"]:
            # Process video stream
            video_source = int(args.input) if args.input.isdigit() else args.input
            engine.predict_video(video_source, save_path=args.save)
        
    except KeyboardInterrupt:
        logger.info("Cancelled by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()