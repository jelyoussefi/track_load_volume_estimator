// Dual Camera YOLO Web Interface JavaScript

let isProcessing = false;
let statsInterval = null;
let connectionCheckInterval = null;
let pausedForCalibration = false;

// Calibration state
let calibrationData = {
    camera1: { points: [], distances: [], isCalibrating: false, pixelsPerMeter: null },
    camera2: { points: [], distances: [], isCalibrating: false, pixelsPerMeter: null }
};

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Dual Camera YOLO interface...');
    initializeApp();
});

function initializeApp() {
    // Set initial status
    updateStatus(false);
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize calibration canvases
    initializeCalibrationCanvases();
    
    // Start checking for processing immediately and continuously
    startConnectionChecking();
    
    // Add help and refresh buttons
    addHelpButton();
    addRefreshButton();
    
    console.log('App initialized');
}

function resizeCanvas(cameraId) {
    const canvas = document.getElementById(`canvas${cameraId}`);
    const img = document.getElementById(`camera${cameraId}`);
    
    if (img && canvas && img.naturalWidth && img.naturalHeight) {
        // Set canvas size to match the displayed image size
        const rect = img.getBoundingClientRect();
        canvas.width = img.offsetWidth;
        canvas.height = img.offsetHeight;
        
        // Redraw calibration if exists
        setTimeout(() => {
            redrawCalibrationPolygon(cameraId);
        }, 100);
        
        console.log(`Canvas ${cameraId} resized to ${canvas.width}x${canvas.height}`);
    }
}

function initializeCalibrationCanvases() {
    // Setup canvas for each camera
    for (let cameraId = 1; cameraId <= 2; cameraId++) {
        const canvas = document.getElementById(`canvas${cameraId}`);
        const img = document.getElementById(`camera${cameraId}`);
        
        if (!canvas || !img) {
            console.error(`Canvas or image not found for camera ${cameraId}`);
            continue;
        }
        
        // Set canvas size to match image
        const resizeCanvasForCamera = () => resizeCanvas(cameraId);
        
        img.addEventListener('load', resizeCanvasForCamera);
        img.addEventListener('loadeddata', resizeCanvasForCamera);
        window.addEventListener('resize', resizeCanvasForCamera);
        
        // Add click event for calibration
        canvas.addEventListener('click', (e) => handleCanvasClick(e, cameraId));
        
        // Add right-click event to finish calibration
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (calibrationData[`camera${cameraId}`].isCalibrating) {
                finishCalibrationProcess(cameraId);
            }
        });
        
        // Initial resize
        setTimeout(resizeCanvasForCamera, 500);
    }
}

function startCalibration(cameraId) {
    console.log(`Starting calibration for camera ${cameraId}`);
    
    // Pause video processing
    pauseVideoProcessing();
    
    const calibData = calibrationData[`camera${cameraId}`];
    const canvas = document.getElementById(`canvas${cameraId}`);
    const info = document.getElementById(`calibrationInfo${cameraId}`);
    const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
    
    // Reset calibration data
    calibData.points = [];
    calibData.distances = [];
    calibData.isCalibrating = true;
    calibData.pixelsPerMeter = null;
    
    // Ensure canvas is properly sized
    resizeCanvas(cameraId);
    
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
    info.textContent = 'Click exactly 4 corners to create calibration rectangle.';
    info.classList.add('show');
    
    showNotification(`Calibration started for Camera ${cameraId}. Click exactly 4 corners.`, 'info');
}

function pauseVideoProcessing() {
    pausedForCalibration = true;
    
    // Add visual indication that videos are paused
    document.getElementById('camera1').classList.add('paused');
    document.getElementById('camera2').classList.add('paused');
    
    console.log('Video processing paused for calibration');
}

function resumeVideoProcessing() {
    pausedForCalibration = false;
    
    // Remove visual indication
    document.getElementById('camera1').classList.remove('paused');
    document.getElementById('camera2').classList.remove('paused');
    
    console.log('Video processing resumed');
}

