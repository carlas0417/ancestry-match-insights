/* Pure helpers, also exercised by tests/browser.html. */
globalThis.AncestorCore = (() => {
  const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const key = value => clean(value).normalize("NFKC").toLocaleLowerCase("en-US");
  function names(values) {
    const seen = new Set();
    return values.map(clean).filter(name => {
      const id = key(name);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  function matchURL(value, base) {
    try {
      const url = new URL(value, base);
      if (url.protocol !== "https:" || !["www.ancestry.com", "ancestry.com"].includes(url.hostname)) return null;
      const parts = url.pathname.match(/^\/discoveryui-matches\/compare\/([a-z0-9-]+)\/with\/([a-z0-9-]+)(?:\/|$)/i)
        || url.pathname.match(/^\/dna\/matches\/([a-z0-9-]+)\/compare\/([a-z0-9-]+)(?:\/|$)/i);
      if (!parts) return null;
      return { kit: parts[1].toLowerCase(), id: parts[2].toLowerCase(), url: `${url.origin}/discoveryui-matches/compare/${parts[1]}/with/${parts[2]}` };
    } catch { return null; }
  }
  function mergeNote(existing, ancestorNames, limit = 500) {
    // Any stored content, including whitespace, makes this match ineligible.
    if (existing !== '') return { value: existing, skipped: true, changed: false, fits: existing.length <= limit };
    const value = names(ancestorNames).join('; ');
    return { value, skipped: false, changed: value !== '', fits: value.length <= limit };
  }
  function listURL(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !['www.ancestry.com', 'ancestry.com'].includes(url.hostname)) return null;
      const match = url.pathname.match(/^\/dna\/matches\/([a-z0-9-]+)\/list\/?$/i)
        || url.pathname.match(/^\/dna\/matches\/([a-z0-9-]+)\/compare\/([a-z0-9-]+)\/shared-matches\/?$/i);
      const cluster = url.pathname.match(/^\/dna\/matches\/([a-z0-9-]+)\/clusters\/([a-z0-9-]+)\/?$/i);
      if (!match && !cluster) return null;
      return { kit: (match || cluster)[1].toLowerCase(), kind: cluster ? 'cluster' : match[2] ? 'shared' : 'matches', sharedWith: match?.[2]?.toLowerCase() || null, clusterId: cluster?.[2]?.toLowerCase() || null, page: cluster ? 1 : Number(url.searchParams.get('currentPage') || 1), url: url.href };
    } catch { return null; }
  }
  const resumeCheckpoint = state => ({ version: 2, kit: state.kit, cursor: state.cursor, source: state.source, complete: !!state.complete });
  function listContext(value) {
    const list = listURL(value); if (!list) return null;
    const url = new URL(list.url);
    url.searchParams.delete('currentPage'); url.searchParams.sort();
    return JSON.stringify([url.origin, list.kit, list.kind, list.sharedWith, list.clusterId, url.searchParams.toString()]);
  }
  return { clean, key, names, matchURL, listURL, mergeNote, resumeCheckpoint, listContext };
})();
