/**
 * Configuration constants for the Dual Camera YOLO application
 */

window.CONFIG = {
    // API endpoints
    API: {
        STATS: '/api/stats',
        PAUSE: '/api/pause',
        RESUME: '/api/resume',
        START: '/api/start',
        STOP: '/api/stop',
        STATUS: '/api/status'
    },
    
    // Video feed URLs
    VIDEO_FEED: {
        CAMERA_1: '/video_feed/1',
        CAMERA_2: '/video_feed/2'
    },
    
    // Timing configurations
    TIMING: {
        STATS_UPDATE_INTERVAL: 500,        // ms - how often to update stats
        CONNECTION_CHECK_INTERVAL: 2000,   // ms - how often to check connection
        CANVAS_RESIZE_DELAY: 100,         // ms - delay for canvas resize
        CALIBRATION_REDRAW_DELAY: 1000,   // ms - delay for redraw after stream refresh
        STREAM_REFRESH_DELAY: 1000,       // ms - delay for calibration redraw after refresh
        NOTIFICATION_DURATION: 3000,      // ms - default notification display time
        CALIBRATION_NOTIFICATION_DURATION: 4000, // ms - calibration notification duration
        CAMERA_ERROR_RETRY_DELAY: 2000,   // ms - delay before retrying camera on error
        PAUSED_FRAME_RATE: 30            // FPS when paused (1000/30 ≈ 33ms)
    },
    
    // Calibration settings
    CALIBRATION: {
        REQUIRED_POINTS: 4,               // Number of points required for calibration
        POINT_RADIUS: 8,                  // Radius for drawing calibration points
        LINE_WIDTH: 3,                    // Width for drawing calibration lines
        FILL_OPACITY: 0.3,               // Opacity for filled calibration area
        STORAGE_KEY: 'truckVolumeCalibration' // LocalStorage key for calibration data
    },
    
    // Volume estimation settings
    VOLUME: {
        MAX_TRUCK_HEIGHT: 2.5,           // meters - maximum estimated truck height
        MIN_TRUCK_HEIGHT: 0.1,           // meters - minimum estimated truck height
        BASIC_SCALE_FACTOR: 0.01         // scale factor for uncalibrated volume estimation
    },
    
    // UI settings
    UI: {
        JPEG_QUALITY: 85,                // JPEG encoding quality for video frames
        LOG_STATS_INTERVAL: 10.0,        // seconds - how often to log stats for debugging
        PERFORMANCE_LOG_INTERVAL: 100,   // updates - how often to log performance stats
        MAX_NOTIFICATION_WIDTH: '90%'    // maximum width for notifications
    },
    
    // Colors for UI elements
    COLORS: {
        POINT_COLOR: '#ff6b6b',          // Color for calibration points
        LINE_COLOR: '#4ecdc4',           // Color for calibration lines
        FILL_COLOR: 'rgba(255, 0, 0, 0.3)', // Color for filled calibration area
        TEXT_OUTLINE: 'black',           // Color for text outlines
        TEXT_FILL: 'white'               // Color for text fill
    }
};
