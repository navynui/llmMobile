/**
 * Standard fetch wrapper that handles JSON parsing and error handling.
 */
export async function apiFetch(url, opts = {}) {
  const response = await fetch(url, opts);
  
  // Handle non-JSON responses (e.g. streaming)
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return response;
  }

  // Handle JSON responses
  if (!response.ok) {
    let errorMessage = 'Request failed';
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      } else {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (e) {
      // If we can't parse JSON, use the status text
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    
    const error = new Error(errorMessage);
    error.statusCode = response.status;
    throw error;
  }

  return await response.json();
}

/**
 * POST request with JSON body.
 */
export async function apiPost(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = 'Request failed';
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      } else {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (e) {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    
    const error = new Error(errorMessage);
    error.statusCode = response.status;
    throw error;
  }

  return await response.json();
}

/**
 * DELETE request.
 */
export async function apiDelete(url) {
  const response = await fetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    let errorMessage = 'Request failed';
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      } else {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (e) {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    
    const error = new Error(errorMessage);
    error.statusCode = response.status;
    throw error;
  }

  return await response.json();
}

/**
 * Fetch wrapper with toast notifications for errors.
 */
export async function apiFetchWithToast(url, opts = {}, { successMsg, errorMsg }) {
  try {
    const data = await apiFetch(url, opts);
    
    if (successMsg) {
      // In a real implementation, this would call Toast.show()
      console.log(successMsg); 
    }
    
    return data;
  } catch (error) {
    // In a real implementation, this would call Toast.show(error.message, 'error')
    console.error(errorMsg || error.message);
    throw error;  // Re-throw so caller can handle as needed
  }
}

/**
 * Fetch wrapper that manages loading state.
 */
export async function apiFetchWithLoading(propertyRef, url, opts = {}) {
  try {
    const response = await fetch(url, opts);
    
    // Handle non-JSON responses (e.g. streaming)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return response;
    }

    if (!response.ok) {
      let errorMessage = 'Request failed';
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        } else {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      
      const error = new Error(errorMessage);
      error.statusCode = response.status;
      throw error;
    }

    return await response.json();
  } finally {
    // In a real implementation, we would set propertyRef to false
    if (propertyRef) {
      console.log('Loading state updated');
    }
  }
}