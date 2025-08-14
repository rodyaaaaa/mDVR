// Monitoring functionality

// Service status monitoring
let serviceStatusInterval;
// Logs pagination state
let logsOffsets = {};
let logsLoading = {};

function attachLogsHandlers(container, unitKey) {
    const btn = container.querySelector('.logs-toggle');
    const panel = container.querySelector('.logs-panel');
    const pre = container.querySelector('.logs-content');
    if (!btn || !panel || !pre) return;

    // Initialize
    logsOffsets[unitKey] = 0;
    logsLoading[unitKey] = false;

    const loadMore = (opts = { prepend: false, initial: false }) => {
        if (logsLoading[unitKey]) return;
        logsLoading[unitKey] = true;
        const offset = logsOffsets[unitKey] || 0;
        const prevScrollHeight = panel.scrollHeight;
        const prevScrollTop = panel.scrollTop;
        fetch(`/get-service-logs/${unitKey}?limit=200&offset=${offset}`)
            .then(r => r.json())
            .then(data => {
                if (data && Array.isArray(data.logs)) {
                    const text = data.logs.join('\n');
                    if (opts.prepend && pre.textContent) {
                        pre.textContent = text + '\n' + pre.textContent;
                    } else {
                        pre.textContent += (pre.textContent ? '\n' : '') + text;
                    }
                    logsOffsets[unitKey] = data.next_offset || (offset + data.logs.length);
                }
            })
            .catch(() => {})
            .finally(() => {
                logsLoading[unitKey] = false;
                // After content changes
                if (opts.initial) {
                    // Start from bottom (newest at bottom)
                    panel.scrollTop = panel.scrollHeight;
                } else if (opts.prepend) {
                    // Preserve viewport when prepending
                    const delta = panel.scrollHeight - prevScrollHeight;
                    panel.scrollTop = prevScrollTop + delta;
                }
            });
    };

    btn.addEventListener('click', () => {
        const isOpen = panel.classList.toggle('open');
        if (isOpen && !pre.textContent.trim()) {
            loadMore({ initial: true });
        }
    });

    panel.addEventListener('scroll', () => {
        const nearTop = panel.scrollTop <= 30;
        if (nearTop) {
            loadMore({ prepend: true });
        }
    });
}

