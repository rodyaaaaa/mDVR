// Camera management functionality

let cameraPorts = {};
let camCounter = document.querySelectorAll('#cam-fields .cam-field').length;

// Camera port and view functions
function extractCameraIp(rtspUrl) {
    const match = rtspUrl.match(/@([\d.]+)(:|$|\/)/);
    return match ? match[1] : null;
}

function updateViewButtons() {
    const camFields = document.querySelectorAll('#cam-fields .cam-field');
    camFields.forEach(field => {
        const input = field.querySelector('input');
        const viewButton = field.querySelector('.view-cam');
        const camIp = extractCameraIp(input.value);

        if (camIp && cameraPorts[camIp]) {
            viewButton.style.display = 'inline-block';
        } else {
            viewButton.style.display = 'none';
        }
    });
}

function updateCameraPorts() {
    fetch('/get-camera-ports')
        .then(response => response.json())
        .then(data => {
            cameraPorts = data;
            updateViewButtons();
        })
        .catch(error => console.error('Error fetching camera ports:', error));
}

function viewCamera(button) {
    const field = button.closest('.cam-field');
    const input = field.querySelector('input');
    const camIp = extractCameraIp(input.value);

    if (camIp && cameraPorts[camIp]) {
        const port = cameraPorts[camIp];
        const vpnIp = window.location.hostname;
        window.open(`http://${vpnIp}:${port}`, '_blank');
    } else {
        showNotification('Camera port not available', true);
    }
}

function checkCamera(button) {
    const field = button.closest('.cam-field');
    const input = field.querySelector('input');
    const rtspUrl = input.value;
    
    // Display the RTSP URL in the modal
    document.getElementById('rtspUrlDisplay').textContent = rtspUrl;
    
    // Reset status display
    const statusText = document.getElementById('connectionStatusText');
    statusText.textContent = 'Not checked yet';
    statusText.classList.remove('success', 'error');
    
    // Clear previous details
    document.getElementById('connectionDetailsText').textContent = '';
    
    // Reset live stream status
    const video = document.getElementById('liveVideo');
    video.src = '';
    video.classList.remove('active');
    document.getElementById('streamStatus').textContent = 'Stream not started';
    
    // Open the modal
    document.getElementById('checkCamModal').style.display = 'block';
}

function closeCheckModal() {
    // Stop any playing video
    const video = document.getElementById('liveVideo');
    if (video.src) {
        video.pause();
        video.src = '';
    }
    
    // Hide the modal
    document.getElementById('checkCamModal').style.display = 'none';
}

function checkRtspConnection() {
    const rtspUrl = document.getElementById('rtspUrlDisplay').textContent;
    const statusText = document.getElementById('connectionStatusText');
    const detailsText = document.getElementById('connectionDetailsText');
    
    // Reset status
    statusText.textContent = 'Checking...';
    statusText.classList.remove('success', 'error');
    detailsText.textContent = '';
    
    // Show preloader
    showPreloader();
    
    // Send request to the backend
    fetch('/api/check-rtsp-connection', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rtsp_url: rtspUrl }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        hidePreloader();
        
        // Update status text and class
        statusText.textContent = data.message || 'Check complete';
        statusText.classList.add(data.success ? 'success' : 'error');
        
        // Update details
        if (data.details) {
            detailsText.textContent = data.details;
        } else {
            detailsText.textContent = data.success ? 
                'Connection successful but no details available.' : 
                'Connection failed but no error details available.';
        }
    })
    .catch(error => {
        hidePreloader();
        console.error('RTSP check error:', error);
        statusText.textContent = 'Error: ' + error.message;
        statusText.classList.add('error');
        detailsText.textContent = 'An error occurred while trying to check the RTSP connection. Please try again.';
    });
}

// Camera management functions
function confirmAddCam() {
    const rtspUrl = document.getElementById('rtspUrlInput').value;
    if (rtspUrl) {
        addCam();
        const camFields = document.querySelectorAll('#cam-fields .cam-field input');
        camFields[camFields.length - 1].value = rtspUrl;

        saveVideoLinks();

        closeModal();
    } else {
        showNotification('Input rtsp-link, please', true);
    }
}

function deleteCam(button) {
    const camField = button.closest('.cam-field');
    camField.remove();
    updateCamLabels();
    saveVideoLinks();
}

function updateCamLabels() {
    const camFields = document.querySelectorAll('#cam-fields .cam-field');
    camFields.forEach((field, index) => {
        field.querySelector('label').textContent = `Cam ${index + 1}:`;
    });
    camCounter = camFields.length;
}

function addCam() {
    camCounter++;
    const camFields = document.getElementById('cam-fields');
    const newCamField = document.createElement('div');
    newCamField.classList.add('cam-field');
    newCamField.innerHTML = `
        <label>Cam ${camCounter}:</label>
        <input type="text" placeholder="Select RTSP url://">
        <button class="edit-cam" onclick="enableEdit(this)">Edit</button>
        <button class="view-cam" onclick="viewCamera(this)">View</button>
        <button class="check-cam" onclick="checkCamera(this)">Check</button>
        <button class="delete-cam" onclick="deleteCam(this)">×</button>
    `;
    camFields.appendChild(newCamField);
    updateCamLabels();
}

