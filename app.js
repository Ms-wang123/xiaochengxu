// ========================================
// 电池检测报价查询 - 主逻辑
// ========================================

(function() {
    'use strict';

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearBtn');
    const suggestionsEl = document.getElementById('suggestions');
    const resultSection = document.getElementById('resultSection');
    const emptyState = document.getElementById('emptyState');
    const notFound = document.getElementById('notFound');
    const loadingEl = document.getElementById('loading');
    const saveBtn = document.getElementById('saveBtn');
    const saveMsg = document.getElementById('saveMsg');
    const excelPathInfo = document.getElementById('excelPathInfo');

    // 首页表格相关
    const sheetTabs = document.getElementById('sheetTabs');
    const excelTable = document.getElementById('excelTable');
    const excelTableHead = document.getElementById('excelTableHead');
    const excelTableBody = document.getElementById('excelTableBody');
    const tableLoading = document.getElementById('tableLoading');
    const tableInfo = document.getElementById('tableInfo');

    // 登录相关
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginModal = document.getElementById('loginModal');
    const closeLoginBtn = document.getElementById('closeLoginBtn');
    const loginPassword = document.getElementById('loginPassword');
    const doLoginBtn = document.getElementById('doLoginBtn');
    const loginError = document.getElementById('loginError');
    const editPriceSection = document.getElementById('editPriceSection');

    const exportBtn = document.getElementById('exportBtn');

    let debounceTimer = null;
    let currentItem = null;
    let currentSheet = null;
    let allSheets = [];
    let isAdmin = false;

    // 从 localStorage 检查登录状态
    const savedAdmin = localStorage.getItem('battery_admin');
    if (savedAdmin === 'true') {
        isAdmin = true;
        updateLoginUI();
    }

    // ===== 通用 fetch 包装：带重试和超时 =====
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

        // 精确匹配
        if (typeof search_index !== 'undefined' && search_index[q]) {
            showResult(search_index[q]);
            return;
        }

        // 大小写不敏感匹配
        var qLower = q.toLowerCase();
        if (typeof search_index !== 'undefined' && search_index[qLower]) {
            showResult(search_index[qLower]);
            return;
        }

        // 模糊匹配
        if (typeof search_index !== 'undefined') {
            var matches = [];
            for (var key in search_index) {
                if (search_index.hasOwnProperty(key)) {
                    if (key.toLowerCase().includes(qLower)) {
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

    function showResult(item) {
        hideAll();
        currentItem = item;
        resultSection.style.display = 'block';
        suggestionsEl.style.display = 'none';

        // 标准名称
        document.getElementById('resultName').textContent = (item.category ? '[' + item.category + '] ' : '') + (item.name || '');

        // 样品数量
        var samples = [];
        if (item.cellCount) samples.push('电芯' + item.cellCount);
        if (item.batteryCount) samples.push('电池组/系统' + item.batteryCount);
        document.getElementById('resultSamples').textContent = samples.join('，') || '详见备注';

        // 周期
        document.getElementById('resultPeriod').textContent = item.period || '详见备注';

        // 价格
        var priceParts = [];
        if (item.cellPrice && item.cellPrice !== '0') {
            priceParts.push('电芯：' + Number(item.cellPrice).toLocaleString() + ' RMB');
        }
        if (item.batteryPrice && item.batteryPrice !== '0') {
            priceParts.push('电池组/系统：' + Number(item.batteryPrice).toLocaleString() + ' RMB');
        }
        document.getElementById('resultPrice').textContent = priceParts.join('，') || '详见备注';

        // 行业比价
        var indLine = document.getElementById('industryLine');
        if (item.industryPrice) {
            indLine.style.display = 'block';
            document.getElementById('resultIndustryPrice').textContent = item.industryPrice;
        } else {
            indLine.style.display = 'none';
        }

        // 证书费
        var certLine = document.getElementById('certFeeLine');
        if (item.certFee) {
            certLine.style.display = 'block';
            document.getElementById('resultCertFee').textContent = item.certFee;
        } else {
            certLine.style.display = 'none';
        }

        // 威凯报价
        var tpLine = document.getElementById('totalPriceLine');
        if (item.totalPrice) {
            tpLine.style.display = 'block';
            document.getElementById('resultTotalPrice').textContent = item.totalPrice;
        } else {
            tpLine.style.display = 'none';
        }

        // 备注
        var rmLine = document.getElementById('remarkLine');
        if (item.remark) {
            rmLine.style.display = 'block';
            document.getElementById('resultRemark').textContent = item.remark;
        } else {
            rmLine.style.display = 'none';
        }

        // 管理员显示编辑区域
        if (isAdmin) {
            editPriceSection.style.display = 'block';
            document.getElementById('editCellPrice').value = formatPriceValue(item.cellPrice);
            document.getElementById('editBatteryPrice').value = formatPriceValue(item.batteryPrice);
        } else {
            editPriceSection.style.display = 'none';
        }

        // 隐藏保存消息
        saveMsg.textContent = '';
        saveMsg.className = 'save-msg';
        excelPathInfo.style.display = 'none';

        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        if (allSheets.length === 0) {
            loadSheetTabs();
        }
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

    // ===== 保存价格到Excel =====
    saveBtn.addEventListener('click', function() {
        if (!currentItem) return;

        var cellPrice = document.getElementById('editCellPrice').value.trim();
        var batteryPrice = document.getElementById('editBatteryPrice').value.trim();

        if (!cellPrice && !batteryPrice) {
            saveMsg.textContent = '请至少输入一个价格';
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
                // 刷新显示的价格
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
            saveBtn.textContent = '保存价格到Excel';
        });
    });

    // ===== 首页 Sheet 标签 + 表格 =====
    function loadSheetTabs() {
        sheetTabs.innerHTML = '<div class="sheet-tabs-loading">加载Sheet列表中...</div>';

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

    function renderSheetTabs(sheets) {
        sheetTabs.innerHTML = sheets.map(function(s) {
            return '<button class="sheet-tab" data-sheet="' + s.name + '" title="' + s.rows + '行 × ' + s.cols + '列">' +
                s.name + '<small>' + s.rows + '行</small>' +
                '</button>';
        }).join('');
    }

    function switchSheet(sheetName) {
        currentSheet = sheetName;

        // 更新标签激活状态
        sheetTabs.querySelectorAll('.sheet-tab').forEach(function(tab) {
            tab.classList.toggle('active', tab.dataset.sheet === sheetName);
        });

        // 显示加载状态
        tableLoading.style.display = 'flex';
        tableLoading.innerHTML = '<div class="spinner"></div><p>加载中...</p>';
        excelTable.style.display = 'none';
        tableInfo.style.display = 'none';

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

    function renderFullTable(tableData) {
        var headers = tableData.headers;
        var rows = tableData.rows;
        var sheet = tableData.sheet;
        var total_rows = tableData.total_rows;
        var total_cols = tableData.total_cols;

        // 渲染表头
        var headerHtml = ['<tr>'];
        headers.forEach(function(h) {
            headerHtml.push('<th>' + h.label + '</th>');
        });
        headerHtml.push('</tr>');
        excelTableHead.innerHTML = headerHtml.join('');

        // 渲染数据行
        var bodyHtml = [];
        rows.forEach(function(row) {
            bodyHtml.push('<tr>');
            row.cells.forEach(function(cell) {
                var cls = '';
                var displayVal = cell.value;

                // 价格列高亮
                if (cell.is_number && cell.value !== '0' && cell.value !== '' && (cell.col >= 7 && cell.col <= 11)) {
                    cls = ' class="price-cell"';
                    displayVal = Number(cell.value).toLocaleString();
                }

                bodyHtml.push('<td' + cls + '>' + displayVal + '</td>');
            });
            bodyHtml.push('</tr>');
        });
        excelTableBody.innerHTML = bodyHtml.join('');

        // 显示表格信息
        tableInfo.style.display = 'block';
        tableInfo.textContent = 'Sheet: ' + sheet + ' | 共 ' + rows.length + ' 行数据 | ' + total_cols + ' 列';

        excelTable.style.display = 'table';
    }

    // ===== 导出Excel =====
    function exportExcel() {
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
        // 如果正在显示结果，刷新编辑区域
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

    // Sheet 标签切换（事件委托）
    sheetTabs.addEventListener('click', function(e) {
        var tab = e.target.closest('.sheet-tab');
        if (tab && tab.dataset.sheet) {
            switchSheet(tab.dataset.sheet);
        }
    });

    // 导出按钮
    exportBtn.addEventListener('click', exportExcel);

    // 登录相关
    loginBtn.addEventListener('click', openLoginModal);
    logoutBtn.addEventListener('click', doLogout);
    closeLoginBtn.addEventListener('click', closeLoginModal);
    doLoginBtn.addEventListener('click', doLogin);
    loginPassword.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doLogin();
    });
    loginModal.querySelector('.modal-overlay').addEventListener('click', closeLoginModal);

    // ESC关闭登录框
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && loginModal.style.display === 'block') {
            closeLoginModal();
        }
    });

    // 初始化：加载首页表格
    loadSheetTabs();
    searchInput.focus();

})();
