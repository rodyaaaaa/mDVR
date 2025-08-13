// Main JavaScript file that imports all modules

function showPreloader() {
  document.getElementById("preloader").classList.add("active");
}

function hidePreloader() {
  document.getElementById("preloader").classList.remove("active");
}

function closeModal() {
  const modal = document.getElementById("addCamModal");
  if (modal) modal.style.display = "none";
}

function showNotification(message, isError = false) {
  const notification = document.createElement("div");
  notification.className = `notification ${isError ? "error" : "success"}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  // Start fade-out after display duration, then remove on animation end
  setTimeout(() => {
    // In case it was already removed
    if (!notification.isConnected) return;
    notification.classList.add("hiding");
    const removeSafely = () => notification.remove();
    notification.addEventListener("animationend", removeSafely, { once: true });
    // Fallback removal in case animationend doesn't fire
    setTimeout(() => {
      if (notification.isConnected) notification.remove();
    }, 800);
  }, 3000);
}

function formatGB(bytes) {
  return (bytes / 1024 ** 3).toFixed(2) + " GB";
}

// Function to optimize dashboard grid layout
function optimizeDashboardLayout() {
  const gridContainer = document.getElementById("dashboard-grid");
  if (!gridContainer) return;

  // Force refresh grid layout to ensure proper positioning
  gridContainer.classList.add("refresh-grid");
  setTimeout(() => {
    gridContainer.classList.remove("refresh-grid");
  }, 100);

  // Ensure temperature card has proper height
  const temperatureCard = document.getElementById("temperature-card");
  if (temperatureCard) {
    const tempContent = temperatureCard.querySelector(".card-content");
    if (tempContent) {
      // Reset explicit height if it's taking too much space
      if (
        tempContent.offsetHeight > 200 &&
        !temperatureCard.classList.contains("custom-height")
      ) {
        tempContent.style.height = "auto";
      }
    }
  }

  // Ensure EXT5V_V card has proper height
  const ext5vCard = document.getElementById("system-info-card");
  if (ext5vCard) {
    const ext5vContent = ext5vCard.querySelector(".card-content");
    if (ext5vContent) {
      // Keep height minimal for this card
      if (!ext5vCard.classList.contains("custom-height")) {
        ext5vContent.style.height = "auto";
      }
    }
  }

  // Ensure all cards have appropriate positioning in the grid
  const cards = Array.from(gridContainer.querySelectorAll(".grid-item"));
  cards.forEach((card) => {
    // Make sure the cards have the correct size classes applied
    if (
      !card.classList.contains("size-1x1") &&
      !card.classList.contains("size-1x2") &&
      !card.classList.contains("size-2x1") &&
      !card.classList.contains("size-2x2")
    ) {
      // Default to small size if no size class is present
      card.classList.add("size-1x1");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Setup Add RTSP modal events only if present
  const addModal = document.getElementById("addCamModal");
  if (addModal) {
    const closeBtn = addModal.querySelector(".close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    window.addEventListener("click", (event) => {
      if (event.target === addModal) {
        closeModal();
      }
    });
  }

  // Set active tab on load
  let activeTab = document.querySelector(".tab.active");
  if (!activeTab) {
    activeTab = document.getElementById("home");
    if (activeTab) activeTab.classList.add("active");
  }
  if (activeTab) {
    const tabId = activeTab.id;
    const activeButton = document.querySelector(
      `.sidebar button[onclick="showTab('${tabId}')"]`,
    );
    if (activeButton) activeButton.classList.add("active");

    // Ensure initial tab logic runs (e.g., start Home data fetchers)
    // so indicators load on first visit without requiring a tab switch
    if (typeof showTab === "function") {
      showTab(tabId);
    }
  }

  // Call when page loads
  setTimeout(optimizeDashboardLayout, 500);

  // Call when switching to home tab
  const homeButton = document.querySelector(
    ".sidebar button[onclick=\"showTab('home')\"]",
  );
  if (homeButton) {
    const originalClick = homeButton.onclick;
    homeButton.onclick = function () {
      if (originalClick) originalClick.call(this);
      setTimeout(optimizeDashboardLayout, 300);
    };
  }
});

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

  // Top-level About tab handling
  if (tabId === 'about') {
    if (typeof fetchAboutInfo === 'function') fetchAboutInfo();
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
  // Load about info when opening About tab
  if (tabId === 'system-about-content') {
    if (typeof fetchAboutInfo === 'function') fetchAboutInfo();
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

// Fetch and render About info (hardware + program)
async function fetchAboutInfo() {
  const errEl = document.getElementById('about-error');
  const hwList = document.getElementById('about-hw');
  const progEl = document.getElementById('about-program');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (hwList) { hwList.innerHTML = '<li>Loading...</li>'; }
  if (progEl) { progEl.textContent = 'Loading...'; }

  try {
    const resp = await fetch('/about-info');
    const data = await resp.json();
    if (!resp.ok) throw new Error(data && data.error ? data.error : 'Failed to load');

    // Hardware rendering
    if (hwList) {
      const items = [];
      const hw = data.hardware || {};
      const toGB = (kb) => kb != null ? (kb / 1024 / 1024).toFixed(2) + ' GB' : '-';
      if (hw.model) items.push(`<li><strong style="color:#dbe7ff;">Model:</strong> <span style="color:#bfc9da;">${hw.model}</span></li>`);
      if (hw.cpu_model) items.push(`<li><strong style="color:#dbe7ff;">CPU:</strong> <span style="color:#bfc9da;">${hw.cpu_model}</span></li>`);
      if (hw.mem_total_kb != null) items.push(`<li><strong style="color:#dbe7ff;">Memory:</strong> <span style="color:#bfc9da;">${toGB(hw.mem_total_kb)}</span></li>`);
      if (hw.kernel || hw.arch) items.push(`<li><strong style="color:#dbe7ff;">Kernel/Arch:</strong> <span style="color:#bfc9da;">${hw.kernel || '-'} / ${hw.arch || '-'}</span></li>`);
      const d = hw.disk_root || {};
      if (d.total_kb != null) {
        const fmt = (kb) => (kb / 1024 / 1024).toFixed(2) + ' GB';
        items.push(`<li><strong style="color:#dbe7ff;">Disk (/):</strong> <span style="color:#bfc9da;">${fmt(d.total_kb)} total, ${fmt(d.used_kb || 0)} used, ${fmt(d.avail_kb || 0)} free (${d.use || '-'})</span></li>`);
      }
      // Storage for materials dir
      const st = hw.storage_materials || {};
      if (st.fstype || st.mount_source || st.mount_point) {
        items.push(`<li><strong style="color:#dbe7ff;">Materials mount:</strong> <span style="color:#bfc9da;">${st.mount_point || '-'} (${st.fstype || '-'})</span></li>`);
        if (st.mount_source) items.push(`<li><strong style=\"color:#dbe7ff;\">Device:</strong> <span style=\"color:#bfc9da;\">${st.mount_source}</span></li>`);
      }
      if (st.device_base || st.device_model || st.device_type || st.device_rotational != null) {
        if (st.device_base) items.push(`<li><strong style=\"color:#dbe7ff;\">Base device:</strong> <span style=\"color:#bfc9da;\">${st.device_base}</span></li>`);
        if (st.device_model) items.push(`<li><strong style=\"color:#dbe7ff;\">Model:</strong> <span style=\"color:#bfc9da;\">${st.device_model}</span></li>`);
        if (st.device_type) items.push(`<li><strong style=\"color:#dbe7ff;\">Type:</strong> <span style=\"color:#bfc9da;\">${st.device_type}</span></li>`);
        if (st.device_rotational != null) items.push(`<li><strong style=\"color:#dbe7ff;\">Rotational:</strong> <span style=\"color:#bfc9da;\">${st.device_rotational ? 'Yes (HDD)' : 'No (SSD/Flash)'}</span></li>`);
      }
      hwList.innerHTML = items.length ? items.join('') : '<li>No data</li>';
    }

    // Program rendering
    if (progEl) {
      const pr = data.program || {};
      const pkgs = Object.keys(pr);
      if (pkgs.length === 0) {
        progEl.textContent = 'No mdvr-related packages found';
      } else {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';
        pkgs.forEach((name) => {
          const p = pr[name] || {};
          const card = document.createElement('div');
          card.style.border = '1px solid #2e3a4a';
          card.style.borderRadius = '8px';
          card.style.padding = '10px';
          card.style.background = '#0f1a24';
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <strong style="color:#dbe7ff;">${p.package || name}</strong>
              <span style="color:#9fb2c7; font-size:0.9em;">${p.status || ''}</span>
            </div>
            <div style="color:#bfc9da; font-size:0.95em;">
              <div><strong style="color:#dbe7ff;">Version:</strong> ${p.version || '-'}</div>
              <div><strong style="color:#dbe7ff;">Arch:</strong> ${p.architecture || '-'}</div>
              <div><strong style="color:#dbe7ff;">Installed size:</strong> ${p.installed_size || '-'}</div>
              <div><strong style="color:#dbe7ff;">Maintainer:</strong> ${p.maintainer || '-'}</div>
              ${p.description ? `<div style="margin-top:4px; color:#9fb2c7;">${p.description}</div>` : ''}
            </div>
          `;
          container.appendChild(card);
        });
        progEl.innerHTML = '';
        progEl.appendChild(container);
      }
    }
  } catch (e) {
    console.error('Failed to fetch about info', e);
    if (errEl) { errEl.textContent = String(e); errEl.style.display = 'block'; }
    if (hwList) { hwList.innerHTML = '<li>Error</li>'; }
    if (progEl) { progEl.textContent = 'Error'; }
  }
}

// Expose to global for inline handler
window.fetchAboutInfo = fetchAboutInfo;

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
