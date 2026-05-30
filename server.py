#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""电池检测报价查询 - 后端服务器"""
import json
import os
import http.server
import socketserver
import urllib.parse
import openpyxl
import re

PORT = 8765
EXCEL_PATH = r"E:\weixin\报价-2025.9.9.xlsx"
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

# 标准ID到Excel sheet和行的映射（在启动时建立索引）
standard_index = {}

def build_index():
    """扫描Excel所有sheet，建立标准ID到(sheet_name, start_row, end_row)的映射"""
    global standard_index
    standard_index = {}
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        if sheet.max_row < 2:
            continue
        
        current_standard = None
        current_start_row = None
        
        for row_idx in range(1, sheet.max_row + 1):
            a1_val = sheet.cell(row=row_idx, column=1).value
            if a1_val and isinstance(a1_val, str) and a1_val.strip():
                # Check if this is a standard title row (contains standard number patterns)
                if re.search(r'(IEC|GB|UL|UN|QC|MT|SJ|ANSI|CCC|ROHS|REACH|CQC)', a1_val, re.IGNORECASE):
                    if current_standard:
                        standard_index[current_standard] = {
                            'sheet': sheet_name,
                            'start_row': current_start_row,
                            'end_row': row_idx - 1
                        }
                    current_standard = a1_val.strip()
                    current_start_row = row_idx
        
        if current_standard:
            standard_index[current_standard] = {
                'sheet': sheet_name,
                'start_row': current_start_row,
                'end_row': sheet.max_row
            }
    
    wb.close()
    print(f"索引已建立，共 {len(standard_index)} 条标准")

def find_standard_in_excel(standard_name):
    """在Excel中查找标准，返回sheet名和行范围"""
    # 精确匹配
    if standard_name in standard_index:
        return standard_index[standard_name]
    
    # 模糊匹配
    for key, val in standard_index.items():
        if standard_name.lower() in key.lower():
            return val
    
    return None

def get_excel_prices(standard_name):
    """从Excel获取标准的价格信息"""
    info = find_standard_in_excel(standard_name)
    if not info:
        return None
    
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    sheet = wb[info['sheet']]
    
    # 读取标题行（第2行是表头，第3行是子表头）
    # 列: A=序号 B=条款 C=试验项目 D=电芯数量 E=电池组数量 F=周期 G=单电芯价格 H=电池组价格 I=威凯报价 J=证书费 K=行业参考价 L=备注
    
    result = {
        'sheet': info['sheet'],
        'start_row': info['start_row'],
        'title': sheet.cell(row=info['start_row'], column=1).value or '',
        'cell_total_price': 0,
        'battery_total_price': 0,
    }
    
    # 汇总电芯和电池组的总价
    cell_total = 0
    battery_total = 0
    
    for row_idx in range(info['start_row'] + 3, info['end_row'] + 1):
        g_val = sheet.cell(row=row_idx, column=7).value  # 单电芯价格
        h_val = sheet.cell(row=row_idx, column=8).value  # 电池组价格
        
        if g_val and isinstance(g_val, (int, float)):
            cell_total += g_val
        if h_val and isinstance(h_val, (int, float)):
            battery_total += h_val
    
    result['cell_total_price'] = cell_total
    result['battery_total_price'] = battery_total
    
    # 读取威凯报价（I列，可能在第4行）
    for row_idx in range(info['start_row'] + 3, min(info['start_row'] + 8, info['end_row'] + 1)):
        i_val = sheet.cell(row=row_idx, column=9).value
        if i_val and isinstance(i_val, str) and i_val.strip():
            result['weikai_quote'] = i_val.strip()
            break
    
    # 读取证书费
    for row_idx in range(info['start_row'] + 3, min(info['start_row'] + 8, info['end_row'] + 1)):
        j_val = sheet.cell(row=row_idx, column=10).value
        if j_val and isinstance(j_val, str) and j_val.strip():
            result['cert_fee'] = j_val.strip()
            break
    
    # 读取行业参考报价
    for row_idx in range(info['start_row'] + 3, min(info['start_row'] + 8, info['end_row'] + 1)):
        k_val = sheet.cell(row=row_idx, column=11).value
        if k_val and isinstance(k_val, str) and k_val.strip():
            result['industry_price'] = k_val.strip()
            break
    
    wb.close()
    return result

