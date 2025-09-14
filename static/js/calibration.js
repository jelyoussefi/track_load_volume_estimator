/**
 * Calibration management for the Dual Camera YOLO application
 */

window.CalibrationManager = {
    
    // Calibration state
    calibrationData: {
        camera1: { points: [], distances: [], isCalibrating: false, pixelsPerMeter: null },
        camera2: { points: [], distances: [], isCalibrating: false, pixelsPerMeter: null }
    },
    
    /**
     * Initialize calibration system
     */
    init() {
        this.setupCanvases();
        this.loadCalibrationData();
        console.log('Calibration manager initialized');
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
        console.log(`Starting calibration for camera ${cameraId}`);
        
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
        
        // Reset calibration data
        calibData.points = [];
        calibData.distances = [];
        calibData.isCalibrating = true;
        calibData.pixelsPerMeter = null;
        
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
        info.textContent = `PAUSED: Click exactly ${requiredPoints} corners to create calibration rectangle.`;
        info.classList.add('show');
        
        if (window.Utils) {
            window.Utils.showNotification(`Camera ${cameraId} calibration ready. Click 4 corners.`, 'info');
        }
        
        console.log(`Calibration UI ready for camera ${cameraId}`);
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
                window.Utils.showNotification('Rectangle complete. Collecting dimensions...', 'info');
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
            button.querySelector('.btn-text').textContent = 'Calibrate';
        }
        
        // Resume video processing
        if (window.ProcessingManager) {
            window.ProcessingManager.resumeAfterCalibration();
        }
        
        // Auto-start dimension collection after a short delay
        setTimeout(() => {
            this.collectDimensions(cameraId);
        }, 500);
        
        if (window.Utils) {
            window.Utils.showNotification(`Rectangle complete for Camera ${cameraId}. Starting dimension collection...`, 'success');
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
            info.textContent = `Point ${calibData.points.length}/${requiredPoints} added. ${requiredPoints - calibData.points.length} more needed.`;
        } else {
            info.textContent = 'Rectangle complete! Starting dimension collection...';
        }
    },
    
    /**
     * Collect real-world dimensions for calibration
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    collectDimensions(cameraId) {
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
        
        // Start prompting for dimensions
        this.promptForDimensions(cameraId, edges, 0);
    },
    
    /**
     * Prompt user for real-world dimensions of calibration edges
     * @param {number} cameraId - Camera ID (1 or 2)
     * @param {Array} edges - Array of edge data
     * @param {number} edgeIndex - Current edge index being processed
     */
    promptForDimensions(cameraId, edges, edgeIndex) {
        if (edgeIndex >= edges.length) {
            // All dimensions collected, calculate calibration
            this.calculateCalibration(cameraId);
            return;
        }
        
        const edge = edges[edgeIndex];
        const message = `Camera ${cameraId} - Enter the real-world length in meters for edge ${edge.from} → ${edge.to}:`;
        
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
            this.promptForDimensions(cameraId, edges, edgeIndex); // Retry same edge
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
        this.promptForDimensions(cameraId, edges, edgeIndex + 1);
    },
    
    /**
     * Calculate calibration from collected dimensions
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    calculateCalibration(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const distances = calibData.distances;
        
        if (distances.length === 0) {
            if (window.Utils) {
                window.Utils.showNotification('No dimensions provided', 'error');
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
        
        // Update display
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const formatNumber = window.Utils ? window.Utils.formatNumber : ((num, dec = 2) => num.toFixed(dec));
        info.textContent = `Calibrated: ${formatNumber(areaSquareMeters)} m² | ${formatNumber(calibData.pixelsPerMeter, 1)} px/m`;
        info.classList.add('show');
        
        // Save calibration data
        this.saveCalibrationData();
        
        console.log(`Camera ${cameraId} calibrated:`, {
            pixelsPerMeter: calibData.pixelsPerMeter,
            areaSquareMeters: areaSquareMeters,
            points: calibData.points.length
        });
        
        if (window.Utils) {
            window.Utils.showNotification(`Camera ${cameraId} calibrated successfully!`, 'success');
        }
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
        calibData.isCalibrating = false;
        calibData.pixelsPerMeter = null;
        
        // Clear canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Deactivate canvas
        canvas.classList.remove('active');
        
        // Reset button appearance
        if (button) {
            button.classList.remove('calibrating');
            button.querySelector('.btn-text').textContent = 'Calibrate';
        }
        
        // Hide info
        info.classList.remove('show');
        
        // Resume video processing
        if (window.ProcessingManager) {
            window.ProcessingManager.resumeAfterCalibration();
        }
        
        // Save calibration data
        this.saveCalibrationData();
        
        console.log(`Cleared calibration for camera ${cameraId}`);
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
        
        if (calibData.points.length === requiredPoints && calibData.pixelsPerMeter) {
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
            
            // Update info - don't show calibration details, just hide info
            info.classList.remove('show'); // Keep calibration info hidden
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
                        this.calibrationData[key].pixelsPerMeter = loaded[key].pixelsPerMeter || null;
                    }
                }
                console.log('Loaded calibration data from localStorage');
                
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
     * Export calibration data to file
     */
    exportCalibration() {
        const data = JSON.stringify(this.calibrationData, null, 2);
        console.log('Calibration data:', data);
        
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'truck-volume-calibration.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if (window.Utils) {
            window.Utils.showNotification('Calibration data exported', 'success');
        }
    },
    
    /**
     * Import calibration data from file
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
                            window.Utils.showNotification('Calibration data imported successfully', 'success');
                        }
                        console.log('Imported calibration data:', this.calibrationData);
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
        if (confirm('Reset all calibration data? This cannot be undone.')) {
            this.calibrationData = {
                camera1: { points: [], distances: [], isCalibrating: false, pixelsPerMeter: null },
                camera2: { points: [], distances: [], isCalibrating: false, pixelsPerMeter: null }
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
                btn.querySelector('.btn-text').textContent = 'Calibrate';
            });
            
            // Resume video processing
            if (window.ProcessingManager) {
                window.ProcessingManager.resumeAfterCalibration();
            }
            
            this.saveCalibrationData();
            if (window.Utils) {
                window.Utils.showNotification('All calibration data reset', 'info');
            }
            console.log('All calibration data reset');
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
     * Get calibration data for a specific camera
     * @param {number} cameraId - Camera ID (1 or 2)
     * @returns {Object} Calibration data for the camera
     */
    getCalibrationData(cameraId) {
        return this.calibrationData[`camera${cameraId}`];
    },
    
    /**
     * Check if a camera is calibrated
     * @param {number} cameraId - Camera ID (1 or 2) 
     * @returns {boolean} True if camera is calibrated
     */
    isCalibrated(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        return !!(calibData.pixelsPerMeter && calibData.points.length === requiredPoints);
    },
    
    /**
     * Finish calibration process (fallback method)
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    finishCalibrationProcess(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const requiredPoints = window.CONFIG ? window.CONFIG.CALIBRATION.REQUIRED_POINTS : 4;
        
        // Only allow early finish if we have exactly 4 points (shouldn't happen with new flow)
        if (calibData.points.length !== requiredPoints) {
            if (window.Utils) {
                window.Utils.showNotification(`Need exactly ${requiredPoints} points. Currently have ${calibData.points.length}. Continue clicking corners.`, 'error');
            }
            return;
        }
        
        // This function now mainly serves as a fallback
        const canvas = document.getElementById(`canvas${cameraId}`);
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
        
        // Close the rectangle if not already closed
        const ctx = canvas.getContext('2d');
        const firstPoint = calibData.points[0];
        const lastPoint = calibData.points[requiredPoints - 1];
        
        const colors = window.CONFIG ? window.CONFIG.COLORS : {
            LINE_COLOR: '#4ecdc4',
            FILL_COLOR: 'rgba(255, 0, 0, 0.3)'
        };
        
        ctx.strokeStyle = colors.LINE_COLOR;
        ctx.lineWidth = window.CONFIG ? window.CONFIG.CALIBRATION.LINE_WIDTH : 3;
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(firstPoint.x, firstPoint.y);
        ctx.stroke();
        
        // Fill the rectangle with red transparent color
        ctx.fillStyle = colors.FILL_COLOR;
        ctx.beginPath();
        ctx.moveTo(calibData.points[0].x, calibData.points[0].y);
        for (let i = 1; i < calibData.points.length; i++) {
            ctx.lineTo(calibData.points[i].x, calibData.points[i].y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Deactivate canvas
        canvas.classList.remove('active');
        calibData.isCalibrating = false;
        
        // Reset button appearance
        if (button) {
            button.classList.remove('calibrating');
            button.querySelector('.btn-text').textContent = 'Calibrate';
        }
        
        // Resume video processing
        if (window.ProcessingManager) {
            window.ProcessingManager.resumeAfterCalibration();
        }
        
        // Start dimension collection
        this.collectDimensions(cameraId);
    }
};