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
  }

  if (tabId === "services") {
    startServiceStatusUpdates();
  } else {
    stopServiceStatusUpdates();
  }

  if (tabId === "home") {
    startExt5vVUpdates();
    startCpuChartUpdates();
    startMemChartUpdates();
  } else if (tabId === "video-options") {
    updateReedSwitchState();
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

document.addEventListener("DOMContentLoaded", () => {
  console.log("mDVR Web Interface loaded");

  if (document.getElementById("dashboard-grid")) {
    console.log("Dashboard grid layout initialized");
  }

  const videoOptionsTab = document.getElementById("video-options");
  const fixedSaveButton = document.querySelector(".fixed-save-button");

  if (
    fixedSaveButton &&
    videoOptionsTab &&
    videoOptionsTab.classList.contains("active")
  ) {
    fixedSaveButton.style.display = "block";
  }
});