function enableEdit(button) {
    const field = button.closest('.cam-field');
    const input = field.querySelector('input');
    input.disabled = false;
    input.focus();
    button.textContent = 'Save';
    button.onclick = () => saveCamEdit(field);
}

function saveCamEdit(field) {
    const input = field.querySelector('input');
    input.disabled = true;
    const editButton = field.querySelector('.edit-cam');
    editButton.textContent = 'Edit';
    editButton.onclick = () => enableEdit(editButton);

    saveVideoLinks();
}

function saveVideoLinks() {
    showPreloader();
    const camFields = document.querySelectorAll('#cam-fields .cam-field input');
    const videoLinks = Array.from(camFields).map(input => input.value);

    const data = {
        camera_list: videoLinks
    };

    fetch('/save-video-links', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
        .then(response => response.json())
        .then(result => {
            hidePreloader();
            if (result.success) {
                updateCameraPorts();
                showNotification('Video links saved successfully!');
            } else {
                showNotification(`ERROR: ${result.error}`, true);
            }
        })
        .catch(error => {
            hidePreloader();
            console.error('Error saving video links:', error);
        });
}

// Stream change function
function changeStream(select) {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.src = `https://example.com/${select.value}.mp4`;
}

function startRtspStream() {
    const rtspUrl = document.getElementById('rtspUrlDisplay').textContent;
    const streamStatus = document.getElementById('streamStatus');
    const video = document.getElementById('liveVideo');
    
    // Update status
    streamStatus.textContent = 'Starting stream...';
    
    // Reset video
    video.src = '';
    video.classList.remove('active');
    
    // Clean up any existing HLS instance
    if (window.hlsPlayer) {
        window.hlsPlayer.destroy();
        window.hlsPlayer = null;
    }
    
    // Show preloader
    showPreloader();
    
    // Request stream from the backend
    fetch('/api/start-rtsp-stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rtsp_url: rtspUrl }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        hidePreloader();
        
        if (data.success && data.stream_url) {
            console.log("Stream URL:", data.stream_url);
            streamStatus.textContent = 'Connecting to stream...';
            
            // Set up video player with HLS.js if supported
            if (Hls.isSupported()) {
                const hls = new Hls({
                    debug: true,
                    xhrSetup: function(xhr) {
                        // Add custom headers or configurations if needed
                        xhr.withCredentials = false;
                    }
                });
                
                // Store hls instance for cleanup
                window.hlsPlayer = hls;
                
                hls.loadSource(data.stream_url);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    console.log("HLS manifest parsed, attempting to play");
                    video.play()
                        .then(() => {
                            video.classList.add('active');
                            streamStatus.textContent = '';
                        })
                        .catch(e => {
                            console.error("Play error:", e);
                            streamStatus.textContent = 'Error: Playback blocked. Try again.';
                        });
                });
                
                // Handle errors
                hls.on(Hls.Events.ERROR, function(event, data) {
                    console.error('HLS error:', data);
                    if (data.fatal) {
                        switch(data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                // Try to recover network error
                                console.log("Network error, trying to recover");
                                streamStatus.textContent = 'Network error, retrying...';
                                hls.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.log("Media error, trying to recover");
                                streamStatus.textContent = 'Media error, retrying...';
                                hls.recoverMediaError();
                                break;
                            default:
                                // Cannot recover, destroy and show error
                                streamStatus.textContent = `Error: Stream playback failed (${data.details})`;
                                hls.destroy();
                                break;
                        }
                    }
                });
            }
            // For Safari which has native HLS support
            else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = data.stream_url;
                video.addEventListener('loadedmetadata', function() {
                    video.play()
                        .then(() => {
                            video.classList.add('active');
                            streamStatus.textContent = '';
                        })
                        .catch(e => {
                            console.error("Play error:", e);
                            streamStatus.textContent = 'Error: Playback blocked. Try again.';
                        });
                });
                video.addEventListener('error', function(e) {
                    console.error("Video error:", e);
                    streamStatus.textContent = 'Error: Stream playback failed';
                });
            }
            else {
                streamStatus.textContent = 'Error: HLS playback not supported by your browser';
            }
        } else {
            let errorMessage = data.message || 'Unknown error';
            if (data.details) {
                console.error("Stream error details:", data.details);
            }
            streamStatus.textContent = 'Error: ' + errorMessage;
        }
    })
    .catch(error => {
        hidePreloader();
        console.error('Stream error:', error);
        streamStatus.textContent = 'Error: ' + error.message;
    });
}

// Initialize camera functionality
document.addEventListener('DOMContentLoaded', () => {
    // Setup Add Camera button
    const addCamBtn = document.querySelector('.cam-config-header button');
    if (addCamBtn) {
        addCamBtn.addEventListener('click', openModal);
    }
    
    // Setup close button for check modal
    const closeCheckBtn = document.querySelector('#checkCamModal .close');
    if (closeCheckBtn) {
        closeCheckBtn.addEventListener('click', closeCheckModal);
    }
    
    // Setup modal background click to close for check modal
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('checkCamModal')) {
            closeCheckModal();
        }
    });
    
    // Update camera ports on page load
    updateCameraPorts();
}); 