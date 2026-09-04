// ==UserScript==
// @name         Torn Armoury Loan Button
// @namespace    https://github.com/SOLiNARY
// @version      0.5.0
// @description  Caches loanable faction armoury items and adds a "Loan" chip to every organized crime role that needs one, loaning the item to whoever holds that role. Your own role loans in one click, any other role confirms first. After an update, a "What's new" popup lists what changed.
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

    const SCRIPT_VERSION = "0.5.0";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Armoury Loan Button";
    const WHATS_NEW_KEY = "silmaril-armoury-loan-button-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap.
    const CHANGELOG = [
        {
            version: "0.5.0",
            date: "2026-09-04",
            changes: [
            'The Loan button leaves the slot menu. Every occupied role that needs an item now carries a chip under the member name, showing the item and how many are free.',
            'Loans can go to anyone, not just you. The chip loans to whoever holds that role. Your own role still loans in one click, and any other role asks for confirmation first.',
            'A line above each crime counts the roles still missing kit, and hands the whole crew over in one confirmed step.',
            'Failures stay on the slot until you retry them instead of vanishing with the menu, and the messages are written for players rather than for the console.',
            'Nothing needs hovering any more. The chips read the crime list the page already loads, so they know which item every role needs and who is already carrying one.',
            'A role whose player already has the item no longer offers a loan. It shows a quiet green mark instead, so the raised chips are only the people still missing kit.'
            ]
        },
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
    const RFCV_ARG = 'rfcv=';
    const USER_ID_KEYS = ['userID', 'userId', 'user_id', 'playerId', 'playerID', 'uid'];
    const USER_NAME_KEYS = ['playername', 'playerName', 'username', 'userName', 'user_name'];

    addStyle(`
/* The chip that replaces the old menu button. It lives in the slot body, under the
   member name, on every occupied role whose item this script knows about. */
.silmaril-chip-wrap {
    position: relative;
    display: block;
    width: 100%;
    margin-top: 6px;
    container-type: inline-size;
}

/* The chip is appended to the slot wrapper, which Torn lays out as a column. This is
   only a guard for the day that changes: a row parent is told to wrap so the chip still
   gets a line of its own instead of sharing the member name's. */
:has(> .silmaril-chip-wrap) {
    flex-wrap: wrap;
}

.silmaril-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 24px;
    margin: 0;
    padding: 0 7px;
    box-sizing: border-box;
    border: 1px solid #171717;
    border-radius: 3px;
    color: #eaeaea;
    background: linear-gradient(180deg, #5f5f5f 0%, #454545 50%, #3b3b3b 51%, #313131 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
    font-family: Arial, Helvetica, sans-serif;
    text-decoration: none;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
}

.silmaril-chip:hover {
    background: linear-gradient(180deg, #6d6d6d 0%, #505050 50%, #464646 51%, #3a3a3a 100%);
}

.silmaril-chip .silmaril-chip-art {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    object-fit: contain;
}

.silmaril-chip .silmaril-chip-stack {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    overflow: hidden;
}

.silmaril-chip .silmaril-chip-lbl {
    min-width: 0;
    text-align: left;
    font-size: 10px;
    font-weight: bold;
    letter-spacing: .09em;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.silmaril-chip .silmaril-chip-cnt {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: bold;
    color: #a8a8a8;
}

/* Your own role. The outline is the blue Torn uses for member names, and it is the
   only chip that loans without asking first. */
.silmaril-chip.silmaril-mine {
    border-color: #5c86a8;
}

.silmaril-chip.silmaril-busy {
    opacity: .55;
    pointer-events: none;
}

/* Already has one: flat, unraised, not a button. */
.silmaril-chip.silmaril-out,
.silmaril-chip.silmaril-out:hover {
    background: rgba(55, 178, 77, .13);
    border-color: #2f5b34;
    color: #a8ceac;
    box-shadow: none;
    cursor: default;
}

.silmaril-chip.silmaril-gone,
.silmaril-chip.silmaril-gone:hover {
    background: linear-gradient(180deg, #3b3b3b 0%, #2e2e2e 100%);
    color: #888888;
    box-shadow: none;
    cursor: default;
}

.silmaril-chip.silmaril-cold,
.silmaril-chip.silmaril-cold:hover {
    background: rgba(0, 0, 0, .18);
    border: 1px dashed #79874f;
    color: #cfdba4;
    box-shadow: none;
}

.silmaril-chip.silmaril-fail,
.silmaril-chip.silmaril-fail:hover {
    background: linear-gradient(180deg, #8a4040 0%, #6c3030 50%, #5f2a2a 51%, #4e2222 100%);
    border-color: #300f0f;
    color: #ffe4e4;
}

.silmaril-chip .silmaril-chip-ico {
    flex-shrink: 0;
    display: flex;
    align-items: center;
}

@keyframes silmaril-spin { to { transform: rotate(360deg); } }

.silmaril-spin {
    animation: silmaril-spin 1.1s linear infinite;
    transform-origin: 50% 50%;
}

/* One line above each crime's slot row, answering "who still has no kit". */
.silmaril-itembar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 8px;
    padding: 5px 8px;
    box-sizing: border-box;
    border: 1px solid #1a1a1a;
    border-radius: 3px;
    background: rgba(0, 0, 0, .22);
}

.silmaril-itembar .silmaril-ib-l {
    flex: 1;
    min-width: 0;
    font-size: 10px;
    color: #a8a8a8;
    font-family: Arial, Helvetica, sans-serif;
}

.silmaril-itembar .silmaril-ib-l b {
    color: #e8e8e8;
}

.silmaril-btn {
    height: 20px;
    margin: 0;
    padding: 0 9px;
    box-sizing: border-box;
    border: 1px solid #171717;
    border-radius: 3px;
    color: #eaeaea;
    background: linear-gradient(180deg, #5f5f5f 0%, #454545 50%, #3b3b3b 51%, #313131 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
    font: bold 10px/1 Arial, Helvetica, sans-serif;
    letter-spacing: .08em;
    text-transform: uppercase;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
}

.silmaril-btn:hover {
    background: linear-gradient(180deg, #6d6d6d 0%, #505050 50%, #464646 51%, #3a3a3a 100%);
}

.silmaril-btn.silmaril-go {
    background: linear-gradient(180deg, #47844c 0%, #35693b 50%, #2d5c33 51%, #244d29 100%);
    border-color: #12300f;
    color: #e6f7e7;
}

.silmaril-btn.silmaril-go:hover {
    background: linear-gradient(180deg, #529459 0%, #3d7645 50%, #35693b 51%, #2b5a31 100%);
}

.silmaril-btn.silmaril-ghost {
    background: none;
    border-color: #3a3a3a;
    color: #a5a5a5;
    box-shadow: none;
}

.silmaril-btn.silmaril-ghost:hover {
    background: rgba(255, 255, 255, .05);
}

/* The confirmation. Anchored to the body rather than the slot, because Torn re-renders
   the crimes list roughly every second and would otherwise take the popover with it. */
.silmaril-pop {
    position: fixed;
    z-index: 2147482000;
    width: 224px;
    border: 1px solid #000;
    border-radius: 4px;
    background: #131313;
    box-shadow: 0 8px 20px rgba(0, 0, 0, .7);
    font-family: Arial, Helvetica, sans-serif;
    color: #e8e8e8;
}

.silmaril-pop .silmaril-cq,
.silmaril-modal .silmaril-cq {
    padding: 9px 11px 8px;
    font-size: 12px;
    font-weight: bold;
    color: #f2f2f2;
}

.silmaril-pop .silmaril-ci {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 11px 9px;
}

.silmaril-pop .silmaril-ci .silmaril-it {
    font-size: 11px;
    color: #d8d8d8;
}

.silmaril-pop .silmaril-ci .silmaril-fr {
    margin-left: auto;
    font-size: 10px;
    color: #8f8f8f;
}

.silmaril-pop .silmaril-cn,
.silmaril-modal .silmaril-cn {
    padding: 0 11px 10px;
    font-size: 10px;
    line-height: 1.5;
    color: #8f8f8f;
}

.silmaril-pop .silmaril-ca,
.silmaril-modal .silmaril-ca {
    display: flex;
    gap: 7px;
    justify-content: flex-end;
    padding: 8px 11px;
    border-top: 1px solid #262626;
}

.silmaril-pop .silmaril-btn,
.silmaril-modal .silmaril-btn {
    height: 22px;
    padding: 0 11px;
}

.silmaril-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147482000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 12px;
    box-sizing: border-box;
    overflow: auto;
    background: rgba(0, 0, 0, .6);
}

.silmaril-modal {
    width: 100%;
    max-width: 340px;
    border: 1px solid #000;
    border-radius: 4px;
    background: #131313;
    box-shadow: 0 8px 20px rgba(0, 0, 0, .7);
    font-family: Arial, Helvetica, sans-serif;
    color: #e8e8e8;
}

.silmaril-modal .silmaril-rows {
    display: flex;
    flex-direction: column;
    padding: 0 11px 8px;
}

.silmaril-modal .silmaril-r {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    border-top: 1px solid #232323;
    cursor: pointer;
}

.silmaril-modal .silmaril-r:first-child {
    border-top: none;
}

.silmaril-modal .silmaril-r input {
    width: 14px;
    height: 14px;
    margin: 0;
    flex-shrink: 0;
    accent-color: #2b6b31;
}

.silmaril-modal .silmaril-r .silmaril-it {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: #d8d8d8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.silmaril-modal .silmaril-r .silmaril-to {
    flex-shrink: 0;
    font-size: 11px;
    color: #9ec9ee;
}

.silmaril-modal .silmaril-r .silmaril-you {
    color: #8f8f8f;
}

.silmaril-modal .silmaril-foot {
    padding: 0 11px 10px;
    font-size: 10px;
    line-height: 1.5;
    color: #8f8f8f;
}

/* One line for the whole page when Torn says these loans are not ours to give. */
.silmaril-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    padding: 7px 10px;
    box-sizing: border-box;
    border: 1px solid #2a2a2a;
    border-radius: 3px;
    background: rgba(0, 0, 0, .25);
    color: #9a9a9a;
    font: 11px/1.4 Arial, Helvetica, sans-serif;
}

/* The sub-line only exists on narrow layouts; hovering carries it everywhere else. */
.silmaril-chip .silmaril-chip-sub {
    display: none;
}

/* Torn PDA and other narrow layouts: no hover to fall back on, so the item name goes
   on the face of the chip and every target grows to 44px. */
@media (max-width: 800px) {
    .silmaril-chip {
        height: auto;
        min-height: 44px;
        gap: 8px;
        padding: 4px 9px;
    }

    .silmaril-chip .silmaril-chip-art {
        width: 22px;
        height: 22px;
    }

    .silmaril-chip .silmaril-chip-lbl {
        font-size: 11px;
    }

    .silmaril-chip .silmaril-chip-cnt {
        display: none;
    }

    .silmaril-chip .silmaril-chip-sub {
        display: block;
        font-size: 10px;
        color: #b0b0b0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .silmaril-chip.silmaril-out {
        min-height: 30px;
    }

    .silmaril-chip.silmaril-out .silmaril-chip-sub {
        color: #8bb08f;
    }

    .silmaril-itembar .silmaril-btn {
        height: 30px;
    }

    .silmaril-pop .silmaril-btn,
    .silmaril-modal .silmaril-btn {
        flex: 1;
        height: 44px;
    }
}

/* Whatever the viewport says, a slot can still be too narrow to carry two lines. The
   chip keeps the taller touch target and drops the sub-line rather than showing two
   clipped ones; the confirmation names the item and the person in full anyway. */
@container (max-width: 118px) {
    .silmaril-chip .silmaril-chip-sub {
        display: none;
    }
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

    // A row that cannot be loaned may still say who has it. Where Torn does not link
    // the borrower this simply stays empty, and the chip offers the loan anyway rather
    // than claiming someone already has one.
    function getRowHolderId(row) {
        const link = row.querySelector('.loaned a[href*="XID="]');
        return link?.getAttribute('href')?.match(/XID=(\d+)/)?.[1] ?? null;
    }

    function sameList(a, b) {
        const left = a ?? [];
        const right = b ?? [];
        return left.length === right.length && left.every((value, i) => value === right[i]);
    }

    function itemsEqual(a, b) {
        if (!a || !b) return false;
        if (a.name !== b.name || a.type !== b.type) return false;
        return sameList(a.armoryIds, b.armoryIds) && sameList(a.holders, b.holders);
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
                    armoryIds: [],
                    holders: []
                };
            }
            if (isRowLoanable(row)) {
                if (!entry.armoryIds.includes(armoryId)) entry.armoryIds.push(armoryId);
            } else {
                const holder = getRowHolderId(row);
                if (holder != null && !entry.holders.includes(holder)) entry.holders.push(holder);
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

    // Every occupied role whose job needs an item carries a chip, and that chip loans
    // the item to whoever is standing in the role. Torn already prints the member's
    // name and links their profile inside the slot, so the recipient never has to be
    // typed or picked. Your own role loans on one click; every other role confirms
    // first, because that click spends faction property on somebody else's behalf.

    const HELD_KEY = 'silmaril-armoury-loan-held';
    // A locally recorded loan only has to survive until the armoury is next scanned,
    // which is where the authoritative list of who is holding what comes from.
    const HELD_TTL_MS = 12 * 60 * 60 * 1000;
    // Torn words the refusal differently depending on which permission is missing, so
    // the match is deliberately loose. A false positive costs one line of explanation;
    // missing it costs the user forty identical failures.
    const DENIAL_MARKERS = [
        'permission', 'not allowed', 'cannot loan', 'can not loan',
        'do not have access', 'access to the armoury', 'not have access'
    ];
    // Loans are sent one at a time with a gap, so a crew handover does not arrive as a
    // burst Torn could reasonably treat as automation.
    const BATCH_GAP_MS = 400;
    // Torn words the requirement two ways: a role somebody holds says "Used item", an
    // empty one says "Required item". Only matching the first is why this used to see
    // nothing but your own role.
    const ITEM_MARKERS = ['used item', 'required item'];
    // Torn puts a small badge on the item in the requirement tooltip and dims it when
    // the person in the role has not got the item. That badge is the only thing on the
    // page that answers "do they already have one", so it decides whether a chip offers
    // a loan at all. The class is hashed per build; the "dim" prefix is the stable part.
    const ABSENT_BADGE = /(?:^|\s)dim___/;
    const POSSESSION_KEY = 'silmaril-armoury-loan-has';
    const POSSESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    // The crimes page asks its own server for the list it renders, and that answer
    // carries every role's required item and whether the person in the role already has
    // one. That traffic is read as it arrives and nothing is ever requested on its own
    // account, so this costs the page no extra call and Torn sees no request it was not
    // already going to serve.
    const CRIME_LIST_MARKERS = ['sid=organizedcrimesdata', 'step=crimelist'];
    // A role that needs no item is recorded as such, so "we have not looked yet" and
    // "there is nothing to loan here" stop looking the same, and the count above each
    // crime can be honest about how many roles are in play.
    const NO_ITEM = 'none';

    const ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
        'stroke-width="2" aria-hidden="true"><path d="M3.2 8.4 6.5 11.7 12.8 5.2" stroke-linecap="round" ' +
        'stroke-linejoin="round"></path></svg>';
    const ICON_SPIN = '<svg class="silmaril-spin" width="16" height="16" viewBox="0 0 16 16" fill="none" ' +
        'stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 2a6 6 0 1 1-4.2 1.8" ' +
        'stroke-linecap="round"></path></svg>';
    const ICON_ALERT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
        'stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.2"></circle>' +
        '<path d="M8 4.8v4M8 11.1v.1" stroke-linecap="round"></path></svg>';
    const ICON_BOX = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
        'stroke-width="1.4" aria-hidden="true"><path d="M2.4 5.6 8 2.6l5.6 3v5L8 13.6l-5.6-3z" ' +
        'stroke-linejoin="round"></path><path d="M2.4 5.6 8 8.6l5.6-3M8 8.6v5"></path></svg>';
    const ICON_LOCK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
        'stroke-width="1.4" aria-hidden="true"><path d="M4.4 7.2V4.6a3.6 3.6 0 0 1 7.2 0v2.6" ' +
        'stroke-linecap="round"></path><rect x="3" y="7.2" width="10" height="6.6" rx="1.2"></rect></svg>';
    const ICON_RETRY = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8" aria-hidden="true"><path d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8" stroke-linecap="round">' +
        '</path><path d="M13.6 2.2v3.4h-3.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

    // Set once Torn refuses a loan for want of permission: one refusal is enough to know
    // that every other chip on the page would fail the same way.
    let loansDenied = false;
    // Slot key -> the message from its last failed loan. Held here rather than in the
    // DOM so it survives Torn re-rendering the crimes list underneath us.
    const slotFailures = new Map();

    function delay(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function extractItemId(img) {
        for (const attr of ['src', 'srcset']) {
            const id = img.getAttribute(attr)?.match(/(?:^|\/)images\/items\/(\d+)\//)?.[1];
            if (id) return id;
        }
        return null;
    }

    // Falls back to resolving the item by the name written after the marker, matched
    // against the cached armoury item names.
    function findItemIdByName(blockText) {
        const captured = blockText?.match(/(?:used|required) item:?\s*(.{1,60})/i)?.[1].trim().toLowerCase();
        if (!captured) return null;
        let best = null;
        for (const [itemId, entry] of Object.entries(getStoredItems())) {
            const name = entry?.name?.trim().toLowerCase();
            if (!name || !captured.startsWith(name)) continue;
            if (!best || name.length > best.nameLength) best = { itemId, nameLength: name.length };
        }
        return best?.itemId ?? null;
    }

    function hasItemMarker(text) {
        const lower = String(text ?? '').toLowerCase();
        return ITEM_MARKERS.some(function (marker) { return lower.includes(marker); });
    }

    // Climbs from the item image to the smallest ancestor containing the requirement
    // text; OC class names are hashed and the text may be split across word-level
    // spans, so the ancestors' combined textContent is the only stable marker. The size
    // cap keeps it from latching onto huge containers that merely happen to contain the
    // text somewhere far away.
    function findItemBlock(img) {
        let el = img.parentElement;
        for (let depth = 0; el && el !== document.body && depth < 8; depth++) {
            const text = el.textContent ?? '';
            if (text.length > 600) return null;
            if (hasItemMarker(text)) return el;
            el = el.parentElement;
        }
        return null;
    }

    function itemIdIn(block) {
        for (const img of block.querySelectorAll('img[src*="images/items/"], img[srcset*="images/items/"]')) {
            const id = extractItemId(img);
            if (id != null) return id;
        }
        return findItemIdByName(block.textContent);
    }

    // Torn keeps one cached tooltip node per slot and leaves every one of them in the
    // document once hovered, all of them reporting zero opacity. Neither presence nor
    // paint says which role is being described - but the header it marks as open names
    // its own tooltip by id, which is exact.
    function tooltipForHeader(header) {
        const id = header.getAttribute('aria-describedby');
        if (id == null || id === '') return null;
        const tip = document.getElementById(id);
        return tip != null && hasItemMarker(tip.textContent) ? tip : null;
    }

    // The slot wrapper holds both the header (role name, success chance) and the body
    // (member name, View Profile, Leave Role). Class names are hashed per build, so the
    // stable fragments of them are all there is to match on. Bails out if climbing ever
    // passes a single slot into a container holding several, rather than risk anchoring
    // to the wrong role.
    function findSlotWrapper(el) {
        let node = el;
        for (let depth = 0; node && node !== document.body && depth < 10; depth++) {
            if (node.querySelectorAll('[class*="successChance___"]').length > 1) return null;
            if (node.querySelector('[class*="successChance___"]') != null &&
                node.querySelector('[class*="slotBody"], [class*="slotMenu"], [class*="badgeContainer"]') != null) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    function findAllSlotWrappers() {
        const wrappers = [];
        const seen = new Set();
        document.querySelectorAll('[class*="successChance___"]').forEach(function (el) {
            const wrapper = findSlotWrapper(el);
            if (wrapper != null && !seen.has(wrapper)) {
                seen.add(wrapper);
                wrappers.push(wrapper);
            }
        });
        return wrappers;
    }

    // Identifies a slot across scans. The OC id pins it to one crime; the scenario name
    // and role pin it to the requirement itself, which is what actually decides the
    // item - so hovering one "Picklock #1" lights up that role in every other copy of
    // the same scenario on the page.
    function readSlot(wrapper) {
        const role = wrapper.querySelector('[class*="title___"]')?.textContent.trim() ?? '';
        if (role === '') return null;
        const crime = wrapper.closest('[data-oc-id]');
        const ocId = crime?.getAttribute('data-oc-id') ?? 'oc?';
        const scenario = crime?.querySelector('[class*="panelTitle"]')?.textContent.trim() ?? '';
        const id = wrapper.querySelector('a[href*="profiles.php?XID="]')
            ?.getAttribute('href').match(/XID=(\d+)/)?.[1] ?? null;
        const name = wrapper.querySelector('[class*="textName"]')?.textContent.trim() ?? '';
        return {
            wrapper: wrapper,
            crime: crime,
            role: role,
            occupant: (id != null && name !== '') ? { id: id, name: name } : null,
            ocKey: ocId + '::' + role,
            scenarioKey: scenario !== '' ? 'sc::' + scenario + '::' + role : null
        };
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

    function getSlotItemId(slot) {
        const cache = getSlotItemCache();
        const own = cache[slot.ocKey];
        if (own === NO_ITEM) return NO_ITEM;
        return own ?? (slot.scenarioKey != null ? cache[slot.scenarioKey] : null) ?? null;
    }

    // The scenario key is the valuable half: the item belongs to the role in that
    // scenario, not to this particular crime, so learning it once teaches every other
    // copy on the page - including the roles Torn has stopped describing because their
    // planning is finished.
    function rememberSlotItem(cache, slot, itemId) {
        if (slot == null || itemId == null) return false;
        let changed = false;
        for (const key of [slot.ocKey, slot.scenarioKey]) {
            if (key != null && cache[key] !== itemId) {
                cache[key] = itemId;
                changed = true;
            }
        }
        return changed;
    }

    function discoverSlotItems() {
        const cache = getSlotItemCache();
        let changed = false;

        // When the requirement is rendered inside the slot itself, the role it belongs
        // to can be read off the DOM with certainty.
        const imgs = document.querySelectorAll('img[src*="images/items/"], img[srcset*="images/items/"]');
        for (const img of imgs) {
            if (img.closest('.img-wrap[data-armoryid], .silmaril-chip, .silmaril-pop, .silmaril-modal, ' +
                '#chatRoot, [class^="chat-box"]')) continue;
            const block = findItemBlock(img);
            if (block == null) continue;
            const wrapper = findSlotWrapper(block);
            if (wrapper == null) continue;
            changed = rememberSlotItem(cache, readSlot(wrapper), extractItemId(img) ?? itemIdIn(block)) || changed;
        }

        // Otherwise Torn renders it as a tooltip outside the slot's own subtree, and the
        // link back to the role runs through the open header's aria-describedby.
        const header = document.querySelector('[data-is-tooltip-opened="true"]');
        const tip = header != null ? tooltipForHeader(header) : null;
        if (tip != null) {
            const wrapper = findSlotWrapper(header);
            if (wrapper != null) {
                const slot = readSlot(wrapper);
                changed = rememberSlotItem(cache, slot, itemIdIn(tip)) || changed;
                const badge = tip.querySelector('[class*="requirementIcon___"]');
                if (slot != null && badge != null) {
                    rememberPossession(slot, !ABSENT_BADGE.test((badge.className || '').toString()));
                }
            }
        }

        if (changed) saveSlotItemCache(cache);
    }

    // --- Torn's own crime list ---------------------------------------------------

    function isCrimeListUrl(url) {
        if (typeof url !== 'string') return false;
        const lower = url.toLowerCase();
        return CRIME_LIST_MARKERS.every(function (marker) { return lower.includes(marker); });
    }

    // Reads one crime list answer into the same two caches the tooltips feed, so the
    // rest of the script neither knows nor cares which of them supplied an answer.
    function ingestCrimeList(payload) {
        if (payload == null || payload.success !== true || !Array.isArray(payload.data)) return false;
        const cache = getSlotItemCache();
        let changed = false;
        for (const crime of payload.data) {
            const ocId = crime?.ID;
            const scenario = crime?.scenario?.name;
            if (ocId == null) continue;
            for (const slot of crime.playerSlots ?? []) {
                const role = slot?.name;
                if (role == null) continue;
                const player = slot.player;
                const known = {
                    ocKey: ocId + '::' + role,
                    scenarioKey: scenario ? 'sc::' + scenario + '::' + role : null,
                    occupant: player?.ID != null
                        ? { id: String(player.ID), name: String(player.name ?? '') }
                        : null
                };
                const requirement = slot.requirement;
                if (requirement?.id != null) {
                    changed = rememberSlotItem(cache, known, String(requirement.id)) || changed;
                    // doesExist is Torn's own answer to "has the person in this role got
                    // one", the same thing the tooltip badge shows.
                    if (typeof requirement.doesExist === 'boolean') {
                        rememberPossession(known, requirement.doesExist);
                    }
                } else if (cache[known.ocKey] == null) {
                    // Only ever against this crime: a role needing nothing here says
                    // nothing about the same role in another copy of the scenario.
                    cache[known.ocKey] = NO_ITEM;
                    changed = true;
                }
            }
        }
        if (changed) saveSlotItemCache(cache);
        return changed;
    }

    function handleCrimeListText(text) {
        try {
            if (ingestCrimeList(JSON.parse(text))) scheduleScan();
        } catch (e) { /* not the JSON we are after */ }
    }

    // Torn drives this page with both fetch and XHR depending on the route, so both are
    // wrapped. Each wrapper hands the call straight on and only ever reads a copy of
    // the answer, so nothing here can change what the page itself receives.
    function listenForCrimeList() {
        try {
            const nativeFetch = window.fetch;
            if (typeof nativeFetch === 'function') {
                window.fetch = function (input, init) {
                    const url = typeof input === 'string' ? input : input?.url;
                    const result = nativeFetch.apply(this, arguments);
                    if (isCrimeListUrl(url)) {
                        result.then(function (response) {
                            response.clone().text().then(handleCrimeListText).catch(function () {});
                        }).catch(function () {});
                    }
                    return result;
                };
            }
        } catch (e) {
            console.warn(LOG_PREFIX + ' Could not watch fetch:', e);
        }

        try {
            const open = XMLHttpRequest.prototype.open;
            const send = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (method, url) {
                this.silmarilCrimeList = isCrimeListUrl(url);
                return open.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function () {
                if (this.silmarilCrimeList === true) {
                    this.addEventListener('load', function () {
                        handleCrimeListText(this.responseText);
                    });
                }
                return send.apply(this, arguments);
            };
        } catch (e) {
            console.warn(LOG_PREFIX + ' Could not watch XHR:', e);
        }
    }

    // --- who is already holding one --------------------------------------------

    function getHeld() {
        try {
            const parsed = JSON.parse(localStorage.getItem(HELD_KEY));
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function markHeld(itemId, userId) {
        const held = getHeld();
        held[itemId + ':' + userId] = Date.now();
        for (const key of Object.keys(held)) {
            if (Date.now() - held[key] > HELD_TTL_MS) delete held[key];
        }
        try {
            localStorage.setItem(HELD_KEY, JSON.stringify(held));
        } catch (e) { /* ignore quota errors */ }
    }

    // The armoury is the authority on who is holding what; a loan this script sent is
    // only remembered until the armoury has been looked at again.
    function isHeld(itemId, userId) {
        if (getStoredItems()[itemId]?.holders?.includes(userId)) return true;
        const at = getHeld()[itemId + ':' + userId];
        return at != null && Date.now() - at < HELD_TTL_MS;
    }

    // Possession is per person in per role: it is keyed by the occupant as well as the
    // slot, so a role changing hands never inherits the last holder's answer.
    function possessionKey(slot) {
        return slot.occupant != null ? slot.ocKey + '::' + slot.occupant.id : null;
    }

    function getPossessionStore() {
        try {
            const parsed = JSON.parse(localStorage.getItem(POSSESSION_KEY));
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function rememberPossession(slot, has) {
        const key = possessionKey(slot);
        if (key == null || has == null) return;
        const store = getPossessionStore();
        const current = store[key];
        if (current != null && current.has === has && Date.now() - current.at < 60000) return;
        store[key] = { has: has, at: Date.now() };
        for (const other of Object.keys(store)) {
            if (Date.now() - (store[other]?.at ?? 0) > POSSESSION_TTL_MS) delete store[other];
        }
        try {
            localStorage.setItem(POSSESSION_KEY, JSON.stringify(store));
        } catch (e) { /* ignore quota errors */ }
    }

    // true, false, or null for "the tooltip has never been opened on this role".
    function getPossession(slot) {
        const key = possessionKey(slot);
        if (key == null) return null;
        const entry = getPossessionStore()[key];
        if (entry == null || Date.now() - entry.at > POSSESSION_TTL_MS) return null;
        return entry.has === true;
    }

    // --- chip state -------------------------------------------------------------

    function computeState(slot) {
        if (slot.occupant == null) return null;
        const itemId = getSlotItemId(slot);
        // No cached item means either the role needs none or its tooltip has never been
        // opened. The two are indistinguishable from here, so nothing is drawn - a chip
        // on a role that needs no item would be worse than no chip at all.
        if (itemId == null || itemId === NO_ITEM) return null;
        const entry = getStoredItems()[itemId] ?? null;
        const failure = slotFailures.get(slot.ocKey);
        if (failure != null) return { kind: 'fail', itemId: itemId, entry: entry, message: failure };
        // Torn saying they have it settles the matter. Torn saying they have not outranks
        // the armoury's list of who is holding what, which can be a page-load out of date.
        const known = getPossession(slot);
        const held = isHeld(itemId, slot.occupant.id);
        if (known === true || (known == null && held)) {
            return { kind: 'out', itemId: itemId, entry: entry, onLoan: held };
        }
        if (entry == null) return { kind: 'cold', itemId: itemId, entry: null };
        const free = entry.armoryIds?.length ?? 0;
        if (free === 0) return { kind: 'gone', itemId: itemId, entry: entry };
        return { kind: 'ready', itemId: itemId, entry: entry, free: free };
    }

    function itemName(state) {
        return state.entry?.name?.trim() || 'this item';
    }

    function chipText(state, slot, isMine) {
        const name = itemName(state);
        switch (state.kind) {
            case 'ready':
                return {
                    label: 'Loan',
                    sub: name + ' · ' + state.free + ' free',
                    title: name + ' — ' + state.free + ' free in the armoury. Loans to ' +
                        (isMine ? 'you' : slot.occupant.name) + '.'
                };
            case 'out':
                return {
                    label: state.onLoan ? 'Loaned' : 'Has item',
                    sub: name,
                    title: (isMine ? 'You already have' : slot.occupant.name + ' already has') +
                        ' ' + name + (state.onLoan ? ' on loan from the armoury.' : '.')
                };
            case 'gone':
                return {
                    label: 'None free',
                    sub: name,
                    title: 'No ' + name + ' free right now. Open the armoury to refresh this.'
                };
            case 'cold':
                return {
                    label: 'Armoury',
                    sub: 'Not seen yet',
                    title: 'Open the armoury once so this can see what is loanable.'
                };
            case 'fail':
                return { label: 'Failed', sub: state.message, title: state.message };
            default:
                return { label: 'Loan', sub: name, title: name };
        }
    }

    function chipLeading(state) {
        if (state.kind === 'out') return { html: ICON_CHECK };
        if (state.kind === 'fail') return { html: ICON_ALERT };
        if (state.kind === 'cold') return { html: ICON_BOX };
        return { art: state.itemId, dim: state.kind === 'gone' };
    }

    // Where the chip goes: the end of the slot wrapper, which puts it directly under the
    // member name and spanning the slot, without landing between two children React is
    // managing or disturbing the menu that is positioned against the slot body.
    function chipHome(wrapper) {
        return { parent: wrapper, before: null };
    }

    // Whether the chip needs a whole line to itself depends on which way its parent's
    // flex runs, and Torn has changed that before. Reading it beats assuming it.
    function fitWrapToRow(wrap, parent) {
        const style = getComputedStyle(parent);
        const isFlex = style.display === 'flex' || style.display === 'inline-flex';
        wrap.style.flexBasis = isFlex && !style.flexDirection.startsWith('column') ? '100%' : '';
    }

    function buildChip(slot, state, isMine) {
        const text = chipText(state, slot, isMine);
        const interactive = state.kind === 'ready' || state.kind === 'fail' || state.kind === 'cold';
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'silmaril-chip silmaril-' + state.kind + (isMine ? ' silmaril-mine' : '');
        chip.title = text.title;

        const leading = chipLeading(state);
        if (leading.art != null) {
            const art = document.createElement('img');
            art.className = 'silmaril-chip-art';
            art.src = '/images/items/' + leading.art + '/small.png';
            art.alt = '';
            if (leading.dim) art.style.opacity = '.5';
            // A missing image would otherwise leave a broken-picture glyph in a 16px box.
            art.addEventListener('error', function () { art.style.display = 'none'; });
            chip.appendChild(art);
        } else {
            const ico = document.createElement('span');
            ico.className = 'silmaril-chip-ico';
            ico.innerHTML = leading.html;
            chip.appendChild(ico);
        }

        const stack = document.createElement('span');
        stack.className = 'silmaril-chip-stack';
        const label = document.createElement('span');
        label.className = 'silmaril-chip-lbl';
        label.textContent = text.label;
        const sub = document.createElement('span');
        sub.className = 'silmaril-chip-sub';
        sub.textContent = text.sub;
        stack.appendChild(label);
        stack.appendChild(sub);
        chip.appendChild(stack);

        if (state.kind === 'ready') {
            const count = document.createElement('span');
            count.className = 'silmaril-chip-cnt';
            count.textContent = '×' + state.free;
            chip.appendChild(count);
        } else if (state.kind === 'fail') {
            const retry = document.createElement('span');
            retry.className = 'silmaril-chip-cnt';
            retry.innerHTML = ICON_RETRY;
            chip.appendChild(retry);
        }

        if (!interactive) chip.disabled = true;
        return chip;
    }

    function openArmoury() {
        const tab = document.querySelector('a[href="#faction-armoury"]');
        if (tab != null) {
            tab.click();
            return;
        }
        location.hash = '#faction-armoury';
    }

    function applyChip(slot, state, isMine) {
        const existing = slot.wrapper.querySelector('.silmaril-chip-wrap');
        if (state == null) {
            existing?.remove();
            return;
        }
        // A loan in flight owns its chip until the request comes back.
        if (existing != null && existing.dataset.silmarilBusy === '1') return;

        const signature = [
            state.kind, state.itemId, state.free ?? '', state.message ?? '',
            slot.occupant.id, isMine ? 'mine' : 'theirs'
        ].join('|');
        let wrap = existing;
        if (wrap == null) {
            const home = chipHome(slot.wrapper);
            if (home == null) return;
            wrap = document.createElement('div');
            wrap.className = 'silmaril-chip-wrap';
            home.parent.insertBefore(wrap, home.before);
            fitWrapToRow(wrap, home.parent);
        } else if (wrap.dataset.silmarilSig === signature) {
            return;
        }
        wrap.dataset.silmarilSig = signature;
        wrap.textContent = '';

        const chip = buildChip(slot, state, isMine);
        chip.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (state.kind === 'cold') {
                openArmoury();
                return;
            }
            // Retrying clears the old verdict and takes the normal route again, which
            // means another player's retry still confirms.
            if (state.kind === 'fail') slotFailures.delete(slot.ocKey);
            if (isMine) {
                startLoan(slot, state.itemId, wrap);
                return;
            }
            openConfirm(chip, slot, state);
        });
        wrap.appendChild(chip);
    }

    function setChipBusy(wrap) {
        wrap.dataset.silmarilBusy = '1';
        const chip = wrap.querySelector('.silmaril-chip');
        if (chip == null) return;
        chip.className = 'silmaril-chip silmaril-busy';
        chip.disabled = true;
        chip.textContent = '';
        const ico = document.createElement('span');
        ico.className = 'silmaril-chip-ico';
        ico.innerHTML = ICON_SPIN;
        const stack = document.createElement('span');
        stack.className = 'silmaril-chip-stack';
        const label = document.createElement('span');
        label.className = 'silmaril-chip-lbl';
        label.textContent = 'Loaning';
        stack.appendChild(label);
        chip.appendChild(ico);
        chip.appendChild(stack);
    }

    // --- the confirmation --------------------------------------------------------

    let openPopover = null;

    function closeConfirm() {
        openPopover?.remove();
        openPopover = null;
    }

    function positionPopover(pop, anchor) {
        const rect = anchor.getBoundingClientRect();
        const width = pop.offsetWidth;
        const height = pop.offsetHeight;
        let left = rect.left + (rect.width / 2) - (width / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        let top = rect.bottom + 8;
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
    }

    function openConfirm(anchor, slot, state) {
        closeConfirm();
        const name = itemName(state);
        const pop = document.createElement('div');
        pop.className = 'silmaril-pop';

        const question = document.createElement('div');
        question.className = 'silmaril-cq';
        question.textContent = 'Loan to ' + slot.occupant.name + '?';

        const line = document.createElement('div');
        line.className = 'silmaril-ci';
        const art = document.createElement('img');
        art.className = 'silmaril-chip-art';
        art.src = '/images/items/' + state.itemId + '/small.png';
        art.alt = '';
        art.style.width = '18px';
        art.style.height = '18px';
        art.addEventListener('error', function () { art.style.display = 'none'; });
        const itemLabel = document.createElement('span');
        itemLabel.className = 'silmaril-it';
        itemLabel.textContent = name;
        const free = document.createElement('span');
        free.className = 'silmaril-fr';
        free.textContent = state.free + ' free';
        line.appendChild(art);
        line.appendChild(itemLabel);
        line.appendChild(free);

        const note = document.createElement('div');
        note.className = 'silmaril-cn';
        note.textContent = 'Marked out of the armoury in their name until they return it.';

        const actions = document.createElement('div');
        actions.className = 'silmaril-ca';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'silmaril-btn silmaril-ghost';
        cancel.textContent = 'Cancel';
        const commit = document.createElement('button');
        commit.type = 'button';
        commit.className = 'silmaril-btn silmaril-go';
        commit.textContent = 'Loan';
        actions.appendChild(cancel);
        actions.appendChild(commit);

        pop.appendChild(question);
        pop.appendChild(line);
        pop.appendChild(note);
        pop.appendChild(actions);
        document.body.appendChild(pop);
        positionPopover(pop, anchor);
        openPopover = pop;

        cancel.addEventListener('click', function (event) {
            event.stopPropagation();
            closeConfirm();
        });
        commit.addEventListener('click', function (event) {
            event.stopPropagation();
            const wrap = anchor.closest('.silmaril-chip-wrap');
            closeConfirm();
            if (wrap != null) startLoan(slot, state.itemId, wrap);
        });
        pop.addEventListener('click', function (event) { event.stopPropagation(); });
    }

    // Anything that moves the page out from under an anchored popover closes it, which
    // on a list Torn re-renders every second is safer than trying to follow it.
    document.addEventListener('pointerdown', function (event) {
        if (openPopover != null && !openPopover.contains(event.target)) closeConfirm();
    }, true);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeConfirm();
    });
    window.addEventListener('scroll', closeConfirm, true);
    window.addEventListener('resize', closeConfirm);

    // --- the crew handover -------------------------------------------------------

    function openBatch(candidates, ownId) {
        closeConfirm();
        const overlay = document.createElement('div');
        overlay.className = 'silmaril-overlay';
        const modal = document.createElement('div');
        modal.className = 'silmaril-modal';

        const question = document.createElement('div');
        question.className = 'silmaril-cq';
        const rows = document.createElement('div');
        rows.className = 'silmaril-rows';

        const boxes = [];
        for (const candidate of candidates) {
            const row = document.createElement('label');
            row.className = 'silmaril-r';
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = true;
            const art = document.createElement('img');
            art.className = 'silmaril-chip-art';
            art.src = '/images/items/' + candidate.state.itemId + '/small.png';
            art.alt = '';
            art.addEventListener('error', function () { art.style.display = 'none'; });
            const item = document.createElement('span');
            item.className = 'silmaril-it';
            item.textContent = itemName(candidate.state);
            const to = document.createElement('span');
            to.className = 'silmaril-to';
            to.textContent = candidate.slot.occupant.name;
            if (candidate.slot.occupant.id === ownId) {
                const you = document.createElement('span');
                you.className = 'silmaril-you';
                you.textContent = ' (you)';
                to.appendChild(you);
            }
            row.appendChild(box);
            row.appendChild(art);
            row.appendChild(item);
            row.appendChild(to);
            rows.appendChild(row);
            boxes.push({ box: box, candidate: candidate });
        }

        const foot = document.createElement('div');
        foot.className = 'silmaril-foot';
        foot.textContent = 'Each one is free in the armoury as far as this has seen.';

        const actions = document.createElement('div');
        actions.className = 'silmaril-ca';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'silmaril-btn silmaril-ghost';
        cancel.textContent = 'Cancel';
        const commit = document.createElement('button');
        commit.type = 'button';
        commit.className = 'silmaril-btn silmaril-go';
        actions.appendChild(cancel);
        actions.appendChild(commit);

        function refreshCount() {
            const chosen = boxes.filter(function (entry) { return entry.box.checked; }).length;
            question.textContent = 'Loan ' + chosen + (chosen === 1 ? ' item?' : ' items?');
            commit.textContent = 'Loan ' + chosen;
            commit.disabled = chosen === 0;
        }
        boxes.forEach(function (entry) { entry.box.addEventListener('change', refreshCount); });
        refreshCount();

        modal.appendChild(question);
        modal.appendChild(rows);
        modal.appendChild(foot);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function close() { overlay.remove(); }
        cancel.addEventListener('click', close);
        overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
        commit.addEventListener('click', function () {
            const chosen = boxes.filter(function (entry) { return entry.box.checked; })
                .map(function (entry) { return entry.candidate; });
            close();
            runBatch(chosen);
        });
    }

    // --- sending the loan --------------------------------------------------------

    function stripHtml(html) {
        let text;
        try {
            text = new DOMParser().parseFromString(String(html), 'text/html').body?.textContent;
        } catch (e) { /* fall through to the regex strip */ }
        text ??= String(html).replace(/<[^>]*>/g, ' ');
        return text.replace(/\s+/g, ' ').trim().slice(0, 180);
    }

    function looksDenied(message) {
        const lower = String(message ?? '').toLowerCase();
        return DENIAL_MARKERS.some(function (marker) { return lower.includes(marker); });
    }

    function parseLoanResponse(response, text) {
        if (!response.ok) {
            return { success: false, message: 'Torn turned the loan down. Reload the page and try again.' };
        }
        try {
            const json = JSON.parse(text);
            const message = stripHtml(String(json.message ?? json.text ?? json.error ?? ''));
            const success = json.success !== false && json.error == null;
            return { success: success, message: message };
        } catch (e) {
            const message = stripHtml(text);
            const lower = message.toLowerCase();
            const failed = lower.includes('error') || lower.includes('you cannot') || lower.includes("you can't");
            return { success: !failed, message: message };
        }
    }

    // Sends one loan. The only thing that changes between loaning to yourself and
    // loaning to a crew member is this user field.
    async function performLoan(itemId, recipient, slot) {
        const entry = getStoredItems()[itemId];
        if (!entry) {
            return { ok: false, message: 'Open the armoury once so this can see what is loanable.' };
        }
        if (!entry.armoryIds?.length) {
            return {
                ok: false,
                message: 'No ' + (entry.name || 'item') + ' free right now. Open the armoury to refresh this.'
            };
        }
        const rfcv = getRfcv();
        if (!rfcv) {
            return { ok: false, message: 'Torn turned the loan down. Reload the page and try again.' };
        }

        const armoryId = entry.armoryIds[0];
        const body = new URLSearchParams({
            ajax: 'true',
            step: 'armouryActionItem',
            role: 'loan',
            item: armoryId,
            itemID: itemId,
            type: entry.type ?? '',
            user: recipient.name + ' [' + recipient.id + ']',
            quantity: '1'
        });

        console.log(`${LOG_PREFIX} Loaning item ${itemId} (armoury id ${armoryId}) to ${recipient.name} [${recipient.id}]`);
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
                // That armoury copy is out now, so drop it and let the next loan take a
                // fresh one.
                const store = getStoredItems();
                const fresh = store[itemId];
                if (fresh?.armoryIds) {
                    fresh.armoryIds = fresh.armoryIds.filter(function (id) { return id !== armoryId; });
                    saveItems(store);
                }
                markHeld(itemId, recipient.id);
                if (slot != null) rememberPossession(slot, true);
                return { ok: true, message: result.message };
            }
            if (looksDenied(result.message)) {
                console.warn(`${LOG_PREFIX} Loan refused for permissions:`, result.message);
                return { ok: false, denied: true, message: result.message };
            }
            console.error(`${LOG_PREFIX} Loan request failed:`, text);
            return {
                ok: false,
                message: result.message || 'Torn turned the loan down. Reload the page and try again.'
            };
        } catch (error) {
            console.error(`${LOG_PREFIX} Loan request error:`, error);
            return { ok: false, message: 'The request did not get through. Try again in a moment.' };
        }
    }

    function markDenied() {
        loansDenied = true;
        closeConfirm();
        document.querySelectorAll('.silmaril-chip-wrap, .silmaril-itembar').forEach(function (el) { el.remove(); });
        showDenialNotice();
    }

    function showDenialNotice() {
        if (document.querySelector('.silmaril-notice') != null) return;
        const host = document.querySelector('#faction-crimes-root') ?? document.querySelector('#faction-crimes');
        if (host == null) return;
        const notice = document.createElement('div');
        notice.className = 'silmaril-notice';
        const ico = document.createElement('span');
        ico.innerHTML = ICON_LOCK;
        ico.style.flexShrink = '0';
        ico.style.display = 'flex';
        const text = document.createElement('span');
        text.textContent = 'Armoury loans are not yours to give. Ask an officer to hand these out.';
        notice.appendChild(ico);
        notice.appendChild(text);
        host.insertBefore(notice, host.firstChild);
    }

    async function startLoan(slot, itemId, wrap) {
        if (wrap.dataset.silmarilBusy === '1') return;
        setChipBusy(wrap);
        const result = await performLoan(itemId, slot.occupant, slot);
        wrap.dataset.silmarilBusy = '0';
        if (result.denied) {
            markDenied();
            return;
        }
        if (result.ok) slotFailures.delete(slot.ocKey);
        else slotFailures.set(slot.ocKey, result.message);
        wrap.remove();
        scanCrimes();
    }

    async function runBatch(candidates) {
        for (const candidate of candidates) {
            const wrap = candidate.slot.wrapper.querySelector('.silmaril-chip-wrap');
            if (wrap != null) setChipBusy(wrap);
            const result = await performLoan(candidate.state.itemId, candidate.slot.occupant, candidate.slot);
            if (wrap != null) wrap.dataset.silmarilBusy = '0';
            if (result.denied) {
                markDenied();
                return;
            }
            if (result.ok) slotFailures.delete(candidate.slot.ocKey);
            else slotFailures.set(candidate.slot.ocKey, result.message);
            if (wrap != null) wrap.remove();
            scanCrimes();
            await delay(BATCH_GAP_MS);
        }
        scanCrimes();
    }

    // --- the bar above each crime's slot row -------------------------------------

    function applyItemBar(slotsWrapper, entries, ownId) {
        const host = slotsWrapper.parentElement;
        if (host == null) return;
        let bar = host.querySelector(':scope > .silmaril-itembar');
        const kitted = entries.filter(function (e) { return e.state.kind === 'out'; }).length;
        const missing = entries.filter(function (e) { return e.state.kind === 'ready'; });
        // A bar over a single role would only repeat what its own chip already says.
        if (entries.length < 2) {
            bar?.remove();
            return;
        }
        const signature = [entries.length, kitted, missing.length].join('|');
        if (bar != null && bar.dataset.silmarilSig === signature) return;
        if (bar == null) {
            bar = document.createElement('div');
            bar.className = 'silmaril-itembar';
            host.insertBefore(bar, slotsWrapper);
        }
        bar.dataset.silmarilSig = signature;
        bar.textContent = '';

        const label = document.createElement('span');
        label.className = 'silmaril-ib-l';
        const count = document.createElement('b');
        count.textContent = kitted + ' of ' + entries.length;
        label.appendChild(count);
        label.appendChild(document.createTextNode(' roles kitted out'));
        bar.appendChild(label);

        if (missing.length > 0) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'silmaril-btn';
            button.textContent = 'Loan the ' + missing.length + ' missing';
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                openBatch(missing, ownId);
            });
            bar.appendChild(button);
        }
    }

    // Chips belong on crimes that can still be equipped. A finished crime keeps the same
    // markup, so the active tab is what says whether any of this is worth offering.
    function crimesTabIsActionable() {
        const active = document.querySelector('[class*="buttonsContainer___"] button[class*="active___"]');
        if (active == null) return true;
        const name = active.querySelector('[class*="tabName___"]')?.textContent.trim().toLowerCase() ?? '';
        if (name === '') return true;
        return name === 'planning' || name === 'recruiting';
    }

    function scanCrimes() {
        discoverSlotItems();

        if (loansDenied) {
            document.querySelectorAll('.silmaril-chip-wrap, .silmaril-itembar').forEach(function (el) { el.remove(); });
            showDenialNotice();
            return;
        }
        if (!crimesTabIsActionable()) {
            document.querySelectorAll('.silmaril-chip-wrap, .silmaril-itembar').forEach(function (el) { el.remove(); });
            return;
        }

        const ownId = getUser()?.id ?? null;
        const byRow = new Map();
        for (const wrapper of findAllSlotWrappers()) {
            const slot = readSlot(wrapper);
            if (slot == null) continue;
            const state = computeState(slot);
            const isMine = slot.occupant != null && ownId != null && slot.occupant.id === ownId;
            applyChip(slot, state, isMine);
            if (state == null) continue;
            const row = wrapper.parentElement;
            if (row == null) continue;
            if (!byRow.has(row)) byRow.set(row, []);
            byRow.get(row).push({ slot: slot, state: state });
        }
        for (const [row, entries] of byRow) {
            applyItemBar(row, entries, ownId);
        }
        // A bar whose row lost every chip - a crime that finished, or a tab switch that
        // reused the container - would otherwise sit there claiming nothing.
        document.querySelectorAll('.silmaril-itembar').forEach(function (bar) {
            const row = bar.nextElementSibling;
            if (row == null || !byRow.has(row)) bar.remove();
        });
        // The popover is anchored to a chip; if Torn has re-rendered that chip away,
        // there is nothing left for the confirmation to be about.
        if (openPopover != null && !document.body.contains(openPopover)) openPopover = null;
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

    listenForCrimeList();

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
