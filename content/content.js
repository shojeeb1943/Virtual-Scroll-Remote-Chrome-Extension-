(function() {
  'use strict';

  const CLICK_HOLD_THRESHOLD = 300;
  const DOUBLE_CLICK_THRESHOLD = 400;
  const DEBOUNCE_DELAY = 100;

  class VirtualScrollRemote {
    constructor() {
      this.settings = null;
      this.shadowRoot = null;
      this.container = null;
      this.upButton = null;
      this.downButton = null;
      this.scrollInterval = null;
      this.clickState = {
        direction: null,
        mousedownTime: 0,
        lastClickTime: 0,
        holdTimeout: null,
        isHolding: false,
        isScrolling: false
      };
      this.debounceTimer = null;
      this.init();
    }

    async init() {
      await this.loadSettings();
      if (await this.isExcluded()) return;
      this.createShadowDOM();
      this.createTriggerZones();
      this.createButtons();
      this.attachEventListeners();
      this.initOnboarding();
      this.setupCleanup();
    }

    initOnboarding() {
      const storageKey = 'virtualScrollOnboardingShown';
      if (sessionStorage.getItem(storageKey)) return;
      
      sessionStorage.setItem(storageKey, 'true');
      
      setTimeout(() => {
        this.showOnboarding();
      }, 500);
    }

    showOnboarding() {
      const tooltip = document.createElement('div');
      tooltip.className = 'onboarding-tooltip';
      tooltip.innerHTML = `
        <div class="onboarding-step" data-step="1">
          <div class="onboarding-content">
            <div class="onboarding-number">1</div>
            <div class="onboarding-text">Hover the right edge to reveal scroll buttons</div>
          </div>
          <button class="onboarding-next" data-next="2">Next</button>
        </div>
        <div class="onboarding-step" data-step="2">
          <div class="onboarding-content">
            <div class="onboarding-number">2</div>
            <div class="onboarding-text">Click once to scroll, double-click to jump top/bottom</div>
          </div>
          <button class="onboarding-next" data-next="3">Next</button>
        </div>
        <div class="onboarding-step" data-step="3">
          <div class="onboarding-content">
            <div class="onboarding-number">3</div>
            <div class="onboarding-text">Hold to continuous scroll with acceleration</div>
          </div>
          <button class="onboarding-close">Got it!</button>
        </div>
      `;
      
      const style = document.createElement('style');
      style.textContent = `
        .onboarding-tooltip {
          position: fixed;
          bottom: 80px;
          right: 20px;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .onboarding-step {
          display: none;
          background: rgba(30, 30, 30, 0.95);
          color: #fff;
          padding: 16px 20px;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          max-width: 280px;
          animation: fadeIn 200ms ease-out;
        }
        .onboarding-step.active {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .onboarding-content {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .onboarding-number {
          width: 24px;
          height: 24px;
          background: #3B82F6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          flex-shrink: 0;
        }
        .onboarding-text {
          font-size: 14px;
          line-height: 1.5;
        }
        .onboarding-next, .onboarding-close {
          align-self: flex-end;
          background: #3B82F6;
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: background 150ms ease;
        }
        .onboarding-next:hover, .onboarding-close:hover {
          background: #2563eb;
        }
      `;
      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(tooltip);
      
      this.showStep(1);
      
      this.shadowRoot.querySelectorAll('.onboarding-next').forEach(btn => {
        btn.addEventListener('click', () => {
          this.showStep(parseInt(btn.dataset.next));
        });
      });
      
      this.shadowRoot.querySelector('.onboarding-close').addEventListener('click', () => {
        tooltip.remove();
      });
    }

    showStep(step) {
      this.shadowRoot.querySelectorAll('.onboarding-step').forEach(el => {
        el.classList.remove('active');
      });
      const current = this.shadowRoot.querySelector(`.onboarding-step[data-step="${step}"]`);
      if (current) current.classList.add('active');
    }

    setupCleanup() {
      window.addEventListener('unload', () => this.cleanup());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.cleanup();
      });
    }

    cleanup() {
      if (this.scrollInterval) {
        clearInterval(this.scrollInterval);
      }
      if (this.clickState.holdTimeout) {
        clearTimeout(this.clickState.holdTimeout);
      }
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
    }

    async loadSettings() {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
          this.settings = settings || {
            scrollStep: 500,
            accelerationBase: 1,
            accelerationMax: 5,
            accelerationDuration: 3000,
            excludedDomains: []
          };
          resolve();
        });
      });
    }

    async isExcluded() {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'CHECK_EXCLUSION', url: window.location.href },
          (response) => resolve(response.isExcluded)
        );
      });
    }

    createShadowDOM() {
      this.container = document.createElement('div');
      this.container.id = 'virtual-scroll-remote';
      document.body.appendChild(this.container);
      this.shadowRoot = this.container.attachShadow({ mode: 'closed' });
    }

    createTriggerZones() {
      const style = document.createElement('style');
      style.textContent = `
        .trigger-zone {
          position: fixed;
          width: 80px;
          height: 150px;
          z-index: 2147483647;
          cursor: pointer;
          opacity: 0;
          transition: opacity 200ms ease-in;
        }
        .trigger-zone.visible {
          opacity: 1;
        }
        .trigger-zone.top-right {
          top: 0;
          right: 0;
        }
        .trigger-zone.bottom-right {
          bottom: 0;
          right: 0;
        }
        .scroll-button {
          position: fixed;
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: opacity 200ms ease-in, transform 150ms ease, box-shadow 150ms ease;
          z-index: 2147483647;
        }
        .scroll-button:hover {
          transform: scale(1.05);
        }
        .scroll-button:active {
          transform: scale(0.95);
        }
        .scroll-button.visible {
          opacity: 0.8;
        }
        .scroll-button.active {
          background: rgba(59, 130, 246, 0.4);
          border-color: rgba(59, 130, 246, 0.6);
        }
        .scroll-button.pulse {
          animation: pulse 1s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
          50% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3), 0 4px 20px rgba(59, 130, 246, 0.4); }
        }
        .scroll-button.up {
          top: 20px;
          right: 16px;
        }
        .scroll-button.down {
          bottom: 20px;
          right: 16px;
        }
        .scroll-button svg {
          width: 24px;
          height: 24px;
          stroke: #3B82F6;
          stroke-width: 2;
          fill: none;
        }
        .scroll-button.active svg {
          stroke: #1d4ed8;
        }
        @media (prefers-color-scheme: dark) {
          .scroll-button {
            background: rgba(30, 30, 30, 0.75);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .scroll-button svg {
            stroke: #60A5FA;
          }
          .scroll-button.active {
            background: rgba(59, 130, 246, 0.3);
            border-color: rgba(96, 165, 250, 0.5);
          }
          .scroll-button.active svg {
            stroke: #93c5fd;
          }
        }
      `;
      this.shadowRoot.appendChild(style);

      this.topZone = document.createElement('div');
      this.topZone.className = 'trigger-zone top-right';
      this.shadowRoot.appendChild(this.topZone);

      this.bottomZone = document.createElement('div');
      this.bottomZone.className = 'trigger-zone bottom-right';
      this.shadowRoot.appendChild(this.bottomZone);
    }

    createButtons() {
      this.upButton = document.createElement('button');
      this.upButton.className = 'scroll-button up';
      this.upButton.innerHTML = `
        <svg viewBox="0 0 24 24">
          <polyline points="18,15 12,9 6,15"></polyline>
        </svg>
      `;
      this.shadowRoot.appendChild(this.upButton);

      this.downButton = document.createElement('button');
      this.downButton.className = 'scroll-button down';
      this.downButton.innerHTML = `
        <svg viewBox="0 0 24 24">
          <polyline points="6,9 12,15 18,9"></polyline>
        </svg>
      `;
      this.shadowRoot.appendChild(this.downButton);
    }

    attachEventListeners() {
      this.topZone.addEventListener('mouseenter', () => this.showButton(this.upButton));
      this.topZone.addEventListener('mouseleave', () => this.hideButton(this.upButton));
      this.bottomZone.addEventListener('mouseenter', () => this.showButton(this.downButton));
      this.bottomZone.addEventListener('mouseleave', () => this.hideButton(this.downButton));

      this.upButton.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'up'));
      this.upButton.addEventListener('mouseup', () => this.handleMouseUp('up'));
      this.upButton.addEventListener('mouseleave', () => this.handleMouseUp('up'));

      this.downButton.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'down'));
      this.downButton.addEventListener('mouseup', () => this.handleMouseUp('down'));
      this.downButton.addEventListener('mouseleave', () => this.handleMouseUp('down'));
    }

    showButton(button) {
      button.classList.add('visible');
    }

    hideButton(button) {
      button.classList.remove('visible');
      button.classList.remove('pulse');
      button.classList.remove('active');
    }

    handleMouseDown(event, direction) {
      event.preventDefault();
      
      if (this.debounceTimer) return;

      const now = Date.now();
      const button = direction === 'up' ? this.upButton : this.downButton;

      this.clickState.direction = direction;
      this.clickState.mousedownTime = now;
      this.clickState.isHolding = true;

      this.clickState.holdTimeout = setTimeout(() => {
        if (this.clickState.isHolding && this.clickState.direction === direction) {
          this.startContinuousScroll(direction, button);
        }
      }, CLICK_HOLD_THRESHOLD);
    }

    handleMouseUp(direction) {
      if (this.debounceTimer) return;

      clearTimeout(this.clickState.holdTimeout);
      
      if (!this.clickState.isHolding) return;
      
      const now = Date.now();
      const timeSinceMousedown = now - this.clickState.mousedownTime;
      const timeSinceLastClick = now - this.clickState.lastClickTime;

      this.clickState.isHolding = false;

      if (this.clickState.isScrolling) {
        this.stopContinuousScroll();
        return;
      }

      if (timeSinceMousedown < CLICK_HOLD_THRESHOLD) {
        if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD && this.clickState.direction === direction) {
          this.executeDoubleClick(direction);
          this.clickState.lastClickTime = 0;
        } else {
          this.debounceTimer = setTimeout(() => {
            this.executeSingleClick(direction);
            this.clickState.lastClickTime = now;
            this.debounceTimer = null;
          }, DEBOUNCE_DELAY);
        }
      }
    }

    executeSingleClick(direction) {
      this.scrollByDirection(direction, this.settings.scrollStep);
    }

    executeDoubleClick(direction) {
      if (direction === 'up') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      }
    }

    startContinuousScroll(direction, button) {
      this.clickState.isScrolling = true;
      button.classList.add('pulse');
      button.classList.add('active');

      let startTime = Date.now();
      let currentSpeed = this.settings.accelerationBase;

      this.scrollInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / this.settings.accelerationDuration, 1);
        currentSpeed = this.settings.accelerationBase + 
          (this.settings.accelerationMax - this.settings.accelerationBase) * progress;

        this.scrollByDirection(direction, this.settings.scrollStep * currentSpeed);
      }, 50);
    }

    stopContinuousScroll() {
      if (this.scrollInterval) {
        clearInterval(this.scrollInterval);
        this.scrollInterval = null;
      }
      this.clickState.isScrolling = false;
      this.clickState.direction = null;
      this.upButton?.classList.remove('pulse', 'active');
      this.downButton?.classList.remove('pulse', 'active');
    }

    scrollByDirection(direction, amount) {
      const scrollAmount = direction === 'up' ? -amount : amount;
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new VirtualScrollRemote());
  } else {
    new VirtualScrollRemote();
  }
})();