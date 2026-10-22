// ==UserScript==
// @name         Torn Quick Med Out
// @namespace    https://github.com/SOLiNARY
// @version      1.0.0
// @description  On the Items page, shows your hospital time and medical cooldown, works out which meds get you out of hospital for the least cooldown (faction armoury first), and uses the next one in one click. After an update, a "What's new" popup lists what changed.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT
// @match        https://www.torn.com/item.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "1.0.0";  // keep in sync with @version above
    const WHATS_NEW_NAME = "Quick Med Out";
    const WHATS_NEW_KEY = "silmaril-quick-med-out-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap. A release marked
    // `silent: true` is left out of that and never opens the popup by itself; it is listed
    // only when the popup is opened from the menu. Leaving the flag off means false.
    const CHANGELOG = [
        {
            version: "1.0.0",
            date: "2026-10-22",
            changes: [
            'New: when you are in hospital, a panel on the Items page shows your hospital time and medical cooldown, and the meds that get you out for the least cooldown.',
            'Each med in the plan shows how much hospital time it takes off and how much cooldown it adds.',
            'When sitting out a minute or so of hospital would save cooldown, that cheaper plan is offered too. How long you are willing to wait is a setting.',
            'One click uses the next med, taken from your faction armoury first and from your own items after.',
            'Pin the panel to keep it open out of hospital, and drag it anywhere on the screen. Both are remembered.',
            'After each med it checks the time and cooldown you really got, and offers to fix your settings when they are off.'
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
        GM_registerMenuCommand('Settings', function(){ openSettings(); });
    } catch (error) {
        // No menu host (an ungranted script, or Torn PDA). The popup still appears on update,
        // and the panel's own gear button opens the settings.
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
        // No stored version means a brand-new install, so the whole changelog is shown.
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


    // ---- Quick Med Out ---------------------------------------------------------------------

    const LOG_PREFIX = '[QuickMedOut]';
    const SETTINGS_KEY = 'silmaril-quick-med-out-settings';
    const UI_KEY = 'silmaril-quick-med-out-ui';
    const API_KEY_KEY = 'silmaril-quick-med-out-apikey';
    const ROOT_ID = 'silmaril-qmo';
    const STYLE_ID = 'silmaril-qmo-style';
    const MODAL_ID = 'silmaril-qmo-settings';

    const SIDEBAR_URL = '/sidebarAjaxAction.php?q=getSidebarData';
    const PERKS_URLS = [
        'https://api.torn.com/v2/user/perks?key={key}&comment=QuickMedOut',
        'https://api.torn.com/user/?selections=perks&key={key}&comment=QuickMedOut'
    ];
    // Torn's own cap before any faction upgrade. The live cap, faction upgrades included, comes
    // from the sidebar whenever a medical cooldown is running, and is remembered after that.
    const BASE_COOLDOWN_CAP = 6 * 3600;
    // The sidebar is watched for new status icons, so a hit lands in the panel straight away;
    // the poll is only the fallback for when Torn's sidebar misses an update.
    const POLL_MS = { hospital: 20000, idle: 60000, hidden: 180000 };
    const PERKS_REFRESH_MS = 12 * 3600 * 1000;

    // Base effects, as Torn's own item descriptions give them (checked 2026-10-22). Medical
    // item effectiveness scales the hospital time removed; only a cooldown cut changes the
    // cooldown added.
    const MEDS = {
        68: { name: 'Small First Aid Kit', hospital: 20, cooldown: 10 },
        67: { name: 'First Aid Kit', hospital: 40, cooldown: 15 },
        66: { name: 'Morphine', hospital: 70, cooldown: 20 }
    };
    const BLOOD_BAG = { name: 'Blood Bag', hospital: 120, cooldown: 30 };
    const BLOOD_BAGS = { 732: 'A+', 733: 'A-', 734: 'B+', 735: 'B-', 736: 'AB+', 737: 'AB-', 738: 'O+', 739: 'O-' };
    const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    // The bags each blood type can take. Any other bag causes a transfusion reaction that puts
    // the player back in hospital, so it is never suggested.
    const COMPATIBLE_BAGS = {
        'O+': [738, 739],
        'O-': [739],
        'A+': [732, 733, 738, 739],
        'A-': [733, 739],
        'B+': [734, 735, 738, 739],
        'B-': [735, 739],
        'AB+': [732, 733, 734, 735, 736, 737, 738, 739],
        'AB-': [733, 735, 737, 739]
    };
    const O_NEGATIVE = 739;

    const DEFAULT_SETTINGS = {
        bloodType: '',
        useArmoury: true,
        effectiveness: 0,
        // 'api' follows the perks read with the API key; typing a number makes it 'manual'.
        effectivenessSource: 'api',
        cooldownCut: 0,
        cooldownCutAuto: true,
        // Hospital time worth sitting through, in minutes, when that saves cooldown.
        waitMinutes: 1,
        knownCap: BASE_COOLDOWN_CAP,
        capFromSidebar: false,
        perksReadAt: 0
    };
    const DEFAULT_UI = { right: 10, top: 90, pinned: false };

    const settings = loadJson(SETTINGS_KEY, DEFAULT_SETTINGS);
    const ui = loadJson(UI_KEY, DEFAULT_UI);
    let apiKey = readApiKey();

    const state = {
        root: null,
        clockOffset: 0,
        hospitalUntil: null,
        hospitalReason: '',
        cooldownUntil: null,
        bookCut: 0,
        earlyDischarge: false,
        radiation: false,
        sidebarLoaded: false,
        sidebarBusy: null,
        stock: { faction: null, own: null },
        factionStatus: 'loading',
        stockBusy: null,
        armouryRefused: {},
        busy: false,
        nextStep: null,
        waitStep: null,
        message: null,
        calibration: null,
        reserve: null,
        openedByUser: false,
        hiddenThisStay: false,
        wasInHospital: false,
        planHtml: '',
        pollTimer: null
    };

    function start() {
        ensureStyle();
        buildPanel();
        render();
        refreshSidebar().then(function(){ return refreshStock(); });
        setInterval(tick, 1000);
        watchSidebar();
        schedulePoll();
        maybeRefreshPerks();
        window.addEventListener('resize', applyPosition);
        document.addEventListener('visibilitychange', function(){
            if (!document.hidden) {
                refreshSidebar();
            }
            schedulePoll();
        });
    }

    // ---- Storage ---------------------------------------------------------------------------

    function loadJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return Object.assign({}, fallback, raw ? JSON.parse(raw) : {});
        } catch (error) {
            return Object.assign({}, fallback);
        }
    }

    function saveJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            // A blocked localStorage only means the settings last until the page reloads.
        }
    }

    function readApiKey() {
        try {
            return localStorage.getItem(API_KEY_KEY) ?? '###PDA-APIKEY###';
        } catch (error) {
            return '###PDA-APIKEY###';
        }
    }

    // Torn PDA swaps the placeholder above for the player's own key when it injects the script.
    // Anywhere else an un-substituted placeholder is not a key.
    function hasApiKey() {
        return typeof apiKey === 'string' && apiKey.indexOf('PDA-APIKEY') === -1 && apiKey.length === 16;
    }

    // ---- Time ------------------------------------------------------------------------------

    function serverNow() {
        return Date.now() / 1000 + state.clockOffset;
    }

    function hospitalLeft() {
        return state.hospitalUntil ? Math.max(0, state.hospitalUntil - serverNow()) : 0;
    }

    function cooldownLeft() {
        return state.cooldownUntil ? Math.max(0, state.cooldownUntil - serverNow()) : 0;
    }

    function inHospital() {
        return hospitalLeft() > 0;
    }

    function cooldownCap() {
        return settings.knownCap || BASE_COOLDOWN_CAP;
    }

    function cooldownCut() {
        return settings.cooldownCutAuto ? state.bookCut : clamp(Number(settings.cooldownCut) || 0, 0, 90);
    }

    function effectiveness() {
        return clamp(Number(settings.effectiveness) || 0, 0, 200);
    }

    function clamp(value, low, high) {
        return Math.min(high, Math.max(low, value));
    }

    // ---- Reading Torn ----------------------------------------------------------------------

    function readRfcv() {
        const match = document.cookie.match(/(?:^|;\s*)rfc_v=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    // The page itself already says whether you are in hospital, so the panel can open before
    // the first sidebar read comes back.
    function readBannerFallback() {
        const banner = document.getElementById('topHeaderBanner');
        const until = banner ? parseInt(banner.getAttribute('data-hospital'), 10) : NaN;
        if (until > Date.now() / 1000) {
            state.hospitalUntil = until;
        }
    }

    async function tornGet(url) {
        const separator = url.indexOf('?') === -1 ? '?' : '&';
        const response = await fetch(url + separator + 'rfcv=' + encodeURIComponent(readRfcv()), {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        return response.json();
    }

    async function tornPost(path, fields) {
        const response = await fetch(path + '?rfcv=' + encodeURIComponent(readRfcv()), {
            method: 'POST',
            body: new URLSearchParams(fields),
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (error) {
            // Torn answers a stale page token with an HTML page rather than JSON.
            throw new Error('Torn sent an unexpected reply. Reload the page and try again.');
        }
    }

    // The sidebar feed carries exact expiry times for the hospital stay and the medical
    // cooldown, the cooldown cap with faction upgrades, and the book being read.
    function refreshSidebar() {
        if (state.sidebarBusy) {
            return state.sidebarBusy;
        }
        state.sidebarBusy = tornGet(SIDEBAR_URL)
            .then(applySidebar)
            .catch(function(error){ console.warn(LOG_PREFIX, 'Sidebar read failed:', error); })
            .finally(function(){
                state.sidebarBusy = null;
                updateReserve();
                render();
            });
        return state.sidebarBusy;
    }

    function applySidebar(data) {
        const icons = (data && data.statusIcons && data.statusIcons.icons) || {};
        for (const key in icons) {
            if (icons[key] && icons[key].serverTimestamp) {
                state.clockOffset = icons[key].serverTimestamp - Date.now() / 1000;
                break;
            }
        }
        const hospital = icons.hospital;
        state.hospitalUntil = hospital && hospital.timerExpiresAt ? hospital.timerExpiresAt : null;
        state.hospitalReason = hospital && hospital.subtitle ? htmlToText(hospital.subtitle) : '';
        const medical = icons.medical_cooldown;
        state.cooldownUntil = medical && medical.timerExpiresAt ? medical.timerExpiresAt : null;
        const cap = medical ? parseClock(medical.factionUpgrade) : 0;
        if (cap > 0 && (cap !== settings.knownCap || !settings.capFromSidebar)) {
            settings.knownCap = cap;
            settings.capFromSidebar = true;
            saveJson(SETTINGS_KEY, settings);
        }
        const bookText = icons.book && icons.book.subtitle ? htmlToText(icons.book.subtitle) : '';
        const bookMatch = bookText.match(/medical cooldowns?\D{0,20}?(\d+)\s*%/i);
        state.bookCut = bookMatch ? clamp(parseInt(bookMatch[1], 10), 0, 90) : 0;
        state.earlyDischarge = false;
        state.radiation = /radiation/i.test(state.hospitalReason);
        for (const key in icons) {
            const label = key + ' ' + ((icons[key] && icons[key].title) || '');
            if (/discharge/i.test(label)) {
                state.earlyDischarge = true;
            }
            if (/radiation/i.test(label)) {
                state.radiation = true;
            }
        }
        state.sidebarLoaded = true;
        noticeHospitalChange();
    }

    function noticeHospitalChange() {
        const now = inHospital();
        if (now === state.wasInHospital) {
            return;
        }
        state.wasInHospital = now;
        // A new stay opens the panel again even if it was hidden during the last one, and gives
        // the armoury another chance.
        state.hiddenThisStay = false;
        if (now) {
            state.armouryRefused = {};
            refreshStock();
        } else if (state.message && state.message.kind === 'ok') {
            state.message = { kind: 'ok', text: state.message.text + ' You are out of hospital.' };
        }
        applyVisibility();
    }

    function refreshStock() {
        if (state.stockBusy) {
            return state.stockBusy;
        }
        state.stockBusy = Promise.all([readOwnMeds(), readArmouryMeds()])
            .then(function(results){
                state.stock.own = results[0];
                state.stock.faction = results[1];
                state.factionStatus = results[1] ? 'ok' : 'none';
            })
            .finally(function(){
                state.stockBusy = null;
                updateReserve();
                render();
            });
        return state.stockBusy;
    }

    // Torn hands out the whole Medical category whichever tab is open, so the panel does not
    // depend on the player having the Medical tab selected.
    async function readOwnMeds() {
        const stock = {};
        try {
            let start = 0;
            for (let page = 0; page < 5; page++) {
                const data = await tornPost('/item.php', { step: 'getCategoryList', itemName: 'Medical', start: String(start) });
                const list = Array.isArray(data.list) ? data.list : [];
                for (const entry of list) {
                    const id = parseInt(entry.ID ?? entry.itemID, 10);
                    stock[id] = (stock[id] || 0) + (parseInt(entry.Qty, 10) || 0);
                }
                start += list.length;
                if (list.length === 0 || !(data.total > start)) {
                    break;
                }
            }
        } catch (error) {
            console.warn(LOG_PREFIX, 'Reading your meds failed:', error);
        }
        return stock;
    }

    // Returns null when there is no armoury to draw from: no faction, or no right to use its
    // medical items. Entries loaned out to other members come back unusable and are skipped.
    async function readArmouryMeds() {
        try {
            const data = await tornPost('/factions.php', { step: 'armouryTabContent', type: 'medical', start: '0' });
            if (!data || !Array.isArray(data.items)) {
                return null;
            }
            const stock = {};
            let usable = false;
            for (const item of data.items) {
                if (!item.itemActions || item.itemActions.use !== true) {
                    continue;
                }
                const id = parseInt(item.itemID ?? item.item, 10);
                stock[id] = (stock[id] || 0) + (parseInt(item.qty, 10) || 0);
                usable = true;
            }
            return usable ? stock : null;
        } catch (error) {
            console.warn(LOG_PREFIX, 'Reading the faction armoury failed:', error);
            return null;
        }
    }

    // Torn's sidebar redraws its status icons as soon as anything changes: a hit, a revive, a
    // med used from another tab. Reading the feed again then keeps the panel live without a
    // tight poll.
    function watchSidebar() {
        const target = document.getElementById('sidebarroot') || document.getElementById('sidebar');
        if (!target || typeof MutationObserver !== 'function') {
            return;
        }
        let timer = null;
        new MutationObserver(function(mutations){
            const relevant = mutations.some(function(mutation){
                const node = mutation.target;
                return node && node.closest && node.closest('[class*="statusIcons"]');
            });
            if (!relevant) {
                return;
            }
            clearTimeout(timer);
            timer = setTimeout(refreshSidebar, 600);
        }).observe(target, { childList: true, subtree: true });
    }

    function schedulePoll() {
        clearTimeout(state.pollTimer);
        const delay = document.hidden ? POLL_MS.hidden : (inHospital() || panelOpen() ? POLL_MS.hospital : POLL_MS.idle);
        state.pollTimer = setTimeout(function(){
            refreshSidebar().finally(schedulePoll);
        }, delay);
    }

    // ---- Perks from the Torn API -----------------------------------------------------------

    function maybeRefreshPerks() {
        if (!hasApiKey() || settings.effectivenessSource !== 'api') {
            return;
        }
        if (Date.now() - (settings.perksReadAt || 0) < PERKS_REFRESH_MS) {
            return;
        }
        readPerks(apiKey).then(applyPerks).catch(function(error){
            console.warn(LOG_PREFIX, 'Reading perks failed:', error);
        });
    }

    async function readPerks(key) {
        let lastError = null;
        for (const template of PERKS_URLS) {
            try {
                const response = await fetch(template.replace('{key}', encodeURIComponent(key)));
                const data = await response.json();
                if (data && data.error) {
                    const code = data.error.code;
                    lastError = new Error(data.error.error || ('API error ' + code));
                    // Key problems are the same on every API version, so there is no point
                    // asking the older one.
                    if ([1, 2, 10, 13, 16, 18].indexOf(code) !== -1) {
                        throw lastError;
                    }
                    continue;
                }
                return parsePerks(collectStrings(data));
            } catch (error) {
                lastError = error;
                if (/key|access|inactive|paused|owner/i.test(error.message)) {
                    break;
                }
            }
        }
        throw lastError || new Error('No answer from the Torn API');
    }

    // Perk lists come back as plain sentences, grouped differently by each API version, so the
    // strings are gathered wherever they sit and read by wording alone.
    function collectStrings(value, out) {
        out = out || [];
        if (typeof value === 'string') {
            out.push(value);
        } else if (Array.isArray(value)) {
            value.forEach(function(item){ collectStrings(item, out); });
        } else if (value && typeof value === 'object') {
            Object.keys(value).forEach(function(key){ collectStrings(value[key], out); });
        }
        return out;
    }

    function parsePerks(lines) {
        let effectivenessBonus = 0;
        let capMinutes = 0;
        for (const line of lines) {
            const effect = line.match(/(\d+(?:\.\d+)?)\s*%\s*(?:extra\s+)?medical item effectiveness/i);
            if (effect) {
                effectivenessBonus += parseFloat(effect[1]);
            }
            const minutes = line.match(/(\d+)\s*minutes?\s+(?:of\s+)?(?:extra\s+)?maximum medical cooldown/i);
            const hours = line.match(/(\d+(?:\.\d+)?)\s*hours?\s+(?:of\s+)?(?:extra\s+)?maximum medical cooldown/i);
            if (minutes) {
                capMinutes += parseInt(minutes[1], 10);
            } else if (hours) {
                capMinutes += Math.round(parseFloat(hours[1]) * 60);
            }
        }
        return { effectiveness: Math.round(effectivenessBonus), capMinutes: capMinutes };
    }

    function applyPerks(perks) {
        settings.effectiveness = perks.effectiveness;
        settings.effectivenessSource = 'api';
        settings.perksReadAt = Date.now();
        // The sidebar's own figure wins; the perks only stand in until it has been seen.
        if (!settings.capFromSidebar) {
            settings.knownCap = BASE_COOLDOWN_CAP + perks.capMinutes * 60;
        }
        saveJson(SETTINGS_KEY, settings);
        updateReserve();
        render();
    }

    // ---- Planning --------------------------------------------------------------------------

    function bagOrder(bloodType) {
        const own = Number(Object.keys(BLOOD_BAGS).find(function(id){ return BLOOD_BAGS[id] === bloodType; }));
        // Your own type first. O- goes last: it suits everyone, so it is the bag the faction
        // can least spare.
        const rank = function(id){ return id === own ? 0 : (id === O_NEGATIVE ? 2 : 1); };
        return COMPATIBLE_BAGS[bloodType].slice().sort(function(a, b){ return rank(a) - rank(b); });
    }

    function factionQty(id) {
        if (!settings.useArmoury || !state.stock.faction || state.armouryRefused[id]) {
            return 0;
        }
        return state.stock.faction[id] || 0;
    }

    function ownQty(id) {
        return state.stock.own ? (state.stock.own[id] || 0) : 0;
    }

    // One group per med that behaves differently. Every bag the player can take does the same
    // thing, so they share a group and the actual bag is chosen only when it is used.
    function buildGroups() {
        const bonus = 1 + effectiveness() / 100;
        const cut = 1 - cooldownCut() / 100;
        const groups = [];
        const add = function(key, label, base, ids){
            let faction = 0;
            let own = 0;
            for (const id of ids) {
                faction += factionQty(id);
                own += ownQty(id);
            }
            if (faction + own <= 0) {
                return;
            }
            groups.push({
                key: key,
                label: label,
                base: base,
                ids: ids,
                faction: faction,
                own: own,
                total: faction + own,
                hospital: base.hospital * 60 * bonus,
                cooldown: base.cooldown * 60 * cut
            });
        };
        [68, 67, 66].forEach(function(id){ add(String(id), MEDS[id].name, MEDS[id], [id]); });
        if (COMPATIBLE_BAGS[settings.bloodType]) {
            add('blood', BLOOD_BAG.name, BLOOD_BAG, bagOrder(settings.bloodType));
        }
        return groups;
    }

    // Finds the meds that clear `remaining` seconds of hospital for the least cooldown. Torn
    // lets a med through while the cooldown is under the cap, even when that med then pushes it
    // over, so a plan fits when everything except its biggest med stays under the cap: `budget`
    // is the cap minus the cooldown already running. Ties go to fewer of the player's own items
    // (the armoury is used first), then fewer clicks. When nothing clears it all, `partial` is
    // the plan that clears the most. An infinite `remaining` measures the reserve.
    function planMedOut(groups, remaining, budget) {
        const result = { full: null, partial: null };
        if (budget <= 0 || groups.length === 0) {
            return result;
        }
        const bounds = groups.map(function(group){
            let bound = Math.min(group.total, Math.floor(budget / group.cooldown) + 1);
            if (Number.isFinite(remaining)) {
                bound = Math.min(bound, Math.ceil(remaining / group.hospital));
            }
            return Math.max(0, bound);
        });
        const counts = groups.map(function(){ return 0; });
        const EPSILON = 1e-6;

        const describe = function(cleared, cooldown){
            let own = 0;
            let clicks = 0;
            groups.forEach(function(group, index){
                own += Math.max(0, counts[index] - group.faction);
                clicks += counts[index];
            });
            return { counts: counts.slice(), cleared: cleared, cooldown: cooldown, own: own, clicks: clicks };
        };
        const better = function(keys, candidate, current){
            for (const key of keys) {
                const sign = key.charAt(0) === '-' ? -1 : 1;
                const name = sign === -1 ? key.slice(1) : key;
                const difference = (candidate[name] - current[name]) * sign;
                if (Math.abs(difference) > EPSILON) {
                    return difference < 0;
                }
            }
            return false;
        };
        const walk = function(index, cleared, cooldown, biggest){
            if (index === groups.length) {
                if (cleared > 0) {
                    const plan = describe(cleared, cooldown);
                    if (!result.partial || better(['-cleared', 'cooldown', 'own', 'clicks'], plan, result.partial)) {
                        result.partial = plan;
                    }
                }
                return;
            }
            const group = groups[index];
            for (let n = 0; n <= bounds[index]; n++) {
                const cost = cooldown + n * group.cooldown;
                const top = n > 0 ? Math.max(biggest, group.cooldown) : biggest;
                // Adding meds never brings "everything but the biggest" back under the cap.
                if (n > 0 && cost - top >= budget - EPSILON) {
                    break;
                }
                counts[index] = n;
                const total = cleared + n * group.hospital;
                if (total >= remaining - EPSILON) {
                    const plan = describe(total, cost);
                    if (!result.full || better(['cooldown', 'own', 'clicks', 'cleared'], plan, result.full)) {
                        result.full = plan;
                    }
                    // Any more of this med only adds cooldown.
                    break;
                }
                walk(index + 1, total, cost, top);
            }
            counts[index] = 0;
        };
        walk(0, 0, 0, 0);
        return result;
    }

    // Smallest cooldown first, so the biggest med is the last one: the one allowed to cross
    // the cap.
    function planSteps(groups, plan) {
        const steps = [];
        groups.forEach(function(group, index){
            for (let n = 0; n < plan.counts[index]; n++) {
                steps.push(index);
            }
        });
        steps.sort(function(a, b){
            return groups[a].cooldown - groups[b].cooldown || groups[b].hospital - groups[a].hospital;
        });
        return steps;
    }

    function pickSource(group) {
        for (const id of group.ids) {
            if (factionQty(id) > 0) {
                return { id: id, armoury: true };
            }
        }
        for (const id of group.ids) {
            if (ownQty(id) > 0) {
                return { id: id, armoury: false };
            }
        }
        return null;
    }

    function updateReserve() {
        if (state.stock.own == null) {
            return;
        }
        const plan = planMedOut(buildGroups(), Infinity, cooldownCap() - cooldownLeft());
        state.reserve = plan.partial ? plan.partial.cleared : 0;
        state.reserveAt = Date.now();
    }

    // ---- Using a med -----------------------------------------------------------------------

    // `which` is 'next' for the plan that gets you out, 'wait' for the cheaper one that leaves a
    // little hospital time.
    async function useNext(which) {
        const step = which === 'wait' ? state.waitStep : state.nextStep;
        if (state.busy || !step) {
            return;
        }
        state.busy = true;
        state.message = { kind: 'info', text: 'Using ' + itemName(step.source.id) + '…' };
        state.calibration = null;
        render();
        const before = { hospitalUntil: state.hospitalUntil, cooldownUntil: state.cooldownUntil, at: serverNow() };
        const used = {
            name: itemName(step.source.id),
            base: step.group.base,
            hospital: step.group.hospital,
            cooldown: step.group.cooldown
        };
        let result;
        try {
            const fields = step.source.armoury
                ? { step: 'useItem', fac: '1', itemID: String(step.source.id) }
                : { step: 'useItem', id: String(step.source.id), itemID: String(step.source.id) };
            const data = await tornPost('/item.php', fields);
            result = { success: data.success === true, text: htmlToText(data.text || data.error || '') };
        } catch (error) {
            result = { success: false, text: error.message };
        }
        if (result.success) {
            const pool = step.source.armoury ? state.stock.faction : state.stock.own;
            if (pool && pool[step.source.id] > 0) {
                pool[step.source.id] -= 1;
            }
            state.message = { kind: 'ok', text: result.text || ('Used ' + used.name + '.') };
            // A poll already in flight was sent before the med and would report the old times.
            if (state.sidebarBusy) {
                await state.sidebarBusy;
            }
            await refreshSidebar();
            checkCalibration(before, used);
        } else {
            // A refusal that names the armoury means this item cannot come from there; the next
            // click takes it from the player's own items instead.
            if (step.source.armoury && /faction|armou?ry|permission/i.test(result.text)) {
                state.armouryRefused[step.source.id] = true;
            }
            state.message = { kind: 'bad', text: result.text || 'Torn did not accept that.' };
            refreshStock();
        }
        state.busy = false;
        updateReserve();
        render();
    }

    // Compares what the med really did with what the settings predicted. The hospital and
    // cooldown are both absolute expiry times, so the gap between reads does not matter; a hit
    // or revive in between shows up as a nonsense difference and is ignored.
    function checkCalibration(before, used) {
        const notes = [];
        const changes = {};
        if (before.hospitalUntil && state.hospitalUntil && before.hospitalUntil > before.at) {
            const cleared = before.hospitalUntil - state.hospitalUntil;
            if (cleared > 0 && cleared < used.hospital * 3 && Math.abs(cleared - used.hospital) > Math.max(90, used.hospital * 0.05)) {
                const implied = clamp(Math.round((cleared / (used.base.hospital * 60) - 1) * 100), 0, 200);
                if (implied !== effectiveness()) {
                    changes.effectiveness = implied;
                    notes.push(used.name + ' took ' + formatAmount(cleared) + ' off your hospital time, but your settings expected ' +
                        formatAmount(used.hospital) + '. That fits +' + implied + '% medical item effectiveness (settings: +' + effectiveness() + '%).');
                }
            }
        }
        if (state.cooldownUntil) {
            const startedAt = Math.max(before.cooldownUntil || 0, before.at);
            const added = state.cooldownUntil - startedAt;
            const baseCooldown = used.base.cooldown * 60;
            if (added > 0 && added < baseCooldown * 3 && Math.abs(added - used.cooldown) > Math.max(60, used.cooldown * 0.05)) {
                const implied = clamp(Math.round((1 - added / baseCooldown) * 20) * 5, 0, 90);
                if (implied !== cooldownCut()) {
                    changes.cooldownCut = implied;
                    notes.push(used.name + ' added ' + formatAmount(added) + ' of medical cooldown, but your settings expected ' +
                        formatAmount(used.cooldown) + '. That fits a ' + implied + '% cooldown cut (settings: ' + cooldownCut() + '%).');
                }
            }
        }
        state.calibration = notes.length > 0 ? { notes: notes, changes: changes } : null;
    }

    function applyCalibration() {
        const changes = state.calibration ? state.calibration.changes : {};
        if (changes.effectiveness != null) {
            settings.effectiveness = changes.effectiveness;
            settings.effectivenessSource = 'manual';
        }
        if (changes.cooldownCut != null) {
            settings.cooldownCut = changes.cooldownCut;
            settings.cooldownCutAuto = false;
        }
        saveJson(SETTINGS_KEY, settings);
        state.calibration = null;
        updateReserve();
        render();
    }

    function itemName(id) {
        if (MEDS[id]) {
            return MEDS[id].name;
        }
        return BLOOD_BAGS[id] ? 'Blood Bag : ' + BLOOD_BAGS[id] : 'item ' + id;
    }

    // ---- Panel -----------------------------------------------------------------------------

    const ICONS = {
        cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z"/></svg>',
        refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>',
        gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 13.93 2h-3.84a.48.48 0 0 0-.47.41l-.36 2.54a7.3 7.3 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58a6.9 6.9 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.5.5 0 0 0-.12-.61zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>',
        pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5a3 3 0 0 1-3 3v2h5.97v7l1 1 1-1v-7H19v-2a3 3 0 0 1-3-3z"/></svg>',
        collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5z"/></svg>',
        expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>',
        move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>'
    };

    function buildPanel() {
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML =
            '<div class="qmo-head">' +
                '<span class="qmo-logo" data-qmo="toggle">' + ICONS.cross + '</span>' +
                '<span class="qmo-title" data-qmo="toggle">Med Out</span>' +
                '<span class="qmo-mini" data-qmo="toggle"></span>' +
                '<span class="qmo-tools">' +
                    '<button type="button" class="qmo-btn qmo-refresh" data-qmo="refresh" title="Read again" aria-label="Read again">' + ICONS.refresh + '</button>' +
                    '<button type="button" class="qmo-btn qmo-gear" data-qmo="settings" title="Settings" aria-label="Settings">' + ICONS.gear + '</button>' +
                    '<button type="button" class="qmo-btn qmo-pin" data-qmo="pin" title="Keep open out of hospital" aria-label="Keep open">' + ICONS.pin + '</button>' +
                    '<button type="button" class="qmo-btn qmo-toggle" data-qmo="toggle"></button>' +
                    '<button type="button" class="qmo-btn qmo-drag" title="Drag to move" aria-label="Drag to move">' + ICONS.move + '</button>' +
                '</span>' +
            '</div>' +
            '<div class="qmo-body">' +
                '<div class="qmo-stats">' +
                    '<div class="qmo-stat qmo-hosp"><span class="qmo-label">Hospital</span><span class="qmo-value"></span><span class="qmo-sub"></span></div>' +
                    '<div class="qmo-stat qmo-cd"><span class="qmo-label">Med cooldown</span><span class="qmo-value"></span>' +
                        '<span class="qmo-bar"><i></i></span></div>' +
                '</div>' +
                '<div class="qmo-plan"></div>' +
                '<div class="qmo-msg"></div>' +
                '<div class="qmo-cal"></div>' +
                '<div class="qmo-foot" data-qmo="settings" title="Settings"></div>' +
            '</div>';
        document.body.appendChild(root);
        state.root = root;
        // One delegated listener, so the plan can be redrawn without losing its buttons.
        root.addEventListener('click', function(event){
            const target = event.target.closest('[data-qmo]');
            if (!target || !root.contains(target)) {
                return;
            }
            const action = target.getAttribute('data-qmo');
            if (action === 'toggle') {
                togglePanel();
            } else if (action === 'refresh') {
                state.message = null;
                state.armouryRefused = {};
                refreshSidebar();
                refreshStock();
            } else if (action === 'settings') {
                openSettings();
            } else if (action === 'pin') {
                ui.pinned = !ui.pinned;
                saveJson(UI_KEY, ui);
                applyVisibility();
            } else if (action === 'use') {
                useNext('next');
            } else if (action === 'use-wait') {
                useNext('wait');
            } else if (action === 'apply-calibration') {
                applyCalibration();
            } else if (action === 'dismiss-calibration') {
                state.calibration = null;
                render();
            }
        });
        root.querySelector('.qmo-drag').addEventListener('pointerdown', startDrag);
        applyVisibility();
    }

    function panelOpen() {
        return ui.pinned || state.openedByUser || (inHospital() && !state.hiddenThisStay);
    }

    function togglePanel() {
        if (panelOpen()) {
            // Hiding is also how a pinned panel is let go of.
            ui.pinned = false;
            saveJson(UI_KEY, ui);
            state.openedByUser = false;
            if (inHospital()) {
                state.hiddenThisStay = true;
            }
        } else {
            state.openedByUser = true;
            state.hiddenThisStay = false;
        }
        applyVisibility();
    }

    function applyVisibility() {
        const root = state.root;
        if (!root) {
            return;
        }
        const open = panelOpen();
        root.classList.toggle('qmo-collapsed', !open);
        const toggle = root.querySelector('.qmo-toggle');
        toggle.innerHTML = open ? ICONS.collapse : ICONS.expand;
        toggle.title = open ? 'Hide' : 'Show';
        toggle.setAttribute('aria-label', toggle.title);
        const pin = root.querySelector('.qmo-pin');
        pin.classList.toggle('qmo-on', !!ui.pinned);
        pin.title = ui.pinned ? 'Pinned: stays open out of hospital' : 'Keep open out of hospital';
        pin.setAttribute('aria-pressed', ui.pinned ? 'true' : 'false');
        state.planHtml = '';
        render();
        applyPosition();
        schedulePoll();
    }

    // The panel is placed by its right edge, so hiding and showing it, which changes its
    // width, leaves the controls under the finger.
    function applyPosition() {
        const root = state.root;
        if (!root) {
            return;
        }
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const width = root.offsetWidth;
        const right = clamp(Number(ui.right) || 0, 0, Math.max(0, viewportWidth - width));
        const top = clamp(Number(ui.top) || 0, 0, Math.max(0, window.innerHeight - 44));
        root.style.right = right + 'px';
        root.style.top = top + 'px';
    }

    // Pointer events cover mouse and touch alike, which a phone and Torn PDA need.
    function startDrag(event) {
        if (event.button != null && event.button !== 0) {
            return;
        }
        event.preventDefault();
        const root = state.root;
        const handle = event.currentTarget;
        const rect = root.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        try {
            handle.setPointerCapture(event.pointerId);
        } catch (error) {
            // Older webviews move the panel fine without capture, just less smoothly.
        }
        root.classList.add('qmo-dragging');
        const move = function(moveEvent){
            const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
            const left = clamp(moveEvent.clientX - offsetX, 0, Math.max(0, viewportWidth - rect.width));
            ui.right = viewportWidth - left - rect.width;
            ui.top = clamp(moveEvent.clientY - offsetY, 0, Math.max(0, window.innerHeight - 44));
            applyPosition();
        };
        const end = function(){
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', end);
            handle.removeEventListener('pointercancel', end);
            root.classList.remove('qmo-dragging');
            saveJson(UI_KEY, ui);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    function tick() {
        noticeHospitalChange();
        // The cooldown drains every second, so the reserve grows with it.
        if (Date.now() - (state.reserveAt || 0) > 30000) {
            updateReserve();
        }
        render();
    }

    function render() {
        const root = state.root;
        if (!root) {
            return;
        }
        const hospital = hospitalLeft();
        const cooldown = cooldownLeft();
        const cap = cooldownCap();

        const mini = root.querySelector('.qmo-mini');
        mini.textContent = (hospital > 0 ? 'Hosp ' + formatClock(hospital) + ' · ' : '') + 'CD ' + formatClock(cooldown);
        root.classList.toggle('qmo-in-hospital', hospital > 0);

        const hospitalBox = root.querySelector('.qmo-hosp');
        hospitalBox.classList.toggle('qmo-active', hospital > 0);
        hospitalBox.querySelector('.qmo-value').textContent = hospital > 0 ? formatClock(hospital) : 'Out';
        const reason = hospitalBox.querySelector('.qmo-sub');
        reason.textContent = hospital > 0 ? state.hospitalReason : (state.sidebarLoaded ? 'Not in hospital' : 'Reading…');
        reason.title = reason.textContent;

        const cooldownBox = root.querySelector('.qmo-cd');
        cooldownBox.querySelector('.qmo-value').innerHTML = escapeHtml(formatClock(cooldown)) +
            ' <small>/ ' + escapeHtml(formatClock(cap)) + '</small>';
        cooldownBox.querySelector('.qmo-bar').classList.toggle('qmo-full', cooldown >= cap);
        cooldownBox.querySelector('.qmo-bar i').style.width = Math.min(100, cooldown / cap * 100).toFixed(1) + '%';

        // The plan is only redrawn when it changes. Its running clocks are filled in below, so a
        // button is never swapped out from under a click just because a second went by.
        const planBox = root.querySelector('.qmo-plan');
        const planHtml = buildPlanHtml(hospital, cooldown, cap);
        if (planHtml !== state.planHtml) {
            state.planHtml = planHtml;
            planBox.innerHTML = planHtml;
        }
        planBox.querySelectorAll('.qmo-live').forEach(function(span){
            const value = Number(span.getAttribute('data-value')) || 0;
            const kind = span.getAttribute('data-live');
            let text = '';
            if (kind === 'cooldown-after') {
                text = formatClock(cooldown + value);
            } else if (kind === 'wait') {
                text = formatClock(hospital - value);
            } else if (kind === 'stays') {
                text = formatAmount(hospital - value);
            } else if (kind === 'unlock') {
                text = formatAmount(cooldown - cap);
            }
            if (span.textContent !== text) {
                span.textContent = text;
            }
        });

        const message = root.querySelector('.qmo-msg');
        message.className = 'qmo-msg' + (state.message ? ' qmo-' + state.message.kind : '');
        message.textContent = state.message ? state.message.text : '';

        const calibration = root.querySelector('.qmo-cal');
        const calibrationHtml = state.calibration
            ? '<div class="qmo-warn">' + state.calibration.notes.map(function(note){ return '<p>' + escapeHtml(note) + '</p>'; }).join('') +
                  '<div class="qmo-warn-actions">' +
                      '<button type="button" class="qmo-small qmo-primary" data-qmo="apply-calibration">Use these settings</button>' +
                      '<button type="button" class="qmo-small" data-qmo="dismiss-calibration">Ignore</button>' +
                  '</div></div>'
            : '';
        if (calibration.innerHTML !== calibrationHtml) {
            calibration.innerHTML = calibrationHtml;
        }

        const foot = root.querySelector('.qmo-foot');
        const footText = '+' + effectiveness() + '% effectiveness · ' + cooldownCut() + '% cooldown cut' +
            (settings.cooldownCutAuto && state.bookCut > 0 ? ' (book)' : '') +
            ' · blood ' + (settings.bloodType || 'not set') +
            ' · armoury ' + (!settings.useArmoury ? 'off' : (state.factionStatus === 'ok' ? 'on' : (state.factionStatus === 'none' ? 'no access' : '…')));
        if (foot.textContent !== footText) {
            foot.textContent = footText;
        }
    }

    function buildPlanHtml(hospital, cooldown, cap) {
        const budget = cap - cooldown;
        const parts = [];
        const unlock = 'Medical cooldown is at its cap. Meds unlock again in ' + live('unlock', 0) + '.';
        state.nextStep = null;
        state.waitStep = null;
        if (hospital <= 0) {
            if (budget <= 0) {
                parts.push(line(unlock, true));
            } else if (state.reserve === 0) {
                parts.push(line('No meds you can use right now.'));
            } else if (state.reserve != null) {
                parts.push(line('Your cooldown room and meds can clear up to <b>' + escapeHtml(formatAmount(state.reserve)) + '</b> of hospital.', true));
            }
            return parts.join('');
        }
        if (state.earlyDischarge) {
            parts.push(note('Early discharge is available: you can leave hospital for free, without meds.'));
        }
        if (state.radiation) {
            parts.push(note('Radiation sickness: medical items do not clear this stay. Only Neumune Tablets help.'));
            return parts.join('');
        }
        if (state.stock.own == null) {
            parts.push(line('Reading your meds…'));
            return parts.join('');
        }
        if (budget <= 0) {
            parts.push(note(unlock, true));
            return parts.join('');
        }
        const groups = buildGroups();
        if (!settings.bloodType && hasAnyBags()) {
            parts.push('<p class="qmo-hint" data-qmo="settings">Set your blood type in settings to include blood bags.</p>');
        }
        if (groups.length === 0) {
            parts.push(note('No meds to use: none in your items' + (settings.useArmoury ? ' or the faction armoury.' : '.')));
            return parts.join('');
        }
        const result = planMedOut(groups, hospital, budget);
        const plan = result.full || result.partial;
        if (!plan) {
            parts.push(note('No med fits under your cooldown cap right now.'));
            return parts.join('');
        }
        if (!result.full) {
            const capBound = !planMedOut(groups.map(function(group){ return Object.assign({}, group, { total: Infinity }); }), hospital, budget).full;
            parts.push(note('Not enough ' + (capBound ? 'cooldown room' : 'meds') + ' to get fully out. These take ' +
                escapeHtml(formatAmount(plan.cleared)) + ' off and ' + live('stays', plan.cleared) + ' stays.', true));
        }
        const steps = planSteps(groups, plan);
        parts.push(planChips(groups, plan, steps[0]));
        parts.push(line((result.full ? 'Out' : 'Partly out') + ': <b class="qmo-h">−' + escapeHtml(formatAmount(plan.cleared)) +
            '</b> hospital for <b>+' + escapeHtml(formatAmount(plan.cooldown)) + '</b> cooldown → ' +
            live('cooldown-after', plan.cooldown) + ' / ' + escapeHtml(formatClock(cap)), true));
        state.nextStep = stepFor(groups, steps);
        if (state.nextStep) {
            parts.push(useButton(state.nextStep, 'use', steps.length, ''));
        }
        if (result.full) {
            parts.push(buildWaitHtml(groups, hospital, budget, result.full));
        }
        return parts.join('');
    }

    // A cheaper way out that leaves a little hospital time to sit through. Only offered when it
    // really saves cooldown; the most a player is willing to wait is a setting. With less time
    // left than that, the cheapest way out is no med at all.
    function buildWaitHtml(groups, hospital, budget, full) {
        const waitSeconds = clamp(Number(settings.waitMinutes) || 0, 0, 60) * 60;
        if (waitSeconds <= 0) {
            return '';
        }
        const plan = planMedOut(groups, Math.max(0, hospital - waitSeconds), budget).full;
        if (!plan || plan.cleared >= hospital || plan.cooldown >= full.cooldown - 1) {
            return '';
        }
        const saved = '<b>' + escapeHtml(formatAmount(full.cooldown - plan.cooldown)) + '</b>';
        if (plan.clicks === 0) {
            return '<div class="qmo-alt"><p class="qmo-alt-t">Or wait <b>' + live('wait', 0) + '</b> and save ' + saved +
                ' cooldown: no meds needed.</p></div>';
        }
        const steps = planSteps(groups, plan);
        state.waitStep = stepFor(groups, steps);
        return '<div class="qmo-alt">' +
                   '<p class="qmo-alt-t">Or wait <b>' + live('wait', plan.cleared) + '</b> and save ' + saved + ' cooldown:</p>' +
                   planChips(groups, plan, -1) +
                   (state.waitStep ? useButton(state.waitStep, 'use-wait', steps.length, 'then wait ' + live('wait', plan.cleared) + ' · ') : '') +
               '</div>';
    }

    // Each chip carries what its meds take off and add, so the plan explains itself. The one
    // the next click uses is outlined.
    function planChips(groups, plan, nextIndex) {
        return '<div class="qmo-chips">' + groups.map(function(group, index){
            const count = plan.counts[index];
            if (count === 0) {
                return '';
            }
            const picked = pickSource(group);
            const label = group.key === 'blood' && picked ? itemName(picked.id) : group.label;
            return '<span class="qmo-chip' + (index === nextIndex ? ' qmo-next' : '') + '">' +
                '<img src="/images/items/' + (picked ? picked.id : group.ids[0]) + '/small.png" alt="">' +
                '<b>' + count + '×</b> ' + escapeHtml(label) +
                ' <span class="qmo-h">−' + escapeHtml(formatAmount(count * group.hospital)) + '</span>' +
                ' <span class="qmo-c">+' + escapeHtml(formatAmount(count * group.cooldown)) + '</span></span>';
        }).join('') + '</div>';
    }

    function stepFor(groups, steps) {
        const group = groups[steps[0]];
        const source = group ? pickSource(group) : null;
        return source ? { group: group, source: source } : null;
    }

    function useButton(step, action, stepCount, prefix) {
        const left = step.source.armoury ? factionQty(step.source.id) : ownQty(step.source.id);
        return '<button type="button" class="qmo-use' + (action === 'use-wait' ? ' qmo-use-alt' : '') + (state.busy ? ' qmo-busy' : '') +
                '" data-qmo="' + action + '"' + (state.busy ? ' disabled' : '') + '>' +
            '<img src="/images/items/' + step.source.id + '/small.png" alt="">' +
            '<span>Use ' + escapeHtml(itemName(step.source.id)) +
            (stepCount > 1 ? ' <small>1 of ' + stepCount + '</small>' : '') + '</span>' +
            '<small class="qmo-use-src">' + prefix + (step.source.armoury ? 'faction' : 'yours') + ' · ' + left.toLocaleString('en-US') + ' left</small>' +
        '</button>';
    }

    function hasAnyBags() {
        return Object.keys(BLOOD_BAGS).some(function(id){ return factionQty(id) > 0 || ownQty(id) > 0; });
    }

    // A clock that keeps running between redraws: render() fills it in every second.
    function live(kind, value) {
        return '<span class="qmo-live" data-live="' + kind + '" data-value="' + Math.round(value) + '"></span>';
    }

    function line(text, trusted) {
        return '<p class="qmo-line">' + (trusted ? text : escapeHtml(text)) + '</p>';
    }

    function note(text, trusted) {
        return '<p class="qmo-note">' + (trusted ? text : escapeHtml(text)) + '</p>';
    }

    // ---- Settings --------------------------------------------------------------------------

    function openSettings() {
        whenBodyReady(function(){
            ensureStyle();
            let overlay = document.getElementById(MODAL_ID);
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = MODAL_ID;
                document.body.appendChild(overlay);
                overlay.addEventListener('click', function(event){
                    if (event.target === overlay) {
                        closeSettings();
                    }
                });
                document.addEventListener('keydown', function(event){
                    if (event.key === 'Escape' && overlay.classList.contains('qmo-open')) {
                        closeSettings();
                    }
                });
            }
            overlay.innerHTML =
                '<div class="qmo-modal" role="dialog" aria-modal="true" aria-label="Quick Med Out settings">' +
                    '<div class="qmo-modal-title">Quick Med Out settings<span class="qmo-x" role="button" tabindex="0" title="Close">&times;</span></div>' +
                    '<label class="qmo-field"><span class="qmo-field-name">Your blood type</span>' +
                        '<select class="qmo-f-blood"><option value="">Not set: leave blood bags out</option>' +
                            BLOOD_TYPES.map(function(type){ return '<option value="' + type + '">' + type + '</option>'; }).join('') +
                        '</select>' +
                        '<small>Blood bags need the Intravenous Therapy course. A bag of the wrong type puts you back in hospital.</small></label>' +
                    '<label class="qmo-check"><input type="checkbox" class="qmo-f-armoury"> Use faction armoury meds first</label>' +
                    '<label class="qmo-field"><span class="qmo-field-name">Medical item effectiveness bonus (%)</span>' +
                        '<input type="number" class="qmo-f-eff" min="0" max="200" step="1" inputmode="numeric">' +
                        '<small class="qmo-f-eff-note"></small></label>' +
                    '<div class="qmo-field"><span class="qmo-field-name">Medical cooldown cut (%)</span>' +
                        '<label class="qmo-check"><input type="checkbox" class="qmo-f-cutauto"> Take it from the book you are reading</label>' +
                        '<input type="number" class="qmo-f-cut" min="0" max="90" step="5" inputmode="numeric"></div>' +
                    '<label class="qmo-field"><span class="qmo-field-name">Wait in hospital to save cooldown (minutes)</span>' +
                        '<input type="number" class="qmo-f-wait" min="0" max="60" step="0.5" inputmode="decimal">' +
                        '<small>Also offers a plan that leaves up to this much hospital time to wait out, when it costs less cooldown. 0 turns it off.</small></label>' +
                    '<div class="qmo-field"><span class="qmo-field-name">Torn API key (optional)</span>' +
                        '<div class="qmo-row"><input type="password" class="qmo-f-key" placeholder="16-character key" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
                        '<button type="button" class="qmo-small qmo-f-read">Read perks</button></div>' +
                        '<small class="qmo-f-key-note">A Minimal key is enough. It is only sent to api.torn.com, to read your faction and education perks.</small></div>' +
                    '<div class="qmo-modal-actions"><button type="button" class="qmo-small qmo-f-cancel">Cancel</button>' +
                        '<button type="button" class="qmo-small qmo-primary qmo-f-save">Save</button></div>' +
                '</div>';
            const find = function(selector){ return overlay.querySelector(selector); };
            let effectivenessSource = settings.effectivenessSource;
            let readCap = null;
            find('.qmo-f-blood').value = settings.bloodType || '';
            find('.qmo-f-armoury').checked = !!settings.useArmoury;
            find('.qmo-f-eff').value = String(effectiveness());
            find('.qmo-f-cutauto').checked = !!settings.cooldownCutAuto;
            find('.qmo-f-cut').value = String(settings.cooldownCutAuto ? state.bookCut : cooldownCut());
            find('.qmo-f-cut').disabled = !!settings.cooldownCutAuto;
            find('.qmo-f-wait').value = String(clamp(Number(settings.waitMinutes) || 0, 0, 60));
            find('.qmo-f-key').value = hasApiKey() ? apiKey : '';
            const describeSource = function(){
                find('.qmo-f-eff-note').textContent = effectivenessSource === 'api' && settings.perksReadAt
                    ? 'Read from your perks; kept up to date while the key is set. Typing a number turns that off.'
                    : 'From faction Fortitude upgrades and the Biochemistry courses. An API key can read it for you.';
            };
            describeSource();
            find('.qmo-f-eff').addEventListener('input', function(){
                effectivenessSource = 'manual';
                describeSource();
            });
            find('.qmo-f-cutauto').addEventListener('change', function(){
                find('.qmo-f-cut').disabled = this.checked;
                if (this.checked) {
                    find('.qmo-f-cut').value = String(state.bookCut);
                }
            });
            find('.qmo-f-read').addEventListener('click', function(){
                const key = find('.qmo-f-key').value.trim();
                const keyNote = find('.qmo-f-key-note');
                if (key.length !== 16) {
                    keyNote.textContent = 'That is not a 16-character key.';
                    return;
                }
                keyNote.textContent = 'Reading your perks…';
                readPerks(key).then(function(perks){
                    find('.qmo-f-eff').value = String(perks.effectiveness);
                    effectivenessSource = 'api';
                    readCap = perks.capMinutes;
                    keyNote.textContent = 'Perks read: +' + perks.effectiveness + '% effectiveness, cap ' +
                        formatClock(BASE_COOLDOWN_CAP + perks.capMinutes * 60) + '. Save to keep them.';
                }).catch(function(error){
                    keyNote.textContent = 'Could not read perks: ' + error.message;
                });
            });
            find('.qmo-x').addEventListener('click', closeSettings);
            find('.qmo-f-cancel').addEventListener('click', closeSettings);
            find('.qmo-f-save').addEventListener('click', function(){
                settings.bloodType = find('.qmo-f-blood').value;
                settings.useArmoury = find('.qmo-f-armoury').checked;
                settings.effectiveness = clamp(parseInt(find('.qmo-f-eff').value, 10) || 0, 0, 200);
                settings.effectivenessSource = effectivenessSource;
                settings.cooldownCutAuto = find('.qmo-f-cutauto').checked;
                if (!settings.cooldownCutAuto) {
                    settings.cooldownCut = clamp(parseInt(find('.qmo-f-cut').value, 10) || 0, 0, 90);
                }
                settings.waitMinutes = clamp(parseFloat(find('.qmo-f-wait').value) || 0, 0, 60);
                if (readCap != null) {
                    settings.perksReadAt = Date.now();
                    if (!settings.capFromSidebar) {
                        settings.knownCap = BASE_COOLDOWN_CAP + readCap * 60;
                    }
                }
                const key = find('.qmo-f-key').value.trim();
                try {
                    if (key) {
                        localStorage.setItem(API_KEY_KEY, key);
                    } else {
                        localStorage.removeItem(API_KEY_KEY);
                    }
                } catch (error) {
                    // Without storage the key lasts until the page reloads.
                }
                apiKey = key;
                saveJson(SETTINGS_KEY, settings);
                state.calibration = null;
                closeSettings();
                updateReserve();
                render();
                maybeRefreshPerks();
            });
            overlay.classList.add('qmo-open');
        });
    }

    function closeSettings() {
        const overlay = document.getElementById(MODAL_ID);
        if (overlay) {
            overlay.classList.remove('qmo-open');
        }
    }

    // ---- Formatting ------------------------------------------------------------------------

    function formatClock(seconds) {
        const total = Math.max(0, Math.ceil(seconds));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total % 3600 / 60);
        const secs = total % 60;
        const pad = function(value){ return value < 10 ? '0' + value : String(value); };
        return (hours > 0 ? hours + ':' + pad(minutes) : String(minutes)) + ':' + pad(secs);
    }

    function formatAmount(seconds) {
        const total = Math.max(0, Math.round(seconds));
        if (total < 60) {
            return total + 's';
        }
        const minutes = Math.round(total / 60);
        const hours = Math.floor(minutes / 60);
        if (hours === 0) {
            return minutes + 'm';
        }
        return hours + 'h' + (minutes % 60 ? ' ' + (minutes % 60) + 'm' : '');
    }

    function parseClock(text) {
        const match = String(text || '').match(/^(\d+):(\d{2}):(\d{2})$/);
        return match ? parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10) : 0;
    }

    function htmlToText(html) {
        const text = String(html).replace(/<br\s*\/?>/gi, ' ');
        try {
            return (new DOMParser().parseFromString(text, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
        } catch (error) {
            return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        }
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function(character){
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }

    // ---- Styles ----------------------------------------------------------------------------

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#silmaril-qmo{position:fixed;z-index:999990;top:90px;right:10px;width:330px;max-width:calc(100vw - 12px);box-sizing:border-box;
  background:#1f1f1f;color:#e6e6e6;border:1px solid #555;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.55);
  font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;text-align:left;-webkit-tap-highlight-color:transparent}
#silmaril-qmo *{box-sizing:border-box}
#silmaril-qmo.qmo-collapsed{width:auto}
#silmaril-qmo.qmo-in-hospital{border-color:#8e2b2b}
#silmaril-qmo .qmo-head{display:flex;align-items:center;gap:6px;padding:4px 4px 4px 10px;border-bottom:1px solid #333;min-height:38px}
#silmaril-qmo.qmo-collapsed .qmo-head{border-bottom:0}
#silmaril-qmo .qmo-logo{display:inline-flex;width:16px;height:16px;flex:0 0 auto;color:#e53935;cursor:pointer}
#silmaril-qmo .qmo-logo svg{width:16px;height:16px;fill:currentColor}
#silmaril-qmo .qmo-title{font-weight:bold;color:#fff;white-space:nowrap;cursor:pointer}
#silmaril-qmo .qmo-mini{display:none;white-space:nowrap;color:#ccc;font-variant-numeric:tabular-nums;cursor:pointer}
#silmaril-qmo.qmo-collapsed .qmo-mini{display:inline}
#silmaril-qmo.qmo-collapsed.qmo-in-hospital .qmo-mini{color:#ff8a80}
#silmaril-qmo.qmo-collapsed .qmo-body,#silmaril-qmo.qmo-collapsed .qmo-refresh,
#silmaril-qmo.qmo-collapsed .qmo-gear,#silmaril-qmo.qmo-collapsed .qmo-pin{display:none}
#silmaril-qmo .qmo-tools{margin-left:auto;display:flex;gap:2px;flex:0 0 auto}
#silmaril-qmo .qmo-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin:0;padding:0;
  border:0;border-radius:6px;background:transparent;color:#9a9a9a;cursor:pointer;line-height:1}
#silmaril-qmo .qmo-btn svg{width:18px;height:18px;fill:currentColor;pointer-events:none}
#silmaril-qmo .qmo-btn:hover{background:rgba(255,255,255,.1);color:#fff}
#silmaril-qmo .qmo-pin.qmo-on{color:#ffca28}
#silmaril-qmo .qmo-drag{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
#silmaril-qmo.qmo-dragging{opacity:.92}
#silmaril-qmo.qmo-dragging .qmo-drag{cursor:grabbing}
#silmaril-qmo .qmo-body{padding:8px 10px 10px}
#silmaril-qmo .qmo-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#silmaril-qmo .qmo-stat{background:#2a2a2a;border-radius:8px;padding:6px 8px;min-width:0}
#silmaril-qmo .qmo-label{display:block;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.05em}
#silmaril-qmo .qmo-value{display:block;font-size:18px;font-weight:bold;color:#fff;white-space:nowrap;font-variant-numeric:tabular-nums}
#silmaril-qmo .qmo-value small{font-size:11px;color:#999;font-weight:normal}
#silmaril-qmo .qmo-hosp.qmo-active .qmo-value{color:#ff6b6b}
#silmaril-qmo .qmo-sub{display:block;font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#silmaril-qmo .qmo-bar{display:block;height:5px;margin-top:5px;background:#3a3a3a;border-radius:3px;overflow:hidden}
#silmaril-qmo .qmo-bar i{display:block;height:100%;width:0;background:#43a047}
#silmaril-qmo .qmo-bar.qmo-full i{background:#e53935}
#silmaril-qmo .qmo-plan{margin-top:8px}
#silmaril-qmo .qmo-plan:empty{display:none}
#silmaril-qmo .qmo-line{margin:0 0 6px;color:#ccc}
#silmaril-qmo .qmo-line b{color:#fff}
#silmaril-qmo .qmo-line .qmo-h{color:#ff8a80}
#silmaril-qmo .qmo-note,#silmaril-qmo .qmo-warn{margin:0 0 8px;padding:6px 8px;border-radius:6px;font-size:12px;
  background:#3a2f12;border:1px solid #6d5a1d;color:#ffe08a}
#silmaril-qmo .qmo-warn p{margin:0 0 6px}
#silmaril-qmo .qmo-warn-actions{display:flex;gap:6px;flex-wrap:wrap}
#silmaril-qmo .qmo-hint{margin:0 0 8px;font-size:12px;color:#81d4fa;cursor:pointer;text-decoration:underline}
#silmaril-qmo .qmo-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}
#silmaril-qmo .qmo-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:2px 9px 2px 4px;border-radius:14px;
  background:#2a2a2a;border:1px solid #3a3a3a;font-size:12px;white-space:nowrap}
#silmaril-qmo .qmo-chip img{height:19px;width:auto}
#silmaril-qmo .qmo-chip.qmo-next{border-color:#43a047}
#silmaril-qmo .qmo-h{color:#ff8a80}
#silmaril-qmo .qmo-c{color:#ffe08a}
#silmaril-qmo .qmo-alt{margin-top:8px;padding:6px 8px;border:1px dashed #5a5a5a;border-radius:8px}
#silmaril-qmo .qmo-alt-t{margin:0 0 6px;font-size:12px;color:#bbb}
#silmaril-qmo .qmo-alt-t b{color:#9ccc65}
#silmaril-qmo .qmo-alt .qmo-alt-t:last-child{margin-bottom:0}
#silmaril-qmo .qmo-use{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 8px;width:100%;min-height:44px;
  margin:4px 0 0;padding:6px 10px;border:1px solid #2e7d32;border-radius:8px;background:#2e7d32;color:#fff;
  font:bold 14px Arial,Helvetica,sans-serif;cursor:pointer;text-align:center;touch-action:manipulation}
#silmaril-qmo .qmo-use:hover{background:#38963d}
#silmaril-qmo .qmo-use img{height:22px;width:auto}
#silmaril-qmo .qmo-use small{font-weight:normal;opacity:.85;font-size:11px}
#silmaril-qmo .qmo-use .qmo-use-src{flex-basis:100%}
#silmaril-qmo .qmo-use.qmo-use-alt{min-height:40px;border-color:#555;background:#333;color:#eee;font-size:13px}
#silmaril-qmo .qmo-use.qmo-use-alt:hover{background:#3d3d3d}
#silmaril-qmo .qmo-use.qmo-busy{opacity:.6;cursor:progress}
#silmaril-qmo .qmo-msg{margin-top:8px;font-size:12px;color:#bbb;overflow-wrap:anywhere}
#silmaril-qmo .qmo-msg:empty,#silmaril-qmo .qmo-cal:empty{display:none}
#silmaril-qmo .qmo-msg.qmo-ok{color:#9ccc65}
#silmaril-qmo .qmo-msg.qmo-bad{color:#ff8a80}
#silmaril-qmo .qmo-cal{margin-top:8px}
#silmaril-qmo .qmo-foot{margin-top:8px;padding-top:6px;border-top:1px solid #333;font-size:11px;color:#888;cursor:pointer}
#silmaril-qmo .qmo-foot:hover{color:#bbb}
#silmaril-qmo .qmo-small,#silmaril-qmo-settings .qmo-small{display:inline-flex;align-items:center;justify-content:center;min-height:32px;
  padding:5px 12px;border:1px solid #555;border-radius:6px;background:#333;color:#eee;font:13px Arial,Helvetica,sans-serif;cursor:pointer;
  white-space:nowrap;flex:0 0 auto}
#silmaril-qmo .qmo-small:hover,#silmaril-qmo-settings .qmo-small:hover{background:#3d3d3d}
#silmaril-qmo .qmo-primary,#silmaril-qmo-settings .qmo-primary{background:#2e7d32;border-color:#2e7d32;color:#fff}
#silmaril-qmo .qmo-primary:hover,#silmaril-qmo-settings .qmo-primary:hover{background:#38963d}
#silmaril-qmo-settings{display:none;position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.6);justify-content:center;
  align-items:flex-start;overflow:auto;padding:24px 12px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
#silmaril-qmo-settings.qmo-open{display:flex}
#silmaril-qmo-settings *{box-sizing:border-box}
#silmaril-qmo-settings .qmo-modal{width:100%;max-width:400px;padding:16px 18px;border:1px solid #666;border-radius:10px;background:#1f1f1f;
  color:#e6e6e6;box-shadow:0 10px 40px rgba(0,0,0,.6);font-size:13px;line-height:1.45;text-align:left}
#silmaril-qmo-settings .qmo-modal-title{display:flex;justify-content:space-between;align-items:center;margin:0 0 14px;font-size:15px;
  font-weight:bold;color:#fff}
#silmaril-qmo-settings .qmo-x{cursor:pointer;color:#bbb;font-size:24px;line-height:1;padding:0 4px}
#silmaril-qmo-settings .qmo-field{display:block;margin:0 0 14px}
#silmaril-qmo-settings .qmo-field-name{display:block;margin:0 0 5px;font-weight:bold;color:#fff}
#silmaril-qmo-settings small{display:block;margin-top:4px;color:#8a8a8a;font-size:11px}
#silmaril-qmo-settings select,#silmaril-qmo-settings input[type=number],#silmaril-qmo-settings input[type=password]{
  width:100%;height:36px;padding:4px 8px;border:1px solid #555;border-radius:6px;background:#111;color:#eee;font-size:16px}
#silmaril-qmo-settings input:disabled{opacity:.5}
#silmaril-qmo-settings .qmo-check{display:flex;align-items:center;gap:8px;margin:0 0 8px;cursor:pointer}
#silmaril-qmo-settings .qmo-check input{width:18px;height:18px;margin:0}
#silmaril-qmo-settings .qmo-row{display:flex;gap:6px}
#silmaril-qmo-settings .qmo-row input{flex:1 1 auto;min-width:0}
#silmaril-qmo-settings .qmo-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
@media (max-width:600px){
  #silmaril-qmo{font-size:14px}
  #silmaril-qmo .qmo-btn{width:34px;height:34px}
  #silmaril-qmo .qmo-value{font-size:17px}
  #silmaril-qmo.qmo-collapsed .qmo-title{display:none}
}
`;
        (document.head ?? document.documentElement).appendChild(style);
    }

    // Last, so every constant above exists before the panel is drawn.
    readBannerFallback();
    whenBodyReady(start);
})();
