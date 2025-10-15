/**
 * Enhanced 3D Volume Calculator for the Dual Camera YOLO application
 * Utilizes camera height and distance measurements for accurate volume estimation
 */

window.VolumeCalculator = {
    
    /**
     * Calculate volume using enhanced 3D calibration data
     * @param {Object} stats - Statistics object from the server
     * @returns {number} Volume estimate in cubic meters
     */
    calculateVolume(stats) {
        const calib1 = window.CalibrationManager ? 
            window.CalibrationManager.getCalibrationData(1) : 
            { pixelsPerMeter: null, cameraHeight: null };
        const calib2 = window.CalibrationManager ? 
            window.CalibrationManager.getCalibrationData(2) : 
            { pixelsPerMeter: null, cameraHeight: null };
        
        // Check if we have 3D calibration data for any camera
        const has3DCalib1 = window.CalibrationManager ? window.CalibrationManager.has3DCalibration(1) : false;
        const has3DCalib2 = window.CalibrationManager ? window.CalibrationManager.has3DCalibration(2) : false;
        
        if (has3DCalib1 || has3DCalib2) {
            return this.calculate3DVolume(stats, calib1, calib2);
        }
        
        // Check if we have basic 2D calibration for any camera
        const hasBasicCalib1 = window.CalibrationManager ? window.CalibrationManager.hasBasicCalibration(1) : false;
        const hasBasicCalib2 = window.CalibrationManager ? window.CalibrationManager.hasBasicCalibration(2) : false;
        
        if (hasBasicCalib1 || hasBasicCalib2) {
            return this.calculateBasic2DVolume(stats, calib1, calib2);
        }
        
        // No calibration, use basic estimation
        return this.calculateBasicVolume(stats);
    },
    
    /**
     * Calculate volume using 3D calibration data
     * @param {Object} stats - Statistics object
     * @param {Object} calib1 - Camera 1 calibration data
     * @param {Object} calib2 - Camera 2 calibration data
     * @returns {number} 3D volume estimate in cubic meters
     */
    calculate3DVolume(stats, calib1, calib2) {
        let totalVolume = 0;
        let cameraCount = 0;
        
        // Calculate volume for each camera with 3D calibration
        if (window.CalibrationManager && window.CalibrationManager.has3DCalibration(1) && stats.camera1) {
            const volume1 = this.calculate3DCameraVolume(stats.camera1, calib1, 1);
            if (volume1 > 0) {
                totalVolume += volume1;
                cameraCount++;
            }
        }
        
        if (window.CalibrationManager && window.CalibrationManager.has3DCalibration(2) && stats.camera2) {
            const volume2 = this.calculate3DCameraVolume(stats.camera2, calib2, 2);
            if (volume2 > 0) {
                totalVolume += volume2;
                cameraCount++;
            }
        }
        
        return cameraCount > 0 ? totalVolume / cameraCount : 0;
    },
    
    /**
     * Calculate 3D volume for a single camera using height and distance data
     * @param {Object} cameraStats - Camera statistics
     * @param {Object} calibData - Enhanced calibration data
     * @param {number} cameraId - Camera ID for logging
     * @returns {number} 3D volume estimate for this camera
     */
    calculate3DCameraVolume(cameraStats, calibData, cameraId) {
        const { cameraHeight, effectiveCameraHeight, truckBedHeight, cameraDistances, pixelsPerMeter, points } = calibData;
        const detectedAreaPixels = cameraStats.total_area || 0;
        
        // Use effective camera height if available (camera height above truck bed)
        // Otherwise fall back to absolute camera height
        const heightToUse = effectiveCameraHeight !== null && effectiveCameraHeight !== undefined ? 
            effectiveCameraHeight : cameraHeight;
        
        if (!heightToUse || !cameraDistances || !pixelsPerMeter || !points || points.length !== 4) {
            console.warn(`Camera ${cameraId}: Missing calibration data for 3D volume calculation`, {
                heightToUse,
                effectiveCameraHeight,
                cameraHeight,
                hasCameraDistances: !!cameraDistances,
                hasPixelsPerMeter: !!pixelsPerMeter,
                pointsLength: points?.length
            });
            return 0;
        }
        
        // Log which height is being used
        if (effectiveCameraHeight !== null && effectiveCameraHeight !== undefined) {
            console.log(`Camera ${cameraId}: Using effective camera height ${effectiveCameraHeight.toFixed(2)}m (absolute: ${cameraHeight}m, truck bed: ${truckBedHeight}m)`);
        } else {
            console.log(`Camera ${cameraId}: Using absolute camera height ${cameraHeight.toFixed(2)}m (truck bed height not configured)`);
        }
        
        // Calculate the real-world area of the calibration region
        const calibAreaPixels = window.Utils ? 
            window.Utils.calculatePolygonArea(points) : 
            this.calculatePolygonAreaFallback(points);
        const calibAreaSquareMeters = calibAreaPixels / (pixelsPerMeter * pixelsPerMeter);
        
        // Calculate the detected area in square meters
        const detectedAreaSquareMeters = detectedAreaPixels / (pixelsPerMeter * pixelsPerMeter);
        
        // Calculate average distance from camera to truck bed corners
        const avgDistance = (
            cameraDistances.C1 + 
            cameraDistances.C2 + 
            cameraDistances.C3 + 
            cameraDistances.C4
        ) / 4;
        
        // Calculate height estimation using 3D geometry with effective height
        const heightEstimate = this.estimate3DHeight(
            detectedAreaPixels,
            calibAreaPixels,
            heightToUse,  // Use effective height here
            avgDistance,
            pixelsPerMeter,
            truckBedHeight  // Pass truck bed height for additional corrections
        );
        
        // Calculate volume
        const volume = detectedAreaSquareMeters * heightEstimate;
        
        console.log(`Camera ${cameraId} volume calculation:`, {
            detectedArea: detectedAreaSquareMeters.toFixed(2) + ' m²',
            calibArea: calibAreaSquareMeters.toFixed(2) + ' m²',
            fillRatio: (detectedAreaPixels / calibAreaPixels * 100).toFixed(1) + '%',
            effectiveHeight: heightToUse.toFixed(2) + 'm',
            estimatedPileHeight: heightEstimate.toFixed(2) + 'm',
            volume: volume.toFixed(3) + ' m³'
        });
        
        return volume;
    },
    
    /**
     * Estimate 3D height using camera geometry and detection data
     * UPDATED: Now uses effective camera height (height above truck bed)
     * 
     * @param {number} detectedAreaPixels - Detected brick area in pixels
     * @param {number} calibAreaPixels - Calibration area in pixels
     * @param {number} effectiveCameraHeight - Height of camera ABOVE TRUCK BED (not ground)
     * @param {number} avgDistance - Average distance from camera to corners
     * @param {number} pixelsPerMeter - Calibration pixels per meter
     * @param {number} truckBedHeight - Height of truck bed above ground (for display/logging)
     * @returns {number} Estimated height of brick pile in meters (above truck bed)
     */
    estimate3DHeight(detectedAreaPixels, calibAreaPixels, effectiveCameraHeight, avgDistance, pixelsPerMeter, truckBedHeight) {
        if (calibAreaPixels === 0 || detectedAreaPixels === 0) return 0;
        
        // Calculate fill ratio (how much of the calibrated area is covered by bricks)
        const fillRatio = Math.min(detectedAreaPixels / calibAreaPixels, 1.0);
        
        // Get height settings from config
        const maxHeight = window.CONFIG ? window.CONFIG.VOLUME.MAX_TRUCK_HEIGHT : 2.5;
        const minHeight = window.CONFIG ? window.CONFIG.VOLUME.MIN_TRUCK_HEIGHT : 0.1;
        
        // Enhanced height estimation using 3D geometry
        // IMPORTANT: effectiveCameraHeight is the height ABOVE the truck bed
        // This is the actual height difference between camera and load surface
        
        // Calculate horizontal distance to truck bed
        // Using Pythagorean theorem: horizontal_distance² = total_distance² - height²
        const horizontalDistance = Math.sqrt(
            Math.max(0, avgDistance * avgDistance - effectiveCameraHeight * effectiveCameraHeight)
        );
        
        // Calculate viewing angle (angle between camera direction and vertical)
        // This is the angle from vertical down to the line-of-sight to the truck bed
        const viewingAngle = Math.atan2(horizontalDistance, effectiveCameraHeight);
        
        // Log geometry for debugging
        if (Math.random() < 0.1) {  // Log 10% of the time to avoid spam
            console.log('3D Height Estimation Geometry:', {
                fillRatio: (fillRatio * 100).toFixed(1) + '%',
                effectiveCameraHeight: effectiveCameraHeight.toFixed(2) + 'm',
                avgDistance: avgDistance.toFixed(2) + 'm',
                horizontalDistance: horizontalDistance.toFixed(2) + 'm',
                viewingAngleDeg: (viewingAngle * 180 / Math.PI).toFixed(1) + '°',
                truckBedHeight: truckBedHeight ? truckBedHeight.toFixed(2) + 'm' : 'not set'
            });
        }
        
        // Adjust height estimation based on viewing angle and fill ratio
        // More vertical viewing (smaller angle) = more accurate height detection
        // Steeper angle requires correction as perspective distortion increases
        const angleCorrection = 1.0 + (viewingAngle / (Math.PI / 2)) * 0.3; // 0-30% correction
        
        // Base height estimation from fill ratio
        // This is a non-linear relationship: as more area is covered, height increases
        // Using a slightly curved relationship (square root) for more realistic estimates
        let estimatedHeight = minHeight + (Math.sqrt(fillRatio) * (maxHeight - minHeight));
        
        // Apply perspective correction
        estimatedHeight *= angleCorrection;
        
        // Apply distance-based correction
        // Further distances may underestimate height due to perspective
        // Add 5% correction per meter beyond 5m horizontal distance
        const distanceCorrection = 1.0 + Math.max(0, (horizontalDistance - 5.0) * 0.05);
        estimatedHeight *= distanceCorrection;
        
        // Truck bed height correction
        // If we know the truck bed height, we can apply additional corrections
        // based on the ratio of camera height to truck bed height
        if (truckBedHeight && truckBedHeight > 0) {
            // When effective camera height is small relative to truck bed height,
            // the viewing angle is very steep and we see more of the pile
            const heightRatio = effectiveCameraHeight / truckBedHeight;
            
            if (heightRatio < 2.5) {  // Camera less than 2.5x truck bed height
                // Steep viewing angle - apply additional correction
                const steepAngleCorrection = 1.0 + (2.5 - heightRatio) * 0.1; // Up to 25% correction
                estimatedHeight *= steepAngleCorrection;
                
                if (Math.random() < 0.1) {
                    console.log('Applied steep angle correction:', {
                        heightRatio: heightRatio.toFixed(2),
                        steepAngleCorrection: steepAngleCorrection.toFixed(3),
                        reason: 'Camera close to truck bed height - steep viewing angle'
                    });
                }
            }
        }
        
        // Ensure reasonable bounds
        estimatedHeight = Math.max(minHeight, Math.min(maxHeight, estimatedHeight));
        
        return estimatedHeight;
    },
    
    /**
     * Calculate volume using basic 2D calibration (fallback)
     * @param {Object} stats - Statistics object
     * @param {Object} calib1 - Camera 1 calibration data
     * @param {Object} calib2 - Camera 2 calibration data
     * @returns {number} 2D volume estimate
     */
    calculateBasic2DVolume(stats, calib1, calib2) {
        let totalVolume = 0;
        let cameraCount = 0;
        
        // Calculate volume for each calibrated camera using basic method
        if (calib1.pixelsPerMeter && stats.camera1) {
            const volume1 = this.calculateBasic2DCameraVolume(stats.camera1, calib1, 1);
            totalVolume += volume1;
            cameraCount++;
        }
        
        if (calib2.pixelsPerMeter && stats.camera2) {
            const volume2 = this.calculateBasic2DCameraVolume(stats.camera2, calib2, 2);
            totalVolume += volume2;
            cameraCount++;
        }
        
        return cameraCount > 0 ? totalVolume / cameraCount : 0;
    },
    
    /**
     * Calculate basic 2D volume for a single camera
     * @param {Object} cameraStats - Camera statistics
     * @param {Object} calibData - Basic calibration data
     * @param {number} cameraId - Camera ID for logging
     * @returns {number} Basic volume estimate for this camera
     */
    calculateBasic2DCameraVolume(cameraStats, calibData, cameraId) {
        const areaPixels = cameraStats.total_area || 0;
        const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
        
        // Estimate height based on calibration area and detected area ratio
        const calibAreaPixels = window.Utils ? 
            window.Utils.calculatePolygonArea(calibData.points) : 
            this.calculatePolygonAreaFallback(calibData.points);
        const heightEstimate = this.estimateBasicHeight(areaPixels, calibAreaPixels);
        
        const volume = areaSquareMeters * heightEstimate;
        
        return volume;
    },
    
    /**
     * Estimate height using basic 2D method
     * @param {number} detectedAreaPixels - Detected area in pixels
     * @param {number} calibrationAreaPixels - Calibration area in pixels
     * @returns {number} Estimated height in meters
     */
    estimateBasicHeight(detectedAreaPixels, calibrationAreaPixels) {
        if (calibrationAreaPixels === 0) return 0;
        
        // Estimate fill ratio based on detected area vs calibration area
        const fillRatio = Math.min(detectedAreaPixels / calibrationAreaPixels, 1.0);
        
        // Get height settings from config
        const maxHeight = window.CONFIG ? window.CONFIG.VOLUME.MAX_TRUCK_HEIGHT : 2.5;
        const minHeight = window.CONFIG ? window.CONFIG.VOLUME.MIN_TRUCK_HEIGHT : 0.1;
        
        // Simple linear relationship between fill ratio and height
        const estimatedHeight = minHeight + (fillRatio * (maxHeight - minHeight));
        
        return estimatedHeight;
    },
    
    /**
     * Calculate basic volume without any calibration
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
     * Calculate stereo volume using both cameras with 3D calibration
     * @param {Object} stats - Statistics object
     * @returns {number} Stereo volume estimate
     */
    calculateStereoVolume(stats) {
        if (!window.CalibrationManager) return 0;
        
        const has3DCalib1 = window.CalibrationManager.has3DCalibration(1);
        const has3DCalib2 = window.CalibrationManager.has3DCalibration(2);
        
        if (!has3DCalib1 || !has3DCalib2 || !stats.camera1 || !stats.camera2) {
            return this.calculateVolume(stats); // Fall back to single camera method
        }
        
        const calib1 = window.CalibrationManager.getCalibrationData(1);
        const calib2 = window.CalibrationManager.getCalibrationData(2);
        
        // Calculate volume using stereo triangulation principles
        const volume1 = this.calculate3DCameraVolume(stats.camera1, calib1, 1);
        const volume2 = this.calculate3DCameraVolume(stats.camera2, calib2, 2);
        
        // Weight the estimates based on calibration quality
        const calib3D1 = window.CalibrationManager.get3DCalibrationData(1);
        const calib3D2 = window.CalibrationManager.get3DCalibrationData(2);
        
        let weight1 = 0.5; // Default equal weighting
        let weight2 = 0.5;
        
        if (calib3D1 && calib3D2) {
            // Adjust weights based on calibration quality
            const quality1 = this.getQualityScore(calib3D1.calibrationQuality);
            const quality2 = this.getQualityScore(calib3D2.calibrationQuality);
            const totalQuality = quality1 + quality2;
            
            if (totalQuality > 0) {
                weight1 = quality1 / totalQuality;
                weight2 = quality2 / totalQuality;
            }
        }
        
        const weightedVolume = (volume1 * weight1) + (volume2 * weight2);
        
        return weightedVolume;
    },
    
    /**
     * Convert calibration quality to numeric score
     * @param {Object} qualityData - Calibration quality data
     * @returns {number} Quality score (0-1)
     */
    getQualityScore(qualityData) {
        if (!qualityData) return 0.5; // Default score
        
        const qualityMap = {
            'excellent': 1.0,
            'good': 0.8,
            'fair': 0.6,
            'poor': 0.3
        };
        
        return qualityMap[qualityData.quality] || 0.5;
    },
    
    /**
     * Apply volume corrections based on detection confidence and geometry
     * @param {number} rawVolume - Raw volume estimate
     * @param {Object} stats - Detection statistics
     * @param {Object} options - Correction options
     * @returns {number} Corrected volume estimate
     */
    applyVolumeCorrections(rawVolume, stats, options = {}) {
        let correctedVolume = rawVolume;
        
        // Apply detection confidence correction
        const totalObjects = (stats.camera1?.objects || 0) + (stats.camera2?.objects || 0);
        const confidenceCorrection = this.calculateConfidenceCorrection(totalObjects);
        correctedVolume *= confidenceCorrection;
        
        // Apply truck type correction if specified
        if (options.truckType) {
            const truckCorrection = this.getTruckTypeCorrection(options.truckType);
            correctedVolume *= truckCorrection;
        }
        
        // Apply material density correction if specified
        if (options.materialDensity) {
            correctedVolume *= options.materialDensity;
        }
        
        return correctedVolume;
    },
    
    /**
     * Calculate confidence correction factor based on detection quality
     * @param {number} totalObjects - Total number of detected objects
     * @returns {number} Confidence correction factor
     */
    calculateConfidenceCorrection(totalObjects) {
        // More detected objects = higher confidence = less correction needed
        if (totalObjects >= 20) return 1.0;       // High confidence
        if (totalObjects >= 10) return 0.95;     // Good confidence
        if (totalObjects >= 5) return 0.9;       // Moderate confidence
        if (totalObjects >= 2) return 0.8;       // Low confidence
        return 0.7;                               // Very low confidence
    },
    
    /**
     * Get truck type correction factor
     * @param {string} truckType - Type of truck
     * @returns {number} Correction factor
     */
    getTruckTypeCorrection(truckType) {
        const corrections = {
            'flatbed': 0.95,      // Slightly lower due to edge constraints
            'dump': 1.05,         // Slightly higher due to sloped sides
            'container': 1.0,     // Standard container
            'pickup': 0.9,        // Smaller truck bed
            'standard': 1.0       // Default
        };
        
        return corrections[truckType] || 1.0;
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
     * Get comprehensive volume confidence assessment
     * @param {Object} stats - Statistics object
     * @returns {Object} Confidence assessment
     */
    getVolumeConfidence(stats) {
        if (!window.CalibrationManager) {
            return { overall: 0, method: 'no calibration', level: 'very low' };
        }
        
        const has3DCalib1 = window.CalibrationManager.has3DCalibration(1);
        const has3DCalib2 = window.CalibrationManager.has3DCalibration(2);
        const hasBasicCalib1 = window.CalibrationManager.hasBasicCalibration(1);
        const hasBasicCalib2 = window.CalibrationManager.hasBasicCalibration(2);
        
        let confidence = {
            overall: 0,
            method: 'none',
            level: 'very low',
            factors: {
                calibration: 0,
                detection: 0,
                geometry: 0,
                consistency: 0
            },
            recommendations: []
        };
        
        // Determine calibration method and base confidence
        if (has3DCalib1 && has3DCalib2) {
            confidence.method = 'stereo_3d';
            confidence.factors.calibration = 1.0;
        } else if (has3DCalib1 || has3DCalib2) {
            confidence.method = 'single_3d';
            confidence.factors.calibration = 0.8;
        } else if (hasBasicCalib1 && hasBasicCalib2) {
            confidence.method = 'stereo_2d';
            confidence.factors.calibration = 0.6;
        } else if (hasBasicCalib1 || hasBasicCalib2) {
            confidence.method = 'single_2d';
            confidence.factors.calibration = 0.4;
        } else {
            confidence.method = 'uncalibrated';
            confidence.factors.calibration = 0.1;
            confidence.recommendations.push('Perform 3D calibration for accurate volume measurements');
        }
        
        // Assess detection quality
        const totalObjects = (stats.camera1?.objects || 0) + (stats.camera2?.objects || 0);
        const totalArea = (stats.camera1?.total_area || 0) + (stats.camera2?.total_area || 0);
        
        if (totalObjects >= 15) {
            confidence.factors.detection = 1.0;
        } else if (totalObjects >= 8) {
            confidence.factors.detection = 0.8;
        } else if (totalObjects >= 3) {
            confidence.factors.detection = 0.6;
        } else {
            confidence.factors.detection = 0.3;
            confidence.recommendations.push('Ensure adequate lighting and clear view of load');
        }
        
        // Assess geometry quality for 3D calibrations
        if (has3DCalib1 || has3DCalib2) {
            let geometryScore = 0;
            let calibCount = 0;
            
            if (has3DCalib1) {
                const calib3D1 = window.CalibrationManager.get3DCalibrationData(1);
                geometryScore += this.getQualityScore(calib3D1?.calibrationQuality);
                calibCount++;
            }
            
            if (has3DCalib2) {
                const calib3D2 = window.CalibrationManager.get3DCalibrationData(2);
                geometryScore += this.getQualityScore(calib3D2?.calibrationQuality);
                calibCount++;
            }
            
            confidence.factors.geometry = calibCount > 0 ? geometryScore / calibCount : 0;
            
            if (confidence.factors.geometry < 0.6) {
                confidence.recommendations.push('Check camera positioning and distance measurements for better geometry');
            }
        } else {
            confidence.factors.geometry = 0.5; // Default for 2D calibrations
        }
        
        // Assess consistency between cameras
        if ((hasBasicCalib1 || has3DCalib1) && (hasBasicCalib2 || has3DCalib2) && 
            stats.camera1 && stats.camera2) {
            
            const calib1 = window.CalibrationManager.getCalibrationData(1);
            const calib2 = window.CalibrationManager.getCalibrationData(2);
            
            const vol1 = has3DCalib1 ? 
                this.calculate3DCameraVolume(stats.camera1, calib1, 1) :
                this.calculateBasic2DCameraVolume(stats.camera1, calib1, 1);
            const vol2 = has3DCalib2 ? 
                this.calculate3DCameraVolume(stats.camera2, calib2, 2) :
                this.calculateBasic2DCameraVolume(stats.camera2, calib2, 2);
            
            const avgVol = (vol1 + vol2) / 2;
            const difference = Math.abs(vol1 - vol2);
            const consistency = avgVol > 0 ? Math.max(0, 1 - (difference / avgVol)) : 0;
            
            confidence.factors.consistency = consistency;
            
            if (consistency < 0.7) {
                confidence.recommendations.push('Large difference between camera estimates - verify calibrations');
            }
        } else {
            confidence.factors.consistency = (hasBasicCalib1 || has3DCalib1 || hasBasicCalib2 || has3DCalib2) ? 0.5 : 0;
        }
        
        // Calculate overall confidence
        confidence.overall = (
            confidence.factors.calibration * 0.4 +
            confidence.factors.detection * 0.25 +
            confidence.factors.geometry * 0.2 +
            confidence.factors.consistency * 0.15
        );
        
        // Determine confidence level
        if (confidence.overall >= 0.8) {
            confidence.level = 'high';
        } else if (confidence.overall >= 0.6) {
            confidence.level = 'good';
        } else if (confidence.overall >= 0.4) {
            confidence.level = 'moderate';
        } else if (confidence.overall >= 0.2) {
            confidence.level = 'low';
        } else {
            confidence.level = 'very low';
        }
        
        return confidence;
    },
    
    /**
     * Format volume for display with multiple units
     * @param {number} volume - Volume in cubic meters
     * @param {string} primaryUnit - Primary unit for display
     * @returns {Object} Formatted volume data
     */
    formatVolume(volume, primaryUnit = 'm3') {
        const conversions = {
            'm3': { factor: 1, symbol: 'm³', name: 'cubic meters', precision: 2 },
            'ft3': { factor: 35.3147, symbol: 'ft³', name: 'cubic feet', precision: 1 },
            'liters': { factor: 1000, symbol: 'L', name: 'liters', precision: 0 },
            'gallons': { factor: 264.172, symbol: 'gal', name: 'gallons (US)', precision: 1 },
            'yards3': { factor: 1.30795, symbol: 'yd³', name: 'cubic yards', precision: 2 }
        };
        
        const formatNumber = window.Utils ? window.Utils.formatNumber : (num => num.toFixed(2));
        const result = {};
        
        Object.keys(conversions).forEach(unit => {
            const conv = conversions[unit];
            const convertedValue = volume * conv.factor;
            result[unit] = {
                value: convertedValue,
                formatted: formatNumber(convertedValue, conv.precision),
                symbol: conv.symbol,
                name: conv.name,
                display: `${formatNumber(convertedValue, conv.precision)} ${conv.symbol}`
            };
        });
        
        result.primary = result[primaryUnit] || result.m3;
        
        return result;
    },
    
    /**
     * Get volume estimation method description
     * @returns {string} Description of current estimation method
     */
    getEstimationMethod() {
        if (!window.CalibrationManager) {
            return 'Basic estimation (no calibration)';
        }
        
        const has3DCalib1 = window.CalibrationManager.has3DCalibration(1);
        const has3DCalib2 = window.CalibrationManager.has3DCalibration(2);
        const hasBasicCalib1 = window.CalibrationManager.hasBasicCalibration(1);
        const hasBasicCalib2 = window.CalibrationManager.hasBasicCalibration(2);
        
        if (has3DCalib1 && has3DCalib2) {
            return '3D Stereo estimation (both cameras with height & distance data)';
        } else if (has3DCalib1 || has3DCalib2) {
            return '3D Single camera estimation (height & distance data)';
        } else if (hasBasicCalib1 && hasBasicCalib2) {
            return '2D Stereo estimation (both cameras with area calibration)';
        } else if (hasBasicCalib1 || hasBasicCalib2) {
            return '2D Single camera estimation (area calibration only)';
        } else {
            return 'Basic estimation (no calibration - inaccurate)';
        }
    },
    
    /**
     * Export volume calculation report
     * @param {Object} stats - Current statistics
     * @returns {Object} Comprehensive volume report
     */
    generateVolumeReport(stats) {
        const volume = this.calculateVolume(stats);
        const confidence = this.getVolumeConfidence(stats);
        const formattedVolume = this.formatVolume(volume);
        const method = this.getEstimationMethod();
        
        const report = {
            timestamp: new Date().toISOString(),
            volume: {
                cubic_meters: volume,
                formatted: formattedVolume,
                estimation_method: method
            },
            confidence: confidence,
            statistics: {
                camera1: stats.camera1 || null,
                camera2: stats.camera2 || null,
                total_objects: (stats.camera1?.objects || 0) + (stats.camera2?.objects || 0),
                total_area_pixels: (stats.camera1?.total_area || 0) + (stats.camera2?.total_area || 0)
            },
            calibration: window.CalibrationManager ? 
                window.CalibrationManager.getCalibrationSummary() : 
                { error: 'CalibrationManager not available' }
        };
        
        return report;
    },
    
    /**
     * Debug volume calculations
     * @param {Object} stats - Current statistics
     */
    debugVolumeCalculation(stats) {
        console.log('=== VOLUME CALCULATION DEBUG ===');
        
        const report = this.generateVolumeReport(stats);
        console.log('Volume Report:', report);
        
        const method = this.getEstimationMethod();
        console.log('Estimation Method:', method);
        
        const confidence = this.getVolumeConfidence(stats);
        console.log('Confidence Assessment:', confidence);
        
        if (window.CalibrationManager) {
            const summary = window.CalibrationManager.getCalibrationSummary();
            console.log('Calibration Summary:', summary);
            
            // Test different methods if calibration is available
            for (let cameraId = 1; cameraId <= 2; cameraId++) {
                const calibData = window.CalibrationManager.getCalibrationData(cameraId);
                const cameraStats = stats[`camera${cameraId}`];
                
                if (cameraStats) {
                    if (window.CalibrationManager.has3DCalibration(cameraId)) {
                        const vol3D = this.calculate3DCameraVolume(cameraStats, calibData, cameraId);
                        console.log(`Camera ${cameraId} 3D Volume:`, vol3D);
                    }
                    
                    if (window.CalibrationManager.hasBasicCalibration(cameraId)) {
                        const vol2D = this.calculateBasic2DCameraVolume(cameraStats, calibData, cameraId);
                        console.log(`Camera ${cameraId} 2D Volume:`, vol2D);
                    }
                }
            }
        }
        
        console.log('=== END VOLUME DEBUG ===');
        
        return report;
    }
};
