window.StatsManager = {
    
    // Stats state
    statsInterval: null,
    performanceStats: {
        lastUpdate: Date.now(),
        updateCount: 0,
        avgUpdateTime: 0
    },
    
    /**
     * Initialize stats manager
     */
    init() {
        console.log('Stats manager initialized');
    },
    
    /**
     * Start stats updates
     */
    startUpdates() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }
        
        // Update stats frequently for better responsiveness
        const interval = window.CONFIG ? window.CONFIG.TIMING.STATS_UPDATE_INTERVAL : 500;
        this.statsInterval = setInterval(() => {
            this.updateStats();
        }, interval);
        
        console.log(`Started stats updates every ${interval}ms`);
    },
    
    /**
     * Stop stats updates
     */
    stopUpdates() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
            console.log('Stopped stats updates');
        }
    },
    
    /**
     * Update statistics from the server
     */
    async updateStats() {
        // Don't run if calibrating OR not processing
        if (!window.ProcessingManager || !window.ProcessingManager.isActive() || window.ProcessingManager.isPausedForCalibration()) {
            return;
        }

        try {
            const statsUrl = window.CONFIG ? window.CONFIG.API.STATS : '/api/stats';
            const stats = window.Utils ? 
                await window.Utils.apiCall(statsUrl) : 
                await fetch(statsUrl).then(r => r.json());

            if (stats.error) {
                console.error('Stats error:', stats.error);
                // If there's an error, processing might have stopped
                if (stats.error.includes('not running') || stats.error.includes('not initialized')) {
                    if (window.ProcessingManager) {
                        window.ProcessingManager.stopProcessing();
                    }
                }
                return;
            }

            // Validate that we have camera data
            if (!stats.camera1 && !stats.camera2) {
                console.warn('No camera data in stats response');
                return;
            }

            // Update Camera stats
            if (stats.camera1) {
                this.updateCameraStats(1, stats.camera1);
            }
            
            if (stats.camera2) {
                this.updateCameraStats(2, stats.camera2);
            }

            // Calculate and update volume estimate
            const volumeEstimate = window.VolumeCalculator ? 
                window.VolumeCalculator.calculateVolume(stats) : 
                0;
            this.updateVolumeDisplay(volumeEstimate);

            // Update performance tracking
            this.updatePerformanceStats();

            // Debug logging occasionally
            if (Math.random() < 0.1) { // 10% chance per update (every ~5 seconds at 500ms intervals)
                console.log('Stats updated successfully:', {
                    camera1: stats.camera1,
                    camera2: stats.camera2,
                    calibratedVolume: volumeEstimate
                });
            }

        } catch (error) {
            console.error('Failed to fetch stats:', error);
            
            // If we can't get stats, assume connection lost
            if (window.ProcessingManager && window.ProcessingManager.isActive()) {
                console.log('Stats fetch failed, will recheck connection...');
            }
        }
    },
    
    /**
     * Update camera statistics display
     * @param {number} cameraId - Camera ID (1 or 2)
     * @param {Object} cameraStats - Camera statistics object
     */
    updateCameraStats(cameraId, cameraStats) {
        if (!cameraStats) {
            console.warn(`No stats data for camera ${cameraId}`);
            return;
        }
        
        // Update FPS with validation
        if (typeof cameraStats.fps === 'number') {
            const fpsText = window.Utils ? window.Utils.formatNumber(cameraStats.fps, 1) : cameraStats.fps.toFixed(1);
            if (window.Utils) {
                window.Utils.updateElementText(`fps${cameraId}`, fpsText);
            } else {
                const fpsEl = document.getElementById(`fps${cameraId}`);
                if (fpsEl) fpsEl.textContent = fpsText;
            }
        }
        
        // Update objects count with validation
        if (typeof cameraStats.objects === 'number') {
            if (window.Utils) {
                window.Utils.updateElementText(`objects${cameraId}`, cameraStats.objects.toString());
            } else {
                const objEl = document.getElementById(`objects${cameraId}`);
                if (objEl) objEl.textContent = cameraStats.objects.toString();
            }
        }
        
        // Update area with validation - show calibrated area if available
        if (typeof cameraStats.total_area === 'number') {
            const calibData = window.CalibrationManager ? 
                window.CalibrationManager.getCalibrationData(cameraId) : 
                { pixelsPerMeter: null };
                
            if (calibData.pixelsPerMeter) {
                // Show area in square meters
                const areaSquareMeters = cameraStats.total_area / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
                const areaText = window.Utils ? 
                    `${window.Utils.formatNumber(areaSquareMeters)} m²` : 
                    `${areaSquareMeters.toFixed(2)} m²`;
                
                if (window.Utils) {
                    window.Utils.updateElementText(`area${cameraId}`, areaText);
                } else {
                    const areaEl = document.getElementById(`area${cameraId}`);
                    if (areaEl) areaEl.textContent = areaText;
                }
            } else {
                // Show area in pixels
                const areaText = Math.round(cameraStats.total_area).toString();
                if (window.Utils) {
                    window.Utils.updateElementText(`area${cameraId}`, areaText);
                } else {
                    const areaEl = document.getElementById(`area${cameraId}`);
                    if (areaEl) areaEl.textContent = areaText;
                }
            }
        }
    },
    
    /**
     * Update volume display
     * @param {number} volume - Volume estimate in cubic meters
     */
    updateVolumeDisplay(volume) {
        const volumeText = window.Utils ? window.Utils.formatNumber(volume) : volume.toFixed(2);
        if (window.Utils) {
            window.Utils.updateElementText('volumeValue', volumeText);
        } else {
            const volumeElement = document.getElementById('volumeValue');
            if (volumeElement) {
                volumeElement.textContent = volumeText;
            }
        }
    },
    
    /**
     * Reset statistics display to default values
     */
    resetDisplay() {
        const statElements = ['fps1', 'objects1', 'area1', 'fps2', 'objects2', 'area2'];
        statElements.forEach(id => {
            if (window.Utils) {
                window.Utils.updateElementText(id, '0');
            } else {
                const el = document.getElementById(id);
                if (el) el.textContent = '0';
            }
        });
        
        if (window.Utils) {
            window.Utils.updateElementText('volumeValue', '0.00');
        } else {
            const volumeEl = document.getElementById('volumeValue');
            if (volumeEl) volumeEl.textContent = '0.00';
        }
        
        console.log('Reset stats display to zeros');
    },
    
    /**
     * Update performance statistics
     */
    updatePerformanceStats() {
        const now = Date.now();
        const timeSinceLastUpdate = now - this.performanceStats.lastUpdate;
        this.performanceStats.updateCount++;
        
        // Calculate moving average of update times
        this.performanceStats.avgUpdateTime = (this.performanceStats.avgUpdateTime * 0.9) + (timeSinceLastUpdate * 0.1);
        this.performanceStats.lastUpdate = now;
        
        // Log performance stats occasionally
        const logInterval = window.CONFIG ? window.CONFIG.UI.PERFORMANCE_LOG_INTERVAL : 100;
        if (this.performanceStats.updateCount % logInterval === 0) {
            console.log(`Performance: ${this.performanceStats.avgUpdateTime.toFixed(1)}ms avg update time, ${this.performanceStats.updateCount} total updates`);
        }
    },
    
    /**
     * Toggle statistics visibility
     */
    toggleVisibility() {
        const statsElements = document.querySelectorAll('.camera-stats');
        const volumeSection = document.querySelector('.volume-estimation');
        
        statsElements.forEach(element => {
            element.style.display = element.style.display === 'none' ? 'grid' : 'none';
        });
        
        if (volumeSection) {
            volumeSection.style.display = volumeSection.style.display === 'none' ? 'block' : 'none';
        }
        
        if (window.Utils) {
            window.Utils.showNotification('Statistics visibility toggled', 'info');
        }
    },
    
    /**
     * Get current performance statistics
     * @returns {Object} Performance statistics object
     */
    getPerformanceStats() {
        return { ...this.performanceStats };
    },
    
    /**
     * Manual stats refresh for debugging
     */
    async debugStats() {
        try {
            const statsUrl = window.CONFIG ? window.CONFIG.API.STATS : '/api/stats';
            const stats = window.Utils ? 
                await window.Utils.apiCall(statsUrl) : 
                await fetch(statsUrl).then(r => r.json());
            console.log('Manual stats check:', stats);
            return stats;
        } catch (error) {
            console.error('Manual stats check failed:', error);
            throw error;
        }
    }
};