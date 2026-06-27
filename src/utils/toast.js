// Singleton Toast service for consistent notifications
let toastHost = null;

export class Toast {
  static show(message, type = 'info', duration = 4000) {
    // Try to find existing toast host in DOM
    if (!toastHost) {
      const existingHost = document.querySelector('toast-host');
      if (existingHost) {
        toastHost = existingHost;
      } else {
        // If no toast host exists, we need to create one or fall back gracefully
        console.warn('No toast host found in DOM - using fallback alert for:', message);
        return this._fallbackToast(message, type);  
      }
    }

    if (toastHost) {
      const event = new CustomEvent('toast', { 
        detail: { message, type, duration } 
      });
      
      toastHost.dispatchEvent(event);
    } else {
      // Fall back to alert
      return this._fallbackToast(message, type);
    }
  }

  static _fallbackToast(message, type) {
    switch (type) {
      case 'error': 
        console.error('Toast fallback:', message);
        break;
      case 'warning':
        console.warn('Toast fallback:', message);
        break;
      case 'success':
        console.log('Toast fallback:', message);
        break;
      default:
        console.log('Toast fallback:', message);
    }
    
    return alert(message);
  }

  // Show success toast with automatic timeout
  static success(message, duration = 4000) {
    this.show(message, 'success', duration);
  }

  // Show error toast
  static error(message, duration = 4000) {
    this.show(message, 'error', duration);
  }
}