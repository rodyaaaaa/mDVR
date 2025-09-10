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

// Mobile sidebar controls
function openMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const burger = document.getElementById('hamburger-btn');
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
  if (burger) burger.setAttribute('aria-expanded', 'true');
  // On phones, prevent body scroll when dropdown menu is open
  if (window.matchMedia('(max-width: 600px)').matches) {
    document.body.classList.add('noscroll');
  }
}

function closeMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const burger = document.getElementById('hamburger-btn');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
  if (burger) burger.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('noscroll');
}

document.addEventListener('DOMContentLoaded', () => {
  const burger = document.getElementById('hamburger-btn');
  const backdrop = document.getElementById('sidebar-backdrop');
  const sidebar = document.getElementById('sidebar');
  const headerEl = document.querySelector('header');

  if (burger) {
    burger.addEventListener('click', () => {
      const isOpen = sidebar && sidebar.classList.contains('open');
      if (isOpen) closeMobileMenu(); else openMobileMenu();
    });
  }
  if (backdrop) {
    backdrop.addEventListener('click', closeMobileMenu);
  }
  if (sidebar) {
    sidebar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Close menu after selecting a tab on mobile, except when opening a submenu
        if (!window.matchMedia('(max-width: 1024px)').matches) return;
        // If a mobile submenu is currently open, do not auto-close on main button clicks
        if (sidebar.classList && sidebar.classList.contains('mobile-submenu-open')) return;
        // On phones, prevent auto-close for buttons that open submenus (Settings/System)
        const oc = btn.getAttribute('onclick') || '';
        const isPhone = window.matchMedia('(max-width: 600px)').matches;
        const opensSubmenu = isPhone && (oc.includes("showTab('video-options')") || oc.includes("showTab('system')"));
        if (opensSubmenu) return;
        closeMobileMenu();
      });
    });
  }
  // Toggle menu by clicking header on smartphones only
  if (headerEl) {
    headerEl.addEventListener('click', (e) => {
      // Only act on phone widths
      if (!window.matchMedia('(max-width: 600px)').matches) return;
      // Avoid toggling when clicking interactive controls inside header (if any)
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'LABEL' || target.closest('.mode-switch'))) return;
      const isOpen = sidebar && sidebar.classList.contains('open');
      if (isOpen) closeMobileMenu(); else openMobileMenu();
    });
  }
  // Close with Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileMenu();
  });
  // Ensure closed when resizing out of phone breakpoint
  window.addEventListener('resize', () => {
    if (window.innerWidth > 600) closeMobileMenu();
  });

  // Mobile submenu setup for Settings and System
  if (sidebar) {
    // Ensure submenu container exists
    let submenuContainer = sidebar.querySelector('.mobile-submenu-container');
    if (!submenuContainer) {
      submenuContainer = document.createElement('div');
      submenuContainer.className = 'mobile-submenu-container';
      sidebar.appendChild(submenuContainer);
    }

    const createBackButton = (label = 'Back') => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mobile-back-btn';
      btn.innerHTML = `
        <span aria-hidden="true">&#8592;</span>
        <span>${label}</span>
      `;
      btn.addEventListener('click', () => closeMobileSubmenu());
      return btn;
    };

    const clearSubmenu = () => {
      if (submenuContainer) submenuContainer.innerHTML = '';
    };

    const openMobileSubmenu = (context) => {
      if (!window.matchMedia('(max-width: 600px)').matches) return false; // Only on phones
      clearSubmenu();
      const list = document.createElement('div');
      list.className = 'mobile-submenu-list';

      if (context === 'settings') {
        // Build from #video-options .settings-tab buttons
        const tabs = document.querySelectorAll('#video-options .settings-tab');
        tabs.forEach((tabBtn) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'submenu-item';
          item.textContent = tabBtn.textContent.trim();
          // Derive content id from the tab id, or fallback by parsing onclick
          let contentId = '';
          if (tabBtn.id && tabBtn.id.endsWith('-tab')) {
            contentId = tabBtn.id.replace(/-tab$/, '-content');
          } else {
            const oc = tabBtn.getAttribute('onclick') || '';
            const m = oc.match(/showSettingsTab\('([^']+)'\)/);
            if (m) contentId = m[1];
          }
          item.addEventListener('click', () => {
            showTab('video-options');
            if (typeof showSettingsTab === 'function' && contentId) {
              showSettingsTab(contentId);
            }
            // Close menus on selection
            closeMobileSubmenu();
            closeMobileMenu();
          });
          list.appendChild(item);
        });
        submenuContainer.appendChild(createBackButton('Back'));
        submenuContainer.appendChild(list);
        sidebar.classList.add('mobile-submenu-open');
        return true;
      }

      if (context === 'system') {
        const tabs = document.querySelectorAll('#system .settings-tab');
        tabs.forEach((tabBtn) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'submenu-item';
          item.textContent = tabBtn.textContent.trim();
          let contentId = '';
          if (tabBtn.id && tabBtn.id.endsWith('-tab')) {
            contentId = tabBtn.id.replace(/-tab$/, '-content');
          } else {
            const oc = tabBtn.getAttribute('onclick') || '';
            const m = oc.match(/showSystemTab\('([^']+)'\)/);
            if (m) contentId = m[1];
          }
          item.addEventListener('click', () => {
            showTab('system');
            if (typeof showSystemTab === 'function' && contentId) {
              showSystemTab(contentId);
            }
            closeMobileSubmenu();
            closeMobileMenu();
          });
          list.appendChild(item);
        });
        submenuContainer.appendChild(createBackButton('Back'));
        submenuContainer.appendChild(list);
        sidebar.classList.add('mobile-submenu-open');
        return true;
      }

      return false;
    };

    const closeMobileSubmenu = () => {
      clearSubmenu();
      sidebar.classList.remove('mobile-submenu-open');
    };

    // Hook Settings and System buttons
    const btnSettings = sidebar.querySelector('button[onclick="showTab(\'video-options\')"]');
    const btnSystem = sidebar.querySelector('button[onclick="showTab(\'system\')"]');

    if (btnSettings) {
      const original = btnSettings.onclick;
      btnSettings.onclick = function (e) {
        if (e) e.stopPropagation();
        if (window.matchMedia('(max-width: 600px)').matches) {
          e && e.preventDefault();
          if (!openMobileSubmenu('settings') && original) original.call(this, e);
        } else if (original) {
          original.call(this, e);
        }
      };
    }

    if (btnSystem) {
      const original = btnSystem.onclick;
      btnSystem.onclick = function (e) {
        if (e) e.stopPropagation();
        if (window.matchMedia('(max-width: 600px)').matches) {
          e && e.preventDefault();
          if (!openMobileSubmenu('system') && original) original.call(this, e);
        } else if (original) {
          original.call(this, e);
        }
      };
    }

    // Close submenu when leaving mobile width
    window.addEventListener('resize', () => {
      if (!window.matchMedia('(max-width: 600px)').matches) {
        closeMobileSubmenu();
      }
    });
  }
});

