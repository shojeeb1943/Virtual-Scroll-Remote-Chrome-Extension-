# 📚 Virtual Scroll Remote - Technical Documentation

> For developers and contributors who want to understand the internals.

---

## 🏗️ Architecture Overview

Virtual Scroll Remote follows the **Manifest V3** standard with a modular architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Browser                        │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   Popup UI      │    │      Options Page           │ │
│  │  (Quick Toggle) │    │   (Full Configuration)      │ │
│  └────────┬────────┘    └─────────────┬─────────────┘ │
│           │                             │                │
│           └──────────┬─────────────────┘                │
│                      ▼                                  │
│           ┌─────────────────────┐                       │
│           │  Background Worker  │                       │
│           │  (Service Worker)   │◄── chrome.storage    │
│           └──────────┬──────────┘                       │
│                      │                                   │
│                      ▼ (injected)                        │
│           ┌─────────────────────┐                       │
│           │    Content Script  │◄── Shadow DOM          │
│           │   (Scroll Engine)  │                       │
│           └─────────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

---

## 🔑 Core Concepts

### 1. The 1-2-Hold System

The extension distinguishes between three interaction types using a **State Machine**:

```
┌──────────────────────────────────────────────────────────────┐
│                        MOUSE DOWN                            │
└──────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   [0-300ms]            [300ms+]           [Double Click]
   (release)            (hold)            (<400ms gap)
          │                   │                   │
          ▼                   ▼                   ▼
    SINGLE CLICK       CONTINUOUS         DOUBLE CLICK
    (scroll by step)   SCROLL             (warp to top/bottom)
                      (accelerating)
```

### 2. Shadow DOM Encapsulation

All UI elements are created inside a **Shadow Root** with `mode: 'closed'`:

```javascript
this.container = document.createElement('div');
this.container.id = 'virtual-scroll-remote';
document.body.appendChild(this.container);
this.shadowRoot = this.container.attachShadow({ mode: 'closed' });
```

**Why this matters:**
- Website CSS cannot penetrate our styles
- Our CSS cannot leak and break websites
- JavaScript on the page cannot interact with our elements

### 3. Trigger Zones

Invisible detection zones at screen edges:

- **Top-Right Zone**: Reveals "Up" button
- **Bottom-Right Zone**: Reveals "Down" button  
- **Left Edge Zone**: Reveals "Left" button (horizontal scroll)
- **Right Edge Zone**: Reveals "Right" button (horizontal scroll)

Each zone has:
- 80px width, 150px height (vertical)
- 60px width, 100px height (horizontal)
- Opacity transition: 200ms fade-in

### 4. Acceleration Curve

Continuous scrolling uses a **non-linear acceleration**:

```javascript
const elapsed = Date.now() - startTime;
const progress = Math.min(elapsed / settings.accelerationDuration, 1);
currentSpeed = accelerationBase + (accelerationMax - accelerationBase) * progress;
```

- Starts at 1x (base speed)
- Reaches 5x (max) after 3 seconds
- Smooth interpolation between

---

## 💾 Data Model

### Settings Object (chrome.storage.local)

```javascript
{
  // Scroll behavior
  scrollStep: 500,           // pixels per single click
  accelerationBase: 1,       // starting speed multiplier
  accelerationMax: 5,        // max speed multiplier
  accelerationDuration: 3000, // ms to reach max speed
  
  // Interaction timing
  holdThreshold: 300,        // ms before continuous scroll starts
  doubleClickWindow: 400,    // max ms between clicks
  
  // Appearance
  opacity: 0.8,              // button opacity (never exceeds this)
  
  // Zone positioning (for future use)
  triggerZones: {
    topRight: { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 }
  },
  
  // Site exclusions
  excludedDomains: ['maps.google.com', 'figma.com']
}
```

### Runtime State

```javascript
{
  isEnabled: true  // Global on/off toggle (separate from exclusions)
}
```

---

## 🔌 API Reference

### Background Worker → Content Script Messages

| Message Type | Direction | Payload | Response |
|--------------|-----------|---------|----------|
| `GET_SETTINGS` | Content → Background | none | Settings object |
| `SAVE_SETTINGS` | Options → Background | `{ settings }` | `{ success: true }` |
| `CHECK_EXCLUSION` | Content → Background | `{ url }` | `{ isExcluded: boolean }` |

