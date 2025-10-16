/**
 * Enhanced 3D Volume Calculator for the Dual Camera YOLO application
 * Version: 2.1.0 - Updated to use segmentation brick_area
 */

window.VolumeCalculator = {
    
    calculateVolume(stats) {
        const calib1 = window.CalibrationManager ? 
            window.CalibrationManager.getCalibrationData(1) : 
            { pixelsPerMeter: null, cameraHeight: null };
        const calib2 = window.CalibrationManager ? 
            window.CalibrationManager.getCalibrationData(2) : 
            { pixelsPerMeter: null, cameraHeight: null };
        
        const has3DCalib1 = window.CalibrationManager ? window.CalibrationManager.has3DCalibration(1) : false;
        const has3DCalib2 = window.CalibrationManager ? window.CalibrationManager.has3DCalibration(2) : false;
        
        if (has3DCalib1 || has3DCalib2) {
            return this.calculate3DVolume(stats, calib1, calib2);
        }
        
        const hasBasicCalib1 = window.CalibrationManager ? window.CalibrationManager.hasBasicCalibration(1) : false;
        const hasBasicCalib2 = window.CalibrationManager ? window.CalibrationManager.hasBasicCalibration(2) : false;
        
        if (hasBasicCalib1 || hasBasicCalib2) {
            return this.calculateBasic2DVolume(stats, calib1, calib2);
        }
        
        return this.calculateBasicVolume(stats);
    },
    
    calculate3DVolume(stats, calib1, calib2) {
        let totalVolume = 0;
        let cameraCount = 0;
        
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
    
    calculate3DCameraVolume(cameraStats, calibData, cameraId) {
        const { cameraHeight, effectiveCameraHeight, truckBedHeight, cameraDistances, pixelsPerMeter, points } = calibData;
        const detectedAreaPixels = cameraStats.brick_area || cameraStats.total_area || 0;
        
        const heightToUse = effectiveCameraHeight !== null && effectiveCameraHeight !== undefined ? 
            effectiveCameraHeight : cameraHeight;
        
        if (!heightToUse || !cameraDistances || !pixelsPerMeter || !points || points.length !== 4) {
            return 0;
        }
        
        const calibAreaPixels = window.Utils ? 
            window.Utils.calculatePolygonArea(points) : 
            this.calculatePolygonAreaFallback(points);
        const calibAreaSquareMeters = calibAreaPixels / (pixelsPerMeter * pixelsPerMeter);
        const detectedAreaSquareMeters = detectedAreaPixels / (pixelsPerMeter * pixelsPerMeter);
        
        const avgDistance = (
            cameraDistances.C1 + 
            cameraDistances.C2 + 
            cameraDistances.C3 + 
            cameraDistances.C4
        ) / 4;
        
        const heightEstimate = this.estimate3DHeight(
            detectedAreaPixels,
            calibAreaPixels,
            heightToUse,
            avgDistance,
            pixelsPerMeter,
            truckBedHeight
        );
        
        const volume = detectedAreaSquareMeters * heightEstimate;
        return volume;
    },
    
    estimate3DHeight(detectedAreaPixels, calibAreaPixels, effectiveCameraHeight, avgDistance, pixelsPerMeter, truckBedHeight) {
        if (calibAreaPixels === 0 || detectedAreaPixels === 0) return 0;
        
        const fillRatio = Math.min(detectedAreaPixels / calibAreaPixels, 1.0);
        const maxHeight = window.CONFIG ? window.CONFIG.VOLUME.MAX_TRUCK_HEIGHT : 2.5;
        const minHeight = window.CONFIG ? window.CONFIG.VOLUME.MIN_TRUCK_HEIGHT : 0.1;
        
        const horizontalDistance = Math.sqrt(
            Math.max(0, avgDistance * avgDistance - effectiveCameraHeight * effectiveCameraHeight)
        );
        
        const viewingAngle = Math.atan2(horizontalDistance, effectiveCameraHeight);
        const angleCorrection = 1.0 + (viewingAngle / (Math.PI / 2)) * 0.3;
        
        let estimatedHeight = minHeight + (Math.sqrt(fillRatio) * (maxHeight - minHeight));
        estimatedHeight *= angleCorrection;
        
        const distanceCorrection = 1.0 + Math.max(0, (horizontalDistance - 5.0) * 0.05);
        estimatedHeight *= distanceCorrection;
        
        if (truckBedHeight && truckBedHeight > 0) {
            const heightRatio = effectiveCameraHeight / truckBedHeight;
            if (heightRatio < 2.5) {
                const steepAngleCorrection = 1.0 + (2.5 - heightRatio) * 0.1;
                estimatedHeight *= steepAngleCorrection;
            }
        }
        
        estimatedHeight = Math.max(minHeight, Math.min(maxHeight, estimatedHeight));
        return estimatedHeight;
    },
    
    calculateBasic2DVolume(stats, calib1, calib2) {
        let totalVolume = 0;
        let cameraCount = 0;
        
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
    
    calculateBasic2DCameraVolume(cameraStats, calibData, cameraId) {
        const areaPixels = cameraStats.brick_area || cameraStats.total_area || 0;
        const areaSquareMeters = areaPixels / (calibData.pixelsPerMeter * calibData.pixelsPerMeter);
        
        const calibAreaPixels = window.Utils ? 
            window.Utils.calculatePolygonArea(calibData.points) : 
            this.calculatePolygonAreaFallback(calibData.points);
        const heightEstimate = this.estimateBasicHeight(areaPixels, calibAreaPixels);
        
        const volume = areaSquareMeters * heightEstimate;
        return volume;
    },
    
    estimateBasicHeight(detectedAreaPixels, calibrationAreaPixels) {
        if (calibrationAreaPixels === 0) return 0;
        
        const fillRatio = Math.min(detectedAreaPixels / calibrationAreaPixels, 1.0);
        const maxHeight = window.CONFIG ? window.CONFIG.VOLUME.MAX_TRUCK_HEIGHT : 2.5;
        const minHeight = window.CONFIG ? window.CONFIG.VOLUME.MIN_TRUCK_HEIGHT : 0.1;
        const estimatedHeight = minHeight + (fillRatio * (maxHeight - minHeight));
        
        return estimatedHeight;
    },
    
    calculateBasicVolume(stats) {
        const area1 = stats.camera1?.brick_area || stats.camera1?.total_area || 0;
        const area2 = stats.camera2?.brick_area || stats.camera2?.total_area || 0;
        const avgArea = (area1 + area2) / 2;
        const scaleFactor = window.CONFIG ? window.CONFIG.VOLUME.BASIC_SCALE_FACTOR : 0.01;
        return avgArea * scaleFactor;
    },
    
    calculateStereoVolume(stats) {
        if (!window.CalibrationManager) return 0;
        
        const has3DCalib1 = window.CalibrationManager.has3DCalibration(1);
        const has3DCalib2 = window.CalibrationManager.has3DCalibration(2);
        
        if (!has3DCalib1 || !has3DCalib2 || !stats.camera1 || !stats.camera2) {
            return this.calculateVolume(stats);
        }
        
        const calib1 = window.CalibrationManager.getCalibrationData(1);
        const calib2 = window.CalibrationManager.getCalibrationData(2);
        
        const volume1 = this.calculate3DCameraVolume(stats.camera1, calib1, 1);
        const volume2 = this.calculate3DCameraVolume(stats.camera2, calib2, 2);
        
        const calib3D1 = window.CalibrationManager.get3DCalibrationData(1);
        const calib3D2 = window.CalibrationManager.get3DCalibrationData(2);
        
        let weight1 = 0.5;
        let weight2 = 0.5;
        
        if (calib3D1 && calib3D2) {
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
    
    getQualityScore(qualityData) {
        if (!qualityData) return 0.5;
        
        const qualityMap = {
            'excellent': 1.0,
            'good': 0.8,
            'fair': 0.6,
            'poor': 0.3
        };
        
        return qualityMap[qualityData.quality] || 0.5;
    },
    
    applyVolumeCorrections(rawVolume, stats, options = {}) {
        let correctedVolume = rawVolume;
        
        const totalObjects = (stats.camera1?.objects || 0) + (stats.camera2?.objects || 0);
        const confidenceCorrection = this.calculateConfidenceCorrection(totalObjects);
        correctedVolume *= confidenceCorrection;
        
        if (options.truckType) {
            const truckCorrection = this.getTruckTypeCorrection(options.truckType);
            correctedVolume *= truckCorrection;
        }
        
        if (options.materialDensity) {
            correctedVolume *= options.materialDensity;
        }
        
        return correctedVolume;
    },
    
    calculateConfidenceCorrection(totalObjects) {
        if (totalObjects >= 20) return 1.0;
        if (totalObjects >= 10) return 0.95;
        if (totalObjects >= 5) return 0.9;
        if (totalObjects >= 2) return 0.8;
        return 0.7;
    },
    
    getTruckTypeCorrection(truckType) {
        const corrections = {
            'flatbed': 0.95,
            'dump': 1.05,
            'container': 1.0,
            'pickup': 0.9,
            'standard': 1.0
        };
        
        return corrections[truckType] || 1.0;
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
        
        const totalObjects = (stats.camera1?.objects || 0) + (stats.camera2?.objects || 0);
        
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
            confidence.factors.geometry = 0.5;
        }
        
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
        
        confidence.overall = (
            confidence.factors.calibration * 0.4 +
            confidence.factors.detection * 0.25 +
            confidence.factors.geometry * 0.2 +
            confidence.factors.consistency * 0.15
        );
        
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
                total_area_pixels: (stats.camera1?.brick_area || stats.camera1?.total_area || 0) + 
                                  (stats.camera2?.brick_area || stats.camera2?.total_area || 0)
            },
            calibration: window.CalibrationManager ? 
                window.CalibrationManager.getCalibrationSummary() : 
                { error: 'CalibrationManager not available' }
        };
        
        return report;
    }
};
