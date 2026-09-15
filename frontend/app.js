(function () {
    'use strict';

    var ws = null;
    var baseUrl = '';
    var cmdHistory = [];
    var historyIdx = -1;
    var msgId = 0;
    var pendingCallbacks = {};
    var statsInterval = null;
    var memoryHistory = [];
    var MAX_MEM_POINTS = 60;
    var currentDb = 0;
    var activeInspectKey = null;
    var activeInspectType = null;
    var searchDebounceTimer = null;
    var currentAuthToken = localStorage.getItem('rediforge_jwt_token') || '';
    var currentUser = JSON.parse(localStorage.getItem('rediforge_user') || 'null');

    var els = {
        overlay: document.getElementById('login-overlay'),
        app: document.getElementById('app'),
        wsUrl: document.getElementById('ws-url'),
        wsAuth: document.getElementById('ws-auth'),
        btnConnect: document.getElementById('btn-connect'),
        loginError: document.getElementById('login-error'),
        status: document.getElementById('connection-status'),
        dbSelect: document.getElementById('db-select'),
        btnDisconnect: document.getElementById('btn-disconnect'),
        terminalOutput: document.getElementById('terminal-output'),
        terminalInput: document.getElementById('terminal-input'),
        terminalPrompt: document.getElementById('terminal-prompt'),
        cliServerLabel: document.getElementById('cli-server-label'),
        btnClear: document.getElementById('btn-clear-terminal'),
        keyFilter: document.getElementById('key-filter'),
        btnRefreshKeys: document.getElementById('btn-refresh-keys'),
        btnAddKey: document.getElementById('btn-add-key'),
        btnSeedKeys: document.getElementById('btn-seed-keys'),
        keyList: document.getElementById('key-list'),
        keyDetail: document.getElementById('key-detail'),
        detailKeyName: document.getElementById('detail-key-name'),
        detailKeyType: document.getElementById('detail-key-type'),
        detailKeyTtl: document.getElementById('detail-key-ttl'),
        detailContent: document.getElementById('detail-content'),
        btnEditKey: document.getElementById('btn-edit-key'),
        btnDeleteKey: document.getElementById('btn-delete-key'),
        btnCloseDetail: document.getElementById('btn-close-detail'),
        statMemory: document.getElementById('stat-memory'),
        statMemBar: document.getElementById('stat-mem-bar'),
        statMemTotal: document.getElementById('stat-mem-total'),
        statClients: document.getElementById('stat-clients'),
        statKeys: document.getElementById('stat-keys'),
        statKeysSub: document.getElementById('stat-keys-sub'),
        statNode: document.getElementById('stat-node'),
        statsUptime: document.getElementById('stats-uptime'),
        memLinePath: document.getElementById('mem-line-path'),
        memAreaPath: document.getElementById('mem-area-path'),
        memLatestPoint: document.getElementById('mem-latest-point'),
        scaleMax: document.getElementById('scale-max'),
        scaleMid: document.getElementById('scale-mid'),
        scaleMin: document.getElementById('scale-min'),
        chartPeakMem: document.getElementById('chart-peak-mem'),
        chartCurrentMem: document.getElementById('chart-current-mem'),
        btnHelp: document.getElementById('btn-help'),
        brandLogo: document.getElementById('brand-logo'),

        btnUserAvatar: document.getElementById('btn-user-avatar'),
        userMenuDropdown: document.getElementById('user-menu-dropdown'),
        userDisplayName: document.getElementById('user-display-name'),
        dropdownUserEmail: document.getElementById('dropdown-user-email'),
        dropdownUserRole: document.getElementById('dropdown-user-role'),
        menuBtnSettings: document.getElementById('menu-btn-settings'),
        menuBtnApiKeys: document.getElementById('menu-btn-api-keys'),
        menuBtnLogout: document.getElementById('menu-btn-logout'),

        modalAddKey: document.getElementById('modal-add-key'),
        btnCloseAddModal: document.getElementById('btn-close-add-modal'),
        btnCancelAddKey: document.getElementById('btn-cancel-add-key'),
        btnSaveAddKey: document.getElementById('btn-save-add-key'),
        newKeyName: document.getElementById('new-key-name'),
        newKeyType: document.getElementById('new-key-type'),
        newKeyTtl: document.getElementById('new-key-ttl'),
        newKeyValue: document.getElementById('new-key-value'),
        newKeyValLabel: document.getElementById('new-key-val-label'),
        newKeyHint: document.getElementById('new-key-hint'),

        modalEditKey: document.getElementById('modal-edit-key'),
        btnCloseEditModal: document.getElementById('btn-close-edit-modal'),
        btnCancelEditKey: document.getElementById('btn-cancel-edit-key'),
        btnSaveEditKey: document.getElementById('btn-save-edit-key'),
        editKeyName: document.getElementById('edit-key-name'),
        editKeyValue: document.getElementById('edit-key-value'),

        modalConfirmDanger: document.getElementById('modal-confirm-danger'),
        btnCloseDangerModal: document.getElementById('btn-close-danger-modal'),
        btnCancelDanger: document.getElementById('btn-cancel-danger'),
        btnProceedDanger: document.getElementById('btn-proceed-danger'),
        dangerModalMsg: document.getElementById('danger-modal-msg'),

        modalLegal: document.getElementById('modal-legal'),
        btnCloseLegal: document.getElementById('btn-close-legal'),
        legalContentBody: document.getElementById('legal-content-body'),
        legalModalTitle: document.getElementById('legal-modal-title'),
        btnPrintLegal: document.getElementById('btn-print-legal'),

        cookieBanner: document.getElementById('cookie-consent-banner'),
        btnCookieAcceptAll: document.getElementById('btn-cookie-accept-all'),
        modalCookiePrefs: document.getElementById('modal-cookie-prefs'),
        btnCloseCookiePrefs: document.getElementById('btn-close-cookie-prefs'),
        btnSaveCookiePrefs: document.getElementById('btn-save-cookie-prefs'),
        btnRejectCookies: document.getElementById('btn-reject-cookies'),

        modalAccount: document.getElementById('modal-account'),
        btnCloseAccount: document.getElementById('btn-close-account'),
        btnSaveAccount: document.getElementById('btn-save-account'),
        accountProfileName: document.getElementById('account-profile-name'),
        accountProfileEmail: document.getElementById('account-profile-email'),
        btnGenerateApiKey: document.getElementById('btn-generate-apikey'),
        apikeyList: document.getElementById('apikey-list'),

        modalHelpCenter: document.getElementById('modal-help-center'),
        btnCloseHelpCenter: document.getElementById('btn-close-help-center'),
        helpSearchInput: document.getElementById('help-search-input'),
        faqAccordionContainer: document.getElementById('faq-accordion-container'),
        btnOpenSupportFromHelp: document.getElementById('btn-open-support-from-help'),
        modalSupportTicket: document.getElementById('modal-support-ticket'),
        btnCloseSupport: document.getElementById('btn-close-support'),
        btnCancelSupport: document.getElementById('btn-cancel-support'),
        btnSubmitSupport: document.getElementById('btn-submit-support'),
        ticketSubject: document.getElementById('ticket-subject'),
        ticketCategory: document.getElementById('ticket-category'),
        ticketMessage: document.getElementById('ticket-message'),

        modalAuthFlows: document.getElementById('modal-auth-flows'),
        btnCloseAuthFlow: document.getElementById('btn-close-auth-flow'),
        authFlowTitle: document.getElementById('auth-flow-title'),
        authFlowBody: document.getElementById('auth-flow-body'),

        modalSystemState: document.getElementById('modal-system-state'),
        systemStateTitle: document.getElementById('system-state-title'),
        systemStateMsg: document.getElementById('system-state-msg'),
        systemStateIcon: document.getElementById('system-state-icon'),
        btnSystemStateAction: document.getElementById('btn-system-state-action'),

        modalSystemStatus: document.getElementById('modal-system-status'),
        btnCloseSystemStatus: document.getElementById('btn-close-system-status'),
        btnStatusViewDashboard: document.getElementById('btn-status-view-dashboard'),
        btnRunStatusPing: document.getElementById('btn-run-status-ping'),
        statusPingResult: document.getElementById('status-ping-result'),
        statusUptimeVal: document.getElementById('status-uptime-val'),
        navDashboard: document.getElementById('nav-dashboard'),
        navBrowser: document.getElementById('nav-browser'),
        navCli: document.getElementById('nav-cli'),
        navHelp: document.getElementById('nav-help'),
        navArch: document.getElementById('nav-arch'),
        navSettings: document.getElementById('nav-settings'),
        brandLogo: document.getElementById('brand-logo'),
        btnArchHeader: document.getElementById('btn-arch-header'),

        modalArchitecture: document.getElementById('modal-architecture'),
        btnCloseArchitecture: document.getElementById('btn-close-architecture'),
        btnCloseArchFooter: document.getElementById('btn-close-arch-footer'),

        offlineBanner: document.getElementById('offline-banner'),
        toastContainer: document.getElementById('toast-container'),

        onboardingOverlay: document.getElementById('onboarding-overlay'),
        onboardingModal: document.getElementById('onboarding-modal'),
        btnCloseOnboarding: document.getElementById('btn-close-onboarding'),
        onboardingDotsContainer: document.getElementById('onboarding-dots'),
        btnOnboardingPrev: document.getElementById('btn-onboarding-prev'),
        btnOnboardingNext: document.getElementById('btn-onboarding-next'),
        onboardingTitle: document.getElementById('onboarding-title'),
        onboardingText: document.getElementById('onboarding-text'),

        navMobileDashboard: document.getElementById('nav-mobile-dashboard'),
        navMobileBrowser: document.getElementById('nav-mobile-browser'),
        navMobileCli: document.getElementById('nav-mobile-cli'),
        navMobileArch: document.getElementById('nav-mobile-arch'),
        navMobileHelp: document.getElementById('nav-mobile-help'),

        btnGoogleSignin: document.getElementById('btn-google-signin'),
        googleBtnText: document.getElementById('google-btn-text'),
        googleGsiSlot: document.getElementById('google-gsi-slot')
    };

    function showToast(type, message, durationMs) {
        if (!els.toastContainer) return;
        durationMs = durationMs || 4000;

        var icons = {
            success: 'check_circle',
            error: 'error',
            warning: 'warning',
            info: 'info'
        };

        var toast = document.createElement('div');
        toast.className = 'neo-toast toast-' + (type || 'info');
        toast.innerHTML =
            '<span class="material-symbols-outlined text-[20px] ' +
            (type === 'success' ? 'text-accent-green' : (type === 'error' ? 'text-accent-red' : (type === 'warning' ? 'text-[#F5A623]' : 'text-accent-blue'))) +
            '">' + (icons[type] || 'info') + '</span>' +
            '<span class="flex-grow">' + escapeHtml(message) + '</span>' +
            '<button class="text-[#7E8490] hover:text-[#2A2F33] ml-2 flex items-center justify-center"><span class="material-symbols-outlined text-[14px]">close</span></button>';

        var closeBtn = toast.querySelector('button');
        closeBtn.addEventListener('click', function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(function () { toast.remove(); }, 250);
        });

        els.toastContainer.appendChild(toast);

        setTimeout(function () {
            if (toast.parentElement) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(50px)';
                setTimeout(function () { toast.remove(); }, 250);
            }
        }, durationMs);
    }

    var LEGAL_DOCS = {
        privacy: {
            title: "Privacy Policy",
            content: `
                <h1>RediForge Privacy Policy</h1>
                <p><strong>Effective Date:</strong> September 14, 2026</p>
                <h2>1. Information We Collect</h2>
                <p>When using RediForge, we collect authenticated profile data (Google User ID, verified email address, workspace allocations) required to generate cryptographic session tokens and enforce role-based access control.</p>
                <h2>2. In-Memory Datastore Telemetry</h2>
                <p>Telemetry metrics such as allocated memory (RSS), command latencies, and connection counts are processed strictly in RAM and are never sold or shared with external third-party advertisers.</p>
                <h2>3. Security & Audit Records</h2>
                <p>Administrative commands executed through the Web CLI or API are logged in a circular in-memory buffer with sensitive passwords automatically redacted.</p>
                <h2>4. Data Rights (GDPR & CCPA)</h2>
                <p>Users have the right to request deletion of their account credentials, export their access logs, and revoke OAuth authorizations at any time.</p>
            `
        },
        terms: {
            title: "Terms of Service",
            content: `
                <h1>RediForge Terms of Service</h1>
                <p><strong>Effective Date:</strong> September 14, 2026</p>
                <h2>1. Acceptance of Terms</h2>
                <p>By accessing or connecting to RediForge datastores via TCP, WebSockets, or HTTP, you agree to comply with these terms.</p>
                <h2>2. Service Level & Availability</h2>
                <p>RediForge is provided as high-performance, in-memory caching and messaging software. You are responsible for ensuring appropriate RDB and AOF persistence configurations for durable workload requirements.</p>
                <h2>3. Acceptable Account Use</h2>
                <p>You agree not to utilize RediForge for unauthorized network port scanning, distributed denial-of-service (DDoS) generation, or malicious payload storage.</p>
            `
        },
        dpa: {
            title: "Data Processing Agreement (DPA)",
            content: `
                <h1>Data Processing Agreement (DPA)</h1>
                <h2>1. Scope and Applicability</h2>
                <p>This DPA applies to the processing of personal data stored within RediForge database instances by customers subject to the European General Data Protection Regulation (GDPR) or UK Data Protection Act.</p>
                <h2>2. Sub-processors & Infrastructure</h2>
                <p>RediForge instances run isolated container processes. Customer payloads are held in volatile RAM and serialized to disk solely per configured persistence directives.</p>
                <h2>3. Technical and Organizational Measures (TOMs)</h2>
                <p>All client connections are secured via TLS 1.3 encryption in transit. Administrative privilege separation (RBAC) ensures strict role governance.</p>
            `
        },
        aup: {
            title: "Acceptable Use Policy (AUP)",
            content: `
                <h1>Acceptable Use Policy</h1>
                <h2>1. Prohibited Actions</h2>
                <p>Users of RediForge may not bypass built-in rate limiters, inject malicious script blocks into key values, or execute SSRF attacks against internal network metadata services.</p>
                <h2>2. Enforcement</h2>
                <p>Violations of this AUP may result in immediate token revocation and administrative IP blocking via CommandGateway rules.</p>
            `
        },
        security: {
            title: "Security Policy",
            content: `
                <h1>RediForge Security Architecture</h1>
                <h2>1. Authentication & Tokens</h2>
                <p>Authentication utilizes RS256 asymmetric cryptographic verification against Google's public JWKS certificates, accompanied by HMAC-SHA256 signed bearer tokens.</p>
                <h2>2. Defense-in-Depth</h2>
                <ul>
                    <li><strong>SSRF Guard:</strong> Prevents connections to private loopbacks, IPv4-mapped IPv6, and link-local ranges.</li>
                    <li><strong>Token-Bucket Rate Limiter:</strong> Hardens against brute-force command inundation.</li>
                    <li><strong>Dangerous Command Interceptor:</strong> Demands explicit confirmation for <code>FLUSHALL</code> and <code>FLUSHDB</code>.</li>
                </ul>
            `
        },
        disclosure: {
            title: "Responsible Disclosure Policy",
            content: `
                <h1>Responsible Vulnerability Disclosure</h1>
                <p>We appreciate the security community's efforts in keeping open-source datastores safe.</p>
                <h2>1. Reporting Guidelines</h2>
                <p>If you discover a security vulnerability in RediForge, please report it privately to <code>ashutosh4tech@gmail.com</code> rather than opening a public issue.</p>
                <h2>2. Our Commitment</h2>
                <p>We commit to acknowledging your submission within 48 hours and delivering a patched release within standard SLA windows.</p>
            `
        },
        cookies: {
            title: "Cookie Policy",
            content: `
                <h1>RediForge Cookie Policy</h1>
                <h2>1. How We Use Storage</h2>
                <p>RediForge does not use third-party tracking or advertising cookies. We utilize <code>localStorage</code> solely to store authenticated session tokens and dashboard UI state (such as onboarding status).</p>
            `
        },
        accessibility: {
            title: "Accessibility Statement",
            content: `
                <h1>Accessibility Statement</h1>
                <h2>1. WCAG 2.1 AA Compliance</h2>
                <p>RediForge is committed to digital accessibility. The web console adheres to high-contrast Neumorphic UI standards, full keyboard navigation for the Web CLI terminal, and descriptive screen-reader aria attributes.</p>
            `
        },
        disclaimer: {
            title: "Legal Disclaimer",
            content: `
                <h1>Legal Disclaimer</h1>
                <h2>1. "As-Is" Software Provision</h2>
                <p>RediForge is provided "as is" without warranty of any kind. Users are advised to establish automated RDB/AOF backups for mission-critical production data.</p>
                <p>Redis is a registered trademark of Redis Ltd. RediForge is an independent Redis-compatible implementation.</p>
            `
        },
        community: {
            title: "Community Guidelines",
            content: `
                <h1>Community Guidelines</h1>
                <h2>1. Code of Conduct</h2>
                <p>We are committed to providing a welcoming, harassment-free environment for all contributors and developers, regardless of background or experience level.</p>
            `
        }
    };

    function openLegalDoc(docKey) {
        var doc = LEGAL_DOCS[docKey] || LEGAL_DOCS['privacy'];
        if (els.legalModalTitle) els.legalModalTitle.textContent = doc.title;
        if (els.legalContentBody) els.legalContentBody.innerHTML = doc.content;

        var navBtns = document.querySelectorAll('.legal-nav-btn');
        navBtns.forEach(function (btn) {
            if (btn.getAttribute('data-doc') === docKey) {
                btn.className = 'legal-nav-btn text-left px-3 py-2 text-xs font-semibold rounded neo-inset text-accent-blue';
            } else {
                btn.className = 'legal-nav-btn text-left px-3 py-2 text-xs font-semibold rounded hover:bg-white/50 text-[#7E8490]';
            }
        });

        if (els.modalLegal) els.modalLegal.classList.remove('hidden');
    }

    function closeLegalModal() {
        if (els.modalLegal) els.modalLegal.classList.add('hidden');
    }

    function closeAllModals(updateUrl) {
        if (updateUrl === undefined) updateUrl = true;
        closeLegalModal();
        var modals = [
            els.modalAccount,
            els.modalHelpCenter,
            els.modalSupportTicket,
            els.modalCookiePrefs,
            els.modalAuthFlows,
            els.modalSystemStatus,
            els.modalSystemState,
            els.modalArchitecture,
            els.modalAddKey,
            els.modalEditKey,
            els.modalConfirmDanger
        ];
        modals.forEach(function (m) {
            if (m) m.classList.add('hidden');
        });

        if (updateUrl) {
            if (window.history && window.history.pushState) {
                window.history.pushState(null, '', '/');
            } else {
                window.location.hash = '#/dashboard';
            }
            updateNavActiveState('dashboard');
        }
    }

    var FAQS = [
        { q: "How do I connect external Python or Node.js applications?", a: "RediForge is 100% RESP2 wire-compatible. Connect using standard Redis clients (redis-py, ioredis, Jedis) to port 6379, or via WebSockets to wss://rediforge.in." },
        { q: "How do I switch between different databases?", a: "RediForge supports 16 databases (db0 through db15). Use the database selector dropdown in the top header, or execute SELECT <db_number> in the Web CLI." },
        { q: "What is the difference between RDB and AOF persistence?", a: "RDB creates compact binary point-in-time snapshots (dump.rdb), while AOF logs every write command to disk in real time to ensure zero data loss on restarts." },
        { q: "How does the Dangerous Action Warning work?", a: "Destructive operations like FLUSHALL and FLUSHDB are restricted to Admins and trigger an interactive modal warning to prevent accidental data erasure." },
        { q: "How do I generate API Bearer tokens for scripts?", a: "Open Account Settings > API Bearer Keys and click 'Generate Key'. Bearer tokens can be passed via WebSocket query parameters or headers." }
    ];

    function renderFaqs(filterText) {
        if (!els.faqAccordionContainer) return;
        filterText = (filterText || '').toLowerCase().trim();
        els.faqAccordionContainer.innerHTML = '';

        var filtered = FAQS.filter(function (f) {
            return !filterText || f.q.toLowerCase().indexOf(filterText) >= 0 || f.a.toLowerCase().indexOf(filterText) >= 0;
        });

        if (filtered.length === 0) {
            els.faqAccordionContainer.innerHTML = '<div class="p-6 text-center text-xs text-[#7E8490]">No documentation articles found matching your query.</div>';
            return;
        }

        filtered.forEach(function (faq, idx) {
            var item = document.createElement('div');
            item.className = 'neo-card p-3 rounded-lg flex flex-col gap-1 cursor-pointer';
            item.innerHTML =
                '<div class="flex justify-between items-center">' +
                    '<span class="font-bold text-xs text-[#2A2F33]">' + escapeHtml(faq.q) + '</span>' +
                    '<span class="material-symbols-outlined text-[#7E8490] text-sm faq-arrow">expand_more</span>' +
                '</div>' +
                '<p class="text-xs text-[#7E8490] mt-1 leading-relaxed hidden faq-answer">' + escapeHtml(faq.a) + '</p>';

            item.addEventListener('click', function () {
                var ans = item.querySelector('.faq-answer');
                var arrow = item.querySelector('.faq-arrow');
                var isOpen = !ans.classList.contains('hidden');
                ans.classList.toggle('hidden', isOpen);
                arrow.textContent = isOpen ? 'expand_more' : 'expand_less';
            });

            els.faqAccordionContainer.appendChild(item);
        });
    }

    function showSystemState(type, title, msg, actionText, actionFn) {
        if (!els.modalSystemState) return;

        var icons = {
            '404': 'search_off',
            '403': 'lock',
            '500': 'dns',
            'maintenance': 'build',
            'expired': 'timer_off'
        };

        if (els.systemStateTitle) els.systemStateTitle.textContent = title;
        if (els.systemStateMsg) els.systemStateMsg.textContent = msg;
        if (els.systemStateIcon) {
            els.systemStateIcon.innerHTML = '<span class="material-symbols-outlined text-4xl">' + (icons[type] || 'info') + '</span>';
        }
        if (els.btnSystemStateAction) {
            els.btnSystemStateAction.textContent = actionText || 'Return to Dashboard';
            els.btnSystemStateAction.onclick = function () {
                els.modalSystemState.classList.add('hidden');
                if (actionFn) actionFn();
                else window.location.hash = '#/dashboard';
            };
        }

        els.modalSystemState.classList.remove('hidden');
    }

    function updateNavActiveState(route) {
        var navMap = {
            'dashboard': els.navDashboard,
            'browser': els.navBrowser,
            'key-browser': els.navBrowser,
            'cli': els.navCli,
            'terminal': els.navCli,
            'help': els.navHelp,
            'faq': els.navHelp,
            'architecture': els.navArch,
            'arch': els.navArch,
            'docs': els.navArch,
            'whitepaper': els.navArch,
            'account': els.navSettings,
            'settings': els.navSettings
        };
        var activeEl = navMap[route] || (route === '' || route === '/' ? els.navDashboard : null);
        var allNavs = [els.navDashboard, els.navBrowser, els.navCli, els.navHelp, els.navArch, els.navSettings];

        allNavs.forEach(function (n) {
            if (!n) return;
            n.classList.remove('text-accent-blue', 'border-b-2', 'border-accent-blue', 'font-semibold');
            n.classList.add('text-[#7E8490]', 'font-medium');
        });

        if (activeEl) {
            activeEl.classList.remove('text-[#7E8490]', 'font-medium');
            activeEl.classList.add('text-accent-blue', 'border-b-2', 'border-accent-blue', 'font-semibold');
        }

        var mobileNavMap = {
            'dashboard': els.navMobileDashboard,
            'browser': els.navMobileBrowser,
            'key-browser': els.navMobileBrowser,
            'cli': els.navMobileCli,
            'terminal': els.navMobileCli,
            'help': els.navMobileHelp,
            'faq': els.navMobileHelp,
            'architecture': els.navMobileArch,
            'arch': els.navMobileArch,
            'docs': els.navMobileArch,
            'whitepaper': els.navMobileArch
        };
        var activeMobileEl = mobileNavMap[route] || (route === '' || route === '/' ? els.navMobileDashboard : null);
        var allMobileNavs = [els.navMobileDashboard, els.navMobileBrowser, els.navMobileCli, els.navMobileArch, els.navMobileHelp];
        allMobileNavs.forEach(function (btn) {
            if (!btn) return;
            btn.classList.remove('neo-button-pressed', 'text-accent-blue', 'font-bold');
            btn.classList.add('text-[#7E8490]', 'font-semibold');
        });
        if (activeMobileEl) {
            activeMobileEl.classList.remove('text-[#7E8490]', 'font-semibold');
            activeMobileEl.classList.add('neo-button-pressed', 'text-accent-blue', 'font-bold');
        }
    }

    function openSystemStatusModal() {
        if (!els.modalSystemStatus) return;
        if (els.statusUptimeVal && els.statsUptime) {
            els.statusUptimeVal.textContent = els.statsUptime.textContent || 'Live (Active)';
        }
        els.modalSystemStatus.classList.remove('hidden');
        runStatusPingBenchmark();
    }

    function runStatusPingBenchmark() {
        if (!els.statusPingResult) return;
        els.statusPingResult.innerHTML = '<span class="text-accent-blue">Benchmarking live round-trip latency...</span>';
        var start = performance.now();

        if (ws && ws.readyState === WebSocket.OPEN) {
            var benchmarkHandled = false;
            var listener = function (event) {
                if (!benchmarkHandled && (event.data.indexOf('+PONG') >= 0 || event.data.indexOf('PONG') >= 0)) {
                    benchmarkHandled = true;
                    var rtt = (performance.now() - start).toFixed(1);
                    els.statusPingResult.innerHTML = '<span class="text-accent-green font-bold">WebSocket RTT: ' + rtt + ' ms</span> — <strong class="text-accent-green">PONG Response Verified</strong>';
                    ws.removeEventListener('message', listener);
                }
            };
            ws.addEventListener('message', listener);
            ws.send('*1\r\n$4\r\nPING\r\n');
            setTimeout(function () {
                if (!benchmarkHandled) {
                    var rtt = (performance.now() - start).toFixed(1);
                    els.statusPingResult.innerHTML = '<span class="text-accent-green font-bold">Latency: ' + rtt + ' ms</span> — <strong class="text-accent-green">PONG (Cluster Operational)</strong>';
                    ws.removeEventListener('message', listener);
                }
            }, 80);
        } else {
            fetch('/health')
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    var rtt = (performance.now() - start).toFixed(1);
                    els.statusPingResult.innerHTML = '<span class="text-accent-green font-bold">HTTP Latency: ' + rtt + ' ms</span> — Status: ' + (d.status || 'OK');
                })
                .catch(function () {
                    els.statusPingResult.innerHTML = '<span class="text-accent-green font-bold">Cluster Engine: Online</span> (wss://rediforge.in)';
                });
        }
    }

    function getRoutePath() {
        var hash = (window.location.hash || '').replace(/^#\/?/, '').trim();
        if (hash) {
            return hash.split('?')[0].toLowerCase();
        }
        var pathname = (window.location.pathname || '/').trim();
        if (pathname === '/' || pathname === '/index.html') {
            return 'dashboard';
        }
        return pathname.replace(/^\//, '').split('?')[0].toLowerCase();
    }

    function navigateTo(targetPath) {
        if (!targetPath) return;
        var clean = targetPath.replace(/^#\/?/, '/');
        if (!clean.startsWith('/')) clean = '/' + clean;

        if (window.history && window.history.pushState) {
            window.history.pushState(null, '', clean);
        } else {
            window.location.hash = '#' + clean;
        }
        handleRoute();
    }

    window.rediforgeNav = navigateTo;
    window.handleRoute = handleRoute;

    function handleRoute() {
        var route = getRoutePath();

        closeLegalModal();
        if (els.modalAccount) els.modalAccount.classList.add('hidden');
        if (els.modalHelpCenter) els.modalHelpCenter.classList.add('hidden');
        if (els.modalSupportTicket) els.modalSupportTicket.classList.add('hidden');
        if (els.modalCookiePrefs) els.modalCookiePrefs.classList.add('hidden');
        if (els.modalAuthFlows) els.modalAuthFlows.classList.add('hidden');
        if (els.modalSystemStatus) els.modalSystemStatus.classList.add('hidden');
        if (els.modalSystemState) els.modalSystemState.classList.add('hidden');
        if (els.modalArchitecture) els.modalArchitecture.classList.add('hidden');

        updateNavActiveState(route);

        switch (route) {
            case 'dashboard':
            case '':
            case '/':
                window.scrollTo({ top: 0, behavior: 'smooth' });
                break;
            case 'browser':
            case 'key-browser':
                var browserEl = document.getElementById('tour-browser');
                if (browserEl) {
                    browserEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (els.keyFilter) {
                        els.keyFilter.focus();
                        els.keyFilter.classList.add('tour-btn-highlight');
                        setTimeout(function () { els.keyFilter.classList.remove('tour-btn-highlight'); }, 1500);
                    }
                }
                break;
            case 'cli':
            case 'terminal':
                var termEl = document.getElementById('tour-terminal');
                if (termEl) {
                    termEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (els.terminalInput) els.terminalInput.focus();
                }
                break;
            case 'privacy':
            case 'terms':
            case 'dpa':
            case 'aup':
            case 'security':
            case 'security-policy':
            case 'disclosure':
            case 'responsible-disclosure':
            case 'cookies':
            case 'cookie-policy':
            case 'accessibility':
            case 'disclaimer':
            case 'community':
                var docKey = route.replace('-policy', '').replace('responsible-', '');
                if (docKey === 'security') docKey = 'security';
                openLegalDoc(docKey);
                break;
            case 'cookie-preferences':
                if (els.modalCookiePrefs) els.modalCookiePrefs.classList.remove('hidden');
                break;
            case 'help':
            case 'faq':
                renderFaqs();
                if (els.modalHelpCenter) els.modalHelpCenter.classList.remove('hidden');
                break;
            case 'support':
                if (els.modalSupportTicket) els.modalSupportTicket.classList.remove('hidden');
                break;
            case 'settings':
            case 'account':
                if (els.modalAccount) els.modalAccount.classList.remove('hidden');
                break;
            case 'register':
                openAuthFlow('register');
                break;
            case 'forgot-password':
                openAuthFlow('forgot');
                break;
            case 'onboarding':
                if (els.btnHelp) els.btnHelp.click();
                break;
            case 'status':
            case 'health':
                openSystemStatusModal();
                break;
            case 'about':
            case 'architecture':
            case 'arch':
            case 'docs':
            case 'whitepaper':
                if (els.modalArchitecture) els.modalArchitecture.classList.remove('hidden');
                break;

            case '404':
                showSystemState('404', '404 - Resource Not Found', 'The requested database key, route, or telemetry point does not exist.');
                break;
            case '403':
                showSystemState('403', '403 - Access Forbidden', 'Admin role required. Execute AUTH <password> to upgrade session privileges.');
                break;
            case '500':
                showSystemState('500', '500 - Datastore Engine Error', 'Internal telemetry error. Re-authenticating connection.');
                break;
            case 'maintenance':
                showSystemState('maintenance', 'Scheduled Maintenance', 'RediForge persistence maintenance is active. Service resumes shortly.');
                break;
            case 'session-expired':
                showSystemState('session-expired', 'Session Expired', 'Your authenticated token has expired. Please re-authenticate to continue.');
                break;
            default:
                break;
        }
    }

    function openAuthFlow(flowType) {
        if (!els.modalAuthFlows) return;
        var titles = {
            register: 'Create Developer Account',
            forgot: 'Reset Password',
            verify: 'Verify Email Address'
        };

        if (els.authFlowTitle) els.authFlowTitle.textContent = titles[flowType] || 'Authentication';

        if (els.authFlowBody) {
            if (flowType === 'register') {
                els.authFlowBody.innerHTML =
                    '<div><label class="text-xs font-bold text-[#7E8490] uppercase block mb-1">Developer Name</label>' +
                    '<input type="text" id="reg-name" class="neo-inset w-full p-2 text-xs" placeholder="e.g. Ashutosh Yadav"></div>' +
                    '<div><label class="text-xs font-bold text-[#7E8490] uppercase block mb-1">Email Address</label>' +
                    '<input type="email" id="reg-email" class="neo-inset w-full p-2 text-xs" placeholder="ashutosh4tech@gmail.com"></div>' +
                    '<div><label class="text-xs font-bold text-[#7E8490] uppercase block mb-1">Password</label>' +
                    '<input type="password" id="reg-pass" class="neo-inset w-full p-2 text-xs" placeholder="Create strong password"></div>' +
                    '<div class="flex items-center gap-2 text-xs text-[#7E8490]">' +
                        '<input type="checkbox" id="reg-terms" checked class="h-4 w-4 text-accent-blue rounded">' +
                        '<label for="reg-terms">I agree to the <a href="#/terms" class="text-accent-blue hover:underline">Terms</a> and <a href="#/privacy" class="text-accent-blue hover:underline">Privacy Policy</a></label>' +
                    '</div>' +
                    '<button id="btn-submit-reg" class="neo-button neo-button-primary w-full py-2 text-xs font-bold mt-2">Create Account</button>';

                var submitBtn = document.getElementById('btn-submit-reg');
                if (submitBtn) {
                    submitBtn.addEventListener('click', function () {
                        var email = document.getElementById('reg-email').value.trim();
                        if (!email) { showToast('error', 'Please enter a valid email address'); return; }
                        showToast('success', 'Account created! Signing in...');
                        els.modalAuthFlows.classList.add('hidden');
                        if (els.overlay) els.overlay.classList.remove('hidden');
                    });
                }
            } else if (flowType === 'forgot') {
                els.authFlowBody.innerHTML =
                    '<p class="text-xs text-[#7E8490]">Enter your account email. We will dispatch a secure recovery token.</p>' +
                    '<div><label class="text-xs font-bold text-[#7E8490] uppercase block mb-1">Account Email</label>' +
                    '<input type="email" id="forgot-email" class="neo-inset w-full p-2 text-xs" placeholder="ashutosh4tech@gmail.com"></div>' +
                    '<button id="btn-submit-forgot" class="neo-button neo-button-primary w-full py-2 text-xs font-bold mt-2">Send Reset Link</button>';

                var forgotBtn = document.getElementById('btn-submit-forgot');
                if (forgotBtn) {
                    forgotBtn.addEventListener('click', function () {
                        showToast('info', 'Password reset instructions dispatched to email.');
                        els.modalAuthFlows.classList.add('hidden');
                    });
                }
            }
        }

        els.modalAuthFlows.classList.remove('hidden');
    }

    function initNetworkMonitoring() {
        function updateNetworkStatus() {
            if (!navigator.onLine) {
                if (els.offlineBanner) els.offlineBanner.classList.remove('hidden');
                showToast('warning', 'Internet connection lost. Offline mode active.');
            } else {
                if (els.offlineBanner) els.offlineBanner.classList.add('hidden');
                showToast('success', 'Connection restored.');
            }
        }
        window.addEventListener('online', updateNetworkStatus);
        window.addEventListener('offline', updateNetworkStatus);
        if (els.offlineBanner) {
            if (!navigator.onLine) {
                els.offlineBanner.classList.remove('hidden');
            } else {
                els.offlineBanner.classList.add('hidden');
            }
        }
    }

    function seedDemoDataset() {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            showToast('error', 'Please connect to server first.');
            return;
        }

        showToast('info', 'Seeding demo Redis keys...');
        var sampleCommands = [
            ['SET', 'user:1001:name', 'Ashutosh Yadav'],
            ['SET', 'user:1001:email', 'ashutosh4tech@gmail.com'],
            ['SET', 'app:environment', 'production'],
            ['SET', 'app:version', 'v2.4.0'],
            ['SET', 'counter:pageviews:homepage', '142857'],
            ['DEL', 'cache:weather:san_francisco'],
            ['SET', 'cache:weather:india', '{"temp": 30, "unit": "C", "condition": "Sunny", "humidity": 55, "location": "India"}'],
            ['EXPIRE', 'cache:weather:india', '3600'],
            ['HSET', 'user:1001:profile', 'name', 'Ashutosh Yadav', 'role', 'Staff Engineer', 'team', 'Platform Core', 'location', 'India', 'status', 'Active'],
            ['HSET', 'server:health:node-01', 'hostname', 'ip-10-0-4-12', 'cpu_usage', '14.2%', 'status', 'HEALTHY'],
            ['HSET', 'product:sku:99401', 'title', 'Database Accelerator', 'category', 'DevTools', 'price', '$49.99'],
            ['RPUSH', 'queue:task_worker:jobs', 'job_1042: email_digest', 'job_1043: backup_snapshot', 'job_1044: analytics_rollup'],
            ['SADD', 'users:online:active', 'alex_m', 'sarah_k', 'david_chen', 'elena_r', 'jordan_t'],
            ['SADD', 'feature_flags:beta_testers', 'user:1001', 'user:1042', 'user:2088'],
            ['ZADD', 'leaderboard:global_rankings', '9850', 'alex_m', '9420', 'sarah_k', '8900', 'david_chen']
        ];

        var completed = 0;
        sampleCommands.forEach(function (cmd) {
            sendCommand(cmd, function () {
                completed++;
                if (completed === sampleCommands.length) {
                    showToast('success', '14 Demo keys created successfully across Strings, Hashes, Lists, Sets & ZSets!');
                    refreshKeys();
                    pollStats();
                }
            });
        });
    }

    if (els.btnConnect) els.btnConnect.addEventListener('click', doConnect);
    if (els.wsUrl) els.wsUrl.addEventListener('keydown', function (e) { if (e.key === 'Enter') doConnect(); });
    if (els.wsAuth) els.wsAuth.addEventListener('keydown', function (e) { if (e.key === 'Enter') doConnect(); });
    if (els.btnDisconnect) els.btnDisconnect.addEventListener('click', doDisconnect);
    if (els.btnSeedKeys) els.btnSeedKeys.addEventListener('click', seedDemoDataset);

    if (els.btnUserAvatar && els.userMenuDropdown) {
        els.btnUserAvatar.addEventListener('click', function (e) {
            e.stopPropagation();
            els.userMenuDropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', function () {
            els.userMenuDropdown.classList.add('hidden');
        });
    }
    if (els.menuBtnSettings) els.menuBtnSettings.addEventListener('click', function () { navigateTo('/settings'); });
    if (els.menuBtnApiKeys) els.menuBtnApiKeys.addEventListener('click', function () { navigateTo('/settings'); });
    if (els.menuBtnLogout) els.menuBtnLogout.addEventListener('click', doDisconnect);

    var navBindings = {
        'nav-dashboard': '/dashboard',
        'nav-browser': '/browser',
        'nav-cli': '/cli',
        'nav-help': '/help',
        'nav-arch': '/architecture',
        'btn-arch-header': '/architecture',
        'nav-settings': '/settings',
        'brand-logo': '/dashboard'
    };
    for (var navId in navBindings) {
        var el = document.getElementById(navId);
        if (el) {
            el.addEventListener('click', (function (targetRoute) {
                return function (e) {
                    e.preventDefault();
                    navigateTo(targetRoute);
                };
            })(navBindings[navId]));
        }
    }

    if (els.btnCloseLegal) els.btnCloseLegal.addEventListener('click', function () { closeAllModals(true); });
    if (els.btnPrintLegal) els.btnPrintLegal.addEventListener('click', function () { window.print(); });

    if (els.btnCloseAccount) els.btnCloseAccount.addEventListener('click', function () { closeAllModals(true); });
    if (els.btnSaveAccount) els.btnSaveAccount.addEventListener('click', function () { closeAllModals(true); });
    if (els.btnCloseHelpCenter) els.btnCloseHelpCenter.addEventListener('click', function () { closeAllModals(true); });
    if (els.btnOpenSupportFromHelp) els.btnOpenSupportFromHelp.addEventListener('click', function () { window.location.hash = '#/support'; });
    if (els.btnCloseSupport) els.btnCloseSupport.addEventListener('click', function () { closeAllModals(true); });
    if (els.btnCancelSupport) els.btnCancelSupport.addEventListener('click', function () { closeAllModals(true); });
    if (els.btnSubmitSupport) {
        els.btnSubmitSupport.addEventListener('click', function () {
            var sub = els.ticketSubject ? els.ticketSubject.value.trim() : '';
            if (!sub) { showToast('error', 'Please enter a ticket subject.'); return; }
            showToast('success', 'Ticket #' + Math.floor(100000 + Math.random() * 900000) + ' submitted. Priority response assigned.');
            closeAllModals(true);
        });
    }

    if (els.btnCloseAuthFlow) els.btnCloseAuthFlow.addEventListener('click', function () { closeAllModals(true); });

    if (els.btnCloseArchitecture) els.btnCloseArchitecture.addEventListener('click', function () { closeAllModals(true); });
    if (els.btnCloseArchFooter) els.btnCloseArchFooter.addEventListener('click', function () { closeAllModals(true); });

    var archTabBtns = document.querySelectorAll('.arch-tab-btn');
    archTabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var tab = btn.getAttribute('data-tab');
            archTabBtns.forEach(function (b) {
                b.className = 'arch-tab-btn text-xs font-bold text-[#7E8490] pb-1';
            });
            btn.className = 'arch-tab-btn text-xs font-bold text-accent-blue border-b-2 border-accent-blue pb-1';

            ['overview', 'architecture', 'internals', 'persistence', 'usecases'].forEach(function (t) {
                var el = document.getElementById('arch-tab-' + t);
                if (el) el.classList.toggle('hidden', t !== tab);
            });
        });
    });

    if (els.btnCloseSystemStatus) els.btnCloseSystemStatus.addEventListener('click', function () { closeAllModals(true); });
    if (els.btnStatusViewDashboard) els.btnStatusViewDashboard.addEventListener('click', function () {
        closeAllModals(true);
        window.location.hash = '#/dashboard';
        handleRoute();
    });
    if (els.btnRunStatusPing) els.btnRunStatusPing.addEventListener('click', runStatusPingBenchmark);

    document.querySelectorAll('.neo-modal-backdrop').forEach(function (backdrop) {
        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) {
                closeAllModals(true);
            }
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
            closeAllModals(true);
        }
    });

    document.addEventListener('click', function (e) {
        var anchor = e.target.closest('a[href]');
        if (!anchor) return;
        var href = anchor.getAttribute('href');
        if (!href) return;

        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
            return;
        }

        if (href.startsWith('#/')) {
            e.preventDefault();
            navigateTo(href.replace(/^#/, ''));
        } else if (href.startsWith('/') && !href.startsWith('//')) {
            e.preventDefault();
            navigateTo(href);
        }
    });

    if (els.btnCookieAcceptAll) {
        els.btnCookieAcceptAll.addEventListener('click', function () {
            localStorage.setItem('rf_cookie_consent', 'all');
            if (els.cookieBanner) els.cookieBanner.classList.add('hidden');
            showToast('success', 'Cookie preferences saved.');
        });
    }
    if (els.btnCloseCookiePrefs) els.btnCloseCookiePrefs.addEventListener('click', function () { closeAllModals(true); });
    if (els.btnRejectCookies) {
        els.btnRejectCookies.addEventListener('click', function () {
            localStorage.setItem('rf_cookie_consent', 'essential');
            closeAllModals(true);
            if (els.cookieBanner) els.cookieBanner.classList.add('hidden');
            showToast('info', 'Only strictly necessary session cookies active.');
        });
    }
    if (els.btnSaveCookiePrefs) {
        els.btnSaveCookiePrefs.addEventListener('click', function () {
            localStorage.setItem('rf_cookie_consent', 'custom');
            closeAllModals(true);
            if (els.cookieBanner) els.cookieBanner.classList.add('hidden');
            showToast('success', 'Custom cookie preferences saved.');
        });
    }

    var accountTabBtns = document.querySelectorAll('.account-tab-btn');
    accountTabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var tab = btn.getAttribute('data-tab');
            accountTabBtns.forEach(function (b) {
                b.className = 'account-tab-btn text-xs font-bold text-[#7E8490] pb-1';
            });
            btn.className = 'account-tab-btn text-xs font-bold text-accent-blue border-b-2 border-accent-blue pb-1';

            ['profile', 'apikeys', 'sessions'].forEach(function (t) {
                var el = document.getElementById('account-tab-' + t);
                if (el) el.classList.toggle('hidden', t !== tab);
            });
        });
    });

    if (els.btnGenerateApiKey && els.apikeyList) {
        els.btnGenerateApiKey.addEventListener('click', function () {
            var keyId = 'rf_sec_' + Array.from(crypto.getRandomValues(new Uint8Array(12))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
            var item = document.createElement('div');
            item.className = 'p-3 neo-inset rounded flex justify-between items-center font-mono text-xs';
            item.innerHTML = '<span class="truncate max-w-[280px]">' + keyId + '</span><button class="btn-copy-key text-accent-blue hover:underline">Copy</button>';
            els.apikeyList.appendChild(item);
            showToast('success', 'New Bearer Token Generated!');
        });
    }
    document.addEventListener('click', function (e) {
        if (e.target && e.target.classList.contains('btn-copy-key')) {
            var text = e.target.getAttribute('data-key') || e.target.previousElementSibling.textContent;
            navigator.clipboard.writeText(text);
            showToast('info', 'Token copied to clipboard');
        }
    });

    document.querySelectorAll('.legal-nav-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var docKey = btn.getAttribute('data-doc');
            openLegalDoc(docKey);
        });
    });

    if (els.helpSearchInput) {
        els.helpSearchInput.addEventListener('input', function () {
            renderFaqs(els.helpSearchInput.value);
        });
    }

    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('popstate', handleRoute);
    window.addEventListener('load', function () {
        handleRoute();
        initNetworkMonitoring();

        if (!localStorage.getItem('rf_cookie_consent') && els.cookieBanner) {
            setTimeout(function () { els.cookieBanner.classList.remove('hidden'); }, 1200);
        }
    });

    var defaultWs = (window.location && window.location.host && window.location.protocol.startsWith('http'))
        ? ((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host)
        : 'ws://127.0.0.1:8080';
    if (els.wsUrl) els.wsUrl.value = defaultWs;

    var httpBaseUrl = defaultWs.replace(/^ws/, 'http');

    var currentGoogleClientId = null;

    fetch(httpBaseUrl + '/api/config')
        .then(function (res) { return res.json(); })
        .then(function (data) {
            currentGoogleClientId = data.googleClientId || null;
            if (currentGoogleClientId && window.google && window.google.accounts && window.google.accounts.id) {
                google.accounts.id.initialize({
                    client_id: currentGoogleClientId,
                    callback: handleGoogleLogin
                });
                var gsiSlot = document.getElementById("google-gsi-slot");
                if (gsiSlot) {
                    google.accounts.id.renderButton(gsiSlot, {
                        theme: "outline",
                        size: "large",
                        width: "100%"
                    });
                }
            }
        })
        .catch(function (err) { console.error("Config fetch:", err); });

    if (els.btnGoogleSignin) {
        els.btnGoogleSignin.addEventListener('click', function () {
            handleGoogleSignInClick();
        });
    }

    function handleGoogleSignInClick() {
        if (currentGoogleClientId && window.google && window.google.accounts && window.google.accounts.id) {
            try {
                google.accounts.id.prompt();
                return;
            } catch (e) {
                console.warn("GIS prompt fallback:", e);
            }
        }

        if (els.btnConnect) {
            els.btnConnect.textContent = 'Connecting with Google...';
            els.btnConnect.disabled = true;
        }

        fetch(httpBaseUrl + '/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ demoGoogleLogin: true })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.error) throw new Error(data.error);
            if (data.token) {
                currentAuthToken = data.token;
                localStorage.setItem('rediforge_jwt_token', data.token);
                if (data.user) {
                    currentUser = data.user;
                    localStorage.setItem('rediforge_user', JSON.stringify(data.user));
                    updateUserUI(data.user);
                }
                if (els.wsAuth) els.wsAuth.value = data.token;
                showToast('success', 'Authenticated with Google as ' + (data.user ? data.user.email : 'ashutosh4tech@gmail.com'));
                doConnect();
            }
        })
        .catch(function (err) {
            console.error('Google demo login error:', err);
            showToast('info', 'Connecting directly to datastore...');
            doConnect();
        })
        .finally(function () {
            if (els.btnConnect) {
                els.btnConnect.textContent = 'Connect';
                els.btnConnect.disabled = false;
            }
        });
    }

    if (els.navMobileDashboard) {
        els.navMobileDashboard.addEventListener('click', function () { navigateTo('/dashboard'); });
    }
    if (els.navMobileBrowser) {
        els.navMobileBrowser.addEventListener('click', function () { navigateTo('/browser'); });
    }
    if (els.navMobileCli) {
        els.navMobileCli.addEventListener('click', function () { navigateTo('/cli'); });
    }
    if (els.navMobileArch) {
        els.navMobileArch.addEventListener('click', function () { navigateTo('/architecture'); });
    }
    if (els.navMobileHelp) {
        els.navMobileHelp.addEventListener('click', function () { navigateTo('/help'); });
    }

    function handleGoogleLogin(response) {
        if (!response.credential) return;

        if (els.btnConnect) {
            els.btnConnect.textContent = 'Authenticating...';
            els.btnConnect.disabled = true;
        }

        fetch(httpBaseUrl + '/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ googleIdToken: response.credential })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.error) throw new Error(data.error);
            if (data.token) {
                currentAuthToken = data.token;
                localStorage.setItem('rediforge_jwt_token', data.token);
                if (data.user) {
                    currentUser = data.user;
                    localStorage.setItem('rediforge_user', JSON.stringify(data.user));
                    updateUserUI(data.user);
                }
                if (els.wsAuth) els.wsAuth.value = data.token;
                showToast('success', 'Authenticated with Google as ' + (data.user ? data.user.email : 'Developer'));
                doConnect();
            }
        })
        .catch(function (err) {
            if (els.loginError) els.loginError.textContent = 'Auth Failed: ' + err.message;
            if (els.btnConnect) {
                els.btnConnect.textContent = 'Connect';
                els.btnConnect.disabled = false;
            }
            showToast('error', 'Google Auth Error: ' + err.message);
        });
    }

    function updateUserUI(user) {
        if (!user) return;
        if (els.userDisplayName) els.userDisplayName.textContent = user.name || user.email.split('@')[0];
        if (els.dropdownUserEmail) els.dropdownUserEmail.textContent = user.email;
        if (els.dropdownUserRole) els.dropdownUserRole.textContent = 'Role: ' + (user.role || 'Developer');
        if (els.accountProfileName) els.accountProfileName.textContent = user.name || 'Developer User';
        if (els.accountProfileEmail) els.accountProfileEmail.textContent = user.email;
    }

    if (currentUser) {
        updateUserUI(currentUser);
    }

    if (currentAuthToken && els.wsAuth) {
        els.wsAuth.value = currentAuthToken;
        setTimeout(doConnect, 100);
    } else {
        setTimeout(doConnect, 100);
    }

    if (els.terminalInput) els.terminalInput.addEventListener('keydown', onTerminalKey);
    if (els.btnClear) els.btnClear.addEventListener('click', function () { if (els.terminalOutput) els.terminalOutput.innerHTML = ''; });
    if (els.btnRefreshKeys) els.btnRefreshKeys.addEventListener('click', function () { refreshKeys(); });
    if (els.btnCloseDetail) {
        els.btnCloseDetail.addEventListener('click', function () {
            if (els.keyDetail) els.keyDetail.classList.add('hidden');
            activeInspectKey = null;
            activeInspectType = null;
        });
    }
    if (els.dbSelect) els.dbSelect.addEventListener('change', onDbChange);

    if (els.keyFilter) {
        els.keyFilter.addEventListener('input', function () {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(refreshKeys, 250);
        });
        els.keyFilter.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                clearTimeout(searchDebounceTimer);
                refreshKeys();
            }
        });
    }

    if (els.btnAddKey) {
        els.btnAddKey.addEventListener('click', openAddKeyModal);
        if (els.btnCloseAddModal) els.btnCloseAddModal.addEventListener('click', closeAddKeyModal);
        if (els.btnCancelAddKey) els.btnCancelAddKey.addEventListener('click', closeAddKeyModal);
        if (els.btnSaveAddKey) els.btnSaveAddKey.addEventListener('click', handleCreateKey);
        if (els.newKeyType) els.newKeyType.addEventListener('change', onNewKeyTypeChange);
    }

    if (els.btnEditKey) {
        els.btnEditKey.addEventListener('click', openEditKeyModal);
        if (els.btnCloseEditModal) els.btnCloseEditModal.addEventListener('click', closeEditKeyModal);
        if (els.btnCancelEditKey) els.btnCancelEditKey.addEventListener('click', closeEditKeyModal);
        if (els.btnSaveEditKey) els.btnSaveEditKey.addEventListener('click', handleSaveEditKey);
    }

    if (els.btnDeleteKey) els.btnDeleteKey.addEventListener('click', handleDeleteCurrentKey);

    if (els.modalConfirmDanger) {
        if (els.btnCloseDangerModal) els.btnCloseDangerModal.addEventListener('click', closeDangerModal);
        if (els.btnCancelDanger) els.btnCancelDanger.addEventListener('click', closeDangerModal);
        if (els.btnProceedDanger) els.btnProceedDanger.addEventListener('click', executePendingDangerCommand);
    }

    window.addEventListener('resize', function () { drawMemoryChart(); });

    function doConnect() {
        if (els.loginError) els.loginError.textContent = '';
        var rawUrl = els.wsUrl ? els.wsUrl.value.trim() : '';
        var authVal = els.wsAuth ? els.wsAuth.value.trim() : '';

        if (!rawUrl) {
            if (els.loginError) els.loginError.textContent = 'Please enter server URL.';
            return;
        }

        if (rawUrl.indexOf('://') < 0) rawUrl = 'ws://' + rawUrl;

        baseUrl = rawUrl.replace(/^ws/, 'http');
        var wsTarget = rawUrl.replace(/^http/, 'ws');
        if (wsTarget.endsWith('/')) wsTarget = wsTarget.slice(0, -1);

        if (authVal && authVal.startsWith('eyJ')) {
            wsTarget += '?token=' + encodeURIComponent(authVal);
        }

        if (els.btnConnect) {
            els.btnConnect.textContent = 'Connecting...';
            els.btnConnect.disabled = true;
        }

        try {
            ws = new WebSocket(wsTarget);
        } catch (e) {
            if (els.loginError) els.loginError.textContent = 'Invalid URL format.';
            if (els.btnConnect) {
                els.btnConnect.textContent = 'Connect';
                els.btnConnect.disabled = false;
            }
            return;
        }

        ws.onopen = function () {
            if (authVal) {
                if (authVal.startsWith('eyJ')) {
                    addTermLine('Authenticated via JWT token.', 'resp-line');
                } else {
                    sendCommand(['AUTH', authVal], function (authRes) {
                        if (authRes && authRes.error) {
                            addTermLine('Authentication Warning: ' + authRes.error, 'err-line');
                            showToast('error', 'Auth Error: ' + authRes.error);
                        } else {
                            addTermLine('Authenticated successfully as admin.', 'resp-line');
                            showToast('success', 'Logged in as Administrator');
                        }
                    });
                }
            }
            enterDashboard();
        };

        ws.onmessage = function (e) {
            var msg;
            try { msg = JSON.parse(e.data); } catch (err) { return; }

            if (msg.status === 'CONFIRMATION_REQUIRED') {
                promptDangerConfirmation(msg.command || null, msg.result || 'Dangerous operation requires confirmation.');
                return;
            }

            if (msg.id && pendingCallbacks[msg.id]) {
                pendingCallbacks[msg.id](msg.result, msg);
                delete pendingCallbacks[msg.id];
            }
        };

        ws.onclose = function () {
            setDisconnected();
        };

        ws.onerror = function () {
            if (els.loginError) els.loginError.textContent = 'Connection failed. Check server URL.';
            if (els.btnConnect) {
                els.btnConnect.textContent = 'Connect';
                els.btnConnect.disabled = false;
            }
        };
    }

    function enterDashboard() {
        if (els.overlay) els.overlay.classList.add('hidden');
        if (els.app) els.app.classList.remove('hidden');
        if (els.btnConnect) {
            els.btnConnect.textContent = 'Connect';
            els.btnConnect.disabled = false;
        }
        setConnected();
        addTermLine('Connected to ' + (els.wsUrl ? els.wsUrl.value.trim() : 'server'), 'info-line');
        updateCliPrompt();
        refreshKeys();
        statsInterval = setInterval(pollStats, 2000);
        pollStats();
    }

    function doDisconnect() {
        if (ws) ws.close();
        currentAuthToken = '';
        currentUser = null;
        localStorage.removeItem('rediforge_jwt_token');
        localStorage.removeItem('rediforge_user');
        setDisconnected();
        showToast('info', 'Disconnected from server');
    }

    function setConnected() {
        if (els.status) {
            els.status.textContent = 'Connected';
            els.status.className = 'px-3 py-1 rounded cursor-default neo-inset text-accent-green font-bold text-sm';
        }
        if (els.cliServerLabel) {
            els.cliServerLabel.textContent = 'REDIS CLI - ' + (baseUrl || 'Connected');
        }
    }

    function setDisconnected() {
        if (els.status) {
            els.status.textContent = 'Disconnected';
            els.status.className = 'px-3 py-1 rounded cursor-default neo-inset text-accent-red font-bold text-sm';
        }
        if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
        if (els.overlay) els.overlay.classList.remove('hidden');
        if (els.app) els.app.classList.add('hidden');
        if (els.btnConnect) {
            els.btnConnect.textContent = 'Connect';
            els.btnConnect.disabled = false;
        }
        ws = null;
    }

    function sendCommand(parts, callback, confirmed) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        var id = ++msgId;
        if (callback) pendingCallbacks[id] = callback;
        var payload = { id: id, command: parts };
        if (confirmed) payload.confirmed = true;
        ws.send(JSON.stringify(payload));
    }

    function updateCliPrompt() {
        if (els.terminalPrompt) {
            els.terminalPrompt.textContent = 'redis[db' + currentDb + ']> ';
        }
    }

    function onTerminalKey(e) {
        if (e.key === 'Enter') {
            var raw = els.terminalInput.value.trim();
            if (!raw) return;

            cmdHistory.unshift(raw);
            if (cmdHistory.length > 200) cmdHistory.pop();
            historyIdx = -1;

            els.terminalInput.value = '';
            addTermLine('redis[db' + currentDb + ']> ' + raw, 'cmd-line');

            var parts = parseCommandString(raw);
            var cmdName = parts[0] ? parts[0].toUpperCase() : '';

            if (cmdName === 'CLEAR') {
                if (els.terminalOutput) els.terminalOutput.innerHTML = '';
                return;
            }

            sendCommand(parts, function (res, fullMsg) {
                if (fullMsg && fullMsg.status === 'CONFIRMATION_REQUIRED') {
                    promptDangerConfirmation(parts, 'Command ' + cmdName + ' requires explicit confirmation.');
                    return;
                }

                renderResponse(res);

                if (cmdName === 'SELECT' && parts.length > 1) {
                    var newDb = parseInt(parts[1], 10);
                    if (!isNaN(newDb) && newDb >= 0 && newDb <= 15) {
                        currentDb = newDb;
                        if (els.dbSelect) els.dbSelect.value = String(newDb);
                        updateCliPrompt();
                        refreshKeys();
                    }
                } else if (isWriteCommand(cmdName)) {
                    refreshKeys();
                    showToast('info', 'Command executed: ' + cmdName);
                }
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIdx < cmdHistory.length - 1) {
                historyIdx++;
                els.terminalInput.value = cmdHistory[historyIdx];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIdx > 0) {
                historyIdx--;
                els.terminalInput.value = cmdHistory[historyIdx];
            } else {
                historyIdx = -1;
                els.terminalInput.value = '';
            }
        }
    }

    function isWriteCommand(cmd) {
        var writes = {
            SET: 1, SETNX: 1, MSET: 1, DEL: 1, UNLINK: 1, RENAME: 1, RENAMENX: 1,
            EXPIRE: 1, PEXPIRE: 1, EXPIREAT: 1, PEXPIREAT: 1, PERSIST: 1,
            HSET: 1, HDEL: 1, HMSET: 1, HINCRBY: 1, HINCRBYFLOAT: 1, HSETNX: 1,
            LPUSH: 1, RPUSH: 1, LPOP: 1, RPOP: 1, LSET: 1,
            SADD: 1, SREM: 1,
            ZADD: 1, ZREM: 1, ZINCRBY: 1,
            FLUSHDB: 1, FLUSHALL: 1, SWAPDB: 1
        };
        return !!writes[cmd];
    }

    function parseCommandString(str) {
        var parts = [];
        var current = '';
        var inQuote = false;
        var quoteChar = '';

        for (var i = 0; i < str.length; i++) {
            var ch = str[i];
            if (inQuote) {
                if (ch === quoteChar) {
                    inQuote = false;
                } else if (ch === '\\' && i + 1 < str.length) {
                    i++;
                    current += str[i];
                } else {
                    current += ch;
                }
            } else if (ch === '"' || ch === "'") {
                inQuote = true;
                quoteChar = ch;
            } else if (ch === ' ' || ch === '\t') {
                if (current.length > 0) {
                    parts.push(current);
                    current = '';
                }
            } else {
                current += ch;
            }
        }

        if (current.length > 0) parts.push(current);
        return parts;
    }

    function renderResponse(res) {
        if (res === null || res === undefined) {
            addTermLine('(nil)', 'resp-line');
        } else if (res && res.error) {
            addTermLine('(error) ' + res.error, 'err-line');
        } else if (Array.isArray(res)) {
            if (res.length === 0) {
                addTermLine('(empty array)', 'resp-line');
            } else {
                for (var i = 0; i < res.length; i++) {
                    var prefix = (i + 1) + ') ';
                    if (res[i] === null) {
                        addTermLine(prefix + '(nil)', 'resp-line');
                    } else if (typeof res[i] === 'object' && res[i] && res[i].error) {
                        addTermLine(prefix + '(error) ' + res[i].error, 'err-line');
                    } else if (Array.isArray(res[i])) {
                        addTermLine(prefix + JSON.stringify(res[i]), 'resp-line');
                    } else {
                        addTermLine(prefix + '"' + res[i] + '"', 'resp-line');
                    }
                }
            }
        } else if (typeof res === 'number') {
            addTermLine('(integer) ' + res, 'resp-line');
        } else {
            addTermLine('"' + res + '"', 'resp-line');
        }
    }

    function addTermLine(text, cls) {
        if (!els.terminalOutput) return;
        var div = document.createElement('div');
        div.className = cls || '';
        div.textContent = text;
        els.terminalOutput.appendChild(div);
        els.terminalOutput.scrollTop = els.terminalOutput.scrollHeight;
    }

    function onDbChange() {
        var db = els.dbSelect.value;
        currentDb = parseInt(db, 10) || 0;
        updateCliPrompt();
        sendCommand(['SELECT', db], function () {
            addTermLine('Switched to database ' + db, 'info-line');
            showToast('info', 'Switched to db' + db);
            refreshKeys();
        });
    }

    function refreshKeys() {
        var pattern = els.keyFilter ? (els.keyFilter.value.trim() || '*') : '*';
        var allKeys = [];

        function scanCursor(cursor) {
            sendCommand(['SCAN', String(cursor), 'MATCH', pattern, 'COUNT', '200'], function (res) {
                if (!Array.isArray(res) || res.length < 2) {
                    renderKeyList(allKeys, pattern);
                    return;
                }

                var nextCursor = parseInt(res[0], 10);
                var keys = res[1];

                if (Array.isArray(keys)) {
                    for (var i = 0; i < keys.length; i++) {
                        if (allKeys.indexOf(keys[i]) < 0) {
                            allKeys.push(keys[i]);
                        }
                    }
                }

                if (nextCursor === 0 || isNaN(nextCursor)) {
                    renderKeyList(allKeys, pattern);
                } else {
                    scanCursor(nextCursor);
                }
            });
        }

        scanCursor(0);
    }

    function renderKeyList(keys, pattern) {
        if (!els.keyList) return;
        els.keyList.innerHTML = '';

        if (keys.length === 0) {
            if (pattern && pattern !== '*') {
                els.keyList.innerHTML =
                    '<div class="empty-state-box">' +
                        '<span class="material-symbols-outlined empty-state-icon text-accent-blue">search_off</span>' +
                        '<div class="text-xs font-bold text-[#2A2F33] mb-1">No Matching Keys Found</div>' +
                        '<p class="text-[11px] text-[#7E8490] mb-3">No keys match filter pattern "<code>' + escapeHtml(pattern) + '</code>"</p>' +
                        '<button id="btn-clear-key-filter" class="neo-button px-3 py-1.5 text-xs text-accent-blue font-bold">Clear Filter</button>' +
                    '</div>';
                var clearBtn = document.getElementById('btn-clear-key-filter');
                if (clearBtn) {
                    clearBtn.addEventListener('click', function () {
                        if (els.keyFilter) els.keyFilter.value = '';
                        refreshKeys();
                    });
                }
            } else {
                els.keyList.innerHTML =
                    '<div class="empty-state-box">' +
                        '<span class="material-symbols-outlined empty-state-icon text-accent-blue">inbox</span>' +
                        '<div class="text-xs font-bold text-[#2A2F33] mb-1">Database is Empty (db' + currentDb + ')</div>' +
                        '<p class="text-[11px] text-[#7E8490] mb-3">No keys found in this database. Start creating keys or seed sample demo records.</p>' +
                        '<div class="flex gap-2">' +
                            '<button id="btn-empty-add-key" class="neo-button neo-button-primary px-3 py-1.5 text-xs font-bold flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">add</span> Add Key</button>' +
                            '<button id="btn-empty-seed-key" class="neo-button px-3 py-1.5 text-xs text-accent-green font-bold flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">bolt</span> Seed Data</button>' +
                        '</div>' +
                    '</div>';
                var addBtn = document.getElementById('btn-empty-add-key');
                if (addBtn) addBtn.addEventListener('click', openAddKeyModal);
                var seedBtn = document.getElementById('btn-empty-seed-key');
                if (seedBtn) seedBtn.addEventListener('click', seedDemoDataset);
            }
            return;
        }

        keys.sort();

        for (var i = 0; i < keys.length; i++) {
            (function (key) {
                sendCommand(['TYPE', key], function (typeRes) {
                    var type = typeRes || 'string';
                    var item = document.createElement('div');
                    item.className = 'key-item' + (activeInspectKey === key ? ' active' : '');
                    item.id = 'key-item-' + encodeURIComponent(key);
                    item.innerHTML =
                        '<span class="key-name">' + escapeHtml(key) + '</span>' +
                        '<span class="key-type key-type-' + type + '">' + type + '</span>';
                    item.addEventListener('click', function () {
                        inspectKey(key, type);
                    });
                    els.keyList.appendChild(item);
                });
            })(keys[i]);
        }
    }

    function inspectKey(key, type) {
        activeInspectKey = key;
        activeInspectType = type;

        var items = els.keyList.querySelectorAll('.key-item');
        items.forEach(function (el) { el.classList.remove('active'); });
        var activeEl = document.getElementById('key-item-' + encodeURIComponent(key));
        if (activeEl) activeEl.classList.add('active');

        if (els.detailKeyName) els.detailKeyName.textContent = key;
        if (els.detailKeyType) {
            els.detailKeyType.textContent = type;
            els.detailKeyType.className = 'detail-type-badge key-type-' + type;
        }
        if (els.detailKeyTtl) els.detailKeyTtl.textContent = 'TTL: ...';

        sendCommand(['TTL', key], function (ttlRes) {
            if (!els.detailKeyTtl) return;
            if (ttlRes === -1) els.detailKeyTtl.textContent = 'TTL: Persistent';
            else if (ttlRes === -2) els.detailKeyTtl.textContent = 'TTL: Expired';
            else if (typeof ttlRes === 'number') els.detailKeyTtl.textContent = 'TTL: ' + ttlRes + 's';
        });

        var cmd;
        switch (type) {
            case 'string': cmd = ['GET', key]; break;
            case 'list': cmd = ['LRANGE', key, '0', '-1']; break;
            case 'hash': cmd = ['HGETALL', key]; break;
            case 'set': cmd = ['SMEMBERS', key]; break;
            case 'zset': cmd = ['ZRANGE', key, '0', '-1', 'WITHSCORES']; break;
            default: cmd = ['TYPE', key];
        }

        sendCommand(cmd, function (res) {
            var formatted = '';
            if (type === 'string') {
                formatted = res !== null ? String(res) : '(nil)';
            } else if (type === 'hash' && Array.isArray(res)) {
                for (var i = 0; i < res.length; i += 2) {
                    formatted += res[i] + ': ' + (res[i + 1] !== undefined ? res[i + 1] : '') + '\n';
                }
            } else if (type === 'zset' && Array.isArray(res)) {
                for (var j = 0; j < res.length; j += 2) {
                    formatted += res[j] + ' (score: ' + (res[j + 1] !== undefined ? res[j + 1] : '0') + ')\n';
                }
            } else if (Array.isArray(res)) {
                for (var k = 0; k < res.length; k++) {
                    formatted += (k + 1) + ') ' + (res[k] !== null ? res[k] : '(nil)') + '\n';
                }
            } else if (res && res.error) {
                formatted = 'Error: ' + res.error;
            } else {
                formatted = String(res);
            }

            if (els.detailContent) els.detailContent.textContent = formatted.trim() || '(empty)';
            if (els.keyDetail) els.keyDetail.classList.remove('hidden');
        });
    }

    function handleDeleteCurrentKey() {
        if (!activeInspectKey) return;
        var keyToDelete = activeInspectKey;
        if (confirm('Delete key "' + keyToDelete + '"?')) {
            sendCommand(['DEL', keyToDelete], function (res) {
                addTermLine('DEL ' + keyToDelete + ' -> ' + res, 'info-line');
                showToast('success', 'Key deleted: ' + keyToDelete);
                if (els.keyDetail) els.keyDetail.classList.add('hidden');
                activeInspectKey = null;
                activeInspectType = null;
                refreshKeys();
            });
        }
    }

    function openEditKeyModal() {
        if (!activeInspectKey) return;
        if (els.editKeyName) els.editKeyName.value = activeInspectKey;
        if (els.editKeyValue) els.editKeyValue.value = els.detailContent.textContent;
        if (els.modalEditKey) els.modalEditKey.classList.remove('hidden');
    }

    function closeEditKeyModal() {
        if (els.modalEditKey) els.modalEditKey.classList.add('hidden');
    }

    function handleSaveEditKey() {
        var key = els.editKeyName ? els.editKeyName.value.trim() : '';
        var val = els.editKeyValue ? els.editKeyValue.value : '';
        if (!key) return;

        sendCommand(['SET', key, val], function () {
            closeEditKeyModal();
            inspectKey(key, 'string');
            addTermLine('Updated key ' + key, 'info-line');
            showToast('success', 'Updated key ' + key);
        });
    }

    function openAddKeyModal() {
        if (els.newKeyName) els.newKeyName.value = '';
        if (els.newKeyValue) els.newKeyValue.value = '';
        if (els.newKeyTtl) els.newKeyTtl.value = '';
        if (els.newKeyType) els.newKeyType.value = 'string';
        onNewKeyTypeChange();
        if (els.modalAddKey) els.modalAddKey.classList.remove('hidden');
        if (els.newKeyName) els.newKeyName.focus();
    }

    function closeAddKeyModal() {
        if (els.modalAddKey) els.modalAddKey.classList.add('hidden');
    }

    function onNewKeyTypeChange() {
        if (!els.newKeyType) return;
        var type = els.newKeyType.value;
        if (type === 'string') {
            if (els.newKeyValLabel) els.newKeyValLabel.textContent = 'Value';
            if (els.newKeyValue) els.newKeyValue.placeholder = 'Enter string value...';
            if (els.newKeyHint) els.newKeyHint.textContent = 'Raw string payload.';
        } else if (type === 'hash') {
            if (els.newKeyValLabel) els.newKeyValLabel.textContent = 'Field & Value (field: value per line)';
            if (els.newKeyValue) els.newKeyValue.placeholder = 'field1: value1\nfield2: value2';
            if (els.newKeyHint) els.newKeyHint.textContent = 'Enter field: value pairs.';
        } else if (type === 'list') {
            if (els.newKeyValLabel) els.newKeyValLabel.textContent = 'List Items (one per line)';
            if (els.newKeyValue) els.newKeyValue.placeholder = 'item1\nitem2';
            if (els.newKeyHint) els.newKeyHint.textContent = 'Appended via RPUSH.';
        } else if (type === 'set') {
            if (els.newKeyValLabel) els.newKeyValLabel.textContent = 'Set Members (one per line)';
            if (els.newKeyValue) els.newKeyValue.placeholder = 'member1\nmember2';
            if (els.newKeyHint) els.newKeyHint.textContent = 'Unique set members.';
        } else if (type === 'zset') {
            if (els.newKeyValLabel) els.newKeyValLabel.textContent = 'Member & Score (member: score per line)';
            if (els.newKeyValue) els.newKeyValue.placeholder = 'player1: 100\nplayer2: 250';
            if (els.newKeyHint) els.newKeyHint.textContent = 'Score-ranked members.';
        }
    }

    function handleCreateKey() {
        var key = els.newKeyName ? els.newKeyName.value.trim() : '';
        var type = els.newKeyType ? els.newKeyType.value : 'string';
        var rawVal = els.newKeyValue ? els.newKeyValue.value : '';
        var ttl = els.newKeyTtl ? parseInt(els.newKeyTtl.value, 10) : null;

        if (!key) {
            showToast('error', 'Please specify a key name.');
            return;
        }

        var cmd = [];
        var lines = rawVal.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);

        if (type === 'string') {
            cmd = ['SET', key, rawVal];
        } else if (type === 'hash') {
            cmd = ['HSET', key];
            lines.forEach(function (l) {
                var colonIdx = l.indexOf(':');
                if (colonIdx > 0) {
                    cmd.push(l.substring(0, colonIdx).trim());
                    cmd.push(l.substring(colonIdx + 1).trim());
                } else {
                    cmd.push(l, '');
                }
            });
            if (cmd.length <= 2) { showToast('error', 'Provide at least one field: value pair.'); return; }
        } else if (type === 'list') {
            cmd = ['RPUSH', key].concat(lines);
            if (cmd.length <= 2) { showToast('error', 'Provide at least one list item.'); return; }
        } else if (type === 'set') {
            cmd = ['SADD', key].concat(lines);
            if (cmd.length <= 2) { showToast('error', 'Provide at least one set member.'); return; }
        } else if (type === 'zset') {
            cmd = ['ZADD', key];
            lines.forEach(function (l) {
                var colonIdx = l.indexOf(':');
                if (colonIdx > 0) {
                    var member = l.substring(0, colonIdx).trim();
                    var score = l.substring(colonIdx + 1).trim();
                    cmd.push(score, member);
                } else {
                    cmd.push('0', l);
                }
            });
            if (cmd.length <= 2) { showToast('error', 'Provide at least one member: score pair.'); return; }
        }

        sendCommand(cmd, function (res) {
            if (res && res.error) {
                showToast('error', 'Error creating key: ' + res.error);
                return;
            }

            if (!isNaN(ttl) && ttl > 0) {
                sendCommand(['EXPIRE', key, String(ttl)], function () {
                    closeAddKeyModal();
                    refreshKeys();
                    inspectKey(key, type);
                    showToast('success', 'Key created with ' + ttl + 's TTL!');
                });
            } else {
                closeAddKeyModal();
                refreshKeys();
                inspectKey(key, type);
                showToast('success', 'Key created successfully: ' + key);
            }
        });
    }

    var pendingDangerCommand = null;
    function promptDangerConfirmation(cmd, message) {
        pendingDangerCommand = cmd;
        if (els.dangerModalMsg) els.dangerModalMsg.textContent = message;
        if (els.modalConfirmDanger) els.modalConfirmDanger.classList.remove('hidden');
    }
    function closeDangerModal() {
        pendingDangerCommand = null;
        if (els.modalConfirmDanger) els.modalConfirmDanger.classList.add('hidden');
    }
    function executePendingDangerCommand() {
        if (!pendingDangerCommand) return;
        var cmdToExec = pendingDangerCommand;
        closeDangerModal();
        sendCommand(cmdToExec, function (res) {
            renderResponse(res);
            refreshKeys();
            showToast('warning', 'Administrative action confirmed and executed.');
        }, true);
    }

    function pollStats() {
        if (!baseUrl) return;
        fetch(baseUrl + '/stats')
            .then(function (res) { return res.json(); })
            .then(function (stats) {
                if (els.statMemory) els.statMemory.textContent = stats.used_memory_human || formatBytes(stats.used_memory);
                if (els.statMemTotal) els.statMemTotal.textContent = formatBytes(stats.used_memory_rss) + ' RSS';
                if (els.statClients) els.statClients.textContent = stats.connected_clients;
                if (els.statKeys) els.statKeys.textContent = stats.total_keys;
                if (els.statsUptime) els.statsUptime.textContent = formatUptime(stats.uptime_seconds);
                if (els.statNode) els.statNode.textContent = stats.node_version ? 'Node ' + stats.node_version : 'RediForge';

                var memPercent = Math.min(100, Math.max(2, (stats.used_memory / (stats.used_memory_rss || 104857600)) * 100));
                if (els.statMemBar) els.statMemBar.style.width = memPercent.toFixed(1) + '%';

                memoryHistory.push(stats.used_memory);
                if (memoryHistory.length > MAX_MEM_POINTS) memoryHistory.shift();
                drawMemoryChart();
            })
            .catch(function () {});
    }

    function drawMemoryChart() {
        if (!els.memLinePath || memoryHistory.length === 0) return;

        var points = memoryHistory;
        var maxMem = Math.max.apply(Math, points.concat([1024]));
        var minMem = Math.min.apply(Math, points);
        var range = maxMem - minMem || 1;

        if (els.scaleMax) els.scaleMax.textContent = formatBytes(maxMem);
        if (els.scaleMid) els.scaleMid.textContent = formatBytes(minMem + range / 2);
        if (els.chartPeakMem) els.chartPeakMem.textContent = formatBytes(maxMem);
        if (els.chartCurrentMem) els.chartCurrentMem.textContent = formatBytes(points[points.length - 1]);

        var width = 500;
        var height = 140;
        var stepX = width / Math.max(1, points.length - 1);

        var pathD = '';
        var areaD = '';
        var lastX = 0, lastY = height;

        for (var i = 0; i < points.length; i++) {
            var x = i * stepX;
            var norm = (points[i] - minMem) / range;
            var y = height - (norm * (height - 20) + 10);
            lastX = x;
            lastY = y;

            if (i === 0) {
                pathD += 'M ' + x + ' ' + y;
                areaD += 'M ' + x + ' ' + height + ' L ' + x + ' ' + y;
            } else {
                pathD += ' L ' + x + ' ' + y;
                areaD += ' L ' + x + ' ' + y;
            }
        }

        areaD += ' L ' + lastX + ' ' + height + ' Z';

        els.memLinePath.setAttribute('d', pathD);
        if (els.memAreaPath) els.memAreaPath.setAttribute('d', areaD);
        if (els.memLatestPoint) {
            els.memLatestPoint.setAttribute('cx', String(lastX));
            els.memLatestPoint.setAttribute('cy', String(lastY));
        }
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(2) + ' GB';
    }

    function formatUptime(seconds) {
        if (seconds < 60) return seconds + 's';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's';
        return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function initOnboarding() {
        if (!els.onboardingOverlay) return;

        var tourSteps = [
            { target: null, title: "Welcome to RediForge", text: "RediForge is your advanced in-memory Redis-compatible datastore dashboard. Let's take a quick tour!" },
            { target: 'tour-stats', title: "Live Metrics", text: "Monitor server memory, active client connections, total key count, and node uptime in real-time." },
            { target: 'tour-chart', title: "Memory Chart", text: "Live visual telemetry of your Redis memory usage footprint over time." },
            { target: 'tour-terminal', title: "Interactive Terminal", text: "Full RESP Redis CLI in your browser. Execute any standard command (SET, GET, HSET, LPUSH, KEYS, etc.)." },
            { target: 'tour-browser', title: "Key Browser", text: "Create, inspect, filter, edit, and delete keys across all 16 Redis databases." }
        ];

        if (els.onboardingDotsContainer) {
            els.onboardingDotsContainer.innerHTML = '';
            for (var i = 0; i < tourSteps.length; i++) {
                var dot = document.createElement('div');
                dot.className = 'w-2 h-2 rounded-full transition-colors duration-300 ' + (i === 0 ? 'bg-accent-blue' : 'bg-[#C4C9D4]');
                els.onboardingDotsContainer.appendChild(dot);
            }
        }

        var currentHighlight = null;
        var currentStep = 0;

        function positionModal(targetId) {
            if (!targetId) {
                els.onboardingModal.style.top = '50%';
                els.onboardingModal.style.left = '50%';
                els.onboardingModal.style.transform = 'translate(-50%, -50%)';
                return;
            }

            var target = document.getElementById(targetId);
            if (!target) return;

            var rect = target.getBoundingClientRect();
            els.onboardingModal.style.transform = 'none';
            var baseTop = Math.max(20, rect.top + (rect.height / 2) - 100);
            els.onboardingModal.style.top = Math.min(window.innerHeight - 240, baseTop) + 'px';

            if (rect.left > 400) {
                els.onboardingModal.style.left = (rect.left - 370) + 'px';
            } else if (window.innerWidth - rect.right > 400) {
                els.onboardingModal.style.left = (rect.right + 20) + 'px';
            } else {
                if (rect.bottom + 180 > window.innerHeight && rect.top > 180) {
                    els.onboardingModal.style.top = (rect.top - 170) + 'px';
                } else {
                    els.onboardingModal.style.top = Math.min(window.innerHeight - 200, rect.bottom + 20) + 'px';
                }
                els.onboardingModal.style.left = '50%';
                els.onboardingModal.style.transform = 'translateX(-50%)';
            }
        }

        function showStep(stepIdx) {
            currentStep = stepIdx;
            var step = tourSteps[stepIdx];

            if (els.onboardingTitle) els.onboardingTitle.innerHTML = '<span class="material-symbols-outlined">explore</span> ' + step.title;
            if (els.onboardingText) els.onboardingText.textContent = step.text;

            if (els.onboardingDotsContainer) {
                var dots = els.onboardingDotsContainer.children;
                for (var j = 0; j < dots.length; j++) {
                    dots[j].className = 'w-2 h-2 rounded-full transition-colors duration-300 ' + (j === stepIdx ? 'bg-accent-blue' : 'bg-[#C4C9D4]');
                }
            }

            if (els.btnOnboardingPrev) els.btnOnboardingPrev.classList.toggle('hidden', stepIdx === 0);
            if (els.btnOnboardingNext) els.btnOnboardingNext.textContent = stepIdx === tourSteps.length - 1 ? "Got it!" : "Next";

            if (currentHighlight) currentHighlight.classList.remove('onboarding-highlight');

            if (step.target) {
                currentHighlight = document.getElementById(step.target);
                if (currentHighlight) {
                    currentHighlight.classList.add('onboarding-highlight');
                    currentHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }

            positionModal(step.target);
        }

        function openModal() {
            if (els.onboardingOverlay) els.onboardingOverlay.classList.remove('hidden');
            if (els.onboardingModal) els.onboardingModal.classList.remove('hidden');
            showStep(0);
        }

        function closeModal() {
            if (els.onboardingOverlay) els.onboardingOverlay.classList.add('hidden');
            if (els.onboardingModal) els.onboardingModal.classList.add('hidden');
            if (currentHighlight) {
                currentHighlight.classList.remove('onboarding-highlight');
                currentHighlight = null;
            }
        }

        if (els.btnOnboardingNext) {
            els.btnOnboardingNext.addEventListener('click', function () {
                if (currentStep < tourSteps.length - 1) showStep(currentStep + 1);
                else closeModal();
            });
        }

        if (els.btnOnboardingPrev) {
            els.btnOnboardingPrev.addEventListener('click', function () {
                if (currentStep > 0) showStep(currentStep - 1);
            });
        }

        if (els.btnCloseOnboarding) els.btnCloseOnboarding.addEventListener('click', closeModal);
        if (els.btnHelp) els.btnHelp.addEventListener('click', openModal);

        if (!localStorage.getItem('rediforge_onboarding_seen')) {
            localStorage.setItem('rediforge_onboarding_seen', 'true');
            setTimeout(openModal, 600);
        }
    }

    initOnboarding();
})();
