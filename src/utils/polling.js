/**
 * A mixin that provides polling functionality to components.
 */
export class PollingMixin {
  constructor() {
    this._pollInterval = null;
    this._pollingUrl = '';
    this._pollingCallback = null;
    this._pollingEnabled = false;
  }

  /**
   * Start polling for data at a given interval
   * @param {string} url - The URL to poll
   * @param {number} intervalMs - Polling interval in milliseconds  
   * @param {Function} callback - Function to call with polled data
   * @returns {Function} Cleanup function that stops the polling
   */
  startPolling(url, intervalMs, callback) {
    // Stop any existing polling for this instance
    this.stopPolling();

    this._pollingUrl = url;
    this._pollingCallback = callback;
    
    // Set up new polling  
    const pollFunction = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        this._pollingCallback?.(data);
      } catch (error) {
        // Handle polling errors gracefully
        console.warn('Polling error:', url, error.message);
        // If the component is still using this polling instance, we don't want to stop 
        if (this._pollInterval && this._pollingUrl === url) {
          // Continue with polling - but log error
        }
      }
    };

    // Immediate first poll
    pollFunction();

    // Set up regular interval  
    this._pollInterval = setInterval(pollFunction, intervalMs);
    
    return () => this.stopPolling();
  }

  /**
   * Stop current polling if any is active
   */
  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    this._pollingUrl = '';
    this._pollingCallback = null; 
  }

  /**
   * Cleanup on component disconnected
   */
  disconnectedCallback() {
    this.stopPolling();
  }
}