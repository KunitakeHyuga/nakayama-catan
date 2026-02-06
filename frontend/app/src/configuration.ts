const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

const inferDefaultApiUrl = () => {
  const configuredUrl = import.meta.env.CTRON_API_URL;
  if (configuredUrl) {
    try {
      const parsed = new URL(configuredUrl);
      if (!LOCAL_HOSTNAMES.has(parsed.hostname)) {
        // Custom URL explicitly provided (e.g., production/staging).
        return configuredUrl;
      }
    } catch {
      // If parsing fails, fall back to using the raw configured value.
      return configuredUrl;
    }
  }

  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:5001`;
  }

  return configuredUrl || "http://localhost:5001";
};

export const API_URL: string = inferDefaultApiUrl();
