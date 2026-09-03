// ==UserScript==
// @name         Torn Market Filler
// @namespace    https://github.com/SOLiNARY
// @version      0.13.0
// @description  On "Fill" click autofills market item price with lowest market price minus $1 (customizable), fills the quantity your quantity mode asks for, marks checkboxes for guns. Click the ⚙ cog on the Fill All bar — or hold the fill button for 2s — to open the settings modal (price delta, quantity mode, API key, prices popup, and per-category overrides — set different discounts/sources/quantities for Clothing, Other, Drug, etc.). Quantity modes: "max" (default), "max-1" to always keep a copy, a fixed number, or "skip" to never list a category. Cycle the star next to the fill button to mark an item as a favourite (★, used by Fill All) or excluded (⊘, never auto-filled). Use "Fill All" to auto-fill every favourite row on both the Add Items and Your Items (view listings) pages, including ones appearing later when switching categories. Drag the Fill All bar anywhere; drop it near a screen edge to clamp and minimise it — its position and state are remembered. Three price sources are available: Torn's item market listings (the default), Torn's market value ([market]) and live player-bazaar data from weav3r.dev ([bazaar], [bazaar:2], [bazaar:avg], [bazaar:median]), which is useful for pricing against what the same item actually sells for in bazaars. After an update a "What's new" popup lists what changed.
// @author       Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/page.php?sid=ItemMarket*
// @match        https://*.torn.com/page.php?sid=ItemMarket*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

