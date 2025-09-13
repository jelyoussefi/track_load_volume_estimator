/**
 * Utility functions for the Dual Camera YOLO application
 */

window.Utils = {
    
    /**
     * Show a notification to the user
     * @param {string} message - The message to display
     * @param {string} type - The notification type ('info', 'success', 'error')
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '15px 25px',
            borderRadius: '25px',
            color: 'white',
            fontWeight: '600',
            zIndex: '3000',
            maxWidth: window.CONFIG ? window.CONFIG.UI.MAX_NOTIFICATION_WIDTH : '90%',
            textAlign: 'center',
            fontSize: '14px',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)'
        });
        
        // Set background color based on type
        switch (type) {
            case 'success':
                notification.style.background = 'linear-gradient(45deg, #4ecdc4, #44a08d)';
                break;
            case 'error':
                notification.style.background = 'linear-gradient(45deg, #ff6b6b, #ee5a6f)';
                break;
            default:
                notification.style.background = 'linear-gradient(45deg, #667eea, #764ba2)';
        }
        
        // Add to document
        document.body.appendChild(notification);
        
        // Remove after appropriate duration
        const duration = type === 'info' && message.includes('Calibration') ? 
            (window.CONFIG ? window.CONFIG.TIMING.CALIBRATION_NOTIFICATION_DURATION : 4000) : 
            (window.CONFIG ? window.CONFIG.TIMING.NOTIFICATION_DURATION : 3000);
            
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(-50%) translateY(-20px)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, duration);
    },
    
    /**
     * Calculate the area of a polygon given its points
     * @param {Array} points - Array of {x, y} points
     * @returns {number} - The area of the polygon
     */
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
    
    /**
     * Refresh camera streams with timestamp to prevent caching
     */
    refreshCameraStreams() {
        const timestamp = new Date().getTime();
        const camera1 = document.getElementById('camera1');
        const camera2 = document.getElementById('camera2');
        
        const config = window.CONFIG || { VIDEO_FEED: { CAMERA_1: '/video_feed/1', CAMERA_2: '/video_feed/2' } };
        
        if (camera1) {
            camera1.src = `${config.VIDEO_FEED.CAMERA_1}?t=${timestamp}`;
            console.log('Refreshed camera 1 stream');
        }
        if (camera2) {
            camera2.src = `${config.VIDEO_FEED.CAMERA_2}?t=${timestamp}`;
            console.log('Refreshed camera 2 stream');
        }
    },
    
    /**
     * Make an API call with error handling
     * @param {string} url - The API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise} - Promise that resolves to response data or rejects with error
     */
    async apiCall(url, options = {}) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API call failed for ${url}:`, error);
            throw error;
        }
    },
    
    /**
     * Debounce function to limit how often a function can be called
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} - Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    /**
     * Throttle function to limit how often a function can be called
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} - Throttled function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} - Cloned object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },
    
    /**
     * Validate that a value is a valid positive number
     * @param {any} value - Value to validate
     * @returns {boolean} - True if valid positive number
     */
    isValidPositiveNumber(value) {
        const num = parseFloat(value);
        return !isNaN(num) && num > 0;
    },
    
    /**
     * Format a number to a specific number of decimal places
     * @param {number} num - Number to format
     * @param {number} decimals - Number of decimal places
     * @returns {string} - Formatted number string
     */
    formatNumber(num, decimals = 2) {
        if (typeof num !== 'number' || isNaN(num)) {
            return '0.00';
        }
        return num.toFixed(decimals);
    },
    
    /**
     * Handle camera error with retry logic
     * @param {number} cameraId - Camera ID (1 or 2)
     */
    handleCameraError(cameraId) {
        console.warn(`Camera ${cameraId} stream error - retrying...`);
        
        const retryDelay = window.CONFIG ? window.CONFIG.TIMING.CAMERA_ERROR_RETRY_DELAY : 2000;
        const config = window.CONFIG || { VIDEO_FEED: { CAMERA_1: '/video_feed/1', CAMERA_2: '/video_feed/2' } };
        
        setTimeout(() => {
            const img = document.getElementById(`camera${cameraId}`);
            if (img) {
                const timestamp = new Date().getTime();
                const feedUrl = cameraId === 1 ? config.VIDEO_FEED.CAMERA_1 : config.VIDEO_FEED.CAMERA_2;
                img.src = `${feedUrl}?t=${timestamp}`;
            }
        }, retryDelay);
    },
    
    /**
     * Clear a queue while handling potential exceptions
     * @param {Queue} queue - Queue to clear (with .empty() and .get_nowait() methods)
     */
    clearQueue(queue) {
        while (!queue.empty()) {
            try {
                queue.get_nowait();
            } catch (e) {
                // Empty exception, continue
                break;
            }
        }
    },
    
    /**
     * Get element by ID with error handling
     * @param {string} id - Element ID
     * @returns {Element|null} - Element or null if not found
     */
    getElementById(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element with ID '${id}' not found`);
        }
        return element;
    },
    
    /**
     * Safe element text update
     * @param {string} id - Element ID
     * @param {string} text - Text to set
     */
    updateElementText(id, text) {
        const element = this.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    },
    
    /**
     * Toggle element class safely
     * @param {string} id - Element ID
     * @param {string} className - Class name to toggle
     * @param {boolean} force - Force add/remove
     */
    toggleElementClass(id, className, force = undefined) {
        const element = this.getElementById(id);
        if (element) {
            if (force !== undefined) {
                element.classList.toggle(className, force);
            } else {
                element.classList.toggle(className);
            }
        }
    }
};