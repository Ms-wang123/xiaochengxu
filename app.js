// ========================================
// 电池检测报价查询 - 主逻辑
// 支持本地服务器模式和GitHub Pages静态模式
// ========================================

(function() {
    'use strict';

    // ===== DOM 元素 =====
    var searchInput = document.getElementById('searchInput');
    var clearBtn = document.getElementById('clearBtn');
    var suggestionsEl = document.getElementById('suggestions');
    var resultSection = document.getElementById('resultSection');
    var emptyState = document.getElementById('emptyState');
    var notFound = document.getElementById('notFound');
    var loadingEl = document.getElementById('loading');
    var saveBtn = document.getElementById('saveBtn');
    var saveMsg = document.getElementById('saveMsg');
    var excelPathInfo = document.getElementById('excelPathInfo');

    var sheetTabs = document.getElementById('sheetTabs');
    var excelTable = document.getElementById('excelTable');
    var excelTableHead = document.getElementById('excelTableHead');
    var excelTableBody = document.getElementById('excelTableBody');
    var tableLoading = document.getElementById('tableLoading');
    var tableInfo = document.getElementById('tableInfo');

    var loginBtn = document.getElementById('loginBtn');
    var logoutBtn = document.getElementById('logoutBtn');
    var loginModal = document.getElementById('loginModal');
    var closeLoginBtn = document.getElementById('closeLoginBtn');
    var loginPassword = document.getElementById('loginPassword');
    var doLoginBtn = document.getElementById('doLoginBtn');
    var loginError = document.getElementById('loginError');
    var editPriceSection = document.getElementById('editPriceSection');

    var exportBtn = document.getElementById('exportBtn');

    var debounceTimer = null;
    var currentItem = null;
    var currentSheet = null;
    var allSheets = [];
    var isAdmin = false;
    var staticData = null;       // 静态数据（data.json）
    var useStaticData = false;   // 是否使用静态数据模式
    var staticIndex = {};        // 静态搜索索引

    // 从 localStorage 检查登录状态
    var savedAdmin = localStorage.getItem('battery_admin');
    if (savedAdmin === 'true') {
        isAdmin = true;
    }

    // ===== 数据加载模式检测 =====
    function initDataMode() {
        // 先尝试从静态 data.json 加载
        return fetch('data.json')
            .then(function(res) {
                if (res.ok) {
                    useStaticData = true;
                    return res.json();
                }
                throw new Error('no_static_data');
            })
            .then(function(data) {
                staticData = data;
                buildStaticIndex();
                console.log('静态数据模式: ' + Object.keys(staticIndex).length + ' 条标准, ' + data.sheets.length + ' 个Sheet');
            })
            .catch(function() {
                // 没有 data.json，尝试服务器模式
                useStaticData = false;
                console.log('服务器模式');
                return Promise.resolve();
            });
    }

    function buildStaticIndex() {
        if (!staticData || !staticData.prices) return;
        staticIndex = {};
        for (var stdName in staticData.prices) {
            if (staticData.prices.hasOwnProperty(stdName)) {
                var p = staticData.prices[stdName];
                // 提取标准编号
                var stdId = extractStandardId(stdName);
                // 用多个键建立索引
                var keys = [stdName, stdName.toLowerCase()];
                if (stdId) {
                    keys.push(stdId);
                    keys.push(stdId.toLowerCase());
                }
                for (var i = 0; i < keys.length; i++) {
                    staticIndex[keys[i]] = p;
                }
            }
        }
    }

    function extractStandardId(name) {
        if (!name) return '';
        // 匹配标准编号: IEC 62619, GB/T 31241, UN38.3, UL 1642 等
        var m = name.match(/(?:IEC|GB\/T|GB|UL|UN|QC\/T|SJ\/T|MT\/T)\s*[\d.]+/i);
        if (m) return m[0];
        m = name.match(/[A-Z]+\s*[\d.]+/);
        if (m) return m[0];
        // 纯数字
        m = name.match(/(\d{4,})/);
        if (m) return m[1];
        return '';
    }

    // ===== 通用 fetch 包装 =====
    function fetchWithRetry(url, options, retries) {
        retries = retries === undefined ? 2 : retries;
        var controller = new AbortController();
        var timeout = setTimeout(function() { controller.abort(); }, 30000);
        var fetchOptions = Object.assign({}, options || {}, { signal: controller.signal });

        return fetch(url, fetchOptions)
            .then(function(res) {
                clearTimeout(timeout);
                return res;
            })
            .catch(function(err) {
                clearTimeout(timeout);
                if (retries > 0 && (err.name === 'AbortError' || err.message === 'Failed to fetch')) {
                    console.warn('请求失败，重试中... 剩余重试次数:', retries);
                    return new Promise(function(resolve) { setTimeout(resolve, 1000); })
                        .then(function() { return fetchWithRetry(url, options, retries - 1); });
                }
                throw err;
            });
    }

    // ===== 搜索逻辑 =====
    function search(query) {
        var q = query.trim();
        if (!q) {
            showEmpty();
            return;
        }

        if (useStaticData) {
            searchStatic(q);
            return;
        }

        // 服务器模式
        if (typeof search_index !== 'undefined' && search_index[q]) {
            showResult(search_index[q]);
            return;
        }
        var qLower = q.toLowerCase();
        if (typeof search_index !== 'undefined' && search_index[qLower]) {
            showResult(search_index[qLower]);
            return;
        }
        if (typeof search_index !== 'undefined') {
            var matches = [];
            for (var key in search_index) {
                if (search_index.hasOwnProperty(key)) {
                    if (key.toLowerCase().indexOf(qLower) !== -1) {
                        matches.push({ key: key, item: search_index[key] });
                    }
                }
            }
            var seen = new Set();
            var uniqueMatches = [];
            for (var i = 0; i < matches.length; i++) {
                if (!seen.has(matches[i].item.id)) {
                    seen.add(matches[i].item.id);
                    uniqueMatches.push(matches[i]);
                }
            }
            if (uniqueMatches.length === 1) {
                showResult(uniqueMatches[0].item);
                return;
            } else if (uniqueMatches.length > 1) {
                showSuggestions(uniqueMatches);
                return;
            }
        }
        showNotFound();
    }

    function searchStatic(query) {
        var q = query.trim().toLowerCase();

        // 精确匹配
        if (staticIndex[q]) {
            showStaticResult(staticIndex[q]);
            return;
        }

        // 模糊匹配
        var matches = [];
        for (var key in staticIndex) {
            if (staticIndex.hasOwnProperty(key)) {
                if (key.toLowerCase().indexOf(q) !== -1) {
                    matches.push({ key: key, price: staticIndex[key] });
                }
            }
        }

        // 去重（按 title）
        var seen = new Set();
        var uniqueMatches = [];
        for (var i = 0; i < matches.length; i++) {
            if (!seen.has(matches[i].price.title)) {
                seen.add(matches[i].price.title);
                uniqueMatches.push(matches[i]);
            }
        }

        if (uniqueMatches.length === 1) {
            showStaticResult(uniqueMatches[0].price);
        } else if (uniqueMatches.length > 1) {
            showStaticSuggestions(uniqueMatches);
        } else {
            showNotFound();
        }
    }

    function showStaticResult(priceData) {
        hideAll();
        var item = {
            name: priceData.title || '',
            category: priceData.sheet || '',
            cellCount: priceData.sample_cell || '',
            batteryCount: priceData.sample_battery || '',
            period: priceData.cycle || '',
            cellPrice: priceData.cell_price || '',
            batteryPrice: priceData.battery_price || '',
            industryPrice: priceData.industry_price || '',
            certFee: priceData.cert_fee || '',
            totalPrice: priceData.weikai_quote || '',
            remark: priceData.remarks || '',
            id: extractStandardId(priceData.title)
        };
        showResult(item);
    }

    function showStaticSuggestions(matches) {
        hideAll();
        suggestionsEl.style.display = 'block';
        suggestionsEl.innerHTML = matches.slice(0, 8).map(function(m) {
            var id = extractStandardId(m.price.title) || '';
            return '<div class="suggestion-item" data-key="' + m.key + '">' +
                '<span class="suggestion-code">' + id + '</span>' +
                '<span class="suggestion-name">' + m.price.title + '</span>' +
                '<span class="suggestion-cat">' + (m.price.sheet || '') + '</span>' +
                '</div>';
        }).join('');

        suggestionsEl.querySelectorAll('.suggestion-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var key = el.dataset.key;
                if (staticIndex[key]) {
                    showStaticResult(staticIndex[key]);
                    searchInput.value = extractStandardId(staticIndex[key].title);
                    clearBtn.style.display = 'flex';
                    suggestionsEl.style.display = 'none';
                }
            });
        });
    }

    function showResult(item) {
        hideAll();
        currentItem = item;
        resultSection.style.display = 'block';
        suggestionsEl.style.display = 'none';

        document.getElementById('resultName').textContent = (item.category ? '[' + item.category + '] ' : '') + (item.name || '');

        var samples = [];
        if (item.cellCount && item.cellCount !== '0') samples.push('电芯' + item.cellCount);
        if (item.batteryCount && item.batteryCount !== '0') samples.push('电池组/系统' + item.batteryCount);
        document.getElementById('resultSamples').textContent = samples.join('，') || '详见备注';

        document.getElementById('resultPeriod').textContent = item.period || '详见备注';

        var priceParts = [];
        if (item.cellPrice && item.cellPrice !== '0') {
            priceParts.push('电芯：' + Number(item.cellPrice).toLocaleString() + ' RMB');
        }
        if (item.batteryPrice && item.batteryPrice !== '0') {
            priceParts.push('电池组/系统：' + Number(item.batteryPrice).toLocaleString() + ' RMB');
        }
        document.getElementById('resultPrice').textContent = priceParts.join('，') || '详见备注';

        var indLine = document.getElementById('industryLine');
        if (item.industryPrice) {
            indLine.style.display = 'block';
            document.getElementById('resultIndustryPrice').innerHTML = formatMultiline(item.industryPrice);
        } else {
            indLine.style.display = 'none';
        }

        var certLine = document.getElementById('certFeeLine');
        if (item.certFee) {
            certLine.style.display = 'block';
            document.getElementById('resultCertFee').innerHTML = formatMultiline(item.certFee);
        } else {
            certLine.style.display = 'none';
        }

        var tpLine = document.getElementById('totalPriceLine');
        if (item.totalPrice) {
            tpLine.style.display = 'block';
            document.getElementById('resultTotalPrice').innerHTML = formatMultiline(item.totalPrice);
        } else {
            tpLine.style.display = 'none';
        }

        var rmLine = document.getElementById('remarkLine');
        if (item.remark) {
            rmLine.style.display = 'block';
            document.getElementById('resultRemark').innerHTML = formatMultiline(item.remark);
        } else {
            rmLine.style.display = 'none';
        }

        if (isAdmin) {
            editPriceSection.style.display = 'block';
            document.getElementById('editCellPrice').value = formatPriceValue(item.cellPrice);
            document.getElementById('editBatteryPrice').value = formatPriceValue(item.batteryPrice);
        } else {
            editPriceSection.style.display = 'none';
        }

        saveMsg.textContent = '';
        saveMsg.className = 'save-msg';
        excelPathInfo.style.display = 'none';

        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function formatMultiline(text) {
        if (!text) return '';
        // 将换行符转为 <br>，保留多行显示
        return text.replace(/\n/g, '<br>');
    }

    function formatPriceValue(price) {
        if (!price || price === '0' || price === '') return '';
        return price;
    }

    function showSuggestions(matches) {
        hideAll();
        suggestionsEl.style.display = 'block';
        suggestionsEl.innerHTML = matches.slice(0, 8).map(function(m) {
            return '<div class="suggestion-item" data-id="' + m.item.id + '">' +
                '<span class="suggestion-code">' + m.item.id + '</span>' +
                '<span class="suggestion-name">' + m.item.name + '</span>' +
                '<span class="suggestion-cat">' + m.item.category + '</span>' +
                '</div>';
        }).join('');

        suggestionsEl.querySelectorAll('.suggestion-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var id = el.dataset.id;
                if (typeof search_index !== 'undefined') {
                    for (var k in search_index) {
                        if (search_index.hasOwnProperty(k) && search_index[k].id === id) {
                            searchInput.value = k;
                            showResult(search_index[k]);
                            clearBtn.style.display = 'flex';
                            suggestionsEl.style.display = 'none';
                            break;
                        }
                    }
                }
            });
        });
    }

    function showEmpty() {
        hideAll();
        emptyState.style.display = 'block';
    }

    function showNotFound() {
        hideAll();
        notFound.style.display = 'block';
    }

    function hideAll() {
        resultSection.style.display = 'none';
        emptyState.style.display = 'none';
        notFound.style.display = 'none';
        loadingEl.style.display = 'none';
        suggestionsEl.style.display = 'none';
    }

    // ===== 保存价格 =====
    saveBtn.addEventListener('click', function() {
        if (!currentItem) return;

        var cellPrice = document.getElementById('editCellPrice').value.trim();
        var batteryPrice = document.getElementById('editBatteryPrice').value.trim();

        if (!cellPrice && !batteryPrice) {
            saveMsg.textContent = '请至少输入一个价格';
            saveMsg.className = 'save-msg error';
            return;
        }

        if (useStaticData) {
            // 静态模式：提示需要后端
            saveMsg.textContent = '静态模式下无法保存价格，请使用本地服务器';
            saveMsg.className = 'save-msg error';
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        saveMsg.textContent = '';
        saveMsg.className = 'save-msg';

        fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                standard: currentItem.name,
                cellPrice: cellPrice,
                batteryPrice: batteryPrice
            })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.success) {
                saveMsg.textContent = '✓ ' + data.message;
                saveMsg.className = 'save-msg success';
                excelPathInfo.style.display = 'block';
                if (cellPrice) currentItem.cellPrice = cellPrice;
                if (batteryPrice) currentItem.batteryPrice = batteryPrice;
                showResult(currentItem);
            } else {
                saveMsg.textContent = '✗ ' + data.message;
                saveMsg.className = 'save-msg error';
                excelPathInfo.style.display = 'none';
            }
        })
        .catch(function(err) {
            saveMsg.textContent = '✗ 保存失败: ' + err.message;
            saveMsg.className = 'save-msg error';
        })
        .finally(function() {
            saveBtn.disabled = false;
            saveBtn.textContent = '修改报价';
        });
    });

    // ===== Sheet 标签 + 表格 =====
    function loadSheetTabs() {
        sheetTabs.innerHTML = '<div class="sheet-tabs-loading">加载Sheet列表中...</div>';

        if (useStaticData) {
            loadSheetTabsStatic();
            return;
        }

        fetchWithRetry('/api/sheets')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.success && data.data) {
                    allSheets = data.data;
                    renderSheetTabs(data.data);
                    if (data.data.length > 0) {
                        switchSheet(data.data[0].name);
                    }
                } else {
                    sheetTabs.innerHTML = '<div class="sheet-tabs-error">加载失败，请刷新重试</div>';
                }
            })
            .catch(function(err) {
                var errMsg = err.message || '未知错误';
                var helpText = '';
                if (errMsg === 'Failed to fetch' || err.name === 'AbortError') {
                    helpText = '<br><small style="color:#5f6368;">请确认：<br>1. 服务器是否已启动<br>2. 是否通过 http://localhost:8765 访问<br>3. 网络连接是否正常</small>';
                }
                sheetTabs.innerHTML = '<div class="sheet-tabs-error">加载失败: ' + errMsg + helpText + '</div>';
            });
    }

    function loadSheetTabsStatic() {
        if (!staticData || !staticData.sheets) {
            sheetTabs.innerHTML = '<div class="sheet-tabs-error">无法加载数据</div>';
            return;
        }
        allSheets = staticData.sheets;
        renderSheetTabs(staticData.sheets);
        if (staticData.sheets.length > 0) {
            switchSheetStatic(staticData.sheets[0].name);
        }
    }

    function renderSheetTabs(sheets) {
        sheetTabs.innerHTML = sheets.map(function(s) {
            return '<button class="sheet-tab" data-sheet="' + s.name + '" title="' + s.rows + '行 × ' + s.cols + '列">' +
                s.name + '<small>' + s.rows + '行</small>' +
                '</button>';
        }).join('');
    }

    function switchSheet(sheetName) {
        currentSheet = sheetName;

        sheetTabs.querySelectorAll('.sheet-tab').forEach(function(tab) {
            tab.classList.toggle('active', tab.dataset.sheet === sheetName);
        });

        tableLoading.style.display = 'flex';
        tableLoading.innerHTML = '<div class="spinner"></div><p>加载中...</p>';
        excelTable.style.display = 'none';
        tableInfo.style.display = 'none';

        if (useStaticData) {
            switchSheetStatic(sheetName);
            return;
        }

        fetchWithRetry('/api/full-sheet?sheet=' + encodeURIComponent(sheetName))
            .then(function(res) { return res.json(); })
            .then(function(data) {
                tableLoading.style.display = 'none';
                if (data.success && data.data) {
                    renderFullTable(data.data);
                } else {
                    tableLoading.innerHTML = '<p style="color:#ea4335;">⚠ ' + (data.message || '加载失败，请刷新重试') + '</p>';
                }
            })
            .catch(function(err) {
                tableLoading.style.display = 'none';
                var errMsg = err.message || '未知错误';
                if (errMsg === 'Failed to fetch' || err.name === 'AbortError') {
                    errMsg = '连接服务器失败，请检查服务器是否运行';
                }
                tableLoading.innerHTML = '<p style="color:#ea4335;">⚠ ' + errMsg + '</p><p style="font-size:12px;color:#5f6368;margin-top:4px;">请确认通过 http://localhost:8765 访问</p>';
            });
    }

    function switchSheetStatic(sheetName) {
        currentSheet = sheetName;

        sheetTabs.querySelectorAll('.sheet-tab').forEach(function(tab) {
            tab.classList.toggle('active', tab.dataset.sheet === sheetName);
        });

        tableLoading.style.display = 'flex';
        tableLoading.innerHTML = '<div class="spinner"></div><p>加载中...</p>';
        excelTable.style.display = 'none';
        tableInfo.style.display = 'none';

        if (staticData && staticData.full_sheets && staticData.full_sheets[sheetName]) {
            tableLoading.style.display = 'none';
            renderFullTable(staticData.full_sheets[sheetName]);
        } else {
            tableLoading.innerHTML = '<p style="color:#ea4335;">⚠ Sheet "' + sheetName + '" 不存在</p>';
        }
    }

    function renderFullTable(tableData) {
        var headers = tableData.headers;
        var rows = tableData.rows;
        var sheet = tableData.sheet;
        var total_rows = tableData.total_rows;
        var total_cols = tableData.total_cols;

        var headerHtml = ['<tr>'];
        headers.forEach(function(h) {
            headerHtml.push('<th>' + (h.label || '') + '</th>');
        });
        headerHtml.push('</tr>');
        excelTableHead.innerHTML = headerHtml.join('');

        var bodyHtml = [];
        rows.forEach(function(row) {
            bodyHtml.push('<tr>');
            row.cells.forEach(function(cell) {
                var cls = '';
                var displayVal = cell.value;

                if (cell.is_number && cell.value !== '0' && cell.value !== '' && (cell.col >= 7 && cell.col <= 11)) {
                    cls = ' class="price-cell"';
                    displayVal = Number(cell.value).toLocaleString();
                }

                bodyHtml.push('<td' + cls + '>' + displayVal + '</td>');
            });
            bodyHtml.push('</tr>');
        });
        excelTableBody.innerHTML = bodyHtml.join('');

        tableInfo.style.display = 'block';
        tableInfo.textContent = 'Sheet: ' + sheet + ' | 共 ' + rows.length + ' 行数据 | ' + total_cols + ' 列';

        excelTable.style.display = 'table';
    }

    // ===== 导出Excel =====
    function exportExcel() {
        if (useStaticData) {
            // 静态模式：下载Excel原始文件
            var link = document.createElement('a');
            link.href = '报价-2025.9.9.xlsx';
            link.download = '报价-2025.9.9.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showExportToast();
            return;
        }

        var link = document.createElement('a');
        link.href = '/api/export';
        link.download = '报价-2025.9.9.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showExportToast();
    }

    function showExportToast() {
        var toast = document.getElementById('exportToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'exportToast';
            toast.className = 'export-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = 'Excel 导出中...';
        toast.classList.add('show');
        setTimeout(function() {
            toast.classList.remove('show');
        }, 2000);
    }

    // ===== 登录/权限 =====
    function updateLoginUI() {
        if (isAdmin) {
            loginBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-block';
        } else {
            loginBtn.style.display = 'inline-block';
            logoutBtn.style.display = 'none';
        }
        if (currentItem && resultSection.style.display !== 'none') {
            if (isAdmin) {
                editPriceSection.style.display = 'block';
                document.getElementById('editCellPrice').value = formatPriceValue(currentItem.cellPrice);
                document.getElementById('editBatteryPrice').value = formatPriceValue(currentItem.batteryPrice);
            } else {
                editPriceSection.style.display = 'none';
            }
        }
    }

    function openLoginModal() {
        loginModal.style.display = 'block';
        loginPassword.value = '';
        loginError.style.display = 'none';
        loginPassword.focus();
    }

    function closeLoginModal() {
        loginModal.style.display = 'none';
    }

    function doLogin() {
        var pwd = loginPassword.value.trim();
        if (!pwd) {
            loginError.textContent = '请输入密码';
            loginError.style.display = 'block';
            return;
        }

        if (useStaticData) {
            // 静态模式：前端校验密码
            if (pwd === 'battery2025') {
                isAdmin = true;
                localStorage.setItem('battery_admin', 'true');
                updateLoginUI();
                closeLoginModal();
            } else {
                loginError.textContent = '密码错误';
                loginError.style.display = 'block';
            }
            return;
        }

        fetchWithRetry('/api/login?password=' + encodeURIComponent(pwd))
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.success) {
                    isAdmin = true;
                    localStorage.setItem('battery_admin', 'true');
                    updateLoginUI();
                    closeLoginModal();
                } else {
                    loginError.textContent = data.message || '密码错误';
                    loginError.style.display = 'block';
                }
            })
            .catch(function(err) {
                loginError.textContent = '登录失败: ' + err.message;
                loginError.style.display = 'block';
            });
    }

    function doLogout() {
        isAdmin = false;
        localStorage.removeItem('battery_admin');
        updateLoginUI();
    }

    // ===== 事件处理 =====
    searchInput.addEventListener('input', function() {
        var val = this.value.trim();
        clearBtn.style.display = val ? 'flex' : 'none';

        clearTimeout(debounceTimer);
        if (val) {
            loadingEl.style.display = 'block';
            emptyState.style.display = 'none';
            notFound.style.display = 'none';
            resultSection.style.display = 'none';
            suggestionsEl.style.display = 'none';

            debounceTimer = setTimeout(function() {
                loadingEl.style.display = 'none';
                search(val);
            }, 200);
        } else {
            loadingEl.style.display = 'none';
            showEmpty();
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            clearTimeout(debounceTimer);
            loadingEl.style.display = 'none';
            search(this.value);
        }
    });

    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        showEmpty();
        searchInput.focus();
    });

    document.querySelectorAll('.hint-tag').forEach(function(tag) {
        tag.addEventListener('click', function() {
            var hint = this.dataset.hint;
            searchInput.value = hint;
            clearBtn.style.display = 'flex';
            search(hint);
            searchInput.focus();
        });
    });

    sheetTabs.addEventListener('click', function(e) {
        var tab = e.target.closest('.sheet-tab');
        if (tab && tab.dataset.sheet) {
            switchSheet(tab.dataset.sheet);
        }
    });

    exportBtn.addEventListener('click', exportExcel);

    loginBtn.addEventListener('click', openLoginModal);
    logoutBtn.addEventListener('click', doLogout);
    closeLoginBtn.addEventListener('click', closeLoginModal);
    doLoginBtn.addEventListener('click', doLogin);
    loginPassword.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doLogin();
    });
    loginModal.querySelector('.modal-overlay').addEventListener('click', closeLoginModal);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && loginModal.style.display === 'block') {
            closeLoginModal();
        }
    });

    // ===== 初始化 =====
    updateLoginUI();
    showEmpty();
    searchInput.focus();

    // 先检测数据模式，再加载
    initDataMode().then(function() {
        loadSheetTabs();
    });

})();
