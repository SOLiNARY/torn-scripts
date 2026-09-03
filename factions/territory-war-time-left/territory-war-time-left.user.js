// ==UserScript==
// @name         Torn Territory War Time Left
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Shows time left until territory is captured given the current or bestcase attackers & defenders count right underneath war timeout ticker. After an update, a "What's new" popup lists what changed.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/factions.php?step=your*
// @match        https://www.torn.com/factions.php?step=profile&ID=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        none
// ==/UserScript==
 
(function() {
    'use strict';

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "0.4";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Territory War Time Left";
    const WHATS_NEW_KEY = "silmaril-territory-war-time-left-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap.
    const CHANGELOG = [
        {
            version: "0.4",
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

 
    const targetElementSelector = '.f-war-list.war-new';
    const observerOptions = { childList: true, subtree: true };
 
    const observerCallback = async function(mutationsList, observer) {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                const targetElement = document.querySelector(targetElementSelector);
                if (targetElement) {
                    let territoryWars = mutation.target.querySelectorAll(".f-war-list.war-new div[class^='status-wrap territoryBox']");
                    if (territoryWars.length > 0) {
                        console.log('Target element found!');
                        territoryWars.forEach(war => {
                            war.querySelector('.info .faction-progress-wrap').style.paddingTop = '0px';
                            let timeLeftElement = document.createElement('div');
                            timeLeftElement.classList.add('time-left', 'timer');
                            let timeLeftBestElement = document.createElement('div');
                            timeLeftBestElement.classList.add('time-left-best', 'timer');
                            war.querySelector('.info .faction-progress-wrap').append(timeLeftElement, timeLeftBestElement);
                        });
                        territoryWars.forEach(war => {
                            let enemyCountDiv = war.querySelector('.info .member-count.enemy-count .count');
                            let allyCountDiv = war.querySelector('.info .member-count.your-count .count');
 
                            renderTimeLeft(war);
 
                            // Set up a MutationObserver on the added child element
                            const childObserver = new MutationObserver(function(childMutations) {
                                childMutations.forEach(function(childMutation) {
                                    if (childMutation.type === 'characterData') {
                                        let territoryWar = childMutation.target.parentNode.parentNode.parentNode.parentNode;
                                        renderTimeLeft(territoryWar);
                                    }
                                });
                            });
 
                            setInterval(renderTimeLeft, 1000 + Math.floor(Math.random() * 10) + 1, war);
 
                            childObserver.observe(enemyCountDiv, { characterData: true, subtree: true });
                            childObserver.observe(allyCountDiv, { characterData: true, subtree: true });
                        });
                        observer.disconnect();
                    }
                }
            }
        }
    };
 
    const observer = new MutationObserver(observerCallback);
    observer.observe(document.documentElement, observerOptions);
    console.log('Observer started. Waiting for target element to appear...');
 
    function renderTimeLeft(war) {
        let enemyCountDiv = war.querySelector('.info .member-count.enemy-count .count');
        let allyCountDiv = war.querySelector('.info .member-count.your-count .count');
        let enemyCount = Number(enemyCountDiv.innerText);
        let allyCount = Number(allyCountDiv.innerText);
        let isAllyAttack = war.querySelector('.info .member-count.your-count .count i').classList.contains('swords-icon');
        let remainder = isAllyAttack ? allyCount - enemyCount : enemyCount - allyCount;
        let timeLeft = '??:??:??:??';
        let timeLeftBest = '??:??:??:??';
        let scoreText = war.querySelector('.info .faction-progress-wrap .score').innerText;
        let score = scoreText.replaceAll(',', '').split('/');
        let pointsLeft = Number(score[1]) - Number(score[0]);
        let maximumSlots = Number(score[1]) / 50000;
        if (remainder > 0) {
            let secondsUntilGoal = pointsLeft / remainder;
            timeLeft = convertSecondsToDHMS(secondsUntilGoal);
        }
        timeLeftBest = convertSecondsToDHMS(pointsLeft / maximumSlots);
        let timeLeftDiv = war.querySelector('.info .faction-progress-wrap .time-left');
        let timeLeftBestDiv = war.querySelector('.info .faction-progress-wrap .time-left-best');
        const timeLeftCharacters = timeLeft.split('');
        const timeLeftBestCharacters = timeLeftBest.split('');
        const timeLeftSpanArray = ['CURRENT '];
        timeLeftCharacters.forEach(char => {
            const span = document.createElement('span');
            span.textContent = char;
            timeLeftSpanArray.push(span);
        });
        timeLeftDiv.replaceChildren(...timeLeftSpanArray);
        const timeLeftBestSpanArray = ['BESTCASE '];
        timeLeftBestCharacters.forEach(char => {
            const span = document.createElement('span');
            span.textContent = char;
            timeLeftBestSpanArray.push(span);
        });
        timeLeftBestDiv.replaceChildren(...timeLeftBestSpanArray);
    }
 
    function convertSecondsToDHMS(seconds) {
        if (seconds === Infinity){
            return '??:??:??:??';
        }
 
        const oneDay = 86400; // number of seconds in a day
        const oneHour = 3600; // number of seconds in an hour
        const oneMinute = 60; // number of seconds in a minute
 
        // Calculate the number of days, hours, minutes, and seconds
        const days = Math.floor(seconds / oneDay);
        const hours = Math.floor((seconds % oneDay) / oneHour);
        const minutes = Math.floor((seconds % oneHour) / oneMinute);
        const remainingSeconds = Math.round(seconds % oneMinute);
 
        // Construct a formatted string with the results
        let output = '';
        output += `${days.toString().padStart(2, '0')}:`;
        output += `${hours.toString().padStart(2, '0')}:`;
        output += `${minutes.toString().padStart(2, '0')}:`;
        output += `${remainingSeconds.toString().padStart(2, '0')}`;
 
        return output;
    }
})();
