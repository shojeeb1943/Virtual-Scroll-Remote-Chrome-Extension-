const DEFAULT_SETTINGS = {
  scrollStep: 500,
  accelerationBase: 1,
  accelerationMax: 5,
  accelerationDuration: 3000,
  holdThreshold: 300,
  doubleClickWindow: 400,
  opacity: 0.8,
  triggerZones: {
    topRight: { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 }
  },
  excludedDomains: []
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['settings'], (result) => {
      sendResponse(result.settings || DEFAULT_SETTINGS);
    });
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ settings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'CHECK_EXCLUSION') {
    const url = message.url;
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings || DEFAULT_SETTINGS;
      const isExcluded = settings.excludedDomains.some(domain => url.includes(domain));
      
      if (sender.tab?.id) {
        if (isExcluded) {
          chrome.action.setBadgeText({ text: 'OFF', tabId: sender.tab.id });
          chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: sender.tab.id });
        } else {
          chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
        }
      }
      
      sendResponse({ isExcluded });
    });
    return true;
  }
});