/**
 * Enhanced Calibration management for the Dual Camera YOLO application
 * Now includes camera height and distance-to-corner measurements for 3D volume calculation
 */

window.CalibrationManager = {
    
    // Enhanced calibration state
    calibrationData: {
        camera1: { 
            points: [], 
            distances: [], 
            isCalibrating: false, 
            pixelsPerMeter: null,
            cameraHeight: null,
            cornerDistances: [] // Distance from camera to each corner
        },
        camera2: { 
            points: [], 
            distances: [], 
            isCalibrating: false, 
            pixelsPerMeter: null,
            cameraHeight: null,
            cornerDistances: [] // Distance from camera to each corner
        }
    },
    
    /**
     * Initialize calibration system
     */
    init() {
        this.setupCanvases();
        this.loadCalibrationData();
        console.log('Enhanced calibration manager initialized with 3D capabilities');
    },
    
    /**
     * Setup calibration canvases for both cameras
     */
    setupCanvases() {
        for (let cameraId = 1; cameraId <= 2; cameraId++) {
            const canvas = document.getElementById(`canvas${cameraId}`);
            const img = document.getElementById(`camera${cameraId}`);
            
            if (!canvas || !img) {
                console.error(`Canvas or image not found for camera ${cameraId}`);
                continue;
            }
            
            // Set canvas size to match image
            const resizeCanvasForCamera = () => this.resizeCanvas(cameraId);
            
            img.addEventListener('load', resizeCanvasForCamera);
            img.addEventListener('loadeddata', resizeCanvasForCamera);
            window.addEventListener('resize', window.Utils ? window.Utils.debounce(resizeCanvasForCamera, 100) : resizeCanvasForCamera);
            
            // Add click event for calibration
            canvas.addEventListener('click', (e) => this.handleCanvasClick(e, cameraId));
            
            // Add right-click event to finish calibration (fallback)
            canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (this.calibrationData[`camera${cameraId}`].isCalibrating) {
                    this.finishCalibrationProcess(cameraId);
                }
            });
            
            // Initial resize
            const delay = window.CONFIG ? window.CONFIG.TIMING.CANVAS_RESIZE_DELAY : 100;
            setTimeout(resizeCanvasForCamera, delay);
        }
    },
    
    /**
     * Resize canvas to match image dimensions
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    resizeCanvas(cameraId) {
        const canvas = document.getElementById(`canvas${cameraId}`);
        const img = document.getElementById(`camera${cameraId}`);
        
        if (img && canvas && img.naturalWidth && img.naturalHeight) {
            // Set canvas size to match the displayed image size
            canvas.width = img.offsetWidth;
            canvas.height = img.offsetHeight;
            
            // Redraw calibration if exists
            const delay = window.CONFIG ? window.CONFIG.TIMING.CANVAS_RESIZE_DELAY : 100;
            setTimeout(() => {
                this.redrawCalibrationPolygon(cameraId);
            }, delay);
            
            console.log(`Canvas ${cameraId} resized to ${canvas.width}x${canvas.height}`);
        }
    },
    
    /**
     * Start calibration process for a camera
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    startCalibration(cameraId) {
        console.log(`Starting enhanced 3D calibration for camera ${cameraId}`);
        
        // First collect camera height
        this.collectCameraHeight(cameraId);
    },
    
    /**
     * Collect camera height information
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    collectCameraHeight(cameraId) {
        const height = prompt(`Camera ${cameraId} Setup:\n\nEnter the height of Camera ${cameraId} above the truck bed (in meters):\n\nThis is the vertical distance from the camera lens to the truck bed surface.`);
        
        if (height === null) {
            // User cancelled
            if (window.Utils) {
                window.Utils.showNotification('Calibration cancelled', 'info');
            }
            return;
        }
        
        const isValid = window.Utils ? window.Utils.isValidPositiveNumber(height) : (!isNaN(parseFloat(height)) && parseFloat(height) > 0);
        
        if (!isValid) {
            if (window.Utils) {
                window.Utils.showNotification('Please enter a valid positive number for camera height', 'error');
            }
            this.collectCameraHeight(cameraId); // Retry
            return;
        }
        
        const meters = parseFloat(height);
        this.calibrationData[`camera${cameraId}`].cameraHeight = meters;
        
        if (window.Utils) {
            window.Utils.showNotification(`Camera ${cameraId} height set to ${meters}m. Starting area calibration...`, 'success');
        }
        
        // Now proceed with area calibration
        this.startAreaCalibration(cameraId);
    },
    
    /**
     * Start area calibration after height is collected
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    startAreaCalibration(cameraId) {
        // Pause video processing FIRST before any UI changes
        if (window.ProcessingManager) {
            window.ProcessingManager.pauseForCalibration();
        }
        
        // Add a small delay to ensure backend has time to process the pause request
        setTimeout(() => {
            this.setupCalibrationUI(cameraId);
        }, 200);
    },
    
    /**
     * Setup calibration UI after processing is paused
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    setupCalibrationUI(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
        
        // Reset calibration data (but keep camera height)
        const savedHeight = calibData.cameraHeight;
        calibData.points = [];
        calibData.distances = [];
        calibData.cornerDistances = [];
        calibData.isCalibrating = true;
        calibData.pixelsPerMeter = null;
        calibData.cameraHeight = savedHeight;
        
        // Ensure canvas is properly sized
        this.resizeCanvas(cameraId);
        
        // Clear canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Activate canvas
        canvas.classList.add('active');
        
        // Update button appearance
        if (button) {
            button.classList.add('calibrating');
            button.querySelector('.btn-text').textContent = 'Drawing...';
        }
        
        // Show instruction for exactly 4 corners
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        info.textContent = `PAUSED: Click exactly ${requiredPoints} corners of the truck bed area. Camera height: ${savedHeight}m`;
        info.classList.add('show');
        
        if (window.Utils) {
            window.Utils.showNotification(`Camera ${cameraId} area calibration ready. Click 4 corners of truck bed.`, 'info');
        }
        
        console.log(`Area calibration UI ready for camera ${cameraId} (height: ${savedHeight}m)`);
    },
    
    /**
     * Handle canvas click for calibration point placement
     * @param {Event} event - Click event
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    handleCanvasClick(event, cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        
        if (!calibData.isCalibrating) return;
        
        // Stop if already have required points
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        if (calibData.points.length >= requiredPoints) {
            if (window.Utils) {
                window.Utils.showNotification('Rectangle complete. Collecting distance measurements...', 'info');
            }
            return;
        }
        
        const canvas = document.getElementById(`canvas${cameraId}`);
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Scale coordinates to canvas size
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const scaledX = x * scaleX;
        const scaledY = y * scaleY;
        
        // Add point
        calibData.points.push({ x: scaledX, y: scaledY });
        
        // Draw point and update display
        this.drawCalibrationPoint(canvas, scaledX, scaledY, calibData.points.length);
        this.updateCalibrationInfo(cameraId);
        
        // Check if calibration is complete
        if (calibData.points.length === requiredPoints) {
            this.completeCalibrationShape(cameraId);
        }
        
        console.log(`Added point ${calibData.points.length}/${requiredPoints} for camera ${cameraId}:`, { x: scaledX, y: scaledY });
    },
    
    /**
     * Draw a calibration point on the canvas
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate  
     * @param {number} pointNumber - Point number for labeling
     */
    drawCalibrationPoint(canvas, x, y, pointNumber) {
        const ctx = canvas.getContext('2d');
        const calibData = this.calibrationData[`camera${canvas.id.slice(-1)}`];
        
        // Get colors from config or use defaults
        const colors = window.CONFIG ? window.CONFIG.COLORS : {
            POINT_COLOR: '#ff6b6b',
            LINE_COLOR: '#4ecdc4',
            TEXT_OUTLINE: 'black',
            TEXT_FILL: 'white'
        };
        
        // Draw point
        ctx.fillStyle = colors.POINT_COLOR;
        ctx.beginPath();
        ctx.arc(x, y, window.CONFIG ? window.CONFIG.CALIBRATION.POINT_RADIUS : 8, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add point number with white outline for better visibility
        ctx.strokeStyle = colors.TEXT_OUTLINE;
        ctx.lineWidth = 3;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.strokeText(pointNumber.toString(), x, y + 5);
        
        ctx.fillStyle = colors.TEXT_FILL;
        ctx.fillText(pointNumber.toString(), x, y + 5);
        
        // Draw line to previous point
        if (calibData.points.length > 1) {
            const prevPoint = calibData.points[calibData.points.length - 2];
            ctx.strokeStyle = colors.LINE_COLOR;
            ctx.lineWidth = window.CONFIG ? window.CONFIG.CALIBRATION.LINE_WIDTH : 3;
            ctx.beginPath();
            ctx.moveTo(prevPoint.x, prevPoint.y);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    },
    
    /**
     * Complete the calibration shape when all points are placed
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    completeCalibrationShape(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        const ctx = canvas.getContext('2d');
        
        // Get required points from config
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        
        // Get colors from config or use defaults
        const colors = window.CONFIG ? window.CONFIG.COLORS : {
            LINE_COLOR: '#4ecdc4',
            FILL_COLOR: 'rgba(255, 0, 0, 0.3)'
        };
        
        // Close the rectangle
        const firstPoint = calibData.points[0];
        const lastPoint = calibData.points[requiredPoints - 1];
        
        ctx.strokeStyle = colors.LINE_COLOR;
        ctx.lineWidth = window.CONFIG ? window.CONFIG.CALIBRATION.LINE_WIDTH : 3;
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(firstPoint.x, firstPoint.y);
        ctx.stroke();
        
        // Fill the rectangle with transparent color
        ctx.fillStyle = colors.FILL_COLOR;
        ctx.beginPath();
        ctx.moveTo(calibData.points[0].x, calibData.points[0].y);
        for (let i = 1; i < calibData.points.length; i++) {
            ctx.lineTo(calibData.points[i].x, calibData.points[i].y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Deactivate canvas immediately
        canvas.classList.remove('active');
        calibData.isCalibrating = false;
        
        // Reset button appearance
        const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
        if (button) {
            button.classList.remove('calibrating');
            button.querySelector('.btn-text').textContent = '3D Calibrate';
        }
        
        // Resume video processing
        if (window.ProcessingManager) {
            window.ProcessingManager.resumeAfterCalibration();
        }
        
        // Auto-start distance collection after a short delay
        setTimeout(() => {
            this.collectDistanceMeasurements(cameraId);
        }, 500);
        
        if (window.Utils) {
            window.Utils.showNotification(`Rectangle complete for Camera ${cameraId}. Starting distance collection...`, 'success');
        }
    },
    
    /**
     * Update calibration info display
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    updateCalibrationInfo(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        
        if (calibData.points.length < requiredPoints) {
            info.textContent = `Point ${calibData.points.length}/${requiredPoints} added. Camera height: ${calibData.cameraHeight}m`;
        } else {
            info.textContent = 'Rectangle complete! Starting distance collection...';
        }
    },
    
    /**
     * Collect distance measurements from camera to each corner
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    collectDistanceMeasurements(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const points = calibData.points;
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        
        if (points.length !== requiredPoints) {
            if (window.Utils) {
                window.Utils.showNotification(`Need exactly ${requiredPoints} points for calibration`, 'error');
            }
            return;
        }
        
        // Collect distance from camera to each corner
        this.promptForCornerDistances(cameraId, 0);
    },
    
    /**
     * Prompt user for distance from camera to each corner
     * @param {number} cameraId - Camera ID (1 or 2)
     * @param {number} cornerIndex - Current corner index being processed
     */
    promptForCornerDistances(cameraId, cornerIndex) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        
        if (cornerIndex >= requiredPoints) {
            // All corner distances collected, now collect edge dimensions
            this.collectEdgeDimensions(cameraId);
            return;
        }
        
        const cornerNumber = cornerIndex + 1;
        const message = `Camera ${cameraId} Distance Measurement:\n\nEnter the straight-line distance from Camera ${cameraId} to Corner ${cornerNumber} in meters:\n\n(This is the 3D distance from the camera lens to the corner point on the truck bed)`;
        
        const distance = prompt(message);
        
        if (distance === null) {
            // User cancelled
            this.clearCalibration(cameraId);
            return;
        }
        
        const isValid = window.Utils ? window.Utils.isValidPositiveNumber(distance) : (!isNaN(parseFloat(distance)) && parseFloat(distance) > 0);
        
        if (!isValid) {
            if (window.Utils) {
                window.Utils.showNotification('Please enter a valid positive number', 'error');
            }
            this.promptForCornerDistances(cameraId, cornerIndex); // Retry same corner
            return;
        }
        
        const meters = parseFloat(distance);
        
        // Store the corner distance
        calibData.cornerDistances.push({
            cornerIndex: cornerIndex,
            cornerNumber: cornerNumber,
            distance: meters
        });
        
        console.log(`Camera ${cameraId}, Corner ${cornerNumber}: ${meters}m`);
        
        // Continue with next corner
        this.promptForCornerDistances(cameraId, cornerIndex + 1);
    },
    
    /**
     * Collect real-world dimensions for calibration edges
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    collectEdgeDimensions(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const points = calibData.points;
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        
        if (points.length !== requiredPoints) {
            if (window.Utils) {
                window.Utils.showNotification(`Need exactly ${requiredPoints} points for calibration`, 'error');
            }
            return;
        }
        
        // Calculate distances for each edge of the rectangle
        const edges = [];
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            const pixelDistance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            edges.push({
                from: i + 1,
                to: ((i + 1) % points.length) + 1,
                pixelDistance: pixelDistance
            });
        }
        
        // Start prompting for edge dimensions
        this.promptForEdgeDimensions(cameraId, edges, 0);
    },
    
    /**
     * Prompt user for real-world dimensions of calibration edges
     * @param {number} cameraId - Camera ID (1 or 2)
     * @param {Array} edges - Array of edge data
     * @param {number} edgeIndex - Current edge index being processed
     */
    promptForEdgeDimensions(cameraId, edges, edgeIndex) {
        if (edgeIndex >= edges.length) {
            // All dimensions collected, calculate calibration
            this.calculateEnhancedCalibration(cameraId);
            return;
        }
        
        const edge = edges[edgeIndex];
        const message = `Camera ${cameraId} Edge Measurement:\n\nEnter the real-world length of edge ${edge.from} → ${edge.to} in meters:\n\n(This is the actual distance along the truck bed surface)`;
        
        const dimension = prompt(message);
        
        if (dimension === null) {
            // User cancelled
            this.clearCalibration(cameraId);
            return;
        }
        
        const isValid = window.Utils ? window.Utils.isValidPositiveNumber(dimension) : (!isNaN(parseFloat(dimension)) && parseFloat(dimension) > 0);
        
        if (!isValid) {
            if (window.Utils) {
                window.Utils.showNotification('Please enter a valid positive number', 'error');
            }
            this.promptForEdgeDimensions(cameraId, edges, edgeIndex); // Retry same edge
            return;
        }
        
        const meters = parseFloat(dimension);
        
        // Store the dimension
        this.calibrationData[`camera${cameraId}`].distances.push({
            edgeIndex: edgeIndex,
            meters: meters,
            pixels: edge.pixelDistance
        });
        
        // Continue with next edge
        this.promptForEdgeDimensions(cameraId, edges, edgeIndex + 1);
    },
    
    /**
     * Calculate enhanced calibration from collected measurements
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    calculateEnhancedCalibration(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const distances = calibData.distances;
        const cornerDistances = calibData.cornerDistances;
        const cameraHeight = calibData.cameraHeight;
        
        if (distances.length === 0 || cornerDistances.length === 0 || !cameraHeight) {
            if (window.Utils) {
                window.Utils.showNotification('Incomplete calibration data', 'error');
            }
            return;
        }
        
        // Calculate average pixels per meter from all edges
        let totalPixelsPerMeter = 0;
        let validCount = 0;
        
        distances.forEach(dist => {
            if (dist.pixels > 0 && dist.meters > 0) {
                totalPixelsPerMeter += dist.pixels / dist.meters;
                validCount++;
            }
        });
        
        if (validCount === 0) {
            if (window.Utils) {
                window.Utils.showNotification('No valid calibration data', 'error');
            }
            return;
        }
        
        calibData.pixelsPerMeter = totalPixelsPerMeter / validCount;
        
        // Calculate area in square meters
        const areaPixels = window.Utils ? 
            window.Utils.calculatePolygonArea(calibData.points) : 
            this.calculatePolygonAreaFallback(calibData.points);
        const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
        
        // Calculate 3D calibration data
        const calibration3D = this.calculate3DCalibration(calibData);
        
        // Update display
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const formatNumber = window.Utils ? window.Utils.formatNumber : ((num, dec = 2) => num.toFixed(dec));
        info.textContent = `3D Calibrated: ${formatNumber(areaSquareMeters)} m² | H:${formatNumber(cameraHeight)}m | ${formatNumber(calibData.pixelsPerMeter, 1)} px/m`;
        info.classList.add('show');
        
        // Save calibration data
        this.saveCalibrationData();
        
        console.log(`Camera ${cameraId} 3D calibrated:`, {
            pixelsPerMeter: calibData.pixelsPerMeter,
            areaSquareMeters: areaSquareMeters,
            cameraHeight: cameraHeight,
            cornerDistances: cornerDistances.length,
            calibration3D: calibration3D
        });
        
        if (window.Utils) {
            window.Utils.showNotification(`Camera ${cameraId} 3D calibration complete!`, 'success');
        }
    },
    
    /**
     * Calculate 3D calibration parameters using camera height and corner distances
     * @param {Object} calibData - Calibration data
     * @returns {Object} 3D calibration parameters
     */
    calculate3DCalibration(calibData) {
        const { cameraHeight, cornerDistances, points } = calibData;
        
        if (!cameraHeight || cornerDistances.length !== 4 || points.length !== 4) {
            return null;
        }
        
        // Calculate 3D positions of corners
        const corners3D = cornerDistances.map((cornerDist, index) => {
            const point2D = points[index];
            const distance3D = cornerDist.distance;
            
            // Calculate horizontal distance from camera using Pythagorean theorem
            const horizontalDistance = Math.sqrt(distance3D * distance3D - cameraHeight * cameraHeight);
            
            return {
                cornerIndex: index + 1,
                distance3D: distance3D,
                horizontalDistance: horizontalDistance,
                pixelX: point2D.x,
                pixelY: point2D.y,
                // Estimated 3D coordinates (relative to camera)
                x3D: horizontalDistance * Math.cos(index * Math.PI / 2), // Simplified assumption
                y3D: horizontalDistance * Math.sin(index * Math.PI / 2), // Simplified assumption
                z3D: -cameraHeight // Negative because truck bed is below camera
            };
        });
        
        return {
            cameraHeight: cameraHeight,
            corners3D: corners3D,
            averageHorizontalDistance: corners3D.reduce((sum, c) => sum + c.horizontalDistance, 0) / corners3D.length,
            calibrationQuality: this.assessCalibrationQuality(corners3D)
        };
    },
    
    /**
     * Assess the quality of 3D calibration
     * @param {Array} corners3D - 3D corner data
     * @returns {Object} Quality assessment
     */
    assessCalibrationQuality(corners3D) {
        if (corners3D.length !== 4) {
            return { quality: 'poor', issues: ['Insufficient corner data'] };
        }
        
        const distances = corners3D.map(c => c.horizontalDistance);
        const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
        const maxDeviation = Math.max(...distances.map(d => Math.abs(d - avgDistance)));
        const deviationPercent = (maxDeviation / avgDistance) * 100;
        
        let quality = 'excellent';
        let issues = [];
        
        if (deviationPercent > 30) {
            quality = 'poor';
            issues.push('Large variation in corner distances suggests measurement errors');
        } else if (deviationPercent > 15) {
            quality = 'fair';
            issues.push('Moderate variation in corner distances');
        } else if (deviationPercent > 5) {
            quality = 'good';
        }
        
        // Check for reasonable distances
        if (avgDistance < 1.0) {
            issues.push('Camera appears very close to truck bed');
        } else if (avgDistance > 20.0) {
            issues.push('Camera appears very far from truck bed');
        }
        
        return {
            quality: quality,
            deviationPercent: deviationPercent,
            averageDistance: avgDistance,
            issues: issues
        };
    },
    
    /**
     * Fallback polygon area calculation if Utils is not available
     * @param {Array} points - Array of {x, y} points
     * @returns {number} - The area of the polygon
     */
    calculatePolygonAreaFallback(points) {
        if (points.length < 3) return 0;
        
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return Math.abs(area) / 2;
    },
    
    /**
     * Clear calibration for a camera
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    clearCalibration(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
        
        // Reset data
        calibData.points = [];
        calibData.distances = [];
        calibData.cornerDistances = [];
        calibData.isCalibrating = false;
        calibData.pixelsPerMeter = null;
        calibData.cameraHeight = null;
        
        // Clear canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Deactivate canvas
        canvas.classList.remove('active');
        
        // Reset button appearance
        if (button) {
            button.classList.remove('calibrating');
            button.querySelector('.btn-text').textContent = '3D Calibrate';
        }
        
        // Hide info
        info.classList.remove('show');
        
        // Resume video processing
        if (window.ProcessingManager) {
            window.ProcessingManager.resumeAfterCalibration();
        }
        
        // Save calibration data
        this.saveCalibrationData();
        
        console.log(`Cleared enhanced calibration for camera ${cameraId}`);
        if (window.Utils) {
            window.Utils.showNotification(`Camera ${cameraId} calibration cleared`, 'info');
        }
    },
    
    /**
     * Redraw calibration polygon after canvas resize or stream refresh
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    redrawCalibrationPolygon(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        
        if (calibData.points.length === requiredPoints && calibData.pixelsPerMeter && calibData.cameraHeight) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const colors = window.CONFIG ? window.CONFIG.COLORS : {
                FILL_COLOR: 'rgba(255, 0, 0, 0.3)',
                LINE_COLOR: '#4ecdc4',
                POINT_COLOR: '#ff6b6b',
                TEXT_OUTLINE: 'black',
                TEXT_FILL: 'white'
            };
            
            // Draw red transparent fill first
            ctx.fillStyle = colors.FILL_COLOR;
            ctx.beginPath();
            ctx.moveTo(calibData.points[0].x, calibData.points[0].y);
            for (let i = 1; i < calibData.points.length; i++) {
                ctx.lineTo(calibData.points[i].x, calibData.points[i].y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Draw rectangle outline
            ctx.strokeStyle = colors.LINE_COLOR;
            ctx.lineWidth = window.CONFIG ? window.CONFIG.CALIBRATION.LINE_WIDTH : 3;
            ctx.beginPath();
            
            calibData.points.forEach((point, index) => {
                if (index === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
                
                // Draw point
                ctx.save();
                ctx.fillStyle = colors.POINT_COLOR;
                ctx.beginPath();
                ctx.arc(point.x, point.y, window.CONFIG ? window.CONFIG.CALIBRATION.POINT_RADIUS : 8, 0, 2 * Math.PI);
                ctx.fill();
                
                // Draw point number with outline for better visibility
                ctx.strokeStyle = colors.TEXT_OUTLINE;
                ctx.lineWidth = 3;
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.strokeText((index + 1).toString(), point.x, point.y + 5);
                
                ctx.fillStyle = colors.TEXT_FILL;
                ctx.fillText((index + 1).toString(), point.x, point.y + 5);
                ctx.restore();
            });
            
            // Close the rectangle
            ctx.closePath();
            ctx.stroke();
            
            // Show calibration info with 3D data
            const areaPixels = window.Utils ? 
                window.Utils.calculatePolygonArea(calibData.points) : 
                this.calculatePolygonAreaFallback(calibData.points);
            const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
            const formatNumber = window.Utils ? window.Utils.formatNumber : ((num, dec = 2) => num.toFixed(dec));
            
            info.textContent = `3D Calibrated: ${formatNumber(areaSquareMeters)} m² | H:${formatNumber(calibData.cameraHeight)}m`;
            info.classList.add('show');
        }
    },
    
    /**
     * Save calibration data to localStorage
     */
    saveCalibrationData() {
        try {
            const storageKey = window.CONFIG ? window.CONFIG.CALIBRATION.STORAGE_KEY : 'truckVolumeCalibration';
            localStorage.setItem(storageKey, JSON.stringify(this.calibrationData));
        } catch (e) {
            console.warn('Could not save calibration data to localStorage:', e);
        }
    },
    
    /**
     * Load calibration data from localStorage
     */
    loadCalibrationData() {
        try {
            const storageKey = window.CONFIG ? window.CONFIG.CALIBRATION.STORAGE_KEY : 'truckVolumeCalibration';
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const loaded = JSON.parse(saved);
                // Merge with current data (excluding isCalibrating state)
                for (let key in loaded) {
                    if (this.calibrationData[key]) {
                        this.calibrationData[key].points = loaded[key].points || [];
                        this.calibrationData[key].distances = loaded[key].distances || [];
                        this.calibrationData[key].cornerDistances = loaded[key].cornerDistances || [];
                        this.calibrationData[key].pixelsPerMeter = loaded[key].pixelsPerMeter || null;
                        this.calibrationData[key].cameraHeight = loaded[key].cameraHeight || null;
                    }
                }
                console.log('Loaded enhanced calibration data from localStorage');
                
                // Redraw calibration polygons after a delay to ensure canvases are ready
                const delay = window.CONFIG ? window.CONFIG.TIMING.CALIBRATION_REDRAW_DELAY : 1000;
                setTimeout(() => {
                    this.redrawCalibrationPolygon(1);
                    this.redrawCalibrationPolygon(2);
                }, delay);
            }
        } catch (e) {
            console.warn('Could not load calibration data from localStorage:', e);
        }
    },
    
    /**
     * Export enhanced calibration data to file
     */
    exportCalibration() {
        const data = JSON.stringify(this.calibrationData, null, 2);
        console.log('Enhanced calibration data:', data);
        
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'truck-volume-3d-calibration.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if (window.Utils) {
            window.Utils.showNotification('3D calibration data exported', 'success');
        }
    },
    
    /**
     * Import enhanced calibration data from file
     */
    importCalibration() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const imported = JSON.parse(e.target.result);
                        this.calibrationData = imported;
                        this.saveCalibrationData();
                        
                        setTimeout(() => {
                            this.redrawCalibrationPolygon(1);
                            this.redrawCalibrationPolygon(2);
                        }, 500);
                        
                        if (window.Utils) {
                            window.Utils.showNotification('3D calibration data imported successfully', 'success');
                        }
                        console.log('Imported enhanced calibration data:', this.calibrationData);
                    } catch (error) {
                        if (window.Utils) {
                            window.Utils.showNotification('Failed to import calibration data', 'error');
                        }
                        console.error('Import error:', error);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    },
    
    /**
     * Reset all calibration data
     */
    resetCalibration() {
        if (confirm('Reset all 3D calibration data? This cannot be undone.')) {
            this.calibrationData = {
                camera1: { 
                    points: [], 
                    distances: [], 
                    cornerDistances: [],
                    isCalibrating: false, 
                    pixelsPerMeter: null,
                    cameraHeight: null
                },
                camera2: { 
                    points: [], 
                    distances: [], 
                    cornerDistances: [],
                    isCalibrating: false, 
                    pixelsPerMeter: null,
                    cameraHeight: null
                }
            };
            
            // Clear canvases
            ['canvas1', 'canvas2'].forEach(canvasId => {
                const canvas = document.getElementById(canvasId);
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            });
            
            // Hide info displays
            ['calibrationInfo1', 'calibrationInfo2'].forEach(infoId => {
                const info = document.getElementById(infoId);
                if (info) info.classList.remove('show');
            });
            
            // Reset button states
            document.querySelectorAll('.btn-calibrate').forEach(btn => {
                btn.classList.remove('calibrating');
                btn.querySelector('.btn-text').textContent = '3D Calibrate';
            });
            
            // Resume video processing
            if (window.ProcessingManager) {
                window.ProcessingManager.resumeAfterCalibration();
            }
            
            this.saveCalibrationData();
            if (window.Utils) {
                window.Utils.showNotification('All 3D calibration data reset', 'info');
            }
            console.log('All enhanced calibration data reset');
        }
    },
    
    /**
     * Check if any camera is currently calibrating
     * @returns {boolean} True if any camera is calibrating
     */
    isAnyCalibrating() {
        return Object.values(this.calibrationData).some(data => data.isCalibrating);
    },
    
    /**
     * Cancel active calibrations
     */
    cancelActiveCalibrations() {
        for (let cameraId = 1; cameraId <= 2; cameraId++) {
            if (this.calibrationData[`camera${cameraId}`].isCalibrating) {
                this.clearCalibration(cameraId);
                if (window.Utils) {
                    window.Utils.showNotification(`Calibration cancelled for Camera ${cameraId}`, 'info');
                }
            }
        }
    },
    
    /**
     * Get enhanced calibration data for a specific camera
     * @param {number} cameraId - Camera ID (1 or 2)
     * @returns {Object} Enhanced calibration data for the camera
     */
    getCalibrationData(cameraId) {
        return this.calibrationData[`camera${cameraId}`];
    },
    
    /**
     * Get 3D calibration data for volume calculations
     * @param {number} cameraId - Camera ID (1 or 2)
     * @returns {Object} 3D calibration data or null
     */
    get3DCalibrationData(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        if (calibData.cameraHeight && calibData.cornerDistances.length === 4) {
            return this.calculate3DCalibration(calibData);
        }
        return null;
    },
    
    /**
     * Check if a camera is fully calibrated (including 3D data)
     * @param {number} cameraId - Camera ID (1 or 2) 
     * @returns {boolean} True if camera is fully calibrated
     */
    isCalibrated(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        return !!(
            calibData.pixelsPerMeter && 
            calibData.points.length === requiredPoints &&
            calibData.cameraHeight &&
            calibData.cornerDistances.length === requiredPoints
        );
    },
    
    /**
     * Check if a camera has basic 2D calibration
     * @param {number} cameraId - Camera ID (1 or 2)
     * @returns {boolean} True if camera has basic calibration
     */
    hasBasicCalibration(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        return !!(calibData.pixelsPerMeter && calibData.points.length === requiredPoints);
    },
    
    /**
     * Check if a camera has 3D calibration data
     * @param {number} cameraId - Camera ID (1 or 2)
     * @returns {boolean} True if camera has 3D calibration
     */
    has3DCalibration(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        return !!(
            calibData.cameraHeight &&
            calibData.cornerDistances.length === requiredPoints
        );
    },
    
    /**
     * Get calibration summary for debugging
     * @returns {Object} Summary of all calibration data
     */
    getCalibrationSummary() {
        const summary = {};
        
        for (let cameraId = 1; cameraId <= 2; cameraId++) {
            const calibData = this.calibrationData[`camera${cameraId}`];
            const calib3D = this.get3DCalibrationData(cameraId);
            
            summary[`camera${cameraId}`] = {
                hasBasicCalibration: this.hasBasicCalibration(cameraId),
                has3DCalibration: this.has3DCalibration(cameraId),
                isFullyCalibrated: this.isCalibrated(cameraId),
                cameraHeight: calibData.cameraHeight,
                cornerCount: calibData.cornerDistances.length,
                pixelsPerMeter: calibData.pixelsPerMeter,
                calibrationQuality: calib3D ? calib3D.calibrationQuality : null
            };
        }
        
        return summary;
    },
    
    /**
     * Finish calibration process (fallback method)
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    finishCalibrationProcess(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        
        // Only allow early finish if we have exactly 4 points
        if (calibData.points.length !== requiredPoints) {
            if (window.Utils) {
                window.Utils.showNotification(`Need exactly ${requiredPoints} points. Currently have ${calibData.points.length}. Continue clicking corners.`, 'error');
            }
            return;
        }
        
        // Complete the shape and start measurements
        this.completeCalibrationShape(cameraId);
    }
};