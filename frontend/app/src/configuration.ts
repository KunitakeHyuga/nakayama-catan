const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

const inferDefaultApiUrl = () => {
  const configuredUrl = import.meta.env.CTRON_API_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    if (LOCAL_HOSTNAMES.has(hostname)) {
      return `${protocol}//${hostname}:5001`;
    }
    // Reverse-proxy default for non-local deployments when no explicit API URL is set.
    return `${protocol}//${hostname}`;
  }

  return "http://localhost:5001";
};

export const API_URL: string = inferDefaultApiUrl();