function handleCanvasClick(event, cameraId) {
    const calibData = calibrationData[`camera${cameraId}`];
    
    if (!calibData.isCalibrating) return;
    
    // Stop if already have 4 points
    if (calibData.points.length >= 4) {
        showNotification('Rectangle complete. Right-click to finish.', 'info');
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
    
    // Draw point
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(scaledX, scaledY, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    // Add point number
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(calibData.points.length.toString(), scaledX, scaledY + 4);
    
    // Draw line to previous point
    if (calibData.points.length > 1) {
        const prevPoint = calibData.points[calibData.points.length - 2];
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(scaledX, scaledY);
        ctx.stroke();
    }
    
    // Update info based on points count
    const info = document.getElementById(`calibrationInfo${cameraId}`);
    if (calibData.points.length < 4) {
        info.textContent = `Point ${calibData.points.length}/4 added. ${4 - calibData.points.length} more needed.`;
    } else {
        // Auto-close rectangle after 4th point
        const firstPoint = calibData.points[0];
        const lastPoint = calibData.points[3];
        
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(firstPoint.x, firstPoint.y);
        ctx.stroke();
        
        info.textContent = 'Rectangle complete! Right-click to finish calibration.';
        showNotification(`Rectangle complete for Camera ${cameraId}. Right-click to finish.`, 'success');
    }
    
    console.log(`Added point ${calibData.points.length}/4 for camera ${cameraId}:`, { x: scaledX, y: scaledY });
}

function finishCalibrationProcess(cameraId) {
    const calibData = calibrationData[`camera${cameraId}`];
    const canvas = document.getElementById(`canvas${cameraId}`);
    const info = document.getElementById(`calibrationInfo${cameraId}`);
    const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
    
    // Require exactly 4 points
    if (calibData.points.length !== 4) {
        showNotification(`Need exactly 4 points. Currently have ${calibData.points.length}.`, 'error');
        return;
    }
    
    // Deactivate canvas
    canvas.classList.remove('active');
    calibData.isCalibrating = false;
    
    // Reset button appearance
    if (button) {
        button.classList.remove('calibrating');
        button.querySelector('.btn-text').textContent = 'Calibrate';
    }
    
    // Resume video processing
    resumeVideoProcessing();
    
    // Get real-world dimensions for exactly 4 edges
    collectDimensions(cameraId);
}

function collectDimensions(cameraId) {
    const calibData = calibrationData[`camera${cameraId}`];
    const points = calibData.points;
    
    if (points.length !== 4) {
        showNotification('Need exactly 4 points for calibration', 'error');
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
    
    // Prompt for real-world dimensions
    promptForDimensions(cameraId, edges, 0);
}

function promptForDimensions(cameraId, edges, edgeIndex) {
    if (edgeIndex >= edges.length) {
        // All dimensions collected, calculate calibration
        calculateCalibration(cameraId);
        return;
    }
    
    const edge = edges[edgeIndex];
    const message = `Camera ${cameraId} - Enter the real-world length in meters for edge ${edge.from} → ${edge.to}:`;
    
    const dimension = prompt(message);
    
    if (dimension === null) {
        // User cancelled
        clearCalibration(cameraId);
        return;
    }
    
    const meters = parseFloat(dimension);
    if (isNaN(meters) || meters <= 0) {
        showNotification('Please enter a valid positive number', 'error');
        promptForDimensions(cameraId, edges, edgeIndex); // Retry same edge
        return;
    }
    
    // Store the dimension
    calibrationData[`camera${cameraId}`].distances.push({
        edgeIndex: edgeIndex,
        meters: meters,
        pixels: edge.pixelDistance
    });
    
    // Continue with next edge
    promptForDimensions(cameraId, edges, edgeIndex + 1);
}

function calculateCalibration(cameraId) {
    const calibData = calibrationData[`camera${cameraId}`];
    const distances = calibData.distances;
    
    if (distances.length === 0) {
        showNotification('No dimensions provided', 'error');
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
        showNotification('No valid calibration data', 'error');
        return;
    }
    
    calibData.pixelsPerMeter = totalPixelsPerMeter / validCount;
    
    // Calculate area in square meters
    const areaPixels = calculatePolygonArea(calibData.points);
    const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
    
    // Update display
    const info = document.getElementById(`calibrationInfo${cameraId}`);
    info.textContent = `Calibrated: ${areaSquareMeters.toFixed(2)} m² | ${calibData.pixelsPerMeter.toFixed(1)} px/m`;
    info.classList.add('show');
    
    // Save calibration data
    saveCalibrationData();
    
    console.log(`Camera ${cameraId} calibrated:`, {
        pixelsPerMeter: calibData.pixelsPerMeter,
        areaSquareMeters: areaSquareMeters,
        points: calibData.points.length
    });
    
    showNotification(`Camera ${cameraId} calibrated successfully!`, 'success');
}

function calculatePolygonArea(points) {
    if (points.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

function clearCalibration(cameraId) {
    const calibData = calibrationData[`camera${cameraId}`];
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
    resumeVideoProcessing();
    
    // Save calibration data
    saveCalibrationData();
    
    console.log(`Cleared calibration for camera ${cameraId}`);
    showNotification(`Camera ${cameraId} calibration cleared`, 'info');
}

function redrawCalibrationPolygon(cameraId) {
    const calibData = calibrationData[`camera${cameraId}`];
    const canvas = document.getElementById(`canvas${cameraId}`);
    const info = document.getElementById(`calibrationInfo${cameraId}`);
    
    if (calibData.points.length === 4 && calibData.pixelsPerMeter) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw rectangle
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        calibData.points.forEach((point, index) => {
            if (index === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
            
            // Draw point
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
            ctx.fill();
            
            // Draw point number
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText((index + 1).toString(), point.x, point.y + 4);
            
            // Reset path for polygon
            ctx.beginPath();
            ctx.strokeStyle = '#4ecdc4';
            ctx.lineWidth = 3;
            if (index === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        });
        
        ctx.closePath();
        ctx.stroke();
        
        // Update info
        const areaPixels = calculatePolygonArea(calibData.points);
        const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
        info.textContent = `Calibrated: ${areaSquareMeters.toFixed(2)} m² | ${calibData.pixelsPerMeter.toFixed(1)} px/m`;
        info.classList.add('show');
    }
}

function saveCalibrationData() {
    // Save to localStorage for persistence
    try {
        localStorage.setItem('truckVolumeCalibration', JSON.stringify(calibrationData));
    } catch (e) {
        console.warn('Could not save calibration data to localStorage:', e);
    }
}

function loadCalibrationData() {
    // Load from localStorage
    try {
        const saved = localStorage.getItem('truckVolumeCalibration');
        if (saved) {
            const loaded = JSON.parse(saved);
            // Merge with current data (excluding isCalibrating state)
            for (let key in loaded) {
                if (calibrationData[key]) {
                    calibrationData[key].points = loaded[key].points || [];
                    calibrationData[key].distances = loaded[key].distances || [];
                    calibrationData[key].pixelsPerMeter = loaded[key].pixelsPerMeter || null;
                }
            }
            console.log('Loaded calibration data from localStorage');
            
            // Redraw calibration polygons after a delay to ensure canvases are ready
            setTimeout(() => {
                redrawCalibrationPolygon(1);
                redrawCalibrationPolygon(2);
            }, 1000);
        }
    } catch (e) {
        console.warn('Could not load calibration data from localStorage:', e);
    }
}

async function updateStats() {
    if (!isProcessing || pausedForCalibration) return;

    try {
        const response = await fetch('/api/stats');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const stats = await response.json();

        if (stats.error) {
            console.error('Stats error:', stats.error);
            // If there's an error, processing might have stopped
            if (stats.error.includes('not running') || stats.error.includes('not initialized')) {
                stopProcessing();
            }
            return;
        }

        // Validate that we have camera data
        if (!stats.camera1 && !stats.camera2) {
            console.warn('No camera data in stats response');
            return;
        }

        // Update Camera 1 stats
        if (stats.camera1) {
            updateCameraStats(1, stats.camera1);
        }
        
        // Update Camera 2 stats  
        if (stats.camera2) {
            updateCameraStats(2, stats.camera2);
        }

        // Calculate calibrated volume estimate
        const volumeEstimate = calculateCalibratedVolume(stats);
        
        // Update volume estimate
        const volumeElement = document.getElementById('volumeValue');
        if (volumeElement) {
            volumeElement.textContent = volumeEstimate.toFixed(2);
        }

        // Debug logging every 10th update (every 5 seconds at 500ms intervals)
        if (Math.random() < 0.1) {
            console.log('Stats updated successfully:', {
                camera1: stats.camera1,
                camera2: stats.camera2,
                calibratedVolume: volumeEstimate
            });
        }

    } catch (error) {
        console.error('Failed to fetch stats:', error);
        
        // If we can't get stats for 3 consecutive tries, assume connection lost
        if (isProcessing) {
            console.log('Stats fetch failed, will recheck connection...');
        }
    }
}

function calculateCalibratedVolume(stats) {
    const calib1 = calibrationData.camera1;
    const calib2 = calibrationData.camera2;
    
    // Check if we have calibration data for at least one camera
    if (!calib1.pixelsPerMeter && !calib2.pixelsPerMeter) {
        // No calibration, use basic estimation
        const area1 = stats.camera1?.total_area || 0;
        const area2 = stats.camera2?.total_area || 0;
        const avgArea = (area1 + area2) / 2;
        return avgArea * 0.01; // Basic scale factor
    }
    
    let totalVolume = 0;
    let cameraCount = 0;
    
    // Calculate volume for each calibrated camera
    if (calib1.pixelsPerMeter && stats.camera1) {
        const area1Pixels = stats.camera1.total_area || 0;
        const area1SquareMeters = area1Pixels / (calib1.pixelsPerMeter * calib1.pixelsPerMeter);
        
        // Estimate height based on calibration area and detected area ratio
        const calibAreaPixels = calculatePolygonArea(calib1.points);
        const heightEstimate = estimateHeight(area1Pixels, calibAreaPixels, calib1.pixelsPerMeter);
        
        const volume1 = area1SquareMeters * heightEstimate;
        totalVolume += volume1;
        cameraCount++;
        
        console.log(`Camera 1 volume: ${volume1.toFixed(2)} m³ (area: ${area1SquareMeters.toFixed(2)} m², height: ${heightEstimate.toFixed(2)} m)`);
    }
    
    if (calib2.pixelsPerMeter && stats.camera2) {
        const area2Pixels = stats.camera2.total_area || 0;
        const area2SquareMeters = area2Pixels / (calib2.pixelsPerMeter * calib2.pixelsPerMeter);
        
        // Estimate height based on calibration area and detected area ratio
        const calibAreaPixels = calculatePolygonArea(calib2.points);
        const heightEstimate = estimateHeight(area2Pixels, calibAreaPixels, calib2.pixelsPerMeter);
        
        const volume2 = area2SquareMeters * heightEstimate;
        totalVolume += volume2;
        cameraCount++;
        
        console.log(`Camera 2 volume: ${volume2.toFixed(2)} m³ (area: ${area2SquareMeters.toFixed(2)} m², height: ${heightEstimate.toFixed(2)} m)`);
    }
    
    // Return average volume if we have multiple cameras
    return cameraCount > 0 ? totalVolume / cameraCount : 0;
}

function estimateHeight(detectedAreaPixels, calibrationAreaPixels, pixelsPerMeter) {
    // Basic height estimation based on area coverage
    // This is a simplified approach - in practice you'd need stereo vision or other depth estimation
    
    if (calibrationAreaPixels === 0) return 0;
    
    // Estimate fill ratio based on detected area vs calibration area
    const fillRatio = Math.min(detectedAreaPixels / calibrationAreaPixels, 1.0);
    
    // Assume typical truck load height ranges (adjustable based on truck type)
    const maxTruckHeight = 2.5; // meters
    const minTruckHeight = 0.1; // meters
    
    // Simple linear relationship between fill ratio and height
    const estimatedHeight = minTruckHeight + (fillRatio * (maxTruckHeight - minTruckHeight));
    
    return estimatedHeight;
}

function setupEventListeners() {
    // Camera error handlers
    document.getElementById('camera1').addEventListener('error', () => handleCameraError(1));
    document.getElementById('camera2').addEventListener('error', () => handleCameraError(2));
    
    // Image load handlers for canvas resizing
    document.getElementById('camera1').addEventListener('load', () => resizeCanvas(1));
    document.getElementById('camera2').addEventListener('load', () => resizeCanvas(2));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Load calibration data on startup
    loadCalibrationData();
}

function handleKeyboardShortcuts(event) {
    // R key to refresh streams
    if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        if (isProcessing) {
            refreshCameraStreams();
            showNotification('Camera streams refreshed', 'info');
        }
    }
    
    // S key to toggle status info
    if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        toggleStatsVisibility();
    }
    
    // C key to clear all calibrations
    if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
            clearAllCalibrations();
        }
    }
    
    // Escape key to cancel calibration
    if (event.key === 'Escape') {
        event.preventDefault();
        cancelActiveCalibrations();
    }
}

function cancelActiveCalibrations() {
    for (let cameraId = 1; cameraId <= 2; cameraId++) {
        if (calibrationData[`camera${cameraId}`].isCalibrating) {
            clearCalibration(cameraId);
            showNotification(`Calibration cancelled for Camera ${cameraId}`, 'info');
        }
    }
}

function clearAllCalibrations() {
    if (confirm('Clear all calibrations? This cannot be undone.')) {
        clearCalibration(1);
        clearCalibration(2);
        showNotification('All calibrations cleared', 'info');
    }
}

function startConnectionChecking() {
    // Check immediately
    checkForProcessing();
    
    // Set up continuous checking every 2 seconds
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    
    connectionCheckInterval = setInterval(() => {
        if (!isProcessing) {
            checkForProcessing();
        }
    }, 2000);
    
    console.log('Started connection checking every 2 seconds');
}

function checkForProcessing() {
    console.log('Checking for active processing...');
    
    fetch('/api/stats')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(stats => {
            console.log('Stats response:', stats);
            
            if (stats.error) {
                console.log('No processing detected:', stats.error);
                if (isProcessing) {
                    // Processing was running but now stopped
                    stopProcessing();
                }
                return;
            }
            
            // Check if we have valid camera data
            const hasValidData = (
                stats.camera1 && typeof stats.camera1.fps === 'number' ||
                stats.camera2 && typeof stats.camera2.fps === 'number'
            );
            
            if (hasValidData && !isProcessing) {
                console.log('Processing detected! Starting stats updates...');
                startProcessing();
            } else if (!hasValidData && isProcessing) {
                console.log('Processing stopped on server');
                stopProcessing();
            }
            
        })
        .catch(error => {
            console.log('Error checking for processing:', error);
            if (isProcessing) {
                // Connection lost
                stopProcessing();
            }
        });
}

function startProcessing() {
    isProcessing = true;
    updateStatus(true);
    startStatsUpdates();
    refreshCameraStreams();
    showNotification('Processing detected and connected!', 'success');
    console.log('Started processing mode');
}

function stopProcessing() {
    isProcessing = false;
    updateStatus(false);
    stopStatsUpdates();
    resetStatsDisplay();
    console.log('Stopped processing mode');
}

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function updateStatus(online) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (online) {
        indicator.className = 'status-indicator status-online';
        statusText.textContent = pausedForCalibration ? 'Calibrating' : 'Online';
    } else {
        indicator.className = 'status-indicator status-offline';
        statusText.textContent = 'Offline';
    }
}

function startStatsUpdates() {
    if (statsInterval) {
        clearInterval(statsInterval);
    }
    
    // Update stats frequently for better responsiveness
    statsInterval = setInterval(updateStats, 500); // Update every 500ms
    console.log('Started stats updates every 500ms');
}

function stopStatsUpdates() {
    if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
        console.log('Stopped stats updates');
    }
}

