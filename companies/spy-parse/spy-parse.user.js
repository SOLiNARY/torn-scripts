// ==UserScript==
// @name         Torn SpyParse
// @namespace    https://github.com/SOLiNARY
// @version      0.3.6.pda
// @description  Parse spy reports & save them in local storage After an update, a "What's new" popup lists what changed.
// @author       Ramin Quluzade, Silmaril [2665762]
// @license      MIT License
// @match        https://www.torn.com/jobs.php*
// @match        https://www.torn.com/companies.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==
 
(async function () {
    'use strict';

    // ---- "What's new" popup ----------------------------------------------------------------
    // Every Silmaril script on the page shares one popup: whichever runs first builds it, and
    // the rest append their own section. A crimes page carrying eight of these scripts therefore
    // shows one panel, not eight. The DOM is the channel because userscript sandboxes cannot see
    // each other's globals, and it needs no grants beyond what each script already asks for.

    const SCRIPT_VERSION = "0.3.6.pda";  // keep in sync with @version above
    const WHATS_NEW_NAME = "SpyParse";
    const WHATS_NEW_KEY = "silmaril-spy-parse-last-seen-version";
    // Newest release first. Every release above the version last seen is shown at once, so
    // updating across several versions still reports the whole gap.
    const CHANGELOG = [
        {
            version: "0.3.6.pda",
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

 
    const isTampermonkeyEnabled = typeof unsafeWindow !== 'undefined';
 
    const SpyJobs = {
        Army: 10,
        LawFirm: 20,
        TelevisionNetwork: 30,
        None: 0
    }
    const SpyJobsMapping = {
        "Type: Army": SpyJobs.Army,
        "Type: Law Firm": SpyJobs.LawFirm,
        "Type: Television Network": SpyJobs.TelevisionNetwork
    }
    let playerJob = 20;
    let spyReports = {};
 
    const viewPortWidthPx = window.innerWidth;
    const isMobileView = viewPortWidthPx <= 784;
 
    const styles = `
div#spy-parse-container {
    font-family: Verdana, Geneva, sans-serif;
    background-color: #CCC;
    text-align: center;
}
 
#spy-parse-btn {
    right: 20px;
    z-index: 99999;
}
 
#spy-copy-btn {
    right: 180px;
    z-index: 99999;
}
 
.float {
    width: 90px;
    height: 50px;
    margin: 0 auto;
    padding: 0;
    display: inline-block;
    line-height: 50px;
    text-align: center;
    top: 40px;
    text-decoration: none;
    position: fixed;
    padding-left: 20px;
    padding-right: 20px;
    background-color: #00144e;
    color: #FFF;
    border-radius: 50px;
    box-shadow: 2px 2px 3px #999;
    font-size: 18px;
}
 
.my-float {
    margin-top: 22px;
}
 
#spy-parse-tbl {
    position: fixed;
    top: 103px;
    right: 40px;
    font-family: arial, sans-serif;
    font-size: xx-small;
    border-collapse: collapse;
    width: auto;
}
 
#spy-parse-tbl tr {
    transition: background-color 400ms cubic-bezier(0.4, 0, 0.2, 1);;
}
 
#spy-parse-tbl tr td[data-level], td[data-updated] {
    display: none;
}
 
#spy-parse-tbl td, th {
    border: 1px solid #dddddd;
    text-align: left;
    padding: 8px;
    transition: background-color 400ms cubic-bezier(0.4, 0, 0.2, 1);;
}
 
#spy-parse-tbl tbody tr:nth-child(even) {
    background-color: #d1d1d1;
}
 
#spy-parse-tbl tbody tr:nth-child(odd) {
    background-color: white;
}
    `;
 
    if (isTampermonkeyEnabled){
        GM_addStyle(styles);
    } else {
        let style = document.createElement("style");
        style.type = "text/css";
        style.innerHTML = styles;
        while (document.head == null){
            await sleep(50);
        }
        document.head.appendChild(style);
    }
 
    let zNode = document.createElement('div');
    zNode.innerHTML = `<a id="spy-copy-btn" href="#" class="float">Copy <i class="fa fa-copy my-float"></i></a><a id="spy-parse-btn" href="#" class="float">Parse <i class="fa fa-search my-float"></i></a><table style="display:none;" id="spy-parse-tbl"><thead><tr><th>Name</th><th ${isMobileView ? 'style="display: none;"' : ''}>Level</th><th>Strength</th><th>Defense</th><th>Speed</th><th>Dexterity</th><th>Total</th><th ${isMobileView ? 'style="display: none;"' : ''}>Updated</th></tr></thead><tbody></tbody>`;
    zNode.setAttribute('id', 'spy-parse-container');
    document.body.appendChild(zNode);
    document.getElementById("spy-parse-btn").addEventListener("click", GetSpyResult, false);
    document.getElementById("spy-copy-btn").addEventListener("click", CopySpyResults, false);
 
//     if (location.pathname.startsWith("/jobs.php")) {
//         playerJob = SpyJobs.Army;
//     } else if (location.pathname.startsWith("/companies.php")) {
//         let jobTitleBlock = document.querySelector("#mainContainer > div.content-wrapper > div.company-wrap > div.company-details-wrap > ul.company-stats-list.company-info > li:nth-child(1) > div.details-wrap.t-first.t-first-row");
//         if (jobTitleBlock) {
//             try {
//                 playerJob = SpyJobsMapping[jobTitleBlock.innerText];
//             } catch (error) {
//                 playerJob = SpyJobs.None;
//             }
//         }
//     } else {
//         playerJob = SpyJobs.None;
//     }
    console.log("Player job: %s", playerJob);
    if (spyReports == undefined) {
        spyReports = {};
    }
 
    function CopySpyResults(zEvent) {
        zEvent.preventDefault();
        let copyBtn = zEvent.target;
        let copyBtnHtml = copyBtn.innerHTML;
        const spyReportTemplate = (x) =>
`
Name: ${x.Name}
Level: ${x.Level}
You managed to get the following results:
Strength: ${x.StrengthPrettified}
Speed: ${x.SpeedPrettified}
Dexterity: ${x.DexterityPrettified}
Defense: ${x.DefensePrettified}
Total: ${x.TotalPrettified}
`;
        let spyReportsResult = "";
        for (let key in spyReports) {
            spyReportsResult += spyReportTemplate(spyReports[key]);
        }
        if (Object.entries(spyReports).length > 0) {
            navigator.clipboard.writeText(spyReportsResult)
                .then(function () {
                copyBtn.innerHTML = 'Copied! <i class="fa fa-copy my-float"></i>';
            }, function () {
                copyBtn.innerHTML = 'Failed! <i class="fa fa-copy my-float"></i>';
            });
        } else {
            copyBtn.innerHTML = 'Empty! <i class="fa fa-copy my-float"></i>';
        }
        setTimeout(() => {
            copyBtn.innerHTML = copyBtnHtml;
        }, 1000);
    }
 
    function GetSpyResult(zEvent) {
        console.log('playerJob', playerJob);
        zEvent.preventDefault();
        let parseBtn = zEvent.target;
        let parseBtnHtml = parseBtn.innerHTML;
        try {
            let spyProfile = GetSpyProfile();
            AddSpyProfile(spyProfile);
            parseBtn.innerHTML = 'Parsed! <i class="fa fa-search my-float"></i>';
            let spyTable = document.querySelector("#spy-parse-tbl");
            spyTable.style.display = 'block';
        } catch (error) {
            console.error(error);
            parseBtn.innerHTML = 'Failed! <i class="fa fa-search my-float"></i>';
        }
        setTimeout(() => {
            parseBtn.innerHTML = parseBtnHtml;
        }, 1000);
    }
 
    function GetSpyProfile() {
        console.log('get spy profile begin');
        let jobSpecialBlock, userLink, levelSpan;
        switch (playerJob) {
            default:
            case SpyJobs.Army:
                jobSpecialBlock = document.getElementsByName("jobspecial")[0];
                userLink = jobSpecialBlock.querySelector("div > div:nth-child(3) > div > span.desc > a");
                levelSpan = jobSpecialBlock.querySelector("div > div:nth-child(3) > div:nth-child(2) > span.desc");
                break;
            case SpyJobs.LawFirm:
            case SpyJobs.TelevisionNetwork:
                console.log('jobSpecialBlock1', document.getElementsByClassName("specials-cont-wrap")[0]);
                console.log('jobSpecialBlock2', document.getElementsByClassName("specials-cont-wrap")[0].querySelector("div.specials-confirm-cont"));
                jobSpecialBlock = document.getElementsByClassName("specials-cont-wrap")[0].querySelector("div.specials-confirm-cont");
                console.log('userLink', jobSpecialBlock.querySelector("div > div:nth-child(2) > div > span.desc > a"));
                userLink = jobSpecialBlock.querySelector("div > div:nth-child(2) > div > span.desc > a");
                console.log('levelSpan', jobSpecialBlock.querySelector("div > div:nth-child(2) > div:nth-child(2) > span.desc"));
                levelSpan = jobSpecialBlock.querySelector("div > div:nth-child(2) > div:nth-child(2) > span.desc");
                break;
        }
        console.log('constructing spy profile');
 
        let id = Number(userLink.href.substr(userLink.href.search("XID=") + 4));
        let name = userLink.innerText;
        let level = Number(levelSpan.innerText);
        let strength = 0;
        let defense = 0;
        let speed = 0;
        let dexterity = 0;
        let total = 0;
        if (playerJob == SpyJobs.TelevisionNetwork || playerJob == SpyJobs.LawFirm) {
            let statOffset = playerJob == SpyJobs.TelevisionNetwork ? 1 : 0;
            let statsBlock = jobSpecialBlock.querySelector("div > ul");
            strength = Number(statsBlock.children[0 + statOffset].innerText.substr(10).replaceAll(',', ''));
            if (isNaN(strength)) strength = 0;
            defense = Number(statsBlock.children[3 + statOffset].innerText.substr(9).replaceAll(',', ''));
            if (isNaN(defense)) defense = 0;
            speed = Number(statsBlock.children[1 + statOffset].innerText.substr(7).replaceAll(',', ''));
            if (isNaN(speed)) speed = 0;
            dexterity = Number(statsBlock.children[2 + statOffset].innerText.substr(11).replaceAll(',', ''));
            if (isNaN(dexterity)) dexterity = 0;
            total = Number(statsBlock.children[4 + statOffset].innerText.substr(7).replaceAll(',', ''));
            if (isNaN(total)) total = 0;
        } else if (playerJob == SpyJobs.Army) {
            let statsBlock = jobSpecialBlock.querySelector("div.specials-confirm-cont > div:nth-child(5) > ul");
            let strengthBlock = statsBlock.querySelector("li.left.t-c-border");
            if (strengthBlock.innerText.search("Strength:") > -1) {
                strength = Number(strengthBlock.getElementsByClassName('desc')[0].innerText.replaceAll(',', ''));
                if (isNaN(strength)) strength = 0;
            }
            let defenseBlock = statsBlock.querySelector("li.left.t-r-border");
            if (defenseBlock.innerText.search("Defense:") > -1) {
                defense = Number(defenseBlock.getElementsByClassName('desc')[0].innerText.replaceAll(',', ''));
                if (isNaN(defense)) defense = 0;
            }
            let speedBlock = statsBlock.querySelector("li.left.t-l-border");
            if (speedBlock.innerText.search("Speed:") > -1) {
                speed = Number(speedBlock.getElementsByClassName('desc')[0].innerText.replaceAll(',', ''));
                if (isNaN(speed)) speed = 0;
            }
            let dexterityBlock = statsBlock.querySelector("li.left.b-l-border");
            if (dexterityBlock.innerText.search("Dexterity:") > -1) {
                dexterity = Number(dexterityBlock.getElementsByClassName('desc')[0].innerText.replaceAll(',', ''));
                if (isNaN(dexterity)) dexterity = 0;
            }
            let totalBlock = statsBlock.querySelector("li.left.b-c-border");
            if (totalBlock.innerText.search("Total:") > -1) {
                total = Number(totalBlock.getElementsByClassName('desc')[0].innerText.replaceAll(',', ''));
                if (isNaN(total)) total = 0;
            }
        }
        console.log('get spy profile end');
 
        return new SpyReport(id, name, level, strength, defense, speed, dexterity, total, new Date());
    }
 
    function AddSpyProfile(spyProfile) {
        console.log('add spy profile begin');
        const profileTemplate = (x) => `<td data-name>${x.Name}</td><td style="${isMobileView ? "display: none;" : ''}" data-level=${x.Level}>${x.Level}</td><td data-strength=${x.Strength}>${x.StrengthPrettified}</td><td data-defense=${x.Defense}>${x.DefensePrettified}</td><td data-speed=${x.Speed}>${x.SpeedPrettified}</td><td data-dexterity=${x.Dexterity}>${x.DexterityPrettified}</td><td data-total=${x.Total}>${x.TotalPrettified}</td><td style="${isMobileView ? "display: none;" : ''}" data-updated=${x.UpdatedTimeStamp}>${x.UpdatedDate}</td>`;
 
        let spyTableBody = document.querySelector('#spy-parse-tbl tbody');
        let userRow = spyTableBody.querySelector(`tr[data-id="${spyProfile.Id}"]`);
        if (userRow == null) {
            let userNode = document.createElement('tr');
            userNode.innerHTML = profileTemplate(spyProfile);
            userNode.setAttribute('data-id', spyProfile.Id);
            spyTableBody.appendChild(userNode);
            FlashElement(userNode);
        } else {
            let level = userRow.querySelector('td[data-level]');
            let strength = userRow.querySelector('td[data-strength]');
            let defense = userRow.querySelector('td[data-defense]');
            let speed = userRow.querySelector('td[data-speed]');
            let dexterity = userRow.querySelector('td[data-dexterity]');
            let total = userRow.querySelector('td[data-total]');
            let updated = userRow.querySelector('td[data-updated]');
 
            let existingSpyProfile = spyReports[spyProfile.Id];
            if (spyProfile.Strength < existingSpyProfile.Strength) spyProfile.Strength = existingSpyProfile.Strength;
            if (spyProfile.Defense < existingSpyProfile.Defense) spyProfile.Defense = existingSpyProfile.Defense;
            if (spyProfile.Speed < existingSpyProfile.Speed) spyProfile.Speed = existingSpyProfile.Speed;
            if (spyProfile.Dexterity < existingSpyProfile.Dexterity) spyProfile.Dexterity = existingSpyProfile.Dexterity;
            if (spyProfile.Total < existingSpyProfile.Total) spyProfile.Total = existingSpyProfile.Total;
            spyProfile.calculateStats();
 
            if (Number(level.getAttribute('data-level')) !== spyProfile.Level) {
                level.setAttribute('data-level', spyProfile.Level);
                level.innerText = spyProfile.Level;
                FlashElement(level);
            }
            if (Number(strength.getAttribute('data-strength')) !== spyProfile.Strength) {
                strength.setAttribute('data-strength', spyProfile.Strength);
                strength.innerText = spyProfile.StrengthPrettified;
                FlashElement(strength);
            }
            if (Number(defense.getAttribute('data-defense')) !== spyProfile.Defense) {
                defense.setAttribute('data-defense', spyProfile.Defense);
                defense.innerText = spyProfile.DefensePrettified;
                FlashElement(defense);
            }
            if (Number(speed.getAttribute('data-speed')) !== spyProfile.Speed) {
                speed.setAttribute('data-speed', spyProfile.Speed);
                speed.innerText = spyProfile.SpeedPrettified;
                FlashElement(speed);
            }
            if (Number(dexterity.getAttribute('data-dexterity')) !== spyProfile.Dexterity) {
                dexterity.setAttribute('data-dexterity', spyProfile.Dexterity);
                dexterity.innerText = spyProfile.DexterityPrettified;
                FlashElement(dexterity);
            }
            if (Number(total.getAttribute('data-total')) !== spyProfile.Total) {
                total.setAttribute('data-total', spyProfile.Total);
                total.innerText = spyProfile.TotalPrettified;
                FlashElement(total);
            }
            if (updated.getAttribute('data-updated') !== spyProfile.UpdatedTimeStamp) {
                updated.setAttribute('data-updated', spyProfile.UpdatedTimeStamp);
                updated.innerText = spyProfile.UpdatedDate;
                FlashElement(updated);
            }
        }
        localStorage.setItem(`spy-parse-${spyProfile.Id}`, JSON.stringify(spyProfile));
        spyReports[spyProfile.Id] = spyProfile;
        console.log('get spy profile end');
    }
 
    function FlashElement(element) {
        let previousBackgroundColor = element.style.backgroundColor;
        setTimeout(() => {
            element.style.backgroundColor = "green";
        }, 10);
        setTimeout(() => {
            element.style.backgroundColor = previousBackgroundColor;
        }, 400);
    }
 
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
 
    class SpyReport {
        Id = 0;
        Name = '';
        Level = 0;
        Strength = 0;
 
        get StrengthPrettified() {
            return this.Strength.toLocaleString('EN');
        }
 
        Defense = 0;
 
        get DefensePrettified() {
            return this.Defense.toLocaleString('EN');
        }
 
        Speed = 0;
 
        get SpeedPrettified() {
            return this.Speed.toLocaleString('EN');
        }
 
        Dexterity = 0;
 
        get DexterityPrettified() {
            return this.Dexterity.toLocaleString('EN');
        }
 
        Total = 0;
 
        get TotalPrettified() {
            return this.Total.toLocaleString('EN');
        }
 
        UpdatedTimeStamp = new Date(0);
 
        get UpdatedDate() {
            return this.UpdatedTimeStamp.toLocaleDateString('RU');
        }
 
        constructor(id, name, level, strength, defense, speed, dexterity, total, updated) {
            this.Id = id;
            this.Name = name;
            this.Level = level;
            this.Strength = strength;
            this.Defense = defense;
            this.Speed = speed;
            this.Dexterity = dexterity;
            this.Total = total;
            this.UpdatedTimeStamp = updated;
            this.calculateStats();
        }
 
        calculateStats() {
            let statsKnown = Number(this.Strength > 0) + Number(this.Defense > 0) + Number(this.Speed > 0) + Number(this.Dexterity > 0) + Number(this.Total > 0);
            if (statsKnown === 4) {
                if (Number(this.Strength === 0)) this.Strength = this.Total - this.Defense - this.Speed - this.Dexterity;
                if (Number(this.Defense === 0)) this.Defense = this.Total - this.Strength - this.Speed - this.Dexterity;
                if (Number(this.Speed === 0)) this.Speed = this.Total - this.Strength - this.Defense - this.Dexterity;
                if (Number(this.Dexterity === 0)) this.Dexterity = this.Total - this.Strength - this.Defense - this.Speed;
                if (Number(this.Total === 0)) this.Total = this.Strength + this.Defense + this.Speed + this.Dexterity;
            }
        }
    }
})();
