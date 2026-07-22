(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);

  function rewritePath(pathname) {
    if (pathname === "/api/forensics") return "/api/forensics-v4";
    if (pathname === "/api/analyze") return "/api/analyze-v3";
    return pathname;
  }

  window.fetch = function calibratedAuditFetch(input, init) {
    try {
      if (typeof input === "string") {
        const url = new URL(input, window.location.href);
        const nextPath = rewritePath(url.pathname);
        if (nextPath !== url.pathname) {
          url.pathname = nextPath;
          const rewritten = url.origin === window.location.origin
            ? `${url.pathname}${url.search}${url.hash}`
            : url.toString();
          return nativeFetch(rewritten, init);
        }
      } else if (input instanceof Request) {
        const url = new URL(input.url, window.location.href);
        const nextPath = rewritePath(url.pathname);
        if (nextPath !== url.pathname) {
          url.pathname = nextPath;
          return nativeFetch(new Request(url.toString(), input), init);
        }
      }
    } catch {
      // URL 处理失败时保留原请求，避免影响页面其他接口。
    }

    return nativeFetch(input, init);
  };
})();