function resetStatsDisplay() {
    const statElements = ['fps1', 'objects1', 'area1', 'fps2', 'objects2', 'area2'];
    statElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '0';
    });
    
    const volumeElement = document.getElementById('volumeValue');
    if (volumeElement) volumeElement.textContent = '0.00';
    
    console.log('Reset stats display to zeros');
}

function updateCameraStats(cameraId, cameraStats) {
    if (!cameraStats) {
        console.warn(`No stats data for camera ${cameraId}`);
        return;
    }
    
    const fpsElement = document.getElementById(`fps${cameraId}`);
    const objectsElement = document.getElementById(`objects${cameraId}`);
    const areaElement = document.getElementById(`area${cameraId}`);
    
    // Update FPS with validation
    if (fpsElement && typeof cameraStats.fps === 'number') {
        fpsElement.textContent = cameraStats.fps.toFixed(1);
    }
    
    // Update objects count with validation
    if (objectsElement && typeof cameraStats.objects === 'number') {
        objectsElement.textContent = cameraStats.objects.toString();
    }
    
    // Update area with validation - show calibrated area if available
    if (areaElement && typeof cameraStats.total_area === 'number') {
        const calib = calibrationData[`camera${cameraId}`];
        if (calib.pixelsPerMeter) {
            // Show area in square meters
            const areaSquareMeters = cameraStats.total_area / (calib.pixelsPerMeter * calib.pixelsPerMeter);
            areaElement.textContent = areaSquareMeters.toFixed(2) + ' m²';
        } else {
            // Show area in pixels
            areaElement.textContent = Math.round(cameraStats.total_area).toString();
        }
    }
}

