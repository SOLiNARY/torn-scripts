// ==UserScript==
// @name         Torn Crimes Rewards Value
// @namespace    https://github.com/SOLiNARY
// @version      0.6
// @description  Shows the market value of all crime rewards. After an update, a "What's new" popup lists what changed.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/loader.php?sid=crimes*
// @match        https://www.torn.com/page.php?sid=crimes*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==
 
(async function() {
    'use strict';

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "0.6";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Crimes Rewards Value";
    const WHATS_NEW_KEY = "silmaril-rewards-value-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap.
    const CHANGELOG = [
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

 
    let db;
    let apiKey = localStorage.getItem('silmaril-crimes-rewards-value-apikey');
    let lastUpdatedDate = localStorage.getItem('silmaril-crimes-rewards-value-last-updated-date');
    const marketValuesUrl = 'https://api.torn.com/torn/?selections=items&key={apiKey}';
    const isTampermonkeyEnabled = typeof unsafeWindow !== 'undefined';
    const numberPattern = /\/(\d+)\//;
    const rarityScores = { "Uncommon": 850, "Rare": 8_500, "Epic": 85_000, "Legendary": 850_000 };
 
    const styles = `
div.silmaril-crimes-rewards-value {
    text-align: center;
    font-size: xx-small;
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
  border: 2px solid #2ecc71 !important;
  box-shadow: 0 0 10px #2ecc71 !important;
}
 
/* RARE - Blue */
.rarity-rare {
  border: 2px solid #3498db !important;
  box-shadow: 0 0 12px #3498db !important;
}
 
/* EPIC - Purple */
.rarity-epic {
  border: 2px solid #9b59b6 !important;
  box-shadow: 0 0 14px #9b59b6 !important;
}
 
/* LEGENDARY - Orange with Shine */
.rarity-legendary {
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
 
    if (isTampermonkeyEnabled){
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
 
    try {
        GM_registerMenuCommand('Set Api Key', function() { checkApiKey(false); });
    } catch (error) {
        console.log('[TornCrimesRewardsValue] Tampermonkey not detected!');
    }
 
    openDatabase();
 
    if (lastUpdatedDate !== getToday()) {
        checkApiKey();
        const requestUrl = marketValuesUrl.replace("{apiKey}", apiKey);
        fetch(requestUrl)
            .then(response => response.json())
            .then(data => {
            if (data.error != null && data.error.code === 2){
                apiKey = null;
                localStorage.setItem("silmaril-crimes-rewards-value-apikey", null);
                console.error("[TornCrimesRewardsValue] Incorrect Api Key:", data);
                return;
            }
            putData(data.items);
            localStorage.setItem("silmaril-crimes-rewards-value-last-updated-date", getToday());
            lastUpdatedDate = getToday();
        })
            .catch(error => {
            console.error("[TornCrimesRewardsValue] Error fetching data:", error);
        });
    }
    else {
        console.log('[TornCrimesRewardsValue] Database is up to date!');
    }
 
    const targetNode = document.querySelector("div.crimes-app");
    const observerConfig = { childList: true, subtree: true };
    const observer = new MutationObserver(async (mutationsList, observer) => {
        for (const mutation of mutationsList) {
            let mutationTarget = mutation.target;
            if (mutation.type === 'childList' && mutationTarget.className.includes('arrowButton___')) {
                $("div[class*=currentCrime___]").on("click", "div[class*=topSection___] div[class*=crimeBanner___] div[class*=crimeSliderArrowButtons___] button[class*=arrowButton___]", function(){
                    observer.disconnect();
                    setTimeout(function(){
                        observer.observe(targetNode, observerConfig);
                    }, 800);
                });
            }
            if (mutationTarget.className.includes('outcomePanel___') || mutationTarget.className.includes('outcomeWrapper___')) {
                let outcomeDivs = mutationTarget.querySelectorAll('div[class*=outcome___]');
                let outcomeDiv = outcomeDivs[outcomeDivs.length - 1];
                if (outcomeDiv == null || outcomeDiv.hasAttribute('data-value-set')) {
                    continue;
                }
                outcomeDiv.setAttribute('data-value-set', '');
                let rewards = outcomeDiv.querySelectorAll('div[class*=itemCell___]');
                let totalValue = 0;
                if (rewards.length > 0) {
                    const itemIds = [];
                    rewards.forEach(reward => {
                        const imageDiv = reward.querySelector('img[class*=image___]');
                        if (imageDiv == null) {
                            reward.setAttribute('data-unknown-item', '');
                            return;
                        }
                        const itemId = getItemIdFromImage(imageDiv);
                        itemIds.push(itemId);
                    });
 
                    const itemsInfo = await getData(itemIds);
 
                    rewards.forEach(async (reward, index) => {
                        if (reward.hasAttribute('data-unknown-item')) {
                            return;
                        }
                        const itemQuantity = parseInt(reward.querySelector('span[class*=count___]')?.textContent) ?? 1;
                        const itemMarketValue = itemsInfo[index]?.marketValue;
                        if (itemMarketValue == null) {
                            return;
                        }
                        const itemMarketValueBlock = document.createElement("div");
                        itemMarketValueBlock.className = "silmaril-crimes-rewards-value";
                        let totalItemPrice;
                        if (itemQuantity > 1 && itemMarketValue >= 0) {
                            totalItemPrice = itemQuantity * itemMarketValue;
                            totalValue += totalItemPrice;
                            itemMarketValueBlock.textContent = `$${totalItemPrice.toLocaleString()} ($${itemMarketValue.toLocaleString()})`;
                        } else {
                            totalItemPrice = itemMarketValue;
                            totalValue += totalItemPrice;
                            itemMarketValueBlock.textContent = itemMarketValue >= 0 ? `$${itemMarketValue.toLocaleString()}` : '???';
                        }
                        let rarityClassName = `rarity-${getRarity(totalItemPrice)}`;
 
                        reward.classList.add(rarityClassName);
                        reward.appendChild(itemMarketValueBlock);
                    });
                    addToTotal(totalValue);
                } else {
                    let moneyGainedSpan = outcomeDiv.querySelector('[class*=reward___]');
                    if (moneyGainedSpan != null && moneyGainedSpan.textContent.indexOf('$') == 0 && moneyGainedSpan.parentNode.parentNode.querySelector('p[class*=title___]').textContent == 'SUCCESS') {
                        let moneyGained = Number(moneyGainedSpan.textContent.replace('$', ' ').replaceAll(',', ''));
                        totalValue += moneyGained;
                        addToTotal(totalValue);
                    }
                }
                break;
            }
        }
    });
    observer.observe(targetNode, observerConfig);
 
    function checkApiKey(checkExisting = true) {
        if (!checkExisting || apiKey === null || apiKey.length != 16){
            let userInput = prompt("Please enter a PUBLIC Api Key, it will be used to get today's item market values:", apiKey ?? '');
            if (userInput !== null && userInput.length == 16) {
                apiKey = userInput;
                localStorage.setItem("silmaril-crimes-rewards-value-apikey", userInput);
            } else {
                console.error("[TornCrimesRewardsValue] User cancelled the Api Key input.");
            }
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
        const request = indexedDB.open('silmarilCrimesRewardsValue', 1);
        request.onsuccess = function (event) {
            db = event.target.result;
            console.log("[TornCrimesRewardsValue] Database opened successfully", db);
        };
        request.onerror = function (event) {
            console.error("[TornCrimesRewardsValue] Error opening database:", event.target.error);
        };
        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            const objectStore = db.createObjectStore("itemMarketValuesStore", { keyPath: "itemId" });
 
            objectStore.createIndex("itemId", "itemId", { unique: true });
        };
    }
 
    async function putData(data) {
        while (db == null) {
            await sleep(25);
        }
 
        const writeTransaction = db.transaction("itemMarketValuesStore", "readwrite");
        const writeObjectStore = writeTransaction.objectStore("itemMarketValuesStore");
 
        for (const itemId in data) {
            if (data.hasOwnProperty(itemId)) {
                const item = data[itemId];
                const itemProxy = new ItemProxy(itemId, item.market_value, item.circulation);
                const request = await writeObjectStore.put(itemProxy);
 
                request.onerror = function (event) {
                    console.error("[TornCrimesRewardsValue] Error adding/updating data:", event.target.error);
                };
            }
        }
 
    }
 
    async function getData(itemIds) {
        while (db == null) {
            await sleep(25);
        }
 
        const transaction = db.transaction("itemMarketValuesStore", "readonly");
        const objectStore = transaction.objectStore("itemMarketValuesStore");
 
        const results = [];
 
        const promises = itemIds.map((itemId) => {
            return new Promise((resolve, reject) => {
                const request = objectStore.get(itemId);
                request.onsuccess = function (e) {
                    results.push(e.target.result);
                    resolve();
                };
                request.onerror = function (e) {
                    reject(e.target.error);
                };
            });
        });
 
        await Promise.all(promises);
 
        transaction.oncomplete = function () {
            console.log("[TornCrimesRewardsValue] All get queries completed.");
        };
 
        transaction.onerror = function (event) {
            console.error("[TornCrimesRewardsValue] Error during transaction:", event.target.error);
        };
 
        return results;
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
 
    function getItemIdFromImage(image){
        let match = image.src.match(numberPattern);
        if (match) {
            return match[1];
        } else {
            console.error("[TornCrimesRewardsValue] ItemId not found!");
        }
    }
 
    function addToTotal(sumToAdd){
        let counter = getTotalCounter();
        let prevTotal = Number(sessionStorage.getItem('silmaril-crimes-rewards-value-total') ?? 0);
        let newTotal = prevTotal + sumToAdd;
        sessionStorage.setItem('silmaril-crimes-rewards-value-total', newTotal);
        counter.textContent = `$${newTotal.toLocaleString()}`;
    }
 
    function getTotalCounter(){
        let totalElement = document.getElementById('silmaril-crimes-rewards-value-total');
        if (totalElement != null){
            return totalElement;
        }
        let elementToClone = document.querySelector('.crimes-app .crime-root [class*=resultCount___][class*=successes___] span[class*=count___]');
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
 
    class ItemProxy {
        constructor(itemId, marketValue, circulation) {
            this.itemId = itemId;
            this.marketValue = marketValue;
            this.circulation = circulation;
        }
    }
})();
