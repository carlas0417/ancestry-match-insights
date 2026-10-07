# Ancestry Match Insights

A local Chrome extension uses your existing Ancestry login to scan DNA match lists, Shared Matches, and DNA Clusters. It follows Common Ancestor links into ThruLines and automatically saves the ancestor names in each match's note. Matches with existing notes or without a Common Ancestor link are skipped.

### Analytical Value

AncestryDNA provides several valuable pieces of information that are difficult to analyze together: Common Ancestors, which identify likely genealogical connections between DNA matches; Shared Matches, which reveal people who share DNA with both profiles being compared; and Pro Tools Custom Clusters, which identify broader networks of DNA matches who also match one another.

The limitation is visibility. Common Ancestor information is primarily surfaced at the individual-match level. When evaluating Shared Matches or Custom Clusters, the ancestral relationships that may explain those DNA connections are not conveniently visible, often requiring the researcher to repeatedly open individual match records and inspect their genealogy.

This tool bridges that gap by automatically adding each identified Common Ancestor to the match's Ancestry note. Because notes are visible directly in match and Shared Match views, genealogical context becomes available at the point of analysis. This makes it much easier to recognize recurring ancestors and family lines, identify unexpected connections, interpret DNA clusters, and select promising matches for deeper investigation without repeatedly navigating into individual profiles.

## Install or update

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this project's `extension` folder. If already installed, pause the running crawler, wait for it to stop, then click the extension card's circular-arrow **Reload** button.
3. Close the old dashboard tab and reopen **Ancestry Match Insights** from Chrome's puzzle-piece menu.

## Use

1. In Ancestry, open your DNA match list, a match's **Shared Matches** tab, or a **DNA Cluster**. Use the filters you want and close any note editor. For paginated lists, start on page 1 for every match or leave the list on your current page to continue.
2. In the dashboard, select that Ancestry tab.
3. Click **Start saving notes** once. The extension handles the rest. Use **Pause** to stop after the current match operation.

You can choose another DNA kit or add filters such as `surname=Burrows` and `itemsPerPage=50`. Each new Start uses the selected tab's current kit and filters automatically, rather than requiring the old checkpoint to be cleared. Those filters must remain consistent throughout the run and pagination; changing them mid-run stops processing.

Shared Matches uses its own row layout and Common Ancestor icons. The crawler reads only those rows, excluding the comparison header, and returns to the same shared-match list after visiting ThruLines. It never follows a shared match's name into another shared-match list. Rows without a Common Ancestor link are skipped; the Common ancestors filter is optional. The comparison match's ID is part of the run context so a run cannot silently switch to another person's shared matches.

DNA Cluster detail pages (`/dna/matches/<kit>/clusters/<id>`) are supported. The crawler expands the match sections, waits for their displayed match counts, and processes rows with Common Ancestor links. It returns to the same cluster after ThruLines and re-expands it after reloads. Cluster charts and add-match side panels are not crawled. When the selected cluster is finished, it stops; it does not open other clusters. The cluster ID is checked before edits. The captured 60-match custom cluster is covered by local DOM tests; live cluster interactions still need validation.

Keep the dashboard open and avoid navigating the selected Ancestry tab during the run. Other browser tabs can be used normally. Only one crawler run is allowed at a time.

During an active scan, the extension requests `chrome.power.requestKeepAwake('system')`: Windows idle sleep is prevented while the display may dim or turn off normally. The request is released when scanning finishes, stops after Pause, or fails, and when the dashboard is closed or navigated away from. Chrome removes extension power requests when the extension/browser exits. Opening the dashboard or capturing a page does not acquire a request. No Windows power-plan settings are changed. This prevents automatic idle sleep, not a deliberate Sleep command or shutdown. See the [Chrome power API](https://developer.chrome.com/docs/extensions/reference/api/power).

## Iteration

For each match on the current page:

1. Check the matching row's note text and note indicator. Skip any existing note, including whitespace-only notes.
2. Follow its **Common Ancestor** link into ThruLines and verify the DNA kit and match identity.
3. Read only tree nodes explicitly marked **Common ancestor**, using the displayed names. Other relatives and the DNA match's own card are excluded.
4. Use **Back** to return to the exact match-list page and filters.
5. Open that match's Add → Add/Edit Note control, and check again that the editor is empty.
6. Save just the names, for example `John Smith; Mary Jones`, then reload and verify the saved note.
7. Once the page is finished, discard its results and follow **Next Page**.

Long notes exceeding 500 characters are skipped without truncation. A navigation, identity, or save error stops the run. No note is appended to or overwritten.

## No history

The table and counts describe only the current match-list page. Completed-page results are discarded as soon as the crawler advances. There is no accumulating history, history browser, export, or approval queue.

Only a small resume checkpoint is stored locally: the DNA kit ID, list URL, tab ID, and completion flag. Match names, ancestor names, and notes are not persisted by the crawler. On reload, old history stored by previous versions is removed automatically. Your notes on Ancestry are unaffected.

If interrupted, reopen the dashboard and resume. The current page may be checked again; already saved notes on Ancestry cause those matches to be skipped. If an editor is left open after an error, check it and close it before resuming. The extension does not discard an unrelated draft.

No server, API key, analytics, messages, password collection, or cookie export is used. Sign-in and access checks stop the run for manual handling.

## Tests

Run `python tests/run_browser.py` on Windows with Chrome installed. It runs anonymized fixtures and optional local captures in a separate temporary Chrome profile, without your Ancestry login. Its temporary sample-data file is removed afterwards.
