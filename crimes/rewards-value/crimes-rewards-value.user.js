// ==UserScript==
// @name         Torn Crimes Rewards Value
// @namespace    https://github.com/SOLiNARY
// @version      0.6.7
// @description  Shows the market value of all crime rewards. After an update, a "What's new" popup lists what changed.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/loader.php?sid=crimes*
// @match        https://www.torn.com/page.php?sid=crimes*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==
 
(async function() {
    'use strict';

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "0.6.7";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Crimes Rewards Value";
    const WHATS_NEW_KEY = "silmaril-rewards-value-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap. A release marked
    // `silent: true` is left out of that and never opens the popup by itself; it is listed
    // only when the popup is opened from the menu. Leaving the flag off means false.
    const CHANGELOG = [
        {
            version: "0.6.7",
            date: "2026-11-27",
            silent: true,
            changes: [
                "Rewards earned while item prices load now count toward your total.",
                "Reward values keep working when the crimes page opens slowly or changes.",
                "Compatible userscript managers now save your API key privately."
            ]
        },
        {
            version: "0.6.5",
            date: "2026-10-20",
            silent: true,
            changes: [
            'Minor updates now arrive quietly: they are listed here, but no longer open this popup on their own.'
            ]
        },
        {
            version: "0.6",
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
        // Silent releases wait for the menu: they never open the popup, and stay out of it when
        // another release does.
        unseen = unseen.filter(function(release){ return !release.silent; });
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

 
    const keyName = 'silmaril-crimes-rewards-value-apikey';
    const priceDateKey = 'silmaril-crimes-rewards-value-last-updated-date';
    const storeName = 'itemMarketValuesStore';
    // GMforPDA's GM value methods write to Torn's page storage.
    const isPda = typeof PDA_httpGet === 'function' ||
        (typeof GM_info !== 'undefined' && /GMforPDA/i.test(GM_info?.scriptHandler));
    const privateStorage = !isPda && typeof GM_getValue === 'function' &&
        typeof GM_setValue === 'function' && typeof GM_deleteValue === 'function';
    let apiKey = loadApiKey();
    const numberPattern = /\/(\d+)\//;
    const rarityScores = { "Uncommon": 850, "Rare": 8_500, "Epic": 85_000, "Legendary": 850_000 };

    const styles = `
/* Torn's reward row has no room under the tile, so the value is a pill hung on the cell's
   bottom edge. Absolute, so it neither grows the cell nor joins Torn's stacked layout. */
[class*=itemCell___].silmaril-crimes-rewards-cell {
  padding: 0;
}
 
div.silmaril-crimes-rewards-value {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translate(-50%, 50%);
  z-index: 1;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--silmaril-rarity-color, #95a5a6);
  color: #111;
  font-size: 10px;
  font-weight: bold;
  line-height: 12px;
  white-space: nowrap;
}
 
span#silmaril-crimes-rewards-value-total {
    color: var(--crimes-outcome-failure-largeColoredText-color);
}
 
[class*=itemCell___] {
  position: relative;
  border-radius: 8px;
  padding: 6px;
  transition: all 0.3s ease;
}
 
/* UNCOMMON - Green */
.rarity-uncommon {
  --silmaril-rarity-color: #2ecc71;
  border: 2px solid #2ecc71 !important;
  box-shadow: 0 0 10px #2ecc71 !important;
}
 
/* RARE - Blue */
.rarity-rare {
  --silmaril-rarity-color: #3498db;
  border: 2px solid #3498db !important;
  box-shadow: 0 0 12px #3498db !important;
}
 
/* EPIC - Purple */
.rarity-epic {
  --silmaril-rarity-color: #9b59b6;
  border: 2px solid #9b59b6 !important;
  box-shadow: 0 0 14px #9b59b6 !important;
}
 
/* LEGENDARY - Orange with Shine */
.rarity-legendary {
  --silmaril-rarity-color: #f39c12;
  border: 2px solid #f39c12 !important;
  box-shadow: 0 0 18px #f39c12, 0 0 30px rgba(243, 156, 18, 0.6) !important;
}
 
/* Shining rays animation */
.rarity-legendary::before {
  content: "";
  position: absolute;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,200,0,0.4) 0%, transparent 60%);
  animation: legendaryShine 3s linear infinite;
  pointer-events: none;
}
 
@keyframes legendaryShine {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
`;
 
    if (typeof GM_addStyle === 'function'){
        GM_addStyle(styles);
    } else {
        let style = document.createElement("style");
        style.type = "text/css";
        style.innerHTML = styles;
        while (document.head == null){
            await sleep(50);
        }
        document.head.appendChild(style);
    }
 
    const database = openDatabase().catch(error => {
        console.error('[TornCrimesRewardsValue] Unable to open price cache', error);
        return null;
    });
    let fetchedPrices = null;
    let priceSync = refreshPrices();
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Set API key', () => {
            const previous = apiKey;
            promptForKey();
            if (apiKey && apiKey !== previous) {
                priceSync = refreshPrices(false);
                activeRoot?.querySelectorAll(outcomeSelector).forEach(queueOutcome);
            }
        });
        GM_registerMenuCommand('Clear saved API key', () => saveApiKey(null));
    }

    const outcomeSelector = 'div[class*="outcome___"]';
    const working = new WeakSet();
    const changedWhileWorking = new WeakSet();
    const creditedItems = new WeakMap();
    const seen = new WeakSet();
    let switchingUntil = 0;
    document.addEventListener('click', event => {
        if (event.target.closest?.('.crimes-app [class*=crimeSliderArrowButtons___] button[class*=arrowButton___]')) {
            switchingUntil = Date.now() + 800;
        } else if (event.target.closest?.('.crimes-app .commit-button')) {
            switchingUntil = 0;
        }
    }, true);
    // Catch outcomes inside newly mounted or replaced roots and those assembled over several renders.
    let activeRoot = null;
    const observer = new MutationObserver(mutations => {
        const changed = new Set();
        for (const {target, addedNodes} of mutations) {
            const element = target.nodeType === 1 ? target : target.parentElement;
            const outcome = element?.closest(outcomeSelector);
            if (outcome) changed.add(outcome);
            for (const node of addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches(outcomeSelector)) changed.add(node);
                else if (!outcome) node.querySelectorAll(outcomeSelector).forEach(item => changed.add(item));
            }
        }
        changed.forEach(queueOutcome);
    });
    function queueOutcome(outcome) {
        if (Date.now() < switchingUntil) seen.add(outcome);
        else processOutcome(outcome).catch(error => console.error('[TornCrimesRewardsValue] Unable to value reward', error));
    }
    function attachRoot() {
        if (activeRoot?.isConnected) return;
        const root = document.querySelector('.crimes-app');
        if (root === activeRoot) return;
        observer.disconnect();
        activeRoot = root;
        if (root) {
            observer.observe(root, {childList: true, subtree: true, characterData: true});
            root.querySelectorAll(outcomeSelector).forEach(queueOutcome);
        }
    }
    new MutationObserver(attachRoot).observe(document.documentElement, {childList: true, subtree: true});
    attachRoot();

    async function processOutcome(outcome) {
        if (seen.has(outcome)) return;
        if (working.has(outcome)) {
            changedWhileWorking.add(outcome);
            return;
        }
        working.add(outcome);
        try {
            const cells = [...outcome.querySelectorAll('div[class*=itemCell___]')];
            let totalValue = 0;
            if (cells.length) {
                const items = cells.map(cell => {
                    const image = cell.querySelector('img[class*=image___]');
                    const id = image?.src.match(numberPattern)?.[1];
                    const count = cell.querySelector('span[class*=count___]')?.textContent.match(/\d[\d,]*/);
                    const quantity = count ? Number(count[0].replaceAll(',', '')) : 1;
                    return {cell, id, quantity};
                });
                await priceSync;
                const prices = await getPrices(items.map(item => item.id).filter(Boolean));
                if (seen.has(outcome)) return;
                const credited = creditedItems.get(outcome) ?? new Map();
                creditedItems.set(outcome, credited);
                const occurrences = new Map();
                for (const {cell, id, quantity} of items) {
                    const price = prices.get(id);
                    if (price == null) continue;
                    const ordinal = occurrences.get(id) ?? 0;
                    occurrences.set(id, ordinal + 1);
                    const key = id + '/' + ordinal;
                    const value = price >= 0 ? price * quantity : 0;
                    let pill = cell.querySelector('.silmaril-crimes-rewards-value');
                    if (!pill) {
                        pill = document.createElement('div');
                        pill.className = 'silmaril-crimes-rewards-value';
                        cell.appendChild(pill);
                    }
                    const label = price >= 0 ? '$' + value.toLocaleString() : '???';
                    if (pill.textContent !== label) pill.textContent = label;
                    pill.title = price >= 0 && quantity > 1 ? quantity + ' x $' + price.toLocaleString() : '';
                    cell.classList.add('rarity-' + getRarity(value), 'silmaril-crimes-rewards-cell');
                    totalValue += value - (credited.get(key) ?? 0);
                    credited.set(key, value);
                }
                if (!totalValue) return;
            } else {
                const money = outcome.querySelector('[class*=reward___]')?.textContent.trim();
                if (!money || !/^\$[\d,]+$/.test(money) || outcome.querySelector('p[class*=title___]')?.textContent !== 'SUCCESS') return;
                totalValue = Number(money.slice(1).replaceAll(',', ''));
                seen.add(outcome);
            }
            addToTotal(totalValue);
        } finally {
            working.delete(outcome);
            if (changedWhileWorking.delete(outcome)) queueOutcome(outcome);
        }
    }

    function loadApiKey() {
        let legacy;
        try {
            const raw = localStorage.getItem(keyName);
            const value = raw?.startsWith('GMV2_') ? JSON.parse(raw.slice(5)) : raw;
            if (typeof value === 'string' && value.length === 16) legacy = value;
        } catch {}
        let key = legacy;
        if (privateStorage) {
            try {
                const saved = GM_getValue(keyName, null);
                if (saved) key = saved;
                else if (legacy) GM_setValue(keyName, legacy);
            } catch {
                // The key can still be used in memory for this page.
            }
        }
        try { localStorage.removeItem(keyName); } catch {}
        return typeof key === 'string' && key.length === 16 ? key : null;
    }

    function saveApiKey(key) {
        apiKey = key;
        try { localStorage.removeItem(keyName); } catch {}
        if (privateStorage) {
            try {
                if (key) GM_setValue(keyName, key);
                else GM_deleteValue(keyName);
            } catch {
                console.warn('[TornCrimesRewardsValue] Could not update private key storage.');
            }
        }
    }

    function promptForKey() {
        const value = prompt('Enter a public Torn API key to load item prices.' +
            (privateStorage ? '' : ' This key is kept only until the page closes.') +
            (apiKey ? ' Leave blank to keep the current key or type CLEAR to remove it.' : ''), '')?.trim();
        if (value === 'CLEAR') saveApiKey(null);
        else if (value?.length === 16) saveApiKey(value);
    }

    async function refreshPrices(ask = true) {
        const db = await database;
        try {
            if (db && localStorage.getItem(priceDateKey) === getToday()) return;
        } catch {}
        if (ask && !apiKey) promptForKey();
        const requestedKey = apiKey;
        if (!requestedKey) return;
        try {
            const url = new URL('https://api.torn.com/torn/');
            url.searchParams.set('selections', 'items');
            url.searchParams.set('key', requestedKey);
            const response = await fetch(url);
            const data = await response.json();
            if (data.error) {
                if (data.error.code === 2 && apiKey === requestedKey) saveApiKey(null);
                throw new Error('Torn API error ' + data.error.code);
            }
            if (!response.ok || !data.items || typeof data.items !== 'object' || !Object.keys(data.items).length) {
                throw new Error('Missing item prices');
            }
            fetchedPrices = new Map(Object.entries(data.items).map(([id, item]) => [id, item.market_value]));
            if (db) {
                await putPrices(db, data.items);
                localStorage.setItem(priceDateKey, getToday());
            }
        } catch (error) {
            console.error('[TornCrimesRewardsValue] Unable to refresh prices', error);
        }
    }

    function getToday() {
        const today = new Date();
        const formattedDate = String(today.getDate()).padStart(2, '0') + '/' +
              String(today.getMonth() + 1).padStart(2, '0') + '/' +
              String(today.getFullYear()).slice(-2);
        return formattedDate;
    }
 
    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('silmarilCrimesRewardsValue', 1);
            let blocked = false;
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore(storeName, {keyPath: 'itemId'});
                store.createIndex('itemId', 'itemId', {unique: true});
                try { localStorage.removeItem(priceDateKey); } catch {}
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => db.close();
                if (blocked) db.close();
                else resolve(db);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
                blocked = true;
                reject(new Error('Price cache is blocked'));
            };
        });
    }

    function putPrices(db, items) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error || new Error('Price update aborted'));
            const store = transaction.objectStore(storeName);
            try {
                for (const [itemId, item] of Object.entries(items)) {
                    store.put({itemId, marketValue: item.market_value, circulation: item.circulation});
                }
            } catch (error) {
                transaction.abort();
                reject(error);
            }
        });
    }

    async function getPrices(ids) {
        if (fetchedPrices) return fetchedPrices;
        const db = await database;
        if (!db || !ids.length) return new Map();
        return new Promise((resolve, reject) => {
            const prices = new Map();
            const transaction = db.transaction(storeName, 'readonly');
            transaction.oncomplete = () => resolve(prices);
            transaction.onabort = () => reject(transaction.error || new Error('Price lookup aborted'));
            const store = transaction.objectStore(storeName);
            for (const id of new Set(ids)) {
                const request = store.get(id);
                request.onsuccess = () => {
                    if (request.result) prices.set(id, request.result.marketValue);
                };
            }
        });
    }

    function getRarity(totalPrice){
        let rarity;
        if (totalPrice < rarityScores.Uncommon) {
            rarity = 'common';
        } else if (totalPrice < rarityScores.Rare) {
            rarity = 'uncommon';
        } else if (totalPrice < rarityScores.Epic) {
            rarity = 'rare';
        } else if (totalPrice < rarityScores.Legendary) {
            rarity = 'epic';
        } else {
            rarity = 'legendary';
        }
        return rarity;
    }
 
    function addToTotal(sumToAdd){
        let prevTotal = Number(sessionStorage.getItem('silmaril-crimes-rewards-value-total') ?? 0);
        let newTotal = prevTotal + sumToAdd;
        sessionStorage.setItem('silmaril-crimes-rewards-value-total', newTotal);
        const counter = getTotalCounter();
        if (counter) counter.textContent = `$${newTotal.toLocaleString()}`;
    }
 
    function getTotalCounter(){
        let totalElement = document.getElementById('silmaril-crimes-rewards-value-total');
        if (totalElement != null){
            return totalElement;
        }
        let elementToClone = document.querySelector('.crimes-app .crime-root [class*=resultCount___][class*=successes___] span[class*=count___]');
        if (!elementToClone) return null;
        totalElement = elementToClone.cloneNode(true);
        totalElement.id = 'silmaril-crimes-rewards-value-total';
        let rawSessionTotal = sessionStorage.getItem('silmaril-crimes-rewards-value-total') ?? 0;
        if (isNaN(rawSessionTotal) || rawSessionTotal == 0){
            sessionStorage.setItem('silmaril-crimes-rewards-value-total', 0);
            rawSessionTotal = 0;
        }
        let sessionTotal = Number(rawSessionTotal);
        totalElement.textContent = `$${sessionTotal.toLocaleString()}`;
        elementToClone.parentNode.parentNode.insertBefore(totalElement, elementToClone.parentNode);
        return totalElement;
    }
 
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
 
})();
