# torn-scripts

Each userscript is one self-contained `.user.js` file under a category directory. There is no
build step and no dependency install: the file that is committed is the file a user installs.
Torn PDA, the Android app, runs these too, and it ignores `@require` entirely — so a script may
never depend on a library it did not define itself.

## Releasing a script

A release touches the same three places in the file, and they must agree:

1. `// @version` in the metadata header.
2. `const SCRIPT_VERSION`, just inside the IIFE.
3. A new entry at the head of `CHANGELOG`.

A fix with nothing for a player to notice still bumps the version, so managers ship it, but adds
no changelog entry: the popup then stays silent and only records the new version. Changelog lines
are read by players, not developers — one short sentence each, plain words, what changed for them
rather than what changed in the code.

## Branches and pull requests

**Pull requests here are squash-merged.** The branch's own commits never become ancestors of
`main`, so a branch that is reused after its PR is merged still carries a second, independent copy
of work that is already on `main`. Git has to reconcile the two copies, and they collide in the
same three hot lines every release touches. That is the cause of every merge conflict this repo
has seen.

So before starting new work on a branch whose PR was merged, restart it from `main` instead of
stacking onto the merged history:

    git fetch origin main
    git checkout -B <branch> origin/main

Any commits on the branch that were not part of the merged PR get rebased onto the new base rather
than discarded.

Before opening a PR, and again after every push to one, check that it actually merges:

    git fetch origin main
    git merge-tree --write-tree origin/main HEAD >/dev/null && echo mergeable || echo CONFLICTED

A PR whose `mergeable_state` is `dirty` is conflicted. Resolve it before handing over the link.

## Verifying a change

There is no test suite. Drive the real script in headless Chromium (Playwright is available, and
`PLAYWRIGHT_BROWSERS_PATH` already points at an installed browser): serve a small fake page with
the markup the script looks for, stub `window.fetch` for Torn and `window.GM_xmlhttpRequest` for
weav3r, then evaluate the file with `new Function(source)` the way a userscript manager would.
Watch `pageerror` and console errors, and assert on what lands in the DOM.

To reach internals that live inside the IIFE, append an export line to the *source string* in the
test, never to the committed file.