(async function() {
    'use strict';

    // Keep in sync with @version above — it keys the "What's new" popup.
    const SCRIPT_VERSION = "0.13.0";

    const itemUrl = "https://api.torn.com/torn/{itemId}?selections=items&key={apiKey}&comment=MarketFiller";
    const marketUrl = "https://api.torn.com/v2/market/{itemId}?selections=itemMarket&key={apiKey}&comment=MarketFiller";
    const marketUrlV2 = "https://api.torn.com/v2/market?id={itemId}&selections=itemMarket&key={apiKey}&comment=MarketFiller";
    // weav3r.dev aggregates live player-bazaar listings. Public, no API key, CORS-open, but
    // shared across every consumer at 100 req/min, so responses are cached client-side too.
    const weav3rItemUrl = "https://weav3r.dev/api/marketplace/{itemId}";
    const weav3rAllUrl = "https://weav3r.dev/api/marketplace";

    // Which endpoint a formula's price comes from.
    const SOURCE_ITEM_MARKET = "itemmarket";  // Torn live item market listings (default)
    const SOURCE_MARKET_VALUE = "items";      // Torn market value, i.e. [market]
    const SOURCE_BAZAAR = "bazaar";           // weav3r player bazaars, i.e. [bazaar...]

    // weav3r serves its own cache with a 30-180s TTL, so re-asking sooner than this only burns
    // rate limit. The bulk snapshot covers every item at once and backs [bazaar:avg].
    const WEAV3R_ITEM_TTL_MS = 60 * 1000;
    const WEAV3R_ALL_TTL_MS = 60 * 1000;
    // Listings the crawler has not re-checked recently may already be sold; they are dropped
    // unless that would empty the list, in which case stale data beats no data.
    const WEAV3R_STALE_LISTING_MS = 30 * 60 * 1000;
    // A listing this far below the bazaar average is an outlier, not competition.
    const BAZAAR_SANITY_FLOOR_RATIO = 0.25;
    let weav3rItemCache = new Map();
    let weav3rAllCache = null;
    let showPricesPopup = localStorage.getItem("silmaril-torn-market-filler-show-prices-popup") ?? '1';
    showPricesPopup = Boolean(parseInt(showPricesPopup));
    let priceDeltaRaw = localStorage.getItem("silmaril-torn-market-filler-price-delta") ?? localStorage.getItem("silmaril-torn-bazaar-filler-price-delta") ?? '-1[0]';
    // How many units to list per item: "max" (all of them), "max-N" (keep N back), a fixed
    // number, or "skip"/"0" to never list. Defaults to "max" — the behaviour before this existed.
    let quantityModeRaw = localStorage.getItem("silmaril-torn-market-filler-quantity-mode") ?? 'max';
    let apiKey = localStorage.getItem("silmaril-torn-bazaar-filler-apikey") ?? '###PDA-APIKEY###';
    try {
        GM_registerMenuCommand('Open Settings', openSettingsModal);
        GM_registerMenuCommand("What's new", function(){ openChangelogModal(CHANGELOG); });
    } catch (error) {
        console.warn('[TornMarketFiller] Tampermonkey not detected!');
    }

    let GM_addStyle = function (s) {
        let style = document.createElement("style");
        style.type = "text/css";
        style.innerHTML = s;
        document.head.appendChild(style);
    };
    GM_addStyle(`#item-market-root [class^=addListingWrapper___] [class^=panels___] [class^=priceInputWrapper___]>.input-money-group>.input-money,#item-market-root [class^=viewListingWrapper___] [class^=priceInputWrapper___]>.input-money-group>.input-money{font-size:smaller!important;border-bottom-left-radius:0!important;border-top-left-radius:0!important}.silmaril-market-filler-popup{background:var(--tooltip-bg-color);padding:12px 18px;border-radius:8px;border:1px solid #888;box-shadow:0 4px 18px 0 #0009;color:var(--info-msg-font-color);z-index:99999;position:fixed;font-size:1em!important;line-height:1.5;pointer-events:auto}.silmaril-market-filler-popup-close{position:absolute;top:4px;right:7px;font-size:1em;color:#aaa;cursor:pointer}.silmaril-market-filler-popup-draggable{user-select:none;cursor:move}.silmaril-torn-market-filler-popup-price{cursor:pointer}.tmf-fav{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:18px;font-size:16px;line-height:1;color:#888;align-self:center;margin-right:2px;user-select:none;-webkit-user-select:none}.tmf-fav.tmf-fav--on{color:gold;text-shadow:0 0 3px rgba(255,215,0,.7)}.tmf-fillall-bar{position:fixed;bottom:110px;right:16px;display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(0,0,0,.55);border-radius:20px;z-index:999999;touch-action:none;transition:box-shadow .2s ease}.tmf-fillall-grip{cursor:grab;color:#bbb;font-size:14px;line-height:1;letter-spacing:-2px;min-width:12px;text-align:center;align-self:center;user-select:none;-webkit-user-select:none}.tmf-fillall-bar--dragging{cursor:grabbing;opacity:.92}.tmf-fillall-bar--dragging .tmf-fillall-grip{cursor:grabbing}.tmf-fillall-cog{cursor:pointer;flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.12);color:#ddd;font-size:13px;line-height:1;user-select:none;-webkit-user-select:none}.tmf-fillall-cog:hover{background:rgba(255,255,255,.28);color:#fff}.tmf-fillall-bar--min{padding:5px 7px;gap:4px}.tmf-fillall-bar--min .tmf-fillall-btn,.tmf-fillall-bar--min .tmf-fillall-cog{display:none}.tmf-fillall-bar--min .tmf-fillall-grip{font-size:16px}.tmf-autofill-dot{display:none;width:10px;height:10px;border-radius:50%;background:gold;box-shadow:0 0 4px gold;animation:tmfPulse 1s ease-in-out infinite}.tmf-fillall-bar--active .tmf-autofill-dot{display:inline-block}.tmf-fillall-bar--active{box-shadow:0 0 10px 2px rgba(255,215,0,.75)}@keyframes tmfPulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}.tmf-viewport-border{display:none;position:fixed;top:0;right:0;bottom:0;left:0;border:3px solid gold;box-shadow:inset 0 0 12px rgba(255,215,0,.6);pointer-events:none;z-index:999998}.tmf-viewport-border--active{display:block}.tmf-toast{position:fixed;bottom:158px;right:16px;max-width:280px;background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:8px;border:1px solid gold;font-size:13px;line-height:1.4;z-index:1000000;opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s}.tmf-toast--visible{opacity:1;visibility:visible}.tmf-fav.tmf-fav--off{color:#ff6b6b;text-shadow:none}`);

    GM_addStyle(`.tmf-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483000;justify-content:center;align-items:flex-start;overflow:auto;padding:24px 12px;box-sizing:border-box}.tmf-modal-overlay--open{display:flex}.tmf-modal{background:#1f1f1f;color:#e6e6e6;width:100%;max-width:420px;border:1px solid #666;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);padding:16px 18px;box-sizing:border-box;font-size:13px;line-height:1.5}.tmf-modal h3{margin:0 0 12px;font-size:15px;display:flex;justify-content:space-between;align-items:center;color:#fff}.tmf-modal-close{cursor:pointer;color:#bbb;font-size:22px;line-height:1}.tmf-modal label{display:block;margin:10px 0 3px;font-weight:bold;color:#cfcfcf}.tmf-modal input[type=text]{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:5px;border:1px solid #666;background:#111;color:#eee;font-size:13px}.tmf-modal-toggle{display:flex;align-items:center;gap:8px;margin-top:10px;font-weight:bold;color:#cfcfcf}.tmf-modal-toggle input{width:auto}.tmf-modal-cats{margin-top:4px}.tmf-modal-cat-row{display:flex;gap:6px;margin-bottom:6px;align-items:center}.tmf-modal-cat-row .tmf-modal-cat-name{flex:1 1 55%}.tmf-modal-cat-row .tmf-modal-cat-formula{flex:1 1 45%}.tmf-modal-cat-del{cursor:pointer;color:#ff6b6b;font-size:20px;line-height:1;flex:0 0 auto;width:22px;text-align:center}.tmf-modal-addcat{margin-top:2px;cursor:pointer;background:#333;color:#eee;border:1px solid #666;border-radius:5px;padding:5px 10px;font-size:12px}.tmf-modal-resetcat{margin:2px 0 0 8px;cursor:pointer;background:#3a2a2a;color:#ddd;border:1px solid #774;border-radius:5px;padding:5px 10px;font-size:12px}.tmf-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.tmf-modal-actions button{cursor:pointer;padding:7px 16px;border-radius:5px;border:1px solid #666;background:#333;color:#eee;font-size:13px}.tmf-modal-save{background:#2e7d32!important;border-color:#2e7d32!important;color:#fff!important}.tmf-modal-help{margin-top:12px;font-size:11px;color:#9a9a9a;line-height:1.5}.tmf-modal-help code{background:#000;padding:1px 4px;border-radius:3px;color:#cfc}.tmf-modal-cat-row input{min-width:0}.tmf-modal-cat-row .tmf-modal-cat-name{flex:1 1 38%}.tmf-modal-cat-row .tmf-modal-cat-formula{flex:1 1 32%}.tmf-modal-cat-row .tmf-modal-cat-qty{flex:1 1 30%}.tmf-modal-cat-head{display:flex;gap:6px;margin:0 0 4px;font-size:11px;color:#9a9a9a}.tmf-modal-cat-head span:nth-child(1){flex:1 1 38%}.tmf-modal-cat-head span:nth-child(2){flex:1 1 32%}.tmf-modal-cat-head span:nth-child(3){flex:1 1 30%}.tmf-modal-cat-head span:nth-child(4){flex:0 0 22px}.tmf-modal-clearexcl{margin:2px 0 0 8px;cursor:pointer;background:#3a2a2a;color:#ddd;border:1px solid #774;border-radius:5px;padding:5px 10px;font-size:12px}`);

    GM_addStyle(`.tmf-changelog-release{margin:0 0 14px}.tmf-changelog-release:last-of-type{margin-bottom:0}.tmf-changelog-ver{display:flex;align-items:baseline;gap:8px;margin:0 0 6px}.tmf-changelog-ver b{color:#fff;font-size:13px}.tmf-changelog-date{color:#8a8a8a;font-size:11px;margin-left:auto}.tmf-changelog-badge{background:#2e7d32;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;text-transform:uppercase;letter-spacing:.04em}.tmf-changelog-items{margin:0;padding-left:18px;color:#cfcfcf}.tmf-changelog-items li{margin:0 0 5px}.tmf-changelog-items code{background:#000;padding:1px 4px;border-radius:3px;color:#cfc}`);

    const lastSeenVersionKey = "silmaril-torn-market-filler-last-seen-version";
    // Newest release first. Everything a user could have skipped over is listed, so updating
    // across several versions still shows the whole gap in one popup.
    const CHANGELOG = [
        {
            version: "0.13.0",
            date: "2026-09-02",
            changes: [
                'New price source: live player-bazaar data from <b>weav3r.dev</b>. Use <code>[bazaar]</code> for the cheapest bazaar listing, <code>[bazaar:2]</code> for the 3rd cheapest, <code>[bazaar:avg]</code> for the current bazaar average, or <code>[bazaar:median]</code> for the median listing.',
                'Handy for spotting when the item market has drifted away from what an item really moves for in bazaars. Needs no API key.',
                'Sponsored listings, listings the crawler has not re-checked in 30 minutes, and listings far below the bazaar average are all ignored — so a single troll listing cannot re-price a Fill All run.',
                'The prices popup lists bazaar listings the same way it lists market ones, so you can see what you are pricing against.',
                'An item weav3r cannot price falls back to the item market instead of failing the row.',
                'A formula with no discount (<code>[market]</code>, <code>[bazaar]</code>) now fills at the source price instead of erroring.',
                'This popup: after an update, a short list of what changed. Re-open it any time from the Tampermonkey menu.'
            ]
        }
    ];

    const pages = { "AddItems": 10, "ViewItems": 20, "Other": 0};

    // Favourites are deliberately stored under a market-filler-specific key,
    // separate from the bazaar-filler favourites list.
    const favouritesStorageKey = "silmaril-torn-market-filler-favourites";
    let favourites = loadFavourites();

    // Excluded items are never touched by Fill All, and a manual Fill on one warns first.
    // An item is either neutral, a favourite or excluded — never two of those at once.
    const excludedStorageKey = "silmaril-torn-market-filler-excluded";
    let excluded = loadExcluded();

    // Per-category price-delta overrides + a persistent item→category(type) cache.
    // Item categories are immutable, so caching them avoids extra API calls when picking
    // which price source a category's formula needs.
    const categoryDeltasKey = "silmaril-torn-market-filler-category-deltas";
    // Per-category quantity overrides live in their own map so the existing delta entries keep
    // their shape (a bare formula string) and upgrade without migration.
    const categoryQuantitiesKey = "silmaril-torn-market-filler-category-quantities";
    const itemCategoryCacheKey = "silmaril-torn-market-filler-item-categories";
    // Item types are mostly immutable but Torn occasionally recategorises an item, so cached
    // categories are re-verified from each response and forcibly refreshed once past this TTL.
    const CATEGORY_TTL_MS = 14 * 24 * 60 * 60 * 1000;
    const SETTINGS_CATEGORIES = ["Melee","Primary","Secondary","Defensive","Temporary","Drug","Medical","Booster","Energy Drink","Alcohol","Enhancer","Clothing","Jewelry","Material","Flower","Plushie","Car","Supply Pack","Special","Collectible","Artifact","Tool","Other"];
    let categoryDeltas = loadCategoryDeltas();
    let categoryQuantities = loadCategoryQuantities();
    let itemCategoryCache = loadItemCategoryCache();

    // "Fill All" auto-fill mode state. One activation fills each favourite item once;
    // rows appearing later (category/tab switches) are picked up by the mutation observer.
    const FILL_COOLDOWN_MIN_MS = 600;
    const FILL_COOLDOWN_MAX_MS = 1000;
    const RATE_LIMIT_PAUSE_MIN_MS = 3000;
    const RATE_LIMIT_PAUSE_MAX_MS = 10000;
    let autoFillActive = false;
    let autoFillLoopRunning = false;
    let autoFillQueue = [];
    let autoFillQueuedIds = new Set();
    let autoFillDoneIds = new Set();
    let toastTimer = null;
    // Set once Torn's chat z-index is detected, so our floating UI sits just below the
    // chat (an open chat window covers it instead of the button overshadowing the chat).
    let chatRelativeZBase = null;

    // Draggable / minimisable Fill All bar. Position + minimised state persist across visits.
    const fillAllStateKey = "silmaril-torn-market-filler-fillall-pos";
    const FILLALL_EDGE_SNAP_PX = 40;       // drop within this of an edge → clamp + minimise
    const FILLALL_DRAG_THRESHOLD_PX = 6;   // movement before a press counts as a drag
    const FILLALL_VIEWPORT_MARGIN_PX = 4;  // keep this gap from the edge when not snapped
    let fillAllState = loadFillAllState();

    let recentFilledInput = null;
    let popupOffsetX = parseFloat(localStorage.getItem("silmaril-torn-market-filler-popup-offset-x")) || 0;
    let popupOffsetY = parseFloat(localStorage.getItem("silmaril-torn-market-filler-popup-offset-y")) || 100;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    const marketTaxFactor = 1 - getCurrentMarketTax();
    let currentPage = pages.Other;
    let holdTimer;
    const LOADING_THE_PRICES = 'Loading the prices...';
    const isMobileView = window.innerWidth <= 784;
    const observerTarget = document.querySelector("#item-market-root");
    const observerConfig = { attributes: false, childList: true, characterData: false, subtree: true };

    // Debounced whole-root scan instead of matching specific mutation targets: rows on the
    // Add Items and Your Items (view listings) pages mount at different depths (tab panels,
    // list containers, pagination), and target-based matching silently missed the latter.
    // AddFillButton is idempotent, so re-scanning already-processed rows is cheap.
    let scanScheduled = false;
    function scanAndInject() {
        scanScheduled = false;
        currentPage = getCurrentPage();
        if (currentPage == pages.Other) {
            return;
        }
        observerTarget.querySelectorAll('[class*=itemRowWrapper___] > [class*=itemRow___]:not([class*=grayedOut___]) [class^=priceInputWrapper___]').forEach(x => AddFillButton(x));
        if (autoFillActive) {
            enqueueVisibleFavourites();
        }
    }

    function scheduleScan() {
        if (!scanScheduled) {
            scanScheduled = true;
            requestAnimationFrame(scanAndInject);
        }
    }

    const observer = new MutationObserver(function(mutations) {
        for (const m of mutations) {
            if (m.addedNodes.length || m.removedNodes.length) {
                scheduleScan();
                return;
            }
        }
    });
    observer.observe(observerTarget, observerConfig);
    // Tab switches (#/addListing ↔ #/viewListing) don't always leave rows unprocessed,
    // but a scan on hashchange is cheap insurance against missed mutations.
    window.addEventListener("hashchange", scheduleScan);
    addCustomFillPopup();
    ensureFillAllUI();
    // Rows may already be in the DOM at script start (run-at: document-idle).
    scheduleScan();

    // Tell the user what an update changed, the first time they land on the market after it.
    maybeShowChangelog();

    // Keep the Fill All bar on-screen (and flush to its edge if minimised) after a resize/rotate.
    window.addEventListener("resize", function() {
        let bar = document.querySelector(".tmf-fillall-bar");
        if (bar != null && fillAllState != null) {
            applyFillAllState(bar);
        }
    });

    function AddFillButton(itemPriceElement){
        if (itemPriceElement.querySelector('.silmaril-market-filler-button') != null){
            return;
        }
        const wrapperParent = findParentByCondition(itemPriceElement, (el) => String(el.className).indexOf('itemRowWrapper___') > -1);
        wrapperParent.classList.add('silmaril-market-filler-processed');
        let itemId = getRowItemId(wrapperParent);
        const span = document.createElement('span');
        span.className = 'silmaril-market-filler-button input-money-symbol';
        span.style.position = "relative";
        span.setAttribute('data-action-flag', 'fill');
        span.addEventListener('click', async function(e) { await handleFillClick(e, itemId) });
        span.addEventListener('mousedown', startHold);
        span.addEventListener('touchstart', startHold);
        span.addEventListener('mouseup', cancelHold);
        span.addEventListener('mouseleave', cancelHold);
        span.addEventListener('touchend', cancelHold);
        span.addEventListener('touchcancel', cancelHold);
        const input = document.createElement('input');
        input.type = 'button';
        input.className = 'wai-btn';
        span.appendChild(input);

        const moneyGroup = itemPriceElement.querySelector('.input-money-group');
        const itemIdNum = parseInt(itemId, 10);
        if (!isNaN(itemIdNum) && itemIdNum > 0){
            wrapperParent.dataset.tmfItemId = itemIdNum;
            // First slot of the row's controls container — left of the anonymous button.
            const infoContainer = findParentByCondition(itemPriceElement, (el) => String(el.className).indexOf('info___') > -1);
            const favHost = infoContainer ?? moneyGroup;
            // A re-render can remount the price wrapper while the row (and our star) survives;
            // guard against stacking a second star on re-scan.
            if (favHost.querySelector('.tmf-fav') == null){
                const favBtn = document.createElement('span');
                favBtn.className = 'tmf-fav';
                renderFavIcon(favBtn, getItemState(itemIdNum));
                favBtn.dataset.tmfItemId = itemIdNum;
                favBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    e.stopPropagation();
                    cycleItemState(itemIdNum);
                    if (autoFillActive && favourites.has(itemIdNum)){
                        enqueueFavouriteRow(wrapperParent);
                    }
                });
                favHost.prepend(favBtn);
            }
            moneyGroup.prepend(span);
            if (autoFillActive){
                enqueueFavouriteRow(wrapperParent);
            }
        } else {
            moneyGroup.prepend(span);
        }
    }

    // Resolve a row's item id from whichever source the page provides: the info button's
    // aria-controls id on Add Items rows, otherwise any item image in the row. The Your Items
    // (view listings) rows don't reliably carry the aria-controls id, and dereferencing the
    // missing button used to throw — killing button injection for the whole row.
    function getRowItemId(wrapperParent){
        if (currentPage == pages.AddItems){
            let infoButton = wrapperParent.querySelector('[class^=itemRow___] [type=button][class^=viewInfoButton___]');
            let ariaControls = infoButton != null ? infoButton.getAttribute('aria-controls') : null;
            if (ariaControls != null){
                let itemId = getItemIdFromString(ariaControls);
                if (parseInt(itemId, 10) > 0){
                    return itemId;
                }
            }
        }
        let itemImage = wrapperParent.querySelector('[class*=viewInfoButton] img')
            ?? wrapperParent.querySelector('img[src*="/items/"]');
        if (itemImage != null){
            return getItemIdFromImage(itemImage);
        }
        console.error("[TornMarketFiller] ItemId not found!");
        return -1;
    }

    // ---- Price sources ---------------------------------------------------------------------
    // A formula names its source inside its bracket: no bracket or [n] is Torn's item market,
    // [market] is Torn's market value, [bazaar...] is weav3r's player-bazaar data.

    function bracketToken(formula){
        let open = formula.indexOf('[');
        if (open == -1){
            return '';
        }
        let close = formula.indexOf(']', open);
        return (close == -1 ? formula.substring(open + 1) : formula.substring(open + 1, close)).trim().toLowerCase();
    }

    function stripDeltaBracket(formula){
        return formula.indexOf('[') == -1 ? formula : formula.substring(0, formula.indexOf('['));
    }

    function sourceOf(formula){
        let token = bracketToken(formula);
        if (token === 'market'){
            return SOURCE_MARKET_VALUE;
        }
        if (token === 'bazaar' || token.indexOf('bazaar:') == 0){
            return SOURCE_BAZAAR;
        }
        return SOURCE_ITEM_MARKET;
    }

    // What a [bazaar...] formula reads: a listing slot, the bazaar average, or the median listing.
    function bazaarSelector(formula){
        let argument = bracketToken(formula).substring('bazaar'.length).replace(/^:/, '').trim();
        if (argument === 'avg' || argument === 'average'){
            return { kind: 'avg' };
        }
        if (argument === 'median'){
            return { kind: 'median' };
        }
        let slot = parseInt(argument, 10);
        return { kind: 'slot', index: isNaN(slot) ? 0 : slot };
    }

    // True for both the item-market [median] and the bazaar [bazaar:median].
    function isMedianFormula(formula){
        let token = bracketToken(formula);
        return token === 'median' || token === 'bazaar:median';
    }

    // Which listing a slot-based formula wants, for either listing source.
    function listingSlot(formula){
        if (sourceOf(formula) === SOURCE_BAZAAR){
            let selector = bazaarSelector(formula);
            return selector.kind === 'slot' ? selector.index : 0;
        }
        let token = bracketToken(formula);
        let slot = parseInt(token, 10);
        return isNaN(slot) ? 0 : slot;
    }

    // Shape a weav3r failure like a Torn error payload so one set of handlers covers both.
    // A 429 borrows Torn's rate-limit code, which already drives the Fill All back-off.
    function weav3rError(status, message){
        return { error: { code: status === 429 ? 5 : -1, error: "weav3r: " + message } };
    }

    async function fetchWeav3rItem(itemId){
        let cached = weav3rItemCache.get(itemId);
        if (cached != null && (Date.now() - cached.ts) < WEAV3R_ITEM_TTL_MS){
            return cached.payload;
        }
        let payload;
        try {
            let response = await fetch(weav3rItemUrl.replace("{itemId}", itemId));
            if (!response.ok){
                return weav3rError(response.status, "HTTP " + response.status);
            }
            payload = await response.json();
        } catch (error) {
            return weav3rError(0, String(error));
        }
        // weav3r reports failures as a bare string, unlike Torn's {code, error} object.
        if (payload == null || payload.error != null){
            return weav3rError(0, payload == null ? "empty response" : String(payload.error));
        }
        weav3rItemCache.set(itemId, { ts: Date.now(), payload: payload });
        return payload;
    }

    // The bulk snapshot carries every item's average at once, so a whole Fill All run on
    // [bazaar:avg] costs a single request instead of one per row.
    async function fetchWeav3rAll(){
        if (weav3rAllCache != null && (Date.now() - weav3rAllCache.ts) < WEAV3R_ALL_TTL_MS){
            return weav3rAllCache.byId;
        }
        let response = await fetch(weav3rAllUrl);
        if (!response.ok){
            throw new Error("weav3r snapshot HTTP " + response.status);
        }
        let payload = await response.json();
        let byId = new Map();
        (payload.items ?? []).forEach(function(item){ byId.set(item.item_id, item); });
        weav3rAllCache = { ts: Date.now(), byId: byId };
        return byId;
    }

    // The snapshot has no listings, so only an average request can be served from it; everything
    // else needs the per-item endpoint. A snapshot failure just falls through to that endpoint.
    async function fetchBazaarData(formula, itemId){
        if (bazaarSelector(formula).kind === 'avg'){
            try {
                let row = (await fetchWeav3rAll()).get(itemId);
                if (row != null){
                    return { item_id: itemId, bazaar_average: row.bazaar_average, market_price: row.market_price, listings: [] };
                }
            } catch (error) {
                console.warn("[TornMarketFiller] weav3r snapshot unavailable, using the per-item endpoint:", error);
            }
        }
        return fetchWeav3rItem(itemId);
    }

    // Normalise weav3r listings to the {price, amount} shape GetPrice and the prices popup speak.
    // The sponsored slot goes first — a paid placement must never set your price — then listings
    // far under the average (outliers, not competition) and ones the crawler has not re-confirmed
    // lately, unless dropping the stale ones would leave nothing at all.
    function normaliseBazaarListings(data){
        let floor = data.bazaar_average == null ? 0 : data.bazaar_average * BAZAAR_SANITY_FLOOR_RATIO;
        let usable = (data.listings ?? []).filter(function(listing){
            return listing.sponsored !== 1 && listing.price >= floor;
        });
        let fresh = usable.filter(function(listing){
            return (Date.now() - (listing.last_checked ?? 0) * 1000) <= WEAV3R_STALE_LISTING_MS;
        });
        return (fresh.length > 0 ? fresh : usable).map(function(listing){
            return { price: listing.price, amount: listing.quantity ?? 1 };
        });
    }

    function buildTornPriceUrl(source, itemId){
        return (source === SOURCE_MARKET_VALUE ? itemUrl : marketUrlV2)
            .replace("{itemId}", itemId)
            .replace("{apiKey}", apiKey);
    }

    async function fetchForSource(source, formula, itemId){
        if (source === SOURCE_BAZAAR){
            return fetchBazaarData(formula, itemId);
        }
        return fetch(buildTornPriceUrl(source, itemId)).then(response => response.json());
    }

    // Maps a Torn API error payload to the popup-friendly {price, amount:0, status} object,
    // or null when the response carries no error.
    function mapApiError(data){
        if (data.error == null){
            return null;
        }
        switch (data.error.code){
            case 2:
                apiKey = null;
                localStorage.setItem("silmaril-torn-bazaar-filler-apikey", null);
                console.error("[TornMarketFiller] Incorrect Api Key:", data);
                return {"price": 'Wrong API key!', "amount": 0, "status": 'invalid-key'};
            case 5:
                console.warn("[TornMarketFiller] API rate limit reached:", data);
                return {"price": 'Rate limited!', "amount": 0, "status": 'rate-limited'};
            case 9:
                console.warn("[TornMarketFiller] The API is temporarily disabled, please try again later");
                return {"price": 'API is OFF!', "amount": 0, "status": 'error'};
            default:
                console.error("[TornMarketFiller] Error:", data.error.error);
                return {"price": data.error.error, "amount": 0, "status": 'error'};
        }
    }

    // Turns a (non-error) response into the price shape consumed by GetPrice/GetPricesBreakdown:
    // a {price, amount:1} object for a scalar source ([market], [bazaar:avg]), otherwise a
    // listings array. Returns null when a bazaar source has nothing usable, which tells the
    // caller to fall back to the item market.
    function parsePrices(data, itemId, source, formula){
        if (source === SOURCE_MARKET_VALUE){
            return {"price": data.items[itemId].market_value, "amount": 1};
        }
        if (source === SOURCE_BAZAAR){
            if (bazaarSelector(formula).kind === 'avg'){
                return data.bazaar_average == null ? null : {"price": data.bazaar_average, "amount": 1};
            }
            let listings = normaliseBazaarListings(data);
            return listings.length > 0 ? listings : null;
        }
        if (data.itemmarket.listings[0].price == null){
            console.warn("[TornMarketFiller] The API is temporarily disabled, please try again later");
            return {"price": 'API is OFF!', "amount": 0, "status": 'error'};
        }
        // temporary hotfix to avoid wrong prices
        if (data.itemmarket.item.id != itemId){
            return {"price": 'API is BROKEN!', "amount": 0, "status": 'error'};
        }
        return data.itemmarket.listings;
    }

    // weav3r carries no item type, so a bazaar response can never teach us a category — the
    // caller keeps its cached guess and re-learns from Torn at the next expiry.
    function readCategoryFromData(data, itemId, source){
        try {
            if (source === SOURCE_MARKET_VALUE){
                return (data.items && data.items[itemId]) ? (data.items[itemId].type ?? null) : null;
            }
            if (source === SOURCE_BAZAAR){
                return null;
            }
            return (data.itemmarket && data.itemmarket.item) ? (data.itemmarket.item.type ?? null) : null;
        } catch (error) {
            return null;
        }
    }

    // Resolve the formula to use for an item: a per-category override (matched on the item's
    // type, case-insensitively) if set, otherwise the global default.
    function getEffectiveDelta(category){
        if (category != null){
            let override = categoryDeltas[String(category).trim().toLowerCase()];
            if (override != null && String(override).trim() !== ''){
                return String(override).trim();
            }
        }
        return priceDeltaRaw;
    }

    // Fetch pricing for an item using the price source its (possibly per-category) formula needs.
    // The item's category is read from the first response and cached; only the first ever fill of
    // an item whose category overrides the source costs a second request.
    // Returns {prices, formula, category} — the category also drives the quantity mode.
    async function fetchPricingForItem(itemId){
        try {
            // No per-category overrides of either kind → category is irrelevant; behave like
            // the default path.
            if (Object.keys(categoryDeltas).length === 0 && !hasCategoryQuantityOverrides()){
                let source = sourceOf(priceDeltaRaw);
                let data = await fetchForSource(source, priceDeltaRaw, itemId);
                let error = mapApiError(data);
                if (error != null){
                    return { prices: error, formula: priceDeltaRaw, category: null };
                }
                return withBazaarFallback(parsePrices(data, itemId, source, priceDeltaRaw), priceDeltaRaw, source, itemId, null);
            }

            let cached = getCachedCategory(itemId);
            let expired = cached == null || (Date.now() - cached.ts) > CATEGORY_TTL_MS;
            let guessCategory = cached != null ? cached.type : null;
            let guessFormula = getEffectiveDelta(guessCategory);
            // When stale/unknown, force the items endpoint so we definitively re-learn the type even
            // if the chosen source omits it; otherwise guess from the cache to stay 1 call.
            let firstSource = expired ? SOURCE_MARKET_VALUE : sourceOf(guessFormula);
            let data = await fetchForSource(firstSource, guessFormula, itemId);
            let error = mapApiError(data);
            if (error != null){
                return { prices: error, formula: guessFormula, category: guessCategory };
            }
            let actualType = readCategoryFromData(data, itemId, firstSource);
            let category = actualType != null ? actualType : guessCategory;
            if (actualType != null && (cached == null || cached.type !== actualType || expired)){
                cacheItemCategory(itemId, actualType);
            }
            let formula = getEffectiveDelta(category);
            let source = sourceOf(formula);
            if (source !== firstSource){
                data = await fetchForSource(source, formula, itemId);
                let error2 = mapApiError(data);
                if (error2 != null){
                    return { prices: error2, formula: formula, category: category };
                }
            }
            return withBazaarFallback(parsePrices(data, itemId, source, formula), formula, source, itemId, category);
        } catch (error) {
            console.error("[TornMarketFiller] Error fetching data:", error);
            return { prices: 'Failed!', formula: priceDeltaRaw, category: null };
        }
    }

    // A bazaar source weav3r cannot answer for this item falls back to Torn's item market rather
    // than failing the row, so one thin item never stops a Fill All run. The delta carries over;
    // the selector cannot, so the fallback formula is the bare delta.
    async function withBazaarFallback(prices, formula, source, itemId, category){
        if (prices != null){
            return { prices: prices, formula: formula, category: category };
        }
        console.warn("[TornMarketFiller] No usable weav3r bazaar price for item " + itemId + "; using the item market.");
        let fallbackFormula = stripDeltaBracket(formula);
        let data = await fetchForSource(SOURCE_ITEM_MARKET, fallbackFormula, itemId);
        let error = mapApiError(data);
        if (error != null){
            return { prices: error, formula: fallbackFormula, category: category };
        }
        return { prices: parsePrices(data, itemId, SOURCE_ITEM_MARKET, fallbackFormula), formula: fallbackFormula, category: category };
    }

    function GetPrice(prices, formula){
        if (prices == null){
            return 'No prices loaded';
        }
        if (prices.amount == 0){
            return prices.price;
        }
        let priceDelta = stripDeltaBracket(formula);
        // A scalar source ([market], [bazaar:avg]) arrives as one {price, amount} object rather
        // than a listings array, so the shape decides — not the formula that produced it.
        if (prices.price !== undefined) {
            return Math.round(performOperation(prices.price, priceDelta));
        }
        if (isMedianFormula(formula)) {
            return Math.round(performOperation(getMedianPrice(prices), priceDelta));
        }
        let slot = listingSlot(formula);
        return Math.round(performOperation(prices[Math.min(slot, prices.length - 1)].price, priceDelta));
    }

    async function handleFillClick(event, itemId){
        let target = event.currentTarget || event.target;
        // A manual Fill on an excluded item still fills — the exclusion only governs Fill All —
        // but it says so, so an accidental click on the wrong row is obvious straight away.
        let itemIdNum = parseInt(itemId, 10);
        if (!isNaN(itemIdNum) && excluded.has(itemIdNum) && target.getAttribute('data-action-flag') == 'fill'){
            showToast("Heads up: this item is marked excluded (⊘). Filling it anyway because you clicked Fill.");
        }
        await performFill(target, itemId, true);
    }

    function hasCategoryQuantityOverrides(){
        return Object.keys(categoryQuantities).length > 0;
    }

    function isMaxQuantityMode(mode){
        let normalised = String(mode ?? 'max').trim().toLowerCase();
        return normalised === '' || normalised === 'max';
    }

    // Only "max-N" needs to know how many of the item you actually own.
    function needsRowMaximum(mode){
        return /^max\s*-\s*\d+$/.test(String(mode ?? '').trim().toLowerCase());
    }

    function isKnownQuantityMode(mode){
        let normalised = String(mode ?? '').trim().toLowerCase();
        return isMaxQuantityMode(normalised) || normalised === 'skip' || normalised === 'none' ||
            /^\d+$/.test(normalised) || needsRowMaximum(normalised);
    }

    // Resolve a quantity mode against a row's maximum. Returns a positive integer to list, or
    // null when the row should be left completely untouched ("keep them all").
    // Accepted syntax: "max", "max-N", a plain number, and "skip"/"none"/"0".
    function resolveQuantity(maxQuantity, mode){
        let normalised = String(mode ?? 'max').trim().toLowerCase();
        let fixed = normalised.match(/^(\d+)$/);
        let maxMinus = normalised.match(/^max\s*-\s*(\d+)$/);
        if (normalised === 'skip' || normalised === 'none' || (fixed && parseInt(fixed[1], 10) === 0)){
            return null;
        }
        if (fixed){
            // A fixed amount doesn't need the row's maximum — Torn clamps anything too large.
            let wanted = parseInt(fixed[1], 10);
            return maxQuantity != null ? Math.min(wanted, maxQuantity) : wanted;
        }
        if (maxMinus){
            if (maxQuantity == null){
                console.warn("[TornMarketFiller] Row quantity unknown — leaving the row alone rather than risk listing a kept copy.");
                return null;
            }
            let wanted = maxQuantity - parseInt(maxMinus[1], 10);
            return wanted > 0 ? wanted : null;
        }
        if (!isMaxQuantityMode(normalised)){
            console.warn("[TornMarketFiller] Unrecognised quantity mode '" + mode + "', using max.");
        }
        return maxQuantity;
    }

    // Same lookup as getEffectiveDelta, for the quantity mode.
    function getEffectiveQuantity(category){
        if (category != null){
            let override = categoryQuantities[String(category).trim().toLowerCase()];
            if (override != null && String(override).trim() !== ''){
                return String(override).trim();
            }
        }
        return quantityModeRaw;
    }

    function setQuantityInputs(inputs, value){
        inputs.forEach(x => { x.value = value; });
        inputs[0].dispatchEvent(new Event("input", {bubbles: true}));
    }

    function nextFrame(){
        return new Promise(function(resolve){
            requestAnimationFrame(function(){ requestAnimationFrame(resolve); });
        });
    }

    // Torn clamps the amount input to however many of the item you own, so writing an absurd
    // value and reading it back is the most reliable way to learn the row's maximum. Falls back
    // to the "xN" count in the row's own text if the clamp doesn't materialise.
    async function discoverMaxQuantity(quantityInputs, parentRow){
        setQuantityInputs(quantityInputs, Number.MAX_SAFE_INTEGER);
        await nextFrame();
        let clamped = parseInt(String(quantityInputs[0].value).replace(/[^\d]/g, ''), 10);
        setQuantityInputs(quantityInputs, '');
        if (!isNaN(clamped) && clamped > 0 && clamped < Number.MAX_SAFE_INTEGER){
            return clamped;
        }
        let match = String(parentRow.textContent).match(/\bx\s?(\d[\d,]*)/i);
        if (match != null){
            let parsed = parseInt(match[1].replace(/,/g, ''), 10);
            if (!isNaN(parsed) && parsed > 0){
                return parsed;
            }
        }
        console.warn("[TornMarketFiller] Row maximum quantity could not be determined.");
        return null;
    }

    // Add Items rows only. Returns 'ok' once the row's amount is settled, or 'skipped' when the
    // quantity mode resolves to nothing to list — in which case the row is left untouched.
    async function applyQuantity(target, action, category, isAuto){
        let parentRow = findParentByCondition(target, (el) => String(el.className).indexOf('info___') > -1);
        if (parentRow == null){
            return 'ok';
        }
        let mode = getEffectiveQuantity(category);
        let quantityInputs = parentRow.querySelectorAll('[class^=amountInputWrapper___] .input-money-group > .input-money');
        if (quantityInputs.length === 0){
            // Single-copy rows (most clothing) carry a checkbox instead of an amount input,
            // so their maximum is 1 by definition.
            let checkbox = parentRow.querySelector('[class^=checkboxWrapper___] > [class^=checkboxContainer___] [type=checkbox]');
            if (checkbox == null){
                return 'ok';
            }
            if (action == 'fill'){
                if (resolveQuantity(1, mode) === null){
                    reportSkipped(mode, 1, isAuto);
                    return 'skipped';
                }
                if (!checkbox.checked){
                    checkbox.click();
                }
            } else if (checkbox.checked){
                checkbox.click();
            }
            return 'ok';
        }

        let hasUserAmount = quantityInputs[0].value.length !== 0 && parseInt(quantityInputs[0].value) >= 1;
        if (action == 'clear'){
            setQuantityInputs(quantityInputs, hasUserAmount ? '' : 0);
            return 'ok';
        }
        if (hasUserAmount){
            // An amount the user typed themselves wins over any quantity mode.
            quantityInputs[0].dispatchEvent(new Event("input", {bubbles: true}));
            return 'ok';
        }
        if (isMaxQuantityMode(mode) || !isKnownQuantityMode(mode)){
            // Unparseable modes fall back to "max" rather than silently listing nothing.
            if (!isKnownQuantityMode(mode)){
                console.warn("[TornMarketFiller] Unrecognised quantity mode '" + mode + "', using max.");
            }
            setQuantityInputs(quantityInputs, Number.MAX_SAFE_INTEGER); // Torn clamps it to what you own
            return 'ok';
        }
        let maxQuantity = needsRowMaximum(mode) ? await discoverMaxQuantity(quantityInputs, parentRow) : null;
        let resolved = resolveQuantity(maxQuantity, mode);
        if (resolved === null){
            setQuantityInputs(quantityInputs, '');
            reportSkipped(mode, maxQuantity, isAuto);
            return 'skipped';
        }
        setQuantityInputs(quantityInputs, resolved);
        return 'ok';
    }

    function reportSkipped(mode, maxQuantity, isAuto){
        let modeLabel = String(mode ?? 'max').trim();
        console.info("[TornMarketFiller] Row left untouched — quantity mode '" + modeLabel +
                     "' lists nothing out of " + (maxQuantity ?? "an unknown number") + ".");
        if (!isAuto){
            showToast("Nothing listed — quantity mode \"" + modeLabel + "\" keeps all " +
                      (maxQuantity ?? "?") + " of this item.");
        }
    }

    // showPopup=false is the auto-fill path: no prices popup, no input changes on
    // API errors. Returns "ok" | "rate-limited" | "invalid-key" | "error".
    async function performFill(target, itemId, showPopup){
        let priceInputs = target.parentNode.querySelectorAll('input.input-money');
        const popup = showPopup ? document.querySelector('.silmaril-market-filler-popup') : null;
        if (popup) {
            recentFilledInput = priceInputs;
            if (popupOffsetX === 0) {
                const rect = target.getBoundingClientRect();
                popupOffsetX = Math.max(10, rect.left - 300);
                localStorage.setItem("silmaril-torn-market-filler-popup-offset-x", popupOffsetX);
            }

            let left = popupOffsetX;
            let top = popupOffsetY;

            popup.style.display = showPricesPopup ? 'block' : 'none';
            popup.style.visibility = 'hidden';
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
            popup.querySelector('.silmaril-market-filler-popup-body').innerHTML = LOADING_THE_PRICES;

            const popupRect = popup.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            let clamped = false;
            if (popupRect.right > viewportWidth) {
                left = Math.max(0, viewportWidth - popupRect.width - 10);
                clamped = true;
            }
            if (popupRect.left < 0) {
                left = 10;
                clamped = true;
            }
            if (popupRect.bottom > viewportHeight) {
                top = Math.max(0, viewportHeight - popupRect.height - 10);
                clamped = true;
            }
            if (popupRect.top < 0) {
                top = 10;
                clamped = true;
            }

            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
            popup.style.visibility = 'visible';

            if (clamped) {
                popupOffsetX = left;
                popupOffsetY = top;
                localStorage.setItem("silmaril-torn-market-filler-popup-offset-x", popupOffsetX);
                localStorage.setItem("silmaril-torn-market-filler-popup-offset-y", popupOffsetY);
            }
        }

        let action = target.getAttribute('data-action-flag');
        let pricing = await fetchPricingForItem(itemId);
        let prices = pricing.prices;
        let status = getPricesStatus(prices);

        if (showPopup) {
            const breakdown = GetPricesBreakdown(prices);
            // Thanks to Rosti [2840742] for the help with the prices popup component
            showCustomFillPopup(target, breakdown);
        } else if (status !== 'ok') {
            // Auto-fill: leave the row untouched so it can be retried or skipped.
            return status;
        }

        // Quantity/checkbox handling only exists on the Add Items page. Your Items (view
        // listings) rows carry a remove-amount input instead — touching it would be wrong,
        // and the missing containers used to throw and abort the Fill All loop.
        if (getCurrentPage() == pages.AddItems){
            let quantityStatus = await applyQuantity(target, action, pricing.category, !showPopup);
            if (quantityStatus === 'skipped'){
                // Nothing is being listed, so leave the price (and the button state) alone.
                return 'skipped';
            }
        }

        let price = action == 'fill' ? GetPrice(prices, pricing.formula) : '';
        switchActionFlag(target);
        priceInputs.forEach(x => {x.value = price});
        priceInputs[0].dispatchEvent(new Event("input", {bubbles: true}));
        return status;
    }

    function getPricesStatus(prices){
        if (Array.isArray(prices)){
            return 'ok';
        }
        if (prices != null && typeof prices === 'object'){
            return prices.amount === 0 ? (prices.status ?? 'error') : 'ok';
        }
        return 'error'; // fetch failure ('Failed!') or anything unexpected
    }

    function hideAllFillPopups() {
        document.querySelector('.silmaril-market-filler-popup').style.display = 'none';
    }

    function showCustomFillPopup(targetElem, contentHTML) {
        const popup = document.querySelector('.silmaril-market-filler-popup');
        popup.querySelector('.silmaril-market-filler-popup-body').innerHTML = contentHTML;
        popup.querySelectorAll('.silmaril-torn-market-filler-popup-price').forEach(row => {
            row.addEventListener('click', (e) => {
                recentFilledInput.forEach(x => {x.value = parseInt(e.target.getAttribute('data-price')) - 1});
                recentFilledInput[0].dispatchEvent(new Event("input", {bubbles: true}));
            });
        });
    }

    function addCustomFillPopup() {
        const popup = document.createElement('div');
        popup.className = 'silmaril-market-filler-popup';
        popup.style.display = 'none';
        popup.style.left = popupOffsetX + 'px';
        popup.style.top = popupOffsetY + 'px';
        popup.innerHTML = '<div class="silmaril-market-filler-popup-close" title="Close">&times;</div><b class="silmaril-market-filler-popup-draggable">Drag from here</b><br><div class="silmaril-market-filler-popup-body"></div>';
        popup.querySelector('.silmaril-market-filler-popup-close').onclick = function(){ popup.style.display = 'none'; };
        document.body.appendChild(popup);

        const dragHandle = popup.querySelector('.silmaril-market-filler-popup-draggable');
        dragHandle.addEventListener("mousedown", (e) => {
            isDragging = true;
            dragStartX = e.clientX - popup.offsetLeft;
            dragStartY = e.clientY - popup.offsetTop;
        });

        document.addEventListener("mousemove", (e) => {
            if (isDragging) {
                popup.style.left = (e.clientX - dragStartX) + "px";
                popup.style.top = (e.clientY - dragStartY) + "px";
            }
        });

        document.addEventListener("mouseup", () => {
            if (isDragging) {
                popupOffsetX = popup.offsetLeft;
                popupOffsetY = popup.offsetTop;
                localStorage.setItem("silmaril-torn-market-filler-popup-offset-x", popupOffsetX);
                localStorage.setItem("silmaril-torn-market-filler-popup-offset-y", popupOffsetY);
            }
            isDragging = false;
        });

        // Touch events (mobile)
        dragHandle.addEventListener("touchstart", (e) => {
            isDragging = true;
            const touch = e.touches[0];
            dragStartX = touch.clientX - popup.offsetLeft;
            dragStartY = touch.clientY - popup.offsetTop;
            e.preventDefault();
        }, { passive: false });

        document.addEventListener("touchmove", (e) => {
            if (isDragging) {
                const touch = e.touches[0];
                popup.style.left = (touch.clientX - dragStartX) + "px";
                popup.style.top = (touch.clientY - dragStartY) + "px";
            }
        }, { passive: false });

        document.addEventListener("touchend", () => {
            if (isDragging) {
                popupOffsetX = popup.offsetLeft;
                popupOffsetY = popup.offsetTop;
                localStorage.setItem("silmaril-torn-market-filler-popup-offset-x", popupOffsetX);
                localStorage.setItem("silmaril-torn-market-filler-popup-offset-y", popupOffsetY);
            }
            isDragging = false;
        });
    }

    function getItemIdFromString(string){
        const match = string.match(/-(\d+)-/);
        if (match) {
            const number = match[1];
            return number;
        } else {
            console.error("[TornMarketFiller] ItemId not found!");
            return -1;
        }
    }

    function getItemIdFromImage(image){
        let numberPattern = /\/(\d+)\//;
        let match = image.src.match(numberPattern);
        if (match) {
            return parseInt(match[1], 10);
        } else {
            console.error("[TornMarketFiller] ItemId not found!");
            return -1;
        }
    }

    function switchActionFlag(target){
        switch (target.getAttribute('data-action-flag')){
            case 'fill':
                target.setAttribute('data-action-flag', 'clear');
                break;
            case 'clear':
            default:
                target.setAttribute('data-action-flag', 'fill');
                break;
        }
    }

    function findParentByCondition(element, conditionFn){
        let currentElement = element;
        while (currentElement !== null) {
            if (conditionFn(currentElement)) {
                return currentElement;
            }
            currentElement = currentElement.parentElement;
        }
        return null;
    }

    function loadFavourites(){
        try {
            let stored = JSON.parse(localStorage.getItem(favouritesStorageKey) ?? "[]");
            return new Set(Array.isArray(stored) ? stored : []);
        } catch (error) {
            console.error("[TornMarketFiller] Failed to load favourites:", error);
            return new Set();
        }
    }

    function saveFavourites(){
        localStorage.setItem(favouritesStorageKey, JSON.stringify([...favourites]));
    }

    function loadExcluded(){
        try {
            let stored = JSON.parse(localStorage.getItem(excludedStorageKey) ?? "[]");
            return new Set(Array.isArray(stored) ? stored : []);
        } catch (error) {
            console.error("[TornMarketFiller] Failed to load excluded items:", error);
            return new Set();
        }
    }

    function saveExcluded(){
        localStorage.setItem(excludedStorageKey, JSON.stringify([...excluded]));
    }

    function getItemState(itemId){
        if (excluded.has(itemId)) {
            return 'excluded';
        }
        return favourites.has(itemId) ? 'favourite' : 'neutral';
    }

    // neutral → favourite → excluded → neutral. The three states are mutually exclusive.
    function cycleItemState(itemId){
        switch (getItemState(itemId)) {
            case 'neutral':
                favourites.add(itemId);
                break;
            case 'favourite':
                favourites.delete(itemId);
                excluded.add(itemId);
                break;
            default:
                excluded.delete(itemId);
                break;
        }
        saveFavourites();
        saveExcluded();
        let state = getItemState(itemId);
        document.querySelectorAll('.tmf-fav[data-tmf-item-id="' + itemId + '"]').forEach(function(el){
            renderFavIcon(el, state);
        });
    }

    function renderFavIcon(el, state){
        el.textContent = state === 'favourite' ? '★' : (state === 'excluded' ? '⊘' : '☆');
        el.classList.toggle('tmf-fav--on', state === 'favourite');
        el.classList.toggle('tmf-fav--off', state === 'excluded');
        el.title = state === 'favourite'
            ? 'Favourite — filled by Fill All. Click to exclude.'
            : (state === 'excluded'
               ? 'Excluded — never filled by Fill All, and a manual Fill warns first. Click to reset.'
               : 'Click to mark as a favourite (used by Fill All).');
    }

    function loadFillAllState(){
        try {
            let raw = localStorage.getItem(fillAllStateKey);
            if (!raw) {
                return null;
            }
            let parsed = JSON.parse(raw);
            if (parsed && typeof parsed.left === 'number' && typeof parsed.top === 'number') {
                return parsed;
            }
        } catch (error) {
            console.error("[TornMarketFiller] Failed to load Fill All position:", error);
        }
        return null;
    }

    function saveFillAllState(){
        localStorage.setItem(fillAllStateKey, JSON.stringify(fillAllState));
    }

    function setBarLeftTop(bar, left, top){
        bar.style.right = 'auto';
        bar.style.bottom = 'auto';
        bar.style.left = left + 'px';
        bar.style.top = top + 'px';
    }

    // Clamp the bar's top-left so it stays fully on-screen with a small margin.
    function clampBarLeftTop(bar, left, top){
        let maxLeft = Math.max(FILLALL_VIEWPORT_MARGIN_PX, window.innerWidth - bar.offsetWidth - FILLALL_VIEWPORT_MARGIN_PX);
        let maxTop = Math.max(FILLALL_VIEWPORT_MARGIN_PX, window.innerHeight - bar.offsetHeight - FILLALL_VIEWPORT_MARGIN_PX);
        return {
            left: Math.min(Math.max(FILLALL_VIEWPORT_MARGIN_PX, left), maxLeft),
            top: Math.min(Math.max(FILLALL_VIEWPORT_MARGIN_PX, top), maxTop)
        };
    }

    // Nearest viewport edge if the bar is within the snap threshold of it (or past it), else null.
    function nearestSnapEdge(bar){
        let r = bar.getBoundingClientRect();
        let distLeft = r.left;
        let distRight = window.innerWidth - r.right;
        let distTop = r.top;
        let distBottom = window.innerHeight - r.bottom;
        let min = Math.min(distLeft, distRight, distTop, distBottom);
        if (min > FILLALL_EDGE_SNAP_PX) {
            return null;
        }
        if (min === distLeft) { return 'left'; }
        if (min === distRight) { return 'right'; }
        if (min === distTop) { return 'top'; }
        return 'bottom';
    }

    // Push the bar flush against the given edge, keeping its cross-axis position on-screen.
    function snapBarToEdge(bar, edge){
        let maxLeft = Math.max(0, window.innerWidth - bar.offsetWidth);
        let maxTop = Math.max(0, window.innerHeight - bar.offsetHeight);
        let r = bar.getBoundingClientRect();
        let left = Math.min(Math.max(0, r.left), maxLeft);
        let top = Math.min(Math.max(0, r.top), maxTop);
        switch (edge) {
            case 'left': left = 0; break;
            case 'right': left = maxLeft; break;
            case 'top': top = 0; break;
            case 'bottom': top = maxTop; break;
        }
        setBarLeftTop(bar, left, top);
    }

    // Re-apply the persisted position/minimised state. Safe to call again on resize.
    function applyFillAllState(bar){
        if (fillAllState == null) {
            return; // never moved — keep the default CSS anchor (bottom-right)
        }
        bar.classList.toggle('tmf-fillall-bar--min', !!fillAllState.minimised);
        if (fillAllState.minimised && fillAllState.edge) {
            setBarLeftTop(bar, fillAllState.left, fillAllState.top);
            snapBarToEdge(bar, fillAllState.edge);
        } else {
            let clamped = clampBarLeftTop(bar, fillAllState.left, fillAllState.top);
            setBarLeftTop(bar, clamped.left, clamped.top);
        }
    }

    // Restore a minimised bar to its full size near where its handle sits.
    function expandFillAllBar(bar){
        bar.classList.remove('tmf-fillall-bar--min');
        let r = bar.getBoundingClientRect();
        let clamped = clampBarLeftTop(bar, r.left, r.top);
        setBarLeftTop(bar, clamped.left, clamped.top);
        fillAllState = { left: clamped.left, top: clamped.top, minimised: false, edge: null };
        saveFillAllState();
    }

    // End of a drag gesture: snap + minimise when dropped near an edge, otherwise stay expanded.
    function finishFillAllDrag(bar){
        bar.classList.remove('tmf-fillall-bar--dragging');
        let edge = nearestSnapEdge(bar);
        if (edge) {
            bar.classList.add('tmf-fillall-bar--min'); // changes size before we measure/snap
            snapBarToEdge(bar, edge);
            let r = bar.getBoundingClientRect();
            fillAllState = { left: r.left, top: r.top, minimised: true, edge: edge };
        } else {
            bar.classList.remove('tmf-fillall-bar--min');
            let r = bar.getBoundingClientRect();
            let clamped = clampBarLeftTop(bar, r.left, r.top);
            setBarLeftTop(bar, clamped.left, clamped.top);
            fillAllState = { left: clamped.left, top: clamped.top, minimised: false, edge: null };
        }
        saveFillAllState();
    }

    // Whole-bar drag with click/drag disambiguation: a clean tap still triggers the button
    // it landed on (or expands a minimised bar), while a drag moves the bar and suppresses the
    // trailing click.
    function attachFillAllDrag(bar){
        let startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
        let candidate = false, dragging = false, suppressClick = false;

        function begin(clientX, clientY){
            candidate = true;
            dragging = false;
            let r = bar.getBoundingClientRect();
            baseLeft = r.left;
            baseTop = r.top;
            startX = clientX;
            startY = clientY;
        }
        function move(clientX, clientY){
            if (!candidate) {
                return;
            }
            let dx = clientX - startX, dy = clientY - startY;
            if (!dragging) {
                if (Math.abs(dx) + Math.abs(dy) < FILLALL_DRAG_THRESHOLD_PX) {
                    return;
                }
                dragging = true;
                bar.classList.add('tmf-fillall-bar--dragging');
            }
            setBarLeftTop(bar, baseLeft + dx, baseTop + dy);
        }
        function end(){
            if (!candidate) {
                return;
            }
            candidate = false;
            if (dragging) {
                dragging = false;
                suppressClick = true;
                finishFillAllDrag(bar);
            } else if (bar.classList.contains('tmf-fillall-bar--min')) {
                expandFillAllBar(bar);
            }
        }

        bar.addEventListener('mousedown', function(e){ begin(e.clientX, e.clientY); });
        document.addEventListener('mousemove', function(e){ if (candidate) { move(e.clientX, e.clientY); } });
        document.addEventListener('mouseup', end);

        bar.addEventListener('touchstart', function(e){ let t = e.touches[0]; begin(t.clientX, t.clientY); }, { passive: true });
        document.addEventListener('touchmove', function(e){
            if (!candidate) {
                return;
            }
            let t = e.touches[0];
            move(t.clientX, t.clientY);
            if (dragging) {
                e.preventDefault(); // stop the page scrolling while dragging
            }
        }, { passive: false });
        document.addEventListener('touchend', end);
        document.addEventListener('touchcancel', end);

        // Capture-phase on the bar itself: runs before any child's own click handler, so the
        // click that follows a drag never reaches Fill All or the settings cog. Listening on the
        // bar (rather than each button) also clears the flag when a drag ends on the grip.
        bar.addEventListener('click', function(e){
            if (suppressClick) {
                suppressClick = false;
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);
    }

    function ensureFillAllUI(){
        let bar = document.querySelector(".tmf-fillall-bar");
        if (bar == null) {
            bar = document.createElement('div');
            bar.className = 'tmf-fillall-bar';
            const grip = document.createElement('span');
            grip.className = 'tmf-fillall-grip';
            grip.textContent = '⠿';
            grip.title = 'Drag to move; drop near an edge to minimise';
            // Second way into the settings, next to the always-visible Fill All button —
            // the press-and-hold on a row's fill button remains available too.
            const cog = document.createElement('span');
            cog.className = 'tmf-fillall-cog';
            cog.textContent = '⚙';
            cog.title = 'Open Market Filler settings';
            const btn = document.createElement('input');
            btn.type = 'button';
            btn.className = 'torn-btn tmf-fillall-btn';
            const dot = document.createElement('span');
            dot.className = 'tmf-autofill-dot';
            bar.append(grip, cog, btn, dot);
            cog.addEventListener('click', function(event){
                event.stopPropagation();
                openSettingsModal();
            });
            btn.addEventListener('click', function(event){
                event.stopPropagation();
                if (autoFillActive) {
                    stopAutoFill();
                } else {
                    startAutoFill();
                }
            });
            document.body.appendChild(bar);
            attachFillAllDrag(bar);
            applyFillAllState(bar);
        }
        if (document.querySelector(".tmf-viewport-border") == null) {
            const border = document.createElement('div');
            border.className = 'tmf-viewport-border';
            document.body.appendChild(border);
        }
        applyChatRelativeZIndex();
        updateAutoFillUI();
    }

    // Torn's chat is a body-level overlay anchored bottom-right. Read its z-index and
    // drop our floating UI just below it so an open chat window is never overshadowed.
    function detectChatZIndex(){
        let el = document.querySelector("#chatRoot");
        while (el && el !== document.body) {
            let z = parseInt(window.getComputedStyle(el).zIndex, 10);
            if (!isNaN(z)) {
                return z;
            }
            el = el.parentElement;
        }
        return null;
    }

    function applyChatRelativeZIndex(){
        let bar = document.querySelector(".tmf-fillall-bar");
        if (bar == null) {
            return;
        }
        if (chatRelativeZBase == null) {
            let chatZ = detectChatZIndex();
            if (chatZ == null) {
                // Chat may not have mounted yet; retry shortly without blocking.
                setTimeout(applyChatRelativeZIndex, 1500);
                return;
            }
            chatRelativeZBase = Math.max(chatZ - 1, 1);
        }
        bar.style.zIndex = chatRelativeZBase;
        let border = document.querySelector(".tmf-viewport-border");
        if (border != null) {
            border.style.zIndex = Math.max(chatRelativeZBase - 1, 1);
        }
        let toast = document.querySelector(".tmf-toast");
        if (toast != null) {
            toast.style.zIndex = chatRelativeZBase;
        }
    }

    function updateAutoFillUI(){
        let bar = document.querySelector(".tmf-fillall-bar");
        if (bar != null) {
            bar.querySelector(".tmf-fillall-btn").value = autoFillActive ? "Stop fill" : "Fill All ★";
            bar.classList.toggle("tmf-fillall-bar--active", autoFillActive);
        }
        let border = document.querySelector(".tmf-viewport-border");
        if (border != null) {
            border.classList.toggle("tmf-viewport-border--active", autoFillActive);
        }
    }

    function showToast(message){
        let toast = document.querySelector('.tmf-toast');
        if (toast == null){
            toast = document.createElement('div');
            toast.className = 'tmf-toast';
            document.body.appendChild(toast);
            if (chatRelativeZBase != null) {
                toast.style.zIndex = chatRelativeZBase;
            }
        }
        toast.textContent = message;
        toast.classList.add('tmf-toast--visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function(){
            toast.classList.remove('tmf-toast--visible');
        }, 4000);
    }

    function startAutoFill(){
        if (favourites.size === 0){
            showToast('No favourites set yet — tap the ☆ star next to an item first, then use Fill All.');
            return;
        }
        checkApiKey();
        autoFillActive = true;
        autoFillQueue = [];
        autoFillQueuedIds = new Set();
        autoFillDoneIds = new Set();
        updateAutoFillUI();
        enqueueVisibleFavourites();
        runAutoFillLoop();
    }

    function stopAutoFill(){
        autoFillActive = false;
        autoFillQueue = [];
        autoFillQueuedIds.clear();
        updateAutoFillUI();
    }

    function enqueueVisibleFavourites(){
        document.querySelectorAll(".silmaril-market-filler-processed[data-tmf-item-id]").forEach(enqueueFavouriteRow);
    }

    function enqueueFavouriteRow(wrapper){
        if (!autoFillActive) {
            return;
        }
        let itemId = parseInt(wrapper.dataset.tmfItemId, 10);
        if (!favourites.has(itemId) || excluded.has(itemId) || autoFillDoneIds.has(itemId) || autoFillQueuedIds.has(itemId)) {
            return;
        }
        autoFillQueuedIds.add(itemId);
        autoFillQueue.push(wrapper);
        runAutoFillLoop();
    }

    async function runAutoFillLoop(){
        if (autoFillLoopRunning) {
            return;
        }
        autoFillLoopRunning = true;
        try {
            while (autoFillActive && autoFillQueue.length > 0) {
                let wrapper = autoFillQueue.shift();
                let itemId = parseInt(wrapper.dataset.tmfItemId, 10);
                if (!wrapper.isConnected || !favourites.has(itemId) || excluded.has(itemId)) {
                    // Row unmounted or unfavourited meanwhile; the observer re-queues it
                    // if it shows up again.
                    autoFillQueuedIds.delete(itemId);
                    continue;
                }
                let fillBtn = wrapper.querySelector(".silmaril-market-filler-button");
                if (fillBtn == null || fillBtn.getAttribute('data-action-flag') !== 'fill') {
                    // Already filled (button is in "clear" state) — count as done.
                    autoFillQueuedIds.delete(itemId);
                    autoFillDoneIds.add(itemId);
                    continue;
                }
                let status;
                try {
                    status = await performFill(fillBtn, itemId, false);
                } catch (error) {
                    // A single row with unexpected DOM must not abort the whole run.
                    console.error("[TornMarketFiller] Fill All failed for item " + itemId + ":", error);
                    status = "error";
                }
                if (status === "rate-limited") {
                    autoFillQueue.unshift(wrapper); // retry the same row after the pause
                    await sleep(randomBetween(RATE_LIMIT_PAUSE_MIN_MS, RATE_LIMIT_PAUSE_MAX_MS));
                    continue;
                }
                if (status === "invalid-key") {
                    console.error("[TornMarketFiller] Stopping Fill All: API key is invalid.");
                    stopAutoFill();
                    break;
                }
                autoFillQueuedIds.delete(itemId);
                autoFillDoneIds.add(itemId);
                if (status !== "ok" && status !== "skipped") {
                    console.warn("[TornMarketFiller] Fill All skipped item " + itemId + " after error.");
                }
                await sleep(randomBetween(FILL_COOLDOWN_MIN_MS, FILL_COOLDOWN_MAX_MS));
            }
        } finally {
            autoFillLoopRunning = false;
        }
        // Rows enqueued while the loop was winding down (e.g. during the last cooldown)
        if (autoFillActive && autoFillQueue.length > 0) {
            runAutoFillLoop();
        }
    }

    function sleep(ms){
        return new Promise(function(resolve){ setTimeout(resolve, ms); });
    }

    function randomBetween(min, max){
        return min + Math.random() * (max - min);
    }

    function loadCategoryDeltas(){
        try {
            let parsed = JSON.parse(localStorage.getItem(categoryDeltasKey) ?? "{}");
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch (error) {
            console.error("[TornMarketFiller] Failed to load category deltas:", error);
            return {};
        }
    }

    function saveCategoryDeltas(){
        localStorage.setItem(categoryDeltasKey, JSON.stringify(categoryDeltas));
    }

    function loadCategoryQuantities(){
        try {
            let parsed = JSON.parse(localStorage.getItem(categoryQuantitiesKey) ?? "{}");
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch (error) {
            console.error("[TornMarketFiller] Failed to load category quantities:", error);
            return {};
        }
    }

    function saveCategoryQuantities(){
        localStorage.setItem(categoryQuantitiesKey, JSON.stringify(categoryQuantities));
    }

    function loadItemCategoryCache(){
        try {
            let parsed = JSON.parse(localStorage.getItem(itemCategoryCacheKey) ?? "{}");
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    // Returns the cached {type, ts} for an item, normalising legacy bare-string entries
    // (which predate timestamps) to an immediately-stale ts so they get re-verified.
    function getCachedCategory(itemId){
        let entry = itemCategoryCache[itemId];
        if (entry == null){
            return null;
        }
        if (typeof entry === 'string'){
            return { type: entry, ts: 0 };
        }
        if (typeof entry === 'object' && typeof entry.type === 'string'){
            return { type: entry.type, ts: typeof entry.ts === 'number' ? entry.ts : 0 };
        }
        return null;
    }

    function cacheItemCategory(itemId, type){
        itemCategoryCache[itemId] = { type: type, ts: Date.now() };
        try {
            localStorage.setItem(itemCategoryCacheKey, JSON.stringify(itemCategoryCache));
        } catch (error) {
            // Ignore storage quota errors; the in-memory cache still helps this session.
        }
    }

    function clearItemCategoryCache(){
        itemCategoryCache = {};
        try {
            localStorage.removeItem(itemCategoryCacheKey);
        } catch (error) {
            // Ignore storage errors; the in-memory cache is cleared regardless.
        }
    }

    // ---- "What's new" popup ----------------------------------------------------------------

    function compareVersions(left, right){
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

    // A first install has no "before" to report, so it records the version silently and the
    // popup waits for a real update. Anything else shows every release since the one last seen.
    function maybeShowChangelog(){
        let lastSeen;
        try {
            lastSeen = localStorage.getItem(lastSeenVersionKey);
        } catch (error) {
            return;
        }
        if (lastSeen === SCRIPT_VERSION){
            return;
        }
        if (lastSeen == null){
            rememberChangelogSeen();
            return;
        }
        let unseen = CHANGELOG.filter(function(release){ return compareVersions(release.version, lastSeen) > 0; });
        if (unseen.length === 0){
            rememberChangelogSeen();
            return;
        }
        openChangelogModal(unseen);
    }

    function rememberChangelogSeen(){
        try {
            localStorage.setItem(lastSeenVersionKey, SCRIPT_VERSION);
        } catch (error) {
            // A blocked localStorage only means the popup returns on the next page load.
        }
    }

    // Entries are literals defined in this file, so their inline markup is intentional.
    function renderChangelogRelease(release, index){
        return '<div class="tmf-changelog-release">' +
                   '<div class="tmf-changelog-ver"><b>v' + release.version + '</b>' +
                       (index === 0 ? '<span class="tmf-changelog-badge">new</span>' : '') +
                       '<span class="tmf-changelog-date">' + release.date + '</span>' +
                   '</div>' +
                   '<ul class="tmf-changelog-items">' +
                       release.changes.map(function(change){ return '<li>' + change + '</li>'; }).join('') +
                   '</ul>' +
               '</div>';
    }

    function openChangelogModal(releases){
        if (releases.length === 0){
            return;
        }
        let overlay = document.querySelector('.tmf-changelog-overlay');
        if (overlay == null){
            overlay = document.createElement('div');
            // Borrows the settings modal's chrome, so the popup needs no layout of its own.
            overlay.className = 'tmf-modal-overlay tmf-changelog-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML =
            '<div class="tmf-modal">' +
                '<h3>Market Filler v' + SCRIPT_VERSION + ' — what&rsquo;s new' +
                    '<span class="tmf-modal-close" title="Close">&times;</span>' +
                '</h3>' +
                releases.map(renderChangelogRelease).join('') +
                '<div class="tmf-modal-actions">' +
                    '<button type="button" class="tmf-changelog-settings">Open settings</button>' +
                    '<button type="button" class="tmf-modal-save tmf-changelog-ok">Got it</button>' +
                '</div>' +
            '</div>';

        overlay.querySelector('.tmf-modal-close').addEventListener('click', closeChangelogModal);
        overlay.querySelector('.tmf-changelog-ok').addEventListener('click', closeChangelogModal);
        overlay.querySelector('.tmf-changelog-settings').addEventListener('click', function(){
            closeChangelogModal();
            openSettingsModal();
        });
        overlay.addEventListener('click', function(event){ if (event.target === overlay){ closeChangelogModal(); } });
        overlay.classList.add('tmf-modal-overlay--open');
    }

    // Dismissing by any route counts as read — the popup must never nag.
    function closeChangelogModal(){
        let overlay = document.querySelector('.tmf-changelog-overlay');
        if (overlay != null){
            overlay.classList.remove('tmf-modal-overlay--open');
        }
        rememberChangelogSeen();
    }

    function ensureSettingsModal(){
        if (document.querySelector('.tmf-modal-overlay') != null){
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'tmf-modal-overlay';
        overlay.innerHTML =
            '<div class="tmf-modal">' +
                '<h3>Market Filler Settings<span class="tmf-modal-close" title="Close">&times;</span></h3>' +
                '<label>Default price delta</label>' +
                '<input type="text" class="tmf-modal-delta" placeholder="-1[0]">' +
                '<label>Default quantity</label>' +
                '<input type="text" class="tmf-modal-qty" placeholder="max">' +
                '<label>Public API key</label>' +
                '<input type="text" class="tmf-modal-apikey" placeholder="16-character key">' +
                '<label class="tmf-modal-toggle"><input type="checkbox" class="tmf-modal-popup">Show lowest-prices popup</label>' +
                '<label>Per-category overrides</label>' +
                '<div class="tmf-modal-cat-head"><span>Category</span><span>Price</span><span>Quantity</span><span></span></div>' +
                '<div class="tmf-modal-cats"></div>' +
                '<button type="button" class="tmf-modal-addcat">+ Add category</button>' +
                '<button type="button" class="tmf-modal-resetcat" title="Forget cached item categories. Use if Torn recategorised an item and a wrong discount is being applied.">Reset learned categories</button>' +
                '<button type="button" class="tmf-modal-clearexcl" title="Un-exclude every item marked ⊘, including ones not currently on screen.">Clear exclusions</button>' +
                '<div class="tmf-modal-actions">' +
                    '<button type="button" class="tmf-modal-cancel">Cancel</button>' +
                    '<button type="button" class="tmf-modal-save">Save</button>' +
                '</div>' +
                '<div class="tmf-modal-help">Item market: <code>-1[0]</code> (lowest listing − $1), <code>-5%</code>, <code>-1[1]</code> (2nd lowest listing), <code>[market]</code> (Torn market value), <code>-1[median]</code> (median listing).<br>' +
                'Player bazaars, via weav3r.dev, no API key: <code>-1[bazaar]</code> (cheapest bazaar − $1), <code>-1[bazaar:2]</code> (3rd cheapest), <code>-5%[bazaar:avg]</code> (bazaar average), <code>[bazaar:median]</code>.<br>' +
                'Quantity examples: <code>max</code> (all of them), <code>max-1</code> (keep one back), <code>max-3</code>, <code>1</code> (always list one), <code>skip</code> (never list this category).<br>' +
                'Category rows accept the same syntax and fall back to the defaults above when blank.</div>' +
            '</div>' +
            '<datalist id="tmf-modal-cat-list">' + SETTINGS_CATEGORIES.map(c => '<option value="' + c + '"></option>').join('') + '</datalist>';
        document.body.appendChild(overlay);

        overlay.querySelector('.tmf-modal-close').addEventListener('click', closeSettingsModal);
        overlay.querySelector('.tmf-modal-cancel').addEventListener('click', closeSettingsModal);
        overlay.addEventListener('click', function(event){ if (event.target === overlay){ closeSettingsModal(); } });
        overlay.querySelector('.tmf-modal-addcat').addEventListener('click', function(){ addCategoryRow('', '', ''); });
        overlay.querySelector('.tmf-modal-resetcat').addEventListener('click', function(event){
            clearItemCategoryCache();
            let btn = event.target;
            btn.textContent = 'Cleared ✓';
            setTimeout(function(){ btn.textContent = 'Reset learned categories'; }, 1500);
        });
        overlay.querySelector('.tmf-modal-clearexcl').addEventListener('click', function(event){
            excluded.clear();
            saveExcluded();
            document.querySelectorAll('.tmf-fav').forEach(function(el){
                renderFavIcon(el, getItemState(parseInt(el.dataset.tmfItemId, 10)));
            });
            let btn = event.target;
            btn.textContent = 'Cleared ✓';
            setTimeout(function(){ btn.textContent = 'Clear exclusions'; }, 1500);
        });
        overlay.querySelector('.tmf-modal-save').addEventListener('click', saveSettingsModal);
    }

    function addCategoryRow(name, formula, quantity){
        const list = document.querySelector('.tmf-modal-cats');
        if (list == null){
            return;
        }
        const row = document.createElement('div');
        row.className = 'tmf-modal-cat-row';
        row.innerHTML =
            '<input type="text" class="tmf-modal-cat-name" list="tmf-modal-cat-list" placeholder="Category">' +
            '<input type="text" class="tmf-modal-cat-formula" placeholder="-5%">' +
            '<input type="text" class="tmf-modal-cat-qty" placeholder="max-1">' +
            '<span class="tmf-modal-cat-del" title="Remove">&times;</span>';
        row.querySelector('.tmf-modal-cat-name').value = name;
        row.querySelector('.tmf-modal-cat-formula').value = formula;
        row.querySelector('.tmf-modal-cat-qty').value = quantity;
        row.querySelector('.tmf-modal-cat-del').addEventListener('click', function(){ row.remove(); });
        list.appendChild(row);
    }

    function openSettingsModal(){
        ensureSettingsModal();
        const overlay = document.querySelector('.tmf-modal-overlay');
        overlay.querySelector('.tmf-modal-delta').value = priceDeltaRaw;
        overlay.querySelector('.tmf-modal-qty').value = quantityModeRaw;
        overlay.querySelector('.tmf-modal-apikey').value = (apiKey != null && apiKey.indexOf('PDA-APIKEY') === -1) ? apiKey : '';
        overlay.querySelector('.tmf-modal-popup').checked = showPricesPopup;
        const list = overlay.querySelector('.tmf-modal-cats');
        list.innerHTML = '';
        // One row per category named by either map, so a category with only a quantity
        // override still shows up.
        let names = [...new Set(Object.keys(categoryDeltas).concat(Object.keys(categoryQuantities)))];
        names.forEach(function(key){ addCategoryRow(key, categoryDeltas[key] ?? '', categoryQuantities[key] ?? ''); });
        overlay.classList.add('tmf-modal-overlay--open');
    }

    function closeSettingsModal(){
        const overlay = document.querySelector('.tmf-modal-overlay');
        if (overlay != null){
            overlay.classList.remove('tmf-modal-overlay--open');
        }
    }

    function saveSettingsModal(){
        const overlay = document.querySelector('.tmf-modal-overlay');
        if (overlay == null){
            return;
        }
        let deltaVal = overlay.querySelector('.tmf-modal-delta').value.trim();
        if (deltaVal !== ''){
            priceDeltaRaw = deltaVal;
            localStorage.setItem("silmaril-torn-market-filler-price-delta", priceDeltaRaw);
        }
        let qtyVal = overlay.querySelector('.tmf-modal-qty').value.trim();
        quantityModeRaw = qtyVal === '' ? 'max' : qtyVal;
        localStorage.setItem("silmaril-torn-market-filler-quantity-mode", quantityModeRaw);
        let keyVal = overlay.querySelector('.tmf-modal-apikey').value.trim();
        if (keyVal.length === 16){
            apiKey = keyVal;
            localStorage.setItem("silmaril-torn-bazaar-filler-apikey", keyVal);
        } else if (keyVal !== ''){
            console.warn("[TornMarketFiller] API key must be 16 characters; ignored.");
        }
        showPricesPopup = overlay.querySelector('.tmf-modal-popup').checked;
        localStorage.setItem('silmaril-torn-market-filler-show-prices-popup', showPricesPopup ? '1' : '0');
        let map = {};
        let quantityMap = {};
        overlay.querySelectorAll('.tmf-modal-cat-row').forEach(function(row){
            let name = row.querySelector('.tmf-modal-cat-name').value.trim().toLowerCase();
            let formula = row.querySelector('.tmf-modal-cat-formula').value.trim();
            let quantity = row.querySelector('.tmf-modal-cat-qty').value.trim();
            if (name === ''){
                return;
            }
            if (formula !== ''){
                map[name] = formula;
            }
            if (quantity !== ''){
                quantityMap[name] = quantity;
            }
        });
        categoryDeltas = map;
        categoryQuantities = quantityMap;
        saveCategoryDeltas();
        saveCategoryQuantities();
        closeSettingsModal();
    }

    function GetPricesBreakdown(prices){
        if (prices == null) return "No prices loaded";
        if (prices[0] === undefined){
            prices = Array(prices);
        }
        const sb = new StringBuilder();
        for (let i = 0; i < Math.min(prices.length, 5); i++){
            if(typeof prices[i] !== "object" || prices[i].amount === undefined || prices[i].price === undefined) continue;
            sb.append(`<span class="silmaril-torn-market-filler-popup-price" data-price=${prices[i].price}>${prices[i].amount} x ${formatNumberWithCommas(prices[i].price)} (${formatNumberWithCommas(Math.round(prices[i].price * marketTaxFactor))})</span>`);
            if (i < Math.min(prices.length, 5)-1){
                sb.append('<br>');
            }
        }
        return sb.toString();
    }

    function performOperation(number, operation) {
        // A formula that is nothing but a source — "[market]", "[bazaar]" — leaves no delta
        // behind, and means "take the source price as it stands".
        if (operation == null || operation.trim() === '') {
            return number;
        }
        const match = operation.match(/^([-+]?)(\d+(?:\.\d+)?)(%)?$/);
        if (!match) {
            throw new Error('Invalid operation string');
        }
        const [, operator, operand, isPercentage] = match;
        const operandValue = parseFloat(operand);
        const adjustedOperand = isPercentage ? (number * operandValue) / 100 : operandValue;
        switch (operator) {
            case '':
            case '+':
                return number + adjustedOperand;
            case '-':
                return number - adjustedOperand;
            default:
                throw new Error('Invalid operator');
        }
    }

    function formatNumberWithCommas(number) {
        return new Intl.NumberFormat('en-US').format(number);
    }

    function checkApiKey(checkExisting = true) {
        if (!checkExisting || apiKey === null || apiKey.indexOf('PDA-APIKEY') > -1 || apiKey.length != 16){
            let userInput = prompt("Please enter a PUBLIC Api Key, it will be used to get current bazaar prices:", apiKey ?? '');
            if (userInput !== null && userInput.length == 16) {
                apiKey = userInput;
                localStorage.setItem("silmaril-torn-bazaar-filler-apikey", userInput);
            } else {
                console.error("[TornMarketFiller] User cancelled the Api Key input.");
            }
        }
    }

    function getMedianPrice(items) {
        const prices = items.flatMap(item => Array(item.amount).fill(item.price));
        prices.sort((a, b) => a - b);
        const mid = Math.floor(prices.length / 2);
        if (prices.length % 2 === 0) {
            return (prices[mid - 1] + prices[mid]) / 2;
        } else {
            return prices[mid];
        }
    }

    function getCurrentPage(){
        // Case-insensitive, and tolerant of the "Your Items" naming Torn uses for the
        // view-listings tab.
        let href = window.location.href.toLowerCase();
        if (href.indexOf('#/addlisting') > -1){
            return pages.AddItems;
        } else if (href.indexOf('#/viewlisting') > -1 || href.indexOf('#/youritems') > -1){
            return pages.ViewItems;
        } else {
            return pages.Other;
        }
    }

    function getCurrentMarketTax() {
        return 0.05;
    }

    // function getTornToday() {
    //     const now = document.querySelector('span.server-date-time').textContent.split(' ');
    //     return now[now.length - 1];
    // }

    function parseDate(str) {
        const [dd, mm, yy] = str.split('/').map(Number);
        const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;
        return new Date(fullYear, mm - 1, dd);
    }

    const startHold = () => {
        holdTimer = setTimeout(() => {
            openSettingsModal();
        }, 2000);
    };

    const cancelHold = () => {
        clearTimeout(holdTimer);
    };

    class StringBuilder {
        constructor() {
            this.parts = [];
        }
        append(str) {
            this.parts.push(str);
            return this;
        }
        toString() {
            return this.parts.join('');
        }
    }
})();