// ==UserScript==
// @name         Torn Bazaar Filler
// @namespace    https://github.com/SOLiNARY
// @version      1.8.0
// @description  On "Fill" click autofills bazaar item price with lowest market price currently minus $1 (can be customised), shows current price coefficient compared to 3rd lowest, fills the quantity your quantity mode asks for, marks checkboxes for guns. Click the ⚙ cog on the Fill All bar — or hold a Fill/Update button for 3s — to open the settings modal (price delta, quantity mode, API key, and per-category overrides — set different discounts/sources/quantities for Clothing, Other, Drug, etc.). Quantity modes: "max" (default), "max-1" to always keep a copy, a fixed number, or "skip" to never list a category. Cycle the star next to Fill/Update to mark an item as a favourite (★, used by Fill All) or excluded (⊘, never auto-filled). Use "Fill All" to auto-fill every favourite row on both the Add Items and Manage Items pages, including ones appearing later via infinite scroll or category switches. Drag the Fill All bar anywhere; drop it near a screen edge to clamp and minimise it — its position and state are remembered.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/bazaar.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    const bazaarUrl = "https://api.torn.com/market/{itemId}?selections=bazaar&key={apiKey}&comment=BazaarFiller";
    const marketUrl = "https://api.torn.com/v2/market?id={itemId}&selections=itemMarket&key={apiKey}&comment=BazaarFiller";
    const itemUrl = "https://api.torn.com/torn/{itemId}?selections=items&key={apiKey}&comment=BazaarFiller";
    let priceDeltaRaw = localStorage.getItem("silmaril-torn-bazaar-filler-price-delta") ?? '-1';
    // How many units to list per item: "max" (all of them), "max-N" (keep N back), a fixed
    // number, or "skip"/"0" to never list. Defaults to "max" — the behaviour before this existed.
    let quantityModeRaw = localStorage.getItem("silmaril-torn-bazaar-filler-quantity-mode") ?? 'max';
    let apiKey = localStorage.getItem("silmaril-torn-bazaar-filler-apikey");

    try {
        GM_registerMenuCommand('Open Settings', openSettingsModal);
    } catch (error) {
        console.log('[TornBazaarFiller] Tampermonkey not detected!');
    }

    // TornPDA support for GM_addStyle
    let GM_addStyle = function (s) {
        let style = document.createElement("style");
        style.type = "text/css";
        style.innerHTML = s;
        document.head.appendChild(style);
    };

    GM_addStyle(`.btn-wrap.torn-bazaar-fill-qty-price{float:right;margin-left:auto;z-index:99999}.btn-wrap.torn-bazaar-clear-qty-price{z-index:99999}div.title-wrap div.name-wrap{display:flex;justify-content:flex-end}.wave-animation{position:relative;overflow:hidden}.wave{pointer-events:none;position:absolute;width:100%;height:33px;background-color:transparent;opacity:0;transform:translateX(-100%);animation:waveAnimation 1s cubic-bezier(0, 0, 0, 1)}@keyframes waveAnimation{0%{opacity:1;transform:translateX(-100%)}100%{opacity:0;transform:translateX(100%)}}.overlay-percentage{position:absolute;top:0;background-color:rgba(0, 0, 0, 0.9);padding:0 5px;border-radius:15px;font-size:10px;pointer-events:none}.overlay-percentage-add{right:-30px}.overlay-percentage-manage{right:0}.torn-bazaar-fill-qty-price input{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;transition:box-shadow 0s}.torn-bazaar-fill-qty-price input.tbf-holding{box-shadow:inset 0 0 0 40px rgba(0,180,255,.35);transition:box-shadow 3s linear}.tbf-fav{cursor:pointer;font-size:16px;line-height:1;margin-left:auto;margin-right:6px;width:16px;text-align:center;color:#888;align-self:center;user-select:none;-webkit-user-select:none;z-index:99999}.tbf-fav~.btn-wrap.torn-bazaar-fill-qty-price{margin-left:0}.tbf-fav.tbf-fav--on{color:gold;text-shadow:0 0 3px rgba(255,215,0,.7)}.tbf-fillall-bar{position:fixed;bottom:110px;right:16px;display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(0,0,0,.55);border-radius:20px;z-index:999999;touch-action:none;transition:box-shadow .2s ease}.tbf-fillall-grip{cursor:grab;color:#bbb;font-size:14px;line-height:1;letter-spacing:-2px;min-width:12px;text-align:center;align-self:center;user-select:none;-webkit-user-select:none}.tbf-fillall-bar--dragging{cursor:grabbing;opacity:.92}.tbf-fillall-bar--dragging .tbf-fillall-grip{cursor:grabbing}.tbf-fillall-cog{cursor:pointer;flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.12);color:#ddd;font-size:13px;line-height:1;user-select:none;-webkit-user-select:none}.tbf-fillall-cog:hover{background:rgba(255,255,255,.28);color:#fff}.tbf-fillall-bar--min{padding:5px 7px;gap:4px}.tbf-fillall-bar--min .tbf-fillall-btn,.tbf-fillall-bar--min .tbf-fillall-cog{display:none}.tbf-fillall-bar--min .tbf-fillall-grip{font-size:16px}.tbf-autofill-dot{display:none;width:10px;height:10px;border-radius:50%;background:gold;box-shadow:0 0 4px gold;animation:tbfPulse 1s ease-in-out infinite}.tbf-fillall-bar--active .tbf-autofill-dot{display:inline-block}.tbf-fillall-bar--active{box-shadow:0 0 10px 2px rgba(255,215,0,.75)}@keyframes tbfPulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}.tbf-viewport-border{display:none;position:fixed;top:0;right:0;bottom:0;left:0;border:3px solid gold;box-shadow:inset 0 0 12px rgba(255,215,0,.6);pointer-events:none;z-index:999998}.tbf-viewport-border--active{display:block}.tbf-toast{position:fixed;bottom:158px;right:16px;max-width:280px;background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:8px;border:1px solid gold;font-size:13px;line-height:1.4;z-index:1000000;opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s}.tbf-toast--visible{opacity:1;visibility:visible}.tbf-fav.tbf-fav--off{color:#ff6b6b;text-shadow:none}`);

    GM_addStyle(`.tbf-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483000;justify-content:center;align-items:flex-start;overflow:auto;padding:24px 12px;box-sizing:border-box}.tbf-modal-overlay--open{display:flex}.tbf-modal{background:#1f1f1f;color:#e6e6e6;width:100%;max-width:420px;border:1px solid #666;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);padding:16px 18px;box-sizing:border-box;font-size:13px;line-height:1.5}.tbf-modal h3{margin:0 0 12px;font-size:15px;display:flex;justify-content:space-between;align-items:center;color:#fff}.tbf-modal-close{cursor:pointer;color:#bbb;font-size:22px;line-height:1}.tbf-modal label{display:block;margin:10px 0 3px;font-weight:bold;color:#cfcfcf}.tbf-modal input[type=text]{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:5px;border:1px solid #666;background:#111;color:#eee;font-size:13px}.tbf-modal-cats{margin-top:4px}.tbf-modal-cat-row{display:flex;gap:6px;margin-bottom:6px;align-items:center}.tbf-modal-cat-row .tbf-modal-cat-name{flex:1 1 55%}.tbf-modal-cat-row .tbf-modal-cat-formula{flex:1 1 45%}.tbf-modal-cat-del{cursor:pointer;color:#ff6b6b;font-size:20px;line-height:1;flex:0 0 auto;width:22px;text-align:center}.tbf-modal-addcat{margin-top:2px;cursor:pointer;background:#333;color:#eee;border:1px solid #666;border-radius:5px;padding:5px 10px;font-size:12px}.tbf-modal-resetcat{margin:2px 0 0 8px;cursor:pointer;background:#3a2a2a;color:#ddd;border:1px solid #774;border-radius:5px;padding:5px 10px;font-size:12px}.tbf-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.tbf-modal-actions button{cursor:pointer;padding:7px 16px;border-radius:5px;border:1px solid #666;background:#333;color:#eee;font-size:13px}.tbf-modal-save{background:#2e7d32!important;border-color:#2e7d32!important;color:#fff!important}.tbf-modal-help{margin-top:12px;font-size:11px;color:#9a9a9a;line-height:1.5}.tbf-modal-help code{background:#000;padding:1px 4px;border-radius:3px;color:#cfc}.tbf-modal-cat-row input{min-width:0}.tbf-modal-cat-row .tbf-modal-cat-name{flex:1 1 38%}.tbf-modal-cat-row .tbf-modal-cat-formula{flex:1 1 32%}.tbf-modal-cat-row .tbf-modal-cat-qty{flex:1 1 30%}.tbf-modal-cat-head{display:flex;gap:6px;margin:0 0 4px;font-size:11px;color:#9a9a9a}.tbf-modal-cat-head span:nth-child(1){flex:1 1 38%}.tbf-modal-cat-head span:nth-child(2){flex:1 1 32%}.tbf-modal-cat-head span:nth-child(3){flex:1 1 30%}.tbf-modal-cat-head span:nth-child(4){flex:0 0 22px}.tbf-modal-clearexcl{margin:2px 0 0 8px;cursor:pointer;background:#3a2a2a;color:#ddd;border:1px solid #774;border-radius:5px;padding:5px 10px;font-size:12px}`);

    const favouritesStorageKey = "silmaril-torn-bazaar-filler-favourites";
    let favourites = loadFavourites();

    // Excluded items are never touched by Fill All, and a manual Fill on one warns first.
    // An item is either neutral, a favourite or excluded — never two of those at once.
    const excludedStorageKey = "silmaril-torn-bazaar-filler-excluded";
    let excluded = loadExcluded();

    // Per-category price-delta overrides + a persistent item→category(type) cache.
    // Item categories are immutable, so caching them avoids extra API calls when picking
    // which price source a category's formula needs.
    const categoryDeltasKey = "silmaril-torn-bazaar-filler-category-deltas";
    // Per-category quantity overrides live in their own map so the existing delta entries keep
    // their shape (a bare formula string) and upgrade without migration.
    const categoryQuantitiesKey = "silmaril-torn-bazaar-filler-category-quantities";
    const itemCategoryCacheKey = "silmaril-torn-bazaar-filler-item-categories";
    // Item types are mostly immutable but Torn occasionally recategorises an item, so cached
    // categories are re-verified from each response and forcibly refreshed once past this TTL.
    const CATEGORY_TTL_MS = 14 * 24 * 60 * 60 * 1000;
    const SETTINGS_CATEGORIES = ["Melee","Primary","Secondary","Defensive","Temporary","Drug","Medical","Booster","Energy Drink","Alcohol","Enhancer","Clothing","Jewelry","Material","Flower","Plushie","Car","Supply Pack","Special","Collectible","Artifact","Tool","Other"];
    let categoryDeltas = loadCategoryDeltas();
    let categoryQuantities = loadCategoryQuantities();
    let itemCategoryCache = loadItemCategoryCache();

    // "Fill All" auto-fill mode state. One activation fills each favourite item once;
    // rows appearing later (infinite scroll, category switch) are picked up by the scan.
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
    const fillAllStateKey = "silmaril-torn-bazaar-filler-fillall-pos";
    const FILLALL_EDGE_SNAP_PX = 40;       // drop within this of an edge → clamp + minimise
    const FILLALL_DRAG_THRESHOLD_PX = 6;   // movement before a press counts as a drag
    const FILLALL_VIEWPORT_MARGIN_PX = 4;  // keep this gap from the edge when not snapped
    let fillAllState = loadFillAllState();

    const pages = { "AddItems": 10, "ManageItems": 20};
    const addItemsLabels = ["Fill", "Clear"];
    const updateItemsLabels = ["Update", "Clear"];

    const viewPortWidthPx = window.innerWidth;
    const isMobileView = viewPortWidthPx <= 784;

    const observerTarget = $(".content-wrapper")[0];
    const observerConfig = { attributes: false, childList: true, characterData: false, subtree: true };

    let scanScheduled = false;
    function scanAndInject() {
        scanScheduled = false;

        // Add Items page rows (legacy non-virtualized list)
        $("ul.items-cont li.clearfix").find("div.title-wrap div.name-wrap").each(function(){
            let isParentRowDisabled = this.parentElement.parentElement.classList.contains("disabled");
            let alreadyHasFillBtn = this.querySelector(".btn-wrap.torn-bazaar-fill-qty-price") != null;
            if (!alreadyHasFillBtn && !isParentRowDisabled){
                insertFillAndWaveBtn(this, addItemsLabels, pages.AddItems);
            }
        });

        // Manage Items page rows (virtualized list — rows mount/unmount on scroll & dnd-kit reorder)
        $('div[data-testid="sortable-item"], div[class*="row___"]').find('div[class*="item___"] div[class*="desc___"]').each(function(){
            let alreadyHasUpdateBtn = this.querySelector(".btn-wrap.torn-bazaar-fill-qty-price") != null;
            if (!alreadyHasUpdateBtn) {
                insertFillAndWaveBtn(this, updateItemsLabels, pages.ManageItems);
            }
        });

        ensureFillAllUI();
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

    // Self-heal across tab navigation. Hash changes when switching #/add, #/manage, #/personalize, #/.
    window.addEventListener("hashchange", scheduleScan);

    // Keep the Fill All bar on-screen (and flush to its edge if minimised) after a resize/rotate.
    window.addEventListener("resize", function() {
        let bar = document.querySelector(".tbf-fillall-bar");
        if (bar != null && fillAllState != null) {
            applyFillAllState(bar);
        }
    });

    // Belt-and-braces: tab-link clicks. The old aria-labelledby IDs are now dynamic
    // (e.g. link-aria-label-1) so we delegate on the stable `href` instead.
    $(document).on("click",
                   'div[class*="topSection___"] a[href="#/add"], ' +
                   'div[class*="topSection___"] a[href="#/manage"], ' +
                   'div[class*="topSection___"] a[href="#/personalize"], ' +
                   'div[class*="topSection___"] a[href="#/"]',
                   scheduleScan);

    // Initial pass — rows may already be in the DOM at script start (run-at: document-idle).
    scheduleScan();

    function insertFillAndWaveBtn(element, buttonLabels, pageType){
        const waveDiv = document.createElement('div');
        waveDiv.className = 'wave';

        const outerSpanFill = document.createElement('span');
        outerSpanFill.className = 'btn-wrap torn-bazaar-fill-qty-price';
        const outerSpanClear = document.createElement('span');
        outerSpanClear.className = 'btn-wrap torn-bazaar-clear-qty-price';

        const innerSpanFill = document.createElement('span');
        innerSpanFill.className = 'btn';
        const innerSpanClear = document.createElement('span');
        innerSpanClear.className = 'btn';
        innerSpanClear.style.display = 'none';

        const inputElementFill = document.createElement('input');
        inputElementFill.type = 'button';
        inputElementFill.value = buttonLabels[0];
        inputElementFill.className = 'torn-btn';
        attachSettingsLongPress(inputElementFill);
        const inputElementClear = document.createElement('input');
        inputElementClear.type = 'button';
        inputElementClear.value = buttonLabels[1];
        inputElementClear.className = 'torn-btn';

        innerSpanFill.appendChild(inputElementFill);
        innerSpanClear.appendChild(inputElementClear);
        outerSpanFill.appendChild(innerSpanFill);
        outerSpanClear.appendChild(innerSpanClear);

        const itemId = getRowItemId(element, pageType);
        if (itemId) {
            element.dataset.tbfItemId = itemId;
            element.dataset.tbfPageType = pageType;

            const favBtn = document.createElement('span');
            favBtn.className = 'tbf-fav';
            favBtn.dataset.tbfItemId = itemId;
            renderFavIcon(favBtn, getItemState(itemId));
            favBtn.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                cycleItemState(itemId);
                if (autoFillActive && favourites.has(itemId)) {
                    enqueueFavouriteRow(element);
                }
            });
            element.append(favBtn);
        }

        element.append(outerSpanFill, outerSpanClear, waveDiv);

        switch(pageType) {
            case pages.AddItems:
                $(outerSpanFill).on("click", "input", function(event) {
                    checkApiKey();
                    warnIfExcluded(this);
                    this.parentNode.style.display = "none";
                    fillQuantityAndPrice(this, pageType, false);
                    event.stopPropagation();
                });

                $(outerSpanClear).on("click", "input", function(event) {
                    this.parentNode.style.display = "none";
                    clearQuantityAndPrice(this);
                    event.stopPropagation();
                });
                break;
            case pages.ManageItems:
                $(outerSpanFill).on("click", "input", function(event) {
                    checkApiKey();
                    warnIfExcluded(this);
                    // this.parentNode.style.display = "none";
                    updatePrice(this);
                    event.stopPropagation();
                });

                // $(outerSpanClear).on("click", "input", function(event) {
                //     this.parentNode.style.display = "none";
                //     clearQuantity(this, pageType);
                //     event.stopPropagation();
                // });
                break;
        }

    }

    function insertPercentageSpan(element){
        let moneyGroupDiv = element.querySelector("div.price div.input-money-group");

        if (moneyGroupDiv.querySelector("span.overlay-percentage") === null) {
            const percentageSpan = document.createElement('span');
            percentageSpan.className = 'overlay-percentage overlay-percentage-add';
            moneyGroupDiv.appendChild(percentageSpan);
        }

        return moneyGroupDiv.querySelector("span.overlay-percentage");
    }

    function insertPercentageManageSpan(element){
        let moneyGroupDiv = element.querySelector("div.input-money-group");

        if (moneyGroupDiv.querySelector("span.overlay-percentage") === null) {
            const percentageSpan = document.createElement('span');
            percentageSpan.className = 'overlay-percentage overlay-percentage-manage';
            moneyGroupDiv.appendChild(percentageSpan);
        }

        return moneyGroupDiv.querySelector("span.overlay-percentage");
    }

    async function fillQuantityAndPrice(element, pageType, isAuto){
        let amountDiv = element.parentElement.parentElement.parentElement.parentElement.parentElement.querySelector("div.amount-main-wrap");
        let priceInputs = amountDiv.querySelectorAll("div.price div input");
        let keyupEvent = new Event("keyup", {bubbles: true});
        let inputEvent = new Event("input", {bubbles: true});

        let image = element.parentElement.parentElement.parentElement.parentElement.querySelector("div.image-wrap img");
        let numberPattern = /\/(\d+)\//;
        let match = image.src.match(numberPattern);
        let extractedItemId = 0;
        if (match) {
            extractedItemId = parseInt(match[1], 10);
        } else {
            console.error("[TornBazaarFiller] ItemId not found!");
        }

        let wave = element.parentElement.parentElement.parentElement.querySelector("div.wave");
        wave.style.animation = 'none';
        wave.offsetHeight;
        wave.style.animation = null;
        wave.style.backgroundColor = "transparent";
        wave.style.animationDuration = "1s";

        // Single-copy items (most clothing) render as a checkbox instead of a quantity input,
        // so their maximum is 1 by definition.
        let checkbox = amountDiv.querySelector("div.amount.choice-container input");
        let maxQuantity = checkbox != null ? 1 : getMaxQuantity(element, pageType);
        // Resolve up front when no category override could change the answer, so a row that
        // resolves to "list nothing" costs no API call. Otherwise wait until the fetch has
        // told us the item's category.
        let resolvedQuantity = hasCategoryQuantityOverrides() ? undefined : resolveQuantity(maxQuantity, quantityModeRaw);
        let skipped = false;
        try {
            if (resolvedQuantity === null){
                skipped = true;
                return reportSkippedRow(wave, extractedItemId, maxQuantity, quantityModeRaw, isAuto);
            }
            let pricing = await fetchPricingForItem(extractedItemId);
            let data = pricing.data;
            let apiErrorStatus = handleApiError(data, wave);
            if (apiErrorStatus !== null){
                return apiErrorStatus;
            }
            if (resolvedQuantity === undefined){
                let categoryMode = getEffectiveQuantity(pricing.category);
                resolvedQuantity = resolveQuantity(maxQuantity, categoryMode);
                if (resolvedQuantity === null){
                    skipped = true;
                    return reportSkippedRow(wave, extractedItemId, maxQuantity, categoryMode, isAuto);
                }
            }
            let formula = pricing.formula;
            let lowBallPrice = Number.MAX_VALUE;
            if (pricing.useItems) {
                let priceDelta = stripDeltaBracket(formula);
                let price = data.items[extractedItemId].market_value;
                lowBallPrice = Math.round(performOperation(price, priceDelta));
            } else {
                if (data.itemmarket.listings[0].price == null){
                    console.warn("[TornBazaarFiller] The API is temporarily disabled, please try again later");
                }
                if (data.itemmarket.item.id != extractedItemId){
                    console.warn("[TornBazaarFiller] The API is BROKEN!");
                }
                let priceListings = data.itemmarket.listings;
                let bazaarSlotOffset = getDeltaSlotOffset(formula);
                let priceDeltaWithoutBazaarOffset = stripDeltaBracket(formula);
                lowBallPrice = Math.round(performOperation(priceListings[Math.min(bazaarSlotOffset, priceListings.length - 1)].price, priceDeltaWithoutBazaarOffset));
                let price3rd = priceListings[Math.min(2, priceListings.length - 1)].price;
                let priceCoefficient = ((lowBallPrice / price3rd) * 100).toFixed(0);
                let percentageOverlaySpan = insertPercentageSpan(amountDiv);
                if (priceCoefficient <= 95){
                    percentageOverlaySpan.style.display = "block";
                    if (priceCoefficient <= 50){
                        percentageOverlaySpan.style.color = "red";
                        wave.style.backgroundColor = "red";
                        wave.style.animationDuration = "5s";
                    } else if (priceCoefficient <= 75){
                        percentageOverlaySpan.style.color = "yellow";
                        wave.style.backgroundColor = "yellow";
                        wave.style.animationDuration = "3s";
                    } else {
                        percentageOverlaySpan.style.color = "green";
                        wave.style.backgroundColor = "green";
                    }
                    percentageOverlaySpan.innerText = priceCoefficient + "%";
                } else {
                    percentageOverlaySpan.style.display = "none";
                    wave.style.backgroundColor = "green";
                }
            }

            priceInputs[0].value = lowBallPrice;
            priceInputs[1].value = lowBallPrice;
            priceInputs[0].dispatchEvent(inputEvent);

            if (checkbox != null){
                // Set, never toggle: a second Fill (or a Fill after the user unchecked the row
                // by hand) must not silently deselect — or reselect — the item.
                if (!checkbox.checked){
                    checkbox.click();
                }
            } else {
                let quantityInput = amountDiv.querySelector("div.amount input");
                quantityInput.value = resolvedQuantity;
                quantityInput.dispatchEvent(keyupEvent);
            }
            return "ok";
        } catch (error) {
            wave.style.backgroundColor = "red";
            wave.style.animationDuration = "5s";
            console.error("[TornBazaarFiller] Error fetching data:", error);
            return "error";
        } finally {
            // A skipped row was left exactly as it was, so put Fill back rather than offering
            // a Clear for something that never got filled.
            let buttonSelector = skipped
                ? "span.btn-wrap.torn-bazaar-fill-qty-price span.btn"
                : "span.btn-wrap.torn-bazaar-clear-qty-price span.btn";
            element.parentNode.parentNode.parentNode.querySelector(buttonSelector).style.display = "inline-block";
        }
    }

    async function updatePrice(element){
        let moneyGroupDiv;
        let parentNode4 = element.parentNode.parentNode.parentNode.parentNode;
        if (isMobileView){
            if (parentNode4.querySelector("[class*=menuActivators___] button[class*=iconContainer___][aria-label=Manage] span[class*=active___]") == null) {
                parentNode4.querySelector("[class*=menuActivators___] button[class*=iconContainer___][aria-label=Manage]").click();
            }
            moneyGroupDiv = parentNode4.parentNode.querySelector("[class*=bottomMobileMenu___] [class*=priceMobile___]");
            if (moneyGroupDiv == null) {
                console.warn("[TornBazaarFiller] Mobile price container not found — '[class*=bottomMobileMenu___] [class*=priceMobile___]' returned null. Mobile DOM may have changed.");
                return "error";
            }
        } else {
            moneyGroupDiv = parentNode4.querySelector("div[class*=price___]");
            if (moneyGroupDiv == null) {
                console.warn("[TornBazaarFiller] Price container not found — 'div[class*=price___]' returned null. Manage Items DOM may have changed.");
                return "error";
            }
        }
        let priceInputs = moneyGroupDiv.querySelectorAll("div.input-money-group input");
        if (priceInputs.length === 0) {
            console.warn("[TornBazaarFiller] Price inputs not found on Manage Items row. Manage Items DOM may have changed.");
            return "error";
        }
        let inputEvent = new Event("input", {bubbles: true});

        let image = parentNode4.querySelector("div[class*=imgContainer___] img")
            ?? parentNode4.querySelector('img[src*="/items/"]');
        if (image == null) {
            console.warn("[TornBazaarFiller] Item image not found on Manage Items row — cannot resolve item id.");
            return "error";
        }
        let extractedItemId = getItemIdFromImage(image);

        // The wave div lives in the container we injected into; fall back to a detached div
        // so a missing wave (unexpected DOM) degrades to no animation instead of a throw.
        let wave = element.parentElement.parentElement.parentElement.querySelector("div.wave")
            ?? document.createElement('div');
        wave.style.animation = 'none';
        wave.offsetHeight;
        wave.style.animation = null;
        wave.style.backgroundColor = "transparent";
        wave.style.animationDuration = "1s";
        try {
            let pricing = await fetchPricingForItem(extractedItemId);
            let data = pricing.data;
            let apiErrorStatus = handleApiError(data, wave);
            if (apiErrorStatus !== null){
                return apiErrorStatus;
            }
            let formula = pricing.formula;
            let lowBallPrice = Number.MAX_VALUE;
            if (pricing.useItems) {
                let priceDelta = stripDeltaBracket(formula);
                let price = data.items[extractedItemId].market_value;
                lowBallPrice = Math.round(performOperation(price, priceDelta));
            } else {
                if (data.itemmarket.listings[0].price == null){
                    console.warn("[TornBazaarFiller] The API is temporarily disabled, please try again later");
                }
                if (data.itemmarket.item.id != extractedItemId){
                    console.warn("[TornBazaarFiller] The API is BROKEN!");
                }
                let priceListings = data.itemmarket.listings;
                let bazaarSlotOffset = getDeltaSlotOffset(formula);
                let priceDeltaWithoutBazaarOffset = stripDeltaBracket(formula);
                lowBallPrice = Math.round(performOperation(priceListings[Math.min(bazaarSlotOffset, priceListings.length - 1)].price, priceDeltaWithoutBazaarOffset));
                let price3rd = priceListings[Math.min(2, priceListings.length - 1)].price;
                let priceCoefficient = ((lowBallPrice / price3rd) * 100).toFixed(0);
                let percentageOverlaySpan = insertPercentageManageSpan(moneyGroupDiv);
                if (priceCoefficient <= 95){
                    percentageOverlaySpan.style.display = "block";
                    if (priceCoefficient <= 50){
                        percentageOverlaySpan.style.color = "red";
                        wave.style.backgroundColor = "red";
                        wave.style.animationDuration = "5s";
                    } else if (priceCoefficient <= 75){
                        percentageOverlaySpan.style.color = "yellow";
                        wave.style.backgroundColor = "yellow";
                        wave.style.animationDuration = "3s";
                    } else {
                        percentageOverlaySpan.style.color = "green";
                        wave.style.backgroundColor = "green";
                    }
                    percentageOverlaySpan.innerText = priceCoefficient + "%";
                } else {
                    percentageOverlaySpan.style.display = "none";
                    wave.style.backgroundColor = "green";
                }
            }

            priceInputs.forEach(x => { x.value = lowBallPrice; });
            priceInputs[0].dispatchEvent(inputEvent);
            return "ok";
        } catch (error) {
            wave.style.backgroundColor = "red";
            wave.style.animationDuration = "5s";
            console.error("[TornBazaarFiller] Error fetching data:", error);
            return "error";
        }
    }

    function clearQuantityAndPrice(element){
        let amountDiv = element.parentElement.parentElement.parentElement.parentElement.parentElement.querySelector("div.amount-main-wrap");
        let priceInputs = amountDiv.querySelectorAll("div.price div input");
        let keyupEvent = new Event("keyup", {bubbles: true});
        let inputEvent = new Event("input", {bubbles: true});

        let wave = element.parentElement.parentElement.parentElement.querySelector("div.wave");
        wave.style.backgroundColor = "white";

        let checkbox = amountDiv.querySelector("div.amount.choice-container input");
        if (checkbox != null){
            // Unset, never toggle — clearing a row the user already unchecked must not re-check it.
            if (checkbox.checked){
                checkbox.click();
            }
        } else {
            let quantityInput = amountDiv.querySelector("div.amount input");
            quantityInput.value = "";
            quantityInput.dispatchEvent(keyupEvent);
        }

        priceInputs[0].value = "";
        priceInputs[1].value = "";
        priceInputs[0].dispatchEvent(inputEvent);

        wave.style.animation = 'none';
        wave.offsetHeight;
        wave.style.animation = null;

        element.parentNode.parentNode.parentNode.querySelector("span.btn-wrap.torn-bazaar-fill-qty-price span.btn").style.display = "inline-block";
    }

    //     function clearQuantity(element, pageType){
    //         let itemRow = element.parentNode.parentNode.parentNode.parentNode;
    //         let moneyGroupDiv = itemRow.querySelector("div.price___DoKP7");
    //         let keyupEvent = new Event("keyup", {bubbles: true});

    //         let wave = element.parentElement.parentElement.parentElement.querySelector("div.wave");
    //         wave.style.backgroundColor = "white";

    //         let quantityInput = itemRow.querySelector("div.remove___R4eVW input");
    //         quantityInput.value = getMaxQuantity(element, pageType);
    //         quantityInput.dispatchEvent(keyupEvent);

    //         wave.style.animation = 'none';
    //         wave.offsetHeight;
    //         wave.style.animation = null;

    //         element.parentNode.parentNode.parentNode.querySelector("span.btn-wrap.torn-bazaar-fill-qty-price span.btn").style.display = "inline-block";
    //     }

    // How many of the item the row says you own, or null when it can't be read.
    function getMaxQuantity(element, pageType){
        let rgx = /x(\d+)$/;
        let rgxMobile = /^x(\d+)/
        let quantityText = '';
        switch(pageType){
            case pages.AddItems:
                // Read the row's text but skip the nodes we inject (favourite star, fill/clear
                // buttons, wave). The star adds a trailing ★/☆/⊘ character that would otherwise
                // break the end-anchored desktop regex and silently fall back to qty 1.
                quantityText = getRowTextExcludingInjected(element.parentNode.parentNode.parentNode).trim();
                break;
            case pages.ManageItems:
                quantityText = element.parentNode.parentNode.parentNode.querySelector("span").innerText;
                break;
        }
        let match = isMobileView ? rgxMobile.exec(quantityText) : rgx.exec(quantityText);
        if (match === null){
            console.warn("[TornBazaarFiller] Quantity not found in row text:", quantityText);
            return null;
        }
        let parsed = parseInt(match[1], 10);
        return (isNaN(parsed) || parsed < 1) ? null : parsed;
    }

    function hasCategoryQuantityOverrides(){
        return Object.keys(categoryQuantities).length > 0;
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
                console.warn("[TornBazaarFiller] Row quantity unknown — leaving the row alone rather than risk listing a kept copy.");
                return null;
            }
            let wanted = maxQuantity - parseInt(maxMinus[1], 10);
            return wanted > 0 ? wanted : null;
        }
        if (normalised !== '' && normalised !== 'max'){
            console.warn("[TornBazaarFiller] Unrecognised quantity mode '" + mode + "', using max.");
        }
        if (maxQuantity == null){
            console.warn("[TornBazaarFiller] Quantity not found in row, defaulting to 1.");
            return 1;
        }
        return maxQuantity;
    }

    // The row is deliberately left as-is: neutral wave, no price, no selection.
    function reportSkippedRow(wave, itemId, maxQuantity, mode, isAuto){
        wave.style.backgroundColor = "white";
        wave.style.animation = 'none';
        wave.offsetHeight;
        wave.style.animation = null;
        let modeLabel = String(mode ?? 'max').trim();
        console.info("[TornBazaarFiller] Item " + itemId + " left untouched — quantity mode '" + modeLabel +
                     "' lists nothing out of " + (maxQuantity ?? "an unknown number") + ".");
        if (!isAuto){
            showToast("Nothing listed — quantity mode \"" + modeLabel + "\" keeps all " +
                      (maxQuantity ?? "?") + " of this item.");
        }
        return "skipped";
    }

    // Concatenate a container's text content while ignoring the elements this script injects,
    // so quantity parsing sees only Torn's original row text.
    function getRowTextExcludingInjected(container){
        let text = '';
        container.childNodes.forEach(function(node){
            if (node.nodeType === Node.ELEMENT_NODE &&
                (node.classList.contains('tbf-fav') ||
                 node.classList.contains('torn-bazaar-fill-qty-price') ||
                 node.classList.contains('torn-bazaar-clear-qty-price') ||
                 node.classList.contains('wave'))){
                return;
            }
            text += node.nodeType === Node.ELEMENT_NODE ? node.innerText : node.textContent;
        });
        return text;
    }

    function getItemIdFromImage(image){
        let numberPattern = /\/(\d+)\//;
        let match = image.src.match(numberPattern);
        if (match) {
            return parseInt(match[1], 10);
        } else {
            console.error("[TornBazaarFiller] ItemId not found!");
        }
    }

    // Maps a Torn API error payload to a fill status ("invalid-key" | "rate-limited" | "error"),
    // or null when the response carries no error.
    function handleApiError(data, wave){
        if (data.error == null) {
            return null;
        }
        if (data.error.code === 2) {
            apiKey = null;
            localStorage.setItem("silmaril-torn-bazaar-filler-apikey", null);
            wave.style.backgroundColor = "red";
            wave.style.animationDuration = "5s";
            console.error("[TornBazaarFiller] Incorrect Api Key:", data);
            return "invalid-key";
        }
        if (data.error.code === 5) {
            wave.style.backgroundColor = "orange";
            wave.style.animationDuration = "3s";
            console.warn("[TornBazaarFiller] API rate limit reached:", data);
            return "rate-limited";
        }
        wave.style.backgroundColor = "red";
        wave.style.animationDuration = "5s";
        console.error("[TornBazaarFiller] API error:", data);
        return "error";
    }

    function loadFavourites(){
        try {
            let stored = JSON.parse(localStorage.getItem(favouritesStorageKey) ?? "[]");
            return new Set(Array.isArray(stored) ? stored : []);
        } catch (error) {
            console.error("[TornBazaarFiller] Failed to load favourites:", error);
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
            console.error("[TornBazaarFiller] Failed to load excluded items:", error);
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
        document.querySelectorAll('.tbf-fav[data-tbf-item-id="' + itemId + '"]').forEach(function(el){
            renderFavIcon(el, state);
        });
    }

    function renderFavIcon(el, state){
        el.textContent = state === 'favourite' ? '★' : (state === 'excluded' ? '⊘' : '☆');
        el.classList.toggle('tbf-fav--on', state === 'favourite');
        el.classList.toggle('tbf-fav--off', state === 'excluded');
        el.title = state === 'favourite'
            ? 'Favourite — filled by Fill All. Click to exclude.'
            : (state === 'excluded'
               ? 'Excluded — never filled by Fill All, and a manual Fill warns first. Click to reset.'
               : 'Click to mark as a favourite (used by Fill All).');
    }

    // A manual Fill on an excluded item still fills — the exclusion only governs Fill All —
    // but it says so, so an accidental click on the wrong row is obvious straight away.
    function warnIfExcluded(inputEl){
        let wrapper = inputEl.parentNode.parentNode.parentNode;
        let itemId = parseInt(wrapper.dataset.tbfItemId, 10);
        if (!isNaN(itemId) && excluded.has(itemId)){
            showToast("Heads up: this item is marked excluded (⊘). Filling it anyway because you clicked Fill.");
        }
    }

    // element is the row's name-wrap (Add Items) or desc (Manage Items) container,
    // i.e. the same node insertFillAndWaveBtn injects into.
    function getRowItemId(element, pageType){
        let image = pageType === pages.AddItems
            ? element.parentElement.querySelector("div.image-wrap img")
            : element.parentElement.querySelector("div[class*=imgContainer___] img");
        if (image == null) {
            // Fallback for DOM drift (esp. the virtualized Manage Items rows): any item
            // image within the row container.
            let row = element.closest('li.clearfix, div[data-testid="sortable-item"], div[class*="row___"]') ?? element.parentElement;
            image = row != null ? row.querySelector('img[src*="/items/"]') : null;
        }
        if (image == null) {
            return null;
        }
        return getItemIdFromImage(image) ?? null;
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
            console.error("[TornBazaarFiller] Failed to load Fill All position:", error);
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
        bar.classList.toggle('tbf-fillall-bar--min', !!fillAllState.minimised);
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
        bar.classList.remove('tbf-fillall-bar--min');
        let r = bar.getBoundingClientRect();
        let clamped = clampBarLeftTop(bar, r.left, r.top);
        setBarLeftTop(bar, clamped.left, clamped.top);
        fillAllState = { left: clamped.left, top: clamped.top, minimised: false, edge: null };
        saveFillAllState();
    }

    // End of a drag gesture: snap + minimise when dropped near an edge, otherwise stay expanded.
    function finishFillAllDrag(bar){
        bar.classList.remove('tbf-fillall-bar--dragging');
        let edge = nearestSnapEdge(bar);
        if (edge) {
            bar.classList.add('tbf-fillall-bar--min'); // changes size before we measure/snap
            snapBarToEdge(bar, edge);
            let r = bar.getBoundingClientRect();
            fillAllState = { left: r.left, top: r.top, minimised: true, edge: edge };
        } else {
            bar.classList.remove('tbf-fillall-bar--min');
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
                bar.classList.add('tbf-fillall-bar--dragging');
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
            } else if (bar.classList.contains('tbf-fillall-bar--min')) {
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
        let bar = document.querySelector(".tbf-fillall-bar");
        if (bar == null) {
            bar = document.createElement('div');
            bar.className = 'tbf-fillall-bar';
            const grip = document.createElement('span');
            grip.className = 'tbf-fillall-grip';
            grip.textContent = '⠿';
            grip.title = 'Drag to move; drop near an edge to minimise';
            // Second way into the settings, next to the always-visible Fill All button —
            // the press-and-hold on a row's Fill/Update button remains available too.
            const cog = document.createElement('span');
            cog.className = 'tbf-fillall-cog';
            cog.textContent = '⚙';
            cog.title = 'Open Bazaar Filler settings';
            const btn = document.createElement('input');
            btn.type = 'button';
            btn.className = 'torn-btn tbf-fillall-btn';
            const dot = document.createElement('span');
            dot.className = 'tbf-autofill-dot';
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
        if (document.querySelector(".tbf-viewport-border") == null) {
            const border = document.createElement('div');
            border.className = 'tbf-viewport-border';
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
        let bar = document.querySelector(".tbf-fillall-bar");
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
        let border = document.querySelector(".tbf-viewport-border");
        if (border != null) {
            border.style.zIndex = Math.max(chatRelativeZBase - 1, 1);
        }
        let toast = document.querySelector(".tbf-toast");
        if (toast != null) {
            toast.style.zIndex = chatRelativeZBase;
        }
    }

    function updateAutoFillUI(){
        let bar = document.querySelector(".tbf-fillall-bar");
        if (bar != null) {
            bar.querySelector(".tbf-fillall-btn").value = autoFillActive ? "Stop fill" : "Fill All ★";
            bar.classList.toggle("tbf-fillall-bar--active", autoFillActive);
        }
        let border = document.querySelector(".tbf-viewport-border");
        if (border != null) {
            border.classList.toggle("tbf-viewport-border--active", autoFillActive);
        }
    }

    function showToast(message){
        let toast = document.querySelector('.tbf-toast');
        if (toast == null){
            toast = document.createElement('div');
            toast.className = 'tbf-toast';
            document.body.appendChild(toast);
            if (chatRelativeZBase != null) {
                toast.style.zIndex = chatRelativeZBase;
            }
        }
        toast.textContent = message;
        toast.classList.add('tbf-toast--visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function(){
            toast.classList.remove('tbf-toast--visible');
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
        // Row containers carry both attributes; the star icons only carry the item id.
        document.querySelectorAll("[data-tbf-item-id][data-tbf-page-type]").forEach(enqueueFavouriteRow);
    }

    function enqueueFavouriteRow(wrapper){
        if (!autoFillActive) {
            return;
        }
        let itemId = parseInt(wrapper.dataset.tbfItemId, 10);
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
                let itemId = parseInt(wrapper.dataset.tbfItemId, 10);
                if (!wrapper.isConnected || !favourites.has(itemId) || excluded.has(itemId)) {
                    // Row unmounted (virtualized list) or unfavourited meanwhile; it will be
                    // re-queued by the scan if it mounts again.
                    autoFillQueuedIds.delete(itemId);
                    continue;
                }
                let fillInput = wrapper.querySelector(".btn-wrap.torn-bazaar-fill-qty-price input");
                if (fillInput == null) {
                    autoFillQueuedIds.delete(itemId);
                    continue;
                }
                let pageType = parseInt(wrapper.dataset.tbfPageType, 10);
                let status;
                try {
                    if (pageType === pages.AddItems) {
                        fillInput.parentNode.style.display = "none";
                        status = await fillQuantityAndPrice(fillInput, pageType, true);
                    } else {
                        status = await updatePrice(fillInput);
                    }
                } catch (error) {
                    // A single row with unexpected DOM must not abort the whole run.
                    console.error("[TornBazaarFiller] Fill All failed for item " + itemId + ":", error);
                    status = "error";
                }
                if (status === "rate-limited") {
                    autoFillQueue.unshift(wrapper); // retry the same row after the pause
                    await sleep(randomBetween(RATE_LIMIT_PAUSE_MIN_MS, RATE_LIMIT_PAUSE_MAX_MS));
                    continue;
                }
                if (status === "invalid-key") {
                    console.error("[TornBazaarFiller] Stopping Fill All: API key is invalid.");
                    stopAutoFill();
                    break;
                }
                autoFillQueuedIds.delete(itemId);
                autoFillDoneIds.add(itemId);
                if (status !== "ok" && status !== "skipped") {
                    console.warn("[TornBazaarFiller] Fill All skipped item " + itemId + " after error.");
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

    function performOperation(number, operation) {
        // Parse the operation string to extract the operator and value
        const match = operation.match(/^([-+]?)(\d+(?:\.\d+)?)(%)?$/);

        if (!match) {
            throw new Error('Invalid operation string');
        }

        const [, operator, operand, isPercentage] = match;
        const operandValue = parseFloat(operand);

        // Check for percentage and convert if necessary
        const adjustedOperand = isPercentage ? (number * operandValue) / 100 : operandValue;

        // Perform the operation based on the operator
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

    const LONG_PRESS_MS = 3000;

    function stripDeltaBracket(formula){
        return formula.indexOf('[') == -1 ? formula : formula.substring(0, formula.indexOf('['));
    }

    function getDeltaSlotOffset(formula){
        if (formula.indexOf('[') == -1) {
            return 0;
        }
        let parsed = parseInt(formula.substring(formula.indexOf('[') + 1, formula.indexOf(']')), 10);
        return isNaN(parsed) ? 0 : parsed;
    }

    function loadCategoryDeltas(){
        try {
            let parsed = JSON.parse(localStorage.getItem(categoryDeltasKey) ?? "{}");
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch (error) {
            console.error("[TornBazaarFiller] Failed to load category deltas:", error);
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
            console.error("[TornBazaarFiller] Failed to load category quantities:", error);
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

    function buildPriceUrl(useItems, itemId){
        return (useItems ? itemUrl : marketUrl)
            .replace("{itemId}", itemId)
            .replace("{apiKey}", apiKey);
    }

    function readCategoryFromData(data, itemId, useItems){
        try {
            if (useItems){
                return (data.items && data.items[itemId]) ? (data.items[itemId].type ?? null) : null;
            }
            return (data.itemmarket && data.itemmarket.item) ? (data.itemmarket.item.type ?? null) : null;
        } catch (error) {
            return null;
        }
    }

    // Fetch pricing data for an item using the price source its (possibly per-category) formula
    // needs. The cached category is only a hint for which endpoint to hit first: the true type is
    // re-read from every response and the cache self-corrects, so a rare Torn recategorisation is
    // picked up on the next fill. Past the TTL we refresh via the items endpoint (always carries
    // type). Only the first fill after a change whose category also flips the source costs 2 calls.
    async function fetchPricingForItem(itemId){
        // No per-category overrides of either kind → category is irrelevant; behave exactly
        // like the default path.
        if (Object.keys(categoryDeltas).length === 0 && !hasCategoryQuantityOverrides()){
            let useItems = priceDeltaRaw.indexOf('[market]') != -1;
            let data = await fetch(buildPriceUrl(useItems, itemId)).then(response => response.json());
            return { data: data, formula: priceDeltaRaw, useItems: useItems, category: null };
        }

        let cached = getCachedCategory(itemId);
        let expired = cached == null || (Date.now() - cached.ts) > CATEGORY_TTL_MS;
        let guessCategory = cached != null ? cached.type : null;
        // When stale/unknown, force the items endpoint so we definitively re-learn the type even if
        // the listings response omits it; otherwise guess from the cached category to stay 1 call.
        let firstUseItems = expired ? true : (getEffectiveDelta(guessCategory).indexOf('[market]') != -1);
        let data = await fetch(buildPriceUrl(firstUseItems, itemId)).then(response => response.json());
        if (data.error != null){
            return { data: data, formula: getEffectiveDelta(guessCategory), useItems: firstUseItems, category: guessCategory };
        }
        let actualType = readCategoryFromData(data, itemId, firstUseItems);
        let category = actualType != null ? actualType : guessCategory;
        if (actualType != null && (cached == null || cached.type !== actualType || expired)){
            cacheItemCategory(itemId, actualType);
        }
        let formula = getEffectiveDelta(category);
        let useItems = formula.indexOf('[market]') != -1;
        if (useItems !== firstUseItems){
            let data2 = await fetch(buildPriceUrl(useItems, itemId)).then(response => response.json());
            return { data: data2, formula: formula, useItems: useItems, category: category };
        }
        return { data: data, formula: formula, useItems: useItems, category: category };
    }

    function ensureSettingsModal(){
        if (document.querySelector('.tbf-modal-overlay') != null){
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'tbf-modal-overlay';
        overlay.innerHTML =
            '<div class="tbf-modal">' +
                '<h3>Bazaar Filler Settings<span class="tbf-modal-close" title="Close">&times;</span></h3>' +
                '<label>Default price delta</label>' +
                '<input type="text" class="tbf-modal-delta" placeholder="-1">' +
                '<label>Default quantity</label>' +
                '<input type="text" class="tbf-modal-qty" placeholder="max">' +
                '<label>Public API key</label>' +
                '<input type="text" class="tbf-modal-apikey" placeholder="16-character key">' +
                '<label>Per-category overrides</label>' +
                '<div class="tbf-modal-cat-head"><span>Category</span><span>Price</span><span>Quantity</span><span></span></div>' +
                '<div class="tbf-modal-cats"></div>' +
                '<button type="button" class="tbf-modal-addcat">+ Add category</button>' +
                '<button type="button" class="tbf-modal-resetcat" title="Forget cached item categories. Use if Torn recategorised an item and a wrong discount is being applied.">Reset learned categories</button>' +
                '<button type="button" class="tbf-modal-clearexcl" title="Un-exclude every item marked ⊘, including ones not currently on screen.">Clear exclusions</button>' +
                '<div class="tbf-modal-actions">' +
                    '<button type="button" class="tbf-modal-cancel">Cancel</button>' +
                    '<button type="button" class="tbf-modal-save">Save</button>' +
                '</div>' +
                '<div class="tbf-modal-help">Price examples: <code>-1</code> (lowest − $1), <code>-5%</code>, <code>-1[1]</code> (2nd lowest listing), <code>[market]</code> (item market value).<br>' +
                'Quantity examples: <code>max</code> (all of them), <code>max-1</code> (keep one back), <code>max-3</code>, <code>1</code> (always list one), <code>skip</code> (never list this category).<br>' +
                'Category rows accept the same syntax and fall back to the defaults above when blank.</div>' +
            '</div>' +
            '<datalist id="tbf-modal-cat-list">' + SETTINGS_CATEGORIES.map(c => '<option value="' + c + '"></option>').join('') + '</datalist>';
        document.body.appendChild(overlay);

        overlay.querySelector('.tbf-modal-close').addEventListener('click', closeSettingsModal);
        overlay.querySelector('.tbf-modal-cancel').addEventListener('click', closeSettingsModal);
        overlay.addEventListener('click', function(event){ if (event.target === overlay){ closeSettingsModal(); } });
        overlay.querySelector('.tbf-modal-addcat').addEventListener('click', function(){ addCategoryRow('', '', ''); });
        overlay.querySelector('.tbf-modal-resetcat').addEventListener('click', function(event){
            clearItemCategoryCache();
            let btn = event.target;
            btn.textContent = 'Cleared ✓';
            setTimeout(function(){ btn.textContent = 'Reset learned categories'; }, 1500);
        });
        overlay.querySelector('.tbf-modal-clearexcl').addEventListener('click', function(event){
            excluded.clear();
            saveExcluded();
            document.querySelectorAll('.tbf-fav').forEach(function(el){
                renderFavIcon(el, getItemState(parseInt(el.dataset.tbfItemId, 10)));
            });
            let btn = event.target;
            btn.textContent = 'Cleared ✓';
            setTimeout(function(){ btn.textContent = 'Clear exclusions'; }, 1500);
        });
        overlay.querySelector('.tbf-modal-save').addEventListener('click', saveSettingsModal);
    }

    function addCategoryRow(name, formula, quantity){
        const list = document.querySelector('.tbf-modal-cats');
        if (list == null){
            return;
        }
        const row = document.createElement('div');
        row.className = 'tbf-modal-cat-row';
        row.innerHTML =
            '<input type="text" class="tbf-modal-cat-name" list="tbf-modal-cat-list" placeholder="Category">' +
            '<input type="text" class="tbf-modal-cat-formula" placeholder="-5%">' +
            '<input type="text" class="tbf-modal-cat-qty" placeholder="max-1">' +
            '<span class="tbf-modal-cat-del" title="Remove">&times;</span>';
        row.querySelector('.tbf-modal-cat-name').value = name;
        row.querySelector('.tbf-modal-cat-formula').value = formula;
        row.querySelector('.tbf-modal-cat-qty').value = quantity;
        row.querySelector('.tbf-modal-cat-del').addEventListener('click', function(){ row.remove(); });
        list.appendChild(row);
    }

    function openSettingsModal(){
        ensureSettingsModal();
        const overlay = document.querySelector('.tbf-modal-overlay');
        overlay.querySelector('.tbf-modal-delta').value = priceDeltaRaw;
        overlay.querySelector('.tbf-modal-qty').value = quantityModeRaw;
        overlay.querySelector('.tbf-modal-apikey').value = apiKey ?? '';
        const list = overlay.querySelector('.tbf-modal-cats');
        list.innerHTML = '';
        // One row per category named by either map, so a category with only a quantity
        // override still shows up.
        let names = [...new Set(Object.keys(categoryDeltas).concat(Object.keys(categoryQuantities)))];
        names.forEach(function(key){ addCategoryRow(key, categoryDeltas[key] ?? '', categoryQuantities[key] ?? ''); });
        overlay.classList.add('tbf-modal-overlay--open');
    }

    function closeSettingsModal(){
        const overlay = document.querySelector('.tbf-modal-overlay');
        if (overlay != null){
            overlay.classList.remove('tbf-modal-overlay--open');
        }
    }

    function saveSettingsModal(){
        const overlay = document.querySelector('.tbf-modal-overlay');
        if (overlay == null){
            return;
        }
        let deltaVal = overlay.querySelector('.tbf-modal-delta').value.trim();
        if (deltaVal !== ''){
            priceDeltaRaw = deltaVal;
            localStorage.setItem("silmaril-torn-bazaar-filler-price-delta", priceDeltaRaw);
        }
        let qtyVal = overlay.querySelector('.tbf-modal-qty').value.trim();
        quantityModeRaw = qtyVal === '' ? 'max' : qtyVal;
        localStorage.setItem("silmaril-torn-bazaar-filler-quantity-mode", quantityModeRaw);
        let keyVal = overlay.querySelector('.tbf-modal-apikey').value.trim();
        if (keyVal.length === 16){
            apiKey = keyVal;
            localStorage.setItem("silmaril-torn-bazaar-filler-apikey", keyVal);
        } else if (keyVal !== ''){
            console.warn("[TornBazaarFiller] API key must be 16 characters; ignored.");
        }
        let map = {};
        let quantityMap = {};
        overlay.querySelectorAll('.tbf-modal-cat-row').forEach(function(row){
            let name = row.querySelector('.tbf-modal-cat-name').value.trim().toLowerCase();
            let formula = row.querySelector('.tbf-modal-cat-formula').value.trim();
            let quantity = row.querySelector('.tbf-modal-cat-qty').value.trim();
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

    // Attach a 3s press-and-hold gesture (mouse + touch) to a FILL/UPDATE input.
    // Holding 3s opens the settings modal; the click that follows the hold is suppressed
    // so it does NOT also run fill/update.
    function attachSettingsLongPress(inputEl) {
        let timer = null;
        let fired = false;
        let startX = 0, startY = 0;
        const MOVE_TOLERANCE = 10; // px — tolerate finger tremor during a long hold

        const start = function(e) {
            fired = false;
            clearTimeout(timer);
            const t = e.touches && e.touches[0];
            if (t) { startX = t.clientX; startY = t.clientY; }
            inputEl.classList.add('tbf-holding');   // start visual cue
            timer = setTimeout(function() {
                fired = true;
                inputEl.classList.remove('tbf-holding');
                openSettingsModal();
            }, LONG_PRESS_MS);
        };
        const cancel = function() {
            clearTimeout(timer);
            timer = null;
            inputEl.classList.remove('tbf-holding');
        };
        const onMove = function(e) {
            if (!timer) return;
            const t = e.touches && e.touches[0];
            if (t && (Math.abs(t.clientX - startX) > MOVE_TOLERANCE ||
                      Math.abs(t.clientY - startY) > MOVE_TOLERANCE)) {
                cancel(); // treat as scroll/drag, not a hold
            }
        };

        inputEl.addEventListener('mousedown', start);
        inputEl.addEventListener('touchstart', start, { passive: true });
        inputEl.addEventListener('mouseup', cancel);
        inputEl.addEventListener('mouseleave', cancel);
        inputEl.addEventListener('touchend', cancel);
        inputEl.addEventListener('touchcancel', cancel);
        inputEl.addEventListener('touchmove', onMove, { passive: true });

        // Capture-phase: runs BEFORE the jQuery-delegated fill/update click handler on the
        // wrapper, so stopImmediatePropagation prevents an unwanted fill after a long-press.
        inputEl.addEventListener('click', function(e) {
            if (fired) {
                fired = false;
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);
    }

    function checkApiKey(checkExisting = true) {
        if (!checkExisting || apiKey === null || apiKey.length != 16){
            let userInput = prompt("Please enter a PUBLIC Api Key, it will be used to get current bazaar prices:", apiKey ?? '');
            if (userInput !== null && userInput.length == 16) {
                apiKey = userInput;
                localStorage.setItem("silmaril-torn-bazaar-filler-apikey", userInput);
            } else {
                console.error("[TornBazaarFiller] User cancelled the Api Key input.");
            }
        }
    }
})();
