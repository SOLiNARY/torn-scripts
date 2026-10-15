// ==UserScript==
// @name         Torn Crimes Scamming Quick
// @namespace    https://github.com/SOLiNARY
// @version      0.1.8
// @description  Makes clicks on response emojis do the respond attempt & hovering on them is like clicking on them. After an update, a "What's new" popup lists what changed.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/loader.php?sid=crimes*
// @match        https://torn.com/loader.php?sid=crimes*
// @match        https://www.torn.com/page.php?sid=crimes*
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

    const SCRIPT_VERSION = "0.1.8";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Crimes Scamming Quick";
    const WHATS_NEW_KEY = "silmaril-scamming-quick-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap.
    const CHANGELOG = [
        {
            version: "0.1.8",
            date: "2026-10-15",
            changes: [
                'Fixed: moving the mouse across responses no longer leaves their tooltips stuck open.'
            ]
        },
        {
            version: "0.1.7",
            date: "2026-10-15",
            changes: [
                'Fixed: one click no longer commits several times after the page has changed.',
                'Fixed: moving the mouse off a response now unselects it.'
            ]
        },
        {
            version: "0.1.6",
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

 
    const isMobileView = window.innerWidth <= 784;
    const TOOLTIP_CHECK_DELAY_MS = 100;
 
    function addHoverClickListener() {
        const buttons = document.querySelectorAll('div.crime-root.scamming-root button.response-type-button');
        buttons.forEach(button => {
            // The observer calls this on every page change, so bind each button only once.
            if (button.dataset.sqBound) {
                return;
            }
            button.dataset.sqBound = '1';
            // Torn keeps the state on the button itself: aria-pressed for the chosen response (with
            // its selected___ class as a fallback), aria-disabled for one that can't be picked now.
            const isSelected = function() {
                const pressed = button.getAttribute('aria-pressed');
                return pressed != null ? pressed === 'true' : /\bselected___/.test(button.className);
            };
            const isDisabled = () => button.getAttribute('aria-disabled') === 'true';
            button.addEventListener('click', function(event) {
                // Our own clicks are skipped, and a response that isn't chosen yet is left to
                // Torn's own click handler, which runs right after this one.
                if (!event.isTrusted || !isSelected()) {
                    return;
                }
                findCommitButton(button)?.dispatchEvent(new Event("click", {bubbles: true}));
            });
            // mouseenter fires once each time the pointer comes onto the button; mouseover fired
            // again for every svg path and ring inside it.
            button.addEventListener('mouseenter', function() {
                if (isSelected() || isDisabled()) {
                    return;
                }
                button.dispatchEvent(new Event("click", {bubbles: true}));
            });
            // Torn's tooltip also opens on a click, and one opened that way stays open after the
            // pointer leaves, until the next press anywhere else. Selecting on hover is such a
            // click, so close a tooltip that is still open once the pointer has gone.
            button.addEventListener('mouseleave', function() {
                setTimeout(function() {
                    if (button.getAttribute('data-is-tooltip-opened') !== 'true' || button.matches(':hover')) {
                        return;
                    }
                    // Press on the response the pointer moved to, which keeps that one's tooltip, or
                    // else on the page itself, which is outside Torn's React tree, so no button sees it.
                    pressOn(document.querySelector('div.crime-root.scamming-root button.response-type-button:hover') ?? document.body);
                }, TOOLTIP_CHECK_DELAY_MS);
            });
        });
    }

    // A mouse press with no click: what a player's own press elsewhere does to an open tooltip.
    function pressOn(target) {
        // Aim at the middle of the part of the target that is on screen.
        const rect = target.getBoundingClientRect();
        const init = {bubbles: true, cancelable: true, composed: true, view: window, button: 0,
                      clientX: (Math.max(rect.left, 0) + Math.min(rect.right, window.innerWidth)) / 2,
                      clientY: (Math.max(rect.top, 0) + Math.min(rect.bottom, window.innerHeight)) / 2};
        const pointer = {pointerId: 1, pointerType: 'mouse', isPrimary: true};
        target.dispatchEvent(new PointerEvent('pointerdown', {...init, ...pointer, buttons: 1}));
        target.dispatchEvent(new MouseEvent('mousedown', {...init, buttons: 1}));
        target.dispatchEvent(new PointerEvent('pointerup', {...init, ...pointer, buttons: 0}));
        target.dispatchEvent(new MouseEvent('mouseup', {...init, buttons: 0}));
    }

    // The commit button lives in the same crime row as the responses. The nearest ancestor that
    // holds exactly one is that row; one holding several is the list of rows, so stop there.
    function findCommitButton(button) {
        for (let element = button.parentElement; element != null; element = element.parentElement) {
            const commitButtons = element.querySelectorAll('div[class*=commitButtonSection___] button.commit-button');
            if (commitButtons.length > 0) {
                return commitButtons.length === 1 ? commitButtons[0] : null;
            }
        }
        return null;
    }
 
    if (isMobileView){
        console.log('[TornCrimesScammingQuick] Mobile view detected, script disabled');
        return;
    }
 
    const observer = new MutationObserver(addHoverClickListener);
 
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
 
    addHoverClickListener();
})();
