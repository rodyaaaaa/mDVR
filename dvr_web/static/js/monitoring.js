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

// CPU Chart and Information
let cpuChartInterval = null;
let cpuDetailedInfo = {
    cores: { logical: 0, physical: 0 },
    frequency: { current: 0, min: 0, max: 0 },
    per_core: []
};

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
    
    // Current value with larger font
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(points[points.length - 1].toFixed(1) + '%', canvas.width - 60, 30);
    
    // Update the CPU details container
    updateCpuDetails();
}

function updateCpuDetails() {
    const detailsContainer = document.getElementById('cpu-details');
    if (!detailsContainer) return;
    
    // Format the CPU frequency
    const freqCurrent = cpuDetailedInfo.frequency.current ? 
        (cpuDetailedInfo.frequency.current / 1000).toFixed(2) + ' GHz' : 'N/A';
    
    let coreUsageHTML = '';
    if (cpuDetailedInfo.per_core && cpuDetailedInfo.per_core.length > 0) {
        coreUsageHTML = '<div class="core-usage-grid">';
        cpuDetailedInfo.per_core.forEach((usage, idx) => {
            coreUsageHTML += `
                <div class="core-usage-item">
                    <div class="core-label">Core ${idx + 1}</div>
                    <div class="core-meter">
                        <div class="core-progress" style="width: ${usage}%"></div>
                    </div>
                    <div class="core-value">${usage.toFixed(1)}%</div>
                </div>
            `;
        });
        coreUsageHTML += '</div>';
    }
    
    detailsContainer.innerHTML = `
        <div class="cpu-details-row">
            <div class="detail-item">
                <span class="detail-label">Cores:</span>
                <span class="detail-value">${cpuDetailedInfo.cores.logical} logical (${cpuDetailedInfo.cores.physical} physical)</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Frequency:</span>
                <span class="detail-value">${freqCurrent}</span>
            </div>
        </div>
        ${coreUsageHTML}
    `;
}

function startCpuChartUpdates() {
    if (cpuChartInterval) clearInterval(cpuChartInterval);
    function updateCpuChart() {
        fetch('/api/cpu-load')
            .then(r => r.json())
            .then(data => {
                if (data.history) drawCpuChart(data.history);
                // Store detailed CPU information
                if (data.cores) cpuDetailedInfo.cores = data.cores;
                if (data.frequency) cpuDetailedInfo.frequency = data.frequency;
                if (data.per_core) cpuDetailedInfo.per_core = data.per_core;
                // Update CPU details
                updateCpuDetails();
            });
    }
    updateCpuChart();
    cpuChartInterval = setInterval(updateCpuChart, 1000);
}

// Memory Chart and Information
let memChartInterval = null;
let memPercentHistory = [];
let memDetailedInfo = {
    memory: {
        total: 0,
        used: 0,
        free: 0,
        cached: 0,
        buffers: 0
    },
    swap: {
        total: 0,
        used: 0,
        free: 0,
        percent: 0
    }
};

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
    
    // Current value with larger font
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(points[points.length - 1].toFixed(1) + '%', canvas.width - 60, 30);
    
    // Update the memory details container
    updateMemDetails();
}

function updateMemDetails() {
    const detailsContainer = document.getElementById('mem-details');
    if (!detailsContainer) return;
    
    // Format memory values to GB
    const totalGB = formatGB(memDetailedInfo.memory.total);
    const usedGB = formatGB(memDetailedInfo.memory.used);
    const freeGB = formatGB(memDetailedInfo.memory.free);
    const cachedGB = memDetailedInfo.memory.cached ? formatGB(memDetailedInfo.memory.cached) : 'N/A';
    
    // Format swap values to GB
    const swapTotalGB = formatGB(memDetailedInfo.swap.total);
    const swapUsedGB = formatGB(memDetailedInfo.swap.used);
    
    // Memory usage progress bar
    const memPercent = memDetailedInfo.memory.percent || 0;
    const swapPercent = memDetailedInfo.swap.percent || 0;
    
    detailsContainer.innerHTML = `
        <div class="mem-details-row">
            <div class="mem-usage-info">
                <div class="mem-progress-container">
                    <div class="mem-progress-label">RAM: ${memPercent.toFixed(1)}%</div>
                    <div class="mem-progress-bar">
                        <div class="mem-progress" style="width: ${memPercent}%"></div>
                    </div>
                </div>
                <div class="mem-values">Used: ${usedGB} / Total: ${totalGB}</div>
                <div class="mem-free">Free: ${freeGB}</div>
            </div>
        </div>
        <div class="mem-details-row">
            <div class="swap-usage-info">
                <div class="mem-progress-container">
                    <div class="mem-progress-label">Swap: ${swapPercent.toFixed(1)}%</div>
                    <div class="mem-progress-bar">
                        <div class="mem-progress swap" style="width: ${swapPercent}%"></div>
                    </div>
                </div>
                <div class="mem-values">Used: ${swapUsedGB} / Total: ${swapTotalGB}</div>
            </div>
        </div>
    `;
}

