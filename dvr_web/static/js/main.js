// Main JavaScript file that imports all modules

// This is the main entry point for all JavaScript functionality
document.addEventListener('DOMContentLoaded', () => {
    console.log('mDVR Web Interface loaded');
    
    // Initialize grid layout if we're on the home tab
    if (document.getElementById('dashboard-grid')) {
        // GridLayout initialization is handled in grid-layout.js
        console.log('Dashboard grid layout initialized');
    }
}); 