// ================= Floating Action Burger (FAB) =================
(() => {
  const isPhone = () => window.matchMedia('(max-width: 600px)').matches;
  let fabRoot, fabBtn, fabSheet;

  function ensureFab() {
    fabRoot = document.getElementById('fab-menu');
    fabBtn = document.getElementById('fab-toggle');
    fabSheet = document.getElementById('fab-menu-sheet');
    if (!fabRoot || !fabBtn || !fabSheet) return false;
    if (!fabBtn._fabBound) {
      // Prevent clicks/touches inside FAB from bubbling to the document handler
      const stop = (e) => e.stopPropagation();
      fabRoot.addEventListener('click', stop);
      fabRoot.addEventListener('touchstart', stop, { passive: true });
      fabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = fabRoot.classList.toggle('open');
        fabBtn.setAttribute('aria-expanded', String(open));
      });
      fabSheet.addEventListener('click', stop);
      fabSheet.addEventListener('touchstart', stop, { passive: true });
      document.addEventListener('click', (e) => {
        if (!fabRoot) return;
        if (!fabRoot.contains(e.target)) {
          fabRoot.classList.remove('open');
          if (fabBtn) fabBtn.setAttribute('aria-expanded', 'false');
        }
      });
      fabBtn._fabBound = true;
    }
    return true;
  }

  function clearFab() {
    if (fabSheet) fabSheet.innerHTML = '';
    if (fabRoot) {
      fabRoot.setAttribute('aria-hidden', 'true');
      fabRoot.classList.remove('open');
    }
    // Remove any prior hijack markers
    document.querySelectorAll('.fab-hijack').forEach(el => el.classList.remove('fab-hijack'));
  }

  function cloneToFab(btn) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = btn.textContent.trim() || 'Action';
    const oc = btn.getAttribute('onclick');
    if (oc) {
      item.setAttribute('onclick', oc);
    } else {
      item.addEventListener('click', () => btn.click());
    }
    // Carry data-* attributes if any
    Array.from(btn.attributes).forEach(attr => {
      if (attr.name.startsWith('data-')) item.setAttribute(attr.name, attr.value);
    });
    return item;
  }

  function findContextActions() {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return { actions: [], hijackContainer: null };

    const activeSettings = activeTab.querySelector('.settings-content.active') || activeTab.querySelector('.settings-content');
    if (activeSettings) {
      const header = activeSettings.querySelector('.settings-section-header');
      if (header) {
        const buttons = Array.from(header.querySelectorAll('button'));
        return { actions: buttons, hijackContainer: activeSettings };
      }
    }

    const header = activeTab.querySelector('.settings-section-header');
    if (header) {
      const buttons = Array.from(header.querySelectorAll('button'));
      return { actions: buttons, hijackContainer: activeTab };
    }
    return { actions: [], hijackContainer: null };
  }

  function updateFabForContext() {
    if (!ensureFab()) return;
    clearFab();
    if (!isPhone()) return;

    // Do not show FAB on Home or About
    const activeTabEl = document.querySelector('.tab.active');
    const activeId = activeTabEl ? activeTabEl.id : '';
    if (activeId === 'home' || activeId === 'about') return;

    const { actions, hijackContainer } = findContextActions();
    const useful = actions.filter(b => b && !b.disabled && b.offsetParent !== null);
    if (!useful.length) return;

    useful.forEach((btn) => {
      const item = cloneToFab(btn);
      item.addEventListener('click', () => {
        if (fabRoot) fabRoot.classList.remove('open');
        if (fabBtn) fabBtn.setAttribute('aria-expanded', 'false');
      });
      fabSheet.appendChild(item);
    });

    if (hijackContainer) hijackContainer.classList.add('fab-hijack');
    fabRoot.removeAttribute('aria-hidden');
  }

  window.updateFabForContext = updateFabForContext;

  document.addEventListener('DOMContentLoaded', () => {
    ensureFab();
    updateFabForContext();

    // Update after any sidebar interaction (tab switch)
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl && !sidebarEl._fabBound) {
      sidebarEl.addEventListener('click', () => setTimeout(() => updateFabForContext(), 0));
      sidebarEl._fabBound = true;
    }

    // Observe changes to active tab/section classes and refresh FAB
    const observeTargets = () => {
      const targets = [
        ...document.querySelectorAll('.tab'),
        ...document.querySelectorAll('.settings-content'),
      ];
      const obs = new MutationObserver(() => {
        clearTimeout(rto);
        rto = setTimeout(() => updateFabForContext(), 50);
      });
      targets.forEach(t => obs.observe(t, { attributes: true, attributeFilter: ['class'] }));
    };
    observeTargets();
  });

  let rto;
  window.addEventListener('resize', () => {
    clearTimeout(rto);
    rto = setTimeout(() => updateFabForContext(), 150);
  });
})();

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

      // Close mobile menu if open
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('open')) closeMobileMenu();

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

    // Close mobile menu if open
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) closeMobileMenu();

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

  // Update FAB based on new tab
  if (typeof window.updateFabForContext === 'function') {
    setTimeout(() => window.updateFabForContext(), 50);
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
  // Initialize Logs tab
  if (tabId === 'system-logs-content') {
    if (typeof initLogsTab === 'function') initLogsTab();
  }
  // Load about info when opening About tab
  if (tabId === 'system-about-content') {
    if (typeof fetchAboutInfo === 'function') fetchAboutInfo();
  }

  // Update FAB for System sub-tabs
  if (typeof window.updateFabForContext === 'function') {
    setTimeout(() => window.updateFabForContext(), 50);
  }
}

