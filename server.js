// ============================================================
// server.js - 后端服务器
// ============================================================
// 这个文件是整个项目的"大脑"，运行在服务器上。
// 它负责：
// 1. 提供静态文件（HTML/CSS/JS）给浏览器访问
// 2. 接收前端的请求，调用 UCloud API，返回图片
// ============================================================

// ---- 第1步：加载依赖 ----
// require() 就是"导入别人写好的工具包"
const express = require('express');       // Express：一个帮你快速搭建网站的框架
const multer = require('multer');         // Multer：专门处理文件上传的中间件
const https = require('https');           // Node.js 内置的 HTTPS 模块（比 fetch 更可控）
const FormData = require('form-data');    // 专业的 multipart/form-data 构建库
const path = require('path');             // path：Node.js 内置模块，处理文件路径
require('dotenv').config();               // dotenv：读取 .env 文件里的环境变量（比如 API Key）

// ---- 第2步：创建应用实例 ----
const app = express();                    // 创建一个 Express 应用（就像创建了一个网站）
const PORT = process.env.PORT || 3000;    // 网站监听的端口号，默认 3000

// ---- 第3步：配置中间件 ----
// 中间件就像"流水线上的工人"，每个请求经过时都会被处理
app.use(express.json());                  // 解析 JSON 格式的请求体
app.use(express.static('public'));        // 把 public 文件夹里的文件直接提供给浏览器访问

// 配置文件上传：限制只能传图片，最大 10MB
const upload = multer({
  storage: multer.memoryStorage(),        // 文件存在内存里（临时）
  limits: { fileSize: 10 * 1024 * 1024 }, // 限制 10MB
  fileFilter: (req, file, cb) => {        // 只允许图片格式
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 PNG/JPG/WebP 格式的图片'));
    }
  }
});

// ---- 第4步：读取 API Key ----
const API_KEY = process.env.MODELVERSE_API_KEY;
const API_BASE = 'https://api.modelverse.cn/v1';

// ---- 原生 HTTPS 请求工具 ----
// 用 Node.js 内置的 https 模块 + form-data 库
// 参照 Python requests.post() 的方式：表单字段 + 文件上传

/**
 * 发送 multipart/form-data 请求（类似 Python 的 requests.post(data=..., files=...)）
 * @param {string} apiUrl - 请求地址
 * @param {string} authKey - API Key
 * @param {Object} fields - 表单字段（如 model, prompt, n 等）
 * @param {Array} files - 文件列表 [{name, buffer, filename, mimetype}]
 * @returns {Promise<Object>} - JSON 响应
 */
function postMultipart(apiUrl, authKey, fields, files = []) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(apiUrl);

    // 用 form-data 库构建 multipart body（和 Python requests 自动处理的一样）
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    for (const file of files) {
      form.append(file.name, file.buffer, {
        filename: file.filename,
        contentType: file.mimetype,
      });
    }

    // 一次性获取完整 body（和 Python requests 行为一致：整个 body 构建好再发送）
    const body = form.getBuffer();

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${authKey}`,
        'Content-Length': body.length,
      },
    };

    console.log(`[HTTPS] 发送请求到 ${apiUrl}, body 大小: ${body.length} bytes`);

    const startTime = Date.now();
    const req = https.request(options, (res) => {
      console.log(`[HTTPS] 收到响应头, 状态码: ${res.statusCode}, 耗时: ${Date.now() - startTime}ms`);
      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
        console.log(`[HTTPS] 收到数据块 ${chunk.length} bytes, 累计: ${Buffer.concat(chunks).length} bytes`);
      });
      res.on('end', () => {
        const totalTime = Date.now() - startTime;
        console.log(`[HTTPS] 响应完成, 总耗时: ${totalTime}ms, 总大小: ${Buffer.concat(chunks).length} bytes`);
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          reject(new Error('API 返回的不是 JSON'));
        }
      });
    });

    // 不设 socket 超时，让 API 自然响应（和 Python requests 一致）
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---- 第5步：定义路由（API 接口）----
// 路由 = 当浏览器访问某个 URL 时，执行什么操作

// --- 路由1：文生图 ---
// 前端发 POST 请求到 /api/generate，就执行这个函数
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, size = '1024x1024', quality = 'high' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: '请输入描述文字' });
    }
    if (!API_KEY) {
      return res.status(500).json({ error: '请先配置 API Key（在 .env 文件中）' });
    }

    console.log(`[生成图片] prompt: ${prompt}, size: ${size}, quality: ${quality}`);

    // 用原生 https 发送 multipart/form-data，和 Python 的 requests.post() 一致
    const result = await postMultipart(
      `${API_BASE}/images/generations`,
      API_KEY,
      {
        model: 'gpt-image-2',
        prompt: prompt,
        n: '1',
        size: size,
        quality: quality,
        output_format: 'png',
        output_compression: '100',
      }
    );

    if (result.status !== 200) {
      console.error('[API 错误]', result.status, JSON.stringify(result.data).substring(0, 200));
      return res.status(result.status).json({ error: `API 返回错误: ${result.status}` });
    }

    console.log('[API 返回]', JSON.stringify(result.data).substring(0, 200));

    const imageBase64 = result.data.data && result.data.data[0] && result.data.data[0].b64_json;

    if (!imageBase64) {
      return res.status(500).json({ error: 'API 未返回图片数据' });
    }

    res.json({ image: `data:image/png;base64,${imageBase64}` });
  } catch (err) {
    console.error('[服务器错误]', err);
    res.status(500).json({ error: '服务器内部错误: ' + err.message });
  }
});

// --- 路由2：图片编辑 ---
app.post('/api/edit', upload.single('image'), async (req, res) => {
  try {
    const { prompt, size = '1024x1024', quality = 'high' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: '请输入编辑描述' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请上传一张图片' });
    }
    if (!API_KEY) {
      return res.status(500).json({ error: '请先配置 API Key（在 .env 文件中）' });
    }

    console.log(`[编辑图片] prompt: ${prompt}, 原图: ${req.file.originalname}`);

    // 用原生 https 发送 multipart/form-data，和 Python 的 requests.post() 一致
    const result = await postMultipart(
      `${API_BASE}/images/edits`,
      API_KEY,
      {
        model: 'gpt-image-2',
        prompt: prompt,
        n: '1',
        size: size,
        quality: quality,
        output_format: 'png',
        output_compression: '100',
      },
      [{
        name: 'image',
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
      }]
    );

    if (result.status !== 200) {
      console.error('[API 错误]', result.status, JSON.stringify(result.data).substring(0, 200));
      return res.status(result.status).json({ error: `API 返回错误: ${result.status}` });
    }

    console.log('[API 返回]', JSON.stringify(result.data).substring(0, 200));

    const imageBase64 = result.data.data && result.data.data[0] && result.data.data[0].b64_json;

    if (!imageBase64) {
      return res.status(500).json({ error: 'API 未返回图片数据' });
    }

    res.json({ image: `data:image/png;base64,${imageBase64}` });
  } catch (err) {
    console.error('[服务器错误]', err);
    res.status(500).json({ error: '服务器内部错误: ' + err.message });
  }
});

// ---- 第6步：启动服务器 ----
app.listen(PORT, () => {
  console.log('');
  console.log('=========================================');
  console.log(`  GPT-Image-2 图片生成网站已启动!`);
  console.log(`  打开浏览器访问: http://localhost:${PORT}`);
  console.log('=========================================');
  console.log('');
  if (!API_KEY) {
    console.log('⚠️  警告：未检测到 API Key！');
    console.log('   请复制 .env.example 为 .env，然后填入你的 API Key');
    console.log('');
  }
});
