// Main JavaScript file that imports all modules

// Tab switching function
function showTab(tabId) {
  const currentTab = document.querySelector(".tab.active");
  const newTab = document.getElementById(tabId);

  if (currentTab && currentTab !== newTab) {
    currentTab.style.animation = "fadeOutLeft 0.3s ease-out forwards";

    setTimeout(() => {
      document.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.remove("active");
        tab.style.animation = "";
      });

      newTab.classList.add("active");

      document
        .querySelectorAll(".sidebar button")
        .forEach((button) => button.classList.remove("active"));
      const activeButton = document.querySelector(
        `.sidebar button[onclick="showTab('${tabId}')"]`,
      );
      activeButton.classList.add("active");

      if (tabId === "home") {
        setTimeout(optimizeDashboardLayout, 300);
      }

      if (tabId === "materials" && window.loadMaterials) {
        window.loadMaterials();
      }
    }, 250);
  } else {
    document
      .querySelectorAll(".tab")
      .forEach((tab) => tab.classList.remove("active"));
    newTab.classList.add("active");

    document
      .querySelectorAll(".sidebar button")
      .forEach((button) => button.classList.remove("active"));
    const activeButton = document.querySelector(
      `.sidebar button[onclick="showTab('${tabId}')"]`,
    );
    activeButton.classList.add("active");

    if (tabId === "home") {
      setTimeout(optimizeDashboardLayout, 300);
    }
    if (tabId === "materials" && window.loadMaterials) {
      window.loadMaterials();
    }
  }

  // System tab specific handling
  if (tabId === "system") {
    // Default to Services sub-tab when opening System
    if (!document.getElementById("system-services-content").classList.contains("active")) {
      window.showSystemTab("system-services-content");
    } else {
      // Ensure services polling runs when returning to System with Services active
      startServiceStatusUpdates();
    }
  } else {
    // Leaving System tab -> stop services polling
    if (typeof stopServiceStatusUpdates === "function") stopServiceStatusUpdates();
  }

  if (tabId === "home") {
    startExt5vVUpdates();
    startCpuChartUpdates();
    startMemChartUpdates();
  } else if (tabId === "video-options") {
    updateReedSwitchTimeout();
    showSettingsTab("general-settings-content");
    stopExt5vVUpdates();
    clearInterval(cpuChartInterval);
    clearInterval(memChartInterval);
  } else {
    stopExt5vVUpdates();
    clearInterval(cpuChartInterval);
    clearInterval(memChartInterval);
  }
}

// Show System Tab (sub-tabs: Services, Network)
function showSystemTab(tabId) {
  const contents = document.querySelectorAll('#system .settings-content');
  contents.forEach((c) => c.classList.remove('active'));

  const tabs = document.querySelectorAll('#system .settings-tab');
  tabs.forEach((t) => t.classList.remove('active'));

  const selected = document.getElementById(tabId);
  if (selected) selected.classList.add('active');

  const activeTabId = tabId.replace('-content', '-tab');
  const activeBtn = document.getElementById(activeTabId);
  if (activeBtn) activeBtn.classList.add('active');

  // Start/stop services polling depending on selected sub-tab
  if (tabId === 'system-services-content') {
    if (typeof startServiceStatusUpdates === 'function') startServiceStatusUpdates();
  } else {
    if (typeof stopServiceStatusUpdates === 'function') stopServiceStatusUpdates();
  }

  // Load network info when opening Network tab
  if (tabId === 'system-network-content') {
    window.fetchNetworkInfo();
  }
}

// Expose to global for inline handlers
window.showSystemTab = showSystemTab;

