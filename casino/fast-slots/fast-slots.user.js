// ==UserScript==
// @name         Torn Fast Slots
// @namespace    https://github.com/SOLiNARY
// @version      0.4
// @description  Makes slots stop instantly, first spin included, without leaving the barrels blurred.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT
// @match        https://www.torn.com/loader.php?sid=slots
// @match        https://www.torn.com/page.php?sid=slots
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @run-at       document-start
// ==/UserScript==
 
(function() {
    'use strict';
 
    // Lowest speed that still plays - and therefore clears - Torn's blurred spin frame.
    // A speed of 0 stops the barrels but leaves the blur sprite on screen.
    const spinAnimationSpeed = 50;
 
    const isTampermonkeyEnabled = typeof unsafeWindow !== 'undefined';
    const jsonHost = isTampermonkeyEnabled ? unsafeWindow : window;
    const originalParse = jsonHost.JSON.parse;
 
    // Hooking JSON.parse at document-start covers every response, including the first
    // spin that the old document-idle $.ajax hook missed. Idea by alesgrbec [2064983].
    jsonHost.JSON.parse = function (text, reviver) {
        const data = originalParse.call(this, text, reviver);
        if (data != null && typeof data === 'object' && 'barrelsAnimationSpeed' in data) {
            if (data.error) delete data.error;
            if (data.errorMsg) delete data.errorMsg;
            data.barrelsAnimationSpeed = spinAnimationSpeed;
        }
        return data;
    };
 
    function enableBetButtons() {
        document.querySelectorAll(".slots-btn-list .betbtn").forEach(btn => {
            btn.classList.remove("disabled");
        });
    }
 
    function disableBetButtons() {
        document.querySelectorAll(".slots-btn-list .betbtn").forEach(btn => {
            btn.classList.add("disabled");
        });
    }
 
    function watchBarrelsSpinAndStop(delay = 60) {
        const barrels = document.querySelectorAll("#barrel0, #barrel1, #barrel2");
        let timers = new Map();
        let stopped = new Map();
 
        barrels.forEach(barrel => stopped.set(barrel, true));
 
        barrels.forEach(barrel => {
            const observer = new MutationObserver(() => {
                disableBetButtons();
                stopped.set(barrel, false);
                clearTimeout(timers.get(barrel));
                timers.set(barrel, setTimeout(() => {
                    stopped.set(barrel, true);
                    if ([...stopped.values()].every(Boolean)) {
                        enableBetButtons();
                    }
                }, delay));
            });
 
            observer.observe(barrel, {
                attributes: true,
                attributeFilter: ["style"]
            });
        });
    }
 
    var o = setInterval(() => {
        if (document.getElementById('barrels') != null) {
            clearInterval(o)
            watchBarrelsSpinAndStop();
        }
    }, 100);
})();
