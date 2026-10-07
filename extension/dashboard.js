const C = AncestorCore, $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const scanPower = new ScanPower(chrome.power);
let state = { version: 2, rows: [], kit: null, cursor: null, source: null };
let running = false, paused = false, activeMode = '';
// Persist only a small resume checkpoint, never match names, notes, or history.
const persist = () => chrome.storage.local.set({ ancestorNotesV2: C.resumeCheckpoint(state) });
const status = message => { $('status').textContent = message; };
function busy(value) {
  running = value;
  document.querySelectorAll('button, select, input, textarea').forEach(el => el.disabled = value);
  $('pause').disabled = !value;
}
function render() {
  const saved = state.rows.filter(row => row.status === 'Saved').length;
  const pending = state.rows.filter(row => row.status === 'Ready').length;
  const skipped = state.rows.filter(row => row.status.startsWith('Skipped')).length;
  const listInfo = C.listURL(state.cursor);
  const listLabel = listInfo?.kind === 'cluster' ? `Cluster ${listInfo.clusterId}` : listInfo ? `Page ${listInfo.page}` : '';
  $('counts').textContent = `${listLabel ? `${listLabel}: ` : ''}${saved} saved and verified · ${pending} not saved yet · ${skipped} skipped`;
  $('mode').textContent = activeMode || (pending ? `Not running. ${pending} ancestor notes have NOT been saved. Click Start saving notes to write notes from the current page onward.` : 'Not running. Click Start saving notes to write notes to Ancestry.');
  $('results').replaceChildren();
  for (const row of state.rows) {
    const tr = document.createElement('tr');
    const cell = () => { const td = document.createElement('td'); tr.append(td); return td; };
    cell().textContent = row.name;
    cell().textContent = (row.names || []).join('; ');
    const resultLabel = row.status === 'Ready' ? 'Not saved' : row.status;
    cell().textContent = resultLabel + (row.error ? `\n${row.error}` : '');
    $('results').append(tr);
  }
}
async function refreshTabs() {
  const selected = Number($('source').value) || state.source || Number(new URLSearchParams(location.search).get('source'));
  const tabs = await chrome.tabs.query({ url: ['https://www.ancestry.com/*', 'https://ancestry.com/*'] });
  $('source').replaceChildren();
  for (const tab of tabs) {
    const option = document.createElement('option'); option.value = tab.id; option.textContent = tab.title || tab.url; $('source').append(option);
  }
  if (tabs.some(tab => tab.id === selected)) $('source').value = selected;
}
function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type })), link = document.createElement('a');
  link.download = filename; link.href = url; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function capture() {
  const tabId = Number($('source').value); if (!tabId) throw new Error('Choose your Ancestry tab.');
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: captureLoadedPage });
  const snapshot = results[0]?.result; if (!snapshot?.html) throw new Error('No capture returned.');
  const name = snapshot.title.replace(/[^a-z0-9 -]/gi, '').trim().slice(0, 70);
  download(snapshot.html, `${name}-loaded-${Date.now()}.html`, 'text/html;charset=utf-8');
  status('Loaded page downloaded. Place the file in sample_pages if needed for troubleshooting.');
}
async function rpc(tabId, action, payload = {}) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['core.js', 'page.js'] });
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: async (action, payload) => {
    try { return { value: await ancestryPage(action, payload) }; }
    catch (error) { return { error: error.message }; }
  }, args: [action, payload] });
  const result = results[0]?.result;
  if (!result) throw new Error('The Ancestry tab did not respond.');
  if (result.error) throw new Error(result.error);
  return result.value;
}
async function waitLoaded(tabId, accept) {
  await waitForAncestryLoad(() => chrome.tabs.get(tabId), sleep, accept);
}
async function go(tabId, url) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !['www.ancestry.com', 'ancestry.com'].includes(target.hostname)) throw new Error('Navigation outside Ancestry was refused.');
  await chrome.tabs.update(tabId, { url }); await waitLoaded(tabId);
}
async function list(tabId, expectedURL) {
  // Stabilize the initial page enumeration. For an expected page, the page
  // adapter checks readiness and identity; callers then target a known row.
  const first = await rpc(tabId, 'list', expectedURL ? { listURL: expectedURL } : {});
  if (expectedURL) return first;
  await sleep(700);
  const second = await rpc(tabId, 'list', { listURL: first.url });
  if (first.matches.map(row => row.id).join() !== second.matches.map(row => row.id).join()) throw new Error('The matches are still loading. Wait and resume.');
  return second;
}
async function back(tabId, listURL) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url?.includes('/discoveryui-geneticfamily/thrulines/tree/')) {
    await rpc(tabId, 'back');
    // The page schedules its Back click after replying. Do not mistake the
    // still-loaded ancestor page for the completed return navigation.
    await waitLoaded(tabId, current => current.url !== tab.url);
  }
  const current = await chrome.tabs.get(tabId);
  const wanted = new URL(listURL), actual = new URL(current.url);
  wanted.searchParams.sort(); actual.searchParams.sort();
  if (wanted.href !== actual.href) await go(tabId, listURL);
  await list(tabId, listURL);
}
async function run(mode) {
  const tabId = Number($('source').value); if (!tabId) throw new Error('Choose your Ancestry tab.');
  activeMode = mode === 'all' ? 'SAVING NOTES — notes are being written to Ancestry.' : mode === 'selected' ? 'SAVING SELECTED NOTES — only selected matches on this page will be saved.' : 'PREVIEW ONLY — no notes will be saved to Ancestry.';
  render();
  const tab = await chrome.tabs.get(tabId);
  if (!C.listURL(tab.url)) {
    if (state.source === tabId && state.cursor && tab.url?.includes('/discoveryui-geneticfamily/thrulines/tree/')) await back(tabId, state.cursor);
    else throw new Error('Open your match list, Shared Matches tab, or a DNA Cluster in Ancestry, then start.');
  }
  state.source = tabId; state.complete = false; await persist();
  const runner = new AncestorRunner(state, {
    rpc: (action, payload) => rpc(tabId, action, payload),
    list: expected => list(tabId, expected), go: url => go(tabId, url), back: url => back(tabId, url),
    reload: async () => { await chrome.tabs.reload(tabId, { bypassCache: true }); await waitLoaded(tabId); },
    persist, render, status, paused: () => paused
  });
  status(await runner.run(mode));
}
async function job(work) {
  if (running) return;
  await navigator.locks.request('ancestor-notes-run', { ifAvailable: true }, async lock => {
    if (!lock) { status('Another Ancestry Match Insights dashboard is running.'); return; }
    paused = false; busy(true); render();
    try { await work(); } catch (error) { status(`Stopped: ${error.message}`); }
    finally { await persist(); activeMode = ''; busy(false); render(); }
  });
}
async function init() {
  const stored = (await chrome.storage.local.get('ancestorNotesV2')).ancestorNotesV2;
  if (stored) state = { version: 2, kit: stored.kit, cursor: stored.cursor, source: stored.source, complete: !!stored.complete, rows: [] };
  await persist(); // Drops any full history retained by an earlier version.
  await chrome.storage.local.remove('ancestorNotes'); // Obsolete v0.1 history.
  await refreshTabs(); render();
  if (state.cursor) status('Resume position restored. Click Start saving notes to continue. Existing notes will be skipped.');
  $('refresh').onclick = () => refreshTabs().catch(error => status(error.message));
  $('capture').onclick = () => job(capture);
  $('all').onclick = () => job(() => scanPower.run(() => run('all')));
  $('pause').onclick = () => { paused = true; status('Pausing after the current match operation. A Save already underway will be verified.'); };
  $('clear').onclick = async () => {
    if (!confirm('Reset the resume position? Notes saved on Ancestry will remain.')) return;
    state = { version: 2, rows: [], kit: null, cursor: null, source: Number($('source').value) };
    await persist(); render(); status('Resume position reset.');
  };
}
init().catch(error => status(error.message));
