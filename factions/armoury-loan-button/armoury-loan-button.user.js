// ==UserScript==
// @name         Torn Armoury Loan Button
// @namespace    https://github.com/SOLiNARY
// @version      0.3.0
// @description  Caches loanable faction armoury items and adds a "Loan" button next to organized crime roles that require an item, loaning it to you in one click.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/factions.php*
// @match        https://torn.com/factions.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[TornArmouryLoanButton]';
    const ITEMS_KEY = 'silmaril-armoury-loan-items';
    const SLOT_ITEMS_KEY = 'silmaril-armoury-loan-slots';
    const USER_KEY = 'silmaril-armoury-loan-user';
    const RFCV_KEY = 'silmaril-armoury-loan-rfcv';
    const USED_ITEM_MARKER = 'used item';
    const RFCV_ARG = 'rfcv=';
    const USER_ID_KEYS = ['userID', 'userId', 'user_id', 'playerId', 'playerID', 'uid'];
    const USER_NAME_KEYS = ['playername', 'playerName', 'username', 'userName', 'user_name'];

    addStyle(`
.silmaril-oc-loan-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 8px;
    vertical-align: middle;
    flex-shrink: 0;
    white-space: nowrap;
}

.silmaril-oc-loan-wrap .silmaril-oc-loan-btn {
    cursor: pointer;
}

.silmaril-oc-loan-wrap .silmaril-oc-loan-btn.silmaril-busy {
    opacity: 0.6;
    pointer-events: none;
}

.silmaril-oc-loan-wrap .silmaril-oc-loan-btn.silmaril-success {
    color: #85b200;
}

.silmaril-oc-loan-msg {
    font-size: 11px;
    line-height: 1.3;
    max-width: 250px;
}

.silmaril-oc-loan-msg.success {
    color: #85b200;
}

.silmaril-oc-loan-msg.failure {
    color: #ff6b6b;
}
    `);

    // --- rfcv token ------------------------------------------------------------
    // The rfcv value changes from time to time, so it is captured from Torn's own
    // ajax traffic via PerformanceObserver (works in both page and isolated
    // userscript worlds), with the rfc_v cookie as the primary source.

    let capturedRfcv = null;

    function captureRfcvFromUrl(url) {
        if (typeof url !== 'string') return;
        const idx = url.indexOf(RFCV_ARG);
        if (idx < 0) return;
        const value = url.substring(idx + RFCV_ARG.length).split('&')[0];
        if (!value || value === capturedRfcv) return;
        capturedRfcv = value;
        try {
            localStorage.setItem(RFCV_KEY, value);
        } catch (e) { /* ignore quota errors */ }
    }

    try {
        performance.getEntriesByType('resource').forEach((entry) => captureRfcvFromUrl(entry.name));
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) captureRfcvFromUrl(entry.name);
        }).observe({ type: 'resource', buffered: true });
    } catch (e) {
        console.warn(`${LOG_PREFIX} PerformanceObserver unavailable:`, e);
    }

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : null;
    }

    function getRfcv() {
        return getCookie('rfc_v') ?? capturedRfcv ?? localStorage.getItem(RFCV_KEY);
    }

    // --- armoury items cache ---------------------------------------------------

    function getStoredItems() {
        try {
            const parsed = JSON.parse(localStorage.getItem(ITEMS_KEY));
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveItems(items) {
        try {
            localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
        } catch (e) { /* ignore quota errors */ }
    }

    function getItemName(row) {
        const nameEl = row.querySelector('.name');
        if (!nameEl) return '';
        const clone = nameEl.cloneNode(true);
        clone.querySelectorAll('.qty').forEach((qty) => qty.remove());
        return clone.textContent.trim().replace(/\s*x$/i, '');
    }

    function isRowLoanable(row) {
        const loanBtn = row.querySelector('.item-action [data-role="loan"], .item-action .loan');
        if (!loanBtn || !loanBtn.classList.contains('active')) return false;
        const loanedEl = row.querySelector('.loaned');
        if (!loanedEl) return false;
        const clone = loanedEl.cloneNode(true);
        clone.querySelectorAll('.t-show').forEach((label) => label.remove());
        return clone.textContent.trim().toLowerCase().includes('available');
    }

    function itemsEqual(a, b) {
        if (!a || !b) return false;
        if (a.name !== b.name || a.type !== b.type) return false;
        const aIds = a.armoryIds ?? [];
        const bIds = b.armoryIds ?? [];
        return aIds.length === bIds.length && aIds.every((id, i) => id === bIds[i]);
    }

    // Collects every armoury row currently rendered and remembers which armoury
    // ids of each item can be loaned right now. Items not rendered at the moment
    // (other categories/pages) keep their previously cached state.
    function scanArmoury() {
        const wraps = document.querySelectorAll('li .img-wrap[data-armoryid][data-itemid]');
        if (wraps.length === 0) return;

        const seen = {};
        for (const wrap of wraps) {
            const row = wrap.closest('li');
            const itemId = wrap.getAttribute('data-itemid');
            const armoryId = wrap.getAttribute('data-armoryid');
            if (!row || !itemId || !armoryId) continue;

            let entry = seen[itemId];
            if (!entry) {
                entry = seen[itemId] = {
                    name: getItemName(row),
                    type: row.querySelector('.type')?.textContent.trim() ?? '',
                    armoryIds: []
                };
            }
            if (isRowLoanable(row) && !entry.armoryIds.includes(armoryId)) {
                entry.armoryIds.push(armoryId);
            }
        }

        const stored = getStoredItems();
        let changed = false;
        for (const itemId of Object.keys(seen)) {
            if (!itemsEqual(stored[itemId], seen[itemId])) {
                stored[itemId] = { ...seen[itemId], updated: Date.now() };
                changed = true;
            }
        }
        if (changed) {
            saveItems(stored);
            console.log(`${LOG_PREFIX} Armoury cache updated:`, Object.keys(seen).length, 'item(s) on screen');
        }
    }

    // --- current user ----------------------------------------------------------

    let cachedUser = null;

    function deepFindUser(node, depth) {
        if (!node || typeof node !== 'object' || depth > 4) return null;
        const idKey = USER_ID_KEYS.find((key) => node[key] != null && /^\d+$/.test(String(node[key])));
        const nameKey = USER_NAME_KEYS.find((key) => typeof node[key] === 'string' && node[key].trim() !== '');
        if (idKey && nameKey) return { id: String(node[idKey]), name: node[nameKey].trim() };
        for (const key of Object.keys(node)) {
            if (node[key] && typeof node[key] === 'object') {
                const found = deepFindUser(node[key], depth + 1);
                if (found) return found;
            }
        }
        return null;
    }

    function findUserInJsonScripts() {
        const scripts = document.querySelectorAll('#websocketConnectionData, script[type="application/json"]');
        for (const script of scripts) {
            try {
                const found = deepFindUser(JSON.parse(script.textContent), 0);
                if (found) return found;
            } catch (e) { /* not JSON, skip */ }
        }
        return null;
    }

    function findUserInHeader() {
        for (const rootSelector of ['#header-root', '#sidebarroot', '#sidebar']) {
            const link = document.querySelector(`${rootSelector} a[href*="profiles.php?XID="]`);
            if (!link) continue;
            const id = link.href.match(/XID=(\d+)/)?.[1];
            const name = link.textContent.trim();
            if (id && /^[\w-]{1,25}$/.test(name)) return { id, name };
        }
        return null;
    }

    function getUser() {
        if (cachedUser) return cachedUser;
        const found = findUserInJsonScripts() ?? findUserInHeader();
        if (found) {
            cachedUser = found;
            try {
                localStorage.setItem(USER_KEY, JSON.stringify(found));
            } catch (e) { /* ignore quota errors */ }
            return found;
        }
        try {
            const stored = JSON.parse(localStorage.getItem(USER_KEY));
            if (stored?.id && stored?.name) {
                cachedUser = stored;
                return stored;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    // --- organized crimes page -------------------------------------------------

    function extractItemId(img) {
        for (const attr of ['src', 'srcset']) {
            const id = img.getAttribute(attr)?.match(/(?:^|\/)images\/items\/(\d+)\//)?.[1];
            if (id) return id;
        }
        return null;
    }

    // Falls back to resolving the item by the name written after "Used item:",
    // matched against the cached armoury item names.
    function findItemIdByName(blockText) {
        const captured = blockText?.match(/used item:?\s*(.{1,60})/i)?.[1].trim().toLowerCase();
        if (!captured) return null;
        let best = null;
        for (const [itemId, entry] of Object.entries(getStoredItems())) {
            const name = entry?.name?.trim().toLowerCase();
            if (!name || !captured.startsWith(name)) continue;
            if (!best || name.length > best.nameLength) best = { itemId, nameLength: name.length };
        }
        return best?.itemId ?? null;
    }

    // Climbs from the item image to the smallest ancestor containing the
    // "Used item: ..." text; OC class names are hashed and the text may be
    // split across word-level spans, so the ancestors' combined textContent is
    // the only stable marker. The size cap keeps it from latching onto huge
    // containers that merely happen to contain the text somewhere far away.
    //
    // This block itself lives inside a hover/tooltip element that Torn hides
    // (or unmounts) the instant the cursor leaves it, so it is only ever used
    // to read the item requirement - never as the place to put the button.
    function findUsedItemBlock(img) {
        let el = img.parentElement;
        for (let depth = 0; el && el !== document.body && depth < 8; depth++) {
            const text = el.textContent ?? '';
            if (text.length > 600) return null;
            if (text.toLowerCase().includes(USED_ITEM_MARKER)) return el;
            el = el.parentElement;
        }
        return null;
    }

    // Torn's OC role slots use CSS-module class names ("localName___hash");
    // the hash suffix rotates on deploy but the local name stays put, so
    // matching goes against the "name___" prefix rather than an exact class.
    function moduleChild(root, name) {
        return root.querySelector(`:scope > [class*="${name}___"]`);
    }

    // Every role slot renders as a stable card with a "slotHeader" button and
    // a "slotBody" div as direct children - unlike the "Used item" tooltip,
    // that card stays visible regardless of hover state, so climb up to it
    // from wherever the item requirement was found and anchor the button there.
    function findSlotCard(startEl) {
        let node = startEl;
        for (let depth = 0; node && node !== document.body && depth < 15; depth++) {
            if (moduleChild(node, 'slotHeader') && moduleChild(node, 'slotBody')) return node;
            node = node.parentElement;
        }
        return null;
    }

    // Identifies a slot across scans/rescans: the OC id disambiguates between
    // crimes, the role title (e.g. "Muscle #1") disambiguates roles within one.
    function getSlotKey(slotCard) {
        const ocId = slotCard.closest('[data-oc-id]')?.getAttribute('data-oc-id') ?? 'oc?';
        const title = slotCard.querySelector('[class*="title___"]')?.textContent.trim() ?? 'role?';
        return `${ocId}::${title}`;
    }

    function getSlotItemCache() {
        try {
            const parsed = JSON.parse(localStorage.getItem(SLOT_ITEMS_KEY));
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveSlotItemCache(cache) {
        try {
            localStorage.setItem(SLOT_ITEMS_KEY, JSON.stringify(cache));
        } catch (e) { /* ignore quota errors */ }
    }

    function scanCrimes() {
        const slotCache = getSlotItemCache();
        let slotCacheChanged = false;

        // Pass 1: read every "Used item" tooltip currently in the DOM (visible
        // or not) and remember its item against the stable slot card it
        // belongs to, so the mapping survives even after the tooltip is gone.
        const imgs = document.querySelectorAll('img[src*="images/items/"], img[srcset*="images/items/"]');
        for (const img of imgs) {
            if (img.closest('.img-wrap[data-armoryid], .silmaril-oc-loan-wrap, #chatRoot, [class^="chat-box"]')) continue;
            const textBlock = findUsedItemBlock(img);
            if (!textBlock) continue;
            const itemId = extractItemId(img) ?? findItemIdByName(textBlock.textContent);
            if (!itemId) continue;

            const slotCard = findSlotCard(textBlock);
            if (slotCard) {
                const key = getSlotKey(slotCard);
                if (slotCache[key] !== itemId) {
                    slotCache[key] = itemId;
                    slotCacheChanged = true;
                }
            } else if (!textBlock.querySelector('.silmaril-oc-loan-btn')) {
                // Couldn't map the tooltip to a stable slot card - fall back to
                // injecting right where the item was found rather than nothing.
                injectButton(textBlock, itemId);
            }
        }
        if (slotCacheChanged) saveSlotItemCache(slotCache);

        // Pass 2: render (or restore) the button in every currently-mounted
        // slot card whose item requirement is known, whether just discovered
        // above or cached from an earlier scan when its tooltip wasn't showing.
        document.querySelectorAll('[class*="slotHeader___"]').forEach((header) => {
            const slotCard = findSlotCard(header);
            if (!slotCard || slotCard.querySelector('.silmaril-oc-loan-btn')) return;
            const itemId = slotCache[getSlotKey(slotCard)];
            if (!itemId) return;
            injectButton(moduleChild(slotCard, 'slotBody') ?? slotCard, itemId);
        });
    }

    function injectButton(container, itemId) {
        const wrap = document.createElement('span');
        wrap.className = 'silmaril-oc-loan-wrap';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'torn-btn silmaril-oc-loan-btn';
        button.textContent = 'Loan';

        const entry = getStoredItems()[itemId];
        button.title = entry
            ? `Loan "${entry.name}" x1 to yourself from the faction armoury (${entry.armoryIds?.length ?? 0} available)`
            : 'Loan this item to yourself from the faction armoury';

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            loanItem(itemId, button, wrap);
        });

        wrap.appendChild(button);
        container.appendChild(wrap);
    }

    function showMessage(wrap, message, success) {
        let msg = wrap.querySelector('.silmaril-oc-loan-msg');
        if (!msg) {
            msg = document.createElement('span');
            msg.className = 'silmaril-oc-loan-msg';
            wrap.appendChild(msg);
        }
        msg.textContent = message;
        msg.classList.toggle('success', success);
        msg.classList.toggle('failure', !success);
        clearTimeout(msg.silmarilHideTimer);
        msg.silmarilHideTimer = setTimeout(() => msg.remove(), 10000);
    }

    function stripHtml(html) {
        let text;
        try {
            text = new DOMParser().parseFromString(String(html), 'text/html').body?.textContent;
        } catch (e) { /* fall through to the regex strip */ }
        text ??= String(html).replace(/<[^>]*>/g, ' ');
        return text.replace(/\s+/g, ' ').trim().slice(0, 180);
    }

    function parseLoanResponse(response, text) {
        if (!response.ok) {
            return { success: false, message: `Request failed: HTTP ${response.status}` };
        }
        try {
            const json = JSON.parse(text);
            const message = stripHtml(String(json.message ?? json.text ?? json.error ?? ''));
            const success = json.success !== false && json.error == null;
            return { success, message };
        } catch (e) {
            const message = stripHtml(text);
            const lower = message.toLowerCase();
            const failed = lower.includes('error') || lower.includes('you cannot') || lower.includes("you can't");
            return { success: !failed, message };
        }
    }

    async function loanItem(itemId, button, wrap) {
        if (button.classList.contains('silmaril-busy')) return;

        const store = getStoredItems();
        const entry = store[itemId];
        if (!entry) {
            showMessage(wrap, 'No armoury data for this item yet. Open Faction → Armoury and view it once to cache it.', false);
            return;
        }
        if (!entry.armoryIds?.length) {
            showMessage(wrap, `No available "${entry.name || 'item'}" in the armoury cache. Revisit the armoury to refresh it.`, false);
            return;
        }
        const user = getUser();
        if (!user) {
            showMessage(wrap, 'Could not detect your player name/ID. Reload the page and try again.', false);
            return;
        }
        const rfcv = getRfcv();
        if (!rfcv) {
            showMessage(wrap, 'Could not detect the rfcv token yet. Browse around Torn and try again.', false);
            return;
        }

        const armoryId = entry.armoryIds[0];
        const body = new URLSearchParams({
            ajax: 'true',
            step: 'armouryActionItem',
            role: 'loan',
            item: armoryId,
            itemID: itemId,
            type: entry.type ?? '',
            user: `${user.name} [${user.id}]`,
            quantity: '1'
        });

        button.classList.add('silmaril-busy');
        const originalText = button.textContent;
        button.textContent = '…';
        console.log(`${LOG_PREFIX} Loaning item ${itemId} (armoury id ${armoryId}) to ${user.name} [${user.id}]`);

        try {
            const response = await fetch(`/factions.php?rfcv=${encodeURIComponent(rfcv)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: body.toString()
            });
            const text = await response.text();
            const result = parseLoanResponse(response, text);
            if (result.success) {
                // The armoury id is loaned out now, drop it so the next click uses a fresh one.
                const freshStore = getStoredItems();
                const freshEntry = freshStore[itemId];
                if (freshEntry?.armoryIds) {
                    freshEntry.armoryIds = freshEntry.armoryIds.filter((id) => id !== armoryId);
                    saveItems(freshStore);
                }
                button.textContent = 'Loaned ✓';
                button.classList.add('silmaril-success');
                showMessage(wrap, result.message || `Loaned "${entry.name || 'item'}" x1 to ${user.name}.`, true);
            } else {
                button.textContent = originalText;
                showMessage(wrap, result.message || 'Loan request failed.', false);
                console.error(`${LOG_PREFIX} Loan request failed:`, text);
            }
        } catch (error) {
            button.textContent = originalText;
            showMessage(wrap, `Request error: ${error.message}`, false);
            console.error(`${LOG_PREFIX} Loan request error:`, error);
        } finally {
            button.classList.remove('silmaril-busy');
        }
    }

    // --- wiring ----------------------------------------------------------------

    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.head.appendChild(style);
    }

    function debounce(fn, delay) {
        let timer = null;
        return function () {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                fn();
            }, delay);
        };
    }

    function runScan() {
        scanArmoury();
        scanCrimes();
    }

    const scheduleScan = debounce(runScan, 150);

    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
    // Torn mutates the DOM near-constantly (countdowns, chat, sidebar timers),
    // which can starve the debounced observer callback forever — so the
    // interval calls the scan directly to guarantee it keeps running.
    setInterval(runScan, 1000);
    runScan();
})();
