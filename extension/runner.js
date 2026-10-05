/* Navigation and checkpointing are separate from Chrome APIs for workflow tests. */
globalThis.AncestorRunner = class AncestorRunner {
  constructor(state, io) { this.state = state; this.io = io; }
  async commit() { await this.io.persist(); this.io.render(); }
  async run(mode) {
    const { state, io } = this;
    let previewed = 0;
    let previousPage = 0;
    let runContext = null;
    for (;;) {
      if (io.paused()) return 'Paused. Resume to continue.';
      const list = await io.list();
      if (list.editorOpen) throw new Error('Close the open note editor in Ancestry, then resume. Your draft has not been changed.');
      const context = AncestorCore.listContext(list.url);
      if (!context) throw new Error('Unrecognized match-list URL.');
      if (runContext && context !== runContext) throw new Error('The DNA kit or filters changed during the run. Stop on the list you want and click Start saving notes again.');
      if (!runContext) {
        // Clicking Start authorizes the list selected now, not the old checkpoint.
        if (state.kit !== list.kit || AncestorCore.listContext(state.cursor) !== context) state.rows = [];
        runContext = context;
      }
      if (list.page <= previousPage) throw new Error('Pagination returned to an already processed page.');
      previousPage = list.page;
      state.kit = list.kit; state.cursor = list.url;
      const currentRows = new Map(state.rows.filter(row => row.listURL === list.url).map(row => [`${row.kit}:${row.id}`, row]));
      const pageRows = list.matches.map(match => {
        let row = currentRows.get(`${match.kit}:${match.id}`);
        if (!row) row = { ...match, names: [], selected: false, status: 'Pending' };
        Object.assign(row, match, { listURL: list.url, page: list.page, error: '' });
        if (match.hasNote) {
          row.status = row.status === 'Saved' && row.proposed === match.existing ? 'Saved' : 'Skipped — existing note';
          row.selected = false;
        } else if (!match.ancestorURL) { row.status = 'No common ancestor'; row.selected = false; }
        else if (['Skipped — existing note', 'Saved'].includes(row.status)) { row.names = []; row.status = 'Pending'; }
        return row;
      });
      state.rows = pageRows;
      await this.commit();
      for (const row of pageRows) {
        if (io.paused()) return 'Paused. Resume to continue.';
        if (row.hasNote || !row.ancestorURL) continue;
        if (mode === 'selected' && (!row.selected || row.status !== 'Ready')) continue;
        if ((mode === 'one' || mode === 'preview') && row.status === 'Ready') continue;
        const identity = { kit: row.kit, id: row.id, name: row.name, listURL: list.url };
        let writing = false;
        try {
          io.status(`Page ${list.page}: ${row.name} — checking note`);
          const current = await io.rpc('row', identity);
          if (current.hasNote) { Object.assign(row, current, { status: 'Skipped — existing note', selected: false }); await this.commit(); continue; }
          if (!row.names.length) {
            io.status(`Page ${list.page}: ${row.name} — reading ThruLines`);
            let away = false;
            try {
              away = true; await io.go(row.ancestorURL);
              const result = await io.rpc('ancestors', { kit: row.kit, id: row.id, name: row.name });
              row.names = result.names;
            } finally {
              if (away) await io.back(list.url);
            }
          }
          const note = AncestorCore.mergeNote('', row.names);
          row.proposed = note.value; row.existing = '';
          row.status = !note.value ? 'No names' : !note.fits ? 'Too long' : 'Ready';
          await this.commit(); previewed++;
          if (io.paused()) return 'Paused after returning to the match list. Resume to continue.';
          if ((mode === 'all' || mode === 'selected') && row.status === 'Ready') {
            // Refresh server-backed list state before opening the editor.
            await io.reload();
            const freshList = await io.list(list.url);
            if (freshList.editorOpen) throw new Error('An unrelated note editor is open. Close it before resuming.');
            writing = true; row.status = 'Saving — not verified'; await this.commit();
            io.status(`Page ${list.page}: ${row.name} — saving note`);
            const result = await io.rpc('save', { ...identity, names: row.names, proposed: row.proposed });
            if (result.skipped) {
              row.status = 'Skipped — existing note'; row.selected = false;
            } else {
              await io.reload(); await io.list(list.url);
              const verified = await io.rpc('row', identity);
              if (!verified.hasNote || verified.existing !== row.proposed) throw new Error('The reloaded note does not match. Check the note before resuming.');
              row.status = 'Saved'; row.existing = verified.existing; row.hasNote = true; row.selected = false;
            }
            await this.commit();
          }
          if (mode === 'one' && previewed >= 1) return 'Preview complete. The note has NOT been saved. Click Start saving notes to write it to Ancestry and continue.';
          await io.delay();
        } catch (error) {
          row.status = writing ? 'Save unverified' : 'Failed'; row.error = error.message; row.selected = false;
          await this.commit(); throw error;
        }
      }
      if (mode === 'one' || mode === 'preview') return `Preview complete for page ${list.page}. No notes were saved. Click Start saving notes to write notes to Ancestry.`;
      if (mode === 'selected') return `Finished saving selected notes on page ${list.page}. Check the results below for saved or skipped matches.`;
      if (io.paused()) return 'Paused before advancing to the next page.';
      const refreshed = await io.list(list.url);
      if (!refreshed.nextURL) { state.complete = true; await this.commit(); return list.kind === 'cluster' ? 'Finished processing this DNA cluster.' : 'Finished: reached the last match page.'; }
      const next = AncestorCore.listURL(refreshed.nextURL);
      if (!next || next.page !== list.page + 1 || next.kit !== list.kit || AncestorCore.listContext(refreshed.nextURL) !== runContext) throw new Error('Next Page changed the DNA kit or filters. Stopped before leaving the selected list.');
      state.cursor = refreshed.nextURL; state.rows = []; await this.commit();
      io.status(`Page ${list.page} finished. Opening page ${next.page}…`);
      await io.go(refreshed.nextURL); await io.delay();
    }
  }
};
