/**
 * Main application entry point for the Dual Camera YOLO application
 */

// Global manager instances
let calibrationManager;
let processingManager;
let statsManager;
let volumeCalculator;
let uiManager;

// Application state
const AppState = {
    initialized: false,
    version: '2.0.0'
};

/**
 * Initialize the entire application
 */
function initializeApp() {
    console.log(`Initializing Dual Camera YOLO interface v${AppState.version}...`);
    
    try {
        // Initialize all managers in the correct order using global window objects
        calibrationManager = window.CalibrationManager;
        processingManager = window.ProcessingManager;
        statsManager = window.StatsManager;
        volumeCalculator = window.VolumeCalculator;
        uiManager = window.UIManager;
        
        // Check if all managers are available
        if (!calibrationManager || !processingManager || !statsManager || !volumeCalculator || !uiManager) {
            throw new Error('One or more managers not found. Check that all JavaScript files are loaded.');
        }
        
        // Initialize each manager
        uiManager.init();
        calibrationManager.init();
        processingManager.init();
        statsManager.init();
        
        // Set up global debug functions
        setupDebugFunctions();
        
        AppState.initialized = true;
        
        console.log('Application initialized successfully');
        console.log('Available debug functions: debugStats(), debugCalibration(), exportCalibration(), importCalibration(), resetCalibration(), forceRedrawCalibrations()');
        console.log('Keyboard shortcuts: R (refresh), S (toggle stats), Ctrl+C (clear calibrations), Escape (cancel calibration), H (help)');
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
        if (window.Utils) {
            window.Utils.showNotification('Failed to initialize application', 'error');
        } else {
            alert('Failed to initialize application: ' + error.message);
        }
    }
}

/**
 * Setup global debug functions for console access
 */
function setupDebugFunctions() {
    // Make debug functions globally accessible
    window.debugStats = async () => {
        try {
            const stats = await statsManager.debugStats();
            return stats;
        } catch (error) {
            console.error('Debug stats failed:', error);
        }
    };
    
    window.debugCalibration = () => {
        console.log('Current calibration data:', calibrationManager.calibrationData);
        console.log('Calibration status:', {
            camera1: {
                isCalibrating: calibrationManager.calibrationData.camera1.isCalibrating,
                hasPoints: calibrationManager.calibrationData.camera1.points.length,
                isCalibrated: calibrationManager.isCalibrated(1)
            },
            camera2: {
                isCalibrating: calibrationManager.calibrationData.camera2.isCalibrating,
                hasPoints: calibrationManager.calibrationData.camera2.points.length,
                isCalibrated: calibrationManager.isCalibrated(2)
            },
            pausedForCalibration: processingManager.isPausedForCalibration()
        });
    };
    
    window.exportCalibration = () => {
        calibrationManager.exportCalibration();
    };
    
    window.importCalibration = () => {
        calibrationManager.importCalibration();
    };
    
    window.resetCalibration = () => {
        calibrationManager.resetCalibration();
    };
    
    window.forceRedrawCalibrations = () => {
        if (calibrationManager) {
            calibrationManager.forceRedrawCalibrations();
        }
    };
    
    window.getAppStatus = () => {
        return {
            version: AppState.version,
            initialized: AppState.initialized,
            processing: processingManager.isActive(),
            calibrating: calibrationManager.isAnyCalibrating(),
            pausedForCalibration: processingManager.isPausedForCalibration(),
            performance: statsManager.getPerformanceStats()
        };
    };
    
    window.startProcessing = async (config) => {
        try {
            return await processingManager.startProcessingAPI(config);
        } catch (error) {
            console.error('Failed to start processing:', error);
        }
    };
    
    window.stopProcessing = async () => {
        try {
            return await processingManager.stopProcessingAPI();
        } catch (error) {
            console.error('Failed to stop processing:', error);
        }
    };
    
    // Make manager instances globally accessible for debugging
    window.managers = {
        calibration: calibrationManager,
        processing: processingManager,
        stats: statsManager,
        volume: volumeCalculator,
        ui: uiManager
    };
}

/**
 * Handle application errors globally
 */
function setupErrorHandling() {
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        if (window.Utils) {
            window.Utils.showNotification('An error occurred. Check console for details.', 'error');
        }
    });
    
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        if (window.Utils) {
            window.Utils.showNotification('An error occurred. Check console for details.', 'error');
        }
        event.preventDefault();
    });
}

/**
 * Application startup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, starting application...');
    
    // Setup error handling first
    setupErrorHandling();
    
    // Initialize the application
    initializeApp();
    
    // Final setup message
    if (window.Utils) {
        window.Utils.showNotification('Application ready! Click Calibrate to begin setup.', 'info');
    }
});

/**
 * Export for use in HTML onclick handlers
 */
window.startCalibration = (cameraId) => {
    if (window.CalibrationManager) {
        window.CalibrationManager.startCalibration(cameraId);
    }
};

window.resizeCanvas = (cameraId) => {
    if (window.CalibrationManager) {
        window.CalibrationManager.resizeCanvas(cameraId);
    }
};

// Log final loading message
console.log('Dual Camera YOLO interface with modular architecture loaded successfully');
console.log('Features: 4-point calibration, backend pause/resume, complete processing stop during calibration');
console.log('Architecture: Modular JavaScript with separate files for calibration, processing, stats, volume, and UI management');
