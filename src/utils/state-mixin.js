/**
 * A mixin that provides loading/error state management for components.
 */
export class StateMixin {
  constructor() {
    this._statePrefixes = new Set();
  }

  /**
   * Set a loading state for a given prefix
   * @param {string} prefix - State prefix (e.g., 'models', 'benchmarks')
   * @param {boolean} isLoading - Loading status
   */
  setLoading(prefix, isLoading) {
    // Store the prefix in our tracking set if not already there
    this._statePrefixes.add(prefix);
    
    // Set the actual state property on the component instance
    const loadingProp = `${prefix}Loading`;
    if (this[loadingProp] !== undefined) {
      this[loadingProp] = isLoading;
    }
  }

  /**
   * Set an error state for a given prefix 
   * @param {string} prefix - State prefix
   * @param {Error|string|null} error - Error object or null to clear
   */
  setError(prefix, error) {
    const errorProp = `${prefix}Error`;
    
    if (this[errorProp] !== undefined) {
      this[errorProp] = error;
    }
  }

  /**
   * Execute an async function with automatic loading state management
   * @param {string} prefix - State prefix to manage 
   * @param {Function} asyncFn - Async function to execute
   * @returns Promise that resolves to the result of asyncFn
   */
  async withLoading(prefix, asyncFn) {
    if (typeof prefix !== 'string') {
      throw new Error('Prefix must be a string');
    }
    
    // Set loading state on entry
    this.setLoading(prefix, true);
    
    try {
      const result = await asyncFn();
      
      return result;
    } finally {
      // Always clear the loading state when finished (even if error occurs)
      this.setLoading(prefix, false);
    }
  }

  /**
   * Get current loading status for a prefix
   * @param {string} prefix - State prefix to check
   */
  isLoading(prefix) {
    const loadingProp = `${prefix}Loading`;
    return this[loadingProp] || false;
  }

  /**
   * Get current error for a prefix 
   * @param {string} prefix - State prefix to check
   */
  getError(prefix) {
    const errorProp = `${prefix}Error`;
    return this[errorProp];
  }
}