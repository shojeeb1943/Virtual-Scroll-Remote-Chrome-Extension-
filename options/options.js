(function() {
  'use strict';

  let settings = {};

  function loadSettings() {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (result) => {
      settings = result || {};
      initializeUI();
    });
  }

  function initializeUI() {
    document.getElementById('scrollStep').value = settings.scrollStep || 500;
    document.getElementById('scrollStepValue').textContent = (settings.scrollStep || 500) + 'px';

    document.getElementById('accelMax').value = settings.accelerationMax || 5;
    document.getElementById('accelMaxValue').textContent = (settings.accelerationMax || 5) + 'x';

    document.getElementById('accelDuration').value = settings.accelerationDuration || 3000;
    document.getElementById('accelDurationValue').textContent = ((settings.accelerationDuration || 3000) / 1000) + ' seconds';

    document.getElementById('holdThreshold').value = settings.holdThreshold || 300;
    document.getElementById('holdThresholdValue').textContent = (settings.holdThreshold || 300) + 'ms';

    document.getElementById('doubleClickWindow').value = settings.doubleClickWindow || 400;
    document.getElementById('doubleClickWindowValue').textContent = (settings.doubleClickWindow || 400) + 'ms';

    document.getElementById('opacity').value = settings.opacity || 0.8;
    document.getElementById('opacityValue').textContent = settings.opacity || 0.8;

    renderExclusionList();
    setupZoneDrag();
  }

  function renderExclusionList() {
    const list = document.getElementById('exclusionList');
    const domains = settings.excludedDomains || [];
    list.innerHTML = domains.length === 0 ? '<p style="color: #999; padding: 8px;">No exclusions</p>' : '';

    domains.forEach((domain, index) => {
      const item = document.createElement('div');
      item.className = 'exclusion-item';
      item.innerHTML = `
        <span>${domain}</span>
        <button data-index="${index}">Remove</button>
      `;
      list.appendChild(item);
    });
  }

  function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim().toLowerCase();
    if (!trimmed) return '';
    
    try {
      const urlToParse = trimmed.startsWith('http') ? trimmed : 'https://' + trimmed;
      const urlObj = new URL(urlToParse);
      const domain = urlObj.hostname.replace(/^www\./, '');
      return domain || '';
    } catch {
      const cleaned = trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      return cleaned || '';
    }
  }

  function saveSettings() {
    settings.scrollStep = parseInt(document.getElementById('scrollStep').value);
    settings.accelerationMax = parseFloat(document.getElementById('accelMax').value);
    settings.accelerationDuration = parseInt(document.getElementById('accelDuration').value);
    settings.holdThreshold = parseInt(document.getElementById('holdThreshold').value);
    settings.doubleClickWindow = parseInt(document.getElementById('doubleClickWindow').value);
    settings.opacity = parseFloat(document.getElementById('opacity').value);

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, () => {
      console.log('Settings saved');
    });
  }

  function setupZoneDrag() {
    const markers = document.querySelectorAll('.zone-marker');
    let activeMarker = null;

    markers.forEach(marker => {
      marker.addEventListener('dragstart', (e) => {
        activeMarker = marker;
        marker.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      marker.addEventListener('dragend', () => {
        marker.classList.remove('dragging');
        activeMarker = null;
      });
    });

    document.getElementById('zonePreview').addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    document.getElementById('zonePreview').addEventListener('drop', (e) => {
      e.preventDefault();
      if (!activeMarker) return;

      const rect = e.currentTarget.querySelector('.preview-viewport').getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      activeMarker.style.left = x + '%';
      activeMarker.style.top = y + '%';

      const zone = activeMarker.id === 'topRightMarker' ? 'topRight' : 'bottomRight';
      if (!settings.triggerZones) settings.triggerZones = {};
      settings.triggerZones[zone] = { x, y };

      saveSettings();
    });

    document.getElementById('resetZones').addEventListener('click', () => {
      document.getElementById('topRightMarker').style.left = '';
      document.getElementById('topRightMarker').style.top = '';
      document.getElementById('bottomRightMarker').style.left = '';
      document.getElementById('bottomRightMarker').style.top = '';
      settings.triggerZones = { topRight: { x: 0, y: 0 }, bottomRight: { x: 0, y: 0 } };
      saveSettings();
    });
  }

  document.getElementById('scrollStep').addEventListener('input', (e) => {
    document.getElementById('scrollStepValue').textContent = e.target.value + 'px';
  });
  document.getElementById('scrollStep').addEventListener('change', saveSettings);

  document.getElementById('accelMax').addEventListener('input', (e) => {
    document.getElementById('accelMaxValue').textContent = e.target.value + 'x';
  });
  document.getElementById('accelMax').addEventListener('change', saveSettings);

  document.getElementById('accelDuration').addEventListener('input', (e) => {
    document.getElementById('accelDurationValue').textContent = (e.target.value / 1000) + ' seconds';
  });
  document.getElementById('accelDuration').addEventListener('change', saveSettings);

  document.getElementById('holdThreshold').addEventListener('input', (e) => {
    document.getElementById('holdThresholdValue').textContent = e.target.value + 'ms';
  });
  document.getElementById('holdThreshold').addEventListener('change', saveSettings);

  document.getElementById('doubleClickWindow').addEventListener('input', (e) => {
    document.getElementById('doubleClickWindowValue').textContent = e.target.value + 'ms';
  });
  document.getElementById('doubleClickWindow').addEventListener('change', saveSettings);

  document.getElementById('opacity').addEventListener('input', (e) => {
    document.getElementById('opacityValue').textContent = e.target.value;
  });
  document.getElementById('opacity').addEventListener('change', saveSettings);

  document.getElementById('addDomain').addEventListener('click', () => {
    const input = document.getElementById('newDomain');
    const domain = sanitizeUrl(input.value.trim());
    if (domain) {
      if (!settings.excludedDomains) settings.excludedDomains = [];
      if (!settings.excludedDomains.includes(domain)) {
        settings.excludedDomains.push(domain);
        input.value = '';
        renderExclusionList();
        saveSettings();
      }
    }
  });

  document.getElementById('exclusionList').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const index = parseInt(e.target.dataset.index);
      settings.excludedDomains.splice(index, 1);
      renderExclusionList();
      saveSettings();
    }
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(item.dataset.section).classList.add('active');
    });
  });

  loadSettings();
})();