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
