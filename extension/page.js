/* Selectors taken from the user's rendered October 2026 page captures. */
globalThis.ancestryPage = async function ancestryPage(action, payload = {}) {
  const C = globalThis.AncestorCore;
  const S = {
    list: '[data-testid="matches-match-list-container"]', row: '[data-testid="matches-match-entry"]',
    name: '[data-testid="matches-match-info-name-link"]', ancestor: '[data-testid="matches-match-tree-common-ancestor-link"]',
    add: '[data-testid="matches-match-entry-add-button"]', field: '[data-testid="matches-add-edit-note-textarea"]',
    save: '[data-testid="matches-add-edit-note-save-button"]', cancel: '[data-testid="matches-add-edit-note-cancel-button"]',
    next: '[data-testid="matches-match-list-pagination"] a[rel="next"]',
    page: '[data-testid="matches-match-list-pagination"] .pagingNum, [data-testid="matches-match-list-pagination"] select.pagingSelect'
  };
  if (C.listURL(location.href)?.kind === 'shared') {
    S.list = '[data-testid="compare-matches-of-matches-page"]';
    S.row = '[data-testid="compare-matches-of-match-entry"]';
    S.ancestor = '[data-testid="matches-match-tree-common-ancestor-thrulines-link"]';
  }
  if (C.listURL(location.href)?.kind === 'cluster') {
    S.list = '.auto-cluster-list';
    S.row = '.auto-cluster-list [data-testid="matches-match-entry"]';
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => !!el && !el.closest('.noDisplay, [hidden]') && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const all = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const unique = (items, what) => {
    if (items.length !== 1) throw new Error(`Expected one ${what}, found ${items.length}. Capture this page if the layout changed.`);
    return items[0];
  };
  function guard() {
    if (!['www.ancestry.com', 'ancestry.com'].includes(location.hostname)) throw new Error('The tab left Ancestry.');
    if (/\/signin|\/account\/sign/i.test(location.pathname) || all('input[type="password"], iframe[src*="captcha"]').some(visible) || /verify (?:that )?you(?:\x27re| are) human|unusual traffic|too many requests/i.test(document.body.innerText)) throw new Error('Sign-in or access check detected. Complete it in Ancestry before resuming.');
    if (payload.listURL) {
      const wanted = C.listURL(payload.listURL), current = C.listURL(location.href);
      if (!wanted || !current || wanted.kit !== current.kit || wanted.page !== current.page || wanted.kind !== current.kind || wanted.sharedWith !== current.sharedWith || wanted.clusterId !== current.clusterId) throw new Error('The match-list page changed. Stopped before editing.');
      const a = new URL(payload.listURL), b = new URL(location.href);
      a.searchParams.sort(); b.searchParams.sort();
      if (a.search !== b.search) throw new Error('The match filters changed. Return to the original filtered list.');
    }
  }
  async function waitFor(find, description) {
    for (let i = 0; i < 40; i++) {
      guard(); const result = find(); if (result) return result;
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${description}. No further matches were processed.`);
  }
  function matchRow() {
    return unique(all(S.row).filter(row => {
      const link = row.querySelector(S.name), match = link && C.matchURL(link.getAttribute('href'), location.href);
      return match && match.id === payload.id && match.kit === payload.kit;
    }), 'matching row');
  }
  function rowData(row) {
    const link = unique(all(S.name, row), 'match name link');
    const match = C.matchURL(link.getAttribute('href'), location.href);
    if (!match) throw new Error('Unrecognized match link.');
    const note = row.querySelector('.matchNotes .noteText');
    const hasNote = !!row.querySelector('.matchNotes .notesBtn') || !!note && note.textContent !== '';
    const common = row.querySelector(S.ancestor);
    const ancestorURL = common ? new URL(common.getAttribute('href'), location.href) : null;
    if (ancestorURL && (ancestorURL.origin !== location.origin || !ancestorURL.pathname.toLowerCase().includes(`/for/${match.kit}`) || ancestorURL.searchParams.get('matchingSampleId')?.toLowerCase() !== match.id)) throw new Error('The Common Ancestor link does not match its row.');
    return { ...match, name: C.clean(link.textContent), hasNote, existing: note?.textContent || '', ancestorURL: ancestorURL?.href || null };
  }
  function noteField() {
    const fields = all(S.field).filter(visible);
    return fields.length ? unique(fields, 'visible note editor') : null;
  }
  async function cancelNote() {
    const field = noteField(); if (!field) return;
    unique(all(S.cancel, field.closest('aside')).filter(visible), 'note Cancel button').click();
    await waitFor(() => !noteField(), 'note editor to close');
  }
  guard();
  if (action === 'list') {
    const current = C.listURL(location.href);
    if (!current) throw new Error('Open DNA Matches, Shared Matches, or a DNA Cluster, not a tree page.');
    let page = 1;
    if (current.kind === 'cluster') {
      await waitFor(() => document.querySelector(S.list) && document.querySelector('.auto-cluster-list .cluster-list-expandable'), 'the cluster match list');
      const sections = all('.auto-cluster-list .cluster-list-expandable');
      for (const section of sections) {
        const toggle = section.querySelector('.cluster-button-toggle[aria-expanded="false"]');
        if (toggle) toggle.click();
        const count = C.clean(section.querySelector('[data-testid="matchCount"]')?.textContent).match(/^([\d,]+)\s+matches?\b/i);
        if (!count) throw new Error('Cannot determine how many matches this cluster contains. Capture this page.');
        const expected = Number(count[1].replaceAll(',', ''));
        await waitFor(() => all('[data-testid="matches-match-entry"]', section).length === expected && section.querySelector('.cluster-button-toggle[aria-expanded="true"]'), 'all matches in the expanded cluster');
      }
    } else {
      await waitFor(() => document.querySelector(S.list) && document.querySelector(S.page), 'the loaded match list and page number');
      const pageControl = document.querySelector(S.page);
      page = Number(pageControl.tagName === 'SELECT' ? pageControl.value : pageControl.textContent);
    }
    if (page !== current.page) throw new Error('The list is still switching pages. Wait for it to finish, then resume.');
    const next = current.kind === 'cluster' ? null : document.querySelector(S.next);
    const enabled = next && !next.classList.contains('disabled') && next.getAttribute('aria-disabled') !== 'true';
    const nextURL = enabled ? new URL(next.getAttribute('href'), location.href).href : null;
    if (nextURL) {
      const info = C.listURL(nextURL);
      if (!info || info.kit !== current.kit || info.page !== page + 1 || C.listContext(nextURL) !== C.listContext(current.url)) throw new Error('Next Page would change the DNA kit or filters.');
    }
    const matches = all(S.row).map(rowData);
    if (matches.some(match => match.kit !== current.kit)) throw new Error('The list still contains matches from another DNA kit. Wait for Ancestry to finish loading, then start again.');
    return { ...current, page, matches, nextURL, editorOpen: !!noteField() };
  }
  if (action === 'row') return rowData(matchRow());
  if (action === 'ancestors') {
    const kit = location.pathname.match(/\/for\/([a-z0-9-]+)/i)?.[1].toLowerCase();
    if (!location.pathname.startsWith('/discoveryui-geneticfamily/thrulines/tree/') || kit !== payload.kit) throw new Error('ThruLines opened for a different DNA kit.');
    const matchId = new URL(location.href).searchParams.get('matchingSampleId')?.toLowerCase();
    if (matchId && matchId !== payload.id) throw new Error('ThruLines opened for a different match.');
    await waitFor(() => document.querySelector('#treeViewer[aria-busy="false"]') && document.querySelector('.commonAncestorNode'), 'the common-ancestor tree');
    if (!matchId) {
      const targetNames = all('.nodeDnaMatch.shouldHighlight .horizontalNodeName').map(el => C.key(el.textContent));
      if (targetNames.length !== 1 || targetNames[0] !== C.key(payload.name)) throw new Error('Cannot verify which match this ThruLines tree belongs to.');
    }
    const cards = all('.commonAncestorNode').filter(card => /^common ancestor$/i.test(C.clean(card.querySelector('.commonAncestorText')?.textContent)));
    const names = C.names(cards.map(card => unique(all('.horizontalNodeName', card), 'common ancestor name').textContent));
    if (!names.length) throw new Error('No explicitly marked common ancestor was found.');
    return { names };
  }
  if (action === 'back') {
    const button = document.getElementById('dnaSubnavBackButton');
    if (!visible(button)) throw new Error('ThruLines Back button was not found.');
    setTimeout(() => button.click(), 50); return { clicked: true };
  }
  if (action === 'save') {
    let row = matchRow();
    if (rowData(row).hasNote) return { skipped: true, reason: 'Existing note' };
    if (noteField()) throw new Error('A note editor is already open. Close it yourself, then resume so the correct match can be selected.');
    const proposed = C.mergeNote('', payload.names).value;
    if (!proposed || proposed !== payload.proposed || proposed.length > 500) throw new Error('Invalid or oversized proposed note.');
    unique(all(S.add, row).filter(visible), 'match Add button').click();
    // Menu-open HTML was not captured: use only its exact accessible label.
    const menuItem = await waitFor(() => {
      const candidates = all('[role="menuitem"], button, a').filter(el => !el.matches('.notesBtn') && !el.closest('[data-testid="compare-header"]') && visible(el) && /^(?:add\s*\/\s*edit|add|edit)\s+note$/i.test(C.clean(el.getAttribute('aria-label') || el.textContent)));
      const items = candidates.filter(el => !candidates.some(other => other !== el && el.contains(other)));
      return items.length ? unique(items, 'Add/Edit Note menu item') : null;
    }, 'Add/Edit Note in the opened menu');
    menuItem.click();
    const field = await waitFor(noteField, 'the note editor');
    guard(); row = matchRow();
    if (rowData(row).hasNote || field.value !== '') { await cancelNote(); return { skipped: true, reason: 'Existing note' }; }
    if (field.maxLength > 0 && proposed.length > field.maxLength) { await cancelNote(); throw new Error('The note exceeds the editor character limit.'); }
    const scope = field.closest('aside');
    const save = unique(all(S.save, scope), 'note Save button');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, proposed);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !save.disabled, 'Save to become enabled');
    guard();
    if (!save.isConnected || !field.isConnected || field.value !== proposed || rowData(matchRow()).hasNote) throw new Error('The note or match changed before Save. No Save was clicked.');
    save.click();
    await waitFor(() => !noteField() && rowData(matchRow()).existing === proposed, 'the saved note to appear in its match row');
    return { clicked: true };
  }
  throw new Error(`Unknown page action: ${action}`);
};