def update_excel_prices(standard_name, cell_price, battery_price):
    """更新Excel和search_index.json中的价格"""
    try:
        cell_price_num = float(cell_price) if cell_price and cell_price.strip() else None
        battery_price_num = float(battery_price) if battery_price and battery_price.strip() else None
    except ValueError:
        return False, "价格格式错误，请输入数字"
    
    if cell_price_num is None and battery_price_num is None:
        return False, "请至少输入一个价格"
    
    # 1. 更新 search_index.json
    index_path = os.path.join(STATIC_DIR, 'search_index.json')
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 找到对应条目并更新价格
    # 在JSON中搜索匹配的标准名称
    updated_index = False
    index_data = json.loads(re.search(r'var\s+search_index\s*=\s*(\{.*\})', content, re.DOTALL).group(1))
    
    for key, item in index_data.items():
        if item.get('name') == standard_name or item.get('id') == standard_name:
            if cell_price_num is not None:
                item['cellPrice'] = str(int(cell_price_num))
            if battery_price_num is not None:
                item['batteryPrice'] = str(int(battery_price_num))
            updated_index = True
    
    if updated_index:
        new_content = 'var search_index = ' + json.dumps(index_data, ensure_ascii=False, indent=None)
        with open(index_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
    
    # 2. 更新 Excel
    info = find_standard_in_excel(standard_name)
    if info:
        wb = openpyxl.load_workbook(EXCEL_PATH)
        sheet = wb[info['sheet']]
        
        # 在威凯报价列(I列)的第一个数据行添加/更新价格
        first_data_row = info['start_row'] + 3
        existing = sheet.cell(row=first_data_row, column=9).value
        
        # 构建价格信息文本
        price_parts = []
        if cell_price_num is not None:
            price_parts.append(f"电芯：{int(cell_price_num)}RMB")
        if battery_price_num is not None:
            price_parts.append(f"电池组/系统：{int(battery_price_num)}RMB")
        price_text = "\n".join(price_parts)
        
        if existing and isinstance(existing, str) and existing.strip():
            # 检查是否已有价格行，有则替换
            lines = existing.split('\n')
            new_lines = []
            has_cell = False
            has_battery = False
            for line in lines:
                stripped = line.strip()
                if cell_price_num is not None and re.match(r'^电芯[：:]\s*', stripped):
                    new_lines.append(f"电芯：{int(cell_price_num)}RMB")
                    has_cell = True
                elif battery_price_num is not None and re.match(r'^电池[组系/][：:]\s*', stripped):
                    new_lines.append(f"电池组/系统：{int(battery_price_num)}RMB")
                    has_battery = True
                else:
                    new_lines.append(line)
            
            if cell_price_num is not None and not has_cell:
                new_lines.append(f"电芯：{int(cell_price_num)}RMB")
            if battery_price_num is not None and not has_battery:
                new_lines.append(f"电池组/系统：{int(battery_price_num)}RMB")
            
            sheet.cell(row=first_data_row, column=9).value = '\n'.join(new_lines)
        else:
            sheet.cell(row=first_data_row, column=9).value = price_text
        
        wb.save(EXCEL_PATH)
        wb.close()
        
        # 重建索引
        build_index()
    
    return True, "价格已保存到Excel和查询系统"

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)
    
    def log_message(self, format, *args):
        # 抑制日志输出，避免干扰
        pass
    
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        if parsed.path == '/api/search':
            params = urllib.parse.parse_qs(parsed.query)
            query = params.get('q', [''])[0].strip()
            if not query:
                self.send_json({'error': '缺少查询参数'})
                return
            
            # 从search_index.json搜索
            index_path = os.path.join(STATIC_DIR, 'search_index.json')
            with open(index_path, 'r', encoding='utf-8') as f:
                content = f.read()
                # 提取JSON对象
                match = re.search(r'var\s+search_index\s*=\s*(\{.*\})', content, re.DOTALL)
                if not match:
                    self.send_json({'error': '索引文件格式错误'})
                    return
                search_index = json.loads(match.group(1))
            
            # 搜索逻辑
            if query in search_index:
                item = search_index[query]
            else:
                ql = query.lower()
                if ql in search_index:
                    item = search_index[ql]
                else:
                    matches = []
                    for k, v in search_index.items():
                        if ql in k.lower():
                            matches.append(v)
                    # 去重
                    seen = set()
                    unique = []
                    for m in matches:
                        if m['id'] not in seen:
                            seen.add(m['id'])
                            unique.append(m)
                    if len(unique) == 1:
                        item = unique[0]
                    elif len(unique) > 1:
                        self.send_json({'suggestions': unique[:8]})
                        return
                    else:
                        self.send_json({'not_found': True})
                        return
            
            # 从Excel获取实时价格
            excel_prices = get_excel_prices(item['name'])
            
            result = dict(item)
            if excel_prices:
                result['excel_cell_price'] = excel_prices['cell_total_price']
                result['excel_battery_price'] = excel_prices['battery_total_price']
                result['excel_weikai'] = excel_prices.get('weikai_quote', '')
                result['excel_cert_fee'] = excel_prices.get('cert_fee', '')
                result['excel_industry'] = excel_prices.get('industry_price', '')
                result['excel_sheet'] = excel_prices['sheet']
                result['excel_title'] = excel_prices['title']
            
            self.send_json(result)
        
        elif parsed.path == '/api/update':
            params = urllib.parse.parse_qs(parsed.query)
            standard = params.get('standard', [''])[0]
            cell_price = params.get('cell', [''])[0]
            battery_price = params.get('battery', [''])[0]
            
            if not standard:
                self.send_json({'success': False, 'message': '缺少标准名称'})
                return
            
            success, message = update_excel_prices(standard, cell_price, battery_price)
            self.send_json({'success': success, 'message': message})
        
        else:
            super().do_GET()
    
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        
        if parsed.path == '/api/update':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 0:
                    body = self.rfile.read(content_length)
                    data = json.loads(body.decode('utf-8'))
                else:
                    self.send_json({'success': False, 'message': 'Empty request body'}, 400)
                    return
                
                standard = data.get('standard', '')
                cell_price = data.get('cellPrice', '')
                battery_price = data.get('batteryPrice', '')
                
                if not standard:
                    self.send_json({'success': False, 'message': '缺少标准名称'}, 400)
                    return
                
                success, message = update_excel_prices(standard, cell_price, battery_price)
                self.send_json({'success': success, 'message': message})
            except Exception as e:
                self.send_json({'success': False, 'message': str(e)}, 500)
        else:
            self.send_json({'error': 'Not found'}, 404)
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    build_index()
    print(f"服务器启动: http://localhost:{PORT}")
    with socketserver.ThreadingTCPServer(("", PORT), RequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务器已停止")