function refreshCameraStreams() {
    const timestamp = new Date().getTime();
    const camera1 = document.getElementById('camera1');
    const camera2 = document.getElementById('camera2');
    
    if (camera1) {
        camera1.src = `/video_feed/1?t=${timestamp}`;
        console.log('Refreshed camera 1 stream');
    }
    if (camera2) {
        camera2.src = `/video_feed/2?t=${timestamp}`;
        console.log('Refreshed camera 2 stream');
    }
    
    // Redraw calibration polygons after stream refresh
    setTimeout(() => {
        redrawCalibrationPolygon(1);
        redrawCalibrationPolygon(2);
    }, 1000);
}

function handleCameraError(cameraId) {
    console.warn(`Camera ${cameraId} stream error - retrying...`);
    
    setTimeout(() => {
        const img = document.getElementById(`camera${cameraId}`);
        if (img) {
            const timestamp = new Date().getTime();
            img.src = `/video_feed/${cameraId}?t=${timestamp}`;
        }
    }, 2000);
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
        position: 'fixed',
        top: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '15px 25px',
        borderRadius: '25px',
        color: 'white',
        fontWeight: '600',
        zIndex: '3000',
        maxWidth: '90%',
        textAlign: 'center',
        fontSize: '14px',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)'
    });
    
    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(45deg, #4ecdc4, #44a08d)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(45deg, #ff6b6b, #ee5a6f)';
            break;
        default:
            notification.style.background = 'linear-gradient(45deg, #667eea, #764ba2)';
            notification.style.color = 'white';
    }
    
    // Add to document
    document.body.appendChild(notification);
    
    // Remove after appropriate duration
    const duration = type === 'info' && message.includes('Calibration') ? 4000 : 3000;
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, duration);
}

