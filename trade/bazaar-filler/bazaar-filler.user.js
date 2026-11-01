// ==UserScript==
// @name         Torn Bazaar Filler
// @namespace    https://github.com/SOLiNARY
// @version      2.0.0
// @description  Adds a Fill button to every item on your bazaar's Add and Manage pages: one click sets the price and quantity. Price from the item market (cheapest minus $1 by default), market value or live bazaars via weav3r.dev, with your own formula and min/max ranges. Quantity modes, per-category settings, favourites with Fill All, and a bubble that warns when your price is far below the competition. A small chart icon next to Fill opens item analytics: item-market and bazaar listings on one price ladder, where your price lands, stack sizes, and what your formula picked. Open settings with the cog on the Fill All bar or by holding Fill for 3s.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/bazaar.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @downloadURL  https://raw.githubusercontent.com/SOLiNARY/torn-scripts/main/trade/bazaar-filler/bazaar-filler.user.js
// @updateURL    https://raw.githubusercontent.com/SOLiNARY/torn-scripts/main/trade/bazaar-filler/bazaar-filler.user.js
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      weav3r.dev
// ==/UserScript==

(function() {
    'use strict';

    // Keep in sync with @version above — it keys the "What's new" popup.
    const SCRIPT_VERSION = "2.0.0";

    const marketUrl = "https://api.torn.com/v2/market?id={itemId}&selections=itemMarket&key={apiKey}&comment=BazaarFiller";
    const itemUrl = "https://api.torn.com/torn/{itemId}?selections=items&key={apiKey}&comment=BazaarFiller";
    // weav3r.dev aggregates live player-bazaar listings. Public and needs no API key, but it is
    // a third-party host, and a request the Torn page issues itself has to satisfy both Torn's
    // Content-Security-Policy and weav3r's CORS headers — which is why a plain fetch to it never
    // got off the ground. Every weav3r call therefore goes through the userscript manager's
    // cross-origin transport (see requestJson), which runs outside the page and is bound by
    // neither. weav3r is also shared across every consumer at 100 req/min, so responses are
    // cached client-side too.
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
    // A bazaar price this far below the bazaar average is treated as an outlier rather than
    // undercut — a single troll listing must never re-price a whole Fill All run.
    const BAZAAR_SANITY_FLOOR_RATIO = 0.25;
    // How long a single weav3r call may hang before the row gives up and falls back to Torn.
    const WEAV3R_TIMEOUT_MS = 15 * 1000;
    // A Fill All run hits the same weav3r failure on every row; one notice a minute explains the
    // red bars without burying the page in toasts.
    const WEAV3R_NOTICE_THROTTLE_MS = 60 * 1000;
    let weav3rItemCache = new Map();
    let weav3rAllCache = null;
    let lastWeav3rNoticeTs = 0;
    let priceDeltaRaw = localStorage.getItem("silmaril-torn-bazaar-filler-price-delta") ?? '-1';
    // How many units to list per item: "max" (all of them), "max-N" (keep N back), a fixed
    // number, or "skip"/"0" to never list. Defaults to "max" — the behaviour before this existed.
    let quantityModeRaw = localStorage.getItem("silmaril-torn-bazaar-filler-quantity-mode") ?? 'max';
    let apiKey = localStorage.getItem("silmaril-torn-bazaar-filler-apikey");

    try {
        GM_registerMenuCommand('Open Settings', openSettingsModal);
        GM_registerMenuCommand("What's new", function(){ openChangelogModal(CHANGELOG); });
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

    GM_addStyle(`.btn-wrap.torn-bazaar-fill-qty-price{float:right;margin-left:auto;z-index:99999}.btn-wrap.torn-bazaar-clear-qty-price{z-index:99999}div.title-wrap div.name-wrap{display:flex;justify-content:flex-end}.tbf-wave-host{position:relative}.tbf-wave-clip{position:absolute;top:0;right:0;bottom:0;left:0;overflow:hidden;pointer-events:none}.wave{pointer-events:none;position:absolute;top:0;left:0;width:100%;height:33px;background-color:transparent;opacity:0;transform:translateX(-100%);animation:waveAnimation 1s cubic-bezier(0, 0, 0, 1)}@keyframes waveAnimation{0%{opacity:1;transform:translateX(-100%)}100%{opacity:0;transform:translateX(100%)}}.overlay-percentage{position:absolute;top:0;background-color:rgba(0, 0, 0, 0.9);padding:0 5px;border-radius:15px;font-size:10px;pointer-events:none}.overlay-percentage-add{right:-30px}@media (max-width:784px){.overlay-percentage-add{right:0}}.overlay-percentage-manage{right:0}.torn-bazaar-fill-qty-price input{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;transition:box-shadow 0s}.torn-bazaar-fill-qty-price input.tbf-holding{box-shadow:inset 0 0 0 40px rgba(0,180,255,.35);transition:box-shadow 3s linear}.tbf-fav{cursor:pointer;font-size:16px;line-height:1;margin-left:auto;margin-right:6px;width:16px;text-align:center;color:#888;align-self:center;user-select:none;-webkit-user-select:none;z-index:99999}.tbf-fav~.btn-wrap.torn-bazaar-fill-qty-price{margin-left:0}.tbf-fav.tbf-fav--on{color:gold;text-shadow:0 0 3px rgba(255,215,0,.7)}.tbf-fillall-bar{position:fixed;bottom:110px;right:16px;display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(0,0,0,.55);border-radius:20px;z-index:999999;touch-action:none;transition:box-shadow .2s ease}.tbf-fillall-grip{cursor:grab;color:#bbb;font-size:14px;line-height:1;letter-spacing:-2px;min-width:12px;text-align:center;align-self:center;user-select:none;-webkit-user-select:none}.tbf-fillall-bar--dragging{cursor:grabbing;opacity:.92}.tbf-fillall-bar--dragging .tbf-fillall-grip{cursor:grabbing}.tbf-fillall-cog{cursor:pointer;flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.12);color:#ddd;font-size:13px;line-height:1;user-select:none;-webkit-user-select:none}.tbf-fillall-cog:hover{background:rgba(255,255,255,.28);color:#fff}.tbf-fillall-bar--min{padding:5px 7px;gap:4px}.tbf-fillall-bar--min .tbf-fillall-btn,.tbf-fillall-bar--min .tbf-fillall-cog{display:none}.tbf-fillall-bar--min .tbf-fillall-grip{font-size:16px}.tbf-autofill-dot{display:none;width:10px;height:10px;border-radius:50%;background:gold;box-shadow:0 0 4px gold;animation:tbfPulse 1s ease-in-out infinite}.tbf-fillall-bar--active .tbf-autofill-dot{display:inline-block}.tbf-fillall-bar--active{box-shadow:0 0 10px 2px rgba(255,215,0,.75)}@keyframes tbfPulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}.tbf-viewport-border{display:none;position:fixed;top:0;right:0;bottom:0;left:0;border:3px solid gold;box-shadow:inset 0 0 12px rgba(255,215,0,.6);pointer-events:none;z-index:999998}.tbf-viewport-border--active{display:block}.tbf-toast{position:fixed;bottom:158px;right:16px;max-width:280px;background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:8px;border:1px solid gold;font-size:13px;line-height:1.4;z-index:1000000;opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s}.tbf-toast--visible{opacity:1;visibility:visible}.tbf-fav.tbf-fav--off{color:#ff6b6b;text-shadow:none}`);

    GM_addStyle(`.tbf-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483000;justify-content:center;align-items:flex-start;overflow:auto;padding:24px 12px;box-sizing:border-box}.tbf-modal-overlay--open{display:flex}.tbf-modal{background:#1f1f1f;color:#e6e6e6;width:100%;max-width:420px;border:1px solid #666;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);padding:16px 18px;box-sizing:border-box;font-size:13px;line-height:1.5}.tbf-modal h3{margin:0 0 12px;font-size:15px;display:flex;justify-content:space-between;align-items:center;color:#fff}.tbf-modal-close{cursor:pointer;color:#bbb;font-size:22px;line-height:1}.tbf-modal label{display:block;margin:10px 0 3px;font-weight:bold;color:#cfcfcf}.tbf-modal input[type=text],.tbf-modal input[type=password]{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:5px;border:1px solid #666;background:#111;color:#eee;font-size:13px}.tbf-modal-key{position:relative;display:flex;align-items:center}.tbf-modal-key input[type=text],.tbf-modal-key input[type=password]{padding-right:52px}.tbf-modal-key-reveal{position:absolute;right:7px;cursor:pointer;color:#bbb;font-size:11px;line-height:1;padding:3px 4px;user-select:none;-webkit-user-select:none}.tbf-modal-key-reveal:hover{color:#fff}.tbf-modal-cats{margin-top:4px}.tbf-modal-cat-row{display:flex;gap:6px;margin-bottom:6px;align-items:center}.tbf-modal-cat-row .tbf-modal-cat-name{flex:1 1 55%}.tbf-modal-cat-row .tbf-modal-cat-formula{flex:1 1 45%}.tbf-modal-cat-del{cursor:pointer;color:#ff6b6b;font-size:20px;line-height:1;flex:0 0 auto;width:22px;text-align:center}.tbf-modal-addcat{margin-top:2px;cursor:pointer;background:#333;color:#eee;border:1px solid #666;border-radius:5px;padding:5px 10px;font-size:12px}.tbf-modal-resetcat{margin:2px 0 0 8px;cursor:pointer;background:#3a2a2a;color:#ddd;border:1px solid #774;border-radius:5px;padding:5px 10px;font-size:12px}.tbf-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.tbf-modal-actions button{cursor:pointer;padding:7px 16px;border-radius:5px;border:1px solid #666;background:#333;color:#eee;font-size:13px}.tbf-modal-save{background:#2e7d32!important;border-color:#2e7d32!important;color:#fff!important}.tbf-modal-help{margin-top:12px;font-size:11px;color:#9a9a9a;line-height:1.5}.tbf-modal-help code{background:#000;padding:1px 4px;border-radius:3px;color:#cfc}.tbf-modal-cat-row input{min-width:0}.tbf-modal-cat-row .tbf-modal-cat-name{flex:1 1 38%}.tbf-modal-cat-row .tbf-modal-cat-formula{flex:1 1 32%}.tbf-modal-cat-row .tbf-modal-cat-qty{flex:1 1 30%}.tbf-modal-cat-head{display:flex;gap:6px;margin:0 0 4px;font-size:11px;color:#9a9a9a}.tbf-modal-cat-head span:nth-child(1){flex:1 1 38%}.tbf-modal-cat-head span:nth-child(2){flex:1 1 32%}.tbf-modal-cat-head span:nth-child(3){flex:1 1 30%}.tbf-modal-cat-head span:nth-child(4){flex:0 0 22px}.tbf-modal-clearexcl{margin:2px 0 0 8px;cursor:pointer;background:#3a2a2a;color:#ddd;border:1px solid #774;border-radius:5px;padding:5px 10px;font-size:12px}.tbf-modal-error{display:none;margin-top:12px;padding:8px 10px;border-radius:5px;background:#3a1f1f;border:1px solid #a34;color:#ffb3b3;font-size:12px;line-height:1.4}.tbf-modal input.tbf-modal-invalid{border-color:#ff6b6b;box-shadow:0 0 0 1px rgba(255,107,107,.45)}`);

    GM_addStyle(`.tbf-changelog-release{margin:0 0 14px}.tbf-changelog-release:last-of-type{margin-bottom:0}.tbf-changelog-ver{display:flex;align-items:baseline;gap:8px;margin:0 0 6px}.tbf-changelog-ver b{color:#fff;font-size:13px}.tbf-changelog-date{color:#8a8a8a;font-size:11px;margin-left:auto}.tbf-changelog-badge{background:#2e7d32;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;text-transform:uppercase;letter-spacing:.04em}.tbf-changelog-items{margin:0;padding-left:18px;color:#cfcfcf}.tbf-changelog-items li{margin:0 0 5px}.tbf-changelog-items code{background:#000;padding:1px 4px;border-radius:3px;color:#cfc}`);

    GM_addStyle(`.tbf-ana-btn{cursor:pointer;position:relative;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-right:6px;color:#888;align-self:center;user-select:none;-webkit-user-select:none;z-index:99999}.tbf-ana-btn:hover{color:#fff}.tbf-ana-btn svg{display:block;width:14px;height:12px;fill:currentColor;pointer-events:none}.tbf-wave-host[data-tbf-tone] .tbf-ana-btn:after{content:"";position:absolute;top:-3px;right:-4px;width:8px;height:8px;border-radius:50%;border:1px solid #1f1f1f;background:#4caf50;box-shadow:0 0 3px #4caf50;pointer-events:none;z-index:1}.tbf-wave-host[data-tbf-tone="yellow"] .tbf-ana-btn:after{background:#e6c200;box-shadow:0 0 3px #e6c200}.tbf-wave-host[data-tbf-tone="red"] .tbf-ana-btn:after{background:#e53935;box-shadow:0 0 3px #e53935}.tbf-wave-host[data-tbf-tone="orange"] .tbf-ana-btn:after{background:#fb8c00;box-shadow:0 0 3px #fb8c00}.tbf-wave-host[data-tbf-tone="grey"] .tbf-ana-btn:after{background:#9e9e9e;box-shadow:none}.tbf-ana{display:none;position:fixed;top:60px;left:40px;width:540px;max-width:calc(100vw - 16px);max-height:calc(100vh - 24px);overflow:auto;background:#1f1f1f;color:#e6e6e6;border:1px solid #666;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);padding:12px 14px;box-sizing:border-box;font-size:12px;line-height:1.45;z-index:999999;text-align:left}.tbf-ana--open{display:block}@media (max-width:784px){.tbf-ana{top:auto!important;left:0!important;right:0;bottom:0;width:auto;max-width:none;max-height:85vh;border-radius:14px 14px 0 0;border-bottom:0}}.tbf-ana-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:move;user-select:none;-webkit-user-select:none}@media (max-width:784px){.tbf-ana-head{cursor:default}}.tbf-ana-img{width:34px;height:34px;border-radius:4px;background:#2a2a2a;flex:none;object-fit:contain}.tbf-ana-title{display:flex;flex-direction:column;line-height:1.3;min-width:0}.tbf-ana-title b{font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tbf-ana-title small{font-size:11px;color:#a5a5a5}.tbf-ana-hb{margin-left:auto;color:#bbb;font-size:16px;line-height:1;cursor:pointer;width:22px;text-align:center;flex:none}.tbf-ana-hb:hover{color:#fff}.tbf-ana-hb.tbf-ana-close{margin-left:0;font-size:22px}.tbf-ana-tabs{display:flex;gap:2px;border-bottom:1px solid #444;margin:0 0 8px}.tbf-ana-tab{padding:5px 12px;font-size:12px;color:#aaa;border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer}.tbf-ana-tab:hover{color:#ddd}.tbf-ana-tab--on,.tbf-ana-tab--on:hover{color:#fff;border-bottom-color:#b5d56a}.tbf-ana-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0 8px}@media (max-width:784px){.tbf-ana-kpis{grid-template-columns:1fr 1fr}}.tbf-ana-kpi{background:#262626;border:1px solid #3a3a3a;border-radius:6px;padding:6px 8px;min-width:0}.tbf-ana-kpi .l{font-size:9.5px;color:#9a9a9a;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}.tbf-ana-kpi .v{font-size:15px;font-weight:bold;color:#fff;margin:2px 0 1px;white-space:nowrap}.tbf-ana-kpi .d{font-size:10.5px;color:#aaa;line-height:1.3}.tbf-ana-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:#bbb;margin:2px 0 4px}.tbf-ana-legend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.tbf-ana-sw{display:inline-block;width:9px;height:9px;border-radius:2px}.tbf-ana-m{background:#3987e5}.tbf-ana-b{background:#d95926}.tbf-ana-src{width:16px;height:16px;border-radius:50%;font-size:9px;font-weight:bold;display:inline-grid;place-items:center;color:#fff;flex:none}.tbf-ana-src.tbf-ana-y{background:#c9a227;color:#1f1f1f;font-size:10px}.tbf-ana-sec{font-size:10.5px;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px;font-weight:bold}.tbf-ana-sec code{text-transform:none;letter-spacing:0}.tbf-ana-sec small{text-transform:none;letter-spacing:0;font-weight:normal;color:#8a8a8a;margin-left:4px}.tbf-ana-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media (max-width:784px){.tbf-ana-cols{grid-template-columns:1fr}}.tbf-ana-band{margin:0 0 7px}.tbf-ana-bl{font-size:11px;color:#ddd;margin-bottom:2px}.tbf-ana-brow{display:flex;align-items:center;gap:6px;height:14px;margin:1px 0}.tbf-ana-bar{display:block;height:8px;border-radius:0 4px 4px 0;flex:none;max-width:46%}.tbf-ana-bv{font-size:10.5px;color:#aaa;white-space:nowrap}.tbf-ana-lad{margin:4px 0 2px;border-top:1px solid #333}.tbf-ana-lr{display:flex;align-items:center;gap:8px;padding:3px 6px;border-bottom:1px solid #2c2c2c;font-size:12px;min-height:25px;box-sizing:border-box}.tbf-ana-lr[data-price]{cursor:pointer}.tbf-ana-lr[data-price]:hover{background:#2a2a2a}.tbf-ana-lr .p{width:82px;text-align:right;color:#f0f0f0;flex:none}.tbf-ana-lr .q{width:56px;color:#bbb;text-align:right;flex:none}.tbf-ana-lr .n{flex:1;color:#999;font-size:10.5px;min-width:0;line-height:1.3}.tbf-ana-lr--you{background:#3a3414;border:1px solid #c9a227;border-radius:6px;margin:2px 0;color:#fff}.tbf-ana-lr--you .p,.tbf-ana-lr--you .n{color:#fff}.tbf-ana-lr--dim .p,.tbf-ana-lr--dim .q{color:#777}.tbf-ana-lr--more{min-height:22px;border-bottom:0}.tbf-ana-lr--hidden{display:none}.tbf-ana--all .tbf-ana-lr--hidden{display:flex}.tbf-ana--all .tbf-ana-showall{display:none}.tbf-ana-tag{display:inline-block;font-size:9.5px;padding:1px 6px;border-radius:8px;background:#2e7d32;color:#fff;white-space:nowrap;line-height:1.4;margin-right:4px}.tbf-ana-tag--gray{background:#444;color:#ccc}.tbf-ana-tag--blue{background:#1c5cab}.tbf-ana-hint{font-size:10.5px;color:#8a8a8a;margin:4px 0 2px}.tbf-ana-verdict{margin:8px 0 2px;padding:7px 9px;background:#262626;border-left:3px solid #c9a227;border-radius:0 6px 6px 0;font-size:11.5px;line-height:1.45;color:#ddd}.tbf-ana code{background:#000;padding:1px 4px;border-radius:3px;color:#cfc;font-size:10.5px}.tbf-ana a{color:#9cc25e;text-decoration:underline;cursor:pointer}.tbf-ana-foot{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid #333}.tbf-ana-foot:empty{display:none}.tbf-ana-sum{flex:1;font-size:10.5px;color:#9a9a9a;line-height:1.3}.tbf-ana-foot button{cursor:pointer;padding:6px 12px;border-radius:5px;border:1px solid #666;background:#333;color:#eee;font-size:12px;white-space:nowrap}.tbf-ana-foot button.tbf-ana-apply{background:#2e7d32;border-color:#2e7d32;color:#fff}.tbf-ana-trace{margin:4px 0 0;font-size:11.5px}.tbf-ana-tr{display:flex;align-items:baseline;gap:8px;padding:3px 6px;border-radius:4px;flex-wrap:wrap;line-height:1.35}.tbf-ana-tr .op{color:#9a9a9a;font-family:monospace;font-size:12px}.tbf-ana-tr .r{font-weight:bold;color:#fff;white-space:nowrap}.tbf-ana-tr .why{color:#9a9a9a;font-size:10.5px;flex:1 1 100%;padding-left:2px}.tbf-ana-tr--win{background:#2a2f1e;border-left:3px solid #8fd08f}.tbf-ana-tr--win .r{color:#b5d56a}.tbf-ana-note{margin-top:6px;font-size:10.5px;color:#8a8a8a;border-top:1px solid #333;padding-top:6px}.tbf-ana-alert{margin:0 0 6px;padding:8px 10px;border-radius:6px;background:#3a2f1f;border:1px solid #a7792a;color:#ffd9a0;font-size:11.5px;line-height:1.4}.tbf-ana-skel{display:inline-block;height:8px;border-radius:4px;background:#333;margin:3px 0}.tbf-ana-muted{color:#8a8a8a;font-size:11px;margin:4px 0}`);

    const lastSeenVersionKey = "silmaril-torn-bazaar-filler-last-seen-version";
    // Newest release first. Everything a user could have skipped over is listed, so updating
    // across several versions still shows the whole gap in one popup. A release marked
    // `silent: true` is left out of that and never opens the popup by itself; it is listed
    // only when the popup is opened from the menu. Leaving the flag off means false.
    // Write every line for a player, not a developer: one short sentence, plain words,
    // what changed for them rather than what changed in the code.
    const CHANGELOG = [
        {
            version: "2.0.0",
            date: "2026-11-01",
            changes: [
                'New: a small <code>▂▅▇</code> icon between the star and Fill opens item analytics. The cheapest item-market and bazaar listings sit on one price ladder with your price slotted in, with how many units are ahead of you and how the listings split by stack size.',
                'Its Formula tab works your price setting out branch by branch: the listing each one read, the ones it skipped, and which one filled.',
                'Click a listing in the popup to price $1 under it. Opened right after a fill, the popup reuses what the fill read and costs no extra request.'
            ]
        },
        {
            version: "1.12.0",
            date: "2026-11-01",
            changes: [
                'New: undercut only the big stacks. <code>-1[100x+]</code> undercuts the cheapest listing of 100 or more, so a first page full of 1x and 2x sellers no longer drags your price down.',
                '<code>-1[mine+]</code> undercuts the cheapest listing at least as big as the stack you are filling. <code>-1[2xmine+]</code> looks for one at least twice as big, <code>-1[0.5xmine+]</code> at least half.',
                'Add <code>above</code> to skip sellers who are too cheap: <code>-1[mine+ above +5%[market]]</code> undercuts the first big stack that still leaves you 5% over market value.',
                'Stack sizes work on bazaar prices too, like <code>-1[bazaar:100x+]</code>. When no listing fits, the price is left as it is and a note says why.'
            ]
        },
        {
            version: "1.11.5",
            date: "2026-10-20",
            silent: true,
            changes: [
                'Minor updates now arrive quietly: they are listed here, but no longer open this popup on their own.'
            ]
        },
        {
            version: "1.11.0",
            date: "2026-09-21",
            changes: [
                'New: price ranges. Put <code>min()</code> and <code>max()</code> inside each other to keep a price between a floor and a ceiling.',
                '<code>min(max(-1, +10%[market]), -1[14])</code> undercuts the cheapest listing, but never goes below 10% over market value, and never above the 15th listing &minus; $1.',
                'Handy when a big stack would otherwise make you the cheapest seller and you would rather sit further down the list.'
            ]
        },
        {
            version: "1.10.0",
            date: "2026-09-07",
            changes: [
                'New: combine price sources. Write <code>-1[bazaar] | -1</code> and both are priced, then the higher one is filled. Use it to put a floor under a source that sometimes goes cheap.',
                'The same thing spelled out is <code>max(-1[bazaar], -1)</code>. Use <code>min(-1[bazaar], -1)</code> instead to fill the lower one and undercut whichever source is cheapest.',
                'Settings now checks what you type. A price or quantity it cannot use is refused with a note saying which field is wrong and why, instead of being saved and failing on every item later.'
            ]
        },
        {
            version: "1.9.3",
            date: "2026-09-07",
            changes: [
                'Fixed: the <code>[bazaar]</code> prices never worked at all. They do now.',
                'Your userscript manager may ask for a new permission on this update. Say yes, or bazaar prices stay broken.',
                'If you only use bazaar prices, the script no longer asks for a Torn API key it does not need.',
                'A bazaar price that cannot be fetched now tells you why, instead of just going red.'
            ]
        },
        {
            version: "1.9.0",
            date: "2026-09-02",
            changes: [
                'New: price against player bazaars, not just the item market. Put <code>[bazaar]</code> in your price setting to undercut the cheapest bazaar. No API key needed.',
                'That is who you actually compete with, since bazaars usually sell below the item market.',
                'Also <code>[bazaar:2]</code> for the 3rd cheapest, <code>[bazaar:avg]</code> for the average and <code>[bazaar:median]</code> for the middle price.',
                'Sponsored, stale and silly-cheap listings are ignored, so one troll price cannot drag Fill All down.',
                'An item with no bazaar price falls back to the item market instead of failing.',
                'Fixed: a price with no discount, such as <code>[market]</code> on its own, no longer errors.',
                'New: this popup. After an update it lists what changed, then stays quiet until the next one.'
            ]
        }
    ];

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
    const SETTINGS_CATEGORIES = ["Melee","Primary","Secondary","Defensive","Temporary","Drug","Medical","Booster","Energy Drink","Alcohol","Candy","Enhancer","Clothing","Jewelry","Material","Flower","Plushie","Car","Supply Pack","Special","Collectible","Artifact","Tool","Other"];
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

    // Torn PDA ignores @require, so nothing here may depend on jQuery being loaded.
    // Falling back to the body keeps the observer alive if the wrapper is renamed.
    const observerTarget = document.querySelector(".content-wrapper") ?? document.body;
    const observerConfig = { attributes: false, childList: true, characterData: false, subtree: true };

    let scanScheduled = false;
    function scanAndInject() {
        scanScheduled = false;

        // Add Items page rows (legacy non-virtualized list)
        document.querySelectorAll("ul.items-cont li.clearfix div.title-wrap div.name-wrap").forEach(function(nameWrap){
            let isParentRowDisabled = nameWrap.parentElement.parentElement.classList.contains("disabled");
            let alreadyHasFillBtn = nameWrap.querySelector(".btn-wrap.torn-bazaar-fill-qty-price") != null;
            if (!alreadyHasFillBtn && !isParentRowDisabled){
                insertFillAndWaveBtn(nameWrap, addItemsLabels, pages.AddItems);
            }
        });

        // Manage Items page rows (virtualized list — rows mount/unmount on scroll & dnd-kit reorder)
        document.querySelectorAll('div[data-testid="sortable-item"] div[class*="item___"] div[class*="desc___"], ' +
                                  'div[class*="row___"] div[class*="item___"] div[class*="desc___"]').forEach(function(descWrap){
            let alreadyHasUpdateBtn = descWrap.querySelector(".btn-wrap.torn-bazaar-fill-qty-price") != null;
            if (!alreadyHasUpdateBtn) {
                insertFillAndWaveBtn(descWrap, updateItemsLabels, pages.ManageItems);
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
    const tabLinkSelector = 'div[class*="topSection___"] a[href="#/add"], ' +
                            'div[class*="topSection___"] a[href="#/manage"], ' +
                            'div[class*="topSection___"] a[href="#/personalize"], ' +
                            'div[class*="topSection___"] a[href="#/"]';
    document.addEventListener("click", function(event) {
        if (closestMatch(event.target, tabLinkSelector) != null) {
            scheduleScan();
        }
    });

    // Initial pass — rows may already be in the DOM at script start (run-at: document-idle).
    scheduleScan();

    // Tell the user what an update changed, the first time they land on a bazaar page after it.
    maybeShowChangelog();

    // Plain-DOM replacements for the jQuery delegation this script used to rely on.
    // Torn PDA never loads @require libraries, so on Android jQuery is simply not there.
    function closestMatch(eventTarget, selector) {
        return eventTarget instanceof Element ? eventTarget.closest(selector) : null;
    }

    // Runs handler with `this` bound to the clicked <input>, like $(container).on("click", "input", fn).
    function onInputClick(container, handler) {
        container.addEventListener("click", function(event) {
            const input = closestMatch(event.target, "input");
            if (input != null && container.contains(input)) {
                handler.call(input, event);
            }
        });
    }

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
            // Opens the item analytics popup for this row: a star-sized icon between the star and
            // Fill, fed by the same reads a Fill makes.
            const anaBtn = document.createElement('span');
            anaBtn.className = 'tbf-ana-btn';
            anaBtn.title = 'Item analytics: market and bazaar listings, stack sizes, and what your formula picked';
            anaBtn.innerHTML = ANALYTICS_ICON;
            anaBtn.addEventListener('click', function(event){
                event.preventDefault();
                event.stopPropagation();
                openAnalytics({ itemId: itemId, host: element, pageType: pageType, fillInput: inputElementFill });
            });
            element.append(favBtn, anaBtn);
        }

        // The wave sweeps a full row-width past its own right edge. Left unclipped, that briefly
        // widens the page, and a phone browser zooms out to fit it, then back in once it ends.
        const waveClip = document.createElement('div');
        waveClip.className = 'tbf-wave-clip';
        waveClip.appendChild(waveDiv);
        element.classList.add('tbf-wave-host');

        element.append(outerSpanFill, outerSpanClear, waveClip);

        switch(pageType) {
            case pages.AddItems:
                onInputClick(outerSpanFill, function(event) {
                    checkApiKey();
                    warnIfExcluded(this);
                    this.parentNode.style.display = "none";
                    fillQuantityAndPrice(this, pageType, false);
                    event.stopPropagation();
                });

                onInputClick(outerSpanClear, function(event) {
                    this.parentNode.style.display = "none";
                    clearQuantityAndPrice(this);
                    event.stopPropagation();
                });
                break;
            case pages.ManageItems:
                onInputClick(outerSpanFill, function(event) {
                    checkApiKey();
                    warnIfExcluded(this);
                    // this.parentNode.style.display = "none";
                    updatePrice(this);
                    event.stopPropagation();
                });

                // onInputClick(outerSpanClear, function(event) {
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
            let session = newSession(extractedItemId);
            let pricing = await fetchPricingForItem(extractedItemId, session);
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
            let resolved = await resolveFillPrice(pricing, extractedItemId, { mine: resolvedQuantity, session: session });
            if (resolved.unmatched != null){
                skipped = true;
                return reportUnmatchedRow(wave, extractedItemId, resolved.unmatched, isAuto);
            }
            if (resolved.error != null){
                return handleApiError(resolved.error, wave) ?? "error";
            }
            let lowBallPrice = resolved.price;
            if (resolved.listings != null){
                applyPriceCoefficientOverlay(insertPercentageSpan(amountDiv), wave, lowBallPrice, resolved.listings);
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
            setRowTone(wave, "red");
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

    async function updatePrice(element, isAuto){
        let moneyGroupDiv;
        let parentNode4 = element.parentNode.parentNode.parentNode.parentNode;
        moneyGroupDiv = manageMoneyGroup(parentNode4);
        if (moneyGroupDiv == null) {
            return "error";
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
            let session = newSession(extractedItemId);
            let pricing = await fetchPricingForItem(extractedItemId, session);
            let data = pricing.data;
            let apiErrorStatus = handleApiError(data, wave);
            if (apiErrorStatus !== null){
                return apiErrorStatus;
            }
            // On Manage the stack is the one already in the bazaar.
            let resolved = await resolveFillPrice(pricing, extractedItemId, { mine: getMaxQuantity(element, pages.ManageItems), session: session });
            if (resolved.unmatched != null){
                return reportUnmatchedRow(wave, extractedItemId, resolved.unmatched, isAuto);
            }
            if (resolved.error != null){
                return handleApiError(resolved.error, wave) ?? "error";
            }
            let lowBallPrice = resolved.price;
            if (resolved.listings != null){
                applyPriceCoefficientOverlay(insertPercentageManageSpan(moneyGroupDiv), wave, lowBallPrice, resolved.listings);
            }

            priceInputs.forEach(x => { x.value = lowBallPrice; });
            priceInputs[0].dispatchEvent(inputEvent);
            return "ok";
        } catch (error) {
            setRowTone(wave, "red");
            wave.style.backgroundColor = "red";
            wave.style.animationDuration = "5s";
            console.error("[TornBazaarFiller] Error fetching data:", error);
            return "error";
        }
    }

    // The price box of a Manage Items row, given the row's item container. On a phone the box
    // lives in a menu that has to be opened first. Null, with a warning, when the DOM has moved.
    function manageMoneyGroup(itemNode){
        if (isMobileView){
            if (itemNode.querySelector("[class*=menuActivators___] button[class*=iconContainer___][aria-label=Manage] span[class*=active___]") == null) {
                itemNode.querySelector("[class*=menuActivators___] button[class*=iconContainer___][aria-label=Manage]").click();
            }
            let mobileGroup = itemNode.parentNode.querySelector("[class*=bottomMobileMenu___] [class*=priceMobile___]");
            if (mobileGroup == null) {
                console.warn("[TornBazaarFiller] Mobile price container not found — '[class*=bottomMobileMenu___] [class*=priceMobile___]' returned null. Mobile DOM may have changed.");
            }
            return mobileGroup;
        }
        let group = itemNode.querySelector("div[class*=price___]");
        if (group == null) {
            console.warn("[TornBazaarFiller] Price container not found — 'div[class*=price___]' returned null. Manage Items DOM may have changed.");
        }
        return group;
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

    function isKnownQuantityMode(mode){
        let normalised = String(mode ?? '').trim().toLowerCase();
        return normalised === '' || normalised === 'max' || normalised === 'skip' || normalised === 'none' ||
            /^\d+$/.test(normalised) || /^max\s*-\s*\d+$/.test(normalised);
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
        setRowTone(wave, "grey");
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

    // A stack size or "above" limit left no listing to read, so the row is left as it is.
    function reportUnmatchedRow(wave, itemId, why, isAuto){
        setRowTone(wave, "grey");
        wave.style.backgroundColor = "white";
        wave.style.animation = 'none';
        wave.offsetHeight;
        wave.style.animation = null;
        console.info("[TornBazaarFiller] Item " + itemId + " left untouched: " + why + ".");
        if (!isAuto){
            showToast("Price left as it is: " + why + ".");
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
                 node.classList.contains('tbf-ana-btn') ||
                 node.classList.contains('torn-bazaar-fill-qty-price') ||
                 node.classList.contains('torn-bazaar-clear-qty-price') ||
                 node.classList.contains('tbf-wave-clip'))){
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
            localStorage.removeItem("silmaril-torn-bazaar-filler-apikey");
            setRowTone(wave, "red");
            wave.style.backgroundColor = "red";
            wave.style.animationDuration = "5s";
            console.error("[TornBazaarFiller] Incorrect Api Key:", data);
            return "invalid-key";
        }
        if (data.error.code === 5) {
            setRowTone(wave, "orange");
            wave.style.backgroundColor = "orange";
            wave.style.animationDuration = "3s";
            console.warn("[TornBazaarFiller] API rate limit reached:", data);
            return "rate-limited";
        }
        setRowTone(wave, "red");
        wave.style.backgroundColor = "red";
        wave.style.animationDuration = "5s";
        console.error("[TornBazaarFiller] API error:", data);
        return "error";
    }

    // The analytics button carries a dot in the colour the wave had, so the warning outlives
    // the sweep. Cleared when the row is left as it was.
    function setRowTone(wave, tone){
        let host = typeof wave.closest === 'function' ? wave.closest('.tbf-wave-host') : null;
        if (host == null){
            return;
        }
        if (tone == null){
            delete host.dataset.tbfTone;
        } else {
            host.dataset.tbfTone = tone;
        }
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
                        status = await updatePrice(fillInput, true);
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
        // A formula that is nothing but a source — "[market]", "[bazaar]" — leaves no delta
        // behind, and means "take the source price as it stands".
        if (operation == null || operation.trim() === '') {
            return number;
        }

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

    // The index of the ) that closes the ( at `open`, or -1 when nothing does.
    function matchingParen(text, open){
        let depth = 0;
        for (let i = open; i < text.length; i++){
            if (text.charAt(i) === '('){
                depth++;
            } else if (text.charAt(i) === ')'){
                depth--;
                if (depth === 0){
                    return i;
                }
            }
        }
        return -1;
    }

    // Split on the separators that belong to this level only: the ones inside a nested
    // min(...)/max(...) belong to that call, not to us.
    // A comma inside a formula's [ ] is part of a stack size, like [1,000x+], not a separator.
    function splitTopLevel(body){
        let parts = [];
        let depth = 0;
        let squareDepth = 0;
        let current = '';
        for (let i = 0; i < body.length; i++){
            let ch = body.charAt(i);
            if (ch === '('){
                depth++;
            } else if (ch === ')'){
                depth--;
            } else if (ch === '['){
                squareDepth++;
            } else if (ch === ']'){
                squareDepth--;
            } else if ((ch === '|' || ch === ',') && depth <= 0 && squareDepth <= 0){
                parts.push(current);
                current = '';
                continue;
            }
            current += ch;
        }
        parts.push(current);
        return parts;
    }

    // A setting parses into a tree. A leaf is one formula, {kind:'formula'}; min(...) and
    // max(...) are {kind:'combine'} nodes over the formulas — or over further calls — inside
    // them. "a | b" and "max(a, b)" both mean the highest of a and b; "min(a, b)" means the
    // lowest, to undercut whichever source is cheapest. Calls nest, so a price can be held
    // inside a band: min(max(a, b), c) is never below b and never above c.
    // Nothing here throws on a formula it cannot make sense of — a setting saved before Save
    // started validating them still parses, as the one leaf it will later fail to price.
    function parseSetting(setting){
        return parseExpression(String(setting ?? '').trim(), 'max');
    }

    // One level: the terms between this level's separators, combined by `combine`. A single
    // term needs no node of its own, since the highest — or lowest — of one thing is itself.
    function parseExpression(body, combine){
        let terms = splitTopLevel(body).map(function(term){ return term.trim(); })
            .filter(function(term){ return term !== ''; });
        if (terms.length === 0){
            terms = [body.trim()];
        }
        if (terms.length === 1){
            return parseTerm(terms[0]);
        }
        return {
            kind: 'combine',
            combine: combine,
            children: terms.map(parseTerm)
        };
    }

    // Either a min()/max() call wrapping another expression, or a plain formula.
    function parseTerm(term){
        let open = term.indexOf('(');
        if (open !== -1){
            let name = term.substring(0, open).trim().toLowerCase();
            let close = matchingParen(term, open);
            if ((name === 'min' || name === 'max') && close !== -1 && term.substring(close + 1).trim() === ''){
                return parseExpression(term.substring(open + 1, close), name);
            }
        }
        return { kind: 'formula', formula: term };
    }

    // Every formula in a setting, in the order it was written, whatever it is nested inside.
    function collectFormulas(node){
        if (node.kind === 'formula'){
            return [node.formula];
        }
        let formulas = [];
        for (let i = 0; i < node.children.length; i++){
            formulas = formulas.concat(collectFormulas(node.children[i]));
        }
        return formulas;
    }

    function formulaBranches(setting){
        return collectFormulas(parseSetting(setting));
    }

    // The branch a one-formula decision has to look at: which endpoint to try first, and
    // whether a Torn key is needed at all.
    function firstBranch(setting){
        return formulaBranches(setting)[0];
    }

    function stripDeltaBracket(formula){
        // Trimmed, because Save accepts "-1 [0]" and the delta parser does not allow the space.
        return formula.indexOf('[') == -1 ? formula : formula.substring(0, formula.indexOf('[')).trim();
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

    // ---- Price sources ---------------------------------------------------------------------
    // A formula names its source inside its bracket: no bracket or [n] is Torn's item market,
    // [market] is Torn's market value, [bazaar...] is weav3r's player-bazaar data.
    // A listing source can also say which listings count at all. [100x+] keeps stacks of 100
    // or more, [mine+] stacks at least as big as the one being filled, [2xmine+] at least twice
    // that. "above <formula>" at the end skips every listing that would put the price under
    // that formula's price: -1[mine+ above +5%[market]]. Parts are joined with ":", in any
    // order: [bazaar:1:100x+] is the 2nd cheapest bazaar listing of 100 or more.

    // The item market will not take a bigger listing than this, so asking it for a bigger
    // stack could never match anything.
    const ITEM_MARKET_MAX_STACK = 9999;

    // The ] that closes the [ at `open`, counting the brackets of an "above" limit inside it,
    // or -1 when nothing closes it.
    function matchingBracket(text, open){
        let depth = 0;
        for (let i = open; i < text.length; i++){
            if (text.charAt(i) === '['){
                depth++;
            } else if (text.charAt(i) === ']'){
                depth--;
                if (depth === 0){
                    return i;
                }
            }
        }
        return -1;
    }

    // What sits between a formula's brackets, or null when it has none.
    function bracketBody(formula){
        let open = formula.indexOf('[');
        if (open == -1){
            return null;
        }
        let close = matchingBracket(formula, open);
        return close == -1 ? formula.substring(open + 1) : formula.substring(open + 1, close);
    }

    // A bracket is "<selector>" or "<selector> above <limit formula>". Split on the first
    // "above" that is not inside the limit's own bracket.
    function splitAbove(body){
        let depth = 0;
        for (let i = 0; i < body.length; i++){
            let ch = body.charAt(i);
            if (ch === '['){
                depth++;
            } else if (ch === ']'){
                depth--;
            } else if (depth === 0 && (i === 0 || /\s/.test(body.charAt(i - 1))) &&
                       /^above(\s|$)/i.test(body.substring(i))){
                return { selector: body.substring(0, i), limit: body.substring(i + 'above'.length).trim() };
            }
        }
        return { selector: body, limit: null };
    }

    function bracketToken(formula){
        let body = bracketBody(formula);
        return body == null ? '' : splitAbove(body).selector.trim().toLowerCase();
    }

    // The formula after "above", or null when the bracket has no limit.
    function aboveLimit(formula){
        let body = bracketBody(formula);
        return body == null ? null : splitAbove(body).limit;
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

    // Every source a formula needs, its "above" limit included.
    function sourcesOf(formula){
        let limit = aboveLimit(formula);
        return [sourceOf(formula)].concat(limit != null && limit !== '' ? sourcesOf(limit) : []);
    }

    // One part of a listing selector, or null when it is not one.
    function readSelectorPart(part){
        let match;
        if (part === 'avg' || part === 'average'){
            return { kind: 'avg' };
        }
        if (part === 'median'){
            return { kind: 'median' };
        }
        if (/^\d+$/.test(part)){
            return { kind: 'slot', index: parseInt(part, 10) };
        }
        if ((match = part.match(/^(\d[\d,]*)x\+$/)) != null){
            return { size: 'fixed', minStack: parseInt(match[1].replace(/,/g, ''), 10) };
        }
        if ((match = part.match(/^(?:(\d+(?:\.\d+)?)x)?mine\+$/)) != null){
            return { size: 'mine', factor: match[1] == null ? 1 : parseFloat(match[1]) };
        }
        return null;
    }

    // What a listing source reads: a listing slot, the median, or (bazaar only) the average,
    // plus the smallest stack a listing must hold to count. Parts it cannot read are ignored
    // here; Save refuses them before they get this far.
    function listingSelector(formula){
        let parts = bracketToken(formula).split(':').map(function(part){ return part.trim(); })
            .filter(function(part){ return part !== ''; });
        if (parts[0] === 'bazaar'){
            parts.shift();
        }
        let selector = { kind: 'slot', index: 0, minStack: null, mineFactor: null };
        parts.forEach(function(part){
            let read = readSelectorPart(part);
            if (read == null){
                return;
            }
            if (read.kind != null){
                selector.kind = read.kind;
                if (read.kind === 'slot'){
                    selector.index = read.index;
                }
            } else if (read.size === 'fixed'){
                selector.minStack = read.minStack;
            } else {
                selector.mineFactor = read.factor;
            }
        });
        return selector;
    }

    // Kept for the call sites that only care about the bazaar read kind.
    function bazaarSelector(formula){
        return listingSelector(formula);
    }

    function usesMine(formula){
        return listingSelector(formula).mineFactor != null ||
            (aboveLimit(formula) != null && usesMine(aboveLimit(formula)));
    }

    // The smallest stack a listing needs to count for this formula: null when any size counts,
    // undefined when it depends on your stack and that is not known here.
    function minimumStack(formula, mine, source){
        let selector = listingSelector(formula);
        let wanted = selector.minStack;
        if (selector.mineFactor != null){
            if (mine == null || !(mine > 0)){
                return undefined;
            }
            wanted = Math.ceil(mine * selector.mineFactor);
        }
        if (wanted == null){
            return null;
        }
        wanted = Math.max(1, wanted);
        return source === SOURCE_ITEM_MARKET ? Math.min(wanted, ITEM_MARKET_MAX_STACK) : wanted;
    }

    // The listings a formula may read, after its stack size and "above" limit are applied.
    // `context` carries your stack (`mine`) and the limit's price (`limit`). Returns
    // {listings} or, when nothing is left, {unmatched: a sentence saying why}.
    function eligibleListings(listings, formula, source, context){
        let minimum = minimumStack(formula, context == null ? null : context.mine, source);
        if (minimum === undefined){
            return { unmatched: "your stack size could not be read here, so [" + bracketToken(formula) + "] has nothing to compare with" };
        }
        let limit = context == null ? null : context.limit;
        let delta = stripDeltaBracket(formula);
        let kept = listings.filter(function(listing){
            if (minimum != null && Number(listing.amount ?? 1) < minimum){
                return false;
            }
            return limit == null || performOperation(listing.price, delta) >= limit;
        });
        if (kept.length > 0){
            return { listings: kept, skipped: listings.length - kept.length };
        }
        let why = "no listing";
        if (minimum != null){
            why += " of " + minimum.toLocaleString('en-US') + " or more";
        }
        if (limit != null){
            why += " that keeps the price at or above $" + Math.round(limit).toLocaleString('en-US');
        }
        return { unmatched: why };
    }

    // When a bazaar formula falls back to the item market, its stack size and "above" limit
    // carry over; which bazaar listing it read does not.
    function itemMarketFallbackFormula(formula){
        let parts = bracketToken(formula).split(':').map(function(part){ return part.trim(); })
            .filter(function(part){
                let read = readSelectorPart(part);
                return read != null && read.size != null;
            });
        let limit = aboveLimit(formula);
        if (parts.length === 0 && limit == null){
            return stripDeltaBracket(formula);
        }
        return stripDeltaBracket(formula) + '[' + parts.join(':') + (limit == null ? '' : ' above ' + limit) + ']';
    }

    // Save's check of one bracket. Returns a sentence for the player, or null when it is fine.
    function bracketProblem(formula){
        let token = bracketToken(formula);
        let limit = aboveLimit(formula);
        if (token === 'market'){
            return limit == null ? null : "[market] is one price, not a list, so there is nothing for 'above' to skip.";
        }
        let isBazaar = token === 'bazaar' || token.indexOf('bazaar:') === 0;
        let parts = token.split(':').map(function(part){ return part.trim(); });
        if (isBazaar){
            parts.shift();
        }
        parts = parts.filter(function(part){ return part !== ''; });
        let picks = 0;
        let sizes = 0;
        let average = false;
        for (let i = 0; i < parts.length; i++){
            let read = readSelectorPart(parts[i]);
            if (read == null){
                return isBazaar
                    ? "[" + token + "] is not a bazaar source. Use [bazaar], [bazaar:2], [bazaar:avg], [bazaar:median] or [bazaar:100x+]."
                    : "[" + token + "] is not a price source. Use [0], [median], [market], [bazaar], [100x+] or [mine+].";
            }
            if (read.kind === 'avg' && !isBazaar){
                return "[" + token + "]: only bazaars have an average. Use [bazaar:avg].";
            }
            if (read.kind != null){
                picks++;
                average = average || read.kind === 'avg';
            } else {
                sizes++;
                if (read.size === 'fixed' && !(read.minStack >= 1)){
                    return "[" + parts[i] + "] needs a stack size of 1 or more, like [100x+].";
                }
                if (read.size === 'mine' && !(read.factor > 0)){
                    return "[" + parts[i] + "] needs a number above 0 before x, like [2xmine+].";
                }
            }
        }
        if (picks > 1){
            return "[" + token + "] picks a listing more than once. Use one of a number, median or avg.";
        }
        if (sizes > 1){
            return "[" + token + "] has more than one stack size. Use one, like [100x+] or [mine+].";
        }
        if (average && (sizes > 0 || limit != null)){
            return "[" + token + "]: the bazaar average is one price, so stack sizes and 'above' do not apply to it.";
        }
        if (limit != null){
            if (limit === ''){
                return "'above' needs a price after it, like [mine+ above +5%[market]].";
            }
            if (aboveLimit(limit) != null){
                return "the price after 'above' cannot have an 'above' of its own.";
            }
            return formulaProblem(limit);
        }
        return null;
    }

    // ---- Cross-origin transport -------------------------------------------------------------
    // Torn's CSP and weav3r's CORS headers both police what the page itself issues, so weav3r
    // has to be reached from outside the page. Every userscript manager offers a way to do that;
    // they just disagree on its name. Detection is by typeof so an undeclared name never throws.

    function crossOriginGet(url){
        if (typeof GM_xmlhttpRequest === 'function'){
            return gmGet(GM_xmlhttpRequest, url);
        }
        if (typeof GM !== 'undefined' && GM != null && typeof GM.xmlHttpRequest === 'function'){
            return gmGet(GM.xmlHttpRequest.bind(GM), url);
        }
        // Torn PDA builds before GM_xmlhttpRequest support expose this instead.
        if (typeof PDA_httpGet === 'function'){
            return pdaGet(url);
        }
        return null;
    }

    // The name of the transport a call would use, for error messages that have to distinguish
    // "weav3r said no" from "the browser never let us ask".
    function crossOriginTransport(){
        if (typeof GM_xmlhttpRequest === 'function'){
            return 'GM_xmlhttpRequest';
        }
        if (typeof GM !== 'undefined' && GM != null && typeof GM.xmlHttpRequest === 'function'){
            return 'GM.xmlHttpRequest';
        }
        if (typeof PDA_httpGet === 'function'){
            return 'PDA_httpGet';
        }
        return 'fetch';
    }

    function gmGet(request, url){
        return new Promise(function(resolve, reject){
            request({
                method: 'GET',
                url: url,
                headers: { 'Accept': 'application/json' },
                timeout: WEAV3R_TIMEOUT_MS,
                onload: function(response){
                    resolve({ status: response.status, text: response.responseText ?? '' });
                },
                onerror: function(){ reject(new Error('network error')); },
                onabort: function(){ reject(new Error('aborted')); },
                ontimeout: function(){ reject(new Error('timed out')); }
            });
        });
    }

    // PDA_httpGet resolves to a response whose body is either already a string or behind a
    // text() call, depending on the PDA build; both shapes are normalised here.
    function pdaGet(url){
        return Promise.resolve(PDA_httpGet(url)).then(function(response){
            if (response == null){
                throw new Error('empty PDA response');
            }
            let status = response.status ?? 200;
            if (typeof response.responseText === 'string'){
                return { status: status, text: response.responseText };
            }
            if (typeof response.text === 'function'){
                return Promise.resolve(response.text()).then(function(text){
                    return { status: status, text: String(text ?? '') };
                });
            }
            return { status: status, text: String(response) };
        });
    }

    // One entry point for every weav3r call: the manager's transport when there is one, plain
    // fetch only as a last resort so a manager-less environment still gets to try.
    async function requestJson(url){
        let pending = crossOriginGet(url);
        if (pending == null){
            let fetched = await fetch(url, { headers: { 'Accept': 'application/json' } });
            return { status: fetched.status, ok: fetched.ok, text: await fetched.text() };
        }
        let response = await pending;
        return {
            status: response.status,
            ok: response.status >= 200 && response.status < 300,
            text: response.text
        };
    }

    function parseJsonBody(text){
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error('non-JSON response body');
        }
    }

    // A failure on the plain-fetch path means the page, not weav3r, refused the call, and the
    // two need very different fixes — so the message says which one the user is looking at.
    function describeTransportFailure(error){
        let reason = error == null ? 'unknown error' : (error.message ?? String(error));
        if (crossOriginTransport() !== 'fetch'){
            return reason;
        }
        return reason + ' (this userscript manager exposes no cross-origin request API, so the'
            + ' call had to go through the page, where Torn\'s CSP and weav3r\'s CORS policy both'
            + ' apply — update the script in your manager so its GM_xmlhttpRequest grant is'
            + ' picked up)';
    }

    // Shape a weav3r failure like a Torn error payload so one set of handlers covers both.
    // A 429 borrows Torn's rate-limit code, which already drives the Fill All back-off.
    // A red bar on its own tells the user nothing, so the reason is logged and toasted too.
    function weav3rError(status, message){
        let text = "weav3r: " + message;
        console.error("[TornBazaarFiller] " + text);
        if (Date.now() - lastWeav3rNoticeTs >= WEAV3R_NOTICE_THROTTLE_MS){
            lastWeav3rNoticeTs = Date.now();
            showToast('Bazaar prices unavailable — ' + text);
        }
        return { error: { code: status === 429 ? 5 : -1, error: text } };
    }

    async function fetchWeav3rItem(itemId){
        let cached = weav3rItemCache.get(itemId);
        if (cached != null && (Date.now() - cached.ts) < WEAV3R_ITEM_TTL_MS){
            return cached.payload;
        }
        let payload;
        try {
            let response = await requestJson(weav3rItemUrl.replace("{itemId}", itemId));
            if (!response.ok){
                return weav3rError(response.status, "HTTP " + response.status);
            }
            payload = parseJsonBody(response.text);
        } catch (error) {
            return weav3rError(0, describeTransportFailure(error));
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
        let response = await requestJson(weav3rAllUrl);
        if (!response.ok){
            throw new Error("weav3r snapshot HTTP " + response.status);
        }
        let payload = parseJsonBody(response.text);
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
                console.warn("[TornBazaarFiller] weav3r snapshot unavailable, using the per-item endpoint:", error);
            }
        }
        return fetchWeav3rItem(itemId);
    }

    // Normalise weav3r listings to the {price, amount} shape the rest of the script speaks.
    // The sponsored slot is dropped first — a paid placement must never set your price — and so
    // are listings the crawler has not re-confirmed lately, unless that would leave nothing.
    // weav3r is a third party, so its fields are coerced to numbers before they are used:
    // a listing whose price or quantity is not a finite number is dropped rather than priced.
    function normaliseBazaarListings(data){
        // A listing this far under the average is an outlier, not competition. Dropping it (rather
        // than refusing the item) means the next genuine listing sets the price.
        let average = Number(data.bazaar_average);
        let floor = Number.isFinite(average) ? average * BAZAAR_SANITY_FLOOR_RATIO : 0;
        let usable = (data.listings ?? []).map(function(listing){
            return {
                price: Number(listing.price),
                amount: Number(listing.quantity ?? 1),
                sponsored: listing.sponsored,
                lastChecked: Number(listing.last_checked ?? 0)
            };
        }).filter(function(listing){
            return listing.sponsored !== 1 && Number.isFinite(listing.price) && Number.isFinite(listing.amount) && listing.price >= floor;
        });
        let fresh = usable.filter(function(listing){
            return (Date.now() - listing.lastChecked * 1000) <= WEAV3R_STALE_LISTING_MS;
        });
        return (fresh.length > 0 ? fresh : usable).map(function(listing){
            return { price: listing.price, amount: listing.amount };
        });
    }

    // Resolve a [bazaar...] formula against a weav3r payload. Returns null when weav3r has
    // nothing usable, which tells the caller to fall back to Torn's item market.
    // A stack size or "above" limit that rules out every listing is not "weav3r has nothing":
    // it returns {unmatched}, so the row is not quietly priced off the item market instead.
    function bazaarPriceFrom(data, formula, itemId, context){
        let selector = bazaarSelector(formula);
        let listings = normaliseBazaarListings(data);
        let basis = null;
        let read = null;
        if (selector.kind === 'avg'){
            let average = Number(data.bazaar_average);
            basis = data.bazaar_average == null || !Number.isFinite(average) ? null : average;
            read = { value: basis };
        } else if (listings.length > 0){
            let eligible = eligibleListings(listings, formula, SOURCE_BAZAAR, context);
            if (eligible.unmatched != null){
                return { unmatched: eligible.unmatched };
            }
            let basisListing = selector.kind === 'median'
                ? null
                : eligible.listings[Math.min(selector.index, eligible.listings.length - 1)];
            basis = basisListing != null ? basisListing.price : getMedianPrice(eligible.listings);
            read = basisListing != null
                ? { price: basisListing.price, amount: basisListing.amount, rank: listings.indexOf(basisListing) + 1, skipped: skippedBefore(listings, eligible.listings, basisListing) }
                : { median: basis, count: eligible.listings.length, skipped: eligible.skipped };
        }
        if (basis == null){
            console.warn("[TornBazaarFiller] weav3r has no usable bazaar price for item " + itemId + ".");
            return null;
        }
        // `basis` says what was read, for the analytics popup; the fill only looks at the price.
        return { price: Math.round(performOperation(basis, stripDeltaBracket(formula))), listings: listings, basis: read };
    }

    function hasUsableApiKey(){
        return typeof apiKey === 'string' && apiKey.length === 16;
    }

    // A bazaar-only setup never calls Torn, so it must never be asked for a key. Any other
    // source among the active formulas — including the bare default — still needs one.
    function needsTornApiKey(){
        return [priceDeltaRaw].concat(Object.values(categoryDeltas)).some(function(setting){
            return formulaBranches(setting).some(function(branch){
                return sourcesOf(branch).some(function(source){ return source !== SOURCE_BAZAAR; });
            });
        });
    }

    function buildTornPriceUrl(source, itemId){
        return (source === SOURCE_MARKET_VALUE ? itemUrl : marketUrl)
            .replace("{itemId}", itemId)
            .replace("{apiKey}", apiKey);
    }

    // One item's reads for one fill, or for one analytics popup. A source several branches need
    // is fetched once, and a popup opened right after a fill reads what the fill read instead of
    // asking again. A fill always starts a fresh session; only the popup reuses one, and only
    // while it is this fresh.
    const SESSION_TTL_MS = 60 * 1000;
    let itemSessions = new Map();

    function newSession(itemId){
        let session = { itemId: itemId, ts: Date.now(), reads: new Map(), branches: new Map(), trace: null, mine: null, category: null };
        itemSessions.set(itemId, session);
        return session;
    }

    function recentSession(itemId){
        let session = itemSessions.get(itemId);
        return session != null && (Date.now() - session.ts) <= SESSION_TTL_MS ? session : null;
    }

    // [bazaar:avg] is served from the bulk snapshot and every other bazaar read from the per-item
    // endpoint; the two carry different fields, so they are remembered apart.
    function readKey(source, formula){
        return source === SOURCE_BAZAAR && bazaarSelector(formula).kind === 'avg' ? 'bazaar:avg' : source;
    }

    async function fetchForSource(source, formula, itemId, session){
        if (session == null){
            return fetchSource(source, formula, itemId);
        }
        let key = readKey(source, formula);
        if (!session.reads.has(key)){
            session.reads.set(key, fetchSource(source, formula, itemId));
        }
        return session.reads.get(key);
    }

    function fetchSource(source, formula, itemId){
        if (source === SOURCE_BAZAAR){
            return fetchBazaarData(formula, itemId);
        }
        return fetch(buildTornPriceUrl(source, itemId)).then(response => response.json());
    }

    function itemMarketPrice(data, formula, itemId, context){
        // Nothing listed means nothing to undercut: fail the row like an API error, leaving it as
        // is. The error is a Torn-shaped payload, the same as every other `{ error }` returned here.
        if (data.itemmarket.listings.length === 0){
            return { error: { error: { code: -1, error: "no item-market listings for item " + itemId } } };
        }
        if (data.itemmarket.listings[0].price == null){
            console.warn("[TornBazaarFiller] The API is temporarily disabled, please try again later");
        }
        if (data.itemmarket.item.id != itemId){
            console.warn("[TornBazaarFiller] The API is BROKEN!");
        }
        let listings = data.itemmarket.listings;
        // The stack size and "above" limit narrow what the price is read from, but the colour
        // warning still compares against every listing, since that is what buyers see.
        let eligible = eligibleListings(listings, formula, SOURCE_ITEM_MARKET, context);
        if (eligible.unmatched != null){
            return { unmatched: eligible.unmatched };
        }
        let selector = listingSelector(formula);
        let basisListing = selector.kind === 'median'
            ? null
            : eligible.listings[Math.min(selector.index, eligible.listings.length - 1)];
        let basis = basisListing != null ? basisListing.price : getMedianPrice(eligible.listings);
        return {
            price: Math.round(performOperation(basis, stripDeltaBracket(formula))),
            listings: listings,
            // What was read, for the analytics popup; the fill only looks at the price.
            basis: basisListing != null
                ? { price: basisListing.price, amount: Number(basisListing.amount ?? 1), rank: listings.indexOf(basisListing) + 1, skipped: skippedBefore(listings, eligible.listings, basisListing) }
                : { median: basis, count: eligible.listings.length, skipped: eligible.skipped }
        };
    }

    // How many listings the bracket passed over on its way to the one it read.
    function skippedBefore(listings, eligible, basisListing){
        return listings.slice(0, listings.indexOf(basisListing)).filter(function(listing){
            return eligible.indexOf(listing) === -1;
        }).length;
    }

    // Can the response already fetched for this item answer for this branch too?
    function preloadMatches(pricing, branch, source){
        if (pricing.data == null || pricing.source !== source){
            return false;
        }
        // The two bazaar reads differ: [bazaar:avg] comes from the bulk snapshot, every other
        // selector from the per-item endpoint, so only a matching kind may reuse a response.
        return source !== SOURCE_BAZAAR ||
            (bazaarSelector(pricing.formula).kind === 'avg') === (bazaarSelector(branch).kind === 'avg');
    }

    // Resolve one branch to the price to fill plus the listings the percentage overlay compares
    // against (null when the source is a single scalar and there is nothing to compare with).
    // `allowFallback` is off while several branches compete: the user has already named their
    // own alternative, so a thin bazaar item lets the next branch answer instead of quietly
    // spending a Torn call on the item market. Returns null when the branch prices nothing.
    // `context.mine` is the stack being filled, for [mine+]. A formula with an "above" limit
    // prices that limit first; a limit that prices nothing leaves the formula nothing to read.
    async function resolveBranchPrice(branch, pricing, itemId, allowFallback, context){
        let session = context == null ? null : context.session;
        let limitFormula = aboveLimit(branch);
        let limit = null;
        if (limitFormula != null){
            let limitResolved = await resolveBranchPrice(limitFormula, pricing, itemId, false, context);
            if (limitResolved == null || limitResolved.error != null || limitResolved.unmatched != null ||
                typeof limitResolved.price !== 'number' || !isFinite(limitResolved.price)){
                return recordBranch(session, branch, { unmatched: "the price after 'above' (" + limitFormula + ") could not be worked out" }, { limitFormula: limitFormula });
            }
            limit = limitResolved.price;
        }
        let branchContext = { mine: context == null ? null : context.mine, limit: limit };
        let source = sourceOf(branch);
        let note = { source: source, limit: limit, limitFormula: limitFormula, fallback: false };
        let data = preloadMatches(pricing, branch, source)
            ? pricing.data
            : await fetchForSource(source, branch, itemId, session);
        if (data.error != null){
            return recordBranch(session, branch, { error: data }, note);
        }
        if (source === SOURCE_MARKET_VALUE){
            let marketValue = data.items[itemId].market_value;
            return recordBranch(session, branch, { price: Math.round(performOperation(marketValue, stripDeltaBracket(branch))), listings: null, basis: { value: marketValue } }, note);
        }
        if (source === SOURCE_BAZAAR){
            let resolved = bazaarPriceFrom(data, branch, itemId, branchContext);
            if (resolved != null){
                return recordBranch(session, branch, resolved, note);
            }
            if (!allowFallback){
                return recordBranch(session, branch, null, note);
            }
            // A thin or unanswerable item falls back to Torn rather than failing the row, so one
            // bad item never stops a Fill All run. The delta, stack size and "above" limit carry
            // over; which bazaar listing it read cannot.
            console.warn("[TornBazaarFiller] No usable weav3r bazaar price for item " + itemId + "; using the item market.");
            if (!hasUsableApiKey()){
                // A bazaar-only setup was never asked for a key, so there is nothing to fall
                // back with. Say that instead of spending a call on a guaranteed key error.
                return recordBranch(session, branch, { error: weav3rError(0, "no price for item " + itemId + ", and no API key is set for the item-market fallback") }, note);
            }
            let fallbackFormula = itemMarketFallbackFormula(branch);
            let fallbackData = await fetchForSource(SOURCE_ITEM_MARKET, fallbackFormula, itemId, session);
            if (fallbackData.error != null){
                return recordBranch(session, branch, { error: fallbackData }, note);
            }
            note.source = SOURCE_ITEM_MARKET;
            note.fallback = true;
            return recordBranch(session, branch, itemMarketPrice(fallbackData, fallbackFormula, itemId, branchContext), note);
        }
        return recordBranch(session, branch, itemMarketPrice(data, branch, itemId, branchContext), note);
    }

    // Keep what a branch came to, and how, for the analytics popup; the result goes straight
    // back to the caller untouched. A branch that priced nothing is kept as such.
    function recordBranch(session, formula, resolved, note){
        if (session != null){
            session.branches.set(formula, Object.assign({ formula: formula }, note ?? {}, resolved == null ? { nothing: true } : resolved));
        }
        return resolved;
    }

    // Walk the parsed setting and pick the winning branch: the highest under max(), the lowest
    // under min(), with a nested call resolved to its own winner first. `priced` holds what
    // every formula came out at; a formula that priced nothing sits the comparison out, and a
    // call whose every formula priced nothing is null to the level above it.
    function chooseBranch(node, priced){
        if (node.kind === 'formula'){
            return priced.get(node.formula) ?? null;
        }
        let best = null;
        for (let i = 0; i < node.children.length; i++){
            let candidate = chooseBranch(node.children[i], priced);
            if (candidate == null){
                continue;
            }
            if (best == null || (node.combine === 'min' ? candidate.price < best.price : candidate.price > best.price)){
                best = candidate;
            }
        }
        return best;
    }

    // Price every formula in the row's setting, then let the min()/max() tree pick which one
    // fills. One formula takes exactly the path, and costs exactly the calls, it did before any
    // of this, and a formula written twice in the same setting is still fetched once.
    async function resolveFillPrice(pricing, itemId, context){
        let root = parseSetting(pricing.setting);
        let formulas = collectFormulas(root);
        if (root.kind === 'formula'){
            return noteFill(context, pricing, root, root.formula, await resolveBranchPrice(root.formula, pricing, itemId, true, context));
        }
        let priced = new Map();
        for (let i = 0; i < formulas.length; i++){
            if (priced.has(formulas[i])){
                continue;
            }
            let resolved = null;
            try {
                resolved = await resolveBranchPrice(formulas[i], pricing, itemId, false, context);
            } catch (error) {
                // A formula stored before Save started validating them can still throw here.
                // That is one dead branch rather than a dead row.
                console.warn("[TornBazaarFiller] Formula '" + formulas[i] + "' could not be applied:", error);
            }
            if (resolved == null || resolved.error != null || typeof resolved.price !== 'number' || !isFinite(resolved.price)){
                console.warn("[TornBazaarFiller] '" + formulas[i] + "' priced nothing for item " + itemId + ".");
                resolved = null;
            } else {
                resolved.formula = formulas[i];
            }
            priced.set(formulas[i], resolved);
        }
        let best = chooseBranch(root, priced);
        if (best != null){
            return noteFill(context, pricing, root, best.formula, best);
        }
        // Nothing priced: re-run the first formula the ordinary way, so the row reports the same
        // error — and gets the same item-market fallback — as a setting with no pipes at all.
        return noteFill(context, pricing, root, formulas[0], await resolveBranchPrice(formulas[0], pricing, itemId, true, context));
    }

    // Remember how the row was priced, so the analytics popup can show the working.
    function noteFill(context, pricing, root, formula, resolved){
        let session = context == null ? null : context.session;
        if (session != null){
            session.mine = context.mine;
            session.category = pricing.category;
            session.trace = { setting: pricing.setting, root: root, winner: formula, resolved: resolved };
        }
        return resolved;
    }

    // Colour the row by how far the filled price sits under the 3rd-cheapest listing of whichever
    // source produced it, so the cue reads the same on item-market and bazaar prices.
    function applyPriceCoefficientOverlay(percentageOverlaySpan, wave, lowBallPrice, listings){
        // [bazaar:avg] resolves from the snapshot and carries no listings to compare against;
        // the fill still succeeded, so clear any percentage left over from an earlier one.
        if (listings.length === 0){
            percentageOverlaySpan.style.display = "none";
            setRowTone(wave, "green");
            wave.style.backgroundColor = "green";
            return;
        }
        let priceCoefficient = priceCoefficientPercent(lowBallPrice, listings);
        if (priceCoefficient <= 95){
            percentageOverlaySpan.style.display = "block";
            if (priceCoefficient <= 50){
                percentageOverlaySpan.style.color = "red";
                setRowTone(wave, "red");
                wave.style.backgroundColor = "red";
                wave.style.animationDuration = "5s";
            } else if (priceCoefficient <= 75){
                percentageOverlaySpan.style.color = "yellow";
                setRowTone(wave, "yellow");
                wave.style.backgroundColor = "yellow";
                wave.style.animationDuration = "3s";
            } else {
                percentageOverlaySpan.style.color = "green";
                setRowTone(wave, "green");
                wave.style.backgroundColor = "green";
            }
            percentageOverlaySpan.innerText = priceCoefficient + "%";
        } else {
            percentageOverlaySpan.style.display = "none";
            setRowTone(wave, "green");
            wave.style.backgroundColor = "green";
        }
    }

    // The filled price as a whole-number share of the 3rd-cheapest listing it was set against.
    function priceCoefficientPercent(lowBallPrice, listings){
        let price3rd = listings[Math.min(2, listings.length - 1)].price;
        return Number(((lowBallPrice / price3rd) * 100).toFixed(0));
    }

    // The median unit across every listing, weighted by quantity. Walks the sorted listings
    // instead of expanding them unit by unit, which a stack of millions would never survive.
    function getMedianPrice(listings) {
        const sorted = listings
            .map(listing => ({ price: listing.price, amount: Math.max(0, Math.floor(listing.amount ?? 1)) }))
            .filter(listing => listing.amount > 0)
            .sort((a, b) => a.price - b.price);
        const total = sorted.reduce((sum, listing) => sum + listing.amount, 0);
        if (total === 0) {
            return listings.length > 0 ? listings[0].price : undefined;
        }
        // The price of the unit at 0-based position `index` in the sorted run.
        const unitAt = index => {
            for (const listing of sorted) {
                if (index < listing.amount) {
                    return listing.price;
                }
                index -= listing.amount;
            }
        };
        const mid = Math.floor(total / 2);
        return total % 2 === 0 ? (unitAt(mid - 1) + unitAt(mid)) / 2 : unitAt(mid);
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

    // Fetch pricing data for an item using the price source its (possibly per-category) formula
    // needs. The cached category is only a hint for which endpoint to hit first: the true type is
    // re-read from every response and the cache self-corrects, so a rare Torn recategorisation is
    // picked up on the next fill. Past the TTL we refresh via the items endpoint (always carries
    // type). Only the first fill after a change whose category also flips the source costs 2 calls.
    async function fetchPricingForItem(itemId, session){
        // No per-category overrides of either kind → category is irrelevant; behave exactly
        // like the default path.
        if (Object.keys(categoryDeltas).length === 0 && !hasCategoryQuantityOverrides()){
            // Only the first branch decides which endpoint to try first; the rest are priced
            // once the row knows its category.
            let formula = firstBranch(priceDeltaRaw);
            let source = sourceOf(formula);
            let data = await fetchForSource(source, formula, itemId, session);
            return { data: data, formula: formula, source: source, category: null, setting: priceDeltaRaw };
        }

        let cached = getCachedCategory(itemId);
        let expired = cached == null || (Date.now() - cached.ts) > CATEGORY_TTL_MS;
        let guessCategory = cached != null ? cached.type : null;
        let guessSetting = getEffectiveDelta(guessCategory);
        let guessFormula = firstBranch(guessSetting);
        // When stale/unknown, force the items endpoint so we definitively re-learn the type even if
        // the chosen source omits it; otherwise guess from the cached category to stay 1 call.
        // Without a key that refresh can only fail, and failing it would take a bazaar-only setup
        // down with it — so there we just price from the guess and re-learn the type another day.
        let firstSource = (expired && hasUsableApiKey()) ? SOURCE_MARKET_VALUE : sourceOf(guessFormula);
        let data = await fetchForSource(firstSource, guessFormula, itemId, session);
        if (data.error != null){
            return { data: data, formula: guessFormula, source: firstSource, category: guessCategory, setting: guessSetting };
        }
        let actualType = readCategoryFromData(data, itemId, firstSource);
        let category = actualType != null ? actualType : guessCategory;
        if (actualType != null && (cached == null || cached.type !== actualType || expired)){
            cacheItemCategory(itemId, actualType);
        }
        let setting = getEffectiveDelta(category);
        let formula = firstBranch(setting);
        let source = sourceOf(formula);
        if (source !== firstSource){
            let data2 = await fetchForSource(source, formula, itemId, session);
            return { data: data2, formula: formula, source: source, category: category, setting: setting };
        }
        return { data: data, formula: formula, source: source, category: category, setting: setting };
    }

    // ---- Item analytics popup -------------------------------------------------------------
    // One floating panel, reused for every row. Overview: your price against market value and the
    // cheapest of each source, how many units sit ahead of you, and listings by stack size.
    // Listings: every item-market and bazaar listing on one price ladder with you slotted in.
    // Formula: the setting worked out branch by branch. Opened right after a fill it reads what
    // the fill read; opened cold it prices the row the same way without touching the inputs.

    const ANALYTICS_ICON = '<svg viewBox="0 0 14 12" aria-hidden="true"><rect x="0" y="7" width="3.6" height="5" rx=".6"/><rect x="5.2" y="3.5" width="3.6" height="8.5" rx=".6"/><rect x="10.4" y="0" width="3.6" height="12" rx=".6"/></svg>';
    const analyticsPosKey = "silmaril-torn-bazaar-filler-analytics-pos";
    const ANALYTICS_LADDER_ROWS = 12;
    const STACK_BANDS = [[1, 9, '1–9'], [10, 99, '10–99'], [100, 999, '100–999'], [1000, Infinity, '1,000+']];
    let analyticsRow = null;       // the row the panel was opened from
    let analyticsSession = null;   // the reads it is showing
    let analyticsTab = 'overview';
    let analyticsOpenSeq = 0;      // bumps on every open, so a slow read for an earlier row is dropped

    function escapeHtml(text){
        return String(text ?? '').replace(/[&<>"']/g, function(character){
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }

    function money(value){
        return '$' + Math.round(value).toLocaleString('en-US');
    }

    function count(value){
        return Math.round(value).toLocaleString('en-US');
    }

    function signedPercent(value, base){
        if (!(base > 0)){
            return '';
        }
        let percent = (value / base - 1) * 100;
        return (percent >= 0 ? '+' : '−') + Math.abs(percent).toFixed(1) + '%';
    }

    function ordinal(n){
        let suffixes = ['th', 'st', 'nd', 'rd'];
        let v = n % 100;
        return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
    }

    function ago(ts){
        let seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
        if (seconds < 5){
            return 'just now';
        }
        if (seconds < 60){
            return seconds + ' s ago';
        }
        let minutes = Math.round(seconds / 60);
        return minutes < 60 ? minutes + ' min ago' : Math.round(minutes / 60) + ' h ago';
    }

    function capitalise(text){
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function describeError(data){
        return data != null && data.error != null ? String(data.error.error ?? data.error) : 'no data';
    }

    function ensureAnalyticsPanel(){
        let panel = document.querySelector('.tbf-ana');
        if (panel != null){
            return panel;
        }
        panel = document.createElement('div');
        panel.className = 'tbf-ana';
        panel.innerHTML =
            '<div class="tbf-ana-head">' +
                '<img class="tbf-ana-img" alt="">' +
                '<div class="tbf-ana-title"><b class="tbf-ana-name"></b><small class="tbf-ana-sub"></small></div>' +
                '<span class="tbf-ana-hb tbf-ana-refresh" title="Read everything again">&#8635;</span>' +
                '<span class="tbf-ana-hb tbf-ana-close" title="Close">&times;</span>' +
            '</div>' +
            '<div class="tbf-ana-tabs">' +
                '<span class="tbf-ana-tab" data-tab="overview">Overview</span>' +
                '<span class="tbf-ana-tab" data-tab="listings">Listings</span>' +
                '<span class="tbf-ana-tab" data-tab="formula">Formula</span>' +
            '</div>' +
            '<div class="tbf-ana-body"></div>' +
            '<div class="tbf-ana-foot"></div>';
        document.body.appendChild(panel);
        panel.querySelector('.tbf-ana-close').addEventListener('click', closeAnalytics);
        panel.querySelector('.tbf-ana-refresh').addEventListener('click', function(){
            if (analyticsRow != null){
                itemSessions.delete(analyticsRow.itemId);
                openAnalytics(analyticsRow);
            }
        });
        panel.querySelectorAll('.tbf-ana-tab').forEach(function(tab){
            tab.addEventListener('click', function(){
                analyticsTab = tab.dataset.tab;
                renderAnalytics();
            });
        });
        // The body is rebuilt on every tab change, so its clicks are handled here, once.
        panel.querySelector('.tbf-ana-body').addEventListener('click', function(event){
            let listing = closestMatch(event.target, '.tbf-ana-lr[data-price]');
            if (listing != null && panel.contains(listing)){
                applyAnalyticsPrice(parseInt(listing.dataset.price, 10) - 1, false);
                return;
            }
            if (closestMatch(event.target, '.tbf-ana-showall') != null){
                panel.classList.add('tbf-ana--all');
                return;
            }
            let tabLink = closestMatch(event.target, '[data-goto]');
            if (tabLink != null){
                analyticsTab = tabLink.dataset.goto;
                renderAnalytics();
            }
        });
        panel.querySelector('.tbf-ana-foot').addEventListener('click', function(event){
            if (closestMatch(event.target, '.tbf-ana-settings') != null){
                openSettingsModal();
                return;
            }
            let apply = closestMatch(event.target, '.tbf-ana-apply');
            if (apply != null){
                let price = parseInt(apply.dataset.price, 10);
                if (!isNaN(price)){
                    applyAnalyticsPrice(price, true);
                }
            }
        });
        attachAnalyticsDrag(panel);
        return panel;
    }

    function loadAnalyticsPosition(){
        try {
            let parsed = JSON.parse(localStorage.getItem(analyticsPosKey) ?? 'null');
            return parsed != null && typeof parsed.left === 'number' && typeof parsed.top === 'number' ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    // On a phone the panel is a bottom sheet and the stylesheet places it; elsewhere it opens
    // where it was last dropped, or centred near the top the first time.
    function applyAnalyticsPosition(panel){
        if (isMobileView){
            return;
        }
        let saved = loadAnalyticsPosition();
        let left = saved != null ? saved.left : Math.max(8, (window.innerWidth - panel.offsetWidth) / 2);
        let top = saved != null ? saved.top : 60;
        setAnalyticsPosition(panel, left, top);
    }

    // Kept on screen: the header at least stays reachable however the window was resized.
    function setAnalyticsPosition(panel, left, top){
        let maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth - 4);
        let maxTop = Math.max(0, window.innerHeight - 60);
        panel.style.left = Math.round(Math.min(Math.max(0, left), maxLeft)) + 'px';
        panel.style.top = Math.round(Math.min(Math.max(0, top), maxTop)) + 'px';
    }

    function attachAnalyticsDrag(panel){
        let head = panel.querySelector('.tbf-ana-head');
        let dragging = null;
        const start = function(event){
            if (isMobileView || closestMatch(event.target, '.tbf-ana-hb') != null){
                return;
            }
            let point = event.touches ? event.touches[0] : event;
            dragging = { dx: point.clientX - panel.offsetLeft, dy: point.clientY - panel.offsetTop };
            if (!event.touches){
                event.preventDefault();
            }
        };
        const move = function(event){
            if (dragging == null){
                return;
            }
            let point = event.touches ? event.touches[0] : event;
            setAnalyticsPosition(panel, point.clientX - dragging.dx, point.clientY - dragging.dy);
            if (event.cancelable){
                event.preventDefault();
            }
        };
        const end = function(){
            if (dragging == null){
                return;
            }
            dragging = null;
            localStorage.setItem(analyticsPosKey, JSON.stringify({ left: panel.offsetLeft, top: panel.offsetTop }));
        };
        head.addEventListener('mousedown', start);
        head.addEventListener('touchstart', start, { passive: true });
        document.addEventListener('mousemove', move);
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('mouseup', end);
        document.addEventListener('touchend', end);
    }

    function closeAnalytics(){
        let panel = document.querySelector('.tbf-ana');
        if (panel != null){
            panel.classList.remove('tbf-ana--open');
        }
        analyticsRow = null;
        analyticsSession = null;
    }

    // `row` is {itemId, host, pageType, fillInput}: the container the buttons were injected into
    // and the row's Fill input, which is what every row lookup in this script hangs off.
    async function openAnalytics(row){
        let panel = ensureAnalyticsPanel();
        let seq = ++analyticsOpenSeq;
        analyticsRow = row;
        analyticsSession = recentSession(row.itemId);
        analyticsTab = analyticsSession != null && analyticsSession.settled ? analyticsTab : 'overview';
        panel.classList.add('tbf-ana--open');
        panel.classList.remove('tbf-ana--all');
        if (chatRelativeZBase != null){
            panel.style.zIndex = chatRelativeZBase;
        }
        applyAnalyticsPosition(panel);
        renderAnalytics();
        checkApiKey();
        let session = analyticsSession ?? newSession(row.itemId);
        analyticsSession = session;
        try {
            if (session.trace == null){
                // A cold open prices the row exactly as Fill would, inputs untouched.
                let mine = readRowStack(row);
                session.mine = mine;
                let pricing = await fetchPricingForItem(row.itemId, session);
                session.category = pricing.category;
                if (pricing.data.error == null){
                    await resolveFillPrice(pricing, row.itemId, { mine: mine, session: session });
                }
            }
            await readAllSources(session);
            session.failure = null;
        } catch (error) {
            console.error("[TornBazaarFiller] Analytics failed for item " + row.itemId + ":", error);
            session.failure = error == null ? 'unknown error' : (error.message ?? String(error));
        }
        session.settled = true;
        if (seq === analyticsOpenSeq){
            renderAnalytics();
        }
    }

    // The stack a cold open prices against: what the quantity mode would list, else what you hold.
    function readRowStack(row){
        if (row.pageType === pages.ManageItems){
            return getMaxQuantity(row.fillInput, pages.ManageItems);
        }
        let amountDiv = rowAmountDiv(row);
        let checkbox = amountDiv == null ? null : amountDiv.querySelector("div.amount.choice-container input");
        let maxQuantity = checkbox != null ? 1 : getMaxQuantity(row.fillInput, pages.AddItems);
        let cached = getCachedCategory(row.itemId);
        let listed = resolveQuantity(maxQuantity, getEffectiveQuantity(cached != null ? cached.type : null));
        return listed ?? maxQuantity;
    }

    function rowAmountDiv(row){
        let item = row.host.closest('li.clearfix') ?? row.host.parentElement.parentElement;
        return item == null ? null : item.querySelector("div.amount-main-wrap");
    }

    function rowImage(row){
        let image = row.pageType === pages.AddItems
            ? row.host.parentElement.querySelector("div.image-wrap img")
            : row.host.parentElement.querySelector("div[class*=imgContainer___] img");
        if (image == null){
            let container = row.host.closest('li.clearfix, div[data-testid="sortable-item"], div[class*="row___"]') ?? row.host.parentElement;
            image = container != null ? container.querySelector('img[src*="/items/"]') : null;
        }
        return image;
    }

    // The item's name as the row shows it, with the "x567" count taken off either end.
    function rowName(row){
        return getRowTextExcludingInjected(row.host).replace(/\s*x\d[\d,]*\s*$/, '').replace(/^\s*x\d[\d,]*\s*/, '').trim();
    }

    // Whatever the setting reads, the popup shows both sources and the market value, so what the
    // fill did not fetch is fetched now. Each read fails on its own without taking the others.
    async function readAllSources(session){
        let wanted = [[SOURCE_BAZAAR, '-1[bazaar]']];
        if (hasUsableApiKey()){
            wanted.push([SOURCE_ITEM_MARKET, '-1'], [SOURCE_MARKET_VALUE, '[market]']);
        }
        await Promise.all(wanted.map(function(pair){
            return fetchForSource(pair[0], pair[1], session.itemId, session).catch(function(){ return null; });
        }));
    }

    async function sessionData(session, key){
        let pending = session.reads.get(key);
        if (pending == null){
            return null;
        }
        try {
            return await pending;
        } catch (error) {
            return { error: { code: -1, error: error == null ? 'failed' : (error.message ?? String(error)) } };
        }
    }

    // Everything the tabs draw from, in one shape: each source is either {listings…} or {error}.
    async function analyticsModel(session, row){
        let model = { itemId: row.itemId, name: null, type: session.category, mine: session.mine, you: null, market: null, value: null, bazaar: null, readAt: session.ts };
        let marketData = await sessionData(session, SOURCE_ITEM_MARKET);
        if (marketData != null){
            if (marketData.error != null || marketData.itemmarket == null){
                model.market = { error: describeError(marketData) };
            } else {
                let listings = (marketData.itemmarket.listings ?? []).map(function(listing){
                    return { price: Number(listing.price), amount: Number(listing.amount ?? 1) };
                }).filter(function(listing){
                    return Number.isFinite(listing.price) && Number.isFinite(listing.amount);
                }).sort(function(a, b){ return a.price - b.price; });
                model.market = { listings: listings };
                let item = marketData.itemmarket.item ?? {};
                model.name = model.name ?? item.name ?? null;
                model.type = model.type ?? item.type ?? null;
            }
        } else if (!hasUsableApiKey()){
            model.market = { error: 'needs a Torn API key (Settings)' };
        }
        let itemsData = await sessionData(session, SOURCE_MARKET_VALUE);
        if (itemsData != null){
            let item = itemsData.error == null && itemsData.items != null ? itemsData.items[row.itemId] : null;
            if (item == null){
                model.value = { error: describeError(itemsData) };
            } else {
                model.value = { value: Number(item.market_value) };
                model.name = item.name ?? model.name;
                model.type = item.type ?? model.type;
            }
        } else if (!hasUsableApiKey()){
            model.value = { error: 'needs a Torn API key' };
        }
        let bazaarData = await sessionData(session, SOURCE_BAZAAR);
        if (bazaarData != null){
            if (bazaarData.error != null){
                model.bazaar = { error: describeError(bazaarData) };
            } else {
                let listings = normaliseBazaarListings(bazaarData).sort(function(a, b){ return a.price - b.price; });
                let checked = (bazaarData.listings ?? []).map(function(listing){ return Number(listing.last_checked ?? 0); })
                    .filter(function(ts){ return Number.isFinite(ts) && ts > 0; });
                let average = Number(bazaarData.bazaar_average);
                model.bazaar = {
                    listings: listings,
                    average: bazaarData.bazaar_average != null && Number.isFinite(average) ? average : null,
                    ignored: (bazaarData.listings ?? []).length - listings.length,
                    checked: checked.length > 0 ? Math.max.apply(null, checked) * 1000 : null
                };
                model.name = model.name ?? (typeof bazaarData.name === 'string' ? bazaarData.name : null);
            }
        }
        let trace = session.trace;
        if (trace != null && trace.resolved != null && typeof trace.resolved.price === 'number' && isFinite(trace.resolved.price)){
            model.you = trace.resolved.price;
        }
        return model;
    }

    async function renderAnalytics(){
        let panel = document.querySelector('.tbf-ana');
        let row = analyticsRow;
        let session = analyticsSession;
        if (panel == null || row == null){
            return;
        }
        let model = session == null ? null : await analyticsModel(session, row);
        if (row !== analyticsRow || session !== analyticsSession){
            return;
        }
        let image = rowImage(row);
        panel.querySelector('.tbf-ana-img').src = image != null ? image.src : '';
        panel.querySelector('.tbf-ana-name').textContent = (model != null && model.name) || rowName(row) || ('Item #' + row.itemId);
        let sub = [];
        if (model != null && model.type){
            sub.push(model.type);
        }
        let held = getMaxQuantity(row.fillInput, row.pageType);
        if (held != null){
            sub.push((row.pageType === pages.ManageItems ? 'listed ' : 'you have ') + count(held));
        }
        if (model != null && model.mine != null && row.pageType !== pages.ManageItems){
            sub.push(model.mine === held ? 'listing all' : 'listing ' + count(model.mine));
        }
        panel.querySelector('.tbf-ana-sub').textContent = sub.join(' · ');
        panel.querySelectorAll('.tbf-ana-tab').forEach(function(tab){
            tab.classList.toggle('tbf-ana-tab--on', tab.dataset.tab === analyticsTab);
        });
        let body = panel.querySelector('.tbf-ana-body');
        let foot = panel.querySelector('.tbf-ana-foot');
        if (model == null || !session.settled){
            body.innerHTML = renderSkeleton();
            foot.innerHTML = '';
            return;
        }
        if (analyticsTab === 'listings'){
            body.innerHTML = renderListings(model, session);
        } else if (analyticsTab === 'formula'){
            body.innerHTML = renderFormula(model, session);
        } else {
            body.innerHTML = renderOverview(model, session);
        }
        foot.innerHTML = renderFoot(model, row);
    }

    function renderSkeleton(){
        let tile = '<div class="tbf-ana-kpi"><span class="tbf-ana-skel" style="width:40%"></span><br><span class="tbf-ana-skel" style="width:70%;height:14px"></span><br><span class="tbf-ana-skel" style="width:60%"></span></div>';
        let line = '<div class="tbf-ana-lr"><span class="tbf-ana-skel" style="width:16px;height:16px;border-radius:50%"></span><span class="tbf-ana-skel" style="width:30%"></span><span class="tbf-ana-skel" style="width:15%"></span></div>';
        return '<div class="tbf-ana-kpis">' + tile.repeat(4) + '</div>' +
            '<div class="tbf-ana-muted">Reading the item market, the market value and the bazaars…</div>' +
            '<div class="tbf-ana-lad">' + line.repeat(6) + '</div>';
    }

    function renderAlert(html){
        return '<div class="tbf-ana-alert">' + html + '</div>';
    }

    function renderKpi(label, value, detail, title){
        return '<div class="tbf-ana-kpi"' + (title ? ' title="' + escapeHtml(title) + '"' : '') + '><div class="l">' + escapeHtml(label) + '</div><div class="v">' + escapeHtml(value) + '</div><div class="d">' + detail + '</div></div>';
    }

    function renderLegend(){
        return '<div class="tbf-ana-legend"><span><i class="tbf-ana-sw tbf-ana-m"></i>Item market (Torn)</span><span><i class="tbf-ana-sw tbf-ana-b"></i>Player bazaars (weav3r)</span></div>';
    }

    function cheaperThan(listings, price){
        return listings.filter(function(listing){ return listing.price < price; });
    }

    function unitsOf(listings){
        return listings.reduce(function(sum, listing){ return sum + listing.amount; }, 0);
    }

    // The sentence a stack size or "above" limit left the row with, or null when it priced.
    function traceUnmatched(session){
        let resolved = session.trace == null ? null : session.trace.resolved;
        return resolved != null && resolved.unmatched != null ? resolved.unmatched : null;
    }

    function traceError(session){
        let resolved = session.trace == null ? null : session.trace.resolved;
        return resolved != null && resolved.error != null ? describeError(resolved.error) : null;
    }

    function renderOverview(model, session){
        let html = '';
        if (session.failure != null){
            html += renderAlert('Could not read everything: ' + escapeHtml(session.failure) + '.');
        }
        let unmatched = traceUnmatched(session);
        if (unmatched != null){
            html += renderAlert('<b>Price left as it is.</b> ' + escapeHtml(capitalise(unmatched)) + '. <a data-goto="formula">See the formula</a>');
        } else if (session.trace == null || traceError(session) != null){
            html += renderAlert('<b>Nothing priced.</b> ' + escapeHtml(traceError(session) ?? session.failure ?? 'the first read failed') + '. <a data-goto="formula">See the formula</a>');
        }
        let value = model.value != null && model.value.value != null ? model.value.value : null;
        let market = model.market != null && model.market.listings != null ? model.market.listings : null;
        let bazaar = model.bazaar != null && model.bazaar.listings != null ? model.bazaar.listings : null;
        let yourDetail = model.you == null ? 'nothing filled' : (value != null ? signedPercent(model.you, value) + ' vs market value' : 'from your setting');
        let valueDetail = 'Torn' + (model.bazaar != null && model.bazaar.average != null ? ' · bazaar avg ' + money(model.bazaar.average) : '');
        let cheapest = function(listings, source, sourceError){
            if (listings == null){
                return renderKpi('Cheapest ' + source, '—', escapeHtml(sourceError ?? 'not read'), sourceError);
            }
            if (listings.length === 0){
                return renderKpi('Cheapest ' + source, '—', 'no listings');
            }
            let detail = '×' + count(listings[0].amount) + ' · ' +
                (model.you != null ? 'you are #' + count(cheaperThan(listings, model.you).length + 1) + ' of ' + count(listings.length + 1) : count(listings.length) + ' listings');
            return renderKpi('Cheapest ' + source, money(listings[0].price), detail);
        };
        html += '<div class="tbf-ana-kpis">' +
            renderKpi('Your price', model.you == null ? '—' : money(model.you), escapeHtml(yourDetail)) +
            renderKpi('Market value', value == null ? '—' : money(value), escapeHtml(value == null ? (model.value != null ? model.value.error : 'not read') : valueDetail), value == null && model.value != null ? model.value.error : null) +
            cheapest(market, 'market', model.market != null ? model.market.error : null) +
            cheapest(bazaar, 'bazaar', model.bazaar != null ? model.bazaar.error : null) +
            '</div>';
        html += '<div class="tbf-ana-cols"><div>' + renderAhead(model, market, bazaar) + '</div><div>' + renderStacks(market, bazaar) + '</div></div>';
        html += renderFreshness(model);
        return html;
    }

    function renderFreshness(model){
        let parts = ['Read ' + ago(model.readAt)];
        if (model.bazaar != null && model.bazaar.checked != null){
            parts.push('bazaar listings last checked ' + ago(model.bazaar.checked));
        }
        return '<div class="tbf-ana-hint">' + escapeHtml(parts.join(' · ')) + '</div>';
    }

    function renderBarRow(cls, width, text){
        return '<div class="tbf-ana-brow"><i class="tbf-ana-bar ' + cls + '" style="width:' + width + '%"></i><span class="tbf-ana-bv">' + escapeHtml(text) + '</span></div>';
    }

    // Units priced below you, and just above you, per source: what has to sell before yours does.
    function renderAhead(model, market, bazaar){
        let html = '<div class="tbf-ana-sec">Ahead of you</div>';
        if (model.you == null){
            return html + '<div class="tbf-ana-muted">No price to measure from yet.</div>';
        }
        let you = model.you;
        let bands = [
            { label: 'Cheaper than you', keep: function(listing){ return listing.price < you; } },
            { label: 'Up to 1% above you (≤ ' + money(you * 1.01) + ')', keep: function(listing){ return listing.price >= you && listing.price <= you * 1.01; } },
            { label: 'Up to 3% above you (≤ ' + money(you * 1.03) + ')', keep: function(listing){ return listing.price >= you && listing.price <= you * 1.03; } }
        ].map(function(band){
            return { label: band.label, m: market == null ? null : market.filter(band.keep), b: bazaar == null ? null : bazaar.filter(band.keep) };
        });
        let max = Math.max(1, ...bands.map(function(band){ return Math.max(band.m == null ? 0 : unitsOf(band.m), band.b == null ? 0 : unitsOf(band.b)); }));
        let bar = function(listings, cls, name){
            if (listings == null){
                return renderBarRow(cls, 0, name + ' not read');
            }
            let units = unitsOf(listings);
            let width = units === 0 ? 0 : Math.max(2, Math.round(units / max * 100));
            return renderBarRow(cls, width, units === 0 ? '0' : count(units) + ' units · ' + count(listings.length) + (listings.length === 1 ? ' listing' : ' listings'));
        };
        html += renderLegend();
        bands.forEach(function(band){
            html += '<div class="tbf-ana-band"><div class="tbf-ana-bl">' + escapeHtml(band.label) + '</div>' + bar(band.m, 'tbf-ana-m', 'market') + bar(band.b, 'tbf-ana-b', 'bazaars') + '</div>';
        });
        return html;
    }

    // How the listings split by stack size: what [100x+] and [mine+] choose between.
    function renderStacks(market, bazaar){
        let html = '<div class="tbf-ana-sec">Listings by stack size<small>count · cheapest in the band</small></div>';
        let bands = STACK_BANDS.map(function(band){
            let keep = function(listing){ return listing.amount >= band[0] && listing.amount <= band[1]; };
            return { label: band[2], m: market == null ? null : market.filter(keep), b: bazaar == null ? null : bazaar.filter(keep) };
        });
        let max = Math.max(1, ...bands.map(function(band){ return Math.max(band.m == null ? 0 : band.m.length, band.b == null ? 0 : band.b.length); }));
        let bar = function(listings, cls, name){
            if (listings == null){
                return renderBarRow(cls, 0, name + ' not read');
            }
            let cheapest = listings.length === 0 ? '—' : money(Math.min.apply(null, listings.map(function(listing){ return listing.price; })));
            return renderBarRow(cls, listings.length === 0 ? 0 : Math.max(2, Math.round(listings.length / max * 100)), count(listings.length) + ' · from ' + cheapest);
        };
        bands.forEach(function(band){
            html += '<div class="tbf-ana-band"><div class="tbf-ana-bl">' + escapeHtml(band.label) + '</div>' + bar(band.m, 'tbf-ana-m', 'market') + bar(band.b, 'tbf-ana-b', 'bazaars') + '</div>';
        });
        return html;
    }

    // The listing a branch read, so the ladder can point at it.
    function basisKey(detail){
        return detail != null && detail.basis != null && detail.basis.price != null
            ? (detail.source === SOURCE_BAZAAR ? 'b' : 'm') + ':' + detail.basis.price + ':' + detail.basis.amount
            : null;
    }

    function renderListings(model, session){
        let market = model.market != null && model.market.listings != null ? model.market.listings : null;
        let bazaar = model.bazaar != null && model.bazaar.listings != null ? model.bazaar.listings : null;
        let rows = [];
        (market ?? []).forEach(function(listing){ rows.push({ src: 'm', price: listing.price, amount: listing.amount }); });
        (bazaar ?? []).forEach(function(listing){ rows.push({ src: 'b', price: listing.price, amount: listing.amount }); });
        rows.sort(function(a, b){ return a.price - b.price || (a.src < b.src ? -1 : 1); });
        let html = '';
        if (market == null && bazaar == null){
            return renderAlert('No listings could be read.' + (model.market != null && model.market.error ? ' ' + escapeHtml(model.market.error) + '.' : ''));
        }
        if (market == null){
            html += '<div class="tbf-ana-muted">Item market not read: ' + escapeHtml(model.market != null ? model.market.error : 'no data') + '.</div>';
        }
        if (bazaar == null){
            html += '<div class="tbf-ana-muted">Bazaars not read: ' + escapeHtml(model.bazaar != null ? model.bazaar.error : 'no data') + '.</div>';
        }
        // Tags: the listing the winning branch read, the ones its bracket skipped, and what the
        // other branches read. A listing is tagged once, by the first branch to claim it.
        let winner = session.trace != null ? session.branches.get(session.trace.winner) : null;
        let tags = new Map();
        let claim = function(key, tag){ if (key != null && !tags.has(key)){ tags.set(key, tag); } };
        if (winner != null){
            claim(basisKey(winner), '<span class="tbf-ana-tag">read by ' + escapeHtml(winner.formula) + '</span>');
        }
        session.branches.forEach(function(detail){
            if (detail !== winner){
                claim(basisKey(detail), '<span class="tbf-ana-tag tbf-ana-tag--blue">' + escapeHtml(detail.formula) + '</span>');
            }
        });
        let skipped = function(listing){
            if (winner == null || winner.price == null || (winner.source === SOURCE_BAZAAR ? 'b' : 'm') !== listing.src){
                return null;
            }
            // "Skipped" only for listings the bracket passed over on its way to the one it read;
            // the rest are just marked as ones it would never read.
            let passedOver = winner.basis != null && winner.basis.price != null && listing.price < winner.basis.price ? 'skipped · ' : '';
            let minimum = minimumStack(winner.formula, session.mine, winner.source);
            if (typeof minimum === 'number' && listing.amount < minimum){
                return passedOver + count(listing.amount) + ' under ' + count(minimum);
            }
            if (winner.limit != null && performOperation(listing.price, stripDeltaBracket(winner.formula)) < winner.limit){
                return passedOver + 'under the limit';
            }
            return null;
        };
        let lines = [];
        let youPlaced = model.you == null;
        let ranks = [];
        if (model.you != null){
            if (bazaar != null){ ranks.push('#' + count(cheaperThan(bazaar, model.you).length + 1) + ' among bazaars'); }
            if (market != null){ ranks.push('#' + count(cheaperThan(market, model.you).length + 1) + ' on the market'); }
        }
        let youLine = model.you == null ? '' :
            '<div class="tbf-ana-lr tbf-ana-lr--you"><span class="tbf-ana-src tbf-ana-y">★</span><span class="p">' + money(model.you) + '</span><span class="q">' + (model.mine != null ? '×' + count(model.mine) : '') + '</span><span class="n">you' + (ranks.length ? ' · ' + escapeHtml(ranks.join(' · ')) : '') + '</span></div>';
        rows.forEach(function(listing){
            if (!youPlaced && listing.price > model.you){
                lines.push(youLine);
                youPlaced = true;
            }
            let key = listing.src + ':' + listing.price + ':' + listing.amount;
            let tag = tags.get(key) ?? '';
            if (tag !== ''){
                tags.delete(key);
            }
            let why = skipped(listing);
            let cls = 'tbf-ana-lr' + (why != null ? ' tbf-ana-lr--dim' : '');
            let note = tag + (why != null ? '<span class="tbf-ana-tag tbf-ana-tag--gray">' + escapeHtml(why) + '</span>' : '');
            lines.push('<div class="' + cls + '" data-price="' + listing.price + '" title="Click to price $1 under this listing">' +
                '<span class="tbf-ana-src tbf-ana-' + listing.src + '">' + (listing.src === 'm' ? 'M' : 'B') + '</span>' +
                '<span class="p">' + money(listing.price) + '</span><span class="q">×' + count(listing.amount) + '</span><span class="n">' + note + '</span></div>');
        });
        if (!youPlaced){
            lines.push(youLine);
        }
        let shown = lines.map(function(line, index){
            return index < ANALYTICS_LADDER_ROWS ? line : line.replace('class="tbf-ana-lr', 'class="tbf-ana-lr tbf-ana-lr--hidden');
        });
        let more = [];
        if (lines.length > ANALYTICS_LADDER_ROWS){
            more.push(count(lines.length - ANALYTICS_LADDER_ROWS) + ' more · <a class="tbf-ana-showall">show all</a>');
        }
        if (model.bazaar != null && model.bazaar.ignored > 0){
            more.push(count(model.bazaar.ignored) + ' bazaar ' + (model.bazaar.ignored === 1 ? 'listing' : 'listings') + ' ignored (sponsored, stale or far under the average)');
        }
        html += renderLegend() + '<div class="tbf-ana-lad">' + shown.join('') +
            (more.length ? '<div class="tbf-ana-lr tbf-ana-lr--more"><span class="n">' + more.join(' · ') + '</span></div>' : '') + '</div>' +
            '<div class="tbf-ana-hint">Click a listing to price $1 under it.</div>';
        return html;
    }

    function deltaPhrase(delta){
        let match = String(delta ?? '').trim().match(/^([-+]?)(\d+(?:\.\d+)?)(%)?$/);
        if (match == null){
            return '';
        }
        return (match[1] === '-' ? 'minus ' : 'plus ') + (match[3] ? match[2] + '%' : '$' + Number(match[2]).toLocaleString('en-US'));
    }

    // One sentence on what a branch read and did with it.
    function describeBranch(detail, session){
        if (detail == null){
            return 'not priced';
        }
        if (detail.error != null){
            return 'failed: ' + describeError(detail.error);
        }
        if (detail.unmatched != null){
            return capitalise(detail.unmatched);
        }
        if (detail.nothing || detail.basis == null){
            return 'no usable bazaar price, so this branch sat out';
        }
        let sourceName = detail.source === SOURCE_BAZAAR ? 'bazaar' : 'item-market';
        let basis = detail.basis;
        let text;
        if (basis.value != null){
            text = (detail.source === SOURCE_MARKET_VALUE ? 'market value ' : 'bazaar average ') + money(basis.value);
        } else if (basis.median != null){
            text = 'median of ' + count(basis.count) + ' ' + sourceName + ' listings, ' + money(basis.median);
        } else {
            text = ordinal(basis.rank) + ' ' + sourceName + ' listing, ' + money(basis.price) + ' ×' + count(basis.amount);
        }
        if (basis.skipped > 0){
            let minimum = minimumStack(detail.formula, session.mine, detail.source);
            let under = typeof minimum === 'number' ? 'under ' + count(minimum) : 'under the limit';
            if (typeof minimum === 'number' && detail.limit != null){
                under += ' or the limit';
            }
            text += ', after skipping ' + count(basis.skipped) + ' ' + under;
        }
        if (detail.fallback){
            text = 'no bazaar price, so the item market instead: ' + text;
        }
        let delta = deltaPhrase(stripDeltaBracket(detail.formula));
        if (delta !== ''){
            text += ', ' + delta;
        }
        if (detail.limitFormula != null && detail.limit != null){
            text += ' · above ' + detail.limitFormula + ' = ' + money(detail.limit);
        }
        return text;
    }

    function traceNodeValue(node, session){
        if (node.kind === 'formula'){
            let detail = session.branches.get(node.formula);
            return detail != null && typeof detail.price === 'number' && isFinite(detail.price) ? detail.price : null;
        }
        let best = null;
        node.children.forEach(function(child){
            let value = traceNodeValue(child, session);
            if (value != null && (best == null || (node.combine === 'min' ? value < best : value > best))){
                best = value;
            }
        });
        return best;
    }

    // The setting as a tree: each formula with what it came to, the min()/max() around them
    // with what they chose, the winning formula and the final answer marked.
    function renderTraceNode(node, session, depth){
        let indent = ' style="margin-left:' + (depth * 16) + 'px"';
        if (node.kind === 'formula'){
            let detail = session.branches.get(node.formula);
            let win = node.formula === session.trace.winner;
            let price = detail != null && typeof detail.price === 'number' ? money(detail.price) : '—';
            return '<div class="tbf-ana-tr' + (win ? ' tbf-ana-tr--win' : '') + '"' + indent + '><code>' + escapeHtml(node.formula) + '</code><span class="r">' + price + '</span>' +
                '<span class="why">' + escapeHtml(describeBranch(detail, session)) + (win && depth > 0 ? ' · filled' : '') + '</span></div>';
        }
        let value = traceNodeValue(node, session);
        let html = '<div class="tbf-ana-tr"' + indent + '><span class="op">' + node.combine + '(</span></div>';
        html += node.children.map(function(child){ return renderTraceNode(child, session, depth + 1); }).join('');
        html += '<div class="tbf-ana-tr' + (depth === 0 && value != null ? ' tbf-ana-tr--win' : '') + '"' + indent + '><span class="op">) → <b>' + (value == null ? '—' : money(value)) + '</b></span>' +
            '<span class="why">the ' + (node.combine === 'min' ? 'lowest' : 'highest') + ' of ' + node.children.length + (depth === 0 && value != null ? ' · filled' : '') + '</span></div>';
        return html;
    }

    function renderFormula(model, session){
        let trace = session.trace;
        if (trace == null){
            return renderAlert('<b>Nothing priced.</b> ' + escapeHtml(session.failure ?? 'The first read failed, so the setting was never applied') + '.');
        }
        let html = '';
        let winner = session.branches.get(trace.winner);
        let unmatched = traceUnmatched(session);
        let error = traceError(session);
        if (unmatched != null){
            html += renderAlert('<b>Price left as it is.</b> ' + escapeHtml(capitalise(unmatched)) + '.');
        } else if (error != null){
            html += renderAlert('<b>Nothing priced.</b> ' + escapeHtml(error) + '.');
        } else if (model.you != null){
            let others = [];
            session.branches.forEach(function(detail){
                if (detail !== winner && collectFormulas(trace.root).indexOf(detail.formula) !== -1){
                    others.push('<code>' + escapeHtml(detail.formula) + '</code> ' + (typeof detail.price === 'number' ? money(detail.price) : 'nothing'));
                }
            });
            html += '<div class="tbf-ana-verdict"><b>Filled ' + money(model.you) + '</b> from <code>' + escapeHtml(trace.winner) + '</code>: ' + escapeHtml(describeBranch(winner, session)) + '.' +
                (others.length ? ' The other ' + (others.length === 1 ? 'branch' : 'branches') + ': ' + others.join(', ') + '.' : '') + '</div>';
        }
        html += '<div class="tbf-ana-sec">Formula · <code>' + escapeHtml(trace.setting) + '</code></div>';
        html += '<div class="tbf-ana-trace">' + renderTraceNode(trace.root, session, 0) + '</div>';
        if (model.you != null && winner != null && Array.isArray(winner.listings) && winner.listings.length > 0){
            let percent = priceCoefficientPercent(model.you, winner.listings);
            let third = winner.listings[Math.min(2, winner.listings.length - 1)].price;
            let verdict = percent <= 50 ? 'a red warning' : percent <= 75 ? 'a yellow warning' : percent <= 95 ? 'a green bubble' : 'no warning bubble';
            html += '<div class="tbf-ana-note">Colour check: ' + money(model.you) + ' is ' + percent + '% of the 3rd cheapest ' +
                (winner.source === SOURCE_BAZAAR ? 'bazaar' : 'item-market') + ' listing (' + money(third) + '), so ' + verdict + '. It turns yellow under 75% and red under 50%.</div>';
        }
        return html;
    }

    function renderFoot(model, row){
        let html = '<span class="tbf-ana-sum">';
        if (model.you != null && model.mine != null && model.mine > 0){
            html += escapeHtml(count(model.mine) + ' × ' + money(model.you) + ' = ' + money(model.you * model.mine) + ' · no bazaar fee');
        }
        html += '</span><button type="button" class="tbf-ana-settings">Settings</button>';
        if (model.you != null && row.host.isConnected){
            html += '<button type="button" class="tbf-ana-apply" data-price="' + model.you + '">' + escapeHtml((row.pageType === pages.ManageItems ? 'Update ' : 'Fill ') + money(model.you)) + '</button>';
        }
        return html;
    }

    // Put a price from the popup into the row it was opened from, the way Fill does: on Add
    // Items the quantity goes in too and Clear replaces Fill. A listing click sets the price only.
    function applyAnalyticsPrice(price, withQuantity){
        let row = analyticsRow;
        if (row == null || !row.host.isConnected){
            showToast('That row is no longer on the page.');
            return;
        }
        if (!(price > 0)){
            return;
        }
        let inputEvent = new Event("input", { bubbles: true });
        if (row.pageType === pages.ManageItems){
            let moneyGroupDiv = manageMoneyGroup(row.host.parentNode);
            let priceInputs = moneyGroupDiv == null ? [] : moneyGroupDiv.querySelectorAll("div.input-money-group input");
            if (priceInputs.length === 0){
                showToast('Could not find the price box on this row.');
                return;
            }
            priceInputs.forEach(function(input){ input.value = price; });
            priceInputs[0].dispatchEvent(inputEvent);
        } else {
            let amountDiv = rowAmountDiv(row);
            let priceInputs = amountDiv == null ? [] : amountDiv.querySelectorAll("div.price div input");
            if (priceInputs.length === 0){
                showToast('Could not find the price box on this row.');
                return;
            }
            priceInputs.forEach(function(input){ input.value = price; });
            priceInputs[0].dispatchEvent(inputEvent);
            if (withQuantity && analyticsSession != null && analyticsSession.mine != null){
                let checkbox = amountDiv.querySelector("div.amount.choice-container input");
                if (checkbox != null){
                    if (!checkbox.checked){
                        checkbox.click();
                    }
                } else {
                    let quantityInput = amountDiv.querySelector("div.amount input");
                    if (quantityInput != null){
                        quantityInput.value = analyticsSession.mine;
                        quantityInput.dispatchEvent(new Event("keyup", { bubbles: true }));
                    }
                }
                let fillBtn = row.host.querySelector("span.btn-wrap.torn-bazaar-fill-qty-price span.btn");
                let clearBtn = row.host.querySelector("span.btn-wrap.torn-bazaar-clear-qty-price span.btn");
                if (fillBtn != null && clearBtn != null){
                    fillBtn.style.display = "none";
                    clearBtn.style.display = "inline-block";
                }
            }
        }
        showToast('Price set to ' + money(price) + '.');
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
        // No stored version means one of two things: a brand-new install, or — far more often,
        // because this is the first release to carry the popup — a long-standing user whose key
        // simply never existed. The two are indistinguishable from here, so the notes get shown
        // rather than swallowed. Staying silent would hide this release from everyone who
        // already had the script.
        let unseen = lastSeen == null
            ? CHANGELOG
            : CHANGELOG.filter(function(release){ return compareVersions(release.version, lastSeen) > 0; });
        // Silent releases wait for the menu: they never open the popup, and stay out of it when
        // another release does.
        unseen = unseen.filter(function(release){ return !release.silent; });
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
        return '<div class="tbf-changelog-release">' +
                   '<div class="tbf-changelog-ver"><b>v' + release.version + '</b>' +
                       (index === 0 ? '<span class="tbf-changelog-badge">new</span>' : '') +
                       '<span class="tbf-changelog-date">' + release.date + '</span>' +
                   '</div>' +
                   '<ul class="tbf-changelog-items">' +
                       release.changes.map(function(change){ return '<li>' + change + '</li>'; }).join('') +
                   '</ul>' +
               '</div>';
    }

    function openChangelogModal(releases){
        if (releases.length === 0){
            return;
        }
        let overlay = document.querySelector('.tbf-changelog-overlay');
        if (overlay == null){
            overlay = document.createElement('div');
            // Borrows the settings modal's chrome, so the popup needs no layout of its own.
            overlay.className = 'tbf-modal-overlay tbf-changelog-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML =
            '<div class="tbf-modal">' +
                '<h3>Bazaar Filler v' + SCRIPT_VERSION + ' — what&rsquo;s new' +
                    '<span class="tbf-modal-close" title="Close">&times;</span>' +
                '</h3>' +
                releases.map(renderChangelogRelease).join('') +
                '<div class="tbf-modal-actions">' +
                    '<button type="button" class="tbf-changelog-settings">Open settings</button>' +
                    '<button type="button" class="tbf-modal-save tbf-changelog-ok">Got it</button>' +
                '</div>' +
            '</div>';

        overlay.querySelector('.tbf-modal-close').addEventListener('click', closeChangelogModal);
        overlay.querySelector('.tbf-changelog-ok').addEventListener('click', closeChangelogModal);
        overlay.querySelector('.tbf-changelog-settings').addEventListener('click', function(){
            closeChangelogModal();
            openSettingsModal();
        });
        overlay.addEventListener('click', function(event){ if (event.target === overlay){ closeChangelogModal(); } });
        overlay.classList.add('tbf-modal-overlay--open');
    }

    // Dismissing by any route counts as read — the popup must never nag.
    function closeChangelogModal(){
        let overlay = document.querySelector('.tbf-changelog-overlay');
        if (overlay != null){
            overlay.classList.remove('tbf-modal-overlay--open');
        }
        rememberChangelogSeen();
    }

    function ensureSettingsModal(){
        if (document.querySelector('.tbf-settings-overlay') != null){
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'tbf-modal-overlay tbf-settings-overlay';
        overlay.innerHTML =
            '<div class="tbf-modal">' +
                '<h3>Bazaar Filler Settings<span class="tbf-modal-close" title="Close">&times;</span></h3>' +
                '<label>Default price delta</label>' +
                '<input type="text" class="tbf-modal-delta" placeholder="-1">' +
                '<label>Default quantity</label>' +
                '<input type="text" class="tbf-modal-qty" placeholder="max">' +
                '<label>Public API key</label>' +
                '<div class="tbf-modal-key">' +
                    '<input type="password" class="tbf-modal-apikey" placeholder="16-character key" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
                    '<span class="tbf-modal-key-reveal" title="Show the key">Show</span>' +
                '</div>' +
                '<label>Per-category overrides</label>' +
                '<div class="tbf-modal-cat-head"><span>Category</span><span>Price</span><span>Quantity</span><span></span></div>' +
                '<div class="tbf-modal-cats"></div>' +
                '<button type="button" class="tbf-modal-addcat">+ Add category</button>' +
                '<button type="button" class="tbf-modal-resetcat" title="Forget cached item categories. Use if Torn recategorised an item and a wrong discount is being applied.">Reset learned categories</button>' +
                '<button type="button" class="tbf-modal-clearexcl" title="Un-exclude every item marked ⊘, including ones not currently on screen.">Clear exclusions</button>' +
                '<div class="tbf-modal-error"></div>' +
                '<div class="tbf-modal-actions">' +
                    '<button type="button" class="tbf-modal-cancel">Cancel</button>' +
                    '<button type="button" class="tbf-modal-save">Save</button>' +
                '</div>' +
                '<div class="tbf-modal-help">Item market: <code>-1</code> (lowest listing − $1), <code>-5%</code>, <code>-1[1]</code> (2nd lowest listing), <code>[market]</code> (Torn market value).<br>' +
                'Stack size: <code>-1[100x+]</code> undercuts the cheapest listing of 100 or more, <code>-1[mine+]</code> the cheapest at least as big as your stack, <code>-1[2xmine+]</code> at least twice as big. <code>-1[mine+ above +5%[market]]</code> also skips any listing that would put you under 5% over market value.<br>' +
                'Player bazaars, via weav3r.dev, no API key: <code>-1[bazaar]</code> (cheapest bazaar − $1), <code>-1[bazaar:2]</code> (3rd cheapest), <code>-5%[bazaar:avg]</code> (bazaar average), <code>[bazaar:median]</code>.<br>' +
                'Combine sources: <code>-1[bazaar] | -1</code> prices both and fills the higher one, so the second is a floor under the first. <code>max(-1[bazaar], -1)</code> is the same; <code>min(-1[bazaar], -1)</code> fills the lower one, to undercut whichever source is cheapest.<br>' +
                'Price range: put one inside the other to keep a price between a floor and a ceiling. <code>min(max(-1, +10%[market]), -1[14])</code> never fills below 10% over market value, and never above the 15th listing &minus; $1.<br>' +
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
        // The key is masked like a password so it cannot be read off a shared screen or a
        // screenshot. "Show" is there for the times you do need to check it.
        overlay.querySelector('.tbf-modal-key-reveal').addEventListener('click', function(event){
            const keyInput = overlay.querySelector('.tbf-modal-apikey');
            const hidden = keyInput.type === 'password';
            keyInput.type = hidden ? 'text' : 'password';
            event.target.textContent = hidden ? 'Hide' : 'Show';
            event.target.title = hidden ? 'Hide the key' : 'Show the key';
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
        const overlay = document.querySelector('.tbf-settings-overlay');
        clearSettingsError(overlay);
        overlay.querySelector('.tbf-modal-delta').value = priceDeltaRaw;
        overlay.querySelector('.tbf-modal-qty').value = quantityModeRaw;
        const keyInput = overlay.querySelector('.tbf-modal-apikey');
        keyInput.value = apiKey ?? '';
        // However the key was left last time, it is masked again on every open.
        keyInput.type = 'password';
        const keyReveal = overlay.querySelector('.tbf-modal-key-reveal');
        keyReveal.textContent = 'Show';
        keyReveal.title = 'Show the key';
        const list = overlay.querySelector('.tbf-modal-cats');
        list.innerHTML = '';
        // One row per category named by either map, so a category with only a quantity
        // override still shows up.
        let names = [...new Set(Object.keys(categoryDeltas).concat(Object.keys(categoryQuantities)))];
        names.forEach(function(key){ addCategoryRow(key, categoryDeltas[key] ?? '', categoryQuantities[key] ?? ''); });
        overlay.classList.add('tbf-modal-overlay--open');
    }

    function closeSettingsModal(){
        const overlay = document.querySelector('.tbf-settings-overlay');
        if (overlay != null){
            overlay.classList.remove('tbf-modal-overlay--open');
        }
    }

    // ---- Settings validation ----------------------------------------------------------
    // Save refuses anything the filler could not act on later. A bad formula used to be stored
    // happily and then fail every row that reached it, with nothing on screen to say why.

    // A price formula is an optional discount ("-1", "+5", "-5%") followed by an optional
    // source in brackets. Either half may be left out; a bare source means "as it stands".
    function formulaProblem(branch){
        let open = branch.indexOf('[');
        let delta = (open === -1 ? branch : branch.substring(0, open)).trim();
        if (delta !== '' && !/^[-+]?\d+(\.\d+)?%?$/.test(delta)){
            return "'" + delta + "' is not a discount. Use -1, +5, -5%, or nothing at all.";
        }
        if (open === -1){
            return null;
        }
        let close = matchingBracket(branch, open);
        if (close === -1){
            return "'" + branch + "' is missing its closing ].";
        }
        if (branch.substring(close + 1).trim() !== ''){
            return "'" + branch + "' has stray text after the ].";
        }
        return bracketProblem(branch);
    }

    // Whole setting: a lone formula, "a | b", or min(...)/max(...) around a list of them, which
    // may themselves hold further calls. Blank is always fine, since it means "use the default".
    function settingProblem(setting){
        let raw = String(setting ?? '').trim();
        if (raw === ''){
            return null;
        }
        // Checked once up front so the term walk below can trust every ( to have its ).
        let depth = 0;
        for (let i = 0; i < raw.length; i++){
            if (raw.charAt(i) === '('){
                depth++;
            } else if (raw.charAt(i) === ')'){
                depth--;
                if (depth < 0){
                    return "there is a ) with no ( to open it.";
                }
            }
        }
        if (depth > 0){
            return "min() and max() need a closing ).";
        }
        return expressionProblem(raw);
    }

    // One level of a setting: the terms between its separators, each a call or a formula.
    function expressionProblem(body){
        let terms = splitTopLevel(body);
        for (let i = 0; i < terms.length; i++){
            let term = terms[i].trim();
            if (term === ''){
                return "there is an empty formula next to a separator.";
            }
            let open = term.indexOf('(');
            if (open === -1){
                let problem = formulaProblem(term);
                if (problem != null){
                    return problem;
                }
                continue;
            }
            let name = term.substring(0, open).trim().toLowerCase();
            if (name !== 'min' && name !== 'max'){
                return name === ''
                    ? "a formula cannot start with (. Only min(...) and max(...) use brackets."
                    : "'" + term.substring(0, open).trim() + "' is not a function. Only min(...) and max(...) use brackets.";
            }
            let close = matchingParen(term, open);
            if (term.substring(close + 1).trim() !== ''){
                return "'" + term + "' has stray text after the ). Separate formulas with | or ,.";
            }
            let inner = term.substring(open + 1, close);
            if (inner.trim() === ''){
                return "min() and max() need at least one formula between the brackets.";
            }
            let problem = expressionProblem(inner);
            if (problem != null){
                return problem;
            }
        }
        return null;
    }

    function reportSettingsError(overlay, input, message){
        let box = overlay.querySelector('.tbf-modal-error');
        if (box != null){
            box.textContent = message;
            box.style.display = 'block';
        }
        input.classList.add('tbf-modal-invalid');
        input.focus();
        return false;
    }

    function clearSettingsError(overlay){
        if (overlay == null){
            return;
        }
        let box = overlay.querySelector('.tbf-modal-error');
        if (box != null){
            box.textContent = '';
            box.style.display = 'none';
        }
        overlay.querySelectorAll('.tbf-modal-invalid').forEach(function(input){
            input.classList.remove('tbf-modal-invalid');
        });
    }

    // True when every field can be saved. Otherwise the first bad one is marked, the reason is
    // shown, and the modal stays open so nothing the user typed is lost.
    function validateSettingsModal(overlay){
        clearSettingsError(overlay);
        let deltaInput = overlay.querySelector('.tbf-modal-delta');
        let deltaProblem = settingProblem(deltaInput.value);
        if (deltaProblem != null){
            return reportSettingsError(overlay, deltaInput, 'Default price delta: ' + deltaProblem);
        }
        let qtyInput = overlay.querySelector('.tbf-modal-qty');
        if (qtyInput.value.trim() !== '' && !isKnownQuantityMode(qtyInput.value)){
            return reportSettingsError(overlay, qtyInput, 'Default quantity: use max, max-1, a plain number, or skip.');
        }
        let keyInput = overlay.querySelector('.tbf-modal-apikey');
        let key = keyInput.value.trim();
        if (key !== '' && key.length !== 16){
            return reportSettingsError(overlay, keyInput, 'Public API key: a Torn key is 16 characters long.');
        }
        let rows = overlay.querySelectorAll('.tbf-modal-cat-row');
        for (let i = 0; i < rows.length; i++){
            let nameInput = rows[i].querySelector('.tbf-modal-cat-name');
            let formulaInput = rows[i].querySelector('.tbf-modal-cat-formula');
            let rowQtyInput = rows[i].querySelector('.tbf-modal-cat-qty');
            let name = nameInput.value.trim();
            if (name === ''){
                // An entirely blank row is dropped on save; only one carrying settings is a
                // mistake worth stopping for.
                if (formulaInput.value.trim() !== '' || rowQtyInput.value.trim() !== ''){
                    return reportSettingsError(overlay, nameInput, 'This category row needs a category name.');
                }
                continue;
            }
            let rowProblem = settingProblem(formulaInput.value);
            if (rowProblem != null){
                return reportSettingsError(overlay, formulaInput, name + ' price: ' + rowProblem);
            }
            if (rowQtyInput.value.trim() !== '' && !isKnownQuantityMode(rowQtyInput.value)){
                return reportSettingsError(overlay, rowQtyInput, name + ' quantity: use max, max-1, a plain number, or skip.');
            }
        }
        return true;
    }

    function saveSettingsModal(){
        const overlay = document.querySelector('.tbf-settings-overlay');
        if (overlay == null){
            return;
        }
        if (!validateSettingsModal(overlay)){
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
        if (!needsTornApiKey()){
            return;
        }
        if (!checkExisting || !hasUsableApiKey()){
            // Never pre-filled: a browser prompt shows its contents in plain text, and this
            // dialog is the one that ends up on screen when the script is being demonstrated.
            let userInput = prompt("Please enter a PUBLIC Api Key, it will be used to get current bazaar prices:", '');
            if (userInput !== null && userInput.length == 16) {
                apiKey = userInput;
                localStorage.setItem("silmaril-torn-bazaar-filler-apikey", userInput);
            } else {
                console.error("[TornBazaarFiller] User cancelled the Api Key input.");
            }
        }
    }
})();