function updateServiceStatus() {
    const serviceSelector = document.getElementById('service-selector');
    const value = serviceSelector.value;
    const statusContainer = document.getElementById('service-status');

    if (value === "") {
        return;
    }

    // mDVR VPN Check: show combined vpn check service + timer
    if (value === 'mdvr_vpn_check') {
        const units = [
            { key: 'mdvr_vpn_check.service', label: 'mDVR VPN Check Service' },
            { key: 'mdvr_vpn_check.timer', label: 'mDVR VPN Check Timer' },
        ];

        Promise.all(
            units.map(u => fetch(`/get-service-status/${u.key}`)
                .then(r => r.json())
                .then(d => ({ u, d }))
                .catch(e => ({ u, d: { error: String(e) } })))
        ).then(results => {
            const renderRow = (label, d, key) => {
                if (d && d.error) {
                    return `
                        <div class="service-row" data-unit="${key}">
                            <p>${label}: <span class="error">Error</span></p>
                            <p class="error">${d.error}</p>
                            <button type="button" class="logs-toggle">Show logs</button>
                            <div class="logs-panel"><pre class="logs-content"></pre></div>
                        </div>
                    `;
                }
                const activeClass = d.status === 'active' ? '' : 'error';
                const enabledClass = d.enabled ? '' : 'error';
                const enabledText = d.enabled ? 'Yes' : 'No';
                return `
                    <div class="service-row" data-unit="${key}">
                        <p>${label} — Active: <span class="${activeClass}">${d.status}</span></p>
                        <p>Enabled: <span class="${enabledClass}">${enabledText}</span></p>
                        <p class="service-desc">Description: <span>${d.description || '-'} </span></p>
                        <button type="button" class="logs-toggle">Show logs</button>
                        <div class="logs-panel"><pre class="logs-content"></pre></div>
                    </div>
                `;
            };

            const rows = results
                .map(({ u, d }) => renderRow(u.label, d, u.key))
                .join('');

            statusContainer.innerHTML = `
                <div class="engine-grid">
                    <div class="engine-col">
                        <h3>mDVR VPN Check</h3>
                        ${rows}
                    </div>
                </div>
            `;

            statusContainer.querySelectorAll('.service-row').forEach(row => {
                const unitKey = row.getAttribute('data-unit');
                if (unitKey) attachLogsHandlers(row, unitKey);
            });
        }).catch(error => {
            showNotification('Error fetching mDVR VPN Check statuses', true);
            console.error('mDVR VPN Check fetch error:', error);
        });
        return;
    }

    // mDVR System Guard: show combined system guard service + timer
    if (value === 'mdvr_system_guard') {
        const units = [
            { key: 'mdvr_system_guard.service', label: 'mDVR System Guard Service' },
            { key: 'mdvr_system_guard.timer', label: 'mDVR System Guard Timer' },
        ];

        Promise.all(
            units.map(u => fetch(`/get-service-status/${u.key}`)
                .then(r => r.json())
                .then(d => ({ u, d }))
                .catch(e => ({ u, d: { error: String(e) } })))
        ).then(results => {
            const renderRow = (label, d, key) => {
                if (d && d.error) {
                    return `
                        <div class="service-row" data-unit="${key}">
                            <p>${label}: <span class="error">Error</span></p>
                            <p class="error">${d.error}</p>
                            <button type="button" class="logs-toggle">Show logs</button>
                            <div class="logs-panel"><pre class="logs-content"></pre></div>
                        </div>
                    `;
                }
                const activeClass = d.status === 'active' ? '' : 'error';
                const enabledClass = d.enabled ? '' : 'error';
                const enabledText = d.enabled ? 'Yes' : 'No';
                return `
                    <div class="service-row" data-unit="${key}">
                        <p>${label} — Active: <span class="${activeClass}">${d.status}</span></p>
                        <p>Enabled: <span class="${enabledClass}">${enabledText}</span></p>
                        <p class="service-desc">Description: <span>${d.description || '-'} </span></p>
                        <button type="button" class="logs-toggle">Show logs</button>
                        <div class="logs-panel"><pre class="logs-content"></pre></div>
                    </div>
                `;
            };

            const rows = results
                .map(({ u, d }) => renderRow(u.label, d, u.key))
                .join('');

            statusContainer.innerHTML = `
                <div class="engine-grid">
                    <div class="engine-col">
                        <h3>mDVR System Guard</h3>
                        ${rows}
                    </div>
                </div>
            `;

            statusContainer.querySelectorAll('.service-row').forEach(row => {
                const unitKey = row.getAttribute('data-unit');
                if (unitKey) attachLogsHandlers(row, unitKey);
            });
        }).catch(error => {
            showNotification('Error fetching mDVR System Guard statuses', true);
            console.error('mDVR System Guard fetch error:', error);
        });
        return;
    }

    // mDVR Upload: show combined upload service + timer
    if (value === 'mdvr_upload') {
        const units = [
            { key: 'mdvr_upload.service', label: 'mDVR Upload Service' },
            { key: 'mdvr_upload.timer', label: 'mDVR Upload Timer' },
        ];

        Promise.all(
            units.map(u => fetch(`/get-service-status/${u.key}`)
                .then(r => r.json())
                .then(d => ({ u, d }))
                .catch(e => ({ u, d: { error: String(e) } })))
        ).then(results => {
            const renderRow = (label, d, key) => {
                if (d && d.error) {
                    return `
                        <div class="service-row" data-unit="${key}">
                            <p>${label}: <span class="error">Error</span></p>
                            <p class="error">${d.error}</p>
                            <button type="button" class="logs-toggle">Show logs</button>
                            <div class="logs-panel"><pre class="logs-content"></pre></div>
                        </div>
                    `;
                }
                const activeClass = d.status === 'active' ? '' : 'error';
                const enabledClass = d.enabled ? '' : 'error';
                const enabledText = d.enabled ? 'Yes' : 'No';
                return `
                    <div class="service-row" data-unit="${key}">
                        <p>${label} — Active: <span class="${activeClass}">${d.status}</span></p>
                        <p>Enabled: <span class="${enabledClass}">${enabledText}</span></p>
                        <p class="service-desc">Description: <span>${d.description || '-'} </span></p>
                        <button type="button" class="logs-toggle">Show logs</button>
                        <div class="logs-panel"><pre class="logs-content"></pre></div>
                    </div>
                `;
            };

            const rows = results
                .map(({ u, d }) => renderRow(u.label, d, u.key))
                .join('');

            statusContainer.innerHTML = `
                <div class="engine-grid">
                    <div class="engine-col">
                        <h3>mDVR Upload</h3>
                        ${rows}
                    </div>
                </div>
            `;

            // Attach logs handlers for both rows
            statusContainer.querySelectorAll('.service-row').forEach(row => {
                const unitKey = row.getAttribute('data-unit');
                if (unitKey) attachLogsHandlers(row, unitKey);
            });
        }).catch(error => {
            showNotification('Error fetching mDVR Upload statuses', true);
            console.error('mDVR Upload fetch error:', error);
        });
        return;
    }

    // mDVR Space Check: show combined space check service + timer
    if (value === 'mdvr_space_check') {
        const units = [
            { key: 'mdvr_space_check.service', label: 'mDVR Space Check Service' },
            { key: 'mdvr_space_check.timer', label: 'mDVR Space Check Timer' },
        ];

        Promise.all(
            units.map(u => fetch(`/get-service-status/${u.key}`)
                .then(r => r.json())
                .then(d => ({ u, d }))
                .catch(e => ({ u, d: { error: String(e) } })))
        ).then(results => {
            const renderRow = (label, d, key) => {
                if (d && d.error) {
                    return `
                        <div class="service-row" data-unit="${key}">
                            <p>${label}: <span class="error">Error</span></p>
                            <p class="error">${d.error}</p>
                            <button type="button" class="logs-toggle">Show logs</button>
                            <div class="logs-panel"><pre class="logs-content"></pre></div>
                        </div>
                    `;
                }
                const activeClass = d.status === 'active' ? '' : 'error';
                const enabledClass = d.enabled ? '' : 'error';
                const enabledText = d.enabled ? 'Yes' : 'No';
                return `
                    <div class="service-row" data-unit="${key}">
                        <p>${label} — Active: <span class="${activeClass}">${d.status}</span></p>
                        <p>Enabled: <span class="${enabledClass}">${enabledText}</span></p>
                        <p class="service-desc">Description: <span>${d.description || '-'} </span></p>
                        <button type="button" class="logs-toggle">Show logs</button>
                        <div class="logs-panel"><pre class="logs-content"></pre></div>
                    </div>
                `;
            };

            const rows = results
                .map(({ u, d }) => renderRow(u.label, d, u.key))
                .join('');

            statusContainer.innerHTML = `
                <div class="engine-grid">
                    <div class="engine-col">
                        <h3>mDVR Space Check</h3>
                        ${rows}
                    </div>
                </div>
            `;

            // Attach logs handlers for both rows
            statusContainer.querySelectorAll('.service-row').forEach(row => {
                const unitKey = row.getAttribute('data-unit');
                if (unitKey) attachLogsHandlers(row, unitKey);
            });
        }).catch(error => {
            showNotification('Error fetching mDVR Space Check statuses', true);
            console.error('mDVR Space Check fetch error:', error);
        });
        return;
    }

    // mDVR Web: show combined web service + timer
    if (value === 'mdvr_web.service') {
        const units = [
            { key: 'mdvr_web.service', label: 'mDVR Web Service' },
            { key: 'mdvr_web.timer', label: 'mDVR Web Timer' },
        ];

        Promise.all(
            units.map(u => fetch(`/get-service-status/${u.key}`)
                .then(r => r.json())
                .then(d => ({ u, d }))
                .catch(e => ({ u, d: { error: String(e) } })))
        ).then(results => {
            const renderRow = (label, d, key) => {
                if (d && d.error) {
                    return `
                        <div class="service-row" data-unit="${key}">
                            <p>${label}: <span class="error">Error</span></p>
                            <p class="error">${d.error}</p>
                            <button type="button" class="logs-toggle">Show logs</button>
                            <div class="logs-panel"><pre class="logs-content"></pre></div>
                        </div>
                    `;
                }
                const activeClass = d.status === 'active' ? '' : 'error';
                const enabledClass = d.enabled ? '' : 'error';
                const enabledText = d.enabled ? 'Yes' : 'No';
                return `
                    <div class="service-row" data-unit="${key}">
                        <p>${label} — Active: <span class="${activeClass}">${d.status}</span></p>
                        <p>Enabled: <span class="${enabledClass}">${enabledText}</span></p>
                        <p class="service-desc">Description: <span>${d.description || '-'} </span></p>
                        <button type="button" class="logs-toggle">Show logs</button>
                        <div class="logs-panel"><pre class="logs-content"></pre></div>
                    </div>
                `;
            };

            const rows = results
                .map(({ u, d }) => renderRow(u.label, d, u.key))
                .join('');

            statusContainer.innerHTML = `
                <div class="engine-grid">
                    <div class="engine-col">
                        <h3>mDVR Web</h3>
                        ${rows}
                    </div>
                </div>
            `;

            // Attach logs handlers for both rows
            statusContainer.querySelectorAll('.service-row').forEach(row => {
                const unitKey = row.getAttribute('data-unit');
                if (unitKey) attachLogsHandlers(row, unitKey);
            });
        }).catch(error => {
            showNotification('Error fetching mDVR Web statuses', true);
            console.error('mDVR Web fetch error:', error);
        });
        return;
    }

    // If any logs panel is open, avoid re-rendering to prevent closing it while the user scrolls
    if (statusContainer && statusContainer.querySelector('.logs-panel.open')) {
        return;
    }

    // Engine: show combined mdvr and reed-switch service + timer
    if (value === 'engine') {
        const units = [
            { key: 'mdvr.service', label: 'mDVR Service', group: 'mdvr' },
            { key: 'mdvr.timer', label: 'mDVR Timer', group: 'mdvr' },
            { key: 'mdvr_rs.service', label: 'Reed Switch Service', group: 'rs' },
            { key: 'mdvr_rs.timer', label: 'Reed Switch Timer', group: 'rs' },
        ];

        Promise.all(
            units.map(u => fetch(`/get-service-status/${u.key}`)
                .then(r => r.json())
                .then(d => ({ u, d }))
                .catch(e => ({ u, d: { error: String(e) } })))
        ).then(results => {
            const renderRow = (label, d, key) => {
                if (d && d.error) {
                    return `
                        <div class="service-row" data-unit="${key}">
                            <p>${label}: <span class="error">Error</span></p>
                            <p class="error">${d.error}</p>
                            <button type="button" class="logs-toggle">Show logs</button>
                            <div class="logs-panel"><pre class="logs-content"></pre></div>
                        </div>
                    `;
                }
                const activeClass = d.status === 'active' ? '' : 'error';
                const enabledClass = d.enabled ? '' : 'error';
                const enabledText = d.enabled ? 'Yes' : 'No';
                return `
                    <div class="service-row" data-unit="${key}">
                        <p>${label} — Active: <span class="${activeClass}">${d.status}</span></p>
                        <p>Enabled: <span class="${enabledClass}">${enabledText}</span></p>
                        <p class="service-desc">Description: <span>${d.description || '-'} </span></p>
                        <button type="button" class="logs-toggle">Show logs</button>
                        <div class="logs-panel"><pre class="logs-content"></pre></div>
                    </div>
                `;
            };

            const mdvrRows = results
                .filter(r => r.u.group === 'mdvr')
                .map(({ u, d }) => renderRow(u.label, d, u.key))
                .join('');

            const rsRows = results
                .filter(r => r.u.group === 'rs')
                .map(({ u, d }) => renderRow(u.label, d, u.key))
                .join('');

            statusContainer.innerHTML = `
                <div class="engine-grid">
                    <div class="engine-col">
                        <h3>mDVR</h3>
                        ${mdvrRows}
                    </div>
                    <div class="engine-col">
                        <h3>Reed Switch</h3>
                        ${rsRows}
                    </div>
                </div>
            `;

            // Attach logs handlers for all engine rows
            statusContainer.querySelectorAll('.service-row').forEach(row => {
                const unitKey = row.getAttribute('data-unit');
                if (unitKey) attachLogsHandlers(row, unitKey);
            });
        }).catch(error => {
            showNotification('Error fetching engine statuses', true);
            console.error('Engine fetch error:', error);
        });
        return;
    }

    // Default: single unit view
    // Ensure default layout exists if it was replaced by engine view
    if (!document.getElementById('service-active') || !document.getElementById('service-enabled')) {
        statusContainer.innerHTML = `
            <p>Status: <span id="service-active">-</span></p>
            <p>Enabled: <span id="service-enabled">-</span></p>
            <p class="service-desc">Description: <span id="service-description">-</span></p>
            <div class="service-row" data-unit="${value}">
                <button type="button" class="logs-toggle">Show logs</button>
                <div class="logs-panel"><pre class="logs-content"></pre></div>
            </div>
        `;
        const singleRow = statusContainer.querySelector('.service-row');
        if (singleRow) attachLogsHandlers(singleRow, value);
    }

    fetch(`/get-service-status/${value}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error, true);
                return;
            }

            const serviceActive = document.getElementById('service-active');
            const serviceEnabled = document.getElementById('service-enabled');
            let serviceDescription = document.getElementById('service-description');

            serviceActive.textContent = data.status;
            serviceActive.className = data.status === 'active' ? '' : 'error';

            serviceEnabled.textContent = data.enabled ? 'Yes' : 'No';
            serviceEnabled.className = data.enabled ? '' : 'error';

            if (!serviceDescription) {
                const p = document.createElement('p');
                p.className = 'service-desc';
                p.innerHTML = 'Description: <span id="service-description">-</span>';
                statusContainer.appendChild(p);
                serviceDescription = document.getElementById('service-description');
            }
            serviceDescription.textContent = data.description || '-';

            // Make sure logs handlers are attached for single-service view
            const singleRow = statusContainer.querySelector('.service-row');
            if (singleRow && !singleRow.getAttribute('data-unit')) {
                singleRow.setAttribute('data-unit', value);
                attachLogsHandlers(singleRow, value);
            }
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