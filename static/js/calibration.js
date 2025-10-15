/**
 * Enhanced Calibration management for the Dual Camera YOLO application
 * Loads configuration from config file - no manual entry needed
 * Automatic P3/P4 calculation from P1, P2 and distance measurements
 */

window.CalibrationManager = {
    
    calibrationConfig: null,  // Loaded from API
    
    calibrationData: {
        camera1: { 
            points: [],
            edgeDistances: null,
            cameraDistances: null,
            isCalibrating: false, 
            pixelsPerMeter: null,
            cameraHeight: null,
            effectiveCameraHeight: null,  // Height above truck bed
            truckBedHeight: null,          // Truck bed height from ground
            truckOffset: null,              // Truck offset from P3-P4 edge
            redrawInterval: null,
            calibrationCanvasWidth: null,
            calibrationCanvasHeight: null,
            visiblePoints: ['P1', 'P2']  // Default
        },
        camera2: { 
            points: [],
            edgeDistances: null,
            cameraDistances: null,
            isCalibrating: false, 
            pixelsPerMeter: null,
            cameraHeight: null,
            effectiveCameraHeight: null,  // Height above truck bed
            truckBedHeight: null,          // Truck bed height from ground
            truckOffset: null,              // Truck offset from P3-P4 edge
            redrawInterval: null,
            calibrationCanvasWidth: null,
            calibrationCanvasHeight: null,
            visiblePoints: ['P3', 'P4']  // Default
        }
    },
    
    async init() {
        await this.loadCalibrationConfig();
        this.setupCanvases();
        await this.loadCalibrationData();
        console.log('Enhanced calibration manager initialized with config-based calibration');
    },
    
    async loadCalibrationConfig() {
        console.log('=== LOADING CALIBRATION CONFIG ===');
        try {
            console.log('Fetching calibration config from /api/calibration/config...');
            const response = await fetch('/api/calibration/config');
            console.log('Config response status:', response.status, response.statusText);
            
            if (response.ok) {
                this.calibrationConfig = await response.json();
                console.log('✓ Calibration config loaded successfully:', this.calibrationConfig);
                
                // Update calibration data with config values
                if (this.calibrationConfig.camera1) {
                    console.log('Processing camera1 config:', this.calibrationConfig.camera1);
                    this.calibrationData.camera1.cameraHeight = this.calibrationConfig.camera1.height;
                    this.calibrationData.camera1.edgeDistances = this.calibrationConfig.edge_distances;
                    this.calibrationData.camera1.cameraDistances = this.calibrationConfig.camera1.distances;
                    this.calibrationData.camera1.visiblePoints = this.calibrationConfig.camera1.visible_points || ['P1', 'P2'];
                    console.log('✓ Camera1 data updated:', {
                        height: this.calibrationData.camera1.cameraHeight,
                        edgeDistances: this.calibrationData.camera1.edgeDistances,
                        cameraDistances: this.calibrationData.camera1.cameraDistances,
                        visiblePoints: this.calibrationData.camera1.visiblePoints
                    });
                }
                
                if (this.calibrationConfig.camera2) {
                    console.log('Processing camera2 config:', this.calibrationConfig.camera2);
                    this.calibrationData.camera2.cameraHeight = this.calibrationConfig.camera2.height;
                    this.calibrationData.camera2.edgeDistances = this.calibrationConfig.edge_distances;
                    this.calibrationData.camera2.cameraDistances = this.calibrationConfig.camera2.distances;
                    this.calibrationData.camera2.visiblePoints = this.calibrationConfig.camera2.visible_points || ['P3', 'P4'];
                    console.log('✓ Camera2 data updated:', {
                        height: this.calibrationData.camera2.cameraHeight,
                        edgeDistances: this.calibrationData.camera2.edgeDistances,
                        cameraDistances: this.calibrationData.camera2.cameraDistances,
                        visiblePoints: this.calibrationData.camera2.visiblePoints
                    });
                }
                
                // Load truck bed height and offset parameters
                if (this.calibrationConfig.truck_bed_height) {
                    this.calibrationData.camera1.truckBedHeight = this.calibrationConfig.truck_bed_height;
                    this.calibrationData.camera2.truckBedHeight = this.calibrationConfig.truck_bed_height;
                    console.log('✓ Truck bed height loaded:', this.calibrationConfig.truck_bed_height + 'm');
                }
                
                if (this.calibrationConfig.truck_offset_from_p3p4) {
                    this.calibrationData.camera1.truckOffset = this.calibrationConfig.truck_offset_from_p3p4;
                    this.calibrationData.camera2.truckOffset = this.calibrationConfig.truck_offset_from_p3p4;
                    console.log('✓ Truck offset from P3-P4:', this.calibrationConfig.truck_offset_from_p3p4 + 'm');
                }
                
                // Calculate effective camera heights (height above truck bed surface)
                if (this.calibrationData.camera1.cameraHeight && this.calibrationData.camera1.truckBedHeight) {
                    this.calibrationData.camera1.effectiveCameraHeight = 
                        this.calibrationData.camera1.cameraHeight - this.calibrationData.camera1.truckBedHeight;
                    console.log('✓ Camera1 effective height (above truck bed):', 
                        this.calibrationData.camera1.effectiveCameraHeight.toFixed(2) + 'm',
                        `(${this.calibrationData.camera1.cameraHeight}m - ${this.calibrationData.camera1.truckBedHeight}m)`);
                } else {
                    console.warn('⚠ Camera1: Cannot calculate effective height - missing camera height or truck bed height');
                }
                
                if (this.calibrationData.camera2.cameraHeight && this.calibrationData.camera2.truckBedHeight) {
                    this.calibrationData.camera2.effectiveCameraHeight = 
                        this.calibrationData.camera2.cameraHeight - this.calibrationData.camera2.truckBedHeight;
                    console.log('✓ Camera2 effective height (above truck bed):', 
                        this.calibrationData.camera2.effectiveCameraHeight.toFixed(2) + 'm',
                        `(${this.calibrationData.camera2.cameraHeight}m - ${this.calibrationData.camera2.truckBedHeight}m)`);
                } else {
                    console.warn('⚠ Camera2: Cannot calculate effective height - missing camera height or truck bed height');
                }
                
                console.log('=== CONFIG LOADING COMPLETE ===');
            } else {
                console.warn('⚠ No calibration config available from server (status:', response.status, ')');
                console.log('=== CONFIG LOADING FAILED ===');
            }
        } catch (error) {
            console.error('✗ Failed to load calibration config:', error);
            console.log('=== CONFIG LOADING ERROR ===');
        }
    },
    
    
    setupCanvases() {
        for (let cameraId = 1; cameraId <= 2; cameraId++) {
            const canvas = document.getElementById(`canvas${cameraId}`);
            const img = document.getElementById(`camera${cameraId}`);
            
            if (!canvas || !img) {
                console.error(`Canvas or image not found for camera ${cameraId}`);
                continue;
            }
            
            // Setup canvas positioning - BEHIND video by default
            canvas.style.display = 'block';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '1';  // Behind video
            
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
            
            // CRITICAL: Ensure canvas stays behind video
            canvas.style.display = 'block';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '1';  // Behind video
            
            const calibData = this.calibrationData[`camera${cameraId}`];
            if (calibData.points.length > 0 && oldWidth > 0 && oldHeight > 0) {
                const scaleX = canvas.width / oldWidth;
                const scaleY = canvas.height / oldHeight;
                
                if (Math.abs(scaleX - 1.0) > 0.05 || Math.abs(scaleY - 1.0) > 0.05) {
                    calibData.points = calibData.points.map(point => ({
                        x: point.x * scaleX,
                        y: point.y * scaleY
                    }));
                    
                    console.log(`Scaled ${calibData.points.length} calibration points for canvas ${cameraId}: scale ${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`);
                }
            }
            
            if (calibData.points.length === 4 && calibData.pixelsPerMeter) {
                console.log(`[RESIZE] Canvas ${cameraId} has calibration - redrawing polygon after resize`);
                setTimeout(() => {
                    this.drawCompleteCalibrationPolygon(cameraId);
                }, 100);
            }
            
            console.log(`Canvas ${cameraId} resized to ${canvas.width}x${canvas.height}`);
        }
    },

    drawCompleteCalibrationPolygon(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        
        if (!canvas || calibData.points.length !== 4) {
            return;
        }
        
        // Ensure canvas is behind video
        canvas.style.display = 'block';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '1';  // Behind video
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw polygon with VERY VISIBLE colors
        ctx.save();
        
        // Draw a bright red semi-transparent fill
        ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.moveTo(calibData.points[0].x, calibData.points[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(calibData.points[i].x, calibData.points[i].y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Draw a thick bright cyan border
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 5;
        ctx.stroke();
        
        ctx.restore();
        
        // Draw edge distance labels if available
        if (calibData.edgeDistances) {
            this.drawEdgeDistanceLabels(canvas, calibData);
        }
        
        // Draw points - only label the visible points for this camera
        const pointLabels = ['P1', 'P2', 'P3', 'P4'];
        const visiblePoints = calibData.visiblePoints;
        
        for (let i = 0; i < 4; i++) {
            const point = calibData.points[i];
            const pointLabel = pointLabels[i];
            
            // Only draw label if this point is visible for this camera
            const isVisible = visiblePoints.includes(pointLabel);
            
            if (point.x >= -50 && point.x <= canvas.width + 50 && 
                point.y >= -50 && point.y <= canvas.height + 50) {
                if (isVisible) {
                    // Draw with label for visible points
                    this.drawCalibrationPoint(canvas, point.x, point.y, pointLabel);
                } else {
                    // Draw small dot without label for calculated points
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        }
    }
    
    startCalibration(cameraId) {
        console.log(`Starting config-based 3D calibration for camera ${cameraId}`);
        
        if (!this.calibrationConfig) {
            if (window.Utils) {
                window.Utils.showNotification('No calibration config loaded. Please ensure calibration.json is configured.', 'error');
            }
            return;
        }
        
        if (window.ProcessingManager) {
            window.ProcessingManager.pauseForCalibration();
        }
        
        setTimeout(() => {
            this.startPointPlacement(cameraId);
        }, 200);
    },
    
    startPointPlacement(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
        
        const cameraContainer = document.querySelector('.camera-container');
        const cameraFeed = document.querySelector(`.camera-feed:nth-child(${cameraId})`);
        
        calibData.points = [];
        calibData.isCalibrating = true;
        calibData.pixelsPerMeter = null;
        
        // Enable zoom
        if (cameraContainer) {
            cameraContainer.classList.add('calibrating');
        }
        if (cameraFeed) {
            cameraFeed.classList.add('calibrating-active');
        }
        
        setTimeout(() => {
            calibData.calibrationCanvasWidth = canvas.width;
            calibData.calibrationCanvasHeight = canvas.height;
        }, 100);
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        canvas.classList.add('active');
        
        if (button) {
            button.classList.add('calibrating');
            button.querySelector('.btn-text').textContent = 'Place Points';
        }
        
        const visiblePoints = calibData.visiblePoints.join(' and ');
        info.textContent = `PAUSED: Click ${visiblePoints}. All measurements loaded from config. Press ESC to cancel.`;
        info.classList.add('show');
        
        if (window.Utils) {
            window.Utils.showNotification(
                `Camera ${cameraId} ZOOMED: Click ${visiblePoints} (measurements from config)`,
                'info'
            );
        }
        
        console.log(`Point placement ready for camera ${cameraId}: ${visiblePoints}`);
    },
    
    handleCanvasClick(event, cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        
        if (!calibData.isCalibrating) return;
        
        const expectedPoints = calibData.visiblePoints.length;
        if (calibData.points.length >= expectedPoints) {
            if (window.Utils) {
                window.Utils.showNotification('All visible points already placed. Processing...', 'info');
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
        
        const pointIndex = calibData.points.length;
        const pointName = calibData.visiblePoints[pointIndex - 1];
        this.drawCalibrationPoint(canvas, scaledX, scaledY, pointName);
        
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        if (calibData.points.length < expectedPoints) {
            const nextPoint = calibData.visiblePoints[pointIndex];
            info.textContent = `${pointName} placed! Now click ${nextPoint}`;
            if (window.Utils) {
                window.Utils.showNotification(`${pointName} placed! Now click ${nextPoint}`, 'success');
            }
        } else {
            info.textContent = 'All visible points placed! Calculating remaining points...';
            
            if (pointIndex >= 2) {
                this.drawLineBetweenPoints(canvas, calibData.points[0], calibData.points[1]);
            }
            
            canvas.classList.remove('active');
            
            if (window.Utils) {
                window.Utils.showNotification('All visible points placed! Calculating...', 'success');
            }
            
            setTimeout(() => {
                this.calculateRemainingPoints(cameraId);
            }, 500);
        }
        
        console.log(`Added point ${pointName} for camera ${cameraId}:`, { x: scaledX, y: scaledY });
    },
    
    drawCalibrationPoint(canvas, x, y, pointLabel) {
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.font = 'bold 18px Arial';
        const metrics = ctx.measureText(pointLabel);
        
        const padding = 6;
        const boxWidth = metrics.width + padding * 2;
        const boxHeight = 24;
        const boxX = x - boxWidth / 2;
        const boxY = y + 20;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(pointLabel, x, boxY + 17);
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
    
    calculateRemainingPoints(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        
        console.log(`Calculating remaining points for camera ${cameraId} using only edge distances...`);
        console.log('Visible points:', calibData.visiblePoints);
        console.log('Placed points:', calibData.points);
        console.log('Edge distances:', calibData.edgeDistances);
        
        // Map visible points to their positions
        const pointMap = {};
        calibData.visiblePoints.forEach((name, index) => {
            pointMap[name] = calibData.points[index];
        });
        
        console.log('Point map:', pointMap);
        
        // Calculate remaining points using 2D geometry with edge distances only
        let result;
        
        if (cameraId === 1) {
            // Camera 1: P1 and P2 are visible, calculate P3 and P4
            result = this.calculate2DPointsFromEdge(
                pointMap.P1, pointMap.P2,
                calibData.edgeDistances.D12,
                calibData.edgeDistances.D13,
                calibData.edgeDistances.D23,
                calibData.edgeDistances.D24,
                calibData.edgeDistances.D34
            );
            
            if (result.success) {
                calibData.points = [pointMap.P1, pointMap.P2, result.P3, result.P4];
            }
        } else {
            // Camera 2: P3 and P4 are visible, calculate P1 and P2
            result = this.calculate2DPointsFromEdge(
                pointMap.P3, pointMap.P4,
                calibData.edgeDistances.D34,
                calibData.edgeDistances.D13,
                calibData.edgeDistances.D23,
                calibData.edgeDistances.D24,
                calibData.edgeDistances.D12
            );
            
            if (result.success) {
                // For camera 2, the calculated points are P1 and P2
                calibData.points = [result.P3, result.P4, pointMap.P3, pointMap.P4];
            }
        }
        
        if (!result.success) {
            if (window.Utils) {
                window.Utils.showNotification(
                    `Failed to calculate remaining points: ${result.error}`,
                    'error'
                );
            }
            this.clearCalibration(cameraId);
            return;
        }
        
        // Validate all points
        if (calibData.points.some(p => isNaN(p.x) || isNaN(p.y))) {
            console.error('Invalid points calculated:', calibData.points);
            if (window.Utils) {
                window.Utils.showNotification('Invalid calibration calculation', 'error');
            }
            this.clearCalibration(cameraId);
            return;
        }
        
        console.log('Final points (P1, P2, P3, P4):', calibData.points);
        
        // Draw all points
        this.drawAllPoints(canvas, calibData.points);
        
        this.completeCalibrationShape(cameraId);
    },
    
    calculate2DPointsFromEdge(PA_pixel, PB_pixel, dAB, dAC, dBC, dBD, dCD) {
        /**
         * 2D calibration using only edge distances
         * Given two points PA and PB (visible), calculate PC and PD
         * 
         * Layout:
         * PA ----------- PB
         *  |             |
         *  |             |
         * PC ----------- PD
         * 
         * Known: PA, PB positions (pixels)
         *        dAB, dAC, dBC, dBD, dCD (real world distances in meters)
         */
        try {
            console.log('2D calibration - calculating from edge distances only');
            
            // Calculate pixels per meter from the known edge
            const pixelDistance_AB = Math.sqrt(
                (PB_pixel.x - PA_pixel.x) ** 2 + 
                (PB_pixel.y - PA_pixel.y) ** 2
            );
            const pixelsPerMeter = pixelDistance_AB / dAB;
            
            console.log(`Pixels per meter: ${pixelsPerMeter.toFixed(2)} (from ${pixelDistance_AB.toFixed(1)}px / ${dAB}m)`);
            
            // Convert all distances to pixels
            const dAC_px = dAC * pixelsPerMeter;
            const dBC_px = dBC * pixelsPerMeter;
            const dBD_px = dBD * pixelsPerMeter;
            const dCD_px = dCD * pixelsPerMeter;
            
            // Calculate PC using triangulation from PA and PB
            const PC_pixel = this.triangulatePoint2D(PA_pixel, PB_pixel, dAC_px, dBC_px);
            
            console.log('PC calculated:', PC_pixel);
            
            // Calculate PD using triangulation from PB and PC
            const PD_pixel = this.triangulatePoint2D(PB_pixel, PC_pixel, dBD_px, dCD_px);
            
            console.log('PD calculated:', PD_pixel);
            
            return {
                success: true,
                P3: PC_pixel,
                P4: PD_pixel,
                pixelsPerMeter: pixelsPerMeter
            };
        } catch (error) {
            console.error('Error in 2D calibration:', error);
            return { success: false, error: error.message };
        }
    },
    
    triangulatePoint2D(P1, P2, d1, d2) {
        /**
         * Find point P3 given:
         * - P1 and P2 (known positions)
         * - d1 = distance from P1 to P3
         * - d2 = distance from P2 to P3
         * 
         * Using circle intersection method
         */
        
        // Distance between P1 and P2
        const dx = P2.x - P1.x;
        const dy = P2.y - P1.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        
        if (d > d1 + d2) {
            throw new Error('Circles do not intersect - distances too short');
        }
        if (d < Math.abs(d1 - d2)) {
            throw new Error('One circle contains the other - distances invalid');
        }
        if (d === 0 && d1 === d2) {
            throw new Error('Circles are coincident');
        }
        
        // Calculate intersection points
        const a = (d1 * d1 - d2 * d2 + d * d) / (2 * d);
        const h = Math.sqrt(d1 * d1 - a * a);
        
        // Point along the line P1-P2
        const px = P1.x + (a / d) * dx;
        const py = P1.y + (a / d) * dy;
        
        // Two possible intersection points (perpendicular to P1-P2)
        const solution1 = {
            x: px + (h / d) * dy,
            y: py - (h / d) * dx
        };
        
        const solution2 = {
            x: px - (h / d) * dy,
            y: py + (h / d) * dx
        };
        
        // Choose the solution that forms the correct geometry
        // For a quadrilateral, we want the point that's "below" the line P1-P2
        // Use cross product to determine which side
        const cross1 = dx * (solution1.y - P1.y) - dy * (solution1.x - P1.x);
        const cross2 = dx * (solution2.y - P1.y) - dy * (solution2.x - P1.x);
        
        // Return the point with positive cross product (below the line)
        if (cross1 > 0) {
            return solution1;
        } else {
            return solution2;
        }
    },
    
    calculateP3P4FromP1P2(P1_pixel, P2_pixel, edgeDistances, cameraDistances, cameraHeight) {
        // Same 3D geometry calculation as before
        return this.calculateP3P4FromGeometry(P1_pixel, P2_pixel, edgeDistances, cameraDistances, cameraHeight);
    },
    
    calculateP1P2FromP3P4(P3_pixel, P4_pixel, edgeDistances, cameraDistances, cameraHeight) {
        // Similar to P3P4 calculation but in reverse
        // For Camera 2, we calculate P1 and P2 from P3 and P4
        try {
            console.log('Calculating P1 and P2 from P3 and P4...');
            
            const P3_3d = this.pixelTo3DWorld(P3_pixel, cameraDistances.C3, cameraHeight);
            const P4_3d = this.pixelTo3DWorld(P4_pixel, cameraDistances.C4, cameraHeight);
            
            console.log('P3_3d:', P3_3d);
            console.log('P4_3d:', P4_3d);
            
            // Calculate P1 from P3 and P4 using D13 and D14
            const P1_3d = this.solvePointFrom3Constraints(
                P3_3d, P4_3d,
                edgeDistances.D13, edgeDistances.D14,
                cameraDistances.C1,
                cameraHeight
            );
            
            console.log('P1_3d:', P1_3d);
            
            // Calculate P2 from P1, P3, P4
            // P2 connects to P1 with D12, to P3 with D23, and to P4 with D24
            const P2_3d = this.solvePointFrom3Constraints(
                P1_3d, P3_3d,
                edgeDistances.D12, edgeDistances.D23,
                cameraDistances.C2,
                cameraHeight
            );
            
            console.log('P2_3d:', P2_3d);
            
            // Project back to pixel coordinates
            const P1_pixel = this.worldTo2DPixel(P1_3d, cameraHeight, P3_pixel, P4_pixel, P3_3d, P4_3d);
            const P2_pixel = this.worldTo2DPixel(P2_3d, cameraHeight, P3_pixel, P4_pixel, P3_3d, P4_3d);
            
            console.log('P1_pixel:', P1_pixel);
            console.log('P2_pixel:', P2_pixel);
            
            return {
                success: true,
                P1: P1_pixel,
                P2: P2_pixel,
                P1_3d: P1_3d,
                P2_3d: P2_3d
            };
        } catch (error) {
            console.error('Error calculating P1/P2:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Include all the 3D geometry functions from the original file
    calculateP3P4FromGeometry(P1_pixel, P2_pixel, edgeDistances, cameraDistances, cameraHeight) {
        try {
            console.log('Step 1: Converting P1, P2 to 3D...');
            const P1_3d = this.pixelTo3DWorld(P1_pixel, cameraDistances.C1, cameraHeight);
            const P2_3d = this.pixelTo3DWorld(P2_pixel, cameraDistances.C2, cameraHeight);
            
            console.log('P1_3d:', P1_3d);
            console.log('P2_3d:', P2_3d);
            
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
            
            console.log('Step 4: Projecting back to pixel coordinates...');
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
        
        if (R <= 0) {
            console.warn('Camera distance must be greater than height');
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
                return this.approximatePointPosition(P1, P2, d1, d2);
            }
        } else {
            return this.approximatePointPosition(P1, P2, d1, d2);
        }
        
        if (solutions.length === 0) {
            return this.approximatePointPosition(P1, P2, d1, d2);
        }
        
        return this.chooseBestSolution(solutions, P1, P2);
    },
    
    approximatePointPosition(P1, P2, d1, d2) {
        const d12 = Math.sqrt((P2.x - P1.x)**2 + (P2.y - P1.y)**2);
        const cosAngle = (d12*d12 + d1*d1 - d2*d2) / (2 * d12 * d1);
        const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
        
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
    
    drawAllPoints(canvas, points) {
        const pointLabels = ['P1', 'P2', 'P3', 'P4'];
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (point.x >= -50 && point.x <= canvas.width + 50 && 
                point.y >= -50 && point.y <= canvas.height + 50) {
                this.drawCalibrationPoint(canvas, point.x, point.y, pointLabels[i]);
            }
        }
    },
    
    completeCalibrationShape(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const canvas = document.getElementById(`canvas${cameraId}`);
        
        // Calculate pixels per meter
        const avgPixelsPerMeter = this.calculatePixelsPerMeter(calibData);
        calibData.pixelsPerMeter = avgPixelsPerMeter;
        
        canvas.classList.remove('active');
        calibData.isCalibrating = false;
        
        // Don't store zoomed dimensions - wait until after rescaling
        
        // Remove zoom
        const cameraContainer = document.querySelector('.camera-container');
        const cameraFeed = document.querySelector(`.camera-feed:nth-child(${cameraId})`);
        
        if (cameraContainer) {
            cameraContainer.classList.remove('calibrating');
        }
        if (cameraFeed) {
            cameraFeed.classList.remove('calibrating-active');
        }
        
        // Rescale points after zoom removal
        setTimeout(() => {
            const newCanvasWidth = canvas.width;
            const newCanvasHeight = canvas.height;
            
            const scaleX = newCanvasWidth / zoomedCanvasWidth;
            const scaleY = newCanvasHeight / zoomedCanvasHeight;
            
            if (Math.abs(scaleX - 1.0) > 0.01 || Math.abs(scaleY - 1.0) > 0.01) {
                calibData.points = calibData.points.map(point => ({
                    x: point.x * scaleX,
                    y: point.y * scaleY
                }));
                
                calibData.pixelsPerMeter = this.calculatePixelsPerMeter(calibData);
            }
            
            // NOW store the FINAL canvas dimensions (after zoom removed)
            calibData.calibrationCanvasWidth = newCanvasWidth;
            calibData.calibrationCanvasHeight = newCanvasHeight;
            
            this.drawCompleteCalibrationPolygon(cameraId);
            this.updateCalibrationInfo(cameraId);
        }, 150);
        
        // Update button
        const button = document.querySelector(`.camera-feed:nth-child(${cameraId}) .btn-calibrate`);
        if (button) {
            button.classList.remove('calibrating');
            button.querySelector('.btn-text').textContent = 'Calibrate';
        }
        
        this.drawCompleteCalibrationPolygon(cameraId);
        this.saveCalibrationData();
        
        if (window.ProcessingManager) {
            window.ProcessingManager.resumeAfterCalibration();
        }
        
        // Continuous redraw at high frequency for persistence
        if (calibData.redrawInterval) {
            clearInterval(calibData.redrawInterval);
        }
        calibData.redrawInterval = setInterval(() => {
            this.drawCompleteCalibrationPolygon(cameraId);
        }, 50); // Redraw every 50ms (20fps) for persistent visibility
        
        if (window.Utils) {
            window.Utils.showNotification(`Camera ${cameraId} 3D calibration complete!`, 'success');
        }
        
        console.log(`Camera ${cameraId} calibration complete with config-based measurements`);
    },
    
    updateCalibrationInfo(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        const info = document.getElementById(`calibrationInfo${cameraId}`);
        
        // Hide the info box - don't display it
        if (info) {
            info.classList.remove('show');
        }
        
        return; // Don't show the calibration info box
        
        if (!calibData.pixelsPerMeter || calibData.points.length !== 4) {
            return;
        }
        
        const areaPixels = this.calculatePolygonArea(calibData.points);
        const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
        
        let infoLines = [];
        infoLines.push(`<strong>3D Calibrated: ${areaSquareMeters.toFixed(2)} m²</strong>`);
        infoLines.push(`Camera Height: ${calibData.cameraHeight.toFixed(2)}m`);
        infoLines.push(`Pixels/Meter: ${calibData.pixelsPerMeter.toFixed(1)}`);
        
        info.innerHTML = infoLines.join('<br>');
        info.classList.add('show');
    },
    
    drawEdgeDistanceLabels(canvas, calibData) {
        const ctx = canvas.getContext('2d');
        const points = calibData.points;
        const distances = calibData.edgeDistances;
        
        // Only show perimeter edge distances (4 edges of the quadrilateral)
        // D12 (P1-P2 top), D24 (P2-P4 right), D34 (P3-P4 bottom), D41 (P4-P1 left)
        // Note: D13 is a diagonal, not shown
        const edgeConfig = [
            { p1Idx: 0, p2Idx: 1, distanceKey: 'D12', color: '#FFD700', label: 'D12' },  // P1 to P2 (top)
            { p1Idx: 1, p2Idx: 3, distanceKey: 'D24', color: '#FFA500', label: 'D24' },  // P2 to P4 (right)
            { p1Idx: 2, p2Idx: 3, distanceKey: 'D34', color: '#7CFC00', label: 'D34' },  // P3 to P4 (bottom)
            { p1Idx: 3, p2Idx: 0, distanceKey: 'D41', color: '#FF69B4', label: 'D41' }   // P4 to P1 (left)
        ];
        
        ctx.save();
        
        edgeConfig.forEach(config => {
            const p1 = points[config.p1Idx];
            const p2 = points[config.p2Idx];
            
            // Check if distance exists in config
            if (!distances[config.distanceKey]) {
                return;
            }
            
            // More lenient viewport check - allow points well outside visible area
            const inViewport = (p) => p.x >= -500 && p.x <= canvas.width + 500 && 
                                      p.y >= -500 && p.y <= canvas.height + 500;
            
            if (!inViewport(p1) && !inViewport(p2)) {
                // Only skip if BOTH points are way off screen
                return;
            }
            
            // Calculate midpoint
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            // Skip label if midpoint is too far outside viewport
            if (midX < -100 || midX > canvas.width + 100 || 
                midY < -100 || midY > canvas.height + 100) {
                return;
            }
            
            // Calculate angle for label rotation
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            
            // Draw the distance label
            const distanceValue = distances[config.distanceKey];
            const labelText = `${config.label}: ${distanceValue.toFixed(1)}m`;
            
            ctx.save();
            ctx.translate(midX, midY);
            
            // Rotate text to align with edge (keep it readable)
            let textAngle = angle;
            if (Math.abs(textAngle) > Math.PI / 2) {
                textAngle += Math.PI;
            }
            ctx.rotate(textAngle);
            
            // Draw label background
            ctx.font = 'bold 16px Arial';
            const metrics = ctx.measureText(labelText);
            const padding = 8;
            const boxWidth = metrics.width + padding * 2;
            const boxHeight = 24;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.fillRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
            
            // Draw label border
            ctx.strokeStyle = config.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
            
            // Draw label text
            ctx.fillStyle = config.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, 0, 0);
            
            ctx.restore();
        });
        
        ctx.restore();
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
        const d24_pixel = this.distance2D(points[1], points[3]);
        
        if (edgeDistances.D13) ratios.push(d13_pixel / edgeDistances.D13);
        if (edgeDistances.D24) ratios.push(d24_pixel / edgeDistances.D24);
        
        const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
        return avgRatio;
    },
    
    distance2D(p1, p2) {
        return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    },
    
    calculatePolygonArea(points) {
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
        
        if (calibData.redrawInterval) {
            clearInterval(calibData.redrawInterval);
            calibData.redrawInterval = null;
        }
        
        calibData.points = [];
        calibData.isCalibrating = false;
        calibData.pixelsPerMeter = null;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        canvas.classList.remove('active');
        
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
    },
    
    saveCalibrationData() {
        try {
            const dataToSave = {
                version: '2.0',
                timestamp: new Date().toISOString(),
                camera1: {
                    points: this.calibrationData.camera1.points,
                    pixelsPerMeter: this.calibrationData.camera1.pixelsPerMeter,
                    edgeDistances: this.calibrationData.camera1.edgeDistances,
                    visiblePoints: this.calibrationData.camera1.visiblePoints,
                    calibrationCanvasWidth: this.calibrationData.camera1.calibrationCanvasWidth,
                    calibrationCanvasHeight: this.calibrationData.camera1.calibrationCanvasHeight
                },
                camera2: {
                    points: this.calibrationData.camera2.points,
                    pixelsPerMeter: this.calibrationData.camera2.pixelsPerMeter,
                    edgeDistances: this.calibrationData.camera2.edgeDistances,
                    visiblePoints: this.calibrationData.camera2.visiblePoints,
                    calibrationCanvasWidth: this.calibrationData.camera2.calibrationCanvasWidth,
                    calibrationCanvasHeight: this.calibrationData.camera2.calibrationCanvasHeight
                }
            };
            
            // Save to localStorage
            localStorage.setItem('truckVolumeCalibrationPoints', JSON.stringify(dataToSave));
            console.log('Calibration data saved to localStorage');
            
            // Also save to backend server
            fetch('/api/calibration/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dataToSave)
            })
            .then(response => response.json())
            .then(result => {
                if (result.status === 'success') {
                    console.log('Calibration data saved to server:', result.path);
                } else {
                    console.warn('Failed to save to server:', result.message);
                }
            })
            .catch(error => {
                console.warn('Could not save calibration to server:', error);
            });
            
        } catch (e) {
            console.warn('Could not save calibration data:', e);
        }
    },
    
    async loadCalibrationData() {
        console.log('=== LOADING SAVED CALIBRATION DATA ===');
        try {
            console.log('Attempting to load calibration data...');
            
            // Try loading from server first
            try {
                console.log('Fetching from server: /api/calibration/load');
                const response = await fetch('/api/calibration/load');
                console.log('Server response status:', response.status, response.statusText);
                
                if (response.ok) {
                    const loaded = await response.json();
                    console.log('✓ Server calibration data received:', loaded);
                    await this.restoreCalibrationFromData(loaded);
                    console.log('✓ Loaded calibration from server');
                    console.log('=== CALIBRATION DATA LOADING COMPLETE (SERVER) ===');
                    return;
                } else {
                    console.log('Server returned non-OK status, trying localStorage...');
                }
            } catch (error) {
                console.log('Server fetch failed:', error.message);
                console.log('Trying localStorage fallback...');
            }
            
            // Fallback to localStorage
            console.log('Checking localStorage for: truckVolumeCalibrationPoints');
            const saved = localStorage.getItem('truckVolumeCalibrationPoints');
            
            if (saved) {
                console.log('✓ Found calibration data in localStorage');
                const loaded = JSON.parse(saved);
                console.log('localStorage data:', loaded);
                await this.restoreCalibrationFromData(loaded);
                console.log('✓ Loaded calibration from localStorage');
                console.log('=== CALIBRATION DATA LOADING COMPLETE (LOCALSTORAGE) ===');
            } else {
                console.log('⚠ No saved calibration data found in localStorage');
                console.log('=== NO CALIBRATION DATA FOUND ===');
            }
        } catch (e) {
            console.error('✗ Could not load calibration data:', e);
            console.log('=== CALIBRATION DATA LOADING ERROR ===');
        }
    },
    
    async restoreCalibrationFromData(loaded) {
        console.log('Restoring calibration from loaded data:', loaded);
        
        if (loaded.camera1 && loaded.camera1.points) {
            this.calibrationData.camera1.points = loaded.camera1.points;
            this.calibrationData.camera1.pixelsPerMeter = loaded.camera1.pixelsPerMeter;
            
            if (loaded.camera1.edgeDistances) {
                this.calibrationData.camera1.edgeDistances = loaded.camera1.edgeDistances;
            }
            if (loaded.camera1.visiblePoints) {
                this.calibrationData.camera1.visiblePoints = loaded.camera1.visiblePoints;
            }
            if (loaded.camera1.calibrationCanvasWidth) {
                this.calibrationData.camera1.calibrationCanvasWidth = loaded.camera1.calibrationCanvasWidth;
            }
            if (loaded.camera1.calibrationCanvasHeight) {
                this.calibrationData.camera1.calibrationCanvasHeight = loaded.camera1.calibrationCanvasHeight;
            }
            console.log('Camera 1 calibration data restored:', this.calibrationData.camera1);
        }
        
        if (loaded.camera2 && loaded.camera2.points) {
            this.calibrationData.camera2.points = loaded.camera2.points;
            this.calibrationData.camera2.pixelsPerMeter = loaded.camera2.pixelsPerMeter;
            
            if (loaded.camera2.edgeDistances) {
                this.calibrationData.camera2.edgeDistances = loaded.camera2.edgeDistances;
            }
            if (loaded.camera2.visiblePoints) {
                this.calibrationData.camera2.visiblePoints = loaded.camera2.visiblePoints;
            }
            if (loaded.camera2.calibrationCanvasWidth) {
                this.calibrationData.camera2.calibrationCanvasWidth = loaded.camera2.calibrationCanvasWidth;
            }
            if (loaded.camera2.calibrationCanvasHeight) {
                this.calibrationData.camera2.calibrationCanvasHeight = loaded.camera2.calibrationCanvasHeight;
            }
            console.log('Camera 2 calibration data restored:', this.calibrationData.camera2);
        }
        
        console.log('Restored calibration data:', {
            camera1: loaded.camera1?.points?.length || 0,
            camera2: loaded.camera2?.points?.length || 0,
            timestamp: loaded.timestamp || 'unknown'
        });
        
        // Auto-restore calibration polygons after a delay
        console.log('Scheduling calibration polygon restoration...');
        setTimeout(() => {
            console.log('Attempting to restore calibration polygons...');
            for (let cameraId = 1; cameraId <= 2; cameraId++) {
                const calibData = this.calibrationData[`camera${cameraId}`];
                const canvas = document.getElementById(`canvas${cameraId}`);
                
                console.log(`Camera ${cameraId} restore check:`, {
                    pointsLength: calibData.points.length,
                    pixelsPerMeter: calibData.pixelsPerMeter,
                    canvasExists: !!canvas,
                    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'N/A',
                    rawPoints: calibData.points
                });
                
                if (calibData.points.length === 4 && calibData.pixelsPerMeter && canvas) {
                    // Check if we have the original calibration canvas dimensions
                    const hasOriginalDimensions = calibData.calibrationCanvasWidth && calibData.calibrationCanvasHeight;
                    
                    if (hasOriginalDimensions) {
                        const scaleX = canvas.width / calibData.calibrationCanvasWidth;
                        const scaleY = canvas.height / calibData.calibrationCanvasHeight;
                        
                        console.log(`Camera ${cameraId} restoration:`, {
                            saved: `${calibData.calibrationCanvasWidth}x${calibData.calibrationCanvasHeight}`,
                            current: `${canvas.width}x${canvas.height}`,
                            scaleX: scaleX.toFixed(3),
                            scaleY: scaleY.toFixed(3)
                        });
                        
                        // Only rescale if there's a difference (>1% tolerance)
                        if (Math.abs(scaleX - 1.0) > 0.01 || Math.abs(scaleY - 1.0) > 0.01) {
                            console.log(`✓ Rescaling points from saved dimensions to current canvas size`);
                            
                            calibData.points = calibData.points.map(p => ({
                                x: p.x * scaleX,
                                y: p.y * scaleY
                            }));
                            
                            // Recalculate pixels per meter after rescaling
                            calibData.pixelsPerMeter = this.calculatePixelsPerMeter(calibData);
                            
                            // Update stored dimensions to current
                            calibData.calibrationCanvasWidth = canvas.width;
                            calibData.calibrationCanvasHeight = canvas.height;
                            
                            // Save the rescaled calibration
                            this.saveCalibrationData();
                            
                            console.log(`✓ Points rescaled and saved`);
                        } else {
                            console.log(`✓ Canvas size matches, no rescaling needed`);
                        }
                    } else {
                        console.log(`⚠ No original canvas dimensions stored, saving current size for future use`);
                        calibData.calibrationCanvasWidth = canvas.width;
                        calibData.calibrationCanvasHeight = canvas.height;
                        this.saveCalibrationData();
                    }
                    
                    console.log(`Restoring calibration for camera ${cameraId}...`);
                    
                    // Clear any existing interval first
                    if (calibData.redrawInterval) {
                        clearInterval(calibData.redrawInterval);
                        calibData.redrawInterval = null;
                    }
                    
                    // Draw immediately
                    this.drawCompleteCalibrationPolygon(cameraId);
                    
                    // Start VERY aggressive continuous redraw to combat video refresh clearing
                    let redrawCount = 0;
                    calibData.redrawInterval = setInterval(() => {
                        redrawCount++;
                        if (redrawCount % 50 === 0) { // Log every 50th redraw to avoid spam
                            console.log(`[REDRAW INTERVAL] Camera ${cameraId} - Redraw #${redrawCount}`);
                        }
                        this.drawCompleteCalibrationPolygon(cameraId);
                    }, 50); // Redraw every 50ms (20 times per second) for maximum persistence
                    
                    console.log(`Calibration restored and aggressive redraw interval started for camera ${cameraId} (every 50ms = 20fps)`);
                    
                    // Show notification
                    if (window.Utils && cameraId === 2) {
                        window.Utils.showNotification('Previous calibration restored', 'success');
                    }
                } else {
                    console.log(`Camera ${cameraId} calibration not complete, skipping restore`);
                }
            }
        }, 1000);  // Reduced delay to 1 second for faster restoration
    },
    
    exportCalibration() {
        const data = JSON.stringify(this.calibrationData, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'truck-volume-calibration-points.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if (window.Utils) {
            window.Utils.showNotification('Calibration points exported', 'success');
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
                        
                        if (imported.camera1) {
                            this.calibrationData.camera1.points = imported.camera1.points || [];
                            this.calibrationData.camera1.pixelsPerMeter = imported.camera1.pixelsPerMeter;
                        }
                        if (imported.camera2) {
                            this.calibrationData.camera2.points = imported.camera2.points || [];
                            this.calibrationData.camera2.pixelsPerMeter = imported.camera2.pixelsPerMeter;
                        }
                        
                        this.saveCalibrationData();
                        
                        setTimeout(() => {
                            for (let i = 1; i <= 2; i++) {
                                this.drawCompleteCalibrationPolygon(i);
                            }
                        }, 500);
                        
                        if (window.Utils) {
                            window.Utils.showNotification('Calibration points imported', 'success');
                        }
                    } catch (error) {
                        if (window.Utils) {
                            window.Utils.showNotification('Failed to import calibration', 'error');
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
        if (confirm('Reset all calibration data? This cannot be undone.')) {
            if (this.calibrationData.camera1.redrawInterval) {
                clearInterval(this.calibrationData.camera1.redrawInterval);
            }
            if (this.calibrationData.camera2.redrawInterval) {
                clearInterval(this.calibrationData.camera2.redrawInterval);
            }
            
            for (let i = 1; i <= 2; i++) {
                this.calibrationData[`camera${i}`].points = [];
                this.calibrationData[`camera${i}`].isCalibrating = false;
                this.calibrationData[`camera${i}`].pixelsPerMeter = null;
                this.calibrationData[`camera${i}`].redrawInterval = null;
                
                const canvas = document.getElementById(`canvas${i}`);
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
                
                const info = document.getElementById(`calibrationInfo${i}`);
                if (info) info.classList.remove('show');
            }
            
            const cameraContainer = document.querySelector('.camera-container');
            if (cameraContainer) {
                cameraContainer.classList.remove('calibrating');
            }
            
            document.querySelectorAll('.camera-feed').forEach(feed => {
                feed.classList.remove('calibrating-active');
            });
            
            if (window.ProcessingManager) {
                window.ProcessingManager.resumeAfterCalibration();
            }
            
            this.saveCalibrationData();
            if (window.Utils) {
                window.Utils.showNotification('All calibration data reset', 'info');
            }
        }
    },
    
    isCalibrated(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        return !!(
            calibData.pixelsPerMeter && 
            calibData.points.length === 4 &&
            calibData.edgeDistances
        );
    },
    
    has3DCalibration(cameraId) {
        const calibData = this.calibrationData[`camera${cameraId}`];
        // 3D calibration requires camera height and camera distances to corners
        // This is used for volume calculation only, not for drawing the zone
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
    
    /**
     * Manual function to force redraw calibration polygons
     */
    forceRedrawCalibrations() {
        console.log('=== FORCING CALIBRATION REDRAW ===');
        for (let cameraId = 1; cameraId <= 2; cameraId++) {
            const calibData = this.calibrationData[`camera${cameraId}`];
            const canvas = document.getElementById(`canvas${cameraId}`);
            
            console.log(`Camera ${cameraId} check:`, {
                pointsLength: calibData.points.length,
                pixelsPerMeter: calibData.pixelsPerMeter,
                canvasExists: !!canvas,
                canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'N/A'
            });
            
            if (calibData.points.length === 4 && calibData.pixelsPerMeter && canvas) {
                console.log(`Drawing calibration for camera ${cameraId}...`);
                this.drawCompleteCalibrationPolygon(cameraId);
            } else {
                console.log(`Cannot draw camera ${cameraId}: incomplete data`);
            }
        }
        console.log('=== REDRAW COMPLETE ===');
    },
    
    /**
     * Alias for drawCompleteCalibrationPolygon (for backward compatibility)
     */
    redrawCalibrationPolygon(cameraId) {
        this.drawCompleteCalibrationPolygon(cameraId);
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
    }
};
