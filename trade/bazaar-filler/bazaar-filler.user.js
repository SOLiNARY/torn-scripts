// ==UserScript==
// @name         Torn Bazaar Filler
// @namespace    https://github.com/SOLiNARY
// @version      1.4.0
// @description  On "Fill" click autofills bazaar item price with lowest market price currently minus $1 (can be customised), shows current price coefficient compared to 3rd lowest, fills max quantity for items, marks checkboxes for guns. Hold a Fill/Update button for 3s to open the Price Delta and API Key settings dialogs. Mark items as favourites (star next to Fill) and use "Fill All" to auto-fill every favourite row, including ones appearing later via infinite scroll or category switches. Drag the Fill All bar anywhere; drop it near a screen edge to clamp and minimise it — its position and state are remembered.
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
    let apiKey = localStorage.getItem("silmaril-torn-bazaar-filler-apikey");

    try {
        GM_registerMenuCommand('Set Price Delta', setPriceDelta);
        GM_registerMenuCommand('Set Api Key', function() { checkApiKey(false); });
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

    GM_addStyle(`.btn-wrap.torn-bazaar-fill-qty-price{float:right;margin-left:auto;z-index:99999}.btn-wrap.torn-bazaar-clear-qty-price{z-index:99999}div.title-wrap div.name-wrap{display:flex;justify-content:flex-end}.wave-animation{position:relative;overflow:hidden}.wave{pointer-events:none;position:absolute;width:100%;height:33px;background-color:transparent;opacity:0;transform:translateX(-100%);animation:waveAnimation 1s cubic-bezier(0, 0, 0, 1)}@keyframes waveAnimation{0%{opacity:1;transform:translateX(-100%)}100%{opacity:0;transform:translateX(100%)}}.overlay-percentage{position:absolute;top:0;background-color:rgba(0, 0, 0, 0.9);padding:0 5px;border-radius:15px;font-size:10px}.overlay-percentage-add{right:-30px}.overlay-percentage-manage{right:0}.torn-bazaar-fill-qty-price input{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;transition:box-shadow 0s}.torn-bazaar-fill-qty-price input.tbf-holding{box-shadow:inset 0 0 0 40px rgba(0,180,255,.35);transition:box-shadow 3s linear}.tbf-fav{cursor:pointer;font-size:16px;line-height:1;margin-left:auto;margin-right:6px;width:16px;text-align:center;color:#888;align-self:center;user-select:none;-webkit-user-select:none;z-index:99999}.tbf-fav~.btn-wrap.torn-bazaar-fill-qty-price{margin-left:0}.tbf-fav.tbf-fav--on{color:gold;text-shadow:0 0 3px rgba(255,215,0,.7)}.tbf-fillall-bar{position:fixed;bottom:110px;right:16px;display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(0,0,0,.55);border-radius:20px;z-index:999999;touch-action:none}.tbf-fillall-grip{cursor:grab;color:#bbb;font-size:14px;line-height:1;letter-spacing:-2px;min-width:12px;text-align:center;align-self:center;user-select:none;-webkit-user-select:none}.tbf-fillall-bar--dragging{cursor:grabbing;opacity:.92}.tbf-fillall-bar--dragging .tbf-fillall-grip{cursor:grabbing}.tbf-fillall-bar--min{padding:5px 7px;gap:4px}.tbf-fillall-bar--min .tbf-fillall-btn{display:none}.tbf-fillall-bar--min .tbf-fillall-grip{font-size:16px}.tbf-autofill-dot{display:none;width:10px;height:10px;border-radius:50%;background:gold;box-shadow:0 0 4px gold;animation:tbfPulse 1s ease-in-out infinite}.tbf-fillall-bar--active .tbf-autofill-dot{display:inline-block}.tbf-fillall-bar--active .tbf-fillall-btn{box-shadow:0 0 5px gold}@keyframes tbfPulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}.tbf-viewport-border{display:none;position:fixed;top:0;right:0;bottom:0;left:0;border:3px solid gold;box-shadow:inset 0 0 12px rgba(255,215,0,.6);pointer-events:none;z-index:999998}.tbf-viewport-border--active{display:block}.tbf-toast{position:fixed;bottom:158px;right:16px;max-width:280px;background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:8px;border:1px solid gold;font-size:13px;line-height:1.4;z-index:1000000;opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s}.tbf-toast--visible{opacity:1;visibility:visible}`);

    const favouritesStorageKey = "silmaril-torn-bazaar-filler-favourites";
    let favourites = loadFavourites();

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
            favBtn.title = 'Toggle favourite (used by Fill All)';
            renderFavIcon(favBtn, favourites.has(itemId));
            favBtn.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                toggleFavourite(itemId);
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
                    this.parentNode.style.display = "none";
                    fillQuantityAndPrice(this, pageType);
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

    function fillQuantityAndPrice(element, pageType){
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

        let requestUrl = priceDeltaRaw.indexOf('[market]') != -1 ? itemUrl : marketUrl;
        requestUrl = requestUrl
            .replace("{itemId}", extractedItemId)
            .replace("{apiKey}", apiKey);

        let wave = element.parentElement.parentElement.parentElement.querySelector("div.wave");
        wave.style.animation = 'none';
        wave.offsetHeight;
        wave.style.animation = null;
        wave.style.backgroundColor = "transparent";
        wave.style.animationDuration = "1s";
        return fetch(requestUrl)
            .then(response => response.json())
            .then(data => {
            let apiErrorStatus = handleApiError(data, wave);
            if (apiErrorStatus !== null){
                return apiErrorStatus;
            }
            let lowBallPrice = Number.MAX_VALUE;
            if (priceDeltaRaw.indexOf('[market]') != -1) {
                let priceDelta = priceDeltaRaw.indexOf('[') == -1 ? priceDeltaRaw : priceDeltaRaw.substring(0, priceDeltaRaw.indexOf('['));
                let price = data.items[extractedItemId].market_value;
                lowBallPrice = Math.round(performOperation(price, priceDelta));
            } else {
                let price = 999_999_999;
                if (data.itemmarket.listings[0].price == null){
                    console.warn("[TornBazaarFiller] The API is temporarily disabled, please try again later");
                }
                if (data.itemmarket.item.id != extractedItemId){
                    console.warn("[TornBazaarFiller] The API is BROKEN!");
                }
                let priceListings = data.itemmarket.listings;
                let bazaarSlotOffset = priceDeltaRaw.indexOf('[') == -1 ? 0 : parseInt(priceDeltaRaw.substring(priceDeltaRaw.indexOf('[') + 1, priceDeltaRaw.indexOf(']')));
                let priceDeltaWithoutBazaarOffset = priceDeltaRaw.indexOf('[') == -1 ? priceDeltaRaw : priceDeltaRaw.substring(0, priceDeltaRaw.indexOf('['));
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

            let isQuantityCheckbox = amountDiv.querySelector("div.amount.choice-container") !== null;
            if (isQuantityCheckbox){
                amountDiv.querySelector("div.amount.choice-container input").click();
            } else {
                let quantityInput = amountDiv.querySelector("div.amount input");
                quantityInput.value = getQuantity(element, pageType);
                quantityInput.dispatchEvent(keyupEvent);
            }
            return "ok";
        })
            .catch(error => {
            wave.style.backgroundColor = "red";
            wave.style.animationDuration = "5s";
            console.error("[TornBazaarFiller] Error fetching data:", error);
            return "error";
        })
            .finally(() => {
            element.parentNode.parentNode.parentNode.querySelector("span.btn-wrap.torn-bazaar-clear-qty-price span.btn").style.display = "inline-block";
        });
    }

    function updatePrice(element){
        let moneyGroupDiv;
        let parentNode4 = element.parentNode.parentNode.parentNode.parentNode;
        if (isMobileView){
            if (parentNode4.querySelector("[class*=menuActivators___] button[class*=iconContainer___][aria-label=Manage] span[class*=active___]") == null) {
                parentNode4.querySelector("[class*=menuActivators___] button[class*=iconContainer___][aria-label=Manage]").click();
            }
            moneyGroupDiv = parentNode4.parentNode.querySelector("[class*=bottomMobileMenu___] [class*=priceMobile___]");
            if (moneyGroupDiv == null) {
                console.warn("[TornBazaarFiller] Mobile price container not found — '[class*=bottomMobileMenu___] [class*=priceMobile___]' returned null. Mobile DOM may have changed.");
                return Promise.resolve("error");
            }
        } else {
            moneyGroupDiv = element.parentNode.parentNode.parentNode.parentNode.querySelector("div[class*=price___]");
        }
        let priceInputs = moneyGroupDiv.querySelectorAll("div.input-money-group input");
        let inputEvent = new Event("input", {bubbles: true});

        let image = element.parentElement.parentElement.parentElement.parentElement.querySelector("div[class*=imgContainer___] img");
        let extractedItemId = getItemIdFromImage(image);

        let requestUrl = priceDeltaRaw.indexOf('[market]') != -1 ? itemUrl : marketUrl;
        requestUrl = requestUrl
            .replace("{itemId}", extractedItemId)
            .replace("{apiKey}", apiKey);

        let wave = element.parentElement.parentElement.parentElement.querySelector("div.wave");
        wave.style.animation = 'none';
        wave.offsetHeight;
        wave.style.animation = null;
        wave.style.backgroundColor = "transparent";
        wave.style.animationDuration = "1s";
        return fetch(requestUrl)
            .then(response => response.json())
            .then(data => {
            let apiErrorStatus = handleApiError(data, wave);
            if (apiErrorStatus !== null){
                return apiErrorStatus;
            }
            let lowBallPrice = Number.MAX_VALUE;
            if (priceDeltaRaw.indexOf('[market]') != -1) {
                let priceDelta = priceDeltaRaw.indexOf('[') == -1 ? priceDeltaRaw : priceDeltaRaw.substring(0, priceDeltaRaw.indexOf('['));
                let price = data.items[extractedItemId].market_value;
                lowBallPrice = Math.round(performOperation(price, priceDelta));
            } else {
                let price = 999_999_999;
                if (data.itemmarket.listings[0].price == null){
                    console.warn("[TornBazaarFiller] The API is temporarily disabled, please try again later");
                }
                if (data.itemmarket.item.id != extractedItemId){
                    console.warn("[TornBazaarFiller] The API is BROKEN!");
                }
                let priceListings = data.itemmarket.listings;
                let bazaarSlotOffset = priceDeltaRaw.indexOf('[') == -1 ? 0 : parseInt(priceDeltaRaw.substring(priceDeltaRaw.indexOf('[') + 1, priceDeltaRaw.indexOf(']')));
                let priceDeltaWithoutBazaarOffset = priceDeltaRaw.indexOf('[') == -1 ? priceDeltaRaw : priceDeltaRaw.substring(0, priceDeltaRaw.indexOf('['));
                lowBallPrice = Math.round(performOperation(priceListings[Math.min(bazaarSlotOffset, priceListings.length - 1)].price, priceDeltaWithoutBazaarOffset));
                let price3rd = priceListings[Math.min(2, priceListings.length - 1)].cost;
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

            priceInputs[0].value = lowBallPrice;
            priceInputs[1].value = lowBallPrice;
            priceInputs[0].dispatchEvent(inputEvent);
            return "ok";
        })
            .catch(error => {
            wave.style.backgroundColor = "red";
            wave.style.animationDuration = "5s";
            console.error("[TornBazaarFiller] Error fetching data:", error);
            return "error";
        });
    }

    function clearQuantityAndPrice(element){
        let amountDiv = element.parentElement.parentElement.parentElement.parentElement.parentElement.querySelector("div.amount-main-wrap");
        let priceInputs = amountDiv.querySelectorAll("div.price div input");
        let keyupEvent = new Event("keyup", {bubbles: true});
        let inputEvent = new Event("input", {bubbles: true});

        let wave = element.parentElement.parentElement.parentElement.querySelector("div.wave");
        wave.style.backgroundColor = "white";

        let isQuantityCheckbox = amountDiv.querySelector("div.amount.choice-container") !== null;
        if (isQuantityCheckbox){
            amountDiv.querySelector("div.amount.choice-container input").click();
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
    //         quantityInput.value = getQuantity(element, pageType);
    //         quantityInput.dispatchEvent(keyupEvent);

    //         wave.style.animation = 'none';
    //         wave.offsetHeight;
    //         wave.style.animation = null;

    //         element.parentNode.parentNode.parentNode.querySelector("span.btn-wrap.torn-bazaar-fill-qty-price span.btn").style.display = "inline-block";
    //     }

    function getQuantity(element, pageType){
        let rgx = /x(\d+)$/;
        let rgxMobile = /^x(\d+)/
        let quantityText = '';
        switch(pageType){
            case pages.AddItems:
                // Read the row's text but skip the nodes we inject (favourite star, fill/clear
                // buttons, wave). The star adds a trailing ★/☆ character that would otherwise
                // break the end-anchored desktop regex and silently fall back to qty 1.
                quantityText = getRowTextExcludingInjected(element.parentNode.parentNode.parentNode).trim();
                break;
            case pages.ManageItems:
                quantityText = element.parentNode.parentNode.parentNode.querySelector("span").innerText;
                break;
        }
        let match = isMobileView ? rgxMobile.exec(quantityText) : rgx.exec(quantityText);
        if (match === null){
            console.warn("[TornBazaarFiller] Quantity not found in row text, defaulting to 1:", quantityText);
            return 1;
        }
        return match[1];
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

    function toggleFavourite(itemId){
        if (favourites.has(itemId)) {
            favourites.delete(itemId);
        } else {
            favourites.add(itemId);
        }
        saveFavourites();
        document.querySelectorAll('.tbf-fav[data-tbf-item-id="' + itemId + '"]').forEach(function(el){
            renderFavIcon(el, favourites.has(itemId));
        });
    }

    function renderFavIcon(el, isOn){
        el.textContent = isOn ? '★' : '☆';
        el.classList.toggle('tbf-fav--on', isOn);
    }

    // element is the row's name-wrap (Add Items) or desc (Manage Items) container,
    // i.e. the same node insertFillAndWaveBtn injects into.
    function getRowItemId(element, pageType){
        let image = pageType === pages.AddItems
            ? element.parentElement.querySelector("div.image-wrap img")
            : element.parentElement.querySelector("div[class*=imgContainer___] img");
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
    // (or expands a minimised bar), while a drag moves it and suppresses the trailing click.
    function attachFillAllDrag(bar, btn){
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

        // Capture-phase: cancel the click that follows a drag so it doesn't also start/stop fill.
        btn.addEventListener('click', function(e){
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
            const btn = document.createElement('input');
            btn.type = 'button';
            btn.className = 'torn-btn tbf-fillall-btn';
            const dot = document.createElement('span');
            dot.className = 'tbf-autofill-dot';
            bar.append(grip, btn, dot);
            btn.addEventListener('click', function(event){
                event.stopPropagation();
                if (autoFillActive) {
                    stopAutoFill();
                } else {
                    startAutoFill();
                }
            });
            document.body.appendChild(bar);
            attachFillAllDrag(bar, btn);
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
        if (!favourites.has(itemId) || autoFillDoneIds.has(itemId) || autoFillQueuedIds.has(itemId)) {
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
                if (!wrapper.isConnected || !favourites.has(itemId)) {
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
                if (pageType === pages.AddItems) {
                    fillInput.parentNode.style.display = "none";
                    status = await fillQuantityAndPrice(fillInput, pageType);
                } else {
                    status = await updatePrice(fillInput);
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
                if (status !== "ok") {
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

    // Re-open both settings dialogs in sequence, for the user to update.
    function openAllSettingsDialogs() {
        setPriceDelta();        // Price delta dialog first
        checkApiKey(false);     // then API key dialog (force prompt regardless of stored key)
    }

    // Attach a 3s press-and-hold gesture (mouse + touch) to a FILL/UPDATE input.
    // Holding 3s opens the settings dialogs; the click that follows the hold is suppressed
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
                openAllSettingsDialogs();
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

    function setPriceDelta() {
        let userInput = prompt('Enter price delta formula (default: -1):', priceDeltaRaw);
        if (userInput !== null) {
            priceDeltaRaw = userInput;
            localStorage.setItem("silmaril-torn-bazaar-filler-price-delta", userInput);
        } else {
            console.error("[TornBazaarFiller] User cancelled the Price Delta input.");
        }
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
