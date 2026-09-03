// ==UserScript==
// @name         Torn Crimes Scamming Timers
// @namespace    https://github.com/SOLiNARY
// @version      0.3.3
// @description  Show how much cooldown & expiration is left for targets After an update, a "What's new" popup lists what changed.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/loader.php?sid=crimes*
// @match        https://torn.com/loader.php?sid=crimes*
// @match        https://www.torn.com/page.php?sid=crimes*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_addStyle
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==
 
(async function() {
    'use strict';

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "0.3.3";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Crimes Scamming Timers";
    const WHATS_NEW_KEY = "silmaril-scamming-timers-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap.
    const CHANGELOG = [
        {
            version: "0.3.3",
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

 
    const showExpiration = true;
    const showCooldown = true;
    const timeElementsToShow = 2; // Options: 1,2,3,4
    const scammingCrimesUrl = 'loader.php?sid=crimesData&step=crimesList&rfcv='
    const observerConfig = { childList: true, subtree: true };
    let foundTargets = false;
    let noTargets = false;
    let targets = {};
    const isTampermonkeyEnabled = typeof unsafeWindow !== 'undefined';
    const isMobileView = window.innerWidth <= 784;
    const { fetch: originalFetch } = isTampermonkeyEnabled ? unsafeWindow : window;
    const customFetch = async (...args) => {
        let [resource, config] = args;
        let response = await originalFetch(resource, config);
        if (response.url.indexOf(scammingCrimesUrl) >= 0 && window.location.href.includes('crimes#/scamming')) {
            targets = {};
            try {
                const jsonData = await response.clone().json();
                jsonData.DB.crimesByType.targets.forEach((target, index) => {
                    let expireTimestamp = target.expire.toString().length == 10 ? target.expire : target.expire.toString().substr(0, 10); // Fix for Torn's long timestamps bug
                    let cooldownTimestamp = null;
                    if (target.cooldown > 0){
                        cooldownTimestamp = target.cooldown.toString().length == 10 ? target.cooldown : target.cooldown.toString().substr(0, 10); // Fix for Torn's long timestamps bug
                    }
                    targets[index] = {
                        email: target.email,
                        expire: expireTimestamp,
                        cooldown: cooldownTimestamp
                    };
                });
 
                response.json = async () => jsonData;
                response.text = async () => JSON.stringify(jsonData);
            } catch (error) {
                noTargets = true;
                console.log('[TornCrimesScammingTimers] No targets, skipping the script init', error);
            }
        }
 
        return response;
    };
 
    if (isTampermonkeyEnabled){
        unsafeWindow.fetch = customFetch;
    } else {
        window.fetch = customFetch;
    }
 
    await addStyle();
 
    const timeDeltas = {
        "After": 1,
        "Ago": -1
    };
    const timerTypes = {
        "Expiration": 1,
        "Cooldown": 2
    }
 
 
    setInterval(addTimeSpans, 2 * 1_000);
 
    function addTimeSpans(){
        let targetEmailSpans = document.querySelectorAll('div.crimes-app div.crime-root.scamming-root div[class^=virtualList___] div[class^=virtualItem___] span[class^=email___]');
        Object.values(targets).forEach(target => {
            var match = Object.values(targetEmailSpans).find(targetRow => targetRow.innerText == target.email);
            if (match != null) {
                if (showCooldown){
                    let timeElement = match.parentNode.querySelector('span.silmaril-torn-crimes-scamming-timers-cooldown');
                    if (timeElement == null) {
                        timeElement = document.createElement('span');
                        timeElement.className = 'silmaril-torn-crimes-scamming-timers-cooldown';
                        timeElement.innerText = calculateTimeDelta(target.cooldown, timeDeltas.After, timerTypes.Cooldown, !isMobileView);
                        match.insertAdjacentElement('afterEnd', timeElement);
                    } else {
                        timeElement.innerText = calculateTimeDelta(target.cooldown, timeDeltas.After, timerTypes.Cooldown, !isMobileView);
                    }
                }
                if (showExpiration){
                    let timeElement = match.parentNode.querySelector('span.silmaril-torn-crimes-scamming-timers-expiration');
                    if (timeElement == null) {
                        timeElement = document.createElement('span');
                        timeElement.className = 'silmaril-torn-crimes-scamming-timers-expiration';
                        timeElement.innerText = calculateTimeDelta(target.expire, timeDeltas.After, timerTypes.Expiration, !isMobileView);
                        match.insertAdjacentElement('afterEnd', timeElement);
                    } else {
                        timeElement.innerText = calculateTimeDelta(target.expire, timeDeltas.After, timerTypes.Expiration, !isMobileView);
                    }
                }
            }
        })
    }
 
    function calculateTimeDelta(timestamp, timeDeltaType, timerType, isDesktopView) {
        const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
        let timeDelta = timestamp - now; // Time remaining in seconds
 
        if (timeDeltaType === timeDeltas.After && timeDelta <= 0) {
            switch (timerType){
                case timerTypes.Cooldown:
                    return "";
                case timerTypes.Expire:
                default:
                    return "Expired";
            }
        }
        if (timeDeltaType === timeDeltas.Ago) {
            timeDelta = Math.abs(timeDelta);
            if (timeDelta <= 0) {
                return "Just now";
            }
        }
 
        const days = Math.floor(timeDelta / 86400); // 86400 seconds in a day
        const hours = Math.floor((timeDelta % 86400) / 3600); // 3600 seconds in an hour
        const minutes = Math.floor((timeDelta % 3600) / 60); // 60 seconds in a minute
        const seconds = timeDelta % 60;
 
        let prefix = '';
        switch (timerType){
            case timerTypes.Cooldown:
                prefix = "Cooldown in ";
                break;
            case timerTypes.Expire:
            default:
                prefix = "Expires in ";
                break;
        }
 
        let timeElementsAdded = 0;
        let timeDeltaText = isDesktopView ? timeDeltaType === timeDeltas.After ? prefix : "Created " : timeDeltaType === timeDeltas.After ? "In " : "";
        if (days != 0 && timeElementsAdded < timeElementsToShow) {
            timeDeltaText += isDesktopView ? `${days} d` : `${days} day${days === 1 ? '' : 's'}`;
            timeElementsAdded += 1;
        }
        if (hours != 0 && timeElementsAdded < timeElementsToShow) {
            if (days !== 0){
                timeDeltaText += ', ';
            }
            timeDeltaText += isDesktopView ? `${hours} h` : `${hours} hour${hours === 1 ? '' : 's'}`;
            timeElementsAdded += 1;
        }
        if (minutes != 0 && timeElementsAdded < timeElementsToShow) {
            if (days !== 0 || hours !== 0){
                timeDeltaText += ', ';
            }
            timeDeltaText += isDesktopView ? `${minutes} m` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
            timeElementsAdded += 1;
        }
        if (seconds != 0 && timeElementsAdded < timeElementsToShow) {
            if (days !== 0 || hours !== 0 || minutes !== 0){
                timeDeltaText += ', ';
            }
            timeDeltaText += isDesktopView ? `${seconds} s` : `${seconds} second${seconds === 1 ? '' : 's'}`;
            timeElementsAdded += 1;
        }
        if (timeDeltaType === timeDeltas.Ago) {
            timeDeltaText += ' ago';
        }
 
        return timeDeltaText;
    }
 
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
 
    async function addStyle() {
        const styles = `
        span.silmaril-torn-crimes-scamming-timers-cooldown {
            color: yellowgreen;
            font-size: xx-small;
            display: ${showCooldown ? 'block' : 'none'};
        }
        span.silmaril-torn-crimes-scamming-timers-expiration {
            color: gray;
            font-size: xx-small;
            display: ${showExpiration ? 'block' : 'none'};
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
    }
})();