function showHelp() {
    const helpText = `Help & Tips:

Camera Display:
• View real-time streams from both cameras with YOLO segmentation
• Blue bounding boxes show detected brick objects
• Colored masks overlay the segmented areas

Calibration:
• Click "Calibrate" to define measurement area on each camera
• Video processing pauses during calibration
• Click exactly 4 corners to create a calibration rectangle
• Rectangle closes automatically after 4th point
• Right-click to finish when all 4 corners are set
• Enter real-world dimensions in meters for each side
• This enables accurate volume calculations

Statistics:
• FPS: Frames per second for each camera
• Objects: Number of bricks detected in current frame
• Area: Total segmented area (pixels or m² if calibrated)

Volume Estimation:
• Uses calibrated areas from both cameras for accuracy
• Requires calibration for meaningful measurements
• Estimates height based on coverage ratio

Keyboard Shortcuts:
• R: Refresh camera streams
• S: Toggle statistics visibility
• Ctrl+C: Clear all calibrations
• Escape: Cancel active calibration

For best results:
• Ensure good lighting conditions
• Position cameras to capture truck load area
• Calibrate using rectangular reference objects (truck bed corners)
• Click corners in clockwise or counter-clockwise order

Configuration:
• Processing parameters are set via Flask server startup
• Calibration data is saved automatically
• Use command line arguments when starting the server

Troubleshooting:
• Check browser console (F12) for error messages
• Verify Flask server is running on localhost:5000
• Use refresh button to manually update
• Recalibrate if volume estimates seem incorrect
• Ensure cameras have clear view of the truck load`;

    alert(helpText);
}

