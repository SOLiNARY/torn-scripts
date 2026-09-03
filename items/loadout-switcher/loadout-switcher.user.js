// ==UserScript==
// @name         Torn Loadout Switcher
// @namespace    https://github.com/SOLiNARY
// @version      0.6.14
// @description  Adds customisable quick loadout change buttons on Items page. After an update, a "What's new" popup lists what changed.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT
// @match        https://www.torn.com/item.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(async function () {
    'use strict';

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "0.6.14";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Loadout Switcher";
    const WHATS_NEW_KEY = "silmaril-loadout-switcher-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap.
    const CHANGELOG = [
        {
            version: "0.6.14",
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


    // Change to 'false' to see only numbers, 'true' to see titles
    const showTitles = true;

    const includeLogo = false;
    const rfcvArg = "rfcv=";
    const rfcvStorageKey = "silmaril-loadout-switcher-rfcv";
    const isTampermonkeyEnabled = typeof unsafeWindow !== 'undefined';
    const getEquippedItemsUrl = "/page.php?sid=itemsLoadouts&step=getEquippedItems";
    let rfcv = null;
    let loadoutTitles = {};
    try {
        const cachedTitles = localStorage.getItem("silmaril-loadout-switcher-titles");
        if (cachedTitles) loadoutTitles = JSON.parse(cachedTitles);
    } catch (e) {
        loadoutTitles = {};
    }

    function setRfcv(value) {
        if (!value || value === rfcv) return;
        rfcv = value;
        try {
            localStorage.setItem(rfcvStorageKey, value);
        } catch (e) { /* ignore quota errors */
        }
        document.querySelectorAll("div.silmaril-torn-loadout-switcher-container button")
            .forEach((button) => button.classList.remove("disabled"));
    }

    // Torn keeps the live token in the rfc_v cookie, which any same-origin script can read
    // at any moment. This is the source Torn PDA needs: it injects userscripts after the
    // page's load event, and by then Torn's rfcv-bearing AJAX calls have already gone out
    // and the resource timing buffer has usually overflowed on an inventory page, so
    // neither the PerformanceObserver replay below nor the fetch/XHR hooks ever see one.
    // Without the cookie the buttons stay disabled forever there, or fire a stale token.
    function refreshRfcv() {
        const match = document.cookie.match(/(?:^|;\s*)rfc_v=([^;]*)/);
        if (match) setRfcv(decodeURIComponent(match[1]));
        return rfcv;
    }

    // Fallback for the cookie: pick rfcv out of Torn's own traffic. Uses PerformanceObserver
    // rather than monkey-patching fetch so it works in both the page world
    // (Tampermonkey/Violentmonkey) and the userscript-isolated world (iOS Safari Userscripts
    // app), because performance entries are origin-scoped and visible to any same-origin script.
    function captureRfcvFromUrl(url) {
        if (typeof url !== 'string') return;
        const idx = url.indexOf(rfcvArg);
        if (idx < 0) return;
        setRfcv(url.substring(idx + rfcvArg.length).split('&')[0]);
    }

    setRfcv(localStorage.getItem(rfcvStorageKey));
    refreshRfcv();

    try {
        performance.getEntriesByType('resource').forEach((entry) => captureRfcvFromUrl(entry.name));
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) captureRfcvFromUrl(entry.name);
        }).observe({ type: 'resource', buffered: true });
    } catch (e) {
        console.warn("[TornLoadoutSwitcher] PerformanceObserver unavailable:", e);
    }

    let titlesReceivedThisSession = false;

    function urlMatchesLoadoutsEndpoint(url) {
        if (!url) return false;
        const s = typeof url === 'string' ? url : (url.href || url.url || String(url));
        return s.indexOf('sid=itemsLoadouts') >= 0 && s.indexOf('step=getEquippedItems') >= 0;
    }

    function consumeLoadoutResponse(payload) {
        if (!payload || !payload.currentLoadouts) return;
        let changed = false;
        for (const key in payload.currentLoadouts) {
            if (payload.currentLoadouts.hasOwnProperty(key)) {
                const title = payload.currentLoadouts[key].title;
                if (title && loadoutTitles[key] !== title) {
                    loadoutTitles[key] = title;
                    changed = true;
                }
            }
        }
        titlesReceivedThisSession = true;
        if (changed) {
            persistTitles();
            refreshButtonText();
        }
    }

    // Passively observe Torn's periodic equipped-items polls and pull titles out of them,
    // so renames propagate without us issuing a request. Patches unsafeWindow when the
    // script runs in an isolated world (Tampermonkey/Violentmonkey with @grant unsafeWindow);
    // otherwise patches the script's own window, which only reaches page traffic in
    // page-world managers. A 15s fallback (see end of script) handles the case where
    // neither approach catches a response.
    const netTarget = isTampermonkeyEnabled ? unsafeWindow : window;

    try {
        const originalFetch = netTarget.fetch;
        if (typeof originalFetch === 'function') {
            netTarget.fetch = function (...args) {
                const result = originalFetch.apply(this, args);
                try {
                    if (urlMatchesLoadoutsEndpoint(args[0])) {
                        result.then(resp => {
                            resp.clone().json().then(consumeLoadoutResponse).catch(() => {});
                        }).catch(() => {});
                    }
                } catch (e) { /* ignore */ }
                return result;
            };
        }
    } catch (e) {
        console.warn("[TornLoadoutSwitcher] fetch wrap failed:", e);
    }

    try {
        const XHR = netTarget.XMLHttpRequest;
        if (XHR && XHR.prototype) {
            const originalOpen = XHR.prototype.open;
            const originalSend = XHR.prototype.send;
            XHR.prototype.open = function (method, url) {
                this.__silmarilLoadoutUrl = url;
                return originalOpen.apply(this, arguments);
            };
            XHR.prototype.send = function () {
                try {
                    if (urlMatchesLoadoutsEndpoint(this.__silmarilLoadoutUrl)) {
                        this.addEventListener('load', () => {
                            try {
                                consumeLoadoutResponse(JSON.parse(this.responseText));
                            } catch (e) { /* ignore */ }
                        });
                    }
                } catch (e) { /* ignore */ }
                return originalSend.apply(this, arguments);
            };
        }
    } catch (e) {
        console.warn("[TornLoadoutSwitcher] XHR wrap failed:", e);
    }

    const styles = `
@media (min-width: 769px) {
    div#loadoutsRoot p[class*=title___],
    div#loadoutsRoot .silmaril-torn-loadout-switcher-host {
        overflow-y: hidden;
        overflow-x: auto;
    }
}

div.silmaril-torn-loadout-switcher-container {
    display: inline-flex;
    align-items: center;
    margin-left: 5px;
}

div.silmaril-torn-loadout-switcher-container a img {
    display: flex;
    height: 50px;
    flex-direction: row;
    align-content: stretch;
    justify-content: space-around;
    align-items: flex-start;
}

.wave-animation {
  position: relative;
  overflow: hidden;
}

.wave {
  pointer-events: none;
  position: absolute;
  width: 100%;
  height: 33px;
  background-color: transparent;
  opacity: 0;
  transform: translateX(-100%);
  animation: waveAnimation 3s cubic-bezier(0, 0, 0, 1);
}

@media (max-width: 768px) {
    div[class^=main___] > div[class^=content___] {
        margin-top: 10px;
    }

    /* The buttons live inside the title, next to the current loadout's name, and that row
       has no horizontal space left on a phone. Scrolling it - what the desktop rule above
       does - parks them past the right edge, and the row's own height clips them from
       below, which reads as them vanishing a moment after they appear. Let the header and
       the title grow here, and drop the buttons onto a row of their own beneath the name.
       These are scoped under #loadoutsRoot so they outrank Torn's own class selectors,
       whose stylesheet loads from the body and would otherwise win on source order. */
    div#loadoutsRoot header[class*=header___] {
        height: auto;
        max-height: none;
    }

    div#loadoutsRoot p[class*=title___],
    div#loadoutsRoot .silmaril-torn-loadout-switcher-host {
        overflow: visible;
        height: auto;
        max-height: none;
        white-space: normal;
    }

    div#loadoutsRoot div.silmaril-torn-loadout-switcher-container {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-left: 0;
        margin-top: 4px;
    }
}

@keyframes waveAnimation {
  0% {
    opacity: 1;
    transform: translateX(-100%);
  }
  100% {
    opacity: 0;
    transform: translateX(100%);
  }
}
`;

    if (isTampermonkeyEnabled) {
        GM_addStyle(styles);
    } else {
        let style = document.createElement("style");
        style.type = "text/css";
        style.innerHTML = styles;
        while (document.head == null) {
            await sleep(50);
        }
        document.head.appendChild(style);
    }

    const setLoadoutUrl = "/page.php?sid=itemsLoadouts&step=changeLoadout&setID={loadoutId}&rfcv={rfcv}";
    let selectedLoadouts = localStorage.getItem("silmaril-loadout-switcher-selected-loadouts") ?? "1,2,3";
    let selectedLoadoutsArray = selectedLoadouts.split(',');

    const containerClass = 'silmaril-torn-loadout-switcher-container';
    const hostClass = 'silmaril-torn-loadout-switcher-host';

    function isRendered(el) {
        return el.isConnected && el.getClientRects().length > 0;
    }

    // Torn re-renders the loadouts panel and can leave more than one title element behind,
    // some of them hidden. Picking the first match regardless would park the buttons in a
    // node that never paints - they show up for a moment on the first render, then look as
    // if they vanished for good, because the guard below sees a container and stops trying.
    function findTitleElement() {
        const candidates = [...document.querySelectorAll("#loadoutsRoot [class*=title___]")]
            .filter((el) => Array.from(el.classList).some((c) => c.startsWith('title___')));
        return candidates.find(isRendered) ?? candidates[0] ?? null;
    }

    function tryAttach() {
        const titleEl = findTitleElement();
        if (!titleEl) return;

        observeLoadoutsRoot();

        // Discard containers Torn's re-render orphaned or moved elsewhere, so a stale one
        // can never satisfy the guard below while nothing is on screen.
        document.querySelectorAll(`div.${containerClass}`).forEach((existing) => {
            if (existing.parentElement !== titleEl) existing.remove();
        });

        titleEl.classList.add(hostClass);
        if (titleEl.querySelector(`div.${containerClass}`)) return;

        const buttonContainer = document.createElement('div');
        buttonContainer.className = containerClass;

        const waveDiv = document.createElement('div');
        waveDiv.className = 'wave';

        buttonContainer.appendChild(waveDiv);
        addLoadoutAndSettingButtons(buttonContainer);
        addLogo(buttonContainer);

        titleEl.appendChild(buttonContainer);
    }

    let attachScheduled = false;

    function scheduleAttach() {
        if (attachScheduled) return;
        attachScheduled = true;
        requestAnimationFrame(() => {
            attachScheduled = false;
            tryAttach();
        });
    }

    // Watch the panel itself rather than the whole document: Torn mutates the page
    // constantly, and this keeps re-attachment to the frame after a re-render wipes the
    // buttons, instead of leaving them missing for up to a poll interval.
    let observedRoot = null;
    let rootObserver = null;

    function observeLoadoutsRoot() {
        const root = document.getElementById('loadoutsRoot');
        if (!root || root === observedRoot) return;
        if (rootObserver) rootObserver.disconnect();
        observedRoot = root;
        rootObserver = new MutationObserver(scheduleAttach);
        rootObserver.observe(root, { childList: true, subtree: true });
    }

    // The poll stays as the safety net: it finds the panel when it first appears, picks up
    // a replaced #loadoutsRoot, and keeps working when rAF is paused in a background tab.
    setInterval(tryAttach, 500);

    function addLogo(root) {
        if (!includeLogo) {
            return;
        }

        const logoLink = document.createElement('a');
        logoLink.href = '/factions.php?step=profile&ID=6731';
        logoLink.target = '_blank';

        const logoImg = document.createElement('img');
        logoImg.src = 'data:image/octet-stream;base64,UklGRpAFAABXRUJQVlA4WAoAAAAYAAAAfwAAfwAAQUxQSKcAAAABDzD/ERHCbW3tbSIRS4/gUTwaabEMa7ijxCVRj/jpl8ldRP8nwP0nx5AZVNBUcoOt0n/gUxSauzmCS9EzCFK400tCxBEcFGm8toWBRa6N0lQwgyzNSithbdHVNmnG3DbrERDjfO3c2/PPcXd8p5mgNOpqm6i1VlmsINNm2tYo10ZRA+1o4aHQnBaMehFBgl4NjiAVWt/Ma1tlDHkNKmg+KCHTxlF/RQBWUDggrAQAADAcAJ0BKoAAgAAAAAAlAGusoL8Y/ADVCuD/gr+rX9E5wzUrsB+pv8axQL4P+Ff8r4AD9CP55+O3AO/Tb+8/47hAP0A/iHCAfwf+O+jr/u/9F8C36q/2b/K/AT/Jf5R8/+3LeJf6B9AHjP/Sa6n+kU4BhD3961gj+Yfp160fzJ50PnT/He4J/G/5v/kvzY7pvoAfqqmnzJ4zUG87Va0zYvL6xWb+7JdFy9GX+yIyVf2p1gR6w+kkZGwvG/OF94fetMEdGx53ednF7J1scS7sPxiI6FjzydvQ4SbMdJNDC25UR6pUmPfvYcGGAAD+/97c8Ag//yLWLqou+QyhvH5zTSyXLSY2RoaUp2Wjt8xqZm4N5FaR+PoyTh8YUJM7QpH93+r4XaBryGMi0aFNVS8/7GOU+dSycbi/sz5Tz/hZhLoDMNx/CX7Gl1xcBT/L7AYCgsYxT9XAoH2pL3/9LpgQdOa6W/+JgLgV0/RBVejhSRsTkCyXl2UJH1kf9oU8GNvWkuD+mL+eZJVBocEr/9xsahGwJHFih+U67i9H5P/36l/Abt2sESXCK5WPOQn2zCQ+eAsAi6pLg5h+Sp+Vi6Kv0zH6AVXsPzb4N163PmwCeixL8S+oaebL0JSSbaOc3dOEcFV/7/yQN7cJmkJctgKW7TpzG1fBZjf3Vi3pVBgjt3DoFZ9H88FJsbZk4UQiSAdtgTBGGV0Qbako3/EaCDDhv6o3UXIy9VuFJpks3LnVLff/0tEUn/3H2mYOHRxXSCQhYbMo/6XcT8kbHRS/6WcF7Kq+JZpLoSWYlNcCRTgaomPehL6YDVV+P1MOwoKgPwzco3hVXqPoYRPjuqk9X6OWxjGQ/V4klAsdjwBL0nwpioJIYFxr5+e7qKBrLoO04+2st6nrmTVd/VSqEd/zP00iULw2nyDaeBgxC3T3J0fRf+s8oMIlseJhnGdpJRCUiaAEfGmACQG4zR+fsIkLKph96SQGxccfrou8foWYYSsrv1T5yJnbNXFgiNlMluCNU6JKxG7/ZZQJ/6vT/jD9Q5lNeaeXt//Ex/0JZFyx393d7XxhcoRvVUFWv/Mcj/ev2VLCojBVMPAn6f8SVZjwO54toOLjZfFY/oZc6jJnIH6bolYAD3Gt/wm55ZRHg2AlRSuMGsfBp1oTL0XxAMT/3Uxv56jhPLlFjPHZPRsN07Mp8ahvKqGaRjqc1NPylgQ0anN36Tkazqhznoj8OoNi1e/6Giff5NGL4f+Mbre0tl/9pdTw+4koHvkch/gnreoLlBf5Nb1OCy4J6L+hRhD0XZA/Z0za7xczd72XRx0cNO8l6mGOZuH98/4Lo3RIM2FLUV//u4oIuiJKtPt9/MNLMhcygG1EfRV6RICfU6QY4SxI/z3WEe439xw5wcpR2Vvzyy9srHuubX2rB0LJbtd0TvVlEiAdF1BC1he3fyzfhkY33hY4IJJ/c7na5AxArRy9TcD7D8hQc4UhVSsX4hlsH73UQSrPwn6v5YJHsQ30huCmqGJ/jbGu8jb18VcEFGB7wu/XqQ3juNRxhXEGqI3FH5GBeWSCinT3+epuVSD1dsxb9TvZq/IoGv6niKAAAAAARVhJRg4AAABNTQAqAAAACAAAAAAAAA==';
        logoImg.alt = 'Next Level logo';

        logoLink.appendChild(logoImg);
        root.appendChild(logoLink);
    }

    function addLoadoutAndSettingButtons(root) {
        addLoadoutButtons(root);

        const settings = document.createElement('button');
        settings.type = 'button';
        settings.title = 'Settings';
        settings.className = 'torn-btn';
        settings.textContent = '⚙';
        settings.addEventListener('click', () => {
            let userInput = prompt("Please, enter which loadouts from 1 to 9 you want to see, comma-separated (default: 1,2,3):", selectedLoadouts);
            if (userInput !== null && userInput.length > 0) {
                localStorage.setItem("silmaril-loadout-switcher-selected-loadouts", userInput);
                selectedLoadouts = userInput;
                selectedLoadoutsArray = selectedLoadouts.split(',');
                root.querySelectorAll("button, a").forEach((item) => item.remove());
                addLoadoutAndSettingButtons(root);
                addLogo(root);
                flashWave(root, "green");
            } else {
                console.error("[TornLoadoutSwitcher] User cancelled input of selected loadouts.");
                flashWave(root, "yellow", 3);
            }
        });

        root.appendChild(settings);
    }

    async function addLoadoutButtons(root) {
        selectedLoadoutsArray.forEach((loadout) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.title = showTitles ? loadout : loadoutTitles[loadout] ?? '';
            button.className = rfcv === null ? 'torn-btn disabled' : 'torn-btn';
            button.textContent = showTitles ? (loadoutTitles[loadout] ?? loadout) : loadout;
            button.setAttribute('data-loadout-number', loadout);
            button.addEventListener('click', (clickEvent) => {
                handleLoadoutClick(clickEvent, root);
            });

            root.appendChild(button);
        })
    }

    // Takes the event as an argument rather than reading the implicit `event` global,
    // which is a non-standard leftover that no isolated-world userscript engine has to provide.
    async function handleLoadoutClick(clickEvent, root) {
        const button = clickEvent.currentTarget;
        if (button.classList.contains('disabled')) {
            return;
        }
        const loadout = button.getAttribute('data-loadout-number');
        // Re-read the cookie on every click: Torn rotates the token, and a stale one is
        // rejected silently (see sendSetLoadoutRequest).
        const token = refreshRfcv();
        if (!token) {
            console.error("[TornLoadoutSwitcher] No rfcv token available yet.");
            flashWave(root, "red", 5);
            return;
        }
        let url = setLoadoutUrl.replace("{loadoutId}", loadout).replace("{rfcv}", token);
        await sendSetLoadoutRequest(url, root);
    }

    async function sendSetLoadoutRequest(url, root) {
        try {
            const response = await fetch(url, {
                method: 'GET',
            });
            if (!response.ok) {
                console.error("[TornLoadoutSwitcher] Set Loadout request failed:", response);
                flashWave(root, "red", 5);
                return;
            }
            // Torn answers a rejected request - a stale rfcv token above all - with HTTP 200
            // and the error inside the JSON body, so response.ok on its own flashes green for
            // a loadout that never actually changed.
            const error = extractResponseError(await response.text());
            if (error) {
                console.error("[TornLoadoutSwitcher] Set Loadout rejected by Torn:", error);
                flashWave(root, "red", 5);
                return;
            }
            flashWave(root, "green");
        } catch (e) {
            console.error("[TornLoadoutSwitcher] Error setting loadout:", e);
            flashWave(root, "red", 5);
        }
    }

    // Returns Torn's error when the response body reports a failure, null otherwise. Bodies
    // that are not JSON objects count as success, so an unexpected response shape keeps
    // behaving the way it did before this check existed.
    function extractResponseError(body) {
        let payload;
        try {
            payload = JSON.parse(body);
        } catch (e) {
            return null;
        }
        if (!payload || typeof payload !== 'object') return null;
        if (payload.success === false || payload.error || payload.errorMessage) {
            return payload.error || payload.errorMessage || payload.message || "request rejected";
        }
        return null;
    }

    function flashWave(root, color, durationSeconds) {
        const wave = root.querySelector("div.wave");
        if (!wave) return;
        wave.style.backgroundColor = color;
        if (durationSeconds) {
            wave.style.animationDuration = `${durationSeconds}s`;
        }
        wave.style.animation = 'none';
        wave.offsetHeight;
        wave.style.animation = null;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function persistTitles() {
        try {
            localStorage.setItem("silmaril-loadout-switcher-titles", JSON.stringify(loadoutTitles));
        } catch (e) { /* ignore quota errors */
        }
    }

    function refreshButtonText() {
        if (!showTitles) return;
        document.querySelectorAll('div.silmaril-torn-loadout-switcher-container button[data-loadout-number]').forEach(btn => {
            const loadout = btn.getAttribute('data-loadout-number');
            const title = loadoutTitles[loadout];
            if (title) {
                btn.textContent = title;
                btn.title = loadout;
            }
        });
    }

    async function fetchTitlesManually() {
        if (rfcv === null) return;
        try {
            const response = await fetch(`${getEquippedItemsUrl}&rfcv=${rfcv}`);
            consumeLoadoutResponse(await response.clone().json());
        } catch (e) {
            console.warn("[TornLoadoutSwitcher] Manual titles fetch failed:", e);
        }
    }

    setTimeout(() => {
        if (!titlesReceivedThisSession) fetchTitlesManually();
    }, 15000);
})();
