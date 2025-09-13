window.VolumeCalculator = {
    
    /**
     * Calculate calibrated volume based on camera statistics and calibration data
     * @param {Object} stats - Statistics object from the server
     * @returns {number} Volume estimate in cubic meters
     */
    calculateVolume(stats) {
        const calib1 = window.CalibrationManager ? 
            window.CalibrationManager.getCalibrationData(1) : 
            { pixelsPerMeter: null };
        const calib2 = window.CalibrationManager ? 
            window.CalibrationManager.getCalibrationData(2) : 
            { pixelsPerMeter: null };
        
        // Check if we have calibration data for at least one camera
        if (!calib1.pixelsPerMeter && !calib2.pixelsPerMeter) {
            // No calibration, use basic estimation
            return this.calculateBasicVolume(stats);
        }
        
        let totalVolume = 0;
        let cameraCount = 0;
        
        // Calculate volume for each calibrated camera
        if (calib1.pixelsPerMeter && stats.camera1) {
            const volume1 = this.calculateCameraVolume(stats.camera1, calib1, 1);
            totalVolume += volume1;
            cameraCount++;
        }
        
        if (calib2.pixelsPerMeter && stats.camera2) {
            const volume2 = this.calculateCameraVolume(stats.camera2, calib2, 2);
            totalVolume += volume2;
            cameraCount++;
        }
        
        // Return average volume if we have multiple cameras
        return cameraCount > 0 ? totalVolume / cameraCount : 0;
    },
    
    /**
     * Calculate volume for a single camera
     * @param {Object} cameraStats - Camera statistics
     * @param {Object} calibData - Calibration data for the camera
     * @param {number} cameraId - Camera ID for logging
     * @returns {number} Volume estimate for this camera
     */
    calculateCameraVolume(cameraStats, calibData, cameraId) {
        const areaPixels = cameraStats.total_area || 0;
        const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
        
        // Estimate height based on calibration area and detected area ratio
        const calibAreaPixels = window.Utils ? 
            window.Utils.calculatePolygonArea(calibData.points) : 
            this.calculatePolygonAreaFallback(calibData.points);
        const heightEstimate = this.estimateHeight(areaPixels, calibAreaPixels, calibData.pixelsPerMeter);
        
        const volume = areaSquareMeters * heightEstimate;
        
        const formatNumber = window.Utils ? window.Utils.formatNumber : (num => num.toFixed(2));
        console.log(`Camera ${cameraId} volume: ${formatNumber(volume)} m³ (area: ${formatNumber(areaSquareMeters)} m², height: ${formatNumber(heightEstimate)} m)`);
        
        return volume;
    },
    
    /**
     * Calculate basic volume without calibration
     * @param {Object} stats - Statistics object
     * @returns {number} Basic volume estimate
     */
    calculateBasicVolume(stats) {
        const area1 = stats.camera1?.total_area || 0;
        const area2 = stats.camera2?.total_area || 0;
        const avgArea = (area1 + area2) / 2;
        const scaleFactor = window.CONFIG ? window.CONFIG.VOLUME.BASIC_SCALE_FACTOR : 0.01;
        return avgArea * scaleFactor;
    },
    
    /**
     * Estimate height based on area coverage and calibration
     * @param {number} detectedAreaPixels - Detected area in pixels
     * @param {number} calibrationAreaPixels - Calibration area in pixels
     * @param {number} pixelsPerMeter - Calibration pixels per meter
     * @returns {number} Estimated height in meters
     */
    estimateHeight(detectedAreaPixels, calibrationAreaPixels, pixelsPerMeter) {
        // Basic height estimation based on area coverage
        // This is a simplified approach - in practice you'd need stereo vision or other depth estimation
        
        if (calibrationAreaPixels === 0) return 0;
        
        // Estimate fill ratio based on detected area vs calibration area
        const fillRatio = Math.min(detectedAreaPixels / calibrationAreaPixels, 1.0);
        
        // Get height settings from config or use defaults
        const maxHeight = window.CONFIG ? window.CONFIG.VOLUME.MAX_TRUCK_HEIGHT : 2.5;
        const minHeight = window.CONFIG ? window.CONFIG.VOLUME.MIN_TRUCK_HEIGHT : 0.1;
        
        // Simple linear relationship between fill ratio and height
        const estimatedHeight = minHeight + (fillRatio * (maxHeight - minHeight));
        
        return estimatedHeight;
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
     * Estimate volume using stereo vision approach (advanced)
     * @param {Object} stats - Statistics object
     * @param {Object} calibData1 - Camera 1 calibration data
     * @param {Object} calibData2 - Camera 2 calibration data
     * @returns {number} Volume estimate using stereo approach
     */
    calculateStereoVolume(stats, calibData1, calibData2) {
        // This is a placeholder for more advanced stereo vision volume calculation
        // In a real implementation, this would use:
        // - Camera pose estimation
        // - Stereo matching between camera views
        // - 3D reconstruction of the detected objects
        // - Integration over the reconstructed volume
        
        // For now, fall back to average of individual camera calculations
        let totalVolume = 0;
        let cameraCount = 0;
        
        if (calibData1.pixelsPerMeter && stats.camera1) {
            totalVolume += this.calculateCameraVolume(stats.camera1, calibData1, 1);
            cameraCount++;
        }
        
        if (calibData2.pixelsPerMeter && stats.camera2) {
            totalVolume += this.calculateCameraVolume(stats.camera2, calibData2, 2);
            cameraCount++;
        }
        
        return cameraCount > 0 ? totalVolume / cameraCount : 0;
    },
    
    /**
     * Apply volume correction factors based on truck type or load characteristics
     * @param {number} rawVolume - Raw volume estimate
     * @param {string} truckType - Type of truck ('standard', 'dump', 'flatbed', etc.)
     * @param {Object} options - Additional correction options
     * @returns {number} Corrected volume estimate
     */
    applyVolumeCorrections(rawVolume, truckType = 'standard', options = {}) {
        let correctedVolume = rawVolume;
        
        // Apply truck-specific corrections
        const truckCorrections = {
            'standard': 1.0,        // No correction for standard truck
            'dump': 1.1,           // Dump trucks may have sloped sides
            'flatbed': 0.9,        // Flatbed may have less volume due to constraints
            'container': 1.05      // Container trucks have defined volume
        };
        
        const correctionFactor = truckCorrections[truckType] || 1.0;
        correctedVolume *= correctionFactor;
        
        // Apply additional corrections if provided
        if (options.densityFactor) {
            correctedVolume *= options.densityFactor;
        }
        
        if (options.shapeFactor) {
            correctedVolume *= options.shapeFactor;
        }
        
        return correctedVolume;
    },
    
    /**
     * Get volume estimation confidence based on calibration quality and detection
     * @param {Object} stats - Statistics object
     * @returns {Object} Confidence information
     */
    getVolumeConfidence(stats) {
        const calib1 = window.CalibrationManager ? 
            window.CalibrationManager.getCalibrationData(1) : 
            { pixelsPerMeter: null };
        const calib2 = window.CalibrationManager ? 
            window.CalibrationManager.getCalibrationData(2) : 
            { pixelsPerMeter: null };
        
        let confidence = {
            overall: 0,
            factors: {
                calibration: 0,
                detection: 0,
                consistency: 0
            },
            recommendations: []
        };
        
        // Check calibration quality
        let calibratedCameras = 0;
        if (window.CalibrationManager) {
            if (window.CalibrationManager.isCalibrated(1)) calibratedCameras++;
            if (window.CalibrationManager.isCalibrated(2)) calibratedCameras++;
        }
        
        confidence.factors.calibration = calibratedCameras / 2.0; // 0-1 scale
        
        if (calibratedCameras === 0) {
            confidence.recommendations.push('Calibrate at least one camera for accurate volume estimation');
        }
        
        // Check detection quality
        const totalObjects = (stats.camera1?.objects || 0) + (stats.camera2?.objects || 0);
        const totalArea = (stats.camera1?.total_area || 0) + (stats.camera2?.total_area || 0);
        
        confidence.factors.detection = Math.min(totalObjects / 10.0, 1.0); // Assume 10+ objects is good
        
        if (totalObjects < 5) {
            confidence.recommendations.push('Ensure good lighting and clear view of load for better detection');
        }
        
        // Check consistency between cameras (if both calibrated)
        if (calibratedCameras === 2 && stats.camera1 && stats.camera2) {
            const vol1 = this.calculateCameraVolume(stats.camera1, calib1, 1);
            const vol2 = this.calculateCameraVolume(stats.camera2, calib2, 2);
            const avgVol = (vol1 + vol2) / 2;
            const difference = Math.abs(vol1 - vol2);
            const consistency = avgVol > 0 ? 1 - (difference / avgVol) : 0;
            
            confidence.factors.consistency = Math.max(0, consistency);
            
            if (consistency < 0.8) {
                confidence.recommendations.push('Large difference between camera estimates - check calibration and camera positioning');
            }
        } else {
            confidence.factors.consistency = calibratedCameras > 0 ? 0.5 : 0;
        }
        
        // Calculate overall confidence
        confidence.overall = (
            confidence.factors.calibration * 0.5 +
            confidence.factors.detection * 0.3 +
            confidence.factors.consistency * 0.2
        );
        
        return confidence;
    },
    
    /**
     * Format volume for display with appropriate units
     * @param {number} volume - Volume in cubic meters
     * @param {string} unit - Desired unit ('m3', 'ft3', 'liters')
     * @returns {Object} Formatted volume with value and unit
     */
    formatVolume(volume, unit = 'm3') {
        const conversions = {
            'm3': { factor: 1, symbol: 'm³', name: 'cubic meters' },
            'ft3': { factor: 35.3147, symbol: 'ft³', name: 'cubic feet' },
            'liters': { factor: 1000, symbol: 'L', name: 'liters' },
            'gallons': { factor: 264.172, symbol: 'gal', name: 'gallons' }
        };
        
        const conversion = conversions[unit] || conversions.m3;
        const convertedValue = volume * conversion.factor;
        
        const formatNumber = window.Utils ? window.Utils.formatNumber : (num => num.toFixed(2));
        
        return {
            value: convertedValue,
            formatted: formatNumber(convertedValue),
            symbol: conversion.symbol,
            name: conversion.name
        };
    }
};/**
 * Volume calculation for the Dual Camera YOLO application
 */

const VolumeCalculator = {
    
    /**
     * Calculate calibrated volume based on camera statistics and calibration data
     * @param {Object} stats - Statistics object from the server
     * @returns {number} Volume estimate in cubic meters
     */
    calculateVolume(stats) {
        const calib1 = calibrationManager.getCalibrationData(1);
        const calib2 = calibrationManager.getCalibrationData(2);
        
        // Check if we have calibration data for at least one camera
        if (!calib1.pixelsPerMeter && !calib2.pixelsPerMeter) {
            // No calibration, use basic estimation
            return this.calculateBasicVolume(stats);
        }
        
        let totalVolume = 0;
        let cameraCount = 0;
        
        // Calculate volume for each calibrated camera
        if (calib1.pixelsPerMeter && stats.camera1) {
            const volume1 = this.calculateCameraVolume(stats.camera1, calib1, 1);
            totalVolume += volume1;
            cameraCount++;
        }
        
        if (calib2.pixelsPerMeter && stats.camera2) {
            const volume2 = this.calculateCameraVolume(stats.camera2, calib2, 2);
            totalVolume += volume2;
            cameraCount++;
        }
        
        // Return average volume if we have multiple cameras
        return cameraCount > 0 ? totalVolume / cameraCount : 0;
    },
    
    /**
     * Calculate volume for a single camera
     * @param {Object} cameraStats - Camera statistics
     * @param {Object} calibData - Calibration data for the camera
     * @param {number} cameraId - Camera ID for logging
     * @returns {number} Volume estimate for this camera
     */
    calculateCameraVolume(cameraStats, calibData, cameraId) {
        const areaPixels = cameraStats.total_area || 0;
        const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
        
        // Estimate height based on calibration area and detected area ratio
        const calibAreaPixels = Utils.calculatePolygonArea(calibData.points);
        const heightEstimate = this.estimateHeight(areaPixels, calibAreaPixels, calibData.pixelsPerMeter);
        
        const volume = areaSquareMeters * heightEstimate;
        
        console.log(`Camera ${cameraId} volume: ${Utils.formatNumber(volume)} m³ (area: ${Utils.formatNumber(areaSquareMeters)} m², height: ${Utils.formatNumber(heightEstimate)} m)`);
        
        return volume;
    },
    
    /**
     * Calculate basic volume without calibration
     * @param {Object} stats - Statistics object
     * @returns {number} Basic volume estimate
     */
    calculateBasicVolume(stats) {
        const area1 = stats.camera1?.total_area || 0;
        const area2 = stats.camera2?.total_area || 0;
        const avgArea = (area1 + area2) / 2;
        return avgArea * CONFIG.VOLUME.BASIC_SCALE_FACTOR;
    },
    
    /**
     * Estimate height based on area coverage and calibration
     * @param {number} detectedAreaPixels - Detected area in pixels
     * @param {number} calibrationAreaPixels - Calibration area in pixels
     * @param {number} pixelsPerMeter - Calibration pixels per meter
     * @returns {number} Estimated height in meters
     */
    estimateHeight(detectedAreaPixels, calibrationAreaPixels, pixelsPerMeter) {
        // Basic height estimation based on area coverage
        // This is a simplified approach - in practice you'd need stereo vision or other depth estimation
        
        if (calibrationAreaPixels === 0) return 0;
        
        // Estimate fill ratio based on detected area vs calibration area
        const fillRatio = Math.min(detectedAreaPixels / calibrationAreaPixels, 1.0);
        
        // Simple linear relationship between fill ratio and height
        const estimatedHeight = CONFIG.VOLUME.MIN_TRUCK_HEIGHT + 
            (fillRatio * (CONFIG.VOLUME.MAX_TRUCK_HEIGHT - CONFIG.VOLUME.MIN_TRUCK_HEIGHT));
        
        return estimatedHeight;
    },
    
    /**
     * Estimate volume using stereo vision approach (advanced)
     * @param {Object} stats - Statistics object
     * @param {Object} calibData1 - Camera 1 calibration data
     * @param {Object} calibData2 - Camera 2 calibration data
     * @returns {number} Volume estimate using stereo approach
     */
    calculateStereoVolume(stats, calibData1, calibData2) {
        // This is a placeholder for more advanced stereo vision volume calculation
        // In a real implementation, this would use:
        // - Camera pose estimation
        // - Stereo matching between camera views
        // - 3D reconstruction of the detected objects
        // - Integration over the reconstructed volume
        
        // For now, fall back to average of individual camera calculations
        let totalVolume = 0;
        let cameraCount = 0;
        
        if (calibData1.pixelsPerMeter && stats.camera1) {
            totalVolume += this.calculateCameraVolume(stats.camera1, calibData1, 1);
            cameraCount++;
        }
        
        if (calibData2.pixelsPerMeter && stats.camera2) {
            totalVolume += this.calculateCameraVolume(stats.camera2, calibData2, 2);
            cameraCount++;
        }
        
        return cameraCount > 0 ? totalVolume / cameraCount : 0;
    },
    
    /**
     * Apply volume correction factors based on truck type or load characteristics
     * @param {number} rawVolume - Raw volume estimate
     * @param {string} truckType - Type of truck ('standard', 'dump', 'flatbed', etc.)
     * @param {Object} options - Additional correction options
     * @returns {number} Corrected volume estimate
     */
    applyVolumeCorrections(rawVolume, truckType = 'standard', options = {}) {
        let correctedVolume = rawVolume;
        
        // Apply truck-specific corrections
        const truckCorrections = {
            'standard': 1.0,        // No correction for standard truck
            'dump': 1.1,           // Dump trucks may have sloped sides
            'flatbed': 0.9,        // Flatbed may have less volume due to constraints
            'container': 1.05      // Container trucks have defined volume
        };
        
        const correctionFactor = truckCorrections[truckType] || 1.0;
        correctedVolume *= correctionFactor;
        
        // Apply additional corrections if provided
        if (options.densityFactor) {
            correctedVolume *= options.densityFactor;
        }
        
        if (options.shapeFactor) {
            correctedVolume *= options.shapeFactor;
        }
        
        return correctedVolume;
    },
    
    /**
     * Get volume estimation confidence based on calibration quality and detection
     * @param {Object} stats - Statistics object
     * @returns {Object} Confidence information
     */
    getVolumeConfidence(stats) {
        const calib1 = calibrationManager.getCalibrationData(1);
        const calib2 = calibrationManager.getCalibrationData(2);
        
        let confidence = {
            overall: 0,
            factors: {
                calibration: 0,
                detection: 0,
                consistency: 0
            },
            recommendations: []
        };
        
        // Check calibration quality
        let calibratedCameras = 0;
        if (calibrationManager.isCalibrated(1)) calibratedCameras++;
        if (calibrationManager.isCalibrated(2)) calibratedCameras++;
        
        confidence.factors.calibration = calibratedCameras / 2.0; // 0-1 scale
        
        if (calibratedCameras === 0) {
            confidence.recommendations.push('Calibrate at least one camera for accurate volume estimation');
        }
        
        // Check detection quality
        const totalObjects = (stats.camera1?.objects || 0) + (stats.camera2?.objects || 0);
        const totalArea = (stats.camera1?.total_area || 0) + (stats.camera2?.total_area || 0);
        
        confidence.factors.detection = Math.min(totalObjects / 10.0, 1.0); // Assume 10+ objects is good
        
        if (totalObjects < 5) {
            confidence.recommendations.push('Ensure good lighting and clear view of load for better detection');
        }
        
        // Check consistency between cameras (if both calibrated)
        if (calibratedCameras === 2 && stats.camera1 && stats.camera2) {
            const vol1 = this.calculateCameraVolume(stats.camera1, calib1, 1);
            const vol2 = this.calculateCameraVolume(stats.camera2, calib2, 2);
            const avgVol = (vol1 + vol2) / 2;
            const difference = Math.abs(vol1 - vol2);
            const consistency = avgVol > 0 ? 1 - (difference / avgVol) : 0;
            
            confidence.factors.consistency = Math.max(0, consistency);
            
            if (consistency < 0.8) {
                confidence.recommendations.push('Large difference between camera estimates - check calibration and camera positioning');
            }
        } else {
            confidence.factors.consistency = calibratedCameras > 0 ? 0.5 : 0;
        }
        
        // Calculate overall confidence
        confidence.overall = (
            confidence.factors.calibration * 0.5 +
            confidence.factors.detection * 0.3 +
            confidence.factors.consistency * 0.2
        );
        
        return confidence;
    },
    
    /**
     * Format volume for display with appropriate units
     * @param {number} volume - Volume in cubic meters
     * @param {string} unit - Desired unit ('m3', 'ft3', 'liters')
     * @returns {Object} Formatted volume with value and unit
     */
    formatVolume(volume, unit = 'm3') {
        const conversions = {
            'm3': { factor: 1, symbol: 'm³', name: 'cubic meters' },
            'ft3': { factor: 35.3147, symbol: 'ft³', name: 'cubic feet' },
            'liters': { factor: 1000, symbol: 'L', name: 'liters' },
            'gallons': { factor: 264.172, symbol: 'gal', name: 'gallons' }
        };
        
        const conversion = conversions[unit] || conversions.m3;
        const convertedValue = volume * conversion.factor;
        
        return {
            value: convertedValue,
            formatted: Utils.formatNumber(convertedValue),
            symbol: conversion.symbol,
            name: conversion.name
        };
    }
};