// ==UserScript==
// @name         Torn Attack Shortcuts
// @namespace    https://github.com/SOLiNARY
// @version      0.2.0
// @description  Configurable attack shortcuts and a one-button battle workflow with weapon priorities, finishing choices, and tab closing.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT
// @match        https://www.torn.com/page.php*
// @match        https://torn.com/page.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_registerMenuCommand
// @grant        window.close
// @noframes
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    if (new URLSearchParams(location.search).get('sid') !== 'attack') return;

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "0.2.0";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Attack Shortcuts";
    const WHATS_NEW_KEY = "silmaril-attack-shortcuts-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap. A release marked
    // `silent: true` is left out of that and never opens the popup by itself; it is listed
    // only when the popup is opened from the menu. Leaving the flag off means false.
    const CHANGELOG = [
        {
            version: "0.2.0",
            date: "2026-10-26",
            silent: true,
            changes: [
                'Use Space or the on-page button for your next battle action, from starting the fight to closing the result.',
                'Build your sequence in One button: reorder weapons, choose Fist or Kick, set reload behavior and pick how to finish.'
            ]
        },
        {
            version: "0.1.1",
            date: "2026-10-26",
            silent: true,
            changes: [
                'Press S to start an attack or J to join one when its button appears; both keys can be changed in Shortcuts.'
            ]
        },
        {
            version: "0.1.0",
            date: "2026-10-26",
            silent: true,
            changes: [
                'Use 1-6 for weapons, Punch and Kick, 7-9 for Leave, Mug and Hospitalize, and 0 to close the tab.',
                'Open Shortcuts to change or clear any binding and save your own keys.'
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

    const STORAGE_KEY = 'silmaril-attack-shortcuts-settings';
    const FIGHT_STATE_KEY = 'silmaril-attack-shortcuts-fight';
    const ACTIONS = [
        { id: 'workflow', label: 'One-button workflow', code: 'Space' },
        { id: 'start', label: 'Start attack', code: 'KeyS', control: true },
        { id: 'join', label: 'Join attack', code: 'KeyJ', control: true },
        { id: 'primary', label: 'Primary', code: 'Digit1', weapon: 'main', slot: 'primary' },
        { id: 'secondary', label: 'Secondary', code: 'Digit2', weapon: 'second', slot: 'secondary' },
        { id: 'melee', label: 'Melee', code: 'Digit3', weapon: 'melee', slot: 'melee' },
        { id: 'temporary', label: 'Temporary', code: 'Digit4', weapon: 'temp', slot: 'temporary' },
        { id: 'punch', label: 'Punch', code: 'Digit5', weapon: 'fists', slot: 'fists' },
        { id: 'kick', label: 'Kick', code: 'Digit6', weapon: 'boots', slot: 'kick' },
        { id: 'leave', label: 'Leave', code: 'Digit7', control: true },
        { id: 'mug', label: 'Mug', code: 'Digit8', control: true },
        { id: 'hospitalize', label: 'Hospitalize', code: 'Digit9', control: true },
        { id: 'closeTab', label: 'Close tab', code: 'Digit0' }
    ];
    const CONTROL_LABELS = new Map([
        ['start', 'start'], ['start attack', 'start'], ['start fight', 'start'],
        ['join', 'join'], ['join attack', 'join'], ['join fight', 'join'],
        ['leave', 'leave'], ['mug', 'mug'],
        ['hospitalize', 'hospitalize'], ['hospitalise', 'hospitalize'], ['continue', 'continue']
    ]);
    const WORKFLOW_CATEGORIES = ['melee', 'primary', 'secondary', 'unarmed'];
    let settings = readSettings();
    let draft = null;
    let recording = null;
    let settingsDialog = null;
    let previousFocus = null;
    let toastTimer;
    let fightState = { pageKey: '', temporaryUsed: false, pending: null, stage: 'unknown' };
    let observedAttackRoot = null;
    let attackObserver = null;
    let refreshScheduled = false;
    const battleClickCandidates = new WeakMap();

    function workflowDefaults() {
        return {
            enabled: true, before: 'auto', temporary: 'once',
            priority: WORKFLOW_CATEGORIES.map(category => ({ category, enabled: true })),
            unarmed: 'kick', emptyFirearm: 'reload', finish: 'leave', after: 'close'
        };
    }

    function normalizeWorkflow(value) {
        const result = workflowDefaults();
        if (!value || typeof value !== 'object') return result;
        if (typeof value.enabled === 'boolean') result.enabled = value.enabled;
        const choices = {
            before: ['auto', 'start', 'join', 'manual'], temporary: ['once', 'skip'],
            unarmed: ['punch', 'kick'], emptyFirearm: ['reload', 'skip'],
            finish: ['leave', 'mug', 'hospitalize', 'manual'], after: ['close', 'stay']
        };
        for (const [key, values] of Object.entries(choices)) {
            if (values.includes(value[key])) result[key] = value[key];
        }
        if (Array.isArray(value.priority)) {
            const seen = new Set();
            result.priority = value.priority.filter(row => {
                if (!row || !WORKFLOW_CATEGORIES.includes(row.category) || seen.has(row.category)) return false;
                seen.add(row.category);
                return true;
            }).map(row => ({ category: row.category, enabled: row.enabled !== false }));
            // Missing entries remain available in settings, without adding surprise fallbacks.
            for (const category of WORKFLOW_CATEGORIES) {
                if (!seen.has(category)) result.priority.push({ category, enabled: false });
            }
        }
        return result;
    }

    function defaults() {
        return {
            enabled: true,
            workflow: workflowDefaults(),
            bindings: Object.fromEntries(ACTIONS.map(action => [action.id, {
                code: action.code, ctrl: false, alt: false, shift: false, meta: false
            }]))
        };
    }

    // Number row and numeric keypad intentionally use the same bindings.
    function normalizeCode(code) {
        return /^Numpad\d$/.test(code) ? code.replace('Numpad', 'Digit') : code;
    }

    function validCode(code) {
        return typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Arrow(Up|Down|Left|Right)|Space|Enter|Home|End|PageUp|PageDown|Insert|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Numpad(Add|Subtract|Multiply|Divide|Decimal|Enter))$/.test(code);
    }

    function bindingId(binding) {
        if (!binding) return '';
        return [binding.ctrl, binding.alt, binding.shift, binding.meta, binding.code].join(':');
    }

    function readSettings() {
        const result = defaults();
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved || typeof saved !== 'object') return result;
            if (typeof saved.enabled === 'boolean') result.enabled = saved.enabled;
            result.workflow = normalizeWorkflow(saved.workflow);
            const configured = new Set();
            for (const action of ACTIONS) {
                const binding = saved.bindings?.[action.id];
                if (binding === null) {
                    result.bindings[action.id] = null;
                } else if (binding && validCode(normalizeCode(binding.code))) {
                    result.bindings[action.id] = {
                        code: normalizeCode(binding.code), ctrl: binding.ctrl === true,
                        alt: binding.alt === true, shift: binding.shift === true, meta: binding.meta === true
                    };
                    configured.add(action.id);
                }
            }
            // Saved bindings win over new defaults added in an update.
            const priority = [...ACTIONS].sort((left, right) =>
                Number(configured.has(right.id)) - Number(configured.has(left.id)));
            // A damaged or hand-edited value must never dispatch two actions for one key.
            const seen = new Set();
            for (const action of priority) {
                const id = bindingId(result.bindings[action.id]);
                if (id && seen.has(id)) result.bindings[action.id] = null;
                if (id) seen.add(id);
            }
        } catch (error) {
            // Missing, blocked, or invalid storage leaves the defaults usable.
        }
        return result;
    }

    function formatBinding(binding) {
        if (!binding) return 'Unbound';
        const names = {
            Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[',
            BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',',
            Period: '.', Slash: '/', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right'
        };
        const key = names[binding.code] || binding.code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
        return [binding.ctrl && 'Ctrl', binding.alt && 'Alt', binding.shift && 'Shift', binding.meta && 'Meta', key]
            .filter(Boolean).join(' + ');
    }

    function bindingFromEvent(event) {
        const code = normalizeCode(event.code);
        if (!validCode(code)) return null;
        return { code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey };
    }

    function isVisible(element) {
        if (!element?.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' &&
            style.visibility !== 'collapse' && element.getClientRects().length > 0;
    }

    function isAvailable(element) {
        if (!isVisible(element) || element.closest(':disabled, [disabled], [aria-disabled="true"], [aria-busy="true"]')) return false;
        if (getComputedStyle(element).pointerEvents === 'none') return false;
        return !Array.from(element.classList).some(name => /^(disabled|emptySlot)(___|$)/i.test(name));
    }

    function actionControls(root) {
        const controls = new Map();
        root.querySelectorAll('button, a[href], [role="button"], input[type="button"], input[type="submit"]')
            .forEach(element => {
                if (!isVisible(element)) return;
                const labelledBy = (element.getAttribute('aria-labelledby') || '').split(/\s+/)
                    .map(id => document.getElementById(id)?.textContent || '').join(' ');
                const labels = [element.getAttribute('aria-label'), labelledBy, element.value, element.textContent]
                    .filter(value => typeof value === 'string')
                    .map(value => value.trim().replace(/\s+/g, ' ').toLowerCase());
                const id = labels.map(label => CONTROL_LABELS.get(label)).find(Boolean);
                if (id && (!controls.has(id) || isAvailable(element))) controls.set(id, element);
            });
        return controls;
    }

    function actionTarget(action) {
        const root = document.getElementById('attack-root');
        if (!root) return null;
        const controls = actionControls(root);
        if (action.control) {
            const target = controls.get(action.id);
            return isAvailable(target) ? target : null;
        }
        // Weapons cannot act through the controls shown before or after a fight.
        if (controls.size) return null;
        // Both players have the same weapon IDs. The attacker label identifies our slot.
        const target = root.querySelector('[id="weapon_' + action.weapon + '"]' +
            '[aria-describedby~="label_attacker_' + action.slot + '"]');
        if (!target || !/^Attack with\b/i.test(target.getAttribute('aria-label') || '')) return null;
        return isAvailable(target) ? target : null;
    }

    function weaponSlot(id, root = document.getElementById('attack-root')) {
        const action = ACTIONS.find(item => item.id === id && item.weapon);
        return action && root ? root.querySelector('[id="weapon_' + action.weapon + '"]' +
            '[aria-describedby~="label_attacker_' + action.slot + '"]') : null;
    }

    function hasClassPrefix(element, prefix) {
        return Boolean(element && Array.from(element.classList).some(name => name.startsWith(prefix + '___')));
    }

    function ammoText(slot) {
        return (slot?.querySelector('[class*="bottomMarker___"]')?.textContent || '').trim();
    }

    function weaponReady(slot) {
        if (!isAvailable(slot) || !/^Attack with\b/i.test(slot.getAttribute('aria-label') || '')) return false;
        if (!hasClassPrefix(slot, 'hoverEnabled') || hasClassPrefix(slot, 'disarmedWeapon')) return false;
        if (Array.from(slot.querySelectorAll('[class*="preloader___"], [class*="disarmedContainer___"]')).some(isVisible)) return false;
        return !/^(?:no ammo|no clips|unknown)$/i.test(ammoText(slot));
    }

    function battleSnapshot() {
        const root = document.getElementById('attack-root');
        const pageKey = new URL(location.href).searchParams.get('user2ID') || '';
        if (!root) return { root: null, pageKey, stage: 'unknown', progress: '', busy: true };
        const controls = actionControls(root);
        const busy = Array.from(root.querySelectorAll(
            '.loading, [aria-busy="true"], [class*="preloader___"], [class*="preloaderWrap___"]'
        )).some(isVisible);
        const result = controls.get('continue');
        // Torn only renders this dialog's Continue action after it has an end result/log ID.
        // The WON status underneath the choices is already visible before a finish is chosen.
        const confirmedResult = result && isAvailable(result) &&
            result.closest('[class*="dialogWrapper___"]') && result.closest('[class*="modal___"]');
        const entry = controls.has('start') || controls.has('join');
        const finish = ['leave', 'mug', 'hospitalize'].some(id => controls.has(id));
        const modal = Array.from(root.querySelectorAll('[class*="modal___"]')).some(isVisible);
        const slots = ACTIONS.filter(action => action.weapon).map(action => weaponSlot(action.id, root));
        const active = slots.some(slot => isVisible(slot) && hasClassPrefix(slot, 'attackStarted'));
        const stage = entry ? 'before' : finish ? 'finishing' : confirmedResult ? 'result' :
            busy || modal ? 'loading' : active ? 'active' : 'unknown';
        const log = Array.from(root.querySelectorAll('[aria-describedby="log-header"] [class*="message___"]'))
            .map(element => element.textContent.trim());
        const health = Array.from(root.querySelectorAll('[class*="srOnly___"][aria-live], [class*="playerHealth___"]'))
            .map(element => element.textContent.trim());
        const turn = Array.from(root.querySelectorAll('[class*="labelsContainer___"] [class*="labelTitle___"]'))
            .map(element => element.textContent.trim()).find(text => /^\d+\s*\/\s*\d+$/.test(text)) || '';
        const ammo = slots.map(ammoText);
        return { root, pageKey, controls, stage, busy, progress: JSON.stringify({ log, health, ammo, turn }) };
    }

    function rememberFight() {
        try {
            sessionStorage.setItem(FIGHT_STATE_KEY, JSON.stringify({
                pageKey: fightState.pageKey, temporaryUsed: fightState.temporaryUsed
            }));
        } catch (error) {
            // Memory still covers the current page when session storage is unavailable.
        }
    }

    function syncFight(snapshot) {
        if (fightState.pageKey !== snapshot.pageKey) {
            fightState = { pageKey: snapshot.pageKey, temporaryUsed: false, pending: null, stage: 'unknown' };
            try {
                const saved = JSON.parse(sessionStorage.getItem(FIGHT_STATE_KEY));
                if (saved?.pageKey === snapshot.pageKey) fightState.temporaryUsed = saved.temporaryUsed === true;
            } catch (error) { /* A new fight simply starts with unused temporary weapons. */ }
        }
        if (snapshot.stage === 'before' && fightState.stage !== 'before') {
            fightState.temporaryUsed = false;
            rememberFight();
        }
        const pending = fightState.pending;
        if (pending && (snapshot.busy || snapshot.stage === 'loading')) pending.sawBusy = true;
        if (pending && !snapshot.busy) {
            const advanced = (pending.stage === 'before' && ['active', 'finishing', 'result'].includes(snapshot.stage)) ||
                (pending.stage === 'active' && ['finishing', 'result'].includes(snapshot.stage)) ||
                (pending.stage === 'finishing' && snapshot.stage === 'result');
            const progressed = snapshot.progress !== pending.progress && ['active', 'finishing', 'result'].includes(snapshot.stage);
            if (advanced || progressed) {
                fightState.pending = null;
            } else if (pending.sawBusy && snapshot.stage === pending.stage &&
                ['before', 'active', 'finishing'].includes(snapshot.stage)) {
                // Torn also returns to idle after an unsuccessful request. A fresh press may retry.
                if (pending.id === 'temporary') {
                    fightState.temporaryUsed = pending.temporaryUsedBefore;
                    rememberFight();
                }
                fightState.pending = null;
            }
        }
        if (!['unknown', 'loading'].includes(snapshot.stage)) fightState.stage = snapshot.stage;
    }

    function resetWorkflowPending() {
        fightState.pending = null;
    }

    function nextWorkflowAction() {
        const snapshot = battleSnapshot();
        syncFight(snapshot);
        const config = settings.workflow;
        const stop = (label, detail) => ({ kind: 'stop', label, detail });
        const wait = detail => ({ kind: 'wait', label: 'Waiting for battle…', detail });
        const click = (id, target, label, detail) => ({ kind: 'click', id, target, label, detail, snapshot });
        if (!settings.enabled || !config.enabled) return stop('Workflow off', 'Enable the one-button workflow in Shortcuts.');
        if (!snapshot.root || !snapshot.pageKey) return wait('Waiting for the attack page to load.');
        if (snapshot.busy || fightState.pending) return wait('Waiting for Torn to confirm the previous action.');
        if (snapshot.stage === 'before') {
            const id = snapshot.controls.has('start') ? 'start' : 'join';
            if (config.before === 'manual') return stop('Start or join manually', 'Choose how to enter the fight.');
            if (config.before !== 'auto' && config.before !== id) return stop('No available action', 'The entry button does not match your sequence.');
            const target = snapshot.controls.get(id);
            return isAvailable(target) ? click(id, target, id === 'start' ? 'Start fight' : 'Join fight', 'One press enters the fight.') : wait('The entry button is not ready.');
        }
        if (snapshot.stage === 'finishing') {
            if (config.finish === 'manual') return stop('Choose a finish manually', 'Choose Leave, Mug or Hospitalize.');
            const target = snapshot.controls.get(config.finish);
            const label = ACTIONS.find(action => action.id === config.finish).label + ' target';
            return isAvailable(target) ? click(config.finish, target, label, 'Finishing and closing take separate presses.') : wait('Your chosen finishing action is not ready.');
        }
        if (snapshot.stage === 'result') {
            return config.after === 'close' ? { kind: 'close', label: 'Close tab', detail: 'Result confirmed. One press closes the tab.' } :
                stop('Workflow complete', 'Result confirmed. Keep the tab open.');
        }
        if (snapshot.stage !== 'active') return wait('Waiting for Torn to show the next battle stage.');
        if (config.temporary === 'once' && !fightState.temporaryUsed) {
            const target = weaponSlot('temporary', snapshot.root);
            if (weaponReady(target)) return click('temporary', target, 'Use temporary weapon', 'Use it once, then follow your weapon priority.');
        }
        for (const row of config.priority) {
            if (!row.enabled) continue;
            const id = row.category === 'unarmed' ? config.unarmed : row.category;
            const target = weaponSlot(id, snapshot.root);
            if (!weaponReady(target)) continue;
            const ammo = ammoText(target).replace(/,/g, '');
            const emptyMagazine = /^(?:0\s*\/|0\s*\(\s*[1-9])/.test(ammo);
            if (['primary', 'secondary'].includes(id) && emptyMagazine) {
                if (config.emptyFirearm === 'skip') continue;
                // Torn reloads through the normal weapon action. The nested ammo counter switches ammo type.
                return click(id, target, 'Reload ' + id, 'Reload this weapon before falling back.');
            }
            const label = id === 'punch' ? 'Fist (Punch)' : id === 'kick' ? 'Kick' : 'Attack with ' + id;
            return click(id, target, label, 'First available enabled entry in your priority list.');
        }
        return stop('No available action', 'No enabled weapon can act. Wait or change your priority list.');
    }

    function blockingDialogOpen() {
        const root = document.getElementById('attack-root');
        return Array.from(document.querySelectorAll('[aria-modal="true"], dialog[open]'))
            .some(element => isVisible(element) && !root?.contains(element));
    }

    function performWorkflowAction() {
        if (new URLSearchParams(location.search).get('sid') !== 'attack' || blockingDialogOpen()) return;
        const action = nextWorkflowAction();
        if (action.kind === 'close') closeTab();
        else if (action.kind === 'click') {
            markBattleAction(action.id, action.snapshot);
            action.target.click();
        }
        refreshWorkflowButton();
    }

    function markBattleAction(id, snapshot) {
        fightState.pending = { id, stage: snapshot.stage, progress: snapshot.progress, sawBusy: false,
            temporaryUsedBefore: fightState.temporaryUsed };
        if (id === 'temporary') {
            fightState.temporaryUsed = true;
            rememberFight();
        }
    }

    function trackBattleClick(event) {
        const snapshot = battleSnapshot();
        if (!snapshot.root?.contains(event.target)) return;
        syncFight(snapshot);
        let id = null;
        for (const [control, target] of snapshot.controls) {
            if (control !== 'continue' && target.contains(event.target) && isAvailable(target)) id = control;
        }
        if (!id && snapshot.stage === 'active') {
            const action = ACTIONS.find(item => item.weapon && weaponReady(weaponSlot(item.id, snapshot.root)) &&
                weaponSlot(item.id, snapshot.root).contains(event.target));
            id = action?.id;
        }
        if (id) battleClickCandidates.set(event, { id, snapshot });
    }

    function confirmBattleClick(event) {
        const candidate = battleClickCandidates.get(event);
        if (!candidate) return;
        battleClickCandidates.delete(event);
        // Attachment controls stop bubbling. Ammo-counter clicks in an active fight do bubble
        // into the weapon action, so they count as manual attacks just like its image does.
        if (!fightState.pending) markBattleAction(candidate.id, candidate.snapshot);
        scheduleWorkflowRefresh();
    }

    function scheduleWorkflowRefresh() {
        if (refreshScheduled) return;
        refreshScheduled = true;
        requestAnimationFrame(() => {
            refreshScheduled = false;
            refreshWorkflowButton();
        });
    }

    function observeAttackPage() {
        const connect = () => {
            const root = document.getElementById('attack-root');
            if (root === observedAttackRoot) return;
            attackObserver?.disconnect();
            observedAttackRoot = root;
            if (root) {
                attackObserver = new MutationObserver(() => {
                    // Observe loading before the next animation frame, including fast failed requests.
                    if (fightState.pending && Array.from(root.querySelectorAll(
                        '.loading, [aria-busy="true"], [class*="preloader___"], [class*="preloaderWrap___"]'
                    )).some(isVisible)) fightState.pending.sawBusy = true;
                    scheduleWorkflowRefresh();
                });
                attackObserver.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
                    attributeFilter: ['class', 'disabled', 'aria-disabled', 'aria-busy', 'aria-label', 'aria-describedby', 'hidden', 'style'] });
            }
            scheduleWorkflowRefresh();
        };
        connect();
        // React can mount or replace the root after the userscript starts. Ignore our own UI updates.
        new MutationObserver(connect).observe(document.body, { childList: true, subtree: true });
        document.addEventListener('click', trackBattleClick, true);
        document.addEventListener('click', confirmBattleClick);
    }

    function notify(message) {
        let toast = document.getElementById('tas-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'tas-toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
    }

    function closeTab() {
        try {
            window.close();
        } catch (error) {
            // A manager without the window.close grant may reject the request.
        }
        setTimeout(() => notify('Tab still open? Use Ctrl+W (Cmd+W on Mac).'), 900);
    }

    function isEditing(event) {
        const nodes = [...event.composedPath(), document.activeElement];
        return nodes.some(node => node instanceof Element &&
            (node.isContentEditable || node.closest('input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])')));
    }

    function consume(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function onKeyDown(event) {
        if (new URLSearchParams(location.search).get('sid') !== 'attack') return;
        if (settingsDialog?.open) {
            handleSettingsKey(event);
            return;
        }
        if (!settings.enabled || event.defaultPrevented || event.isComposing ||
            event.getModifierState('AltGraph') || isEditing(event)) return;
        if (blockingDialogOpen()) return;
        const binding = bindingFromEvent(event);
        if (!binding) return;
        const action = ACTIONS.find(item => bindingId(settings.bindings[item.id]) === bindingId(binding));
        if (!action) return;
        consume(event);
        // Consume repeats too: Enter/Space must not fall through to a focused page button.
        if (event.repeat) return;
        if (action.id === 'workflow') {
            performWorkflowAction();
            return;
        }
        if (action.id === 'closeTab') {
            closeTab();
            return;
        }
        // Resolve on each press so React replacing a slot never leaves a stale target.
        const target = actionTarget(action);
        if (target) target.click();
        else notify(action.label + ' is not available right now.');
    }

    function updateLauncher() {
        const launcher = document.getElementById('tas-launcher');
        if (launcher) {
            launcher.textContent = settings.enabled ? 'Shortcuts' : 'Shortcuts (off)';
            launcher.title = 'Configure attack keyboard shortcuts';
        }
        refreshWorkflowButton();
    }

    function ensureWorkflowLauncher() {
        if (document.getElementById('tas-workflow')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'tas-workflow';
        button.innerHTML = '<span class="tas-workflow-key"></span><span class="tas-workflow-copy">' +
            '<span class="tas-workflow-label"></span><span class="tas-workflow-detail"></span></span>';
        button.addEventListener('click', performWorkflowAction);
        button.addEventListener('keydown', event => {
            if (event.repeat && ['Enter', ' '].includes(event.key)) consume(event);
        });
        document.body.appendChild(button);
        refreshWorkflowButton();
    }

    function refreshWorkflowButton() {
        const button = document.getElementById('tas-workflow');
        if (!button) return;
        const hidden = !settings.enabled || !settings.workflow.enabled;
        if (button.hidden !== hidden) button.hidden = hidden;
        if (button.hidden) return;
        const action = nextWorkflowAction();
        const key = formatBinding(settings.bindings.workflow);
        const label = button.querySelector('.tas-workflow-label');
        const detail = button.querySelector('.tas-workflow-detail');
        const disabled = action.kind === 'wait' || action.kind === 'stop';
        if (label.textContent !== action.label) label.textContent = action.label;
        if (detail.textContent !== action.detail) detail.textContent = action.detail;
        const keyLabel = key === 'Unbound' ? 'Click' : key;
        const keyElement = button.querySelector('.tas-workflow-key');
        if (keyElement.textContent !== keyLabel) keyElement.textContent = keyLabel;
        if (button.disabled !== disabled) button.disabled = disabled;
        if (button.title !== action.detail) button.title = action.detail;
        const ariaLabel = 'One-button workflow: ' + action.label + '. ' + action.detail;
        if (button.getAttribute('aria-label') !== ariaLabel) button.setAttribute('aria-label', ariaLabel);
    }

    function settingsMessage(message) {
        settingsDialog.querySelector('.tas-message').textContent = message;
    }

    function renderBindings() {
        settingsDialog.querySelectorAll('[data-bind]').forEach(button => {
            const id = button.dataset.bind;
            button.textContent = recording === id ? 'Press a key…' : formatBinding(draft.bindings[id]);
            button.classList.toggle('tas-recording', recording === id);
            button.setAttribute('aria-pressed', String(recording === id));
        });
    }

    function selectSettingsTab(name) {
        recording = null;
        settingsDialog.dataset.tab = name;
        settingsDialog.querySelectorAll('[data-tab]').forEach(button => {
            const selected = button.dataset.tab === name;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        settingsDialog.querySelectorAll('[data-panel]').forEach(panel => {
            panel.hidden = panel.dataset.panel !== name;
        });
        renderBindings();
    }

    function renderWorkflowSettings() {
        settingsDialog.querySelectorAll('[data-workflow]').forEach(input => {
            const value = draft.workflow[input.dataset.workflow];
            if (input.type === 'checkbox') input.checked = value;
            else input.value = value;
        });
        const list = settingsDialog.querySelector('.tas-priority');
        draft.workflow.priority.forEach((entry, index) => {
            const row = list.querySelector('[data-category="' + entry.category + '"]');
            row.querySelector('[data-priority-enabled]').checked = entry.enabled;
            row.querySelector('.tas-rank').textContent = index + 1;
            row.querySelector('[data-move="up"]').disabled = index === 0;
            row.querySelector('[data-move="down"]').disabled = index === draft.workflow.priority.length - 1;
            row.classList.toggle('tas-priority-off', !entry.enabled);
            list.appendChild(row);
        });
    }

    function handleSettingsKey(event) {
        if (event.key === 'Escape') {
            consume(event);
            if (recording) {
                recording = null;
                renderBindings();
                settingsMessage('Binding unchanged.');
            } else settingsDialog.close();
            return;
        }
        if (event.key === 'Tab') {
            recording = null;
            renderBindings();
            return;
        }
        if (!recording) return;
        consume(event);
        if (event.repeat || event.isComposing || event.getModifierState('AltGraph')) return;
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
        const binding = ['Backspace', 'Delete'].includes(event.key) ? null : bindingFromEvent(event);
        if (!binding && !['Backspace', 'Delete'].includes(event.key)) {
            settingsMessage('Choose a letter, number, function key, arrow, or punctuation key.');
            return;
        }
        const conflict = binding && ACTIONS.find(action => action.id !== recording &&
            bindingId(draft.bindings[action.id]) === bindingId(binding));
        if (conflict) {
            settingsMessage(formatBinding(binding) + ' is already assigned to ' + conflict.label + '. Clear that binding first.');
            return;
        }
        draft.bindings[recording] = binding;
        recording = null;
        renderBindings();
        settingsMessage('Press Save to apply your bindings.');
    }

    function buildSettings() {
        settingsDialog = document.createElement('dialog');
        settingsDialog.id = 'tas-settings';
        settingsDialog.setAttribute('aria-labelledby', 'tas-title');
        settingsDialog.innerHTML = `
            <form method="dialog">
                <div class="tas-heading"><h2 id="tas-title">Attack shortcuts</h2>
                    <button type="button" data-command="close" aria-label="Close settings">×</button></div>
                <label class="tas-enabled"><input type="checkbox" name="enabled"> Enable keyboard shortcuts</label>
                <div class="tas-tabs" role="tablist" aria-label="Shortcut settings">
                    <button type="button" id="tas-tab-workflow" role="tab" data-tab="workflow" aria-controls="tas-panel-workflow" aria-selected="true">One button</button>
                    <button type="button" id="tas-tab-bindings" role="tab" data-tab="bindings" aria-controls="tas-panel-bindings" aria-selected="false" tabindex="-1">Bindings</button>
                </div>
                <section id="tas-panel-workflow" role="tabpanel" data-panel="workflow" aria-labelledby="tas-tab-workflow">
                    <label class="tas-enabled tas-workflow-enabled"><input type="checkbox" data-workflow="enabled"> Enable one-button workflow</label>
                    <div class="tas-keybar"><span>One button, every stage</span><div>
                        <button type="button" data-bind="workflow" aria-label="Change workflow shortcut"></button>
                        <button type="button" data-clear="workflow" aria-label="Clear workflow shortcut">Clear</button>
                    </div></div>
                    <p class="tas-help tas-key-help">Click the binding and press a key. Escape cancels; Backspace or Delete clears it.</p>
                    <ol class="tas-stages">
                        <li><span class="tas-stage-number">1</span><label class="tas-stage-body">Enter the fight
                            <select data-workflow="before" aria-label="Before battle"><option value="auto">Start or join when shown</option><option value="start">Start only</option><option value="join">Join only</option><option value="manual">Choose manually</option></select></label></li>
                        <li><span class="tas-stage-number">2</span><label class="tas-stage-body">Opening move
                            <select data-workflow="temporary" aria-label="Opening move"><option value="once">Temporary weapon, once if available</option><option value="skip">Skip temporary weapon</option></select></label></li>
                        <li><span class="tas-stage-number">3</span><div class="tas-stage-body"><span>During battle</span>
                            <p class="tas-priority-help">Each press uses the first available enabled entry.</p>
                            <ol class="tas-priority" aria-label="Weapon priority"></ol>
                            <label class="tas-ammo">Empty firearm<select data-workflow="emptyFirearm"><option value="reload">Reload before falling back</option><option value="skip">Skip to next priority</option></select></label>
                        </div></li>
                        <li><span class="tas-stage-number">4</span><label class="tas-stage-body">When you win
                            <select data-workflow="finish" aria-label="Finish action"><option value="leave">Leave</option><option value="mug">Mug</option><option value="hospitalize">Hospitalize</option><option value="manual">Choose manually</option></select></label></li>
                        <li><span class="tas-stage-number">5</span><label class="tas-stage-body">After a confirmed result
                            <select data-workflow="after" aria-label="After the result"><option value="close">Close tab on next press</option><option value="stay">Keep tab open</option></select></label></li>
                    </ol>
                    <p class="tas-help">One press performs one action. The workflow waits for each battle response.
                        Closing becomes available only after a confirmed result.</p>
                </section>
                <section id="tas-panel-bindings" role="tabpanel" data-panel="bindings" aria-labelledby="tas-tab-bindings" hidden>
                    <p class="tas-help">Click a binding, then press your new key. Ctrl, Alt, Shift and Meta combinations work too.
                        Escape cancels recording; Backspace or Delete clears it. Number row and numpad share bindings.</p>
                    <div class="tas-bindings"></div>
                    <p class="tas-help">Shortcuts pause while typing or while a dialog is open. Holding a key never repeats an attack.
                        Start, Join, Leave, Mug and Hospitalize work only when their buttons appear.
                        Close tab requires a script manager that supports closing tabs, such as Tampermonkey.</p>
                </section>
                <p class="tas-message" role="status" aria-live="polite"></p>
                <div class="tas-footer"><button type="button" data-command="reset">Restore defaults</button>
                    <span></span><button type="button" data-command="close">Cancel</button>
                    <button type="submit" class="tas-save">Save</button></div>
            </form>`;
        const rows = settingsDialog.querySelector('.tas-bindings');
        for (const action of ACTIONS) {
            const row = document.createElement('div');
            row.className = 'tas-row';
            if (['primary', 'leave', 'closeTab'].includes(action.id)) row.classList.add('tas-group');
            const label = document.createElement('span');
            label.id = 'tas-label-' + action.id;
            label.textContent = action.label;
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.bind = action.id;
            button.setAttribute('aria-labelledby', label.id + ' ' + 'tas-bind-' + action.id);
            button.id = 'tas-bind-' + action.id;
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.textContent = 'Clear';
            clear.setAttribute('aria-label', 'Clear ' + action.label + ' binding');
            clear.dataset.clear = action.id;
            row.append(label, button, clear);
            rows.appendChild(row);
        }
        settingsDialog.querySelectorAll('[data-bind]').forEach(button => button.addEventListener('click', () => {
            const action = ACTIONS.find(item => item.id === button.dataset.bind);
            recording = recording === action.id ? null : action.id;
            renderBindings();
            settingsMessage(recording ? 'Press a key for ' + action.label + ', or Escape to cancel.' : '');
        }));
        settingsDialog.querySelectorAll('[data-clear]').forEach(button => button.addEventListener('click', () => {
            recording = null;
            draft.bindings[button.dataset.clear] = null;
            renderBindings();
            settingsMessage('Press Save to apply your bindings.');
        }));
        const categoryNames = { melee: 'Melee', primary: 'Primary', secondary: 'Secondary', unarmed: 'Hand-to-hand' };
        for (const [category, name] of Object.entries(categoryNames)) {
            const row = document.createElement('li');
            row.className = 'tas-priority-row';
            row.dataset.category = category;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'tas-priority-' + category;
            checkbox.dataset.priorityEnabled = category;
            checkbox.setAttribute('aria-label', 'Enable ' + name);
            const rank = document.createElement('span');
            rank.className = 'tas-rank';
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = name;
            label.className = 'tas-priority-name';
            const body = document.createElement('div');
            body.className = 'tas-priority-body';
            body.appendChild(label);
            if (category === 'unarmed') {
                const select = document.createElement('select');
                select.dataset.workflow = 'unarmed';
                select.setAttribute('aria-label', 'Hand-to-hand attack');
                select.innerHTML = '<option value="punch">Fist (Punch)</option><option value="kick">Kick</option>';
                body.appendChild(select);
            }
            const moves = document.createElement('div');
            moves.className = 'tas-priority-moves';
            for (const direction of ['up', 'down']) {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.move = direction;
                button.textContent = direction === 'up' ? '↑' : '↓';
                button.setAttribute('aria-label', 'Move ' + name + ' ' + direction);
                button.addEventListener('click', () => {
                    const current = draft.workflow.priority.findIndex(entry => entry.category === category);
                    const target = current + (direction === 'up' ? -1 : 1);
                    if (target < 0 || target >= draft.workflow.priority.length) return;
                    [draft.workflow.priority[current], draft.workflow.priority[target]] =
                        [draft.workflow.priority[target], draft.workflow.priority[current]];
                    renderWorkflowSettings();
                    checkbox.focus();
                    settingsMessage('Press Save to apply your sequence.');
                });
                moves.appendChild(button);
            }
            checkbox.addEventListener('change', () => {
                draft.workflow.priority.find(entry => entry.category === category).enabled = checkbox.checked;
                row.classList.toggle('tas-priority-off', !checkbox.checked);
                settingsMessage('Press Save to apply your sequence.');
            });
            row.append(checkbox, rank, body, moves);
            settingsDialog.querySelector('.tas-priority').appendChild(row);
        }
        settingsDialog.querySelectorAll('[data-workflow]').forEach(input => input.addEventListener('change', () => {
            draft.workflow[input.dataset.workflow] = input.type === 'checkbox' ? input.checked : input.value;
            settingsMessage('Press Save to apply your sequence.');
        }));
        settingsDialog.querySelectorAll('[data-tab]').forEach(button => {
            button.addEventListener('click', () => selectSettingsTab(button.dataset.tab));
            button.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                consume(event);
                const name = event.key === 'Home' ? 'workflow' : event.key === 'End' ? 'bindings' :
                    button.dataset.tab === 'workflow' ? 'bindings' : 'workflow';
                selectSettingsTab(name);
                settingsDialog.querySelector('[data-tab="' + name + '"]').focus();
            });
        });
        settingsDialog.querySelectorAll('[data-command="close"]').forEach(button =>
            button.addEventListener('click', () => settingsDialog.close()));
        settingsDialog.querySelector('[data-command="reset"]').addEventListener('click', () => {
            draft = defaults();
            recording = null;
            settingsDialog.querySelector('[name="enabled"]').checked = draft.enabled;
            renderBindings();
            renderWorkflowSettings();
            settingsMessage('Defaults restored. Press Save to apply.');
        });
        settingsDialog.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            recording = null;
            renderBindings();
            draft.enabled = settingsDialog.querySelector('[name="enabled"]').checked;
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
            } catch (error) {
                settingsMessage('Could not save settings. Allow site storage and try again.');
                return;
            }
            settings = draft;
            resetWorkflowPending();
            updateLauncher();
            settingsDialog.close();
            notify('Attack shortcuts saved.');
        });
        settingsDialog.addEventListener('close', () => {
            recording = null;
            draft = null;
            previousFocus?.focus();
            refreshWorkflowButton();
        });
        document.body.appendChild(settingsDialog);
    }

    function openSettings() {
        if (settingsDialog?.open) return;
        if (!settingsDialog) buildSettings();
        previousFocus = document.activeElement;
        draft = JSON.parse(JSON.stringify(settings));
        recording = null;
        settingsDialog.querySelector('[name="enabled"]').checked = draft.enabled;
        settingsMessage('');
        renderBindings();
        renderWorkflowSettings();
        selectSettingsTab(settingsDialog.dataset.tab || 'workflow');
        settingsDialog.showModal();
    }

    function initialize() {
        const style = document.createElement('style');
        style.textContent = `
            #tas-launcher, #tas-settings, #tas-toast, #tas-workflow { font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
            #tas-launcher { position: fixed; right: 16px; bottom: 16px; z-index: 100000;
                border: 1px solid #666; border-radius: 6px; background: #282828; color: #eee;
                padding: 9px 14px; cursor: pointer; box-shadow: 0 2px 8px #0008; }
            #tas-workflow { display: flex; position: fixed; right: 16px; bottom: 62px; z-index: 100000;
                align-items: center; gap: 10px; width: 300px; max-width: calc(100vw - 32px); box-sizing: border-box;
                padding: 11px 12px; text-align: left; color: #fff; background: #446125; border: 1px solid #789a4d;
                border-radius: 6px; cursor: pointer; box-shadow: 0 2px 8px #0008; }
            #tas-workflow:disabled { color: #ddd; background: #333; border-color: #666; cursor: default; }
            #tas-workflow .tas-workflow-key { flex: 0 1 auto; max-width: 95px; padding: 3px 7px; border: 1px solid #aaa8;
                border-radius: 4px; font-size: 12px; overflow-wrap: anywhere; text-align: center; }
            #tas-workflow .tas-workflow-copy { display: grid; gap: 3px; flex: 1; min-width: 0; }
            #tas-workflow .tas-workflow-label { font-weight: bold; line-height: 1.35; }
            #tas-workflow .tas-workflow-detail { font-size: 11px; line-height: 1.35; color: #e0e6d8; }
            #tas-workflow:disabled .tas-workflow-detail { color: #bbb; }
            #tas-workflow[hidden] { display: none; }
            #tas-settings { color-scheme: dark; width: min(560px, calc(100vw - 24px)); max-height: calc(100vh - 32px);
                box-sizing: border-box; padding: 20px; border: 1px solid #666; border-radius: 10px;
                background: #202020; color: #eee; box-shadow: 0 10px 40px #0009; overflow-y: auto; }
            #tas-settings::backdrop { background: #000a; }
            #tas-settings * { box-sizing: border-box; }
            #tas-settings [hidden] { display: none !important; }
            #tas-settings form { margin: 0; }
            #tas-settings .tas-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
            #tas-settings h2 { font-size: 18px; color: #fff; margin: 0; padding: 0; line-height: 1.3; }
            #tas-settings button, #tas-settings select { font: inherit; color: #eee; background: #363636;
                border: 1px solid #666; border-radius: 5px; padding: 7px 10px; line-height: 1.2; }
            #tas-settings button { cursor: pointer; }
            #tas-settings button:disabled { opacity: .4; cursor: default; }
            #tas-settings select { width: 100%; min-width: 0; }
            #tas-settings button:hover, #tas-launcher:hover { background: #454545; }
            #tas-settings button:focus-visible, #tas-settings select:focus-visible, #tas-launcher:focus-visible,
            #tas-workflow:focus-visible { outline: 2px solid #b5d56a; outline-offset: 2px; }
            #tas-settings .tas-heading button { font-size: 22px; padding: 0 8px; }
            #tas-settings .tas-enabled { display: flex; align-items: center; gap: 8px; margin: 0; }
            #tas-settings input[type="checkbox"] { margin: 0; width: 16px; height: 16px; appearance: auto; accent-color: #789a4d; }
            #tas-settings .tas-tabs { display: flex; gap: 6px; margin: 16px 0; padding-bottom: 12px; border-bottom: 1px solid #484848; }
            #tas-settings .tas-tabs button[aria-selected="true"] { background: #446125; border-color: #789a4d; }
            #tas-settings .tas-workflow-enabled { margin-bottom: 14px; }
            #tas-settings .tas-keybar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
            #tas-settings .tas-keybar > div { display: flex; gap: 6px; }
            #tas-settings .tas-keybar [data-bind] { min-width: 90px; }
            #tas-settings .tas-key-help { margin-top: 8px; }
            #tas-settings .tas-stages { list-style: none; padding: 0; margin: 18px 0 0; }
            #tas-settings .tas-stages > li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px;
                padding-bottom: 15px; position: relative; }
            #tas-settings .tas-stages > li:not(:last-child)::before { content: ''; position: absolute; left: 13px;
                top: 28px; bottom: 0; width: 1px; background: #515151; }
            #tas-settings .tas-stage-number { width: 28px; height: 28px; border: 1px solid #666; border-radius: 50%;
                background: #303030; display: flex; justify-content: center; align-items: center; font-size: 12px; }
            #tas-settings .tas-stage-body { display: grid; gap: 5px; min-width: 0; line-height: 1.5; }
            #tas-settings .tas-priority-help { font-size: 12px; color: #bbb; margin: 0 0 3px; }
            #tas-settings .tas-priority { list-style: none; margin: 0; padding: 0 10px; border-radius: 5px; background: #303030; }
            #tas-settings .tas-priority-row { display: grid; grid-template-columns: 16px 14px minmax(0, 1fr) auto;
                gap: 8px; align-items: center; padding: 8px 0; }
            #tas-settings .tas-priority-row + .tas-priority-row { border-top: 1px solid #515151; }
            #tas-settings .tas-rank { font-size: 12px; color: #bbb; text-align: center; }
            #tas-settings .tas-priority-body { display: grid; gap: 5px; min-width: 0; }
            #tas-settings .tas-priority-body select { padding: 5px 7px; }
            #tas-settings .tas-priority-off .tas-priority-name { color: #999; }
            #tas-settings .tas-priority-moves { display: flex; gap: 4px; }
            #tas-settings .tas-priority-moves button { width: 29px; padding: 5px 0; }
            #tas-settings .tas-ammo { display: grid; gap: 5px; margin-top: 5px; }
            #tas-settings .tas-help { font-size: 12px; line-height: 1.5; color: #bbb; margin: 12px 0; }
            #tas-settings .tas-row { display: grid; grid-template-columns: minmax(85px, 1fr) minmax(100px, 1.3fr) auto;
                gap: 8px; align-items: center; padding: 4px 0; }
            #tas-settings .tas-group { margin-top: 8px; padding-top: 12px; border-top: 1px solid #484848; }
            #tas-settings .tas-recording { color: #d8f5a4; border-color: #b5d56a; background: #344123; }
            #tas-settings .tas-message { min-height: 18px; font-size: 12px; color: #d8f5a4; line-height: 1.5; margin: 10px 0; }
            #tas-settings .tas-footer { display: flex; align-items: center; gap: 8px; }
            #tas-settings .tas-footer span { flex: 1; }
            #tas-settings .tas-save { background: #446125; border-color: #789a4d; }
            #tas-toast { position: fixed; bottom: 176px; right: 16px; max-width: min(360px, calc(100vw - 32px));
                padding: 10px 14px; color: #eee; background: #222; border: 1px solid #777; border-radius: 6px;
                z-index: 100001; line-height: 1.4; box-shadow: 0 2px 8px #0008; }
            #tas-toast[hidden] { display: none; }
            @media (max-width: 480px) {
                #tas-settings { padding: 15px 12px; }
                #tas-settings .tas-stages > li { gap: 8px; }
                #tas-settings .tas-priority { padding: 0 7px; }
                #tas-settings .tas-priority-row { grid-template-columns: 16px minmax(0, 1fr) auto; gap: 7px; }
                #tas-settings .tas-rank { display: none; }
                #tas-settings select { font-size: 16px; }
                #tas-settings .tas-keybar { flex-wrap: wrap; }
                #tas-settings .tas-row { grid-template-columns: minmax(70px, 1fr) minmax(80px, 1.2fr) auto; gap: 6px; }
                #tas-settings .tas-footer { flex-wrap: wrap; }
                #tas-settings .tas-footer > span { min-width: 0; }
            }
            @media (pointer: coarse) {
                #tas-settings button, #tas-settings select, #tas-settings .tas-priority-name { min-height: 44px; }
                #tas-settings .tas-priority-name { display: flex; align-items: center; }
                #tas-settings .tas-priority-moves { flex-direction: column; }
                #tas-settings .tas-priority-moves button { width: 44px; }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
        const launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.id = 'tas-launcher';
        launcher.setAttribute('aria-haspopup', 'dialog');
        launcher.addEventListener('click', openSettings);
        document.body.appendChild(launcher);
        updateLauncher();
        ensureWorkflowLauncher();
        observeAttackPage();
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('storage', event => {
            if (event.key === STORAGE_KEY || event.key === null) {
                settings = readSettings();
                resetWorkflowPending();
                updateLauncher();
            }
        });
        try {
            GM_registerMenuCommand('Attack shortcut settings', openSettings);
        } catch (error) {
            // The on-page button is available in hosts without a userscript menu.
        }
    }

    if (document.body) initialize();
    else document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
