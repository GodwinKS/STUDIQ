
export async function safeJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    // Check for the typical platform "Starting Server" or "Not Found" HTML
    if (text.includes("Starting Server") || text.includes("<!doctype html>")) {
      throw new Error("Saathi-OS is initializing. Please wait a few seconds...");
    }
    console.error(`[API] Expected JSON but got ${contentType}:`, text.substring(0, 200));
    throw new Error(`Connection Error: The bridge or server is currently unreachable. Ensure bridge.py is running.`);
  }
  return response.json();
}

export async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3, initialDelay = 1000, timeoutMs = 30000): Promise<Response> {
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
        throw new Error(`Server Error: ${response.status} at ${url}`);
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
                          errorMessage.includes("timeout") ||
                          errorMessage.includes("502") ||
                          errorMessage.includes("503") ||
                          errorMessage.includes("504");

      if (isTransient && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`[API] Fetch failed for ${url}. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries}): ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
