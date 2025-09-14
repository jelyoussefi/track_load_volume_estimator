/**
 * Enhanced Stats Manager for the Dual Camera YOLO application
 * Integrates with 3D calibration system for accurate volume calculations
 */

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
        console.log('Enhanced stats manager initialized with 3D capabilities');
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
        
        console.log(`Started enhanced stats updates every ${interval}ms`);
    },
    
    /**
     * Stop stats updates
     */
    stopUpdates() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
            console.log('Stopped enhanced stats updates');
        }
    },
    
    /**
     * Update statistics from the server with 3D volume calculation
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

            // Calculate enhanced volume estimate using 3D calibration
            const volumeEstimate = window.VolumeCalculator ? 
                window.VolumeCalculator.calculateVolume(stats) : 
                0;
            this.updateEnhancedVolumeDisplay(volumeEstimate, stats);

            // Update performance tracking
            this.updatePerformanceStats();

            // Update 3D calibration status
            this.update3DCalibrationStatus();

            // Debug logging occasionally
            if (Math.random() < 0.05) { // 5% chance per update (every ~10 seconds at 500ms intervals)
                const method = window.VolumeCalculator ? 
                    window.VolumeCalculator.getEstimationMethod() : 
                    'Unknown';
                console.log('Enhanced stats updated:', {
                    camera1: stats.camera1,
                    camera2: stats.camera2,
                    volume: volumeEstimate,
                    method: method
                });
            }

        } catch (error) {
            console.error('Failed to fetch enhanced stats:', error);
            
            // If we can't get stats, assume connection lost
            if (window.ProcessingManager && window.ProcessingManager.isActive()) {
                console.log('Stats fetch failed, will recheck connection...');
            }
        }
    },
    
    /**
     * Update camera statistics display with enhanced 3D information
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
        
        // Update area with enhanced display - show both pixels and square meters if calibrated
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
     * Update enhanced volume display with multiple units and confidence
     * @param {number} volume - Volume estimate in cubic meters
     * @param {Object} stats - Current statistics for confidence calculation
     */
    updateEnhancedVolumeDisplay(volume, stats) {
        // Update main volume display
        const volumeText = window.Utils ? window.Utils.formatNumber(volume) : volume.toFixed(2);
        if (window.Utils) {
            window.Utils.updateElementText('volumeValue', volumeText);
        } else {
            const volumeElement = document.getElementById('volumeValue');
            if (volumeElement) {
                volumeElement.textContent = volumeText;
            }
        }
        
        // Update alternative unit displays if elements exist
        if (window.VolumeCalculator) {
            const formatted = window.VolumeCalculator.formatVolume(volume);
            
            const ft3Element = document.getElementById('volumeFt3');
            const yardsElement = document.getElementById('volumeYards');
            const litersElement = document.getElementById('volumeLiters');
            
            if (ft3Element) ft3Element.textContent = formatted.ft3.display;
            if (yardsElement) yardsElement.textContent = formatted.yards3.display;
            if (litersElement) litersElement.textContent = formatted.liters.display;
            
            // Update estimation method
            const methodElement = document.querySelector('.method-text');
            if (methodElement) {
                methodElement.textContent = window.VolumeCalculator.getEstimationMethod();
            }
            
            // Update confidence indicator
            this.updateConfidenceIndicator(stats);
        }
    },
    
    /**
     * Update confidence indicator based on current statistics
     * @param {Object} stats - Current statistics
     */
    updateConfidenceIndicator(stats) {
        if (!window.VolumeCalculator) return;
        
        const confidence = window.VolumeCalculator.getVolumeConfidence(stats);
        
        // Update confidence bar
        const fillElement = document.getElementById('confidenceFill');
        const textElement = document.getElementById('confidenceText');
        
        if (fillElement && textElement) {
            const percentage = confidence.overall * 100;
            fillElement.style.width = `${percentage}%`;
            
            // Set color based on confidence level
            const colorMap = {
                'high': '#4ecdc4',
                'good': '#45b7d1',
                'moderate': '#f9ca24',
                'low': '#f0932b',
                'very low': '#eb4d4b'
            };
            
            fillElement.style.backgroundColor = colorMap[confidence.level] || '#eb4d4b';
            textElement.textContent = confidence.level.charAt(0).toUpperCase() + confidence.level.slice(1);
        }
    },
    
    /**
     * Update 3D calibration status display
     */
    update3DCalibrationStatus() {
        if (!window.CalibrationManager) return;
        
        for (let cameraId = 1; cameraId <= 2; cameraId++) {
            const calibData = window.CalibrationManager.getCalibrationData(cameraId);
            const calib3D = window.CalibrationManager.get3DCalibrationData(cameraId);
            
            // Update camera height display
            const heightElement = document.getElementById(`cameraHeight${cameraId}`);
            if (heightElement) {
                if (calibData.cameraHeight) {
                    const formatNumber = window.Utils ? window.Utils.formatNumber : (num => num.toFixed(2));
                    heightElement.textContent = `${formatNumber(calibData.cameraHeight)}m`;
                } else {
                    heightElement.textContent = 'Not set';
                }
            }
            
            // Update calibration type
            const typeElement = document.getElementById(`calibrationType${cameraId}`);
            if (typeElement) {
                if (window.CalibrationManager.has3DCalibration(cameraId)) {
                    typeElement.textContent = '3D Complete';
                    typeElement.className = 'status-value status-3d';
                } else if (window.CalibrationManager.hasBasicCalibration(cameraId)) {
                    typeElement.textContent = '2D Only';
                    typeElement.className = 'status-value status-2d';
                } else {
                    typeElement.textContent = 'None';
                    typeElement.className = 'status-value status-none';
                }
            }
            
            // Update calibration quality
            const qualityElement = document.getElementById(`calibrationQuality${cameraId}`);
            if (qualityElement) {
                if (calib3D && calib3D.calibrationQuality) {
                    const quality = calib3D.calibrationQuality.quality;
                    qualityElement.textContent = quality.charAt(0).toUpperCase() + quality.slice(1);
                    qualityElement.className = `status-value quality-${quality}`;
                } else {
                    qualityElement.textContent = '-';
                    qualityElement.className = 'status-value';
                }
            }
            
            // Update average distance
            const distanceElement = document.getElementById(`avgDistance${cameraId}`);
            if (distanceElement) {
                if (calib3D && calib3D.averageHorizontalDistance) {
                    const formatNumber = window.Utils ? window.Utils.formatNumber : (num => num.toFixed(1));
                    distanceElement.textContent = `${formatNumber(calib3D.averageHorizontalDistance)}m`;
                } else {
                    distanceElement.textContent = '-';
                }
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
        
        // Reset main volume display
        if (window.Utils) {
            window.Utils.updateElementText('volumeValue', '0.00');
        } else {
            const volumeEl = document.getElementById('volumeValue');
            if (volumeEl) volumeEl.textContent = '0.00';
        }
        
        // Reset alternative volume displays
        const alternativeElements = ['volumeFt3', 'volumeYards', 'volumeLiters'];
        alternativeElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                switch(id) {
                    case 'volumeFt3':
                        el.textContent = '0.0 ft³';
                        break;
                    case 'volumeYards':
                        el.textContent = '0.00 yd³';
                        break;
                    case 'volumeLiters':
                        el.textContent = '0 L';
                        break;
                }
            }
        });
        
        // Reset confidence indicator
        const fillElement = document.getElementById('confidenceFill');
        const textElement = document.getElementById('confidenceText');
        if (fillElement) fillElement.style.width = '0%';
        if (textElement) textElement.textContent = 'No Data';
        
        // Reset estimation method
        const methodElement = document.querySelector('.method-text');
        if (methodElement) {
            methodElement.textContent = 'No calibration data';
        }
        
        console.log('Reset enhanced stats display to defaults');
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
            console.log(`Enhanced Stats Performance: ${this.performanceStats.avgUpdateTime.toFixed(1)}ms avg update time, ${this.performanceStats.updateCount} total updates`);
        }
    },
    
    /**
     * Toggle statistics visibility
     */
    toggleVisibility() {
        const statsElements = document.querySelectorAll('.camera-stats');
        const volumeSection = document.querySelector('.volume-estimation');
        const calibrationStatuses = document.querySelectorAll('.calibration-status');
        
        statsElements.forEach(element => {
            element.style.display = element.style.display === 'none' ? 'grid' : 'none';
        });
        
        if (volumeSection) {
            volumeSection.style.display = volumeSection.style.display === 'none' ? 'block' : 'none';
        }
        
        calibrationStatuses.forEach(element => {
            element.style.display = element.style.display === 'none' ? 'block' : 'none';
        });
        
        if (window.Utils) {
            window.Utils.showNotification('Enhanced statistics visibility toggled', 'info');
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
     * Manual stats refresh for debugging with enhanced 3D information
     */
    async debugStats() {
        try {
            const statsUrl = window.CONFIG ? window.CONFIG.API.STATS : '/api/stats';
            const stats = window.Utils ? 
                await window.Utils.apiCall(statsUrl) : 
                await fetch(statsUrl).then(r => r.json());
            
            console.log('=== ENHANCED STATS DEBUG ===');
            console.log('Raw stats:', stats);
            
            if (window.VolumeCalculator && !stats.error) {
                const volume = window.VolumeCalculator.calculateVolume(stats);
                const confidence = window.VolumeCalculator.getVolumeConfidence(stats);
                const method = window.VolumeCalculator.getEstimationMethod();
                const formatted = window.VolumeCalculator.formatVolume(volume);
                
                console.log('Volume calculation:', {
                    volume_m3: volume,
                    method: method,
                    confidence: confidence,
                    formatted_units: {
                        cubic_meters: formatted.m3.display,
                        cubic_feet: formatted.ft3.display,
                        cubic_yards: formatted.yards3.display,
                        liters: formatted.liters.display
                    }
                });
            }
            
            if (window.CalibrationManager) {
                const summary = window.CalibrationManager.getCalibrationSummary();
                console.log('3D Calibration summary:', summary);
            }
            
            console.log('=== END ENHANCED STATS DEBUG ===');
            return stats;
        } catch (error) {
            console.error('Enhanced stats check failed:', error);
            throw error;
        }
    },
    
    /**
     * Generate detailed stats report for export
     * @returns {Object} Comprehensive stats report
     */
    async generateStatsReport() {
        try {
            const stats = await this.debugStats();
            
            if (stats.error) {
                return { error: 'No current data available' };
            }
            
            const report = {
                timestamp: new Date().toISOString(),
                performance: this.getPerformanceStats(),
                detection_stats: stats,
                volume_analysis: null,
                calibration_status: null
            };
            
            // Add volume analysis if calculator is available
            if (window.VolumeCalculator) {
                report.volume_analysis = window.VolumeCalculator.generateVolumeReport(stats);
            }
            
            // Add calibration status if manager is available
            if (window.CalibrationManager) {
                report.calibration_status = window.CalibrationManager.getCalibrationSummary();
            }
            
            return report;
        } catch (error) {
            console.error('Failed to generate stats report:', error);
            return { error: error.message };
        }
    },
    
    /**
     * Export stats report to file
     */
    async exportStatsReport() {
        try {
            const report = await this.generateStatsReport();
            
            if (report.error) {
                if (window.Utils) {
                    window.Utils.showNotification(`Export failed: ${report.error}`, 'error');
                }
                return;
            }
            
            const data = JSON.stringify(report, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `truck-volume-stats-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            if (window.Utils) {
                window.Utils.showNotification('Stats report exported successfully', 'success');
            }
        } catch (error) {
            console.error('Failed to export stats report:', error);
            if (window.Utils) {
                window.Utils.showNotification('Failed to export stats report', 'error');
            }
        }
    },
    
    /**
     * Show live stats dashboard (for debugging)
     */
    showLiveDashboard() {
        if (!window.UIManager) {
            console.log('Live dashboard not available - UIManager not found');
            return;
        }
        
        const dashboardHtml = `
            <div class="live-dashboard">
                <h3>Live Statistics Dashboard</h3>
                <div class="dashboard-grid">
                    <div class="dashboard-section">
                        <h4>Performance</h4>
                        <div id="liveFPS">FPS: -</div>
                        <div id="liveUpdateTime">Update Time: -</div>
                        <div id="liveUpdateCount">Updates: -</div>
                    </div>
                    <div class="dashboard-section">
                        <h4>Detection</h4>
                        <div id="liveTotalObjects">Objects: -</div>
                        <div id="liveTotalArea">Area: -</div>
                        <div id="liveVolume">Volume: -</div>
                    </div>
                    <div class="dashboard-section">
                        <h4>Calibration</h4>
                        <div id="liveCalibMethod">Method: -</div>
                        <div id="liveConfidence">Confidence: -</div>
                        <div id="liveCameras">Cameras: -</div>
                    </div>
                </div>
                <div class="dashboard-controls">
                    <button onclick="window.StatsManager.debugStats()" class="btn btn-secondary">Debug Stats</button>
                    <button onclick="window.StatsManager.exportStatsReport()" class="btn btn-secondary">Export Report</button>
                </div>
            </div>
        `;
        
        const modal = window.UIManager.createModal('Live Statistics Dashboard', dashboardHtml, [
            {
                text: 'Close',
                class: 'btn btn-primary'
            }
        ]);
        
        // Start live updates for the dashboard
        const updateDashboard = async () => {
            try {
                const stats = await window.Utils.apiCall('/api/stats');
                if (stats.error) return;
                
                // Update performance info
                const fps1 = stats.camera1?.fps || 0;
                const fps2 = stats.camera2?.fps || 0;
                const avgFPS = (fps1 + fps2) / 2;
                
                document.getElementById('liveFPS').textContent = `FPS: ${avgFPS.toFixed(1)}`;
                document.getElementById('liveUpdateTime').textContent = `Update Time: ${this.performanceStats.avgUpdateTime.toFixed(1)}ms`;
                document.getElementById('liveUpdateCount').textContent = `Updates: ${this.performanceStats.updateCount}`;
                
                // Update detection info
                const totalObjects = (stats.camera1?.objects || 0) + (stats.camera2?.objects || 0);
                const totalArea = (stats.camera1?.total_area || 0) + (stats.camera2?.total_area || 0);
                
                document.getElementById('liveTotalObjects').textContent = `Objects: ${totalObjects}`;
                document.getElementById('liveTotalArea').textContent = `Area: ${Math.round(totalArea)} px`;
                
                if (window.VolumeCalculator) {
                    const volume = window.VolumeCalculator.calculateVolume(stats);
                    const formatted = window.VolumeCalculator.formatVolume(volume);
                    document.getElementById('liveVolume').textContent = `Volume: ${formatted.m3.display}`;
                    
                    const method = window.VolumeCalculator.getEstimationMethod();
                    const confidence = window.VolumeCalculator.getVolumeConfidence(stats);
                    
                    document.getElementById('liveCalibMethod').textContent = `Method: ${method.split(' ')[0]}`;
                    document.getElementById('liveConfidence').textContent = `Confidence: ${confidence.level}`;
                }
                
                if (window.CalibrationManager) {
                    const has3D1 = window.CalibrationManager.has3DCalibration(1);
                    const has3D2 = window.CalibrationManager.has3DCalibration(2);
                    const cameras = has3D1 && has3D2 ? 'Both 3D' : 
                                  has3D1 || has3D2 ? 'One 3D' : 'None';
                    document.getElementById('liveCameras').textContent = `Cameras: ${cameras}`;
                }
                
            } catch (error) {
                console.warn('Dashboard update failed:', error);
            }
        };
        
        // Update dashboard every second
        const dashboardInterval = setInterval(updateDashboard, 1000);
        updateDashboard(); // Initial update
        
        // Clean up interval when modal is closed
        modal.addEventListener('remove', () => {
            clearInterval(dashboardInterval);
        });
    }
};