function toggleStatsVisibility() {
    const statsElements = document.querySelectorAll('.camera-stats');
    const volumeSection = document.querySelector('.volume-estimation');
    
    statsElements.forEach(element => {
        element.style.display = element.style.display === 'none' ? 'grid' : 'none';
    });
    
    if (volumeSection) {
        volumeSection.style.display = volumeSection.style.display === 'none' ? 'block' : 'none';
    }
    
    showNotification('Statistics visibility toggled', 'info');
}

function addHelpButton() {
    // Add floating help button
    const helpButton = document.createElement('button');
    helpButton.innerHTML = '?';
    helpButton.onclick = showHelp;
    helpButton.title = 'Show Help';
    
    Object.assign(helpButton.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        border: 'none',
        background: 'linear-gradient(45deg, #ffecd2, #fcb69f)',
        color: '#333',
        fontSize: '20px',
        cursor: 'pointer',
        zIndex: '1000',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease'
    });
    
    helpButton.addEventListener('mouseenter', () => {
        helpButton.style.transform = 'translateY(-2px)';
        helpButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
    });
    
    helpButton.addEventListener('mouseleave', () => {
        helpButton.style.transform = 'translateY(0)';
        helpButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
    });
    
    document.body.appendChild(helpButton);
}

function addRefreshButton() {
    const refreshButton = document.createElement('button');
    refreshButton.innerHTML = '↻';
    refreshButton.onclick = () => {
        console.log('Manual refresh triggered');
        if (isProcessing) {
            updateStats();
            refreshCameraStreams();
            showNotification('Manual refresh completed', 'info');
        } else {
            checkForProcessing();
            showNotification('Checking for processing...', 'info');
        }
    };
    refreshButton.title = 'Manual Refresh';
    
    Object.assign(refreshButton.style, {
        position: 'fixed',
        bottom: '80px',
        right: '20px',
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        border: 'none',
        background: 'linear-gradient(45deg, #4ecdc4, #44a08d)',
        color: 'white',
        fontSize: '20px',
        cursor: 'pointer',
        zIndex: '1000',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease'
    });
    
    refreshButton.addEventListener('mouseenter', () => {
        refreshButton.style.transform = 'translateY(-2px)';
    });
    
    refreshButton.addEventListener('mouseleave', () => {
        refreshButton.style.transform = 'translateY(0)';
    });
    
    document.body.appendChild(refreshButton);
}

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && isProcessing) {
        // Page became visible, refresh streams and redraw calibrations
        console.log('Page became visible, refreshing streams');
        setTimeout(() => {
            refreshCameraStreams();
        }, 1000);
    }
});

