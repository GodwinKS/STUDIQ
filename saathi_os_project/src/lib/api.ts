
export async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3, initialDelay = 1000, timeoutMs = 15000): Promise<Response> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      
      if (!response.ok && response.status >= 500 && i < maxRetries - 1) {
        throw new Error(`Server Error: ${response.status}`);
      }
      return response;
    } catch (err: any) {
      clearTimeout(id);
      lastError = err;
      const errorMessage = (err?.message || String(err)).toLowerCase();
      
      const isTransient = errorMessage.includes("failed to fetch") || 
                          errorMessage.includes("networkerror") || 
                          errorMessage.includes("typeerror") ||
                          errorMessage.includes("connection") ||
                          errorMessage.includes("aborted") ||
                          errorMessage.includes("timeout");

      if (isTransient && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Internal API fetch failed (${url}). Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