// Fetch and render network info
async function fetchNetworkInfo() {
  try {
    const ipv4El = document.getElementById('net-ipv4-list');
    const listEl = document.getElementById('network-interfaces');
    if (ipv4El) ipv4El.textContent = 'Loading...';
    if (listEl) listEl.innerHTML = '';

    const resp = await fetch('/get-network-info');
    const data = await resp.json();

    if (ipv4El) ipv4El.textContent = (data.ipv4 && data.ipv4.length) ? data.ipv4.join(', ') : '-';

    if (listEl && Array.isArray(data.interfaces)) {
      data.interfaces.forEach((itf) => {
        const card = document.createElement('div');
        card.style.border = '1px solid #2e3a4a';
        card.style.borderRadius = '8px';
        card.style.padding = '10px';
        card.style.background = '#101a24';

        const title = document.createElement('div');
        title.style.display = 'flex';
        title.style.justifyContent = 'space-between';
        title.style.alignItems = 'center';
        title.style.marginBottom = '6px';
        title.innerHTML = `
          <strong style="color:#dbe7ff;">${itf.name || 'iface'}</strong>
          <span style="color:${itf.state === 'UP' ? '#6ad46a' : '#bfc9da'}; font-size:0.9em;">${itf.state || '-'}</span>
        `;
        card.appendChild(title);

        const meta = document.createElement('div');
        meta.style.color = '#bfc9da';
        meta.style.fontSize = '0.9em';
        meta.style.marginBottom = '6px';
        meta.textContent = `MAC: ${itf.mac || '-'}  •  MTU: ${itf.mtu || '-'}  •  Index: ${itf.index || '-'}`;
        card.appendChild(meta);

        const addrs = document.createElement('ul');
        addrs.style.listStyle = 'none';
        addrs.style.padding = '0';
        addrs.style.margin = '0';
        (itf.addresses || []).forEach((a) => {
          const li = document.createElement('li');
          li.style.color = '#9fb2c7';
          const fam = a.family || '';
          const ip = a.local || '-';
          const pfx = (a.prefixlen != null) ? `/${a.prefixlen}` : '';
          const scope = a.scope ? ` (${a.scope})` : '';
          li.textContent = `${fam}: ${ip}${pfx}${scope}`;
          addrs.appendChild(li);
        });
        if ((itf.addresses || []).length === 0) {
          const li = document.createElement('li');
          li.style.color = '#9fb2c7';
          li.textContent = 'No addresses';
          addrs.appendChild(li);
        }
        card.appendChild(addrs);

        listEl.appendChild(card);
      });
    }

    if (data.error) {
      console.warn('Network info error:', data.error);
    }

    // Fetch iptables raw filter rules and render
    const filtRawEl = document.getElementById('ipt-filter-rules');
    if (filtRawEl) filtRawEl.textContent = 'Loading...';
    try {
      const iptResp = await fetch('/get-iptables-rules');
      const ipt = await iptResp.json();
      if (filtRawEl) {
        filtRawEl.textContent = (Array.isArray(ipt.filter_rules) ? ipt.filter_rules : []).join('\n');
      }
      if (ipt.error) console.warn('iptables fetch error:', ipt.error);
    } catch (e) {
      console.error('Failed to fetch iptables rules', e);
      if (filtRawEl) filtRawEl.textContent = 'Error';
    }
  } catch (e) {
    console.error('Failed to fetch network info', e);
    const ipv4El = document.getElementById('net-ipv4-list');
    if (ipv4El) ipv4El.textContent = 'Error';
  }
}

// Expose to global for inline handlers
window.fetchNetworkInfo = fetchNetworkInfo;

document.addEventListener("DOMContentLoaded", () => {
  console.log("mDVR Web Interface loaded");

  if (document.getElementById("dashboard-grid")) {
    console.log("Dashboard grid layout initialized");
  }
});

function getLocalFormattedDateTime() {
  const now = new Date();
  const pad = num => num.toString().padStart(2, '0');

  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());

  const hrs = pad(now.getHours());
  const mins = pad(now.getMinutes());
  const secs = pad(now.getSeconds());

  return `${year}/${month}/${day} ${hrs}:${mins}:${secs}`;
}