// Expose to global for inline handlers
window.showSystemTab = showSystemTab;

// Patch showSettingsTab to also refresh FAB after switching sub-tabs
if (typeof window.showSettingsTab === 'function') {
  const __origShowSettingsTab = window.showSettingsTab;
  window.showSettingsTab = function(tabId) {
    const res = __origShowSettingsTab.call(this, tabId);
    if (typeof window.updateFabForContext === 'function') {
      setTimeout(() => window.updateFabForContext(), 50);
    }
    return res;
  };
}

// Fetch and render network info
async function fetchNetworkInfo() {
  try {
    const ipv4El = document.getElementById('net-ipv4-list');
    const listEl = document.getElementById('network-interfaces');
    const tableBody = document.querySelector('#network-table tbody');
    if (ipv4El) ipv4El.textContent = 'Loading...';
    if (listEl) listEl.innerHTML = '';
    if (tableBody) tableBody.innerHTML = '';

    const resp = await fetch('/get-network-info');
    const data = await resp.json();

    if (ipv4El) ipv4El.textContent = (data.ipv4 && data.ipv4.length) ? data.ipv4.join(', ') : '-';

    if ((listEl || tableBody) && Array.isArray(data.interfaces)) {
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

        if (listEl) listEl.appendChild(card);

        // Populate table row
        if (tableBody) {
          const tr = document.createElement('tr');

          const ipv4s = (itf.addresses || [])
            .filter(a => a && a.family === 'inet' && a.local)
            .map(a => a.local);

          const priority = (itf.priority === 0 || itf.priority) ? String(itf.priority) : '-';
          const metrics = Array.isArray(itf.route_metrics) && itf.route_metrics.length
            ? itf.route_metrics.join(', ')
            : '-';

          tr.innerHTML = `
            <td>${itf.name || '-'}</td>
            <td>${itf.state || '-'}</td>
            <td>${ipv4s.length ? ipv4s.join(', ') : '-'}</td>
            <td>${itf.mac || '-'}</td>
            <td>${itf.mtu != null ? itf.mtu : '-'}</td>
            <td>${priority}</td>
            <td>${metrics}</td>
          `;
          tableBody.appendChild(tr);
        }
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

// Run network speed test and render results
async function runNetworkSpeedtest() {
  const btn = document.getElementById('speedtest-btn');
  const statusEl = document.getElementById('speedtest-status');
  const resultsEl = document.getElementById('speedtest-results');
  const restoreBtn = () => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Run Speed Test';
    }
  };
  try {
    if (statusEl) statusEl.textContent = 'Running speed test... This may take up to 1–2 minutes.';
    if (resultsEl) resultsEl.textContent = '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Running...';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000); // 3 min safety timeout
    const res = await fetch('/api/network-speedtest', { signal: controller.signal });
    clearTimeout(timeout);

    let data = {};
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) ? data.error || data.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    if (!data || data.success === false) {
      const msg = (data && (data.error || data.message)) ? data.error || data.message : 'Unknown error';
      throw new Error(msg);
    }

    const lines = [];
    if (data.ping_ms != null) lines.push(`Ping: ${Number(data.ping_ms).toFixed(1)} ms`);
    if (data.download_mbps != null) lines.push(`Download: ${Number(data.download_mbps).toFixed(2)} Mbps`);
    if (data.upload_mbps != null) lines.push(`Upload: ${Number(data.upload_mbps).toFixed(2)} Mbps`);
    if (data.server) {
      const s = data.server;
      const label = [s.sponsor, s.name, s.country].filter(Boolean).join(' — ');
      lines.push(`Server: ${label}${s.host ? ` (${s.host})` : ''}`);
    }
    if (data.timestamp) lines.push(`Time: ${data.timestamp}`);

    if (statusEl) statusEl.textContent = 'Completed';
    if (resultsEl) resultsEl.textContent = lines.join('\n');
  } catch (e) {
    console.error('Speedtest error', e);
    if (statusEl) statusEl.textContent = 'Error';
    if (resultsEl) resultsEl.textContent = `Failed to run speed test: ${e && e.message ? e.message : e}`;
  } finally {
    restoreBtn();
  }
}

