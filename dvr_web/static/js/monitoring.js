// Monitoring functionality

// Service status monitoring
let serviceStatusInterval;

function updateServiceStatus() {
    const serviceSelector = document.getElementById('service-selector');
    if (!serviceSelector) {
        return;
    }
    
    fetch(`/get-service-status/${serviceSelector.value}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error, true);
                return;
            }
            
            const serviceActive = document.getElementById('service-active');
            const serviceEnabled = document.getElementById('service-enabled');
            
            serviceActive.textContent = data.status;
            serviceActive.className = data.status === 'active' ? '' : 'error';
            
            serviceEnabled.textContent = data.enabled ? 'Yes' : 'No';
            serviceEnabled.className = data.enabled ? '' : 'error';
        })
        .catch(error => {
            showNotification('Error fetching service status', true);
            console.error('Error:', error);
        });
}

function startServiceStatusUpdates() {
    if (serviceStatusInterval) {
        clearInterval(serviceStatusInterval);
    }
    updateServiceStatus(); // Immediately update status when tab is opened
    serviceStatusInterval = setInterval(updateServiceStatus, 5000);
}

function stopServiceStatusUpdates() {
    if (serviceStatusInterval) {
        clearInterval(serviceStatusInterval);
        serviceStatusInterval = null;
    }
}

// EXT5V_V monitoring
let ext5vVInterval = null;

function startExt5vVUpdates() {
    stopExt5vVUpdates();
    ext5vVInterval = setInterval(() => {
        fetch('/api/ext5v-v')
            .then(response => response.json())
            .then(data => {
                document.getElementById('ext5v-v-output').textContent = data.value || 'No data';
            })
            .catch(() => {
                document.getElementById('ext5v-v-output').textContent = 'Error';
            });
    }, 1000);
}

function stopExt5vVUpdates() {
    if (ext5vVInterval) {
        clearInterval(ext5vVInterval);
        ext5vVInterval = null;
    }
}

// CPU Chart
let cpuChartInterval = null;

function drawCpuChart(history) {
    const canvas = document.getElementById('cpu-load-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Dark background
    ctx.fillStyle = '#1b263b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Axes
    ctx.strokeStyle = '#415a77';
    ctx.beginPath();
    ctx.moveTo(30, 10);
    ctx.lineTo(30, canvas.height - 20);
    ctx.lineTo(canvas.width - 10, canvas.height - 20);
    ctx.stroke();
    // Y labels
    ctx.fillStyle = '#bfc9da';
    ctx.font = '12px Arial';
    ctx.fillText('100%', 2, 18);
    ctx.fillText('0%', 10, canvas.height - 22);
    // Draw line
    if (!history || !history.length) return;
    const maxY = 100;
    const minY = 0;
    const points = history.slice(-60);
    const stepX = (canvas.width - 40) / 59;
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((val, i) => {
        const x = 30 + i * stepX;
        const y = 10 + (maxY - val) * (canvas.height - 30) / (maxY - minY);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Current value
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(points[points.length - 1].toFixed(1) + '%', canvas.width - 60, 30);
}

function startCpuChartUpdates() {
    if (cpuChartInterval) clearInterval(cpuChartInterval);
    function updateCpuChart() {
        fetch('/api/cpu-load')
            .then(r => r.json())
            .then(data => {
                if (data.history) drawCpuChart(data.history);
            });
    }
    updateCpuChart();
    cpuChartInterval = setInterval(updateCpuChart, 1000);
}

// Memory Chart
let memChartInterval = null;
let memPercentHistory = [];

function drawMemChart(percentHistory) {
    const canvas = document.getElementById('mem-usage-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Dark background
    ctx.fillStyle = '#1b263b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Axes
    ctx.strokeStyle = '#415a77';
    ctx.beginPath();
    ctx.moveTo(30, 10);
    ctx.lineTo(30, canvas.height - 20);
    ctx.lineTo(canvas.width - 10, canvas.height - 20);
    ctx.stroke();
    // Y labels
    ctx.fillStyle = '#bfc9da';
    ctx.font = '12px Arial';
    ctx.fillText('100%', 2, 18);
    ctx.fillText('0%', 10, canvas.height - 22);
    // Draw line
    if (!percentHistory || !percentHistory.length) return;
    const maxY = 100;
    const minY = 0;
    const points = percentHistory.slice(-60);
    const stepX = (canvas.width - 40) / 59;
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((val, i) => {
        const x = 30 + i * stepX;
        const y = 10 + (maxY - val) * (canvas.height - 30) / (maxY - minY);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Current value
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(points[points.length - 1].toFixed(1) + '%', canvas.width - 60, 30);
}

function startMemChartUpdates() {
    if (memChartInterval) clearInterval(memChartInterval);
    function updateMemChart() {
        fetch('/api/mem-usage')
            .then(r => r.json())
            .then(data => {
                if (typeof data.percent === 'number') {
                    memPercentHistory.push(data.percent);
                    if (memPercentHistory.length > 60) memPercentHistory = memPercentHistory.slice(-60);
                    drawMemChart(memPercentHistory);
                }
            });
    }
    updateMemChart();
    memChartInterval = setInterval(updateMemChart, 1000);
}

// Disk Usage Text
let diskTextInterval = null;

function updateDiskUsageText() {
    fetch('/api/disk-usage')
        .then(r => r.json())
        .then(data => {
            if (typeof data.total === 'number' && typeof data.used === 'number') {
                document.getElementById('disk-usage-text').textContent =
                    `Used: ${formatGB(data.used)} / Total: ${formatGB(data.total)}`;
            } else {
                document.getElementById('disk-usage-text').textContent = 'No data';
            }
        })
        .catch(() => {
            document.getElementById('disk-usage-text').textContent = 'Error';
        });
}

// Initialize monitoring functionality
document.addEventListener('DOMContentLoaded', () => {
    // Start EXT5V_V updates
    startExt5vVUpdates();
    
    // Start CPU chart updates
    startCpuChartUpdates();
    
    // Start memory chart updates
    startMemChartUpdates();
    
    // Start disk usage text updates
    updateDiskUsageText();
    diskTextInterval = setInterval(updateDiskUsageText, 1000);
}); 