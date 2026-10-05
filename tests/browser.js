/* Real captured DOM (when supplied) plus anonymized interaction fixtures. */
(async () => {
  const C = AncestorCore, output = document.getElementById('output'), fixture = document.getElementById('fixture');
  const lines = []; let passed = 0, failed = 0;
  const equal = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const test = async (name, fn) => { try { await fn(); lines.push(`PASS ${name}`); passed++; } catch (e) { lines.push(`FAIL ${name}: ${e.message}`); failed++; } };
  const rejects = async (fn, pattern) => { try { await fn(); } catch (e) { if (pattern.test(e.message)) return; throw e; } throw new Error('Expected rejection'); };
  const listURL = 'https://www.ancestry.com/dna/matches/kit-1/list?commonAncestors=true&currentPage=1';
  const identity = { kit: 'kit-1', id: 'match-1', name: 'Alex Sample', listURL };
  const pageAt = url => new Function('location', `return (${ancestryPage.toString()});`)(new URL(url));
  const page = pageAt(listURL);
  function powerFixture() {
    const calls = [], lifecycle = new EventTarget();
    const lease = new ScanPower({ requestKeepAwake: level => calls.push(level), releaseKeepAwake: () => calls.push('release') }, lifecycle);
    return { calls, lifecycle, lease };
  }
  await test('Power request is idle until scanning and allows display sleep', async () => {
    const f = powerFixture(); equal(f.calls, []);
    const result = await f.lease.run(async () => { equal(f.calls, ['system']); return 'finished'; });
    equal(result, 'finished'); equal(f.calls, ['system', 'release']); equal(f.lease.active, false);
  });
  await test('Power request released when scan errors', async () => {
    const f = powerFixture(); await rejects(() => f.lease.run(async () => { throw new Error('Scan failed'); }), /Scan failed/);
    equal(f.calls, ['system', 'release']);
  });
  await test('Graceful stop releases power and resume acquires again', async () => {
    const f = powerFixture(); await f.lease.run(async () => 'Paused'); await f.lease.run(async () => 'Finished');
    equal(f.calls, ['system', 'release', 'system', 'release']);
  });
  await test('Dashboard close or navigation releases an in-flight request once', async () => {
    const f = powerFixture(); let finish;
    const running = f.lease.run(() => new Promise(resolve => { finish = resolve; }));
    f.lifecycle.dispatchEvent(new Event('pagehide')); equal(f.calls, ['system', 'release']);
    finish(); await running; equal(f.calls, ['system', 'release']);
  });
  await test('Closing an idle dashboard never releases another scan request', () => {
    const f = powerFixture(); f.lifecycle.dispatchEvent(new Event('pagehide')); equal(f.calls, []);
  });
  const sharedURL = 'https://www.ancestry.com/dna/matches/kit-1/compare/reference-1/shared-matches?currentPage=1';
  const clusterURL = 'https://www.ancestry.com/dna/matches/kit-1/clusters/3';
  function rowHTML(id = 'match-1', note = null) {
    return `<div data-testid="matches-match-entry"><a data-testid="matches-match-info-name-link" href="/dna/matches/kit-1/compare/${id}">Alex Sample</a><a data-testid="matches-match-tree-common-ancestor-link" href="/discoveryui-geneticfamily/thrulines/tree/for/kit-1?matchingSampleId=${id}">Common ancestor</a><button data-testid="matches-match-entry-add-button">Add</button>${note === null ? '' : `<div class="matchNotes"><button class="notesBtn" aria-label="Add/edit note"></button><span class="noteText">${note}</span></div>`}</div>`;
  }
  function setupList(note = null) {
    fixture.innerHTML = `<div data-testid="matches-match-list-container">${rowHTML('match-1', note)}${rowHTML('match-2', 'Existing note')}</div><section data-testid="matches-match-list-pagination"><span class="pagingNum">1</span><a rel="next" href="?commonAncestors=true&currentPage=2">Next Page</a></section><div id="fake-menu" class="noDisplay"><button role="menuitem">Add/Edit Note</button></div><aside class="sidebar noDisplay"><textarea maxlength="500" data-testid="matches-add-edit-note-textarea"></textarea><button disabled data-testid="matches-add-edit-note-save-button">Save</button><button data-testid="matches-add-edit-note-cancel-button">Cancel</button></aside>`;
    const row = fixture.querySelector('[data-testid="matches-match-entry"]'), menu = fixture.querySelector('#fake-menu');
    const aside = fixture.querySelector('aside'), field = aside.querySelector('textarea'), save = aside.querySelector('[data-testid$="save-button"]');
    let clicks = 0;
    row.querySelector('button').onclick = () => menu.classList.remove('noDisplay');
    menu.querySelector('button').onclick = () => { menu.classList.add('noDisplay'); aside.classList.remove('noDisplay'); };
    field.oninput = () => { save.disabled = false; };
    aside.querySelector('[data-testid$="cancel-button"]').onclick = () => aside.classList.add('noDisplay');
    save.onclick = () => {
      clicks++; const notes = document.createElement('div'); notes.className = 'matchNotes';
      notes.innerHTML = '<button class="notesBtn"></button><span class="noteText"></span>'; notes.querySelector('span').textContent = field.value;
      row.append(notes); aside.classList.add('noDisplay');
    };
    return { row, field, save, aside, menu, clicks: () => clicks };
  }
  function setupShared(note = null) {
    const fixtureState = setupList(note);
    fixture.querySelector('[data-testid="matches-match-list-container"]').setAttribute('data-testid', 'compare-matches-of-matches-page');
    fixture.querySelectorAll('[data-testid="matches-match-entry"]').forEach(el => el.setAttribute('data-testid', 'compare-matches-of-match-entry'));
    fixture.querySelectorAll('[data-testid="matches-match-tree-common-ancestor-link"]').forEach(el => el.setAttribute('data-testid', 'matches-match-tree-common-ancestor-thrulines-link'));
    fixture.querySelector('[rel="next"]').setAttribute('href', '?currentPage=2');
    const header = document.createElement('div'); header.dataset.testid = 'compare-header';
    header.innerHTML = '<a data-testid="matches-match-info-name-link" href="/dna/matches/kit-1/compare/reference-1">Reference Person</a><button>Edit note</button><div class="matchNotes"><span class="noteText">Header note must stay untouched</span></div>';
    fixture.prepend(header);
    return fixtureState;
  }
  function setupCluster(note = null, collapsed = false) {
    const f = setupList(note), list = fixture.querySelector('[data-testid="matches-match-list-container"]');
    list.removeAttribute('data-testid'); list.className = 'auto-cluster-list';
    const section = document.createElement('div'); section.className = 'cluster-list-expandable';
    section.innerHTML = `<div class="cluster-button-toggle" role="button" aria-expanded="${!collapsed}"><span data-testid="matchCount">2 matches</span></div>`;
    const toggle = section.querySelector('.cluster-button-toggle'); toggle.onclick = () => toggle.setAttribute('aria-expanded', 'true');
    section.append(...list.childNodes); list.append(section);
    fixture.querySelector('[data-testid="matches-match-list-pagination"]').remove();
    return { ...f, toggle };
  }
  await test('Names only, deduplicated', () => equal(C.mergeNote('', ['John Smith', 'Mary Jones', 'john  smith']).value, 'John Smith; Mary Jones'));
  await test('Existing text remains untouched', () => equal(C.mergeNote('Research\nKeep', ['John']).value, 'Research\nKeep'));
  await test('Whitespace counts as existing note', () => equal(C.mergeNote(' \n', ['John']).skipped, true));
  await test('500-character boundary', () => { equal(C.mergeNote('', ['a'.repeat(500)]).fits, true); equal(C.mergeNote('', ['a'.repeat(501)]).fits, false); });
  await test('Modern and legacy match links identify the same match', () => equal(C.matchURL('/dna/matches/KIT-1/compare/MATCH-1', listURL).id, C.matchURL('/discoveryui-matches/compare/kit-1/with/match-1', listURL).id));
  await test('Offsite and insecure match links rejected', () => { equal(C.matchURL('https://evil.test/dna/matches/a/compare/b'), null); equal(C.matchURL('http://www.ancestry.com/dna/matches/a/compare/b'), null); });
  await test('Modern list URL supported', () => equal(C.listURL(listURL).page, 1));
  await test('Shared-match URL identifies both kit and reference person', () => {
    const parsed = C.listURL(sharedURL); equal(parsed.kind, 'shared'); equal(parsed.sharedWith, 'reference-1'); equal(parsed.kit, 'kit-1');
    equal(C.listContext(sharedURL) === C.listContext(sharedURL.replace('reference-1', 'reference-2')), false);
    equal(C.listContext(sharedURL) === C.listContext(listURL), false);
  });
  await test('Cluster URL scopes the kit and cluster ID independently', () => {
    const cluster = C.listURL(clusterURL); equal(cluster.kind, 'cluster'); equal(cluster.clusterId, '3'); equal(cluster.sharedWith, null); equal(cluster.page, 1);
    equal(C.listContext(clusterURL) === C.listContext(clusterURL.replace('/3', '/4')), false);
  });
  await test('Cluster list expands and reads matches without page-number controls', async () => {
    const f = setupCluster(null, true); const result = await pageAt(clusterURL)('list');
    equal(f.toggle.getAttribute('aria-expanded'), 'true'); equal(result.matches.length, 2); equal(result.nextURL, null); equal(result.kind, 'cluster');
  });
  await test('Cluster Save writes the correct match note', async () => {
    const f = setupCluster(); await pageAt(clusterURL)('save', { ...identity, listURL: clusterURL, names: ['John Smith'], proposed: 'John Smith' });
    equal(f.clicks(), 1); equal(f.row.querySelector('.noteText').textContent, 'John Smith');
  });
  await test('Cluster existing note is skipped', async () => {
    const f = setupCluster('Keep this cluster note'); equal((await pageAt(clusterURL)('save', { ...identity, listURL: clusterURL, names: ['John'], proposed: 'John' })).skipped, true); equal(f.clicks(), 0);
  });
  await test('Changed cluster ID rejects edits', async () => {
    setupCluster(); await rejects(() => pageAt(clusterURL)('row', { ...identity, listURL: clusterURL.replace('/3', '/4') }), /page changed/);
  });
  await test('Cluster refuses to assume an unrecognized match count is complete', async () => {
    setupCluster(); fixture.querySelector('[data-testid="matchCount"]').textContent = 'Loading';
    await rejects(() => pageAt(clusterURL)('list'), /Cannot determine/);
  });
  await test('Shared list reads its rows and excludes the comparison header', async () => {
    setupShared(); const result = await pageAt(sharedURL)('list'); equal(result.matches.length, 2);
    equal(result.matches.map(row => row.id), ['match-1', 'match-2']); equal(result.matches[0].hasNote, false);
    equal(result.matches.every(row => !!row.ancestorURL), true); equal(C.listURL(result.nextURL).sharedWith, 'reference-1');
  });
  await test('Shared row without Common Ancestor is distinguishable', async () => {
    const f = setupShared(); f.row.querySelector('[data-testid="matches-match-tree-common-ancestor-thrulines-link"]').remove();
    equal((await pageAt(sharedURL)('list')).matches[0].ancestorURL, null);
  });
  await test('Shared-list Save targets the row and ignores header Edit note', async () => {
    const f = setupShared(); await pageAt(sharedURL)('save', { ...identity, listURL: sharedURL, names: ['John Smith'], proposed: 'John Smith' });
    equal(f.clicks(), 1); equal(f.row.querySelector('.noteText').textContent, 'John Smith');
    equal(fixture.querySelector('[data-testid="compare-header"] .noteText').textContent, 'Header note must stay untouched');
  });
  await test('Shared-list existing note is skipped', async () => {
    const f = setupShared('Existing shared note'); equal((await pageAt(sharedURL)('save', { ...identity, listURL: sharedURL, names: ['John'], proposed: 'John' })).skipped, true); equal(f.clicks(), 0);
  });
  await test('Switching reference person mid-edit is rejected', async () => {
    setupShared(); await rejects(() => pageAt(sharedURL)('row', { ...identity, listURL: sharedURL.replace('reference-1', 'reference-2') }), /page changed/);
  });
  await test('Surname and 50-result URL accepted without removing filters', () => {
    const url = 'https://www.ancestry.com/dna/matches/5018BCF3-FEE9-47DE-A89B-93D61F03D161/list?surname=Burrows&currentPage=1&itemsPerPage=50&commonAncestors=true';
    equal(C.listURL(url).kit, '5018bcf3-fee9-47de-a89b-93d61f03d161'); equal(C.listURL(url).url, url);
    equal(C.listContext(url), C.listContext(url.replace('currentPage=1', 'currentPage=2')));
    equal(C.listContext(url) === C.listContext(url.replace('surname=Burrows&', '')), false);
  });
  await test('Filter comparison ignores parameter order but detects different surname', () => {
    const a = listURL + '&surname=Burrows&itemsPerPage=50';
    const b = 'https://www.ancestry.com/dna/matches/kit-1/list?itemsPerPage=50&surname=Burrows&commonAncestors=true&currentPage=2';
    equal(C.listContext(a), C.listContext(b)); equal(C.listContext(a) === C.listContext(b.replace('Burrows', 'Smith')), false);
  });
  await test('List reader identifies notes and Next Page', async () => { setupList(); const result = await page('list'); equal(result.matches.length, 2); equal(result.matches.map(row => row.hasNote), [false, true]); equal(C.listURL(result.nextURL).page, 2); });
  await test('Disabled Next means last page', async () => { setupList(); fixture.querySelector('[rel="next"]').setAttribute('aria-disabled', 'true'); equal((await page('list')).nextURL, null); });
  await test('Page-number dropdown reads selected value, not every option label', async () => {
    setupList(); fixture.querySelector('.pagingNum').outerHTML = '<select class="pagingSelect" aria-label="Select new page number"><option selected value="1">1</option><option value="2">2</option><option value="3">3</option></select>';
    equal((await page('list')).page, 1);
  });
  await test('Filtered list retains surname and page size through Next', async () => {
    setupList(); const url = listURL + '&surname=Burrows&itemsPerPage=50';
    fixture.querySelector('[rel="next"]').setAttribute('href', '?commonAncestors=true&currentPage=2&surname=Burrows&itemsPerPage=50');
    const result = await pageAt(url)('list'); equal(new URL(result.nextURL).searchParams.get('surname'), 'Burrows'); equal(result.matches.length, 2);
    fixture.querySelector('[rel="next"]').setAttribute('href', '?commonAncestors=true&currentPage=2');
    await rejects(() => pageAt(url)('list'), /change the DNA kit or filters/);
  });
  await test('Whitespace notes skipped from row indicator', async () => { setupList('  '); equal((await page('row', identity)).hasNote, true); });
  await test('Existing note never opens Add or clicks Save', async () => { const f = setupList('Keep this'); equal((await page('save', { ...identity, names: ['John Smith'], proposed: 'John Smith' })).skipped, true); equal(f.clicks(), 0); equal(f.menu.classList.contains('noDisplay'), true); });
  await test('Empty note saved to exact matching row despite other note buttons', async () => {
    const f = setupList(); await page('save', { ...identity, names: ['John Smith'], proposed: 'John Smith' });
    equal(f.clicks(), 1); equal(f.row.querySelector('.noteText').textContent, 'John Smith');
    equal(fixture.querySelectorAll('.noteText')[1].textContent, 'Existing note');
  });
  await test('Hidden existing note discovered in editor is not overwritten', async () => {
    const f = setupList(); f.field.value = 'A note not shown in the row';
    equal((await page('save', { ...identity, names: ['John'], proposed: 'John' })).skipped, true);
    equal(f.clicks(), 0); equal(f.field.value, 'A note not shown in the row'); equal(f.aside.classList.contains('noDisplay'), true);
  });
  await test('Open unrelated draft stops Save without discarding it', async () => {
    const f = setupList(); f.aside.classList.remove('noDisplay'); f.field.value = 'Unsaved draft';
    await rejects(() => page('save', { ...identity, names: ['John'], proposed: 'John' }), /already open/); equal(f.field.value, 'Unsaved draft');
  });
  await test('Wrong list page rejected before write', async () => { setupList(); await rejects(() => page('save', { ...identity, listURL: listURL.replace('currentPage=1', 'currentPage=2') }), /page changed/); });
  await test('Unknown match ID rejected', async () => { setupList(); await rejects(() => page('row', { ...identity, id: 'missing' }), /matching row/); });
  await test('Oversized note never opens editor', async () => { const f = setupList(); await rejects(() => page('save', { ...identity, names: ['x'.repeat(501)], proposed: 'x'.repeat(501) }), /oversized/); equal(f.field.value, ''); });
  await test('Only marked common ancestors are read', async () => {
    fixture.innerHTML = '<div id="treeViewer" aria-busy="false"><div class="commonAncestorNode"><span class="horizontalNodeName">John Smith</span><span class="commonAncestorText">Common ancestor</span></div><div><span class="horizontalNodeName">Descendant</span></div><div class="nodeDnaMatch shouldHighlight"><span class="horizontalNodeName">Alex Sample</span></div></div>';
    const thru = pageAt('https://www.ancestry.com/discoveryui-geneticfamily/thrulines/tree/123/for/kit-1?matchingSampleId=match-1');
    equal((await thru('ancestors', { kit: 'kit-1', id: 'match-1', name: 'Alex Sample' })).names, ['John Smith']);
    await rejects(() => thru('ancestors', { kit: 'kit-1', id: 'wrong' }), /different match/);
  });
  await test('ThruLines identity fallback requires the selected match name', async () => {
    const thru = pageAt('https://www.ancestry.com/discoveryui-geneticfamily/thrulines/tree/123/for/kit-1');
    equal((await thru('ancestors', { kit: 'kit-1', id: 'match-1', name: 'Alex Sample' })).names, ['John Smith']);
    await rejects(() => thru('ancestors', { kit: 'kit-1', id: 'match-1', name: 'Someone Else' }), /Cannot verify/);
  });
  // Controller simulations exercise ordering independently of the DOM adapter.
  function simulation({ existing = false, verifyFails = false, secondPage = true } = {}) {
    const state = { rows: [], kit: null }, events = [], notes = new Map(); let currentPage = 1, stopped = false;
    if (existing) notes.set('match-1', 'Keep');
    const urlFor = n => listURL.replace('currentPage=1', `currentPage=${n}`);
    const match = n => ({ kit: 'kit-1', id: `match-${n}`, name: `Match ${n}`, url: '', ancestorURL: `https://www.ancestry.com/discoveryui-geneticfamily/thrulines/tree/for/kit-1?matchingSampleId=match-${n}`, hasNote: notes.has(`match-${n}`), existing: notes.get(`match-${n}`) || '' });
    const io = {
      persist: async () => {}, render() {}, status() {}, delay: async () => {}, paused: () => stopped,
      list: async () => ({ kit: 'kit-1', page: currentPage, url: urlFor(currentPage), nextURL: currentPage === 1 && secondPage ? urlFor(2) : null, matches: [match(currentPage)], editorOpen: false }),
      go: async url => { events.push(`go:${url.includes('/list?') ? 'page' : 'ancestor'}`); const parsed = C.listURL(url); if (parsed) currentPage = parsed.page; },
      back: async () => { events.push('back'); }, reload: async () => { events.push('reload'); },
      rpc: async (action, payload) => {
        events.push(`${action}:${payload.id}`);
        if (action === 'row') return match(Number(payload.id.split('-')[1]));
        if (action === 'ancestors') return { names: ['John Smith'] };
        if (action === 'save') { if (!verifyFails) notes.set(payload.id, payload.proposed); return { clicked: true }; }
      }
    };
    return { state, events, notes, io, stop: () => { stopped = true; }, runner: new AncestorRunner(state, io) };
  }
  await test('Preview returns through Back without saving or advancing', async () => {
    const s = simulation(); await s.runner.run('one'); equal(s.state.rows[0].status, 'Ready'); equal(s.events.includes('back'), true); equal(s.events.some(x => x.startsWith('save:') || x === 'go:page'), false);
  });
  await test('Shared-match workflow returns to exact shared list before saving', async () => {
    const s = simulation({ secondPage: false }), originalList = s.io.list;
    s.io.list = async () => ({ ...await originalList(), url: sharedURL });
    let returned = null; s.io.back = async url => { returned = url; };
    await s.runner.run('all'); equal(returned, sharedURL); equal(s.notes.get('match-1'), 'John Smith');
  });
  await test('Cluster run returns to its cluster and stops without next-page navigation', async () => {
    const s = simulation({ secondPage: false }), originalList = s.io.list;
    s.io.list = async () => ({ ...await originalList(), url: clusterURL, kind: 'cluster', clusterId: '3' });
    let returned = null; s.io.back = async url => { returned = url; };
    const message = await s.runner.run('all'); equal(returned, clusterURL); equal(s.notes.get('match-1'), 'John Smith'); equal(s.events.includes('go:page'), false); equal(message, 'Finished processing this DNA cluster.');
  });
  await test('Rows without ancestors are skipped without navigation or writes', async () => {
    const s = simulation({ secondPage: false }), originalList = s.io.list;
    s.io.list = async () => { const list = await originalList(); list.matches[0].ancestorURL = null; return list; };
    await s.runner.run('all'); equal(s.events, []); equal(s.state.rows[0].status, 'No common ancestor');
  });
  await test('Run finishes and verifies first page before visiting next page', async () => {
    const s = simulation(); await s.runner.run('all'); equal(s.state.rows.map(row => row.status), ['Saved']); equal(s.state.rows[0].id, 'match-2');
    const saved = s.events.indexOf('save:match-1'), next = s.events.indexOf('go:page');
    equal(saved < next && s.events.slice(saved + 1, next).includes('row:match-1'), true); equal(s.events.filter(x => x === 'back').length, 2);
  });
  await test('New run automatically adopts selected kit instead of old checkpoint', async () => {
    const s = simulation({ secondPage: false }); s.state.kit = 'old-kit'; s.state.cursor = listURL.replace('kit-1', 'old-kit');
    s.state.rows = [{ kit: 'old-kit', id: 'old-match', names: ['Wrong Ancestor'], listURL: s.state.cursor }];
    await s.runner.run('all'); equal(s.state.kit, 'kit-1'); equal(s.notes.get('match-1'), 'John Smith'); equal(s.state.rows.length, 1);
  });
  await test('New filters discard old unsaved names before reading the selected list', async () => {
    const s = simulation({ secondPage: false }); s.state.kit = 'kit-1'; s.state.cursor = listURL + '&surname=Other';
    s.state.rows = [{ ...identity, listURL: s.state.cursor, names: ['Stale Ancestor'], status: 'Ready' }];
    await s.runner.run('all'); equal(s.notes.get('match-1'), 'John Smith'); equal(s.events.includes('ancestors:match-1'), true);
  });
  await test('Mid-run kit switch stops before visiting another ancestor', async () => {
    const s = simulation(); const originalGo = s.io.go, originalList = s.io.list; let switched = false;
    s.io.go = async url => { await originalGo(url); if (url.includes('currentPage=2')) switched = true; };
    s.io.list = async () => { const result = await originalList(); return switched ? { ...result, kit: 'different-kit', url: result.url.replace('kit-1', 'different-kit') } : result; };
    await rejects(() => s.runner.run('all'), /changed during the run/); equal(s.notes.has('match-2'), false);
  });
  await test('Existing-note match skipped without visiting ThruLines', async () => { const s = simulation({ existing: true, secondPage: false }); await s.runner.run('all'); equal(s.events.length, 0); equal(s.state.rows[0].status, 'Skipped — existing note'); });
  await test('Failed verification stops before Next Page and remains unverified', async () => {
    const s = simulation({ verifyFails: true }); await rejects(() => s.runner.run('all'), /reloaded note/); equal(s.events.includes('go:page'), false); equal(s.state.rows[0].status, 'Save unverified');
  });
  await test('Resume skips a note saved before interruption', async () => {
    const s = simulation({ existing: true, secondPage: false }); s.state.rows.push({ ...identity, names: ['John'], status: 'Saving — not verified' }); await s.runner.run('all'); equal(s.events.length, 0); equal(s.state.rows[0].status, 'Skipped — existing note');
  });
  await test('Pause after ancestor visit restores list and does not save', async () => {
    const s = simulation(); s.io.back = async () => { s.events.push('back'); s.stop(); }; await s.runner.run('all'); equal(s.events.includes('back'), true); equal(s.events.some(x => x.startsWith('save:')), false); equal(s.state.rows[0].status, 'Ready');
  });
  await test('Selected save uses reviewed names without another tree visit', async () => {
    const s = simulation({ secondPage: false }); await s.runner.run('one'); s.state.rows[0].selected = true; s.state.rows[0].names = ['Reviewed Name']; s.events.length = 0;
    await s.runner.run('selected'); equal(s.events.includes('go:ancestor'), false); equal(s.notes.get('match-1'), 'Reviewed Name');
  });
  await test('Old history is dropped and only current page remains in memory', async () => {
    const s = simulation(); s.state.rows = Array.from({ length: 10000 }, (_, id) => ({ id: `old-${id}`, listURL: 'old', status: 'Saved' }));
    let largestCheckpoint = 0;
    s.io.persist = async () => { largestCheckpoint = Math.max(largestCheckpoint, s.state.rows.length); };
    await s.runner.run('all'); equal(largestCheckpoint, 1); equal(s.state.rows.map(row => row.id), ['match-2']);
  });
  await test('Resume checkpoint never stores match history or notes', () => {
    const state = { kit: 'kit-1', cursor: listURL, source: 7, rows: Array.from({ length: 10000 }, () => ({ name: 'Private Name', existing: 'Private Note' })) };
    const checkpoint = C.resumeCheckpoint(state);
    equal(Object.keys(checkpoint), ['version', 'kit', 'cursor', 'source', 'complete']);
    equal(JSON.stringify(checkpoint).includes('Private'), false); equal(JSON.stringify(checkpoint).length < 500, true);
  });
  await test('Capture preserves live values without changing source', () => {
    fixture.innerHTML = '<textarea>Initial</textarea><input type="password" value="secret"><div onclick="void 0" data-csrf-token="secret"></div>';
    fixture.querySelector('textarea').value = 'Live note'; const parsed = new DOMParser().parseFromString(captureLoadedPage().html, 'text/html');
    equal(parsed.querySelector('#fixture textarea').textContent, 'Live note'); equal(parsed.querySelectorAll('script,input[type="password"],[onclick],[data-csrf-token]').length, 0); equal(fixture.querySelector('input').value, 'secret');
  });
  for (const sample of globalThis.realSamples || []) {
    await test(`Captured DOM: ${sample.filename}`, async () => {
      const parsed = new DOMParser().parseFromString(sample.html, 'text/html');
      fixture.innerHTML = parsed.body.innerHTML;
      const path = parsed.documentElement.getAttribute('data-captured-path');
      if (path.includes('/clusters/')) {
        const read = pageAt('https://www.ancestry.com' + path), result = await read('list');
        equal(result.kind, 'cluster'); equal(result.clusterId, '3'); equal(result.matches.length, 60); equal(result.nextURL, null);
        equal(result.matches.filter(row => !!row.ancestorURL).length, 14);
        equal(result.matches.some(row => row.hasNote), true);
        equal(result.matches.every(row => row.kit === result.kit), true);
      } else if (path.includes('/dna/matches/')) {
        const filteredSample = sample.filename === 'AncestryDNA Matches-loaded-1791158540910.html';
        const sharedSample = path.endsWith('/shared-matches');
        const query = filteredSample ? '?surname=Burrows&currentPage=1&itemsPerPage=50&commonAncestors=true' : '?commonAncestors=true&currentPage=1';
        const firstLink = fixture.querySelector('[data-testid="matches-match-info-name-link"]');
        const returnURL = new URL(firstLink.getAttribute('href'), 'https://www.ancestry.com').searchParams.get('returnUrl');
        const read = pageAt(sharedSample ? returnURL : 'https://www.ancestry.com' + path + query);
        const result = await read('list'); equal(result.matches.length, filteredSample ? 14 : 20); equal(result.page, 1);
        if (filteredSample) { equal(result.nextURL, null); equal(new URL(result.url).searchParams.get('surname'), 'Burrows'); }
        else equal(C.listURL(result.nextURL).page, 2);
        equal(result.matches.some(row => row.hasNote), true); equal(result.matches.some(row => !row.hasNote), true);
        if (sharedSample) {
          equal(result.matches.filter(row => !!row.ancestorURL).length, 6);
          equal(result.matches.some(row => row.id === result.sharedWith), false);
          equal(C.listURL(result.nextURL).sharedWith, result.sharedWith);
          equal(C.listContext(result.nextURL), C.listContext(returnURL));
        } else equal(result.matches.every(row => !!row.ancestorURL), true);
        const field = fixture.querySelector('[data-testid="matches-add-edit-note-textarea"]'); equal(field.maxLength, 500);
        equal(result.editorOpen, !field.closest('aside').classList.contains('noDisplay'));
      } else {
        const read = pageAt('https://www.ancestry.com' + path), kit = path.split('/for/')[1].toLowerCase();
        const name = fixture.querySelector('.nodeDnaMatch.shouldHighlight .horizontalNodeName').textContent;
        const result = await read('ancestors', { kit, id: 'unused-no-query', name });
        equal(result.names, ['John S Wheeler']); equal(!!fixture.querySelector('#dnaSubnavBackButton'), true);
      }
    });
  }
  fixture.replaceChildren(); output.textContent = `${passed} passed, ${failed} failed\n\n${lines.join('\n')}`;
  document.title = failed ? 'FAIL' : 'PASS'; document.body.dataset.testResult = failed ? 'fail' : 'pass';
})();