// Expose to global for inline handler
window.runNetworkSpeedtest = runNetworkSpeedtest;

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

// Reboot device from Control tab
async function rebootDevice() {
  try {
    if (!confirm("Are you sure you want to restart the device now?")) return;
    const btn = document.getElementById('reboot-device-btn');
    if (btn) btn.disabled = true;
    showPreloader();
    const res = await fetch('/reboot', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const err = (data && data.error) ? data.error : `HTTP ${res.status}`;
      showNotification(`Failed to initiate reboot: ${err}`, true);
      if (btn) btn.disabled = false;
      hidePreloader();
      return;
    }
    showNotification('Reboot initiated. The page will become unavailable shortly.');
    // Give user a visual countdown before the page likely drops
    let seconds = 10;
    const int = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(int);
      }
    }, 1000);
  } catch (e) {
    console.error('rebootDevice error', e);
    showNotification(`Failed to initiate reboot: ${e}`, true);
  }
}

// Expose to global for inline handler
window.rebootDevice = rebootDevice;

// ================= Logs Tab =================
const logsState = {
  service: '',
  file: '',
  offset: 0,
  limit: 200,
};

async function initLogsTab() {
  try {
    // Reset state
    logsState.service = '';
    logsState.file = '';
    logsState.offset = 0;
    const svcSel = document.getElementById('logs-service-select');
    const fileSel = document.getElementById('logs-file-select');
    const viewer = document.getElementById('logs-viewer');
    const meta = document.getElementById('logs-meta');
    if (svcSel) { svcSel.innerHTML = '<option value="" disabled selected hidden>Select service...</option>'; }
    if (fileSel) { fileSel.innerHTML = '<option value="" disabled selected hidden>Select file...</option>'; }
    if (viewer) viewer.textContent = 'Loading services...';
    if (meta) meta.textContent = '-';
    await fetchLogServices();
    if (viewer && (!logsState.service || !logsState.file)) {
      viewer.textContent = 'Select a service and a file...';
    }
  } catch (e) {
    console.error('initLogsTab error', e);
  }
}

