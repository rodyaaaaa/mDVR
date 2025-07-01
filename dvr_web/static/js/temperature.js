// Temperature monitoring functionality

// Variables to store temperature data
let temperatureData = {
    cpu_temp: null,
    gpu_temp: null,
    system_temp: null,
    timestamp: null
};

// Function to update temperature UI
function updateTemperatureUI(data) {
    const cpuTemp = document.getElementById('cpu-temp');
    const gpuTemp = document.getElementById('gpu-temp');
    const systemTemp = document.getElementById('system-temp');
    const lastUpdated = document.getElementById('temp-last-updated');
    
    if (!cpuTemp || !gpuTemp || !systemTemp || !lastUpdated) return;
    
    if (data.cpu_temp) {
        cpuTemp.textContent = data.cpu_temp;
        applyTemperatureColor(cpuTemp, parseTemperature(data.cpu_temp));
    }
    
    if (data.gpu_temp) {
        gpuTemp.textContent = data.gpu_temp;
        applyTemperatureColor(gpuTemp, parseTemperature(data.gpu_temp));
    }
    
    if (data.system_temp) {
        systemTemp.textContent = data.system_temp;
        applyTemperatureColor(systemTemp, parseTemperature(data.system_temp));
    }
    
    if (data.timestamp) {
        const date = new Date(data.timestamp * 1000);
        lastUpdated.textContent = date.toLocaleTimeString();
    }
}

// Function to parse temperature from string (e.g. "45.5°C" -> 45.5)
function parseTemperature(tempStr) {
    if (!tempStr) return 0;
    
    // Extract numeric value from string like "45.5°C"
    const matches = tempStr.match(/(\d+(\.\d+)?)/);
    if (matches && matches[1]) {
        return parseFloat(matches[1]);
    }
    return 0;
}

// Function to apply color based on temperature
function applyTemperatureColor(element, temperature) {
    if (temperature >= 80) {
        element.style.color = '#e74c3c'; // Red for high temperature
    } else if (temperature >= 60) {
        element.style.color = '#f39c12'; // Orange for medium temperature
    } else {
        element.style.color = '#2ecc71'; // Green for normal temperature
    }
}

// Function to fetch temperature data
function fetchTemperatureData() {
    fetch('/api/system-temperature')
        .then(response => response.json())
        .then(data => {
            temperatureData = data;
            updateTemperatureUI(data);
        })
        .catch(error => {
            console.error('Error fetching temperature data:', error);
            document.getElementById('cpu-temp').textContent = 'Error';
            document.getElementById('gpu-temp').textContent = 'Error';
            document.getElementById('system-temp').textContent = 'Error';
        });
}

// Start temperature updates
function startTemperatureUpdates() {
    // Fetch temperature data immediately
    fetchTemperatureData();
    
    // Set interval to update temperature data every 5 seconds
    return setInterval(fetchTemperatureData, 5000);
}

// Initialize temperature monitoring
let temperatureInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    temperatureInterval = startTemperatureUpdates();
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (temperatureInterval) {
            clearInterval(temperatureInterval);
        }
    });
}); 