// Handle window focus
window.addEventListener('focus', function() {
    if (isProcessing) {
        // Window gained focus, refresh streams
        console.log('Window gained focus, refreshing streams');
        setTimeout(() => {
            refreshCameraStreams();
        }, 1000);
    }
});

// Handle window resize
window.addEventListener('resize', function() {
    // Resize canvases when window is resized
    setTimeout(() => {
        resizeCanvas(1);
        resizeCanvas(2);
    }, 100);
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (statsInterval) {
        clearInterval(statsInterval);
    }
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    
    // Save calibration data before leaving
    saveCalibrationData();
    
    // Cancel any active calibrations
    cancelActiveCalibrations();
});

// Debug functions accessible from console
window.debugStats = function() {
    fetch('/api/stats')
        .then(response => response.json())
        .then(stats => {
            console.log('Manual stats check:', stats);
        })
        .catch(error => {
            console.error('Manual stats check failed:', error);
        });
};

window.debugCalibration = function() {
    console.log('Current calibration data:', calibrationData);
    console.log('Calibration status:', {
        camera1: {
            isCalibrating: calibrationData.camera1.isCalibrating,
            hasPoints: calibrationData.camera1.points.length,
            isCalibrated: !!calibrationData.camera1.pixelsPerMeter
        },
        camera2: {
            isCalibrating: calibrationData.camera2.isCalibrating,
            hasPoints: calibrationData.camera2.points.length,
            isCalibrated: !!calibrationData.camera2.pixelsPerMeter
        },
        pausedForCalibration: pausedForCalibration
    });
};

