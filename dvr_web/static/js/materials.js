// Materials tab logic

let materialsLoaded = false;
let currentHls = null;

function bytesToSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function playMaterial(item) {
  const videoEl = document.getElementById('materials-video');
  const metaEl = document.getElementById('materials-meta');

  if (!videoEl) return;

  // Cleanup previous HLS if any
  if (currentHls) {
    currentHls.destroy();
    currentHls = null;
  }

  const url = item.url;
  const isHls = url.toLowerCase().endsWith('.m3u8');

  if (isHls && window.Hls && Hls.isSupported()) {
    currentHls = new Hls();
    currentHls.loadSource(url);
    currentHls.attachMedia(videoEl);
    currentHls.on(Hls.Events.MANIFEST_PARSED, function () {
      videoEl.play().catch(() => {});
    });
  } else {
    videoEl.src = url;
    videoEl.play().catch(() => {});
  }

  const dt = new Date(item.mtime * 1000);
  metaEl.textContent = `${item.name} • ${bytesToSize(item.size)} • ${dt.toLocaleString()}`;
}

function buildMaterialsQuery() {
  const fromEl = document.getElementById('materials-date-from');
  const toEl = document.getElementById('materials-date-to');
  const params = new URLSearchParams();
  if (fromEl && fromEl.value) params.set('date_from', fromEl.value); // yyyy-mm-dd
  if (toEl && toEl.value) params.set('date_to', toEl.value);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function loadMaterials(force = false) {
  if (materialsLoaded && !force) return;
  const listEl = document.getElementById('materials-files');
  if (!listEl) return;

  listEl.innerHTML = '<li style="padding:8px; color:#8aa0b5;">Loading...</li>';

  try {
    const resp = await fetch('/materials/list' + buildMaterialsQuery());
    const data = await resp.json();

    const files = (data && data.files) ? data.files : [];

    if (!files.length) {
      listEl.innerHTML = '<li style="padding:8px; color:#8aa0b5;">No video files found</li>';
      return;
    }

    listEl.innerHTML = '';

    files.forEach((f, idx) => {
      const li = document.createElement('li');
      li.style.padding = '8px';
      li.style.borderBottom = '1px solid #2e3a4a';
      li.style.cursor = 'pointer';
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.dataset.url = f.url;
      li.title = f.name; // show original filename on hover

      const nameSpan = document.createElement('span');
      nameSpan.textContent = f.display_name || f.name;
      nameSpan.style.color = '#dbe7ff';
      nameSpan.style.marginRight = '8px';

      const rightSpan = document.createElement('span');
      const parts = [];
      // If we already show a pretty display_name (which includes date/time),
      // don't duplicate date on the right; show only size.
      if (!f.display_name && f.recorded_date) {
        parts.push(f.recorded_date + (f.recorded_time ? ' ' + f.recorded_time : ''));
      }
      parts.push(bytesToSize(f.size));
      rightSpan.textContent = parts.join(' • ');
      rightSpan.style.color = '#8aa0b5';
      rightSpan.style.fontSize = '0.9em';

      li.appendChild(nameSpan);
      li.appendChild(rightSpan);

      li.addEventListener('click', () => {
        // remove active class from all
        Array.from(listEl.children).forEach(c => {
          c.classList.remove('active-item');
          c.style.background = '';
        });
        li.classList.add('active-item');
        li.style.background = '#1e2a38';
        playMaterial(f);
      });

      listEl.appendChild(li);

      // Autoplay first item
      if (idx === 0) {
        li.classList.add('active-item');
        li.style.background = '#1e2a38';
        playMaterial(f);
      }
    });

    materialsLoaded = true;
  } catch (e) {
    listEl.innerHTML = `<li style="padding:8px; color:#ff9b9b;">Error loading list: ${e}</li>`;
  }
}

// Optional: expose refresh function
function refreshMaterials() {
  materialsLoaded = false;
  loadMaterials(true);
}

window.loadMaterials = loadMaterials;
window.refreshMaterials = refreshMaterials;

function applyMaterialsFilter() {
  materialsLoaded = false;
  loadMaterials(true);
}

function clearMaterialsFilter() {
  const fromEl = document.getElementById('materials-date-from');
  const toEl = document.getElementById('materials-date-to');
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  applyMaterialsFilter();
}

window.applyMaterialsFilter = applyMaterialsFilter;
window.clearMaterialsFilter = clearMaterialsFilter;
