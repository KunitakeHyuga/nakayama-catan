type HtmlToImageModule = {
  toJpeg: (
    node: HTMLElement,
    options?: {
      quality?: number;
      cacheBust?: boolean;
      pixelRatio?: number;
      backgroundColor?: string;
    }
  ) => Promise<string>;
};

declare global {
  interface Window {
    htmlToImage?: HtmlToImageModule;
  }
}

const SCRIPT_ID = "html-to-image-vendor-script";
const SCRIPT_SRC = "/vendor/html-to-image.js";

let loadPromise: Promise<HtmlToImageModule> | null = null;

function injectScript(): Promise<HtmlToImageModule> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Document is not available"));
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.htmlToImage) {
        resolve(window.htmlToImage);
        return;
      }
      existing.addEventListener("load", () => {
        window.htmlToImage
          ? resolve(window.htmlToImage)
          : reject(new Error("html-to-image failed to load"));
      });
      existing.addEventListener("error", () => {
        reject(new Error("html-to-image script failed to load"));
      });
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.htmlToImage) {
        resolve(window.htmlToImage);
      } else {
        reject(new Error("html-to-image failed to initialize"));
      }
    };
    script.onerror = () => reject(new Error("html-to-image script failed to load"));
    document.body.appendChild(script);
  });
}

export function loadHtmlToImage(): Promise<HtmlToImageModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available"));
  }
  if (window.htmlToImage) {
    return Promise.resolve(window.htmlToImage);
  }
  if (!loadPromise) {
    loadPromise = injectScript();
  }
  return loadPromise;
}
