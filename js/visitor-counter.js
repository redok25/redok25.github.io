/**
 * Hidden Visitor Counter Easter Egg
 * Tracks unique visitors using JSONBin.io cloud storage
 */

class VisitorCounter {
  constructor() {
    this.secretWord = 'visitor';
    this.typedKeys = [];
    this.maxKeyHistory = 10;
    this.modalId = 'visitor-counter-modal';
    this.isLoading = false;
    
    this.init();
  }

  async init() {
    await this.trackVisitor();
    this.setupKeyListener();
  }

  /**
   * Generate a unique browser fingerprint
   */
  generateFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
    const canvasData = canvas.toDataURL();
    
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvas: canvasData.slice(-50)
    };
    
    const fingerprintString = JSON.stringify(fingerprint);
    let hash = 0;
    for (let i = 0; i < fingerprintString.length; i++) {
      const char = fingerprintString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return 'visitor_' + Math.abs(hash).toString(36);
  }

  /**
   * Fetch visitor data from JSONBin.io
   */
  async fetchFromJSONBin() {
    try {
      // Use configured bin ID first, fallback to localStorage
      const binId = VISITOR_CONFIG.JSONBIN_BIN_ID || localStorage.getItem(VISITOR_CONFIG.BIN_ID_KEY);
      
      if (!binId) {
        debugLog('No bin ID found, will create new bin');
        return null;
      }

      const url = `${VISITOR_CONFIG.JSONBIN_BASE_URL}/b/${binId}/latest`;
      debugLog('Fetching from JSONBin:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Master-Key': VISITOR_CONFIG.JSONBIN_API_KEY
        }
      });

      if (!response.ok) {
        throw new Error(`JSONBin fetch failed: ${response.status}`);
      }

      const result = await response.json();
      debugLog('Fetched data:', result);
      
      return result.record;
    } catch (error) {
      console.error('Error fetching from JSONBin:', error);
      return null;
    }
  }

  /**
   * Save visitor data to JSONBin.io
   */
  async saveToJSONBin(data) {
    try {
      // Use configured bin ID first, fallback to localStorage
      let binId = VISITOR_CONFIG.JSONBIN_BIN_ID || localStorage.getItem(VISITOR_CONFIG.BIN_ID_KEY);
      let url, method;

      if (binId) {
        // Update existing bin
        url = `${VISITOR_CONFIG.JSONBIN_BASE_URL}/b/${binId}`;
        method = 'PUT';
        debugLog('Updating existing bin:', binId);
      } else {
        // Create new bin
        url = `${VISITOR_CONFIG.JSONBIN_BASE_URL}/b`;
        method = 'POST';
        debugLog('Creating new bin');
      }

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': VISITOR_CONFIG.JSONBIN_API_KEY,
          'X-Bin-Name': 'portfolio-visitor-counter',
          'X-Bin-Private': 'false'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`JSONBin save failed: ${response.status}`);
      }

      const result = await response.json();
      debugLog('Saved to JSONBin:', result);

      // Save bin ID if it's a new bin
      if (!binId && result.metadata && result.metadata.id) {
        localStorage.setItem(VISITOR_CONFIG.BIN_ID_KEY, result.metadata.id);
        debugLog('Saved new bin ID:', result.metadata.id);
      }

      return true;
    } catch (error) {
      console.error('Error saving to JSONBin:', error);
      return false;
    }
  }

  /**
   * Track unique visitor count
   */
  async trackVisitor() {
    const visitorId = this.getOrCreateVisitorId();
    const now = new Date().toISOString();
    const today = new Date().toDateString();

    let data;

    // Try to fetch from JSONBin if enabled
    if (VISITOR_CONFIG.USE_JSONBIN) {
      this.isLoading = true;
      data = await this.fetchFromJSONBin();
      this.isLoading = false;
    }

    // Fallback to localStorage if JSONBin fails or disabled
    if (!data && VISITOR_CONFIG.FALLBACK_TO_LOCALSTORAGE) {
      const localData = localStorage.getItem(VISITOR_CONFIG.STORAGE_KEY);
      data = localData ? JSON.parse(localData) : null;
      debugLog('Using localStorage fallback');
    }

    // Initialize data structure if empty
    if (!data) {
      data = {
        totalVisits: 0,
        uniqueVisitors: {},
        firstVisit: null,
        lastUpdate: now
      };
    }

    // Track this visitor
    if (!data.uniqueVisitors[visitorId]) {
      // New unique visitor
      data.uniqueVisitors[visitorId] = {
        firstVisit: now,
        lastVisit: now,
        visitCount: 1
      };
      data.totalVisits++;
      
      if (!data.firstVisit) {
        data.firstVisit = now;
      }
    } else {
      // Existing visitor - only count if different day
      const lastVisit = data.uniqueVisitors[visitorId].lastVisit;
      const lastVisitDate = new Date(lastVisit).toDateString();
      
      if (lastVisitDate !== today) {
        data.uniqueVisitors[visitorId].visitCount++;
        data.totalVisits++;
      }
      
      data.uniqueVisitors[visitorId].lastVisit = now;
    }

    data.lastUpdate = now;

    // Save to JSONBin if enabled
    if (VISITOR_CONFIG.USE_JSONBIN) {
      await this.saveToJSONBin(data);
    }

    // Always save to localStorage as backup
    localStorage.setItem(VISITOR_CONFIG.STORAGE_KEY, JSON.stringify(data));

    // Store for display
    this.visitorData = {
      count: data.totalVisits,
      uniqueCount: Object.keys(data.uniqueVisitors).length,
      firstVisit: data.uniqueVisitors[visitorId].firstVisit,
      lastVisit: data.uniqueVisitors[visitorId].lastVisit,
      yourVisits: data.uniqueVisitors[visitorId].visitCount
    };

    debugLog('Visitor data:', this.visitorData);
  }

  /**
   * Get or create visitor ID
   */
  getOrCreateVisitorId() {
    let visitorId = localStorage.getItem(VISITOR_CONFIG.FINGERPRINT_KEY);
    if (!visitorId) {
      visitorId = this.generateFingerprint();
      localStorage.setItem(VISITOR_CONFIG.FINGERPRINT_KEY, visitorId);
    }
    return visitorId;
  }

  /**
   * Setup keyboard listener for secret word
   */
  setupKeyListener() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      const modal = document.getElementById(this.modalId);
      if (modal && !modal.classList.contains('hidden')) {
        return;
      }

      this.typedKeys.push(e.key.toLowerCase());
      
      if (this.typedKeys.length > this.maxKeyHistory) {
        this.typedKeys.shift();
      }

      const typedString = this.typedKeys.join('');
      if (typedString.includes(this.secretWord)) {
        this.showVisitorCounter();
        this.typedKeys = [];
      }
    });
  }

  /**
   * Show the visitor counter modal
   */
  showVisitorCounter() {
    const modal = document.getElementById(this.modalId);
    if (!modal) {
      console.error('Visitor counter modal not found');
      return;
    }

    this.updateCounterDisplay();
    modal.classList.remove('hidden');
    
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.animation = 'none';
      setTimeout(() => {
        content.style.animation = '';
      }, 10);
    }
    
    this.playDiscoverySound();
  }

  /**
   * Update counter display with current data
   */
  updateCounterDisplay() {
    const countElement = document.getElementById('visitor-count-number');
    const uniqueCountElement = document.getElementById('visitor-unique-count');
    const yourVisitsElement = document.getElementById('visitor-your-visits');
    const firstVisitElement = document.getElementById('visitor-first-visit');
    const lastVisitElement = document.getElementById('visitor-last-visit');

    if (countElement) {
      this.animateCounter(countElement, this.visitorData.count);
    }

    if (uniqueCountElement) {
      this.animateCounter(uniqueCountElement, this.visitorData.uniqueCount);
    }

    if (yourVisitsElement) {
      this.animateCounter(yourVisitsElement, this.visitorData.yourVisits);
    }

    if (firstVisitElement && this.visitorData.firstVisit) {
      const firstDate = new Date(this.visitorData.firstVisit);
      firstVisitElement.textContent = this.formatDate(firstDate);
    }

    if (lastVisitElement && this.visitorData.lastVisit) {
      const lastDate = new Date(this.visitorData.lastVisit);
      lastVisitElement.textContent = this.formatDate(lastDate);
    }
  }

  /**
   * Animate counter number
   */
  animateCounter(element, targetCount) {
    let current = 0;
    const duration = 1500;
    const steps = 30;
    const increment = targetCount / steps;
    const stepTime = duration / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= targetCount) {
        current = targetCount;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current).toLocaleString();
    }, stepTime);
  }

  /**
   * Format date for display
   */
  formatDate(date) {
    const options = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('id-ID', options);
  }

  /**
   * Play discovery sound effect
   */
  playDiscoverySound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator1.frequency.value = 800;
      oscillator2.frequency.value = 1200;
      oscillator1.type = 'sine';
      oscillator2.type = 'sine';

      gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

      oscillator1.start(audioContext.currentTime);
      oscillator2.start(audioContext.currentTime + 0.1);
      oscillator1.stop(audioContext.currentTime + 0.4);
      oscillator2.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      // Silent fail
    }
  }

  /**
   * Close the visitor counter modal
   */
  closeModal() {
    const modal = document.getElementById(this.modalId);
    if (modal) {
      const content = modal.querySelector('.modal-content');
      if (content) {
        content.style.animation = 'slideOutUp 0.4s ease-in-out';
        setTimeout(() => {
          modal.classList.add('hidden');
          content.style.animation = '';
        }, 400);
      } else {
        modal.classList.add('hidden');
      }
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.visitorCounter = new VisitorCounter();
  });
} else {
  window.visitorCounter = new VisitorCounter();
}

// Global function to close modal
function closeVisitorCounter() {
  if (window.visitorCounter) {
    window.visitorCounter.closeModal();
  }
}
