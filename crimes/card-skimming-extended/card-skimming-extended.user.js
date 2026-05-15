// ==UserScript==
// @name         Torn Crimes Card Skimming Extended
// @namespace    https://github.com/SOLiNARY
// @version      0.6.1
// @description  Sorts all installed card skimmers by location, time installed, score or cards skimmed. Adds card/hour stat. Remembers your choice.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/loader.php?sid=crimes*
// @match        https://www.torn.com/page.php?sid=crimes*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(async function () {
    'use strict';

    const sortBy = {
        Location: 10,
        TimeInstalled: 20,
        CardsSkimmed: 30,
        Score: 40
    };
    const sortDirection = {
        Ascending: 1,
        Descending: -1
    };

    const STORAGE_KEY_BY = 'silmaril-torn-crimes-card-skimming-sorting-by';
    const STORAGE_KEY_DIR = 'silmaril-torn-crimes-card-skimming-sorting-direction';
    const HEADER_CLASS = 'silmaril-card-skimming-header';
    const ROW_STATS_CLASS = 'silmaril-skimmer-stats';
    const TOTAL_STATS_CLASS = 'silmaril-card-skimming-total-stats';
    const DROPDOWN_STATS_CLASS = 'silmaril-card-skimming-dropdown-stats';
    const SKIMMER_ROW_HEIGHT = 51;

    function isMobileView() {
        return window.innerWidth <= 784;
    }

    let currentSortBy = parseInt(localStorage.getItem(STORAGE_KEY_BY) ?? sortBy.Location, 10);
    let currentSortDirection = parseInt(localStorage.getItem(STORAGE_KEY_DIR) ?? sortDirection.Descending, 10);
    let isSetupInProgress = false;

    // Cached skimmer data captured from the crimes API. This is the source of truth for total/aggregate
    // stats, because the visible DOM only contains the virtualized subset (Torn only renders ~16 of 20
    // skimmer rows at any one time).
    let apiSkimmers = null;
    const CRIMES_LIST_URL_FRAGMENT = 'crimesData&step=crimesList';

    function tryCacheSkimmersFromResponse(jsonData) {
        const subCrimes = jsonData && jsonData.DB && jsonData.DB.crimesByType && jsonData.DB.crimesByType.subCrimes;
        if (!Array.isArray(subCrimes)) return false;
        apiSkimmers = subCrimes;
        return true;
    }

    const isTampermonkeyEnabled = typeof unsafeWindow !== 'undefined';
    const fetchHost = isTampermonkeyEnabled ? unsafeWindow : window;
    const originalFetch = fetchHost.fetch;

    fetchHost.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = response.url || '';
            if (url.indexOf(CRIMES_LIST_URL_FRAGMENT) >= 0 && window.location.href.indexOf('cardskimming') >= 0) {
                const cloned = await response.clone().json();
                tryCacheSkimmersFromResponse(cloned);
            }
        } catch (e) {
            // Swallow — interception is best-effort, the script falls back to DOM extrapolation.
        }
        return response;
    };

    function extractApiRowScore(apiObj) {
        const ci = apiObj && apiObj.crimeInfo;
        const cards = ci && typeof ci.cards === 'number' ? ci.cards : 0;
        const hours = ci && typeof ci.timeActive === 'number' ? ci.timeActive / 3600 : 0;
        const score = hours > 0 ? cards / hours : 0;
        const location = typeof apiObj.title === 'string' ? apiObj.title : '';
        return {cards, hours, score, location};
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function parseVerbalTimestamp(text) {
        const timeUnits = {
            second: 1, seconds: 1,
            minute: 60, minutes: 60,
            hour: 3600, hours: 3600,
            day: 86400, days: 86400,
            week: 604800, weeks: 604800
        };
        const regex = /(\d+)\s+(\w+)/g;
        let total = 0;
        let match;
        while ((match = regex.exec(text))) {
            const [, value, unit] = match;
            if (Object.prototype.hasOwnProperty.call(timeUnits, unit)) {
                total += parseInt(value, 10) * timeUnits[unit];
            }
        }
        return total;
    }

    function getCardSkimmingRoot() {
        return document.querySelector('div.crime-root.cardskimming-root');
    }

    function getVirtualList(root) {
        return root ? root.querySelector('[class*=virtualList___]') : null;
    }

    function getSkimmerItems(virtualList) {
        if (!virtualList) return [];
        return Array.from(virtualList.querySelectorAll('div[class*=virtualItem___]'))
            .filter(item => item.querySelector('[class*=timeActive___]') && item.querySelector('[class*=statusCards___]'));
    }

    function getLocationText(locationDiv) {
        if (!locationDiv) return '';
        for (const node of locationDiv.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent.trim();
                if (t) return t;
            }
        }
        return '';
    }

    function extractRowData(item) {
        const cardsEl = item.querySelector('[class*=statusCards___]');
        const cards = parseFloat((cardsEl ? cardsEl.textContent : '0').replace(/,/g, '')) || 0;
        const timeEl = item.querySelector('[class*=timeActive___]');
        const hours = parseVerbalTimestamp(timeEl ? timeEl.textContent : '') / 3600;
        const locationDiv = item.querySelector('[class*=flexGrow___]');
        const location = getLocationText(locationDiv);
        const score = hours > 0 ? cards / hours : 0;
        return {item, cards, hours, location, score, locationDiv};
    }

    function injectRowStats(rowData) {
        const {score, locationDiv} = rowData;
        if (!locationDiv) return;
        let stats = locationDiv.querySelector('.' + ROW_STATS_CLASS);
        if (!stats) {
            stats = document.createElement('span');
            stats.className = ROW_STATS_CLASS;
            locationDiv.appendChild(stats);
        }
        const mobile = isMobileView();
        const desiredStyle = `display:block;font-size:${mobile ? '.58rem' : '.65rem'};line-height:1;opacity:.85;font-weight:normal;`;
        if (stats.style.cssText !== desiredStyle) stats.style.cssText = desiredStyle;
        const label = mobile ? 'c/h' : 'card/hour';
        const text = `${score.toFixed(2)} ${label}`;
        if (stats.textContent !== text) stats.textContent = text;
    }

    function sortRows(rows) {
        const dir = currentSortDirection;
        let cmp;
        switch (currentSortBy) {
            case sortBy.Location:
                cmp = (a, b) => a.location.localeCompare(b.location) * dir;
                break;
            case sortBy.TimeInstalled:
                cmp = (a, b) => (a.hours - b.hours) * dir;
                break;
            case sortBy.CardsSkimmed:
                cmp = (a, b) => (a.cards - b.cards) * dir;
                break;
            case sortBy.Score:
                cmp = (a, b) => (a.score - b.score) * dir;
                break;
            default:
                cmp = () => 0;
        }
        return [...rows].sort(cmp);
    }

    function applyPositions(originalRows, sortedRows) {
        if (sortedRows.length === 0) return;
        let baseY = Infinity;
        for (const rd of originalRows) {
            const t = rd.item.style.transform;
            if (!t) continue;
            const m = t.match(/translateY\(([-\d.]+)px\)/);
            if (m) {
                const y = parseFloat(m[1]);
                if (y < baseY) baseY = y;
            }
        }
        if (!Number.isFinite(baseY)) return;
        sortedRows.forEach((rd, idx) => {
            const desired = `translateY(${baseY + idx * SKIMMER_ROW_HEIGHT}px)`;
            if (rd.item.style.transform !== desired) {
                rd.item.style.transform = desired;
            }
        });
    }

    function ensureHeader(root) {
        if (root.querySelector('.' + HEADER_CLASS)) return;
        const virtualList = getVirtualList(root);
        if (!virtualList) return;

        const mobile = isMobileView();
        const header = document.createElement('div');
        header.className = HEADER_CLASS;
        header.style.cssText = `display:flex;align-items:center;height:${mobile ? '30' : '22'}px;padding:0 ${mobile ? '4' : '8'}px;font-size:${mobile ? '.72' : '.7'}rem;font-weight:bold;border-bottom:1px solid rgba(127,127,127,0.25);background:rgba(127,127,127,0.07);`;

        const cols = [
            {label: 'Location', sort: 'Location', flex: '2 1 0'},
            {label: mobile ? 'Time' : 'Time installed', sort: 'TimeInstalled', flex: '1 1 0'},
            {label: 'Score', sort: 'Score', flex: '1 1 0'},
            {label: mobile ? 'Cards' : 'Cards skimmed', sort: 'CardsSkimmed', flex: '1 1 0'}
        ];
        cols.forEach(col => {
            const el = document.createElement('div');
            el.dataset.sortName = col.sort;
            el.style.cssText = `cursor:pointer;flex:${col.flex};text-align:center;user-select:none;padding:0 ${mobile ? '2' : '4'}px;line-height:1.2;`;
            el.textContent = `${col.label} ⇧⇩`;
            el.addEventListener('click', () => {
                const newSortBy = sortBy[col.sort];
                const newDir = newSortBy === currentSortBy ? currentSortDirection * -1 : currentSortDirection;
                currentSortBy = newSortBy;
                currentSortDirection = newDir;
                localStorage.setItem(STORAGE_KEY_BY, String(newSortBy));
                localStorage.setItem(STORAGE_KEY_DIR, String(newDir));
                runSetup();
            });
            header.appendChild(el);
        });

        virtualList.parentNode.insertBefore(header, virtualList);
    }

    function updateDropdownStats(root, byLocation) {
        const dropdown = root.querySelector('[class*=locationSelectSection___] ul');
        if (!dropdown) return;
        for (const [location, agg] of byLocation) {
            if (!location) continue;
            const slug = location.replace(/ /g, '-');
            const option = dropdown.querySelector(`li[id^="option-${slug}-"]`) ||
                dropdown.querySelector(`li[id^="option-${slug}"]`);
            if (!option) continue;
            const target = option.querySelector('[class*=optionWithLevelRequirement___]') || option;
            const avg = agg.totalCount > 0 ? (agg.totalScore / agg.totalCount).toFixed(2) : '0.00';
            let stats = target.querySelector('.' + DROPDOWN_STATS_CLASS);
            if (!stats) {
                stats = document.createElement('span');
                stats.className = DROPDOWN_STATS_CLASS;
                stats.style.cssText = 'margin-left:auto;padding-left:6px;font-size:.7rem;opacity:.85;white-space:nowrap;';
                target.appendChild(stats);
            }
            const text = `${avg} c/h`;
            if (stats.textContent !== text) stats.textContent = text;
        }
    }

    function getTotalSkimmerCount(virtualList, skimmerItems) {
        if (!virtualList) return 0;
        const totalHeight = virtualList.offsetHeight;
        let firstSkimmerY = Infinity;
        for (const item of skimmerItems) {
            const t = item.style.transform;
            if (!t) continue;
            const m = t.match(/translateY\(([-\d.]+)px\)/);
            if (m) {
                const y = parseFloat(m[1]);
                if (y < firstSkimmerY) firstSkimmerY = y;
            }
        }
        if (!Number.isFinite(firstSkimmerY)) return skimmerItems.length;
        const inferred = Math.round((totalHeight - firstSkimmerY) / SKIMMER_ROW_HEIGHT);
        return Math.max(skimmerItems.length, inferred);
    }

    function updateTotalStats(root, visibleScore, visibleCount, totalCount) {
        const titleBar = root.querySelector('[class*=currentCrime___] [class*=titleBar___]');
        if (!titleBar) return;
        let totalStatsEl = titleBar.querySelector('.' + TOTAL_STATS_CLASS);
        if (!totalStatsEl) {
            totalStatsEl = document.createElement('div');
            totalStatsEl.className = TOTAL_STATS_CLASS;
            const title = titleBar.querySelector('[class*=title___]');
            if (title) {
                title.parentNode.insertBefore(totalStatsEl, title.nextSibling);
            } else {
                titleBar.appendChild(totalStatsEl);
            }
        }
        const mobile = isMobileView();
        const desiredStyle = `margin-left:${mobile ? '6' : '10'}px;font-size:${mobile ? '.65' : '.75'}rem;opacity:.85;align-self:center;white-space:nowrap;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;`;
        if (totalStatsEl.style.cssText !== desiredStyle) totalStatsEl.style.cssText = desiredStyle;
        const isEstimate = totalCount > visibleCount && visibleCount > 0;
        const displayedScore = isEstimate ? (visibleScore / visibleCount) * totalCount : visibleScore;
        const prefix = isEstimate ? '~' : '';
        const scoreText = displayedScore.toFixed(2);
        const text = mobile
            ? `${prefix}${scoreText} c/h · ${totalCount}/20`
            : `${prefix}${scoreText} card/hour with ${totalCount}/20 skimmers`;
        if (totalStatsEl.textContent !== text) totalStatsEl.textContent = text;
    }

    async function runSetup() {
        if (isSetupInProgress) return;
        isSetupInProgress = true;
        try {
            const root = getCardSkimmingRoot();
            if (!root) return;

            let attempts = 0;
            let virtualList = getVirtualList(root);
            let items = getSkimmerItems(virtualList);
            while (items.length === 0 && attempts < 40) {
                await sleep(50);
                attempts++;
                virtualList = getVirtualList(root);
                items = getSkimmerItems(virtualList);
            }
            if (items.length === 0) return;

            ensureHeader(root);

            const rows = items.map(extractRowData);
            rows.forEach(injectRowStats);

            const sorted = sortRows(rows);
            applyPositions(rows, sorted);

            const byLocation = new Map();
            let totalScore = 0;
            let totalCount = 0;

            if (Array.isArray(apiSkimmers) && apiSkimmers.length > 0) {
                for (const apiObj of apiSkimmers) {
                    const {score, location} = extractApiRowScore(apiObj);
                    const locationName = location || 'Unknown';
                    if (!byLocation.has(locationName)) {
                        byLocation.set(locationName, {totalScore: 0, totalCount: 0});
                    }
                    const agg = byLocation.get(locationName);
                    agg.totalScore += score;
                    agg.totalCount++;
                    totalScore += score;
                    totalCount++;
                }
            } else {
                for (const rd of rows) {
                    if (!byLocation.has(rd.location)) {
                        byLocation.set(rd.location, {totalScore: 0, totalCount: 0});
                    }
                    const agg = byLocation.get(rd.location);
                    agg.totalScore += rd.score;
                    agg.totalCount++;
                    totalScore += rd.score;
                    totalCount++;
                }
            }

            updateDropdownStats(root, byLocation);
            const inferredCount = getTotalSkimmerCount(virtualList, items);
            const displayTotalCount = Math.max(totalCount, inferredCount);
            updateTotalStats(root, totalScore, totalCount, displayTotalCount);
        } finally {
            isSetupInProgress = false;
        }
    }

    while (document.querySelector('html') == null) {
        await sleep(50);
    }

    await runSetup();
    setInterval(runSetup, 500);
})();
