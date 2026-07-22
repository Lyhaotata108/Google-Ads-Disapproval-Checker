(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);

  window.fetch = function normalizedForensicsFetch(input, init) {
    try {
      if (typeof input === "string") {
        const url = new URL(input, window.location.href);
        if (url.pathname === "/api/forensics") {
          url.pathname = "/api/forensics-v2";
          const rewritten = url.origin === window.location.origin
            ? `${url.pathname}${url.search}${url.hash}`
            : url.toString();
          return nativeFetch(rewritten, init);
        }
      } else if (input instanceof Request) {
        const url = new URL(input.url, window.location.href);
        if (url.pathname === "/api/forensics") {
          url.pathname = "/api/forensics-v2";
          return nativeFetch(new Request(url.toString(), input), init);
        }
      }
    } catch {
      // Fall through to the original request when URL normalization fails.
    }

    return nativeFetch(input, init);
  };
})();
