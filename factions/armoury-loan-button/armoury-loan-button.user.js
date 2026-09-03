// ==UserScript==
// @name         Torn Armoury Loan Button
// @namespace    https://github.com/SOLiNARY
// @version      0.4.1
// @description  Caches loanable faction armoury items and adds a "Loan" button on your own organized crime role when it requires an item, loaning it to you in one click. After an update, a "What's new" popup lists what changed.
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

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "0.4.1";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Armoury Loan Button";
    const WHATS_NEW_KEY = "silmaril-armoury-loan-button-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap.
    const CHANGELOG = [
        {
            version: "0.4.1",
            date: "2026-09-03",
            changes: [
            'New: this popup. After an update it lists what changed, then stays quiet until the next one.'
            ]
        }
    ];

    const WHATS_NEW_HOST_ID = "silmaril-whatsnew";
    const WHATS_NEW_STYLE_ID = "silmaril-whatsnew-style";
    // Long enough for scripts that start together to land in one panel, short enough to feel
    // like part of the page load.
    const WHATS_NEW_OPEN_DELAY_MS = 150;

    try {
        GM_registerMenuCommand("What's new", function(){ showWhatsNew(CHANGELOG); });
    } catch (error) {
        // No menu host (an ungranted script, or Torn PDA). The popup still appears on update.
    }

    maybeShowWhatsNew();

    function compareVersions(left, right){
        // Non-numeric tails such as the ".pda" suffix compare as 0, which keeps 0.3.5.pda and
        // 0.3.6.pda in the right order.
        let leftParts = String(left).split('.').map(function(part){ return parseInt(part, 10) || 0; });
        let rightParts = String(right).split('.').map(function(part){ return parseInt(part, 10) || 0; });
        for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++){
            let difference = (leftParts[i] ?? 0) - (rightParts[i] ?? 0);
            if (difference !== 0){
                return difference < 0 ? -1 : 1;
            }
        }
        return 0;
    }

    function maybeShowWhatsNew(){
        let lastSeen;
        try {
            lastSeen = localStorage.getItem(WHATS_NEW_KEY);
        } catch (error) {
            return;
        }
        if (lastSeen === SCRIPT_VERSION){
            return;
        }
        // No stored version means one of two things: a brand-new install, or — far more often,
        // because this is the first release of every script to carry the popup — a long-standing
        // user whose key simply never existed. The two are indistinguishable from here, so the
        // notes get shown rather than swallowed. Staying silent would hide this release from
        // everyone who already had the script.
        let unseen = lastSeen == null
            ? CHANGELOG
            : CHANGELOG.filter(function(release){ return compareVersions(release.version, lastSeen) > 0; });
        if (unseen.length === 0){
            rememberWhatsNewSeen();
            return;
        }
        showWhatsNew(unseen);
    }

    function rememberWhatsNewSeen(){
        try {
            localStorage.setItem(WHATS_NEW_KEY, SCRIPT_VERSION);
        } catch (error) {
            // A blocked localStorage only means the popup returns on the next page load.
        }
    }

    // Scripts that run at document-start have no body to attach to yet.
    function whenBodyReady(run){
        if (document.body != null){
            run();
            return;
        }
        document.addEventListener('DOMContentLoaded', run, { once: true });
    }

    // Injected directly rather than through GM_addStyle, so the popup carries no grant
    // requirements of its own. Selectors are id-scoped to outrank Torn's own styles.
    function ensureWhatsNewStyle(){
        if (document.getElementById(WHATS_NEW_STYLE_ID) != null){
            return;
        }
        const style = document.createElement('style');
        style.id = WHATS_NEW_STYLE_ID;
        style.textContent =
            '#silmaril-whatsnew{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483000;' +
                'justify-content:center;align-items:flex-start;overflow:auto;padding:24px 12px;box-sizing:border-box;' +
                'font-family:Arial,Helvetica,sans-serif}' +
            '#silmaril-whatsnew.swn-open{display:flex}' +
            '#silmaril-whatsnew .swn-panel{background:#1f1f1f;color:#e6e6e6;width:100%;max-width:420px;' +
                'border:1px solid #666;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);padding:16px 18px;' +
                'box-sizing:border-box;font-size:13px;line-height:1.5;text-align:left}' +
            '#silmaril-whatsnew .swn-title{margin:0 0 14px;font-size:15px;font-weight:bold;color:#fff;display:flex;' +
                'justify-content:space-between;align-items:center}' +
            '#silmaril-whatsnew .swn-close{cursor:pointer;color:#bbb;font-size:22px;line-height:1;padding:0 2px}' +
            '#silmaril-whatsnew .swn-close:hover{color:#fff}' +
            '#silmaril-whatsnew .swn-script{margin:0 0 16px}' +
            '#silmaril-whatsnew .swn-script:last-of-type{margin-bottom:0}' +
            '#silmaril-whatsnew .swn-name{margin:0 0 7px;padding-bottom:5px;font-size:13px;font-weight:bold;color:#fff;' +
                'border-bottom:1px solid #3a3a3a}' +
            '#silmaril-whatsnew .swn-release{margin:0 0 9px}' +
            '#silmaril-whatsnew .swn-release:last-child{margin-bottom:0}' +
            '#silmaril-whatsnew .swn-relhead{display:flex;align-items:baseline;gap:8px;margin:0 0 4px}' +
            '#silmaril-whatsnew .swn-ver{background:#2e7d32;color:#fff;border-radius:10px;padding:1px 8px;font-size:10px;' +
                'letter-spacing:.04em;font-weight:bold}' +
            '#silmaril-whatsnew .swn-date{color:#8a8a8a;font-size:11px;margin-left:auto}' +
            '#silmaril-whatsnew .swn-items{margin:0;padding-left:18px;color:#cfcfcf;list-style:disc}' +
            '#silmaril-whatsnew .swn-items li{margin:0 0 5px}' +
            '#silmaril-whatsnew code{background:#000;padding:1px 4px;border-radius:3px;color:#cfc;' +
                'font-family:Consolas,Monaco,monospace;font-size:12px}' +
            '#silmaril-whatsnew .swn-foot{margin:14px 0 0;padding-top:10px;border-top:1px solid #3a3a3a;' +
                'font-size:11px;line-height:1.5;color:#8a8a8a}' +
            '#silmaril-whatsnew .swn-actions{display:flex;justify-content:flex-end;margin-top:12px}' +
            '#silmaril-whatsnew .swn-ok{cursor:pointer;padding:7px 18px;border-radius:5px;border:1px solid #2e7d32;' +
                'background:#2e7d32;color:#fff;font-size:13px;font-family:inherit}' +
            '#silmaril-whatsnew .swn-ok:hover{background:#38963d}';
        (document.head ?? document.documentElement).appendChild(style);
    }

    function ensureWhatsNewHost(){
        let host = document.getElementById(WHATS_NEW_HOST_ID);
        if (host != null){
            return host;
        }
        host = document.createElement('div');
        host.id = WHATS_NEW_HOST_ID;
        host.innerHTML =
            '<div class="swn-panel" role="dialog" aria-modal="true" aria-label="What&rsquo;s new">' +
                '<div class="swn-title">What&rsquo;s new<span class="swn-close" title="Close" role="button" tabindex="0">&times;</span></div>' +
                '<div class="swn-sections"></div>' +
                // How the popup itself works belongs to the popup, not repeated in every
                // script's changelog.
                '<p class="swn-foot">One popup covers every Silmaril script on this page. ' +
                    'Where your script manager offers a menu, you can re-open it from there.</p>' +
                '<div class="swn-actions"><button type="button" class="swn-ok">Got it</button></div>' +
            '</div>';
        document.body.appendChild(host);
        // Dismissing by any route counts as read for every script in the panel — the popup must
        // never nag — so the close is broadcast and each contributor records its own version.
        const dismiss = function(){
            host.classList.remove('swn-open');
            host.dispatchEvent(new CustomEvent('silmaril-whatsnew-dismiss'));
        };
        host.querySelector('.swn-close').addEventListener('click', dismiss);
        host.querySelector('.swn-ok').addEventListener('click', dismiss);
        host.addEventListener('click', function(event){ if (event.target === host){ dismiss(); } });
        document.addEventListener('keydown', function(event){
            if (event.key === 'Escape' && host.classList.contains('swn-open')){ dismiss(); }
        });
        return host;
    }

    function renderWhatsNewRelease(release){
        // Entries are literals defined in this file, so their inline markup is intentional.
        return '<div class="swn-release">' +
                   '<div class="swn-relhead"><span class="swn-ver">v' + release.version + '</span>' +
                       '<span class="swn-date">' + release.date + '</span></div>' +
                   '<ul class="swn-items">' +
                       release.changes.map(function(change){ return '<li>' + change + '</li>'; }).join('') +
                   '</ul>' +
               '</div>';
    }

    function showWhatsNew(releases){
        if (releases.length === 0){
            return;
        }
        whenBodyReady(function(){
            ensureWhatsNewStyle();
            const host = ensureWhatsNewHost();
            const sections = host.querySelector('.swn-sections');
            // Re-opening from the menu must not stack a second copy of this script's section.
            let section = sections.querySelector('[data-swn-script="' + WHATS_NEW_KEY + '"]');
            if (section == null){
                section = document.createElement('div');
                section.className = 'swn-script';
                section.setAttribute('data-swn-script', WHATS_NEW_KEY);
                sections.appendChild(section);
                host.addEventListener('silmaril-whatsnew-dismiss', rememberWhatsNewSeen);
            }
            section.innerHTML = '<div class="swn-name">' + WHATS_NEW_NAME + '</div>' +
                                releases.map(renderWhatsNewRelease).join('');
            setTimeout(function(){ host.classList.add('swn-open'); }, WHATS_NEW_OPEN_DELAY_MS);
        });
    }


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

    // Climbs from a descendant up to the smallest ancestor that represents
    // exactly one role slot (role name, skill value, member name, View
    // Profile / Leave Role) - the permanent card that stays visible
    // regardless of hover state, unlike the "Used item" tooltip, which Torn
    // only shows while hovering and can vanish before a click registers.
    // Bails out (returns null) if climbing ever passes a single slot into a
    // multi-slot container (more than one title found) - which happens when
    // starting from a tooltip that renders as a portal disconnected from its
    // slot's own subtree - rather than risk anchoring to the wrong role.
    function findRoleCard(el) {
        let node = el.parentElement;
        for (let depth = 0; node && node !== document.body && depth < 12; depth++) {
            const titles = node.querySelectorAll('[class*="title___"]');
            if (titles.length > 1) return null;
            if (titles.length === 1 && node.querySelector('[class*="successChance___"]')) return node;
            node = node.parentElement;
        }
        return null;
    }

    // Only a role the current user occupies shows a "Leave Role" action -
    // that is the one reliable, always-visible signal for "this is my slot".
    function findOwnRoleSlots() {
        const slots = [];
        const seenCards = new Set();
        document.querySelectorAll('button, a').forEach((el) => {
            if (el.textContent.trim().toLowerCase() !== 'leave role') return;
            const card = findRoleCard(el);
            if (!card || seenCards.has(card)) return;
            seenCards.add(card);
            slots.push({ card, leaveBtn: el });
        });
        return slots;
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

        // Discovery: correlate a currently-visible "Used item" tooltip to a
        // role. Climbing up from the tooltip text is precise and preferred
        // when it resolves (handles multiple tooltips coexisting in the DOM);
        // the header Torn itself marks as open (data-is-tooltip-opened="true")
        // is the fallback for when the tooltip renders as a portal
        // disconnected from its slot's own subtree, since that marker works
        // no matter where the tooltip content actually renders.
        const activeHeader = document.querySelector('[data-is-tooltip-opened="true"]');
        const imgs = document.querySelectorAll('img[src*="images/items/"], img[srcset*="images/items/"]');
        for (const img of imgs) {
            if (img.closest('.img-wrap[data-armoryid], .silmaril-oc-loan-wrap, #chatRoot, [class^="chat-box"]')) continue;
            const textBlock = findUsedItemBlock(img);
            if (!textBlock) continue;
            const itemId = extractItemId(img) ?? findItemIdByName(textBlock.textContent);
            if (!itemId) continue;

            const source = findRoleCard(textBlock) ?? activeHeader;
            if (!source) continue;
            const key = getSlotKey(source);
            if (slotCache[key] !== itemId) {
                slotCache[key] = itemId;
                slotCacheChanged = true;
            }
        }
        if (slotCacheChanged) saveSlotItemCache(slotCache);

        // Injection: only on roles the current user occupies (a "Leave Role"
        // action is present), and only once that role's item is known - from
        // the discovery pass above, or cached from an earlier scan.
        findOwnRoleSlots().forEach(({ card, leaveBtn }) => {
            if (card.querySelector('.silmaril-oc-loan-btn')) return;
            const itemId = slotCache[getSlotKey(card)];
            if (!itemId) return;
            injectButton(leaveBtn.parentElement ?? card, itemId);
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
