// ==UserScript==
// @name         Torn Armoury Loan Button
// @namespace    https://github.com/SOLiNARY
// @version      0.1.0
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
        const source = img.getAttribute('src') ?? img.getAttribute('srcset') ?? '';
        return source.match(/\/images\/items\/(\d+)\//)?.[1] ?? null;
    }

    // Climbs from the item image to the smallest ancestor containing the
    // "Used item: ..." text; OC class names are hashed, so text is the only
    // stable marker.
    function findUsedItemBlock(img) {
        let el = img.parentElement;
        for (let depth = 0; el && depth < 6; depth++) {
            if (el.textContent.toLowerCase().includes(USED_ITEM_MARKER)) return el;
            el = el.parentElement;
        }
        return null;
    }

    function scanCrimes() {
        const root = document.getElementById('faction-crimes-root') ?? document.getElementById('faction-crimes');
        if (!root) return;
        const imgs = root.querySelectorAll('img[src*="/images/items/"], img[srcset*="/images/items/"]');
        for (const img of imgs) {
            const itemId = extractItemId(img);
            if (!itemId) continue;
            const block = findUsedItemBlock(img);
            if (!block || block.querySelector('.silmaril-oc-loan-btn')) continue;
            injectButton(block, itemId);
        }
    }

    function injectButton(block, itemId) {
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
        block.appendChild(wrap);
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

    const scan = debounce(() => {
        scanArmoury();
        scanCrimes();
    }, 300);

    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    setInterval(scan, 2000);
    scan();
})();
