// Page adapters check DOM readiness after the browser finishes navigation.
globalThis.waitForAncestryLoad = async function (readTab, sleep, accept = () => true, now = Date.now) {
  const deadline = now() + 36000;
  do {
    const tab = await readTab();
    if (tab.status === 'complete' && !tab.pendingUrl && accept(tab)) return;
    await sleep(100);
  } while (now() < deadline);
  throw new Error('Ancestry did not finish loading.');
};

globalThis.returnToAncestryList = async function (listURL, io) {
  const original = await io.tab();
  if (original.url?.includes('/discoveryui-geneticfamily/thrulines/tree/')) {
    let clicked = false;
    try { await io.clickBack(); clicked = true; }
    catch (error) {
      // A failed ThruLines page may have no navigation controls. Other errors,
      // including access checks, must still stop the run.
      if (error.message !== 'ThruLines Back button was not found.') throw error;
    }
    if (clicked) await io.wait(current => current.url !== original.url);
  }
  const current = await io.tab();
  const wanted = new URL(listURL), actual = new URL(current.url);
  wanted.searchParams.sort(); actual.searchParams.sort();
  if (wanted.href !== actual.href) await io.go(listURL);
  await io.list(listURL);
};
