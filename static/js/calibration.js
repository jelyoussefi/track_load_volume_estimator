/**
 * Enhanced Calibration management for the Dual Camera YOLO application
 * WITH VIEWPORT ZOOMING for better precision during calibration
 * Automatic P3/P4 calculation from P1, P2 and distance measurements
 */

window.CalibrationManager = {
    
    calibrationData: {
        camera1: { 
            points: [],
            edgeDistances: null,
            cameraDistances: null,
            isCalibrating: false, 
            pixelsPerMeter: null,
            cameraHeight: null,
            redrawInterval: null,
            calibrationCanvasWidth: null,  // Canvas width during calibration
            calibrationCanvasHeight: null  // Canvas height during calibration
        },
        camera2: { 
            points: [],
            edgeDistances: null,
            cameraDistances: null,
            isCalibrating: false, 
            pixelsPerMeter: null,
            cameraHeight: null,
            redrawInterval: null,
            calibrationCanvasWidth: null,  // Canvas width during calibration
            calibrationCanvasHeight: null  // Canvas height during calibration
        }
    },
    
    init() {
        this.setupCanvases();
        this.loadCalibrationData();
        console.log('Enhanced calibration manager initialized with automatic P3/P4 calculation and viewport zooming');
    },
    
    setupCanvases() {
        for (let cameraId = 1; cameraId <= 2; cameraId++) {
            const canvas = document.getElementById(`canvas${cameraId}`);
            const img = document.getElementById(`camera${cameraId}`);
            
            if (!canvas || !img) {
                console.error(`Canvas or image not found for camera ${cameraId}`);
                continue;
            }
            
            const resizeCanvasForCamera = () => this.resizeCanvas(cameraId);
            
            img.addEventListener('load', resizeCanvasForCamera);
            img.addEventListener('loadeddata', resizeCanvasForCamera);
            window.addEventListener('resize', window.Utils ? window.Utils.debounce(resizeCanvasForCamera, 100) : resizeCanvasForCamera);
            
            canvas.addEventListener('click', (e) => this.handleCanvasClick(e, cameraId));
            
            canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (this.calibrationData[`camera${cameraId}`].isCalibrating) {
                    this.finishCalibrationProcess(cameraId);
                }
            });
            
            setTimeout(resizeCanvasForCamera, 100);
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                for (let cameraId = 1; cameraId <= 2; cameraId++) {
                    if (this.calibrationData[`camera${cameraId}`].isCalibrating) {
                        e.preventDefault();
                        console.log(`ESC pressed - canceling calibration for camera ${cameraId}`);
                        this.clearCalibration(cameraId);
                        if (window.Utils) {
                            window.Utils.showNotification(`Calibration cancelled for Camera ${cameraId}`, 'info');
                        }
                    }
                }
            }
        });
    },
    
    resizeCanvas(cameraId) {
        const canvas = document.getElementById(`canvas${cameraId}`);
        const img = document.getElementById(`camera${cameraId}`);
        
        if (img && canvas && img.naturalWidth && img.naturalHeight) {
            const oldWidth = canvas.width;
            const oldHeight = canvas.height;
            
            canvas.width = img.offsetWidth;
            canvas.height = img.offsetHeight;
            
            // Ensure canvas is always visible
            canvas.style.display = 'block';
            canvas.style.zIndex = '10';
            
            // Scale calibration points if canvas size changed and we have calibration points
            const calibData = this.calibrationData[`camera${cameraId}`];
            if (calibData.points.length > 0 && oldWidth > 0 && oldHeight > 0) {
                const scaleX = canvas.width / oldWidth;
                const scaleY = canvas.height / oldHeight;
                
                // Only scale if the size change is significant (more than 5% difference)
                if (Math.abs(scaleX - 1.0) > 0.05 || Math.abs(scaleY - 1.0) > 0.05) {
                    calibData.points = calibData.points.map(point => ({
                        x: point.x * scaleX,
                        y: point.y * scaleY
                    }));
                    
                    console.log(`Scaled ${calibData.points.length} calibration points for canvas ${cameraId}: scale ${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`);
                }
            }
            
            // Always redraw if we have complete calibration
            if (calibData.points.length === 4 && calibData.pixelsPerMeter) {
                setTimeout(() => {
                    this.drawCompleteCalibrationPolygon(cameraId);
                }, 50);
            }
            
            console.log(`Canvas ${cameraId} resized to ${canvas.width}x${canvas.height}`);
        }
    },
    
    startCalibration(cameraId) {
        console.log(`Starting enhanced 3D calibration with ZOOM for camera ${cameraId}`);
        
        if (window.ProcessingManager) {
            window.ProcessingManager.pauseForCalibration();
        }
        
        setTimeout(() => {
            this.startP1P2Placement(cameraId);
        }, 200);
    },
    
    collectCameraHeight(cameraId, callback) {
        const height = prompt(
            `Camera ${cameraId} Height:\n\n` +
            `Enter the height of Camera ${cameraId} above the GROUND (in meters):\n\n` +
            `Press Cancel to abort calibration.`
        );
        
        if (height === null) {
            if (window.Utils) {
                window.Utils.showNotification('Calibration cancelled', 'info');
            }
            return;
        }
        
        const isValid = window.Utils ? 
            window.Utils.isValidPositiveNumber(height) : 
            (!isNaN(parseFloat(height)) && parseFloat(height) > 0);
        
        if (!isValid) {
            if (window.Utils) {
                window.Utils.showNotification('Please enter a valid positive number for camera height', 'error');
            }
            this.collectCameraHeight(cameraId, callback);
            return;
        }
        
        const cameraHeight = parseFloat(height);
        
        // Store the camera height directly as entered
        this.calibrationData[`camera${cameraId}`].cameraHeight = cameraHeight;
        
        if (window.Utils) {
            window.Utils.showNotification(
                `Camera ${cameraId}: Height set to ${cameraHeight.toFixed(2)}m from ground`,
                'success'
            );
        }
        
        if (callback) callback();
    },
    
    startP1P2Placement(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
        
        // Get container elements for zooming
        const cameraContainer = document.querySelector('.camera-container');
        const cameraFeed = document.querySelector(`.camera-feed:nth-child(${cameraId})`);
        
        calibData.points = [];
        calibData.edgeDistances = null;
        calibData.cameraDistances = null;
        calibData.isCalibrating = true;
        calibData.pixelsPerMeter = null;
        
        // ENABLE ZOOM - Add calibrating classes for viewport zoom
        if (cameraContainer) {
            cameraContainer.classList.add('calibrating');
            console.log('Added calibrating class to camera container for zoom');
        }
        if (cameraFeed) {
            cameraFeed.classList.add('calibrating-active');
            console.log(`Camera feed ${cameraId} zoomed for calibration`);
        }
        
        // Wait for zoom to take effect, then store canvas dimensions
        setTimeout(() => {
            calibData.calibrationCanvasWidth = canvas.width;
            calibData.calibrationCanvasHeight = canvas.height;
            console.log(`Stored calibration canvas size: ${canvas.width}x${canvas.height}`);
        }, 100);
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        canvas.classList.add('active');
        
        if (button) {
            button.classList.add('calibrating');
            button.querySelector('.btn-text').textContent = 'Place P1 & P2';
        }
        
        info.textContent = `PAUSED: Click P1 (top-left corner), then P2 (top-right corner). Press ESC to cancel.`;
        info.classList.add('show');
        
        if (window.Utils) {
            window.Utils.showNotification(
                `Camera ${cameraId} ZOOMED: Click P1 (top-left) and P2 (top-right)`,
                'info'
            );
        }
        
        console.log(`P1/P2 placement ready for camera ${cameraId} with ZOOM enabled`);
    },
    
    handleCanvasClick(event, cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        
        if (!calibData.isCalibrating) return;
        
        if (calibData.points.length >= 2) {
            if (window.Utils) {
                window.Utils.showNotification('P1 and P2 already placed. Collecting distances...', 'info');
            }
            return;
        }
        
        const canvas = document.getElementById(`canvas${cameraId}`);
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const scaledX = x * scaleX;
        const scaledY = y * scaleY;
        
        calibData.points.push({ x: scaledX, y: scaledY });
        
        this.drawCalibrationPoint(canvas, scaledX, scaledY, calibData.points.length);
        
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        if (calibData.points.length === 1) {
            info.textContent = 'P1 placed! Now click P2 (top-right corner)';
            if (window.Utils) {
                window.Utils.showNotification('P1 placed! Now click P2', 'success');
            }
        } else if (calibData.points.length === 2) {
            info.textContent = 'P1 and P2 placed! Collecting camera height...';
            
            this.drawLineBetweenPoints(canvas, calibData.points[0], calibData.points[1]);
            
            canvas.classList.remove('active');
            
            if (window.Utils) {
                window.Utils.showNotification('P1 and P2 placed! Collecting camera height...', 'success');
            }
            
            setTimeout(() => {
                this.collectCameraHeight(cameraId, () => {
                    this.collectAllDistances(cameraId);
                });
            }, 500);
        }
        
        console.log(`Added point ${calibData.points.length}/2 for camera ${cameraId}:`, { x: scaledX, y: scaledY });
    },
    
    drawCalibrationPoint(canvas, x, y, pointNumber) {
        const ctx = canvas.getContext('2d');
        
        // Draw point circle
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw label
        ctx.font = 'bold 18px Arial';
        const label = `P${pointNumber}`;
        const metrics = ctx.measureText(label);
        
        const padding = 6;
        const boxWidth = metrics.width + padding * 2;
        const boxHeight = 24;
        const boxX = x - boxWidth / 2;
        const boxY = y + 20;
        
        // Label background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        
        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, boxY + 17);
        
        // Add marker type indicator
        ctx.font = 'bold 12px Arial';
        if (pointNumber <= 2) {
            ctx.fillStyle = '#ff6b6b';
            ctx.fillText('(Manual)', x, boxY + 40);
        } else {
            ctx.fillStyle = '#4ecdc4';
            ctx.fillText('(Calculated)', x, boxY + 40);
        }
    },
    
    drawLineBetweenPoints(canvas, p1, p2) {
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    },
    
    collectAllDistances(cameraId) {
        const distances = {};
        
        const edgeLabels = [
            { key: 'D12', description: 'P1 to P2 (top edge, along truck bed)' },
            { key: 'D13', description: 'P1 to P3 (left edge, along truck bed)' },
            { key: 'D23', description: 'P2 to P3 (diagonal, along truck bed)' },
            { key: 'D24', description: 'P2 to P4 (right edge, along truck bed)' },
            { key: 'D34', description: 'P3 to P4 (bottom edge, along truck bed)' }
        ];
        
        this.promptForEdgeDistance(cameraId, edgeLabels, 0, distances);
    },
    
    promptForEdgeDistance(cameraId, labels, index, distances) {
        if (index >= labels.length) {
            this.collectCameraDistances(cameraId, distances);
            return;
        }
        
        const label = labels[index];
        const distance = prompt(
            `Camera ${cameraId} - Distance ${label.key}:\n\n` +
            `Enter distance ${label.description} in meters:\n\n` +
            `Press Cancel to abort calibration.`
        );
        
        if (distance === null) {
            this.clearCalibration(cameraId);
            if (window.Utils) {
                window.Utils.showNotification('Calibration cancelled', 'info');
            }
            return;
        }
        
        const isValid = window.Utils ? 
            window.Utils.isValidPositiveNumber(distance) : 
            (!isNaN(parseFloat(distance)) && parseFloat(distance) > 0);
        
        if (!isValid) {
            if (window.Utils) {
                window.Utils.showNotification('Please enter a valid positive number', 'error');
            }
            this.promptForEdgeDistance(cameraId, labels, index, distances);
            return;
        }
        
        distances[label.key] = parseFloat(distance);
        console.log(`Camera ${cameraId}, ${label.key}: ${distances[label.key]}m`);
        
        this.promptForEdgeDistance(cameraId, labels, index + 1, distances);
    },
    
    collectCameraDistances(cameraId, edgeDistances) {
        const cameraDistances = {};
        
        const cameraLabels = [
            { key: 'C1', description: 'Camera to P1 (3D straight line distance)' },
            { key: 'C2', description: 'Camera to P2 (3D straight line distance)' },
            { key: 'C3', description: 'Camera to P3 (3D straight line distance)' },
            { key: 'C4', description: 'Camera to P4 (3D straight line distance)' }
        ];
        
        this.promptForCameraDistance(cameraId, cameraLabels, 0, cameraDistances, edgeDistances);
    },
    
    promptForCameraDistance(cameraId, labels, index, cameraDistances, edgeDistances) {
        if (index >= labels.length) {
            this.calculateAndDrawP3P4(cameraId, edgeDistances, cameraDistances);
            return;
        }
        
        const label = labels[index];
        const distance = prompt(
            `Camera ${cameraId} - Distance ${label.key}:\n\n` +
            `Enter distance ${label.description} in meters:\n\n` +
            `Press Cancel to abort calibration.`
        );
        
        if (distance === null) {
            this.clearCalibration(cameraId);
            if (window.Utils) {
                window.Utils.showNotification('Calibration cancelled', 'info');
            }
            return;
        }
        
        const isValid = window.Utils ? 
            window.Utils.isValidPositiveNumber(distance) : 
            (!isNaN(parseFloat(distance)) && parseFloat(distance) > 0);
        
        if (!isValid) {
            if (window.Utils) {
                window.Utils.showNotification('Please enter a valid positive number', 'error');
            }
            this.promptForCameraDistance(cameraId, labels, index, cameraDistances, edgeDistances);
            return;
        }
        
        cameraDistances[label.key] = parseFloat(distance);
        console.log(`Camera ${cameraId}, ${label.key}: ${cameraDistances[label.key]}m`);
        
        this.promptForCameraDistance(cameraId, labels, index + 1, cameraDistances, edgeDistances);
    },
    
    calculateAndDrawP3P4(cameraId, edgeDistances, cameraDistances) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        
        const P1_pixel = calibData.points[0];
        const P2_pixel = calibData.points[1];
        
        console.log(`Calculating P3 and P4 for camera ${cameraId}...`);
        console.log('P1 pixel (top-left):', P1_pixel);
        console.log('P2 pixel (top-right):', P2_pixel);
        console.log('Edge distances:', edgeDistances);
        console.log('Camera distances:', cameraDistances);
        console.log('Camera height:', calibData.cameraHeight);
        
        const result = this.calculateP3P4FromGeometry(
            P1_pixel, P2_pixel,
            edgeDistances,
            cameraDistances,
            calibData.cameraHeight
        );
        
        if (!result.success) {
            console.warn(`P3/P4 calculation had issues: ${result.error}`);
            
            // Use simplified calculation as fallback
            console.log('Using simplified geometric fallback...');
            const fallbackResult = this.calculateP3P4Fallback(
                P1_pixel, P2_pixel,
                edgeDistances,
                canvas
            );
            
            if (!fallbackResult.success) {
                if (window.Utils) {
                    window.Utils.showNotification(
                        `Failed to calculate P3/P4: ${fallbackResult.error}. Try recalibrating with accurate measurements.`,
                        'error'
                    );
                }
                this.clearCalibration(cameraId);
                return;
            }
            
            // Validate fallback results
            if (isNaN(fallbackResult.P3.x) || isNaN(fallbackResult.P3.y) || 
                isNaN(fallbackResult.P4.x) || isNaN(fallbackResult.P4.y)) {
                if (window.Utils) {
                    window.Utils.showNotification(
                        `Invalid calibration calculation. Please verify your measurements are correct.`,
                        'error'
                    );
                }
                console.error('Fallback produced NaN values:', fallbackResult);
                this.clearCalibration(cameraId);
                return;
            }
            
            calibData.points.push(fallbackResult.P3);
            calibData.points.push(fallbackResult.P4);
            
            if (window.Utils) {
                window.Utils.showNotification(
                    `Using simplified calibration (P3/P4 may be approximate)`,
                    'info'
                );
            }
        } else {
            console.log('Successfully calculated P3 and P4!');
            console.log('P3 pixel (bottom-left):', result.P3);
            console.log('P4 pixel (bottom-right):', result.P4);
            console.log('P3 3D:', result.P3_3d);
            console.log('P4 3D:', result.P4_3d);
            
            // Validate 3D results
            if (isNaN(result.P3.x) || isNaN(result.P3.y) || 
                isNaN(result.P4.x) || isNaN(result.P4.y)) {
                console.error('3D calculation produced NaN values, trying fallback...');
                
                const fallbackResult = this.calculateP3P4Fallback(
                    P1_pixel, P2_pixel,
                    edgeDistances,
                    canvas
                );
                
                if (!fallbackResult.success || 
                    isNaN(fallbackResult.P3.x) || isNaN(fallbackResult.P3.y) || 
                    isNaN(fallbackResult.P4.x) || isNaN(fallbackResult.P4.y)) {
                    if (window.Utils) {
                        window.Utils.showNotification(
                            `Invalid calibration calculation. Please verify your measurements.`,
                            'error'
                        );
                    }
                    this.clearCalibration(cameraId);
                    return;
                }
                
                calibData.points.push(fallbackResult.P3);
                calibData.points.push(fallbackResult.P4);
            } else {
                calibData.points.push(result.P3);
                calibData.points.push(result.P4);
            }
        }
        
        calibData.edgeDistances = edgeDistances;
        calibData.cameraDistances = cameraDistances;
        
        // Final validation before drawing
        if (calibData.points.some(p => isNaN(p.x) || isNaN(p.y))) {
            console.error('Final validation failed - points contain NaN:', calibData.points);
            if (window.Utils) {
                window.Utils.showNotification(
                    `Calibration failed. Please check your measurements are physically possible.`,
                    'error'
                );
            }
            this.clearCalibration(cameraId);
            return;
        }
        
        // Draw all four points with labels
        this.drawVisibleCalibrationPoints(canvas, calibData.points);
        
        this.completeCalibrationShape(cameraId);
    },
    
    calculateP3P4Fallback(P1_pixel, P2_pixel, edgeDistances, canvas) {
        try {
            console.log('Using fallback 2D calculation...');
            
            // Calculate pixel distance between P1 and P2
            const d12_pixel = Math.sqrt(
                Math.pow(P2_pixel.x - P1_pixel.x, 2) + 
                Math.pow(P2_pixel.y - P1_pixel.y, 2)
            );
            
            if (d12_pixel === 0 || edgeDistances.D12 === 0) {
                throw new Error('Invalid P1-P2 distance');
            }
            
            const pixelsPerMeter = d12_pixel / edgeDistances.D12;
            console.log(`Fallback pixels per meter: ${pixelsPerMeter.toFixed(2)}`);
            
            // Calculate P3 using law of cosines
            const d13_pixels = edgeDistances.D13 * pixelsPerMeter;
            const d23_pixels = edgeDistances.D23 * pixelsPerMeter;
            
            // Cosine of angle at P1
            const cosAngleAtP1 = (d12_pixel * d12_pixel + d13_pixels * d13_pixels - d23_pixels * d23_pixels) / 
                                  (2 * d12_pixel * d13_pixels);
            
            // Clamp to valid range for acos
            const clampedCos = Math.max(-1, Math.min(1, cosAngleAtP1));
            const angleAtP1 = Math.acos(clampedCos);
            
            // Calculate angle from P1 to P2
            const baseAngle = Math.atan2(P2_pixel.y - P1_pixel.y, P2_pixel.x - P1_pixel.x);
            
            // P3 should be below P1 (downward from top-left)
            const angle1 = baseAngle + angleAtP1;
            const angle2 = baseAngle - angleAtP1;
            
            const P3_option1 = {
                x: P1_pixel.x + d13_pixels * Math.cos(angle1),
                y: P1_pixel.y + d13_pixels * Math.sin(angle1)
            };
            
            const P3_option2 = {
                x: P1_pixel.x + d13_pixels * Math.cos(angle2),
                y: P1_pixel.y + d13_pixels * Math.sin(angle2)
            };
            
            // Choose option with larger Y (more downward, as P3 is bottom-left)
            const P3 = P3_option1.y > P3_option2.y ? P3_option1 : P3_option2;
            
            console.log(`P3 calculated (bottom-left): (${P3.x.toFixed(1)}, ${P3.y.toFixed(1)})`);
            
            // Verify P3 distance to P2
            const p2_p3_dist = Math.sqrt((P3.x - P2_pixel.x)**2 + (P3.y - P2_pixel.y)**2);
            console.log(`P2-P3 distance check: ${p2_p3_dist.toFixed(1)}px vs expected ${d23_pixels.toFixed(1)}px`);
            
            // Calculate P4 using law of cosines from P2-P3-P4 triangle
            const d24_pixels = edgeDistances.D24 * pixelsPerMeter;
            const d34_pixels = edgeDistances.D34 * pixelsPerMeter;
            
            // Cosine of angle at P3
            const cosAngleAtP3 = (d23_pixels * d23_pixels + d34_pixels * d34_pixels - d24_pixels * d24_pixels) / 
                                  (2 * d23_pixels * d34_pixels);
            
            const clampedCosP3 = Math.max(-1, Math.min(1, cosAngleAtP3));
            const angleAtP3 = Math.acos(clampedCosP3);
            
            // Calculate angle from P2 to P3
            const p2_p3_angle = Math.atan2(P3.y - P2_pixel.y, P3.x - P2_pixel.x);
            
            // P4 continues the rectangle (should be to the right and down from P2)
            const angle_p3_p4_option1 = p2_p3_angle + angleAtP3;
            const angle_p3_p4_option2 = p2_p3_angle - angleAtP3;
            
            const P4_option1 = {
                x: P3.x + d34_pixels * Math.cos(angle_p3_p4_option1),
                y: P3.y + d34_pixels * Math.sin(angle_p3_p4_option1)
            };
            
            const P4_option2 = {
                x: P3.x + d34_pixels * Math.cos(angle_p3_p4_option2),
                y: P3.y + d34_pixels * Math.sin(angle_p3_p4_option2)
            };
            
            // Choose option with larger X (more to the right, as P4 is bottom-right)
            const P4 = P4_option1.x > P4_option2.x ? P4_option1 : P4_option2;
            
            console.log(`P4 calculated (bottom-right): (${P4.x.toFixed(1)}, ${P4.y.toFixed(1)})`);
            
            // Verify distances
            const p2_p4_dist = Math.sqrt((P4.x - P2_pixel.x)**2 + (P4.y - P2_pixel.y)**2);
            const p3_p4_dist = Math.sqrt((P4.x - P3.x)**2 + (P4.y - P3.y)**2);
            console.log(`P2-P4 distance check: ${p2_p4_dist.toFixed(1)}px vs expected ${d24_pixels.toFixed(1)}px`);
            console.log(`P3-P4 distance check: ${p3_p4_dist.toFixed(1)}px vs expected ${d34_pixels.toFixed(1)}px`);
            
            // Check for NaN
            if (isNaN(P3.x) || isNaN(P3.y) || isNaN(P4.x) || isNaN(P4.y)) {
                throw new Error('Calculation produced NaN values');
            }
            
            return {
                success: true,
                P3: P3,
                P4: P4
            };
            
        } catch (error) {
            console.error('Fallback calculation failed:', error);
            return { 
                success: false, 
                error: 'Geometric calculation failed - check measurements are consistent' 
            };
        }
    },
    
    drawVisibleCalibrationPoints(canvas, points) {
        // Draw all four points with proper labels
        const ctx = canvas.getContext('2d');
        
        const pointLabels = ['P1 (top-left)', 'P2 (top-right)', 'P3 (bottom-left)', 'P4 (bottom-right)'];
        
        for (let i = 0; i < Math.min(points.length, 4); i++) {
            const point = points[i];
            
            // Check if point is within canvas bounds (with some margin)
            if (point.x >= -50 && point.x <= canvas.width + 50 && 
                point.y >= -50 && point.y <= canvas.height + 50) {
                this.drawCalibrationPoint(canvas, point.x, point.y, i + 1);
                console.log(`Drew ${pointLabels[i]}: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
            } else {
                console.log(`${pointLabels[i]} is outside viewport: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
            }
        }
    },
    
    calculateP3P4FromGeometry(P1_pixel, P2_pixel, edgeDistances, cameraDistances, cameraHeight) {
        try {
            console.log('Step 1: Converting P1, P2 to 3D...');
            const P1_3d = this.pixelTo3DWorld(P1_pixel, cameraDistances.C1, cameraHeight);
            const P2_3d = this.pixelTo3DWorld(P2_pixel, cameraDistances.C2, cameraHeight);
            
            console.log('P1_3d:', P1_3d);
            console.log('P2_3d:', P2_3d);
            
            const d12_calculated = this.distance3D(P1_3d, P2_3d);
            const d12_error = Math.abs(d12_calculated - edgeDistances.D12);
            console.log(`D12 verification: calculated=${d12_calculated.toFixed(3)}m, expected=${edgeDistances.D12}m, error=${d12_error.toFixed(3)}m`);
            
            console.log('Step 2: Calculating P3 from constraints...');
            const P3_3d = this.solvePointFrom3Constraints(
                P1_3d, P2_3d,
                edgeDistances.D13, edgeDistances.D23,
                cameraDistances.C3,
                cameraHeight
            );
            
            console.log('P3_3d:', P3_3d);
            
            console.log('Step 3: Calculating P4 from constraints...');
            const P4_3d = this.solvePointFrom3Constraints(
                P2_3d, P3_3d,
                edgeDistances.D24, edgeDistances.D34,
                cameraDistances.C4,
                cameraHeight
            );
            
            console.log('P4_3d:', P4_3d);
            
            console.log('Step 4: Verifying geometry...');
            if (!this.verifyPointGeometry(P3_3d, P1_3d, P2_3d, { D13: edgeDistances.D13, D23: edgeDistances.D23 })) {
                return { success: false, error: 'P3 geometry verification failed' };
            }
            
            if (!this.verifyPointGeometry(P4_3d, P2_3d, P3_3d, { D13: edgeDistances.D24, D23: edgeDistances.D34 })) {
                return { success: false, error: 'P4 geometry verification failed' };
            }
            
            console.log('Geometry verified successfully!');
            
            console.log('Step 5: Projecting back to pixel coordinates...');
            const P3_pixel = this.worldTo2DPixel(P3_3d, cameraHeight, P1_pixel, P2_pixel, P1_3d, P2_3d);
            const P4_pixel = this.worldTo2DPixel(P4_3d, cameraHeight, P1_pixel, P2_pixel, P1_3d, P2_3d);
            
            console.log('P3_pixel:', P3_pixel);
            console.log('P4_pixel:', P4_pixel);
            
            return {
                success: true,
                P3: P3_pixel,
                P4: P4_pixel,
                P3_3d: P3_3d,
                P4_3d: P4_3d
            };
            
        } catch (error) {
            console.error('Error in calculateP3P4FromGeometry:', error);
            return { success: false, error: error.message };
        }
    },
    
    pixelTo3DWorld(pixelCoord, cameraDistance, cameraHeight) {
        const horizontalDistance = Math.sqrt(
            cameraDistance * cameraDistance - cameraHeight * cameraHeight
        );
        
        const canvas = document.getElementById('canvas1');
        const centerX = canvas ? canvas.width / 2 : 320;
        const centerY = canvas ? canvas.height / 2 : 240;
        
        const deltaX = pixelCoord.x - centerX;
        const deltaY = pixelCoord.y - centerY;
        
        const focalLengthEstimate = canvas ? canvas.width * 0.8 : 512;
        const scale = horizontalDistance / focalLengthEstimate;
        
        return {
            x: deltaX * scale,
            y: deltaY * scale,
            z: -cameraHeight
        };
    },
    
    solvePointFrom3Constraints(P1, P2, d1, d2, cameraDistance, height) {
        const A = 2 * (P2.x - P1.x);
        const B = 2 * (P2.y - P1.y);
        const C = d1*d1 - d2*d2 + P2.x*P2.x + P2.y*P2.y - P1.x*P1.x - P1.y*P1.y;
        
        const R = cameraDistance * cameraDistance - height * height;
        
        // Ensure R is positive
        if (R <= 0) {
            console.warn('Camera distance must be greater than height');
            // Use approximate calculation
            return this.approximatePointPosition(P1, P2, d1, d2);
        }
        
        let solutions = [];
        
        if (Math.abs(B) > 0.001) {
            const a_coeff = B*B + A*A;
            const b_coeff = -2 * C * A;
            const c_coeff = C*C - R * B*B;
            
            const discriminant = b_coeff*b_coeff - 4*a_coeff*c_coeff;
            
            if (discriminant >= 0) {
                const x1 = (-b_coeff + Math.sqrt(discriminant)) / (2 * a_coeff);
                const x2 = (-b_coeff - Math.sqrt(discriminant)) / (2 * a_coeff);
                
                const y1 = (C - A * x1) / B;
                const y2 = (C - A * x2) / B;
                
                solutions.push({ x: x1, y: y1, z: -height });
                solutions.push({ x: x2, y: y2, z: -height });
            } else {
                console.warn('No exact solution - using approximation');
                return this.approximatePointPosition(P1, P2, d1, d2);
            }
        } else if (Math.abs(A) > 0.001) {
            const x = C / A;
            const y_squared = R - x*x;
            
            if (y_squared >= 0) {
                const y1 = Math.sqrt(y_squared);
                const y2 = -y1;
                
                solutions.push({ x: x, y: y1, z: -height });
                solutions.push({ x: x, y: y2, z: -height });
            } else {
                console.warn('No exact solution - using approximation');
                return this.approximatePointPosition(P1, P2, d1, d2);
            }
        } else {
            console.warn('Degenerate case - using approximation');
            return this.approximatePointPosition(P1, P2, d1, d2);
        }
        
        if (solutions.length === 0) {
            console.warn('No solution found - using approximation');
            return this.approximatePointPosition(P1, P2, d1, d2);
        }
        
        return this.chooseBestSolution(solutions, P1, P2);
    },
    
    approximatePointPosition(P1, P2, d1, d2) {
        // Simple 2D approximation based on distances
        const d12 = Math.sqrt((P2.x - P1.x)**2 + (P2.y - P1.y)**2);
        
        // Use law of cosines to approximate position
        const cosAngle = (d12*d12 + d1*d1 - d2*d2) / (2 * d12 * d1);
        const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))); // Clamp to valid range
        
        const P1_to_P2_angle = Math.atan2(P2.y - P1.y, P2.x - P1.x);
        const P1_to_P3_angle = P1_to_P2_angle + angle;
        
        return {
            x: P1.x + d1 * Math.cos(P1_to_P3_angle),
            y: P1.y + d1 * Math.sin(P1_to_P3_angle),
            z: 0
        };
    },
    
    chooseBestSolution(solutions, P1, P2) {
        if (solutions.length === 1) return solutions[0];
        
        const v12 = { x: P2.x - P1.x, y: P2.y - P1.y };
        
        let bestSolution = solutions[0];
        let maxCross = -Infinity;
        
        for (const sol of solutions) {
            const v1s = { x: sol.x - P1.x, y: sol.y - P1.y };
            const cross = v12.x * v1s.y - v12.y * v1s.x;
            
            if (cross > maxCross) {
                maxCross = cross;
                bestSolution = sol;
            }
        }
        
        return bestSolution;
    },
    
    verifyPointGeometry(P3, P1, P2, distances) {
        const dist_P3_P1 = this.distance3D(P3, P1);
        const dist_P3_P2 = this.distance3D(P3, P2);
        
        // More lenient tolerance for real-world measurements (30% tolerance)
        const tolerance = Math.max(distances.D13, distances.D23) * 0.3;
        
        const error1 = Math.abs(dist_P3_P1 - distances.D13);
        const error2 = Math.abs(dist_P3_P2 - distances.D23);
        
        console.log(`Geometry verification: error1=${error1.toFixed(3)}m (${(error1/distances.D13*100).toFixed(1)}%), error2=${error2.toFixed(3)}m (${(error2/distances.D23*100).toFixed(1)}%), tolerance=${tolerance.toFixed(3)}m`);
        
        if (error1 > tolerance || error2 > tolerance) {
            console.warn(`Geometry verification warning: errors exceed tolerance - using approximate solution`);
            return false; // Will trigger fallback
        }
        
        return true;
    },
    
    distance3D(P1, P2) {
        return Math.sqrt(
            (P1.x - P2.x) ** 2 +
            (P1.y - P2.y) ** 2 +
            (P1.z - P2.z) ** 2
        );
    },
    
    worldTo2DPixel(point3D, cameraHeight, P1_pixel, P2_pixel, P1_3d, P2_3d) {
        const dx_3d = P2_3d.x - P1_3d.x;
        const dy_3d = P2_3d.y - P1_3d.y;
        const dx_pixel = P2_pixel.x - P1_pixel.x;
        const dy_pixel = P2_pixel.y - P1_pixel.y;
        
        const scale_x = Math.abs(dx_3d) > 0.001 ? dx_pixel / dx_3d : 1.0;
        const scale_y = Math.abs(dy_3d) > 0.001 ? dy_pixel / dy_3d : scale_x;
        
        const pixel_x = P1_pixel.x + (point3D.x - P1_3d.x) * scale_x;
        const pixel_y = P1_pixel.y + (point3D.y - P1_3d.y) * scale_y;
        
        return { x: pixel_x, y: pixel_y };
    },
    
    completeCalibrationShape(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        const ctx = canvas.getContext('2d');
        
        // Calculate pixels per meter first
        const avgPixelsPerMeter = this.calculatePixelsPerMeter(calibData);
        calibData.pixelsPerMeter = avgPixelsPerMeter;
        
        // Mark calibration as complete
        canvas.classList.remove('active');
        calibData.isCalibrating = false;
        
        // Store current canvas dimensions before zoom removal
        const zoomedCanvasWidth = canvas.width;
        const zoomedCanvasHeight = canvas.height;
        
        // REMOVE ZOOM - restore normal dual camera view
        const cameraContainer = document.querySelector('.camera-container');
        const cameraFeed = document.querySelector(`.camera-feed:nth-child(${cameraId})`);
        
        if (cameraContainer) {
            cameraContainer.classList.remove('calibrating');
            console.log('Removed calibrating class from camera container - zoom disabled');
        }
        if (cameraFeed) {
            cameraFeed.classList.remove('calibrating-active');
            console.log(`Camera feed ${cameraId} unzoomed - back to dual view`);
        }
        
        // Wait for zoom removal to take effect, then rescale points
        setTimeout(() => {
            // Get new canvas dimensions after zoom removal
            const newCanvasWidth = canvas.width;
            const newCanvasHeight = canvas.height;
            
            console.log(`Canvas size changed from ${zoomedCanvasWidth}x${zoomedCanvasHeight} to ${newCanvasWidth}x${newCanvasHeight}`);
            
            // Calculate scale factors
            const scaleX = newCanvasWidth / zoomedCanvasWidth;
            const scaleY = newCanvasHeight / zoomedCanvasHeight;
            
            // Rescale all points
            if (Math.abs(scaleX - 1.0) > 0.01 || Math.abs(scaleY - 1.0) > 0.01) {
                console.log(`Rescaling calibration points: scaleX=${scaleX.toFixed(3)}, scaleY=${scaleY.toFixed(3)}`);
                
                calibData.points = calibData.points.map(point => ({
                    x: point.x * scaleX,
                    y: point.y * scaleY
                }));
                
                console.log('Rescaled points:', calibData.points);
                
                // Recalculate pixels per meter with rescaled points
                calibData.pixelsPerMeter = this.calculatePixelsPerMeter(calibData);
                console.log(`Recalculated pixels per meter: ${calibData.pixelsPerMeter.toFixed(2)}`);
            }
            
            // Redraw with rescaled points
            this.drawCompleteCalibrationPolygon(cameraId);
            
            // Update info display
            this.updateCalibrationInfo(cameraId);
        }, 150);
        
        // Update button
        const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
        if (button) {
            button.classList.remove('calibrating');
            button.querySelector('.btn-text').textContent = 'Calibrate';
        }
        
        // Draw the complete calibration polygon (will be redrawn after rescaling)
        this.drawCompleteCalibrationPolygon(cameraId);
        
        // Save calibration data
        this.saveCalibrationData();
        
        // Resume processing
        if (window.ProcessingManager) {
            window.ProcessingManager.resumeAfterCalibration();
        }
        
        // Redraw multiple times to ensure visibility after zoom changes
        setTimeout(() => {
            this.drawCompleteCalibrationPolygon(cameraId);
        }, 100);
        
        setTimeout(() => {
            this.drawCompleteCalibrationPolygon(cameraId);
        }, 500);
        
        setTimeout(() => {
            this.drawCompleteCalibrationPolygon(cameraId);
        }, 1000);
        
        // Start continuous redraw to keep calibration visible (every 2 seconds)
        if (calibData.redrawInterval) {
            clearInterval(calibData.redrawInterval);
        }
        calibData.redrawInterval = setInterval(() => {
            this.drawCompleteCalibrationPolygon(cameraId);
        }, 2000);
        
        if (window.Utils) {
            window.Utils.showNotification(`Camera ${cameraId} 3D calibration complete!`, 'success');
        }
        
        console.log(`Camera ${cameraId} 3D calibration complete:`, {
            pixelsPerMeter: avgPixelsPerMeter,
            areaSquareMeters: areaSquareMeters,
            cameraHeight: calibData.cameraHeight,
            points: calibData.points,
            pointLabels: ['P1 (top-left)', 'P2 (top-right)', 'P3 (bottom-left)', 'P4 (bottom-right)']
        });
    },
    
    updateCalibrationInfo(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        
        if (!calibData.pixelsPerMeter || calibData.points.length !== 4) {
            console.warn(`Cannot update info for camera ${cameraId}: calibration incomplete`);
            return;
        }
        
        const areaPixels = window.Utils ? 
            window.Utils.calculatePolygonArea(calibData.points) : 
            this.calculatePolygonAreaFallback(calibData.points);
        const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
        
        // Build comprehensive info display
        let infoLines = [];
        infoLines.push(`<strong>3D Calibrated: ${areaSquareMeters.toFixed(2)} m²</strong>`);
        infoLines.push(`Camera Height: ${calibData.cameraHeight.toFixed(2)}m`);
        infoLines.push(`Pixels/Meter: ${calibData.pixelsPerMeter.toFixed(1)}`);
        
        // Add edge distances with descriptive labels
        if (calibData.edgeDistances) {
            infoLines.push(`<br><strong>Edge Distances:</strong>`);
            infoLines.push(`D12 (P1→P2 top edge): ${calibData.edgeDistances.D12.toFixed(2)}m`);
            infoLines.push(`D13 (P1→P3 left edge): ${calibData.edgeDistances.D13.toFixed(2)}m`);
            infoLines.push(`D23 (P2→P3 diagonal): ${calibData.edgeDistances.D23.toFixed(2)}m`);
            infoLines.push(`D24 (P2→P4 right edge): ${calibData.edgeDistances.D24.toFixed(2)}m`);
            infoLines.push(`D34 (P3→P4 bottom edge): ${calibData.edgeDistances.D34.toFixed(2)}m`);
        }
        
        // Add camera distances with descriptive labels
        if (calibData.cameraDistances) {
            infoLines.push(`<br><strong>Camera Distances:</strong>`);
            infoLines.push(`C1 (Camera→P1): ${calibData.cameraDistances.C1.toFixed(2)}m`);
            infoLines.push(`C2 (Camera→P2): ${calibData.cameraDistances.C2.toFixed(2)}m`);
            infoLines.push(`C3 (Camera→P3): ${calibData.cameraDistances.C3.toFixed(2)}m`);
            infoLines.push(`C4 (Camera→P4): ${calibData.cameraDistances.C4.toFixed(2)}m`);
        }
        
        info.innerHTML = infoLines.join('<br>');
        info.classList.add('show');
        
        // Also log to console for debugging
        console.log(`Camera ${cameraId} calibration info updated:`);
        console.log(`  Area: ${areaSquareMeters.toFixed(2)} m² (${areaPixels.toFixed(0)} pixels)`);
        console.log(`  Camera Height: ${calibData.cameraHeight.toFixed(2)}m`);
        console.log(`  Pixels per Meter: ${calibData.pixelsPerMeter.toFixed(1)}`);
        if (calibData.edgeDistances) {
            console.log(`  Edge Distances:`, calibData.edgeDistances);
        }
        if (calibData.cameraDistances) {
            console.log(`  Camera Distances:`, calibData.cameraDistances);
        }
        console.log(`  Points:`, calibData.points);
    },
    
    drawCompleteCalibrationPolygon(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        
        if (!canvas || calibData.points.length !== 4) {
            console.warn(`Cannot draw polygon for camera ${cameraId}: missing canvas or points`);
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        console.log(`Drawing calibration polygon for camera ${cameraId} on canvas ${canvas.width}x${canvas.height}`);
        console.log('Points: P1 (top-left), P2 (top-right), P3 (bottom-left), P4 (bottom-right)');
        console.log(calibData.points);
        
        // Check which points are visible
        const visiblePoints = calibData.points.map((p, i) => ({
            point: p,
            index: i,
            visible: p.x >= 0 && p.x <= canvas.width && p.y >= 0 && p.y <= canvas.height
        }));
        
        const allVisible = visiblePoints.every(p => p.visible);
        const someVisible = visiblePoints.some(p => p.visible);
        
        if (!someVisible) {
            console.warn('All calibration points are outside viewport');
            return;
        }
        
        // Draw filled polygon - clip to canvas bounds
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.clip();
        
        ctx.fillStyle = 'rgba(78, 205, 196, 0.5)';
        ctx.beginPath();
        ctx.moveTo(calibData.points[0].x, calibData.points[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(calibData.points[i].x, calibData.points[i].y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Draw outline
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const p1 = calibData.points[i];
            const p2 = calibData.points[(i + 1) % 4];
            
            if (i === 0) ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
        ctx.closePath();
        ctx.stroke();
        
        ctx.restore();
        
        // Draw only visible points with labels
        const pointLabels = ['P1 (top-left)', 'P2 (top-right)', 'P3 (bottom-left)', 'P4 (bottom-right)'];
        for (let i = 0; i < 4; i++) {
            const point = calibData.points[i];
            if (point.x >= -50 && point.x <= canvas.width + 50 && 
                point.y >= -50 && point.y <= canvas.height + 50) {
                this.drawCalibrationPoint(canvas, point.x, point.y, i + 1);
            } else {
                console.log(`${pointLabels[i]} outside viewport`);
            }
        }
        
        if (!allVisible) {
            console.log(`Some calibration points outside viewport - showing visible portion only`);
        }
        
        console.log(`Calibration polygon drawn successfully for camera ${cameraId}`);
    },
    
    calculatePixelsPerMeter(calibData) {
        const points = calibData.points;
        const edgeDistances = calibData.edgeDistances;
        
        const pixelDistances = {
            D12: this.distance2D(points[0], points[1]),
            D23: this.distance2D(points[1], points[2]),
            D34: this.distance2D(points[2], points[3]),
            D41: this.distance2D(points[3], points[0])
        };
        
        const ratios = [];
        
        if (edgeDistances.D12) {
            ratios.push(pixelDistances.D12 / edgeDistances.D12);
        }
        
        const d13_pixel = this.distance2D(points[0], points[2]);
        const d23_pixel = this.distance2D(points[1], points[2]);
        const d24_pixel = this.distance2D(points[1], points[3]);
        const d34_pixel = this.distance2D(points[2], points[3]);
        
        if (edgeDistances.D13) ratios.push(d13_pixel / edgeDistances.D13);
        if (edgeDistances.D23) ratios.push(d23_pixel / edgeDistances.D23);
        if (edgeDistances.D24) ratios.push(d24_pixel / edgeDistances.D24);
        if (edgeDistances.D34) ratios.push(d34_pixel / edgeDistances.D34);
        
        const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
        
        return avgRatio;
    },
    
    distance2D(p1, p2) {
        return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    },
    
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
    
    clearCalibration(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
        
        // Clear redraw interval
        if (calibData.redrawInterval) {
            clearInterval(calibData.redrawInterval);
            calibData.redrawInterval = null;
        }
        
        calibData.points = [];
        calibData.edgeDistances = null;
        calibData.cameraDistances = null;
        calibData.isCalibrating = false;
        calibData.pixelsPerMeter = null;
        calibData.cameraHeight = null;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        canvas.classList.remove('active');
        
        // REMOVE ZOOM - restore normal view
        const cameraContainer = document.querySelector('.camera-container');
        const cameraFeed = document.querySelector(`.camera-feed:nth-child(${cameraId})`);
        
        if (cameraContainer) {
            cameraContainer.classList.remove('calibrating');
        }
        if (cameraFeed) {
            cameraFeed.classList.remove('calibrating-active');
        }
        
        if (button) {
            button.classList.remove('calibrating');
            button.querySelector('.btn-text').textContent = 'Calibrate';
        }
        
        info.classList.remove('show');
        
        if (window.ProcessingManager) {
            window.ProcessingManager.resumeAfterCalibration();
        }
        
        this.saveCalibrationData();
        
        console.log(`Cleared calibration for camera ${cameraId}`);
    },
    
    redrawCalibrationPolygon(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        
        if (calibData.points.length === 4 && calibData.pixelsPerMeter && calibData.cameraHeight) {
            // Use the dedicated drawing function
            this.drawCompleteCalibrationPolygon(cameraId);
            
            // Update info
            const areaPixels = window.Utils ? 
                window.Utils.calculatePolygonArea(calibData.points) : 
                this.calculatePolygonAreaFallback(calibData.points);
            const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
            
            info.textContent = `3D Calibrated: ${areaSquareMeters.toFixed(2)} m² | H:${calibData.cameraHeight.toFixed(2)}m`;
            info.classList.add('show');
        }
    },
    
    saveCalibrationData() {
        try {
            localStorage.setItem('truckVolumeCalibration', JSON.stringify(this.calibrationData));
        } catch (e) {
            console.warn('Could not save calibration data:', e);
        }
    },
    
    loadCalibrationData() {
        try {
            const saved = localStorage.getItem('truckVolumeCalibration');
            if (saved) {
                const loaded = JSON.parse(saved);
                for (let key in loaded) {
                    if (this.calibrationData[key]) {
                        this.calibrationData[key] = { ...this.calibrationData[key], ...loaded[key] };
                        this.calibrationData[key].isCalibrating = false;
                        this.calibrationData[key].redrawInterval = null; // Will be set when redrawing
                    }
                }
                console.log('Loaded calibration data from localStorage');
                
                setTimeout(() => {
                    // Redraw and start intervals for both cameras
                    for (let cameraId = 1; cameraId <= 2; cameraId++) {
                        const calibData = this.calibrationData[`camera${cameraId}`];
                        if (calibData.points.length === 4 && calibData.pixelsPerMeter) {
                            this.drawCompleteCalibrationPolygon(cameraId);
                            
                            // Start continuous redraw interval
                            if (calibData.redrawInterval) {
                                clearInterval(calibData.redrawInterval);
                            }
                            calibData.redrawInterval = setInterval(() => {
                                this.drawCompleteCalibrationPolygon(cameraId);
                            }, 2000);
                        }
                    }
                }, 1000);
            }
        } catch (e) {
            console.warn('Could not load calibration data:', e);
        }
    },
    
    exportCalibration() {
        const data = JSON.stringify(this.calibrationData, null, 2);
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
                            window.Utils.showNotification('3D calibration data imported', 'success');
                        }
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
    
    resetCalibration() {
        if (confirm('Reset all 3D calibration data? This cannot be undone.')) {
            // Clear all redraw intervals
            if (this.calibrationData.camera1.redrawInterval) {
                clearInterval(this.calibrationData.camera1.redrawInterval);
            }
            if (this.calibrationData.camera2.redrawInterval) {
                clearInterval(this.calibrationData.camera2.redrawInterval);
            }
            
            this.calibrationData = {
                camera1: { 
                    points: [],
                    edgeDistances: null,
                    cameraDistances: null,
                    isCalibrating: false, 
                    pixelsPerMeter: null,
                    cameraHeight: null,
                    redrawInterval: null,
                    calibrationCanvasWidth: null,
                    calibrationCanvasHeight: null
                },
                camera2: { 
                    points: [],
                    edgeDistances: null,
                    cameraDistances: null,
                    isCalibrating: false, 
                    pixelsPerMeter: null,
                    cameraHeight: null,
                    redrawInterval: null,
                    calibrationCanvasWidth: null,
                    calibrationCanvasHeight: null
                }
            };
            
            ['canvas1', 'canvas2'].forEach(canvasId => {
                const canvas = document.getElementById(canvasId);
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            });
            
            ['calibrationInfo1', 'calibrationInfo2'].forEach(infoId => {
                const info = document.getElementById(infoId);
                if (info) info.classList.remove('show');
            });
            
            const cameraContainer = document.querySelector('.camera-container');
            if (cameraContainer) {
                cameraContainer.classList.remove('calibrating');
            }
            
            document.querySelectorAll('.btn-calibrate').forEach(btn => {
                btn.classList.remove('calibrating');
                btn.querySelector('.btn-text').textContent = 'Calibrate';
            });
            
            document.querySelectorAll('.camera-feed').forEach(feed => {
                feed.classList.remove('calibrating-active');
            });
            
            if (window.ProcessingManager) {
                window.ProcessingManager.resumeAfterCalibration();
            }
            
            this.saveCalibrationData();
            if (window.Utils) {
                window.Utils.showNotification('All 3D calibration data reset', 'info');
            }
        }
    },
    
    isCalibrated(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        return !!(
            calibData.pixelsPerMeter && 
            calibData.points.length === 4 &&
            calibData.cameraHeight &&
            calibData.edgeDistances &&
            calibData.cameraDistances
        );
    },
    
    has3DCalibration(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        return !!(
            calibData.cameraHeight &&
            calibData.cameraDistances &&
            Object.keys(calibData.cameraDistances).length === 4
        );
    },
    
    hasBasicCalibration(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        return !!(calibData.pixelsPerMeter && calibData.points.length === 4);
    },
    
    getCalibrationData(cameraId) {
        return this.calibrationData[`camera${cameraId}`];
    },
    
    get3DCalibrationData(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        if (calibData.cameraHeight && calibData.cameraDistances) {
            return {
                cameraHeight: calibData.cameraHeight,
                cameraDistances: calibData.cameraDistances,
                edgeDistances: calibData.edgeDistances,
                averageHorizontalDistance: calibData.cameraDistances ? 
                    (calibData.cameraDistances.C1 + calibData.cameraDistances.C2 + 
                     calibData.cameraDistances.C3 + calibData.cameraDistances.C4) / 4 : 0,
                calibrationQuality: { quality: 'good' }
            };
        }
        return null;
    },
    
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
                pixelsPerMeter: calibData.pixelsPerMeter,
                calibrationQuality: calib3D ? calib3D.calibrationQuality : null
            };
        }
        
        return summary;
    },
    
    isAnyCalibrating() {
        return Object.values(this.calibrationData).some(data => data.isCalibrating);
    },
    
    cancelActiveCalibrations() {
        for (let cameraId = 1; cameraId <= 2; cameraId++) {
            if (this.calibrationData[`camera${cameraId}`].isCalibrating) {
                this.clearCalibration(cameraId);
            }
        }
    },
    
    finishCalibrationProcess(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        
        if (calibData.points.length !== 2) {
            if (window.Utils) {
                window.Utils.showNotification(
                    `Need exactly 2 points. Currently have ${calibData.points.length}. Continue clicking.`,
                    'error'
                );
            }
            return;
        }
        
        this.collectAllDistances(cameraId);
    }
};
