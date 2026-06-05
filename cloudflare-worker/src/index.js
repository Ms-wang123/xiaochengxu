/**
 * 电池检测 AI 助手 - Cloudflare Worker
 * 替代原来的 server.py，提供 AI 对话接口（非流式 + SSE 流式）
 */

// DeepSeek API 配置
const DEEPSEEK_API_KEY = 'sk-b200837777e8435083aedd405829f601';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

/**
 * 构建电池检测领域的 System Prompt
 */
function buildSystemPrompt() {
  return `你是一个专业的电池检测认证助手，精通以下领域：

## 你的能力
1. **电池检测标准解释**：UN38.3、IEC 62619、GB 31241、IEC 62133、UL 1642、UL 2054 等标准的内容、适用范围、测试项目
2. **专业术语解释**：电芯(Cell)、电池组(Battery Pack)、BMS、热失控、针刺测试、挤压测试、跌落测试、循环测试等
3. **检测认证机构介绍**：威凯(CVC)、SGS、德凯(DEKRA)、TUV莱茵、CNAS、CMA等
4. **检测流程与费用咨询**：样品数量、检测周期、报价范围
5. **标准对比分析**：不同标准之间的差异和适用场景
6. **行业知识问答**：锂电池安全、运输规定、认证流程等

## 知识要点
- UN38.3是联合国锂电池运输安全强制检测标准，包含T1-T8共8项测试
- IEC 62619针对工业储能电池，GB 31241针对消费电子产品电池
- CB证书是国际电工委员会(IEC)建立的电工产品安全测试报告互认体系
- 电池检测样品：电芯通常20-50只，电池组通常3-5组
- 检测周期一般10-30个工作日
- 威凯(CVC)是中国电器科学研究院下属的专业检测认证机构

## 回复风格
- 使用中文回答，专业但不晦涩
- 对于技术问题，给出清晰、准确、有结构的回答
- 如果用户询问报价，可以给出大致的价格范围参考
- 保持友好、乐于帮助的态度
- 如果问题超出电池检测领域，礼貌说明你的专业范围

请根据以上知识体系，认真回答用户的每一个问题。`;
}

/**
 * 调用 DeepSeek API（非流式）
 */
async function callDeepSeek(messages) {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `API 返回错误: ${response.status} - ${errorText}` };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { success: true, content };
}

/**
 * 调用 DeepSeek API（流式 SSE）
 */
async function callDeepSeekStream(messages) {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `API 返回错误: ${response.status} - ${errorText}` };
  }

  return { success: true, stream: response.body };
}

/**
 * 构建发送给 DeepSeek 的消息列表
 */
function buildMessages(userMessage, history) {
  const messages = [{ role: 'system', content: buildSystemPrompt() }];

  // 添加历史对话（最多保留最近 20 轮）
  for (const msg of (history || []).slice(-40)) {
    const role = msg.role || 'user';
    const content = msg.content || '';
    if ((role === 'user' || role === 'assistant') && content) {
      messages.push({ role, content });
    }
  }

  // 添加当前用户消息
  messages.push({ role: 'user', content: userMessage });

  return messages;
}

/**
 * 添加 CORS 头
 */
function addCorsHeaders(headers) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return headers;
}

/**
 * 发送 JSON 响应
 */
function jsonResponse(data, status = 200) {
  const headers = addCorsHeaders(new Headers());
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data, null, 0), { status, headers });
}

/**
 * 主请求处理入口
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      const headers = addCorsHeaders(new Headers());
      return new Response(null, { status: 204, headers });
    }

    // ========== 非流式 AI 对话 ==========
    if (path === '/api/ai/chat' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userMessage = body.message || '';
        const history = body.history || [];

        if (!userMessage) {
          return jsonResponse({ success: false, error: '缺少消息内容' }, 400);
        }

        const messages = buildMessages(userMessage, history);
        const result = await callDeepSeek(messages);

        return jsonResponse(result);
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
      }
    }

    // ========== 流式 SSE AI 对话 ==========
    if (path === '/api/ai/chat/stream' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userMessage = body.message || '';
        const history = body.history || [];

        if (!userMessage) {
          return jsonResponse({ success: false, error: '缺少消息内容' }, 400);
        }

        const messages = buildMessages(userMessage, history);
        const result = await callDeepSeekStream(messages);

        if (!result.success) {
          return jsonResponse(result, 500);
        }

        // 返回 SSE 流式响应
        const headers = addCorsHeaders(new Headers());
        headers.set('Content-Type', 'text/event-stream; charset=utf-8');
        headers.set('Cache-Control', 'no-cache');
        headers.set('Connection', 'keep-alive');
        headers.set('X-Accel-Buffering', 'no');

        return new Response(result.stream, { status: 200, headers });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
      }
    }

    // ========== 健康检查 ==========
    if (path === '/api/health') {
      return jsonResponse({ status: 'ok', service: 'battery-ai-worker' });
    }

    // ========== 404 ==========
    return jsonResponse({ error: 'Not Found' }, 404);
  },
};