async function fetchLogServices() {
  const svcSel = document.getElementById('logs-service-select');
  try {
    const res = await fetch('/logs/list-services');
    const data = await res.json();
    const services = Array.isArray(data.services) ? data.services : [];
    if (svcSel) {
      // Preserve first placeholder
      services.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        svcSel.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('fetchLogServices error', e);
  }
}

async function onLogsServiceChange() {
  const svcSel = document.getElementById('logs-service-select');
  const fileSel = document.getElementById('logs-file-select');
  const viewer = document.getElementById('logs-viewer');
  const svc = svcSel ? svcSel.value : '';
  logsState.service = svc;
  logsState.file = '';
  logsState.offset = 0;
  if (fileSel) {
    fileSel.innerHTML = '<option value="" disabled selected hidden>Select file...</option>';
  }
  if (viewer) viewer.textContent = 'Loading files...';
  await fetchLogFiles(svc);
  if (viewer) viewer.textContent = 'Select a file...';
}

async function fetchLogFiles(service) {
  const fileSel = document.getElementById('logs-file-select');
  try {
    const url = new URL('/logs/list-files', window.location.origin);
    url.searchParams.set('service', service);
    const res = await fetch(url);
    const data = await res.json();
    const files = Array.isArray(data.files) ? data.files : [];
    if (fileSel) {
      files.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      files.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.name;
        const date = f.mtime ? new Date(f.mtime * 1000).toLocaleString() : '';
        opt.textContent = date ? `${f.name} — ${date}` : f.name;
        fileSel.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('fetchLogFiles error', e);
  }
}

async function onLogsFileChange() {
  const fileSel = document.getElementById('logs-file-select');
  const f = fileSel ? fileSel.value : '';
  logsState.file = f;
  logsState.offset = 0;
  await loadLogsPage();
}

async function loadLogsPage() {
  const viewer = document.getElementById('logs-viewer');
  const meta = document.getElementById('logs-meta');
  if (!logsState.service || !logsState.file) {
    if (viewer) viewer.textContent = 'Select a service and a file...';
    if (meta) meta.textContent = '-';
    return;
  }
  try {
    if (viewer) viewer.textContent = 'Loading...';
    const url = new URL('/logs/read', window.location.origin);
    url.searchParams.set('service', logsState.service);
    url.searchParams.set('file', logsState.file);
    url.searchParams.set('limit', String(logsState.limit));
    url.searchParams.set('offset', String(logsState.offset));
    const res = await fetch(url);
    const data = await res.json();
    const lines = Array.isArray(data.lines) ? data.lines : [];
    if (viewer) viewer.textContent = lines.join('\n');
    if (meta) meta.textContent = `${logsState.service}/${logsState.file} • lines: ${lines.length} • offset: ${logsState.offset}`;
    // Keep next_offset in state for convenience
    if (typeof data.next_offset === 'number') logsState.next_offset = data.next_offset;
  } catch (e) {
    console.error('loadLogsPage error', e);
    if (viewer) viewer.textContent = 'Error loading logs';
  }
}

async function loadOlderLogs() {
  if (!logsState.service || !logsState.file) return;
  // Increase offset to move further back in time
  logsState.offset = typeof logsState.next_offset === 'number'
    ? logsState.next_offset
    : logsState.offset + logsState.limit;
  await loadLogsPage();
}

async function loadNewerLogs() {
  if (!logsState.service || !logsState.file) return;
  // Decrease offset towards 0 (newest)
  logsState.offset = Math.max(0, logsState.offset - logsState.limit);
  await loadLogsPage();
}

async function reloadLogsView() {
  await loadLogsPage();
}

// Expose to global for inline handlers
window.initLogsTab = initLogsTab;
window.onLogsServiceChange = onLogsServiceChange;
window.onLogsFileChange = onLogsFileChange;
window.loadOlderLogs = loadOlderLogs;
window.loadNewerLogs = loadNewerLogs;
window.reloadLogsView = reloadLogsView;