### Event Listeners

```javascript
// Keyboard shortcut (Ctrl+Shift+S)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-scroll') {
    // Toggle isEnabled in storage
  }
});
```

---

## 🎨 Styling System

### Color Palette

```css
/* Primary (active states) */
--primary: #3B82F6;        /* Vibrant blue */

/* Button base (dark glass) */
--button-bg: rgba(30, 30, 30, 0.85);
--button-border: rgba(255, 255, 255, 0.2);
--button-shadow: rgba(0, 0, 0, 0.3);

/* Icons */
--icon-color: #ffffff;
--icon-shadow: rgba(0, 0, 0, 0.3);
```

### Animations

| Animation | Duration | Easing | Purpose |
|-----------|----------|--------|---------|
| Button fade-in | 200ms | ease-in | Reveal on hover |
| Button fade-out | 400ms | ease-out | Hide on leave |
| Hover scale | 150ms | ease | Button feedback |
| Pulse (hold) | 1000ms | ease-in-out | Continuous scroll indicator |

### Z-Index Strategy

- **Buttons**: 2147483647 (MAX_INT - 1)
- **Why?** Some websites have high z-index elements. We need to be on top.

---

## 🔒 Security & Privacy

### Permissions

```json
{
  "permissions": ["storage", "commands"],
  "host_permissions": ["<all_urls>"]
}
```

- **storage**: Local settings persistence
- **commands**: Keyboard shortcut registration
- **host_permissions**: Required to inject content script on all pages

### Data Handling

- ✅ 100% local storage (chrome.storage.local)
- ✅ No external API calls
- ✅ No telemetry or analytics
- ✅ URL sanitization on exclusions (strips protocol, www, query params)

---

## 🧹 Memory Management

The extension implements cleanup on:

1. **Page unload** (`window.addEventListener('unload')`)
2. **Tab visibility change** (`document.addEventListener('visibilitychange')`)

Cleanup includes:
- Clearing all setInterval timers
- Clearing all setTimeout timers
- Removing DOM container from page

---

## ♿ Accessibility

### Implemented Features

- `role="button"` on all interactive elements
- `aria-label` for screen readers
- `tabindex="0"` for keyboard navigation
- Keyboard handlers: Enter and Space activate buttons
- High contrast white icons on dark buttons
- Focus visible states

### WCAG Compliance

- Icons meet contrast ratios against glass background
- Focus states are clearly visible
- No reliance on color alone for state indication

---

## 🐛 Debugging Tips

### Enable Extension Logging

In content script, console logs appear in DevTools of the page you're viewing.

### Check Extension State

1. Open popup - shows current page status
2. Check badge - shows OFF/PAUSED/empty
3. Visit Options - full settings view

### Common Issues

| Issue | Solution |
|-------|----------|
| Buttons not appearing | Check exclusion list, check if globally paused |
| Scroll not working | Verify page has scrollable content |
| Icons showing then disappearing | Badge clears after check - normal behavior |

---

## 🚀 Future Enhancements

Planned features (not yet implemented):

- [ ] **Preset Profiles** - Reading Mode, Social Media Mode
- [ ] **Gesture Support** - Swipe detection
- [ ] **Sync Settings** - Chrome sync API
- [ ] **Mobile Support** - Touch-friendly variants
- [ ] **Multiple Profiles** - Different settings per use case

---

## 📁 File Structure

```
Virtual-Scroll-Remote/
├── manifest.json          # Extension manifest
├── background.js          # Service worker
│
├── content/
│   └── content.js         # Main scroll engine
│       ├── VirtualScrollRemote class
│       ├── State machine logic
│       ├── Shadow DOM injection
│       └── Event handlers
│
├── options/
│   ├── options.html       # Settings UI
│   └── options.js         # Settings logic
│
├── popup/
│   ├── popup.html         # Quick toggle UI
│   └── popup.js           # Popup logic
│
└── icons/                 # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🤝 Contributing Guidelines

1. **Test on multiple sites** - Different websites behave differently
2. **Check memory leaks** - Use Chrome DevTools Memory profiler
3. **Verify Shadow DOM** - Ensure isolation works
4. **Test accessibility** - Use screen reader and keyboard only

---

*Last updated: April 2026*
*Version: 1.0.0*
*License: MIT*