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

        // Add Key Modal
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

        // Edit Key Modal
        modalEditKey: document.getElementById('modal-edit-key'),
        btnCloseEditModal: document.getElementById('btn-close-edit-modal'),
        btnCancelEditKey: document.getElementById('btn-cancel-edit-key'),
        btnSaveEditKey: document.getElementById('btn-save-edit-key'),
        editKeyName: document.getElementById('edit-key-name'),
        editKeyValue: document.getElementById('edit-key-value'),

        // Danger Confirm Modal
        modalConfirmDanger: document.getElementById('modal-confirm-danger'),
        btnCloseDangerModal: document.getElementById('btn-close-danger-modal'),
        btnCancelDanger: document.getElementById('btn-cancel-danger'),
        btnProceedDanger: document.getElementById('btn-proceed-danger'),
        dangerModalMsg: document.getElementById('danger-modal-msg'),

        // Onboarding Tour
        onboardingOverlay: document.getElementById('onboarding-overlay'),
        onboardingModal: document.getElementById('onboarding-modal'),
        btnCloseOnboarding: document.getElementById('btn-close-onboarding'),
        onboardingDotsContainer: document.getElementById('onboarding-dots'),
        btnOnboardingPrev: document.getElementById('btn-onboarding-prev'),
        btnOnboardingNext: document.getElementById('btn-onboarding-next'),
        onboardingTitle: document.getElementById('onboarding-title'),
        onboardingText: document.getElementById('onboarding-text')
    };

    var pendingDangerCommand = null;

    // Event Bindings
    els.btnConnect.addEventListener('click', doConnect);
    els.wsUrl.addEventListener('keydown', function (e) { if (e.key === 'Enter') doConnect(); });
    if (els.wsAuth) {
        els.wsAuth.addEventListener('keydown', function (e) { if (e.key === 'Enter') doConnect(); });
    }
    els.btnDisconnect.addEventListener('click', doDisconnect);

    var defaultWs = (window.location && window.location.host && window.location.protocol.startsWith('http'))
        ? ((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host)
        : 'ws://127.0.0.1:8080';
    els.wsUrl.value = defaultWs;

    setTimeout(doConnect, 100);

    els.terminalInput.addEventListener('keydown', onTerminalKey);
    els.btnClear.addEventListener('click', function () { els.terminalOutput.innerHTML = ''; });
    els.btnRefreshKeys.addEventListener('click', function () { refreshKeys(); });
    els.btnCloseDetail.addEventListener('click', function () {
        els.keyDetail.classList.add('hidden');
        activeInspectKey = null;
        activeInspectType = null;
    });
    els.dbSelect.addEventListener('change', onDbChange);

    // Live search debounce on key filter
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

    // Key Action Modals
    if (els.btnAddKey) {
        els.btnAddKey.addEventListener('click', openAddKeyModal);
        els.btnCloseAddModal.addEventListener('click', closeAddKeyModal);
        els.btnCancelAddKey.addEventListener('click', closeAddKeyModal);
        els.btnSaveAddKey.addEventListener('click', handleCreateKey);
        els.newKeyType.addEventListener('change', onNewKeyTypeChange);
    }

    if (els.btnEditKey) {
        els.btnEditKey.addEventListener('click', openEditKeyModal);
        els.btnCloseEditModal.addEventListener('click', closeEditKeyModal);
        els.btnCancelEditKey.addEventListener('click', closeEditKeyModal);
        els.btnSaveEditKey.addEventListener('click', handleSaveEditKey);
    }

    if (els.btnDeleteKey) {
        els.btnDeleteKey.addEventListener('click', handleDeleteCurrentKey);
    }

    // Danger Confirm Modal Handlers
    if (els.modalConfirmDanger) {
        els.btnCloseDangerModal.addEventListener('click', closeDangerModal);
        els.btnCancelDanger.addEventListener('click', closeDangerModal);
        els.btnProceedDanger.addEventListener('click', executePendingDangerCommand);
    }

    // Window resize for memory chart
    window.addEventListener('resize', function () {
        drawMemoryChart();
    });

    // Navigation smooth scrolling
    var navLinks = {
        'nav-dashboard': 'app',
        'nav-browser': 'tour-browser',
        'nav-cli': 'tour-terminal',
        'nav-settings': 'tour-stats'
    };
    for (var id in navLinks) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', (function(targetId) {
                return function(e) {
                    e.preventDefault();
                    var target = document.getElementById(targetId);
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                };
            })(navLinks[id]));
        }
    }

    function doConnect() {
        els.loginError.textContent = '';
        var rawUrl = els.wsUrl.value.trim();
        var authVal = els.wsAuth ? els.wsAuth.value.trim() : '';

        if (!rawUrl) {
            els.loginError.textContent = 'Please enter the server URL.';
            return;
        }

        if (rawUrl.indexOf('://') < 0) {
            rawUrl = 'ws://' + rawUrl;
        }

        baseUrl = rawUrl.replace(/^ws/, 'http');
        var wsTarget = rawUrl.replace(/^http/, 'ws');
        if (wsTarget.endsWith('/')) wsTarget = wsTarget.slice(0, -1);

        els.btnConnect.textContent = 'Connecting...';
        els.btnConnect.disabled = true;

        try {
            ws = new WebSocket(wsTarget);
        } catch (e) {
            els.loginError.textContent = 'Invalid URL format.';
            els.btnConnect.textContent = 'Connect';
            els.btnConnect.disabled = false;
            return;
        }

        ws.onopen = function () {
            if (authVal) {
                // Check if token or password
                if (authVal.startsWith('eyJ')) {
                    ws.send(JSON.stringify({ auth_token: authVal }));
                } else {
                    sendCommand(['AUTH', authVal], function (authRes) {
                        if (authRes && authRes.error) {
                            addTermLine('Authentication Warning: ' + authRes.error, 'err-line');
                        } else {
                            addTermLine('Authenticated successfully as admin.', 'resp-line');
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
            els.loginError.textContent = 'Connection failed. Check the server URL.';
            els.btnConnect.textContent = 'Connect';
            els.btnConnect.disabled = false;
        };
    }

    function enterDashboard() {
        els.overlay.classList.add('hidden');
        els.app.classList.remove('hidden');
        els.btnConnect.textContent = 'Connect';
        els.btnConnect.disabled = false;
        setConnected();
        addTermLine('Connected to ' + els.wsUrl.value.trim(), 'info-line');
        updateCliPrompt();
        refreshKeys();
        statsInterval = setInterval(pollStats, 2000);
        pollStats();
    }

    function doDisconnect() {
        if (ws) ws.close();
        setDisconnected();
    }

    function setConnected() {
        els.status.textContent = 'Connected';
        els.status.className = 'px-3 py-1 rounded cursor-default neo-inset text-accent-green font-bold text-sm';
        if (els.cliServerLabel) {
            els.cliServerLabel.textContent = 'REDIS CLI - ' + (baseUrl || 'Connected');
        }
    }

    function setDisconnected() {
        els.status.textContent = 'Disconnected';
        els.status.className = 'px-3 py-1 rounded cursor-default neo-inset text-accent-red font-bold text-sm';
        if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
        els.overlay.classList.remove('hidden');
        els.app.classList.add('hidden');
        els.btnConnect.textContent = 'Connect';
        els.btnConnect.disabled = false;
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

            // Handle client-side command routing
            if (cmdName === 'CLEAR') {
                els.terminalOutput.innerHTML = '';
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
                        els.dbSelect.value = String(newDb);
                        updateCliPrompt();
                        refreshKeys();
                    }
                } else if (isWriteCommand(cmdName)) {
                    refreshKeys();
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
            refreshKeys();
        });
    }

    function refreshKeys() {
        var pattern = els.keyFilter.value.trim() || '*';
        var allKeys = [];

        function scanCursor(cursor) {
            sendCommand(['SCAN', String(cursor), 'MATCH', pattern, 'COUNT', '200'], function (res) {
                if (!Array.isArray(res) || res.length < 2) {
                    renderKeyList(allKeys);
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
                    renderKeyList(allKeys);
                } else {
                    scanCursor(nextCursor);
                }
            });
        }

        scanCursor(0);
    }

    function renderKeyList(keys) {
        els.keyList.innerHTML = '';

        if (keys.length === 0) {
            els.keyList.innerHTML = '<div class="p-4 text-center text-[#7E8490] text-xs font-mono">No keys found in db' + currentDb + '</div>';
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

        // Highlight active item
        var items = els.keyList.querySelectorAll('.key-item');
        items.forEach(function (el) { el.classList.remove('active'); });
        var activeEl = document.getElementById('key-item-' + encodeURIComponent(key));
        if (activeEl) activeEl.classList.add('active');

        els.detailKeyName.textContent = key;
        els.detailKeyType.textContent = type;
        els.detailKeyType.className = 'detail-type-badge key-type-' + type;
        els.detailKeyTtl.textContent = 'TTL: ...';

        // Fetch TTL
        sendCommand(['TTL', key], function (ttlRes) {
            if (ttlRes === -1) {
                els.detailKeyTtl.textContent = 'TTL: Persistent';
            } else if (ttlRes === -2) {
                els.detailKeyTtl.textContent = 'TTL: Expired';
            } else if (typeof ttlRes === 'number') {
                els.detailKeyTtl.textContent = 'TTL: ' + ttlRes + 's';
            }
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

            els.detailContent.textContent = formatted.trim() || '(empty)';
            els.keyDetail.classList.remove('hidden');
        });
    }

    function handleDeleteCurrentKey() {
        if (!activeInspectKey) return;
        var keyToDelete = activeInspectKey;
        if (confirm('Are you sure you want to delete key "' + keyToDelete + '"?')) {
            sendCommand(['DEL', keyToDelete], function (res) {
                addTermLine('DEL ' + keyToDelete + ' -> ' + res, 'info-line');
                els.keyDetail.classList.add('hidden');
                activeInspectKey = null;
                activeInspectType = null;
                refreshKeys();
            });
        }
    }

    function openEditKeyModal() {
        if (!activeInspectKey) return;
        els.editKeyName.value = activeInspectKey;
        els.editKeyValue.value = els.detailContent.textContent;
        els.modalEditKey.classList.remove('hidden');
    }

    function closeEditKeyModal() {
        els.modalEditKey.classList.add('hidden');
    }

    function handleSaveEditKey() {
        var key = els.editKeyName.value.trim();
        var val = els.editKeyValue.value;

        if (!key) return;

        if (activeInspectType === 'string') {
            sendCommand(['SET', key, val], function (res) {
                closeEditKeyModal();
                inspectKey(key, 'string');
                addTermLine('Updated key ' + key, 'info-line');
            });
        } else {
            // For complex types, prompt to use CLI or set as string
            sendCommand(['SET', key, val], function (res) {
                closeEditKeyModal();
                refreshKeys();
                inspectKey(key, 'string');
                addTermLine('Updated key ' + key + ' to string', 'info-line');
            });
        }
    }

    function openAddKeyModal() {
        els.newKeyName.value = '';
        els.newKeyValue.value = '';
        els.newKeyTtl.value = '';
        els.newKeyType.value = 'string';
        onNewKeyTypeChange();
        els.modalAddKey.classList.remove('hidden');
        els.newKeyName.focus();
    }

    function closeAddKeyModal() {
        els.modalAddKey.classList.add('hidden');
    }

    function onNewKeyTypeChange() {
        var type = els.newKeyType.value;
        if (type === 'string') {
            els.newKeyValLabel.textContent = 'Value';
            els.newKeyValue.placeholder = 'Enter string value...';
            els.newKeyHint.textContent = 'Raw string payload.';
        } else if (type === 'hash') {
            els.newKeyValLabel.textContent = 'Field & Value (field: value per line)';
            els.newKeyValue.placeholder = 'field1: value1\nfield2: value2';
            els.newKeyHint.textContent = 'Enter field: value pairs separated by newlines.';
        } else if (type === 'list') {
            els.newKeyValLabel.textContent = 'List Items (one item per line)';
            els.newKeyValue.placeholder = 'item1\nitem2\nitem3';
            els.newKeyHint.textContent = 'Items will be appended in order (RPUSH).';
        } else if (type === 'set') {
            els.newKeyValLabel.textContent = 'Set Members (one member per line)';
            els.newKeyValue.placeholder = 'member1\nmember2';
            els.newKeyHint.textContent = 'Unique set members.';
        } else if (type === 'zset') {
            els.newKeyValLabel.textContent = 'Member & Score (member: score per line)';
            els.newKeyValue.placeholder = 'player1: 100\nplayer2: 250';
            els.newKeyHint.textContent = 'Enter member: score pairs.';
        }
    }

    function handleCreateKey() {
        var key = els.newKeyName.value.trim();
        var type = els.newKeyType.value;
        var rawVal = els.newKeyValue.value;
        var ttl = parseInt(els.newKeyTtl.value, 10);

        if (!key) {
            alert('Please specify a key name.');
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
            if (cmd.length <= 2) {
                alert('Please provide at least one field: value pair for hash.');
                return;
            }
        } else if (type === 'list') {
            cmd = ['RPUSH', key].concat(lines);
            if (cmd.length <= 2) {
                alert('Please provide at least one list item.');
                return;
            }
        } else if (type === 'set') {
            cmd = ['SADD', key].concat(lines);
            if (cmd.length <= 2) {
                alert('Please provide at least one set member.');
                return;
            }
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
            if (cmd.length <= 2) {
                alert('Please provide at least one score & member pair.');
                return;
            }
        }

        sendCommand(cmd, function (res) {
            if (ttl && !isNaN(ttl) && ttl > 0) {
                sendCommand(['EXPIRE', key, String(ttl)]);
            }
            closeAddKeyModal();
            refreshKeys();
            inspectKey(key, type);
            addTermLine('Created ' + type + ' key: ' + key, 'info-line');
        });
    }

    function promptDangerConfirmation(cmdParts, reason) {
        pendingDangerCommand = cmdParts;
        if (els.dangerModalMsg) {
            els.dangerModalMsg.textContent = reason || 'You are about to execute a destructive command. This action cannot be undone.';
        }
        if (els.modalConfirmDanger) {
            els.modalConfirmDanger.classList.remove('hidden');
        }
    }

    function closeDangerModal() {
        pendingDangerCommand = null;
        if (els.modalConfirmDanger) {
            els.modalConfirmDanger.classList.add('hidden');
        }
    }

    function executePendingDangerCommand() {
        if (!pendingDangerCommand) return;
        var cmd = pendingDangerCommand;
        closeDangerModal();

        sendCommand(cmd, function (res) {
            renderResponse(res);
            refreshKeys();
        }, true);
    }

    function pollStats() {
        if (!baseUrl) return;

        var url = baseUrl.replace(/\/$/, '') + '/stats';

        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (stats) {
                els.statMemory.textContent = stats.used_memory_human || '--';
                els.statClients.textContent = String(stats.connected_clients || 0);
                els.statKeys.textContent = String(stats.total_keys || 0);
                els.statNode.textContent = stats.node_version ? 'Node ' + stats.node_version : 'RediForge';
                els.statsUptime.textContent = formatUptime(stats.uptime_seconds || 0);

                // Update memory bar
                var usedMem = stats.used_memory || 0;
                var maxMem = (stats.databases && stats.databases.length > 0) ? 104857600 : 52428800; // 50MB-100MB baseline
                var pct = Math.min(100, Math.max(5, Math.round((usedMem / maxMem) * 100)));
                if (els.statMemBar) {
                    els.statMemBar.style.width = pct + '%';
                }
                if (els.statMemTotal) {
                    els.statMemTotal.textContent = stats.used_memory_rss ? formatBytes(stats.used_memory_rss) + ' RSS' : 'RSS';
                }

                if (memoryHistory.length === 0) {
                    for (var s = 0; s < 12; s++) {
                        memoryHistory.push(usedMem);
                    }
                } else {
                    memoryHistory.push(usedMem);
                }
                if (memoryHistory.length > MAX_MEM_POINTS) memoryHistory.shift();
                drawMemoryChart();
            })
            .catch(function () {});
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'K';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + 'M';
        return (bytes / 1073741824).toFixed(2) + 'G';
    }

    function formatUptime(sec) {
        var d = Math.floor(sec / 86400);
        var h = Math.floor((sec % 86400) / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;
        if (d > 0) return d + 'd ' + h + 'h';
        if (h > 0) return h + 'h ' + m + 'm';
        if (m > 0) return m + 'm ' + s + 's';
        return s + 's';
    }

    function drawMemoryChart() {
        var linePath = els.memLinePath || document.getElementById('mem-line-path');
        var areaPath = els.memAreaPath || document.getElementById('mem-area-path');
        var point = els.memLatestPoint || document.getElementById('mem-latest-point');
        var scaleMax = els.scaleMax || document.getElementById('scale-max');
        var scaleMid = els.scaleMid || document.getElementById('scale-mid');
        var scaleMin = els.scaleMin || document.getElementById('scale-min');
        var peakEl = els.chartPeakMem || document.getElementById('chart-peak-mem');
        var currEl = els.chartCurrentMem || document.getElementById('chart-current-mem');

        if (!linePath || memoryHistory.length === 0) return;

        var points = memoryHistory;
        if (points.length === 1) points = [points[0], points[0]];

        var maxVal = Math.max.apply(null, points);
        var minVal = Math.min.apply(null, points);
        var currentVal = points[points.length - 1];

        if (currEl) currEl.textContent = formatBytes(currentVal);
        if (peakEl) peakEl.textContent = formatBytes(maxVal);

        // Dynamic headroom so graph never clips at top or bottom
        var diff = maxVal - minVal;
        var headroom = diff === 0 ? Math.max(1024, maxVal * 0.25) : diff * 0.3;
        var ceil = maxVal + headroom;
        var floor = Math.max(0, minVal - headroom);
        if (ceil <= floor) ceil = floor + 1024;

        if (scaleMax) scaleMax.textContent = formatBytes(ceil);
        if (scaleMid) scaleMid.textContent = formatBytes((ceil + floor) / 2);
        if (scaleMin) scaleMin.textContent = formatBytes(floor);

        var totalW = 500;
        var totalH = 140;
        var padY = 12;
        var usableH = totalH - padY * 2;
        var step = totalW / Math.max(1, points.length - 1);

        var pathCmds = [];
        var lastX = 0;
        var lastY = totalH - padY;

        for (var i = 0; i < points.length; i++) {
            var x = Math.round(i * step * 10) / 10;
            var ratio = (points[i] - floor) / (ceil - floor);
            ratio = Math.max(0, Math.min(1, ratio));
            var y = Math.round((totalH - padY - (ratio * usableH)) * 10) / 10;

            if (i === 0) {
                pathCmds.push('M ' + x + ' ' + y);
            } else {
                pathCmds.push('L ' + x + ' ' + y);
            }
            lastX = x;
            lastY = y;
        }

        var strokeD = pathCmds.join(' ');
        linePath.setAttribute('d', strokeD);

        if (areaPath) {
            var fillD = strokeD + ' L ' + lastX + ' ' + totalH + ' L 0 ' + totalH + ' Z';
            areaPath.setAttribute('d', fillD);
        }

        if (point) {
            point.setAttribute('cx', String(lastX));
            point.setAttribute('cy', String(lastY));
        }
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

        els.onboardingDotsContainer.innerHTML = '';
        for (var i = 0; i < tourSteps.length; i++) {
            var dot = document.createElement('div');
            dot.className = 'w-2 h-2 rounded-full transition-colors duration-300 ' + (i === 0 ? 'bg-accent-blue' : 'bg-[#C4C9D4]');
            els.onboardingDotsContainer.appendChild(dot);
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

            els.onboardingTitle.innerHTML = '<span class="material-symbols-outlined">explore</span> ' + step.title;
            els.onboardingText.textContent = step.text;

            var dots = els.onboardingDotsContainer.children;
            for (var j = 0; j < dots.length; j++) {
                dots[j].className = 'w-2 h-2 rounded-full transition-colors duration-300 ' + (j === stepIdx ? 'bg-accent-blue' : 'bg-[#C4C9D4]');
            }

            els.btnOnboardingPrev.classList.toggle('hidden', stepIdx === 0);
            els.btnOnboardingNext.textContent = stepIdx === tourSteps.length - 1 ? "Got it!" : "Next";

            if (currentHighlight) {
                currentHighlight.classList.remove('onboarding-highlight');
            }

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
            els.onboardingOverlay.classList.remove('hidden');
            els.onboardingModal.classList.remove('hidden');
            showStep(0);
        }

        function closeModal() {
            els.onboardingOverlay.classList.add('hidden');
            els.onboardingModal.classList.add('hidden');
            if (currentHighlight) {
                currentHighlight.classList.remove('onboarding-highlight');
                currentHighlight = null;
            }
        }

        els.btnOnboardingNext.addEventListener('click', function () {
            if (currentStep < tourSteps.length - 1) {
                showStep(currentStep + 1);
            } else {
                closeModal();
            }
        });

        els.btnOnboardingPrev.addEventListener('click', function () {
            if (currentStep > 0) {
                showStep(currentStep - 1);
            }
        });

        els.btnCloseOnboarding.addEventListener('click', closeModal);
        if (els.btnHelp) {
            els.btnHelp.addEventListener('click', openModal);
        }

        if (!localStorage.getItem('rediforge_onboarding_seen')) {
            localStorage.setItem('rediforge_onboarding_seen', 'true');
            setTimeout(openModal, 600);
        }
    }

    initOnboarding();
})();
