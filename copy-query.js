/* Copy-query button — shared by both pages. Copies the text in #query-text
   to the clipboard and gives brief button feedback. */
(function () {
  const btn = document.getElementById("copy-query");
  const src = document.getElementById("query-text");
  if (!btn || !src) return;
  // If a query was supplied via window.AMC_QUERY, render it into the box.
  if (typeof window.AMC_QUERY === "string" && window.AMC_QUERY.trim()) {
    src.textContent = window.AMC_QUERY;
  }
  btn.addEventListener("click", async () => {
    const text = src.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // fallback for browsers / contexts without clipboard API
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
    }
    const orig = btn.textContent;
    btn.textContent = "Copied ✓";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1600);
  });
})();