function startMemChartUpdates() {
    if (memChartInterval) clearInterval(memChartInterval);
    function updateMemChart() {
        fetch('/api/mem-usage')
            .then(r => r.json())
            .then(data => {
                if (data.memory && typeof data.memory.percent === 'number') {
                    memPercentHistory.push(data.memory.percent);
                    if (memPercentHistory.length > 60) memPercentHistory = memPercentHistory.slice(-60);
                    drawMemChart(memPercentHistory);
                    
                    // Store detailed memory information
                    memDetailedInfo = data;
                    
                    // Update memory details
                    updateMemDetails();
                }
            });
    }
    updateMemChart();
    memChartInterval = setInterval(updateMemChart, 1000);
}

// Disk Usage Information
let diskTextInterval = null;
let diskDetailedInfo = {
    total: 0,
    used: 0,
    free: 0,
    percent: 0,
    io: {
        read_bytes: 0,
        write_bytes: 0
    },
    partitions: []
};

function updateDiskUsageInfo() {
    fetch('/api/disk-usage')
        .then(r => r.json())
        .then(data => {
            // Store detailed disk information
            diskDetailedInfo = data;
            
            // Update disk usage text
            updateDiskUsageText();
        })
        .catch(() => {
            document.getElementById('disk-usage-text').textContent = 'Error';
        });
}

function updateDiskUsageText() {
    const diskContainer = document.getElementById('disk-usage-container');
    if (!diskContainer) return;
    
    const percent = diskDetailedInfo.percent || 0;
    const usedGB = formatGB(diskDetailedInfo.used);
    const totalGB = formatGB(diskDetailedInfo.total);
    const freeGB = formatGB(diskDetailedInfo.free);
    
    // Format I/O values if available
    let ioHTML = '';
    if (diskDetailedInfo.io && diskDetailedInfo.io.read_bytes !== null && diskDetailedInfo.io.write_bytes !== null) {
        const readMB = (diskDetailedInfo.io.read_bytes / 1024 / 1024).toFixed(2);
        const writeMB = (diskDetailedInfo.io.write_bytes / 1024 / 1024).toFixed(2);
        ioHTML = `
            <div class="disk-io-info">
                <div>Read: ${readMB} MB</div>
                <div>Write: ${writeMB} MB</div>
            </div>
        `;
    }
    
    diskContainer.innerHTML = `
        <div class="disk-progress-container">
            <div class="disk-progress-label">Disk: ${percent.toFixed(1)}%</div>
            <div class="disk-progress-bar">
                <div class="disk-progress" style="width: ${percent}%"></div>
            </div>
        </div>
        <div class="disk-values">Used: ${usedGB} / Total: ${totalGB}</div>
        <div class="disk-free">Free: ${freeGB}</div>
        ${ioHTML}
    `;
}

// Monitoring control functions
function startMonitoring() {
    startExt5vVUpdates();
    startCpuChartUpdates();
    startMemChartUpdates();
    updateDiskUsageInfo();
    if (!diskTextInterval) diskTextInterval = setInterval(updateDiskUsageInfo, 1000);
}

function stopMonitoring() {
    stopExt5vVUpdates();
    if (cpuChartInterval) { clearInterval(cpuChartInterval); cpuChartInterval = null; }
    if (memChartInterval) { clearInterval(memChartInterval); memChartInterval = null; }
    if (diskTextInterval) { clearInterval(diskTextInterval); diskTextInterval = null; }
}