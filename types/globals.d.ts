// Globals that classic scripts define for the modules in public/js/.

// public/vendor/html-to-image.js, loaded with defer in public/editor.html.
declare const htmlToImage: {
  toPng(node: HTMLElement, options?: { pixelRatio?: number }): Promise<string>;
};

// Vercel Web Analytics queue, defined by public/js/analytics.js before /_vercel/insights/script.js loads.
interface Window {
  va?: (...args: unknown[]) => void;
  vaq?: IArguments[];
}
