// ==UserScript==
// @name         Torn Crimes Cracking Difficulty
// @namespace    https://github.com/SOLiNARY
// @version      0.1.5
// @description  Shows difficulty of cracking targets in cycles & nerve to be spent. After an update, a "What's new" popup lists what changed.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/loader.php?sid=crimes*
// @match        https://www.torn.com/page.php?sid=crimes*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_addStyle
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// ==/UserScript==
 
(async function() {
    'use strict';

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "0.1.5";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Crimes Cracking Difficulty";
    const WHATS_NEW_KEY = "silmaril-cracking-difficulty-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap.
    const CHANGELOG = [
        {
            version: "0.1.5",
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

 
    const crackingHash = '#/cracking';
    const difficultyInfoTemplate = '{cycles} cycles, {attempts} attempts, {nerve} nerve needed';
    const isTampermonkeyEnabled = typeof unsafeWindow !== 'undefined';
    const isMobileView = window.innerWidth <= 784;
    const difficultyColorMap = {
        "OneAttempt": "#37b24d",
        "ThreeOrLess": "#74b816",
        "FiveOrLess": "#f59f00",
        "SevenOrLess": "#f76707",
        "TenOrLess": "#f03e3e",
        "MoreThanTen": "#7048e8",
    };
    let isOnCrackingPage = false;
    let bruteForceStrength = 0;
 
    const styles = `
@media only screen and (max-width: 784px) {
    span.silmaril-crimes-cracking-difficulty {
        font-size: xx-small;
    }
 
    div.crime-root.cracking-root div[class^=crimeOptionWrapper___] div[class^=sections___] {
        height: 54px !important;
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
 
    checkURLChange();
 
    setInterval(checkURLChange, 750);
 
    const targetNode = document.querySelector("div.crimes-app");
    const observerConfig = { childList: true, subtree: true };
    const observer = new MutationObserver(async (mutationsList, observer) => {
        for (const mutation of mutationsList) {
            if (!isOnCrackingPage) {
                break;
            }
 
            let mutationTarget = mutation.target;
            if (mutation.type === 'childList' && mutationTarget.className.indexOf('outcomeWrapper___') >= 0) {
                let outcomeDiv = mutationTarget.querySelector('div[class*=outcome___]');
                if (outcomeDiv == null || outcomeDiv.hasAttribute('data-cracking-difficulty-value-set')) {
                    continue;
                }
                outcomeDiv.setAttribute('data-cracking-difficulty-value-set', '');
 
                const crimeOption = mutationTarget.parentNode.querySelector('div.crime-option');
                if (crimeOption.classList.contains('crime-option')){
                    setTimeout(function() {calculateDifficulty(crimeOption)}, 500);
                }
                break;
            }
        }
    });
    observer.observe(targetNode, observerConfig);
 
    async function addDifficulty() {
        while (document.querySelector('div.crime-root.cracking-root div[class^=currentCrime___]') == null) {
            if (!isOnCrackingPage) {
                break;
            }
            await sleep(50);
        }
        if (!isOnCrackingPage) {
            return;
        }
 
        const targets = document.querySelectorAll('div[class^=currentCrime___] div[class^=virtualList___] div[class^=crimeOptionWrapper___] div.crime-option');
        while (document.querySelector('div[class^=rig___]') == null){
            await sleep(50);
        }
        bruteForceStrength = parseFloat(document.querySelector('div[class^=rig___] div[class^=statistics___] div[class*=strength___] span[class^=value___]').innerText);
 
        targets.forEach(target => calculateDifficulty(target));
    }
 
    function calculateDifficulty(target) {
        const targetDescription = target.querySelector('div[class*=targetSection___]');
 
        let cyclesNeeded = 0;
        const characters = target.querySelectorAll('div[class^=sections___] div[class^=charSlot___]');
        characters.forEach(character => {
            cyclesNeeded += parseDifficulty(character) + 1;
        });
        const attemptsNeeded = Math.ceil(cyclesNeeded / bruteForceStrength);
        const nerveNeeded = Math.round(attemptsNeeded * 7 + 5);
        updateDifficultyInfo(targetDescription, cyclesNeeded, attemptsNeeded, nerveNeeded);
    }
 
    function updateDifficultyInfo(targetDescription, cyclesNeeded, attemptsNeeded, nerveNeeded) {
        const difficultyInfoSpan = targetDescription.querySelector('span.silmaril-crimes-cracking-difficulty') ?? document.createElement('span');
        difficultyInfoSpan.className = 'silmaril-crimes-cracking-difficulty';
        switch (attemptsNeeded) {
            case 0:
            case 1:
                difficultyInfoSpan.style.color = difficultyColorMap.OneAttempt;
                break;
            case 2:
            case 3:
                difficultyInfoSpan.style.color = difficultyColorMap.ThreeOrLess;
                break;
            case 4:
            case 5:
                difficultyInfoSpan.style.color = difficultyColorMap.FiveOrLess;
                break;
            case 6:
            case 7:
                difficultyInfoSpan.style.color = difficultyColorMap.SevenOrLess;
                break;
            case 8:
            case 9:
            case 10:
                difficultyInfoSpan.style.color = difficultyColorMap.TenOrLess;
                break;
            default:
                difficultyInfoSpan.style.color = difficultyColorMap.MoreThanTen;
                break;
        }
        difficultyInfoSpan.innerText = difficultyInfoTemplate.replace('{cycles}', cyclesNeeded).replace('{attempts}', attemptsNeeded).replace('{nerve}', nerveNeeded);
        if (isMobileView) {
            targetDescription.querySelector('div[class^=typeAndServiceWrapper___]').append(difficultyInfoSpan);
        } else {
            targetDescription.querySelector('div[class^=typeAndService___]').append(difficultyInfoSpan);
        }
 
    }
 
    function checkURLChange() {
        const currentURL = window.location.href;
        if (currentURL !== checkURLChange.previousURL) {
            if (window.location.href.includes(crackingHash)) {
                isOnCrackingPage = true;
                addDifficulty();
            } else {
                isOnCrackingPage = false;
            }
        }
        checkURLChange.previousURL = currentURL;
    }
 
    function parseDifficulty(element) {
        const label = element.getAttribute('aria-label');
        if (label == null) {
            return 0;
        }
        if (element.querySelector('span[class^=discoveredChar___]') != null) {
            return -1;
        }
        const matchEncrypted = label.match(/, (\d+) encryption/);
        if (matchEncrypted && matchEncrypted[1]) {
            return parseInt(matchEncrypted[1]);
        }
        return null;
    }
 
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
})();
