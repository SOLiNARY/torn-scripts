// ==UserScript==
// @name         Torn Market Filler
// @namespace    https://github.com/SOLiNARY
// @version      0.7.2
// @description  On "Fill" click autofills market item price with lowest market price minus $1 (customizable), fills max quantity, marks checkboxes for guns. Mark items as favourites (star next to the fill button) and use "Fill All" to auto-fill every favourite row, including ones appearing later when switching categories.
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

    const itemUrl = "https://api.torn.com/torn/{itemId}?selections=items&key={apiKey}&comment=MarketFiller";
    const marketUrl = "https://api.torn.com/v2/market/{itemId}?selections=itemMarket&key={apiKey}&comment=MarketFiller";
    const marketUrlV2 = "https://api.torn.com/v2/market?id={itemId}&selections=itemMarket&key={apiKey}&comment=MarketFiller";
    let showPricesPopup = localStorage.getItem("silmaril-torn-market-filler-show-prices-popup") ?? '1';
    showPricesPopup = Boolean(parseInt(showPricesPopup));
    let priceDeltaRaw = localStorage.getItem("silmaril-torn-market-filler-price-delta") ?? localStorage.getItem("silmaril-torn-bazaar-filler-price-delta") ?? '-1[0]';
    let apiKey = localStorage.getItem("silmaril-torn-bazaar-filler-apikey") ?? '###PDA-APIKEY###';
    let togglePricesPopupMenuId, setPriceDeltaMenuId, setApiKeyMenuId;

    try {
        togglePricesPopupMenuId = GM_registerMenuCommand(`Toggle Prices Popup (${showPricesPopup ? 'ON' : 'OFF'})`, togglePricesPopupVisibility);
        setPriceDeltaMenuId = GM_registerMenuCommand(`Set Price Delta: ${priceDeltaRaw}`, setPriceDelta);
        setApiKeyMenuId = GM_registerMenuCommand(`Set Api Key: ${apiKey}`, function() { checkApiKey(false); });
    } catch (error) {
        console.warn('[TornMarketFiller] Tampermonkey not detected!');
    }

    let GM_addStyle = function (s) {
        let style = document.createElement("style");
        style.type = "text/css";
        style.innerHTML = s;
        document.head.appendChild(style);
    };
    GM_addStyle(`#item-market-root [class^=addListingWrapper___] [class^=panels___] [class^=priceInputWrapper___]>.input-money-group>.input-money,#item-market-root [class^=viewListingWrapper___] [class^=priceInputWrapper___]>.input-money-group>.input-money{font-size:smaller!important;border-bottom-left-radius:0!important;border-top-left-radius:0!important}.silmaril-market-filler-popup{background:var(--tooltip-bg-color);padding:12px 18px;border-radius:8px;border:1px solid #888;box-shadow:0 4px 18px 0 #0009;color:var(--info-msg-font-color);z-index:99999;position:fixed;font-size:1em!important;line-height:1.5;pointer-events:auto}.silmaril-market-filler-popup-close{position:absolute;top:4px;right:7px;font-size:1em;color:#aaa;cursor:pointer}.silmaril-market-filler-popup-draggable{user-select:none;cursor:move}.silmaril-torn-market-filler-popup-price{cursor:pointer}.tmf-fav{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:18px;font-size:16px;line-height:1;color:#888;align-self:center;margin-right:2px;user-select:none;-webkit-user-select:none}.tmf-fav.tmf-fav--on{color:gold;text-shadow:0 0 3px rgba(255,215,0,.7)}.tmf-fillall-bar{position:fixed;bottom:16px;right:16px;display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(0,0,0,.55);border-radius:20px;z-index:999999}@media (max-width:784px){.tmf-fillall-bar{bottom:110px}}.tmf-autofill-dot{display:none;width:10px;height:10px;border-radius:50%;background:gold;box-shadow:0 0 4px gold;animation:tmfPulse 1s ease-in-out infinite}.tmf-fillall-bar--active .tmf-autofill-dot{display:inline-block}.tmf-fillall-bar--active .tmf-fillall-btn{box-shadow:0 0 5px gold}@keyframes tmfPulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}.tmf-viewport-border{display:none;position:fixed;top:0;right:0;bottom:0;left:0;border:3px solid gold;box-shadow:inset 0 0 12px rgba(255,215,0,.6);pointer-events:none;z-index:999998}.tmf-viewport-border--active{display:block}.tmf-toast{position:fixed;bottom:64px;right:16px;max-width:280px;background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:8px;border:1px solid gold;font-size:13px;line-height:1.4;z-index:1000000;opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s}@media (max-width:784px){.tmf-toast{bottom:158px}}.tmf-toast--visible{opacity:1;visibility:visible}`);

    const pages = { "AddItems": 10, "ViewItems": 20, "Other": 0};

    // Favourites are deliberately stored under a market-filler-specific key,
    // separate from the bazaar-filler favourites list.
    const favouritesStorageKey = "silmaril-torn-market-filler-favourites";
    let favourites = loadFavourites();

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
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(mutationRaw => {
            let mutation = mutationRaw.target;
            currentPage = getCurrentPage();
            if (currentPage == pages.AddItems){
                if (mutation.id && mutation.id.startsWith('headlessui-tabs-panel-')) {
                    mutation.querySelectorAll('[class*=itemRowWrapper___]:not(.silmaril-market-filler-processed) > [class*=itemRow___]:not([class*=grayedOut___]) [class^=priceInputWrapper___]').forEach(x => AddFillButton(x));
                }
                if (String(mutation.className).indexOf('priceInputWrapper___') > -1){
                    AddFillButton(mutation);
                }
            } else if (currentPage == pages.ViewItems){
                if (mutation.className && mutation.className.startsWith('viewListingWrapper___')) {
                    mutation.querySelectorAll('[class*=itemRowWrapper___]:not(.silmaril-market-filler-processed) > [class*=itemRow___]:not([class*=grayedOut___]) [class^=priceInputWrapper___]').forEach(x => AddFillButton(x));
                }
            }
        });
    });
    observer.observe(observerTarget, observerConfig);
    addCustomFillPopup();
    ensureFillAllUI();

    function AddFillButton(itemPriceElement){
        if (itemPriceElement.querySelector('.silmaril-market-filler-button') != null){
            return;
        }
        const wrapperParent = findParentByCondition(itemPriceElement, (el) => String(el.className).indexOf('itemRowWrapper___') > -1);
        wrapperParent.classList.add('silmaril-market-filler-processed');
        let itemIdString = wrapperParent.querySelector('[class^=itemRow___] [type=button][class^=viewInfoButton___]').getAttribute('aria-controls');
        let itemImage = wrapperParent.querySelector('[class*=viewInfoButton] img');
        let itemId = currentPage == pages.AddItems ? getItemIdFromString(itemIdString) : getItemIdFromImage(itemImage);
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
            const favBtn = document.createElement('span');
            favBtn.className = 'tmf-fav';
            favBtn.title = 'Toggle favourite (used by Fill All)';
            renderFavIcon(favBtn, favourites.has(itemIdNum));
            favBtn.dataset.tmfItemId = itemIdNum;
            favBtn.addEventListener('click', function(e){
                e.preventDefault();
                e.stopPropagation();
                toggleFavourite(itemIdNum);
                if (autoFillActive && favourites.has(itemIdNum)){
                    enqueueFavouriteRow(wrapperParent);
                }
            });
            // First slot of the row's controls container — left of the anonymous button.
            const infoContainer = findParentByCondition(itemPriceElement, (el) => String(el.className).indexOf('info___') > -1);
            (infoContainer ?? moneyGroup).prepend(favBtn);
            moneyGroup.prepend(span);
            if (autoFillActive){
                enqueueFavouriteRow(wrapperParent);
            }
        } else {
            moneyGroup.prepend(span);
        }
    }

    async function GetPrices(itemId){
        let requestUrl = priceDeltaRaw.indexOf('[market]') != -1 ? itemUrl : marketUrlV2;
        requestUrl = requestUrl
            .replace("{itemId}", itemId)
            .replace("{apiKey}", apiKey);
        return fetch(requestUrl)
            .then(response => response.json())
            .then(data => {
                if (data.error != null){
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
                if (priceDeltaRaw.indexOf('[market]') != -1){
                    return {"price": data.items[itemId].market_value, "amount": 1};
                } else {
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
            })
            .catch(error => {
                console.error("[TornMarketFiller] Error fetching data:", error);
                return 'Failed!';
            });
    }

    function GetPrice(prices){
        if (prices == null){
            return 'No prices loaded';
        }
        if (prices.amount == 0){
            return prices.price;
        }
        if (priceDeltaRaw.indexOf('[market]') != -1) {
            prices = Array(prices);
            let priceDelta = priceDeltaRaw.indexOf('[') == -1 ? priceDeltaRaw : priceDeltaRaw.substring(0, priceDeltaRaw.indexOf('['));
            return Math.round(performOperation(prices[0].price, priceDelta));
        } else if (priceDeltaRaw.indexOf('[median]') != -1) {
            let priceDelta = priceDeltaRaw.indexOf('[') == -1 ? priceDeltaRaw : priceDeltaRaw.substring(0, priceDeltaRaw.indexOf('['));
            return Math.round(performOperation(getMedianPrice(prices), priceDelta));
        } else {
            let marketSlotOffset = priceDeltaRaw.indexOf('[') == -1 ? 0 : parseInt(priceDeltaRaw.substring(priceDeltaRaw.indexOf('[') + 1, priceDeltaRaw.indexOf(']')));
            let priceDeltaWithoutMarketOffset = priceDeltaRaw.indexOf('[') == -1 ? priceDeltaRaw : priceDeltaRaw.substring(0, priceDeltaRaw.indexOf('['));
            return Math.round(performOperation(prices[Math.min(marketSlotOffset, prices.length - 1)].price, priceDeltaWithoutMarketOffset));
        }
    }

    async function handleFillClick(event, itemId){
        let target = event.currentTarget || event.target;
        await performFill(target, itemId, true);
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
        let prices = await GetPrices(itemId);
        let status = getPricesStatus(prices);

        if (showPopup) {
            const breakdown = GetPricesBreakdown(prices);
            // Thanks to Rosti [2840742] for the help with the prices popup component
            showCustomFillPopup(target, breakdown);
        } else if (status !== 'ok') {
            // Auto-fill: leave the row untouched so it can be retried or skipped.
            return status;
        }

        let price = action == 'fill' ? GetPrice(prices) : '';
        switchActionFlag(target);
        let parentRow = findParentByCondition(target, (el) => String(el.className).indexOf('info___') > -1);
        let quantityInputs = parentRow.querySelectorAll('[class^=amountInputWrapper___] .input-money-group > .input-money');
        if (quantityInputs.length > 0){
            if (quantityInputs[0].value.length === 0 || parseInt(quantityInputs[0].value) < 1){
                quantityInputs[0].value = action == 'fill' ? Number.MAX_SAFE_INTEGER : 0;
                quantityInputs[1].value = action == 'fill' ? Number.MAX_SAFE_INTEGER : 0;
            } else {
                quantityInputs[0].value = action == 'clear' ? '' : quantityInputs[0].value;
                quantityInputs[1].value = action == 'clear' ? '' : quantityInputs[1].value;
            }
            quantityInputs[0].dispatchEvent(new Event("input", {bubbles: true}));
        } else {
            let checkbox = parentRow.querySelector('[class^=checkboxWrapper___] > [class^=checkboxContainer___] [type=checkbox]');
            if (checkbox && ((action == 'fill' && !checkbox.checked) || (action == 'clear' && checkbox.checked))){
                checkbox.click();
            }
        }
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

    function toggleFavourite(itemId){
        if (favourites.has(itemId)) {
            favourites.delete(itemId);
        } else {
            favourites.add(itemId);
        }
        saveFavourites();
        document.querySelectorAll('.tmf-fav[data-tmf-item-id="' + itemId + '"]').forEach(function(el){
            renderFavIcon(el, favourites.has(itemId));
        });
    }

    function renderFavIcon(el, isOn){
        el.textContent = isOn ? '★' : '☆';
        el.classList.toggle('tmf-fav--on', isOn);
    }

    function ensureFillAllUI(){
        let bar = document.querySelector(".tmf-fillall-bar");
        if (bar == null) {
            bar = document.createElement('div');
            bar.className = 'tmf-fillall-bar';
            const btn = document.createElement('input');
            btn.type = 'button';
            btn.className = 'torn-btn tmf-fillall-btn';
            const dot = document.createElement('span');
            dot.className = 'tmf-autofill-dot';
            bar.append(btn, dot);
            btn.addEventListener('click', function(event){
                event.stopPropagation();
                if (autoFillActive) {
                    stopAutoFill();
                } else {
                    startAutoFill();
                }
            });
            document.body.appendChild(bar);
        }
        if (document.querySelector(".tmf-viewport-border") == null) {
            const border = document.createElement('div');
            border.className = 'tmf-viewport-border';
            document.body.appendChild(border);
        }
        updateAutoFillUI();
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
                let itemId = parseInt(wrapper.dataset.tmfItemId, 10);
                if (!wrapper.isConnected || !favourites.has(itemId)) {
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
                let status = await performFill(fillBtn, itemId, false);
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
                if (status !== "ok") {
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

    function setPriceDelta() {
        let userInput = prompt('Enter price delta formula (default: -1[0]):', priceDeltaRaw);
        if (userInput !== null) {
            priceDeltaRaw = userInput;
            localStorage.setItem("silmaril-torn-market-filler-price-delta", userInput);
        } else {
            console.error("[TornMarketFiller] User cancelled the Price Delta input.");
        }
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

    function askForPricesPopupFlag() {
        let dsf = null;
        let userInput = prompt("Please choose to show or hide the lowest 5 prices popup, enter 1 to SHOW or 0 to HIDE:", showPricesPopup ? '1' : '0');
        if (userInput !== null && userInput.length == 1) {
            if (userInput != '1' && userInput != '0'){
                console.error("[TornMarketFiller] User entered invalid value for the Prices Popup input.");
                return;
            }
            showPricesPopup = Boolean(parseInt(userInput));
            localStorage.setItem('silmaril-torn-market-filler-show-prices-popup', showPricesPopup ? '1' : '0');
        } else {
            console.error("[TornMarketFiller] User cancelled the Prices Popup input.");
        }
    }

    function togglePricesPopupVisibility() {
        showPricesPopup = !showPricesPopup;
        localStorage.setItem('silmaril-torn-market-filler-show-prices-popup', showPricesPopup ? '1' : '0');
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
        if (window.location.href.indexOf('#/addListing') > -1){
            return pages.AddItems;
        } else if (window.location.href.indexOf('#/viewListing') > -1){
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
            askForPricesPopupFlag();
            setPriceDelta();
            checkApiKey(false);
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