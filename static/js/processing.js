/**
 * Processing management for the Dual Camera YOLO application
 */

window.ProcessingManager = {
    
    // Processing state
    isProcessing: false,
    pausedForCalibration: false,
    wasProcessingBeforeCalibration: false,
    connectionCheckInterval: null,
    
    /**
     * Initialize processing manager
     */
    init() {
        this.setupEventHandlers();
        this.startConnectionChecking();
        console.log('Processing manager initialized');
    },
    
    /**
     * Setup event handlers for camera streams and errors
     */
    setupEventHandlers() {
        // Camera error handlers
        const camera1 = window.Utils ? window.Utils.getElementById('camera1') : document.getElementById('camera1');
        const camera2 = window.Utils ? window.Utils.getElementById('camera2') : document.getElementById('camera2');
        
        if (camera1) {
            camera1.addEventListener('error', () => {
                if (window.Utils) {
                    window.Utils.handleCameraError(1);
                }
            });
            camera1.addEventListener('load', () => {
                if (window.CalibrationManager) {
                    window.CalibrationManager.resizeCanvas(1);
                }
            });
        }
        
        if (camera2) {
            camera2.addEventListener('error', () => {
                if (window.Utils) {
                    window.Utils.handleCameraError(2);
                }
            });
            camera2.addEventListener('load', () => {
                if (window.CalibrationManager) {
                    window.CalibrationManager.resizeCanvas(2);
                }
            });
        }
    },
    
    /**
     * Start connection checking to detect when processing begins
     */
    startConnectionChecking() {
        // Check immediately
        this.checkForProcessing();
        
        // Set up continuous checking
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
        }
        
        const interval = window.CONFIG ? window.CONFIG.TIMING.CONNECTION_CHECK_INTERVAL : 2000;
        this.connectionCheckInterval = setInterval(() => {
            if (!this.isProcessing && !this.pausedForCalibration) {
                this.checkForProcessing();
            }
        }, interval);
        
        console.log(`Started connection checking every ${interval}ms`);
    },
    
    /**
     * Check if processing is active on the server
     */
    async checkForProcessing() {
        // Don't check for processing while calibrating
        if (this.pausedForCalibration) {
            console.log('Skipping processing check - currently calibrating');
            return;
        }
        
        console.log('Checking for active processing...');
        
        try {
            const statsUrl = window.CONFIG ? window.CONFIG.API.STATS : '/api/stats';
            const stats = window.Utils ? 
                await window.Utils.apiCall(statsUrl) : 
                await fetch(statsUrl).then(r => r.json());
            
            console.log('Stats response:', stats);
            
            if (stats.error) {
                console.log('No processing detected:', stats.error);
                if (this.isProcessing) {
                    // Processing was running but now stopped
                    this.stopProcessing();
                }
                return;
            }
            
            // Check if we have valid camera data
            const hasValidData = (
                stats.camera1 && typeof stats.camera1.fps === 'number' ||
                stats.camera2 && typeof stats.camera2.fps === 'number'
            );
            
            if (hasValidData && !this.isProcessing && !this.pausedForCalibration) {
                console.log('Processing detected! Starting stats updates...');
                this.startProcessing();
            } else if (!hasValidData && this.isProcessing) {
                console.log('Processing stopped on server');
                this.stopProcessing();
            }
            
        } catch (error) {
            console.log('Error checking for processing:', error);
            if (this.isProcessing) {
                // Connection lost
                this.stopProcessing();
            }
        }
    },
    
    /**
     * Start processing mode
     */
    startProcessing() {
        this.isProcessing = true;
        if (window.UIManager) {
            window.UIManager.updateStatus(true);
        }
        if (window.StatsManager) {
            window.StatsManager.startUpdates();
        }
        if (window.Utils) {
            window.Utils.refreshCameraStreams();
            window.Utils.showNotification('Processing detected and connected!', 'success');
        }
        console.log('Started processing mode');
    },
    
    /**
     * Stop processing mode
     */
    stopProcessing() {
        this.isProcessing = false;
        if (window.UIManager) {
            window.UIManager.updateStatus(false);
        }
        if (window.StatsManager) {
            window.StatsManager.stopUpdates();
            window.StatsManager.resetDisplay();
        }
        console.log('Stopped processing mode');
    },
    
    /**
     * Pause processing for calibration
     */
    pauseForCalibration() {
        console.log('=== PAUSING PROCESSING FOR CALIBRATION ===');
        this.pausedForCalibration = true;
        
        // Store current processing state and stop frontend processing
        this.wasProcessingBeforeCalibration = this.isProcessing;
        
        if (this.isProcessing) {
            // Stop frontend stats updates immediately
            console.log('Stopping frontend stats updates...');
            if (window.StatsManager) {
                window.StatsManager.stopUpdates();
            }
            
            // Tell backend to pause YOLO processing
            console.log('Sending pause request to backend...');
            const pauseUrl = window.CONFIG ? window.CONFIG.API.PAUSE : '/api/pause';
            const apiCall = window.Utils ? 
                window.Utils.apiCall(pauseUrl, { method: 'POST' }) :
                fetch(pauseUrl, { method: 'POST' }).then(r => r.json());
            
            apiCall
                .then(data => {
                    if (data.status === 'success') {
                        console.log('✓ Backend YOLO processing paused successfully');
                        console.log('✓ Camera streams now showing RAW VIDEO ONLY (no YOLO processing)');
                        if (window.Utils) {
                            window.Utils.showNotification('Backend YOLO processing STOPPED - Raw video only', 'success');
                        }
                    } else {
                        console.warn('⚠ Failed to pause backend processing:', data.message);
                    }
                })
                .catch(error => {
                    console.error('✗ Error pausing backend processing:', error);
                });
            
            // Keep the status as "Calibrating" instead of "Offline"
            if (window.UIManager) {
                window.UIManager.updateStatus(true);
            }
            const statusText = window.Utils ? 
                window.Utils.getElementById('statusText') : 
                document.getElementById('statusText');
            if (statusText) {
                statusText.textContent = 'Calibrating';
            }
        }
        
        // Add visual indication that videos are paused
        console.log('Adding visual pause indicators...');
        if (window.Utils) {
            window.Utils.toggleElementClass('camera1', 'paused', true);
            window.Utils.toggleElementClass('camera2', 'paused', true);
        } else {
            const cam1 = document.getElementById('camera1');
            const cam2 = document.getElementById('camera2');
            if (cam1) cam1.classList.add('paused');
            if (cam2) cam2.classList.add('paused');
        }
        
        console.log('=== PROCESSING PAUSED - Backend YOLO stopped, Frontend stats stopped ===');
        console.log('=== CAMERA STREAMS NOW SHOW RAW VIDEO ONLY ===');
    },
    
    /**
     * Resume processing after calibration
     */
    resumeAfterCalibration() {
        console.log('=== RESUMING PROCESSING AFTER CALIBRATION ===');
        this.pausedForCalibration = false;
        
        // Remove visual indication
        console.log('Removing visual pause indicators...');
        if (window.Utils) {
            window.Utils.toggleElementClass('camera1', 'paused', false);
            window.Utils.toggleElementClass('camera2', 'paused', false);
        } else {
            const cam1 = document.getElementById('camera1');
            const cam2 = document.getElementById('camera2');
            if (cam1) cam1.classList.remove('paused');
            if (cam2) cam2.classList.remove('paused');
        }
        
        // Resume processing if it was running before calibration
        if (this.wasProcessingBeforeCalibration) {
            console.log('Sending resume request to backend...');
            // Tell backend to resume YOLO processing
            const resumeUrl = window.CONFIG ? window.CONFIG.API.RESUME : '/api/resume';
            const apiCall = window.Utils ? 
                window.Utils.apiCall(resumeUrl, { method: 'POST' }) :
                fetch(resumeUrl, { method: 'POST' }).then(r => r.json());
            
            apiCall
                .then(data => {
                    if (data.status === 'success') {
                        console.log('✓ Backend YOLO processing resumed successfully');
                        console.log('✓ Camera streams now showing YOLO PROCESSED VIDEO with detections');
                        if (window.Utils) {
                            window.Utils.showNotification('Backend YOLO processing RESUMED - Detections active', 'success');
                        }
                    } else {
                        console.warn('⚠ Failed to resume backend processing:', data.message);
                    }
                })
                .catch(error => {
                    console.error('✗ Error resuming backend processing:', error);
                });
            
            // Resume frontend processing
            console.log('Resuming frontend processing...');
            this.isProcessing = true;
            if (window.UIManager) {
                window.UIManager.updateStatus(true);
            }
            if (window.StatsManager) {
                window.StatsManager.startUpdates();
            }
            if (window.Utils) {
                window.Utils.refreshCameraStreams();
            }
            console.log('=== PROCESSING RESUMED - Video streams UNFROZEN and LIVE, Frontend stats restarted ===');
            console.log('=== CAMERA STREAMS NOW SHOW LIVE PROCESSED VIDEO WITH YOLO DETECTIONS ===');
        } else {
            // Go back to checking for processing
            console.log('Was not processing before calibration, returning to offline mode');
            if (window.UIManager) {
                window.UIManager.updateStatus(false);
            }
            this.checkForProcessing();
        }
        
        console.log('=== CALIBRATION COMPLETE - Processing state restored ===');
    },
    
    /**
     * Start processing via API
     * @param {Object} config - Configuration for starting processing
     */
    async startProcessingAPI(config = {}) {
        try {
            const requestData = {
                model_path: config.modelPath || 'yolo11n-seg.pt',
                source1: config.source1 || 0,
                source2: config.source2 || 1,
                confidence: config.confidence || 0.5
            };
            
            const startUrl = window.CONFIG ? window.CONFIG.API.START : '/api/start';
            const response = window.Utils ? 
                await window.Utils.apiCall(startUrl, {
                    method: 'POST',
                    body: JSON.stringify(requestData)
                }) :
                await fetch(startUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                }).then(r => r.json());
            
            if (response.status === 'success') {
                if (window.Utils) {
                    window.Utils.showNotification('Processing started successfully', 'success');
                }
                console.log('Processing started via API');
            } else {
                if (window.Utils) {
                    window.Utils.showNotification(`Failed to start processing: ${response.message}`, 'error');
                }
            }
            
            return response;
        } catch (error) {
            console.error('Failed to start processing via API:', error);
            if (window.Utils) {
                window.Utils.showNotification('Failed to start processing', 'error');
            }
            throw error;
        }
    },
    
    /**
     * Stop processing via API
     */
    async stopProcessingAPI() {
        try {
            const stopUrl = window.CONFIG ? window.CONFIG.API.STOP : '/api/stop';
            const response = window.Utils ? 
                await window.Utils.apiCall(stopUrl, { method: 'POST' }) :
                await fetch(stopUrl, { method: 'POST' }).then(r => r.json());
            
            if (response.status === 'success') {
                if (window.Utils) {
                    window.Utils.showNotification('Processing stopped successfully', 'success');
                }
                console.log('Processing stopped via API');
            } else {
                if (window.Utils) {
                    window.Utils.showNotification(`Failed to stop processing: ${response.message}`, 'error');
                }
            }
            
            return response;
        } catch (error) {
            console.error('Failed to stop processing via API:', error);
            if (window.Utils) {
                window.Utils.showNotification('Failed to stop processing', 'error');
            }
            throw error;
        }
    },
    
    /**
     * Get current system status from API
     */
    async getStatus() {
        try {
            const statusUrl = window.CONFIG ? window.CONFIG.API.STATUS : '/api/status';
            return window.Utils ? 
                await window.Utils.apiCall(statusUrl) :
                await fetch(statusUrl).then(r => r.json());
        } catch (error) {
            console.error('Failed to get system status:', error);
            return null;
        }
    },
    
    /**
     * Refresh camera streams and redraw calibrations
     */
    refreshStreams() {
        if (window.Utils) {
            window.Utils.refreshCameraStreams();
        }
        
        // Redraw calibration polygons after stream refresh
        const delay = window.CONFIG ? window.CONFIG.TIMING.STREAM_REFRESH_DELAY : 1000;
        setTimeout(() => {
            if (window.CalibrationManager) {
                window.CalibrationManager.drawCompleteCalibrationPolygon(1);
                window.CalibrationManager.drawCompleteCalibrationPolygon(2);
            }
        }, delay);
        
        if (window.Utils) {
            window.Utils.showNotification('Camera streams refreshed', 'info');
        }
    },
    
    /**
     * Check if processing is currently active
     * @returns {boolean} True if processing is active
     */
    isActive() {
        return this.isProcessing;
    },
    
    /**
     * Check if processing is paused for calibration
     * @returns {boolean} True if paused for calibration
     */
    isPausedForCalibration() {
        return this.pausedForCalibration;
    },
    
    /**
     * Cleanup processing manager resources
     */
    cleanup() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
        
        if (window.StatsManager) {
            window.StatsManager.stopUpdates();
        }
        console.log('Processing manager cleaned up');
    }
};
