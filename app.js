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

    // 表格相关
    const tableWrapper = document.getElementById('tableWrapper');
    const excelTableHead = document.getElementById('excelTableHead');
    const excelTableBody = document.getElementById('excelTableBody');
    const tableLoading = document.getElementById('tableLoading');
    const tableError = document.getElementById('tableError');
    const tableSheetName = document.getElementById('tableSheetName');

    // 全局表格模态框相关
    const fullTableModal = document.getElementById('fullTableModal');
    const viewFullTableBtn = document.getElementById('viewFullTableBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const sheetTabs = document.getElementById('sheetTabs');
    const modalTableLoading = document.getElementById('modalTableLoading');
    const modalExcelTable = document.getElementById('modalExcelTable');
    const modalTableHead = document.getElementById('modalTableHead');
    const modalTableBody = document.getElementById('modalTableBody');
    const modalTableInfo = document.getElementById('modalTableInfo');
    const modalRefreshBtn = document.getElementById('modalRefreshBtn');
    const exportBtn = document.getElementById('exportBtn');
    const modalExportBtn = document.getElementById('modalExportBtn');

    let debounceTimer = null;
    let currentItem = null; // 当前查询结果
    let currentModalSheet = null; // 当前模态框中选中的sheet
    let allSheets = []; // 所有sheet列表

    // ===== 搜索逻辑 =====
    function search(query) {
        const q = query.trim();
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
        const qLower = q.toLowerCase();
        if (typeof search_index !== 'undefined' && search_index[qLower]) {
            showResult(search_index[qLower]);
            return;
        }

        // 模糊匹配
        if (typeof search_index !== 'undefined') {
            const matches = [];
            for (const [key, item] of Object.entries(search_index)) {
                if (key.toLowerCase().includes(qLower)) {
                    matches.push({ key, item });
                }
            }

            const seen = new Set();
            const uniqueMatches = [];
            for (const m of matches) {
                if (!seen.has(m.item.id)) {
                    seen.add(m.item.id);
                    uniqueMatches.push(m);
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
        const samples = [];
        if (item.cellCount) samples.push('电芯' + item.cellCount);
        if (item.batteryCount) samples.push('电池组/系统' + item.batteryCount);
        document.getElementById('resultSamples').textContent = samples.join('，') || '详见备注';

        // 周期
        document.getElementById('resultPeriod').textContent = item.period || '详见备注';

        // 电芯价格卡片
        const cellPriceCard = document.getElementById('resultCellPrice');
        if (item.cellPrice && item.cellPrice !== '0') {
            cellPriceCard.textContent = '¥' + Number(item.cellPrice).toLocaleString();
        } else {
            cellPriceCard.textContent = '--';
        }

        // 电池组价格卡片
        const batteryPriceCard = document.getElementById('resultBatteryPrice');
        if (item.batteryPrice && item.batteryPrice !== '0') {
            batteryPriceCard.textContent = '¥' + Number(item.batteryPrice).toLocaleString();
        } else {
            batteryPriceCard.textContent = '--';
        }

        // 价格 - 填入可编辑输入框
        const cellPriceEl = document.getElementById('editCellPrice');
        const batteryPriceEl = document.getElementById('editBatteryPrice');
        cellPriceEl.value = formatPriceValue(item.cellPrice);
        batteryPriceEl.value = formatPriceValue(item.batteryPrice);

        // 行业比价
        const indLine = document.getElementById('industryLine');
        if (item.industryPrice) {
            indLine.style.display = 'block';
            document.getElementById('resultIndustryPrice').textContent = item.industryPrice;
        } else {
            indLine.style.display = 'none';
        }

        // 证书费
        const certLine = document.getElementById('certFeeLine');
        if (item.certFee) {
            certLine.style.display = 'block';
            document.getElementById('resultCertFee').textContent = item.certFee;
        } else {
            certLine.style.display = 'none';
        }

        // 威凯报价
        const tpLine = document.getElementById('totalPriceLine');
        if (item.totalPrice) {
            tpLine.style.display = 'block';
            document.getElementById('resultTotalPrice').textContent = item.totalPrice;
        } else {
            tpLine.style.display = 'none';
        }

        // 备注
        const rmLine = document.getElementById('remarkLine');
        if (item.remark) {
            rmLine.style.display = 'block';
            document.getElementById('resultRemark').textContent = item.remark;
        } else {
            rmLine.style.display = 'none';
        }

        // 隐藏保存消息
        saveMsg.textContent = '';
        saveMsg.className = 'save-msg';
        excelPathInfo.style.display = 'none';

        // 加载Excel表格数据
        loadTableData(item.name);

        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function formatPriceValue(price) {
        if (!price || price === '0' || price === '') return '';
        return price;
    }

    // ===== 加载并渲染Excel表格 =====
    function loadTableData(standardName) {
        // 显示加载状态
        tableLoading.style.display = 'block';
        tableError.style.display = 'none';
        excelTableHead.innerHTML = '';
        excelTableBody.innerHTML = '';
        tableSheetName.textContent = '';

        fetchWithRetry('/api/table?standard=' + encodeURIComponent(standardName))
            .then(res => res.json())
            .then(data => {
                tableLoading.style.display = 'none';
                if (data.success && data.data) {
                    renderTable(data.data);
                } else {
                    tableError.style.display = 'block';
                    tableError.textContent = '⚠ ' + (data.message || '无法加载表格数据');
                }
            })
            .catch(err => {
                tableLoading.style.display = 'none';
                tableError.style.display = 'block';
                let errMsg = err.message || '未知错误';
                if (errMsg === 'Failed to fetch' || err.name === 'AbortError') {
                    errMsg = '连接服务器失败，请确认服务器已启动';
                }
                tableError.textContent = '⚠ ' + errMsg;
            });
    }

    function renderTable(tableData) {
        const { headers, rows, sheet, title } = tableData;

        // 显示sheet名称
        tableSheetName.textContent = 'Sheet: ' + sheet;
        tableSheetName.title = title;

        // 渲染表头（两行合并显示）
        const headerHtml = [];
        headerHtml.push('<tr>');
        headers.forEach(h => {
            let label = h.label1;
            if (h.label2 && h.label2 !== 'None') {
                label += '<br><small>' + h.label2 + '</small>';
            }
            headerHtml.push('<th>' + label + '</th>');
        });
        headerHtml.push('</tr>');
        excelTableHead.innerHTML = headerHtml.join('');

        // 渲染数据行
        const bodyHtml = [];
        rows.forEach((row, rowIdx) => {
            bodyHtml.push('<tr>');
            row.cells.forEach(cell => {
                let cls = '';
                let displayVal = cell.value;

                // 价格列(G=7, H=8)高亮
                if (cell.col === 7 || cell.col === 8) {
                    if (cell.is_number && cell.value !== '0' && cell.value !== '') {
                        cls = ' class="price-cell"';
                        displayVal = Number(cell.value).toLocaleString();
                    }
                }

                // 威凯报价列(I=9) - 特殊处理换行
                if (cell.col === 9 && cell.value) {
                    cls = ' class="weikai-cell"';
                    displayVal = cell.value.replace(/\n/g, '<br>');
                }

                bodyHtml.push('<td' + cls + '>' + displayVal + '</td>');
            });
            bodyHtml.push('</tr>');
        });
        excelTableBody.innerHTML = bodyHtml.join('');
    }

    function showSuggestions(matches) {
        hideAll();
        suggestionsEl.style.display = 'block';
        suggestionsEl.innerHTML = matches.slice(0, 8).map(m => `
            <div class="suggestion-item" data-id="${m.item.id}">
                <span class="suggestion-code">${m.item.id}</span>
                <span class="suggestion-name">${m.item.name}</span>
                <span class="suggestion-cat">${m.item.category}</span>
            </div>
        `).join('');

        suggestionsEl.querySelectorAll('.suggestion-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                if (typeof search_index !== 'undefined') {
                    for (const [k, v] of Object.entries(search_index)) {
                        if (v.id === id) {
                            searchInput.value = k;
                            showResult(v);
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

    // ===== 保存价格到Excel =====
    saveBtn.addEventListener('click', function() {
        if (!currentItem) return;

        const cellPrice = document.getElementById('editCellPrice').value.trim();
        const batteryPrice = document.getElementById('editBatteryPrice').value.trim();

        if (!cellPrice && !batteryPrice) {
            saveMsg.textContent = '请至少输入一个价格';
            saveMsg.className = 'save-msg error';
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        saveMsg.textContent = '';
        saveMsg.className = 'save-msg';

        // 调用后端API
        fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                standard: currentItem.name,
                cellPrice: cellPrice,
                batteryPrice: batteryPrice
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                saveMsg.textContent = '✓ ' + data.message;
                saveMsg.className = 'save-msg success';
                excelPathInfo.style.display = 'block';
                // 更新内存中的价格
                if (cellPrice) currentItem.cellPrice = cellPrice;
                if (batteryPrice) currentItem.batteryPrice = batteryPrice;
                // 重新加载表格数据以反映最新更改
                loadTableData(currentItem.name);
            } else {
                saveMsg.textContent = '✗ ' + data.message;
                saveMsg.className = 'save-msg error';
                excelPathInfo.style.display = 'none';
            }
        })
        .catch(err => {
            saveMsg.textContent = '✗ 保存失败: ' + err.message;
            saveMsg.className = 'save-msg error';
        })
        .finally(() => {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 保存价格到Excel';
        });
    });

    // ===== 全局表格模态框 =====
    function openFullTableModal() {
        fullTableModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        loadSheetTabs();
    }

    function closeFullTableModal() {
        fullTableModal.style.display = 'none';
        document.body.style.overflow = '';
        currentModalSheet = null;
    }

    // 通用 fetch 包装：带重试和超时
    function fetchWithRetry(url, options, retries = 2) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30秒超时
        const fetchOptions = Object.assign({}, options, { signal: controller.signal });

        return fetch(url, fetchOptions)
            .then(res => {
                clearTimeout(timeout);
                return res;
            })
            .catch(err => {
                clearTimeout(timeout);
                if (retries > 0 && (err.name === 'AbortError' || err.message === 'Failed to fetch')) {
                    console.warn('请求失败，重试中... 剩余重试次数:', retries);
                    return new Promise(resolve => setTimeout(resolve, 1000))
                        .then(() => fetchWithRetry(url, options, retries - 1));
                }
                throw err;
            });
    }

    function loadSheetTabs() {
        sheetTabs.innerHTML = '<div class="sheet-tabs-loading">⏳ 加载Sheet列表中...</div>';

        fetchWithRetry('/api/sheets')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data) {
                    allSheets = data.data;
                    renderSheetTabs(data.data);
                    // 自动加载第一个sheet
                    if (data.data.length > 0) {
                        switchSheet(data.data[0].name);
                    }
                } else {
                    sheetTabs.innerHTML = '<div class="sheet-tabs-error">⚠ 加载失败，请刷新重试</div>';
                }
            })
            .catch(err => {
                let errMsg = err.message || '未知错误';
                let helpText = '';
                if (errMsg === 'Failed to fetch' || err.name === 'AbortError') {
                    helpText = '<br><small style="color:#5f6368;">💡 请确认：<br>1. 服务器是否已启动（python server.py）<br>2. 是否通过 http://localhost:8765 访问<br>3. 网络连接是否正常</small>';
                }
                sheetTabs.innerHTML = '<div class="sheet-tabs-error">⚠ 加载失败: ' + errMsg + helpText + '</div>';
            });
    }

    function renderSheetTabs(sheets) {
        sheetTabs.innerHTML = sheets.map(s => 
            '<button class="sheet-tab" data-sheet="' + s.name + '" title="' + s.rows + '行 × ' + s.cols + '列">' +
            s.name + '<small>' + s.rows + '行</small>' +
            '</button>'
        ).join('');
    }

    function switchSheet(sheetName) {
        currentModalSheet = sheetName;

        // 更新标签激活状态
        sheetTabs.querySelectorAll('.sheet-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.sheet === sheetName);
        });

        // 显示加载状态
        modalTableLoading.style.display = 'flex';
        modalTableLoading.innerHTML = '<div class="spinner"></div><p>加载中...</p>';
        modalExcelTable.style.display = 'none';
        modalTableInfo.style.display = 'none';

        fetchWithRetry('/api/full-sheet?sheet=' + encodeURIComponent(sheetName))
            .then(res => res.json())
            .then(data => {
                modalTableLoading.style.display = 'none';
                if (data.success && data.data) {
                    renderFullTable(data.data);
                } else {
                    modalTableLoading.innerHTML = '<p style="color:#ea4335;">⚠ ' + (data.message || '加载失败，请刷新重试') + '</p>';
                }
            })
            .catch(err => {
                modalTableLoading.style.display = 'none';
                let errMsg = err.message || '未知错误';
                if (errMsg === 'Failed to fetch' || err.name === 'AbortError') {
                    errMsg = '连接服务器失败，请检查服务器是否运行';
                }
                modalTableLoading.innerHTML = '<p style="color:#ea4335;">⚠ ' + errMsg + '</p><p style="font-size:12px;color:#5f6368;margin-top:4px;">请确认通过 http://localhost:8765 访问</p>';
            });
    }

    function renderFullTable(tableData) {
        const { headers, rows, sheet, total_rows, total_cols } = tableData;

        // 渲染表头
        const headerHtml = ['<tr>'];
        headers.forEach(h => {
            headerHtml.push('<th>' + h.label + '</th>');
        });
        headerHtml.push('</tr>');
        modalTableHead.innerHTML = headerHtml.join('');

        // 渲染数据行
        const bodyHtml = [];
        rows.forEach((row, rowIdx) => {
            bodyHtml.push('<tr>');
            row.cells.forEach(cell => {
                let cls = '';
                let displayVal = cell.value;

                // 价格列（通常第7-11列可能是价格列）高亮
                if (cell.is_number && cell.value !== '0' && cell.value !== '' && (cell.col >= 7 && cell.col <= 11)) {
                    cls = ' class="price-cell"';
                    displayVal = Number(cell.value).toLocaleString();
                }

                bodyHtml.push('<td' + cls + '>' + displayVal + '</td>');
            });
            bodyHtml.push('</tr>');
        });
        modalTableBody.innerHTML = bodyHtml.join('');

        // 显示表格信息
        modalTableInfo.style.display = 'block';
        modalTableInfo.textContent = 'Sheet: ' + sheet + ' | 共 ' + rows.length + ' 行数据 | ' + total_cols + ' 列';

        modalExcelTable.style.display = 'table';
    }

    // ===== 导出Excel =====
    function exportExcel() {
        const link = document.createElement('a');
        link.href = '/api/export';
        link.download = '报价-2025.9.9.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 短暂提示
        showExportToast();
    }

    function showExportToast() {
        let toast = document.getElementById('exportToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'exportToast';
            toast.className = 'export-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = '✅ Excel 导出中...';
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }

    // ===== 事件处理 =====
    searchInput.addEventListener('input', function() {
        const val = this.value.trim();
        clearBtn.style.display = val ? 'flex' : 'none';

        clearTimeout(debounceTimer);
        if (val) {
            loadingEl.style.display = 'block';
            emptyState.style.display = 'none';
            notFound.style.display = 'none';
            resultSection.style.display = 'none';
            suggestionsEl.style.display = 'none';

            debounceTimer = setTimeout(() => {
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

    document.querySelectorAll('.hint-tag').forEach(tag => {
        tag.addEventListener('click', function() {
            const hint = this.dataset.hint;
            searchInput.value = hint;
            clearBtn.style.display = 'flex';
            search(hint);
            searchInput.focus();
        });
    });

    document.querySelectorAll('.example-item').forEach(item => {
        item.addEventListener('click', function() {
            const hint = this.dataset.hint;
            searchInput.value = hint;
            clearBtn.style.display = 'flex';
            search(hint);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // 查看完整表格按钮
    viewFullTableBtn.addEventListener('click', openFullTableModal);

    // 关闭模态框
    closeModalBtn.addEventListener('click', closeFullTableModal);

    // 点击遮罩层关闭
    fullTableModal.querySelector('.modal-overlay').addEventListener('click', closeFullTableModal);

    // ESC关闭
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && fullTableModal.style.display === 'block') {
            closeFullTableModal();
        }
    });

    // Sheet 标签切换（事件委托）
    sheetTabs.addEventListener('click', function(e) {
        const tab = e.target.closest('.sheet-tab');
        if (tab && tab.dataset.sheet) {
            switchSheet(tab.dataset.sheet);
        }
    });

    // 刷新按钮
    modalRefreshBtn.addEventListener('click', function() {
        if (currentModalSheet) {
            switchSheet(currentModalSheet);
        } else {
            loadSheetTabs();
        }
    });

    // 导出按钮
    exportBtn.addEventListener('click', exportExcel);
    modalExportBtn.addEventListener('click', exportExcel);

    searchInput.focus();

})();
