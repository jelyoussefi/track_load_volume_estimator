/**
 * UI management for the Dual Camera YOLO application
 */

window.UIManager = {
    
    /**
     * Initialize UI manager
     */
    init() {
        this.setupKeyboardShortcuts();
        this.setupFloatingButtons();
        this.setupPageEventHandlers();
        this.updateStatus(false); // Start with offline status
        console.log('UI manager initialized');
    },
    
    /**
     * Update status indicator
     * @param {boolean} online - Whether the system is online
     */
    updateStatus(online) {
        const indicator = window.Utils ? 
            window.Utils.getElementById('statusIndicator') : 
            document.getElementById('statusIndicator');
        const statusText = window.Utils ? 
            window.Utils.getElementById('statusText') : 
            document.getElementById('statusText');
        
        if (indicator && statusText) {
            if (online) {
                indicator.className = 'status-indicator status-online';
                const isPaused = window.ProcessingManager && window.ProcessingManager.isPausedForCalibration();
                statusText.textContent = isPaused ? 'Calibrating' : 'Online';
            } else {
                indicator.className = 'status-indicator status-offline';
                statusText.textContent = 'Offline';
            }
        }
    },
    
    /**
     * Show loading overlay
     */
    showLoading() {
        const overlay = window.Utils ? 
            window.Utils.getElementById('loadingOverlay') : 
            document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    },
    
    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = window.Utils ? 
            window.Utils.getElementById('loadingOverlay') : 
            document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // R key to refresh streams
            if (event.key === 'r' || event.key === 'R') {
                event.preventDefault();
                if (window.ProcessingManager && window.ProcessingManager.isActive()) {
                    window.ProcessingManager.refreshStreams();
                }
            }
            
            // S key to toggle status info
            if (event.key === 's' || event.key === 'S') {
                event.preventDefault();
                if (window.StatsManager) {
                    window.StatsManager.toggleVisibility();
                }
            }
            
            // C key to clear all calibrations
            if (event.key === 'c' || event.key === 'C') {
                event.preventDefault();
                if (event.ctrlKey || event.metaKey) {
                    if (window.CalibrationManager) {
                        window.CalibrationManager.resetCalibration();
                    }
                }
            }
            
            // Escape key to cancel calibration
            if (event.key === 'Escape') {
                event.preventDefault();
                if (window.CalibrationManager) {
                    window.CalibrationManager.cancelActiveCalibrations();
                }
            }
            
            // H key to show help
            if (event.key === 'h' || event.key === 'H') {
                event.preventDefault();
                this.showHelp();
            }
        });
    },
    
    /**
     * Setup floating buttons (help, refresh, etc.)
     */
    setupFloatingButtons() {
        this.addHelpButton();
        this.addRefreshButton();
    },
    
    /**
     * Add floating help button
     */
    addHelpButton() {
        const helpButton = document.createElement('button');
        helpButton.innerHTML = '?';
        helpButton.onclick = () => this.showHelp();
        helpButton.title = 'Show Help (H)';
        
        Object.assign(helpButton.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            border: 'none',
            background: 'linear-gradient(45deg, #ffecd2, #fcb69f)',
            color: '#333',
            fontSize: '20px',
            cursor: 'pointer',
            zIndex: '1000',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease'
        });
        
        helpButton.addEventListener('mouseenter', () => {
            helpButton.style.transform = 'translateY(-2px)';
            helpButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
        });
        
        helpButton.addEventListener('mouseleave', () => {
            helpButton.style.transform = 'translateY(0)';
            helpButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
        });
        
        document.body.appendChild(helpButton);
    },
    
    /**
     * Add floating refresh button
     */
    addRefreshButton() {
        const refreshButton = document.createElement('button');
        refreshButton.innerHTML = '↻';
        refreshButton.onclick = () => {
            console.log('Manual refresh triggered');
            if (window.ProcessingManager && window.ProcessingManager.isActive()) {
                if (window.StatsManager) {
                    window.StatsManager.updateStats();
                }
                window.ProcessingManager.refreshStreams();
                if (window.Utils) {
                    window.Utils.showNotification('Manual refresh completed', 'info');
                }
            } else {
                if (window.ProcessingManager) {
                    window.ProcessingManager.checkForProcessing();
                }
                if (window.Utils) {
                    window.Utils.showNotification('Checking for processing...', 'info');
                }
            }
        };
        refreshButton.title = 'Manual Refresh (R)';
        
        Object.assign(refreshButton.style, {
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            border: 'none',
            background: 'linear-gradient(45deg, #4ecdc4, #44a08d)',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            zIndex: '1000',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease'
        });
        
        refreshButton.addEventListener('mouseenter', () => {
            refreshButton.style.transform = 'translateY(-2px)';
        });
        
        refreshButton.addEventListener('mouseleave', () => {
            refreshButton.style.transform = 'translateY(0)';
        });
        
        document.body.appendChild(refreshButton);
    },
    
    /**
     * Setup page event handlers
     */
    setupPageEventHandlers() {
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && window.ProcessingManager && window.ProcessingManager.isActive()) {
                // Page became visible, refresh streams and redraw calibrations
                console.log('Page became visible, refreshing streams');
                setTimeout(() => {
                    window.ProcessingManager.refreshStreams();
                }, 1000);
            }
        });
        
        // Handle window focus
        window.addEventListener('focus', () => {
            if (window.ProcessingManager && window.ProcessingManager.isActive()) {
                // Window gained focus, refresh streams
                console.log('Window gained focus, refreshing streams');
                setTimeout(() => {
                    window.ProcessingManager.refreshStreams();
                }, 1000);
            }
        });
        
        // Handle window resize
        const resizeHandler = window.Utils ? 
            window.Utils.debounce(() => {
                // Resize canvases when window is resized
                if (window.CalibrationManager) {
                    window.CalibrationManager.resizeCanvas(1);
                    window.CalibrationManager.resizeCanvas(2);
                }
            }, 100) :
            () => {
                if (window.CalibrationManager) {
                    window.CalibrationManager.resizeCanvas(1);
                    window.CalibrationManager.resizeCanvas(2);
                }
            };
            
        window.addEventListener('resize', resizeHandler);
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (window.ProcessingManager) {
                window.ProcessingManager.cleanup();
            }
            if (window.CalibrationManager) {
                window.CalibrationManager.saveCalibrationData();
                window.CalibrationManager.cancelActiveCalibrations();
            }
        });
    },
    
    /**
     * Show help dialog
     */
    showHelp() {
        const helpText = `Help & Tips:

Camera Display:
• View real-time streams from both cameras with YOLO segmentation
• Blue bounding boxes show detected brick objects
• Colored masks overlay the segmented areas

Calibration:
• Click "Calibrate" to define measurement area on each camera
• Video processing stops completely during calibration
• Click exactly 4 corners to create a calibration rectangle
• Rectangle automatically closes and fills with red after 4th point
• Dimension collection starts automatically after 4th point
• Enter real-world dimensions in meters for each side
• This enables accurate volume calculations

Statistics:
• FPS: Frames per second for each camera
• Objects: Number of bricks detected in current frame
• Area: Total segmented area (pixels or m² if calibrated)

Volume Estimation:
• Uses calibrated areas from both cameras for accuracy
• Requires calibration for meaningful measurements
• Estimates height based on coverage ratio

Keyboard Shortcuts:
• R: Refresh camera streams
• S: Toggle statistics visibility
• Ctrl+C: Clear all calibrations
• Escape: Cancel active calibration
• H: Show this help dialog

For best results:
• Ensure good lighting conditions
• Position cameras to capture truck load area
• Calibrate using rectangular reference objects (truck bed corners)
• Click corners in clockwise or counter-clockwise order

Configuration:
• Processing parameters are set via Flask server startup
• Calibration data is saved automatically
• Use command line arguments when starting the server

Troubleshooting:
• Check browser console (F12) for error messages
• Verify Flask server is running on localhost:5000
• Use refresh button to manually update
• Recalibrate if volume estimates seem incorrect
• Ensure cameras have clear view of the truck load`;

        alert(helpText);
    },
    
    /**
     * Create a modal dialog
     * @param {string} title - Modal title
     * @param {string} content - Modal content
     * @param {Array} buttons - Array of button objects {text, onclick, class}
     */
    createModal(title, content, buttons = []) {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '4000'
        });
        
        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        Object.assign(modal.style, {
            background: 'linear-gradient(135deg, #1e3c72, #2a5298)',
            color: 'white',
            padding: '30px',
            borderRadius: '15px',
            maxWidth: '80%',
            maxHeight: '80%',
            overflow: 'auto',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
        });
        
        // Add title
        if (title) {
            const titleElement = document.createElement('h2');
            titleElement.textContent = title;
            titleElement.style.marginBottom = '20px';
            modal.appendChild(titleElement);
        }
        
        // Add content
        if (content) {
            const contentElement = document.createElement('div');
            contentElement.innerHTML = content;
            contentElement.style.marginBottom = '20px';
            modal.appendChild(contentElement);
        }
        
        // Add buttons
        if (buttons.length > 0) {
            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.justifyContent = 'flex-end';
            buttonContainer.style.gap = '10px';
            
            buttons.forEach(buttonConfig => {
                const button = document.createElement('button');
                button.textContent = buttonConfig.text;
                button.className = buttonConfig.class || 'btn';
                button.onclick = () => {
                    if (buttonConfig.onclick) {
                        buttonConfig.onclick();
                    }
                    document.body.removeChild(overlay);
                };
                buttonContainer.appendChild(button);
            });
            
            modal.appendChild(buttonContainer);
        }
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
        
        return overlay;
    },
    
    /**
     * Show confirmation dialog
     * @param {string} message - Confirmation message
     * @param {Function} onConfirm - Callback for confirmation
     * @param {Function} onCancel - Callback for cancellation
     */
    showConfirmation(message, onConfirm, onCancel) {
        this.createModal('Confirmation', `<p>${message}</p>`, [
            {
                text: 'Cancel',
                class: 'btn btn-secondary',
                onclick: onCancel
            },
            {
                text: 'Confirm',
                class: 'btn btn-primary',
                onclick: onConfirm
            }
        ]);
    },
    
    /**
     * Update loading state for specific elements
     * @param {string} elementId - Element ID
     * @param {boolean} loading - Loading state
     */
    updateElementLoading(elementId, loading) {
        const element = window.Utils ? 
            window.Utils.getElementById(elementId) : 
            document.getElementById(elementId);
        if (element) {
            if (loading) {
                element.style.opacity = '0.5';
                element.style.pointerEvents = 'none';
            } else {
                element.style.opacity = '1';
                element.style.pointerEvents = 'auto';
            }
        }
    }
};