window.exportCalibration = function() {
    const data = JSON.stringify(calibrationData, null, 2);
    console.log('Calibration data:', data);
    
    // Create download link
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'truck-volume-calibration.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Calibration data exported', 'success');
};

window.importCalibration = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const imported = JSON.parse(e.target.result);
                    calibrationData = imported;
                    saveCalibrationData();
                    
                    // Redraw calibrations
                    setTimeout(() => {
                        redrawCalibrationPolygon(1);
                        redrawCalibrationPolygon(2);
                    }, 500);
                    
                    showNotification('Calibration data imported successfully', 'success');
                    console.log('Imported calibration data:', calibrationData);
                } catch (error) {
                    showNotification('Failed to import calibration data', 'error');
                    console.error('Import error:', error);
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
};

window.resetCalibration = function() {
    if (confirm('Reset all calibration data? This cannot be undone.')) {
        calibrationData = {
            camera1: { points: [], distances: [], isCalibrating: false, pixelsPerMeter: null },
            camera2: { points: [], distances: [], isCalibrating: false, pixelsPerMeter: null }
        };
        
        // Clear canvases
        const canvas1 = document.getElementById('canvas1');
        const canvas2 = document.getElementById('canvas2');
        
        if (canvas1) {
            const ctx1 = canvas1.getContext('2d');
            ctx1.clearRect(0, 0, canvas1.width, canvas1.height);
        }
        
        if (canvas2) {
            const ctx2 = canvas2.getContext('2d');
            ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
        }
        
        // Hide info displays
        document.getElementById('calibrationInfo1').classList.remove('show');
        document.getElementById('calibrationInfo2').classList.remove('show');
        
        // Reset button states
        document.querySelectorAll('.btn-calibrate').forEach(btn => {
            btn.classList.remove('calibrating');
            btn.querySelector('.btn-text').textContent = 'Calibrate';
        });
        
        // Resume video processing
        resumeVideoProcessing();
        
        saveCalibrationData();
        showNotification('All calibration data reset', 'info');
        console.log('All calibration data reset');
    }
};

// Initialize performance monitoring
let performanceStats = {
    lastUpdate: Date.now(),
    updateCount: 0,
    avgUpdateTime: 0
};

function updatePerformanceStats() {
    const now = Date.now();
    const timeSinceLastUpdate = now - performanceStats.lastUpdate;
    performanceStats.updateCount++;
    
    // Calculate moving average of update times
    performanceStats.avgUpdateTime = (performanceStats.avgUpdateTime * 0.9) + (timeSinceLastUpdate * 0.1);
    performanceStats.lastUpdate = now;
    
    // Log performance stats every 100 updates
    if (performanceStats.updateCount % 100 === 0) {
        console.log(`Performance: ${performanceStats.avgUpdateTime.toFixed(1)}ms avg update time, ${performanceStats.updateCount} total updates`);
    }
}

// Add performance monitoring to stats updates
const originalUpdateStats = updateStats;
updateStats = function() {
    updatePerformanceStats();
    return originalUpdateStats.apply(this, arguments);
};

// Make function globally accessible for HTML onclick handlers
window.startCalibration = startCalibration;
window.resizeCanvas = resizeCanvas;

console.log('Dual Camera YOLO interface with 4-segment calibration loaded successfully');
console.log('Available debug functions:');
console.log('  debugStats() - Check current stats');
console.log('  debugCalibration() - View calibration status');
console.log('  exportCalibration() - Download calibration data');
console.log('  importCalibration() - Upload calibration data');
console.log('  resetCalibration() - Reset all calibration data');
console.log('Keyboard shortcuts: R (refresh), S (toggle stats), Ctrl+C (clear calibrations), Escape (cancel calibration)');
console.log('Click Calibrate button to start calibration - exactly 4 corners required');