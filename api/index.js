// api/index.js - Vercel 入口文件（把 server.js 的内容搬进来）

const express = require('express');
const multer = require('multer');
const https = require('https');
const FormData = require('form-data');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.json());

// 配置文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 PNG/JPG/WebP 格式的图片'));
    }
  }
});

// 读取 API Key
const API_KEY = process.env.MODELVERSE_API_KEY;
const API_BASE = 'https://api.modelverse.cn/v1';

// 原生 HTTPS 请求工具
function postMultipart(apiUrl, authKey, fields, files = []) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(apiUrl);
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

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          reject(new Error('API 返回的不是 JSON'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---- 路由 ----

// 文生图
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, size = '1024x1024', quality = 'high' } = req.body;

    if (!prompt) return res.status(400).json({ error: '请输入描述文字' });
    if (!API_KEY) return res.status(500).json({ error: '请先配置 API Key' });

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
      return res.status(result.status).json({ error: `API 返回错误: ${result.status}` });
    }

    const imageBase64 = result.data.data && result.data.data[0] && result.data.data[0].b64_json;
    if (!imageBase64) return res.status(500).json({ error: 'API 未返回图片数据' });

    res.json({ image: `data:image/png;base64,${imageBase64}` });
  } catch (err) {
    console.error('[服务器错误]', err);
    res.status(500).json({ error: '服务器内部错误: ' + err.message });
  }
});

// 图片编辑
app.post('/api/edit', upload.single('image'), async (req, res) => {
  try {
    const { prompt, size = '1024x1024', quality = 'high' } = req.body;

    if (!prompt) return res.status(400).json({ error: '请输入编辑描述' });
    if (!req.file) return res.status(400).json({ error: '请上传一张图片' });
    if (!API_KEY) return res.status(500).json({ error: '请先配置 API Key' });

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
      return res.status(result.status).json({ error: `API 返回错误: ${result.status}` });
    }

    const imageBase64 = result.data.data && result.data.data[0] && result.data.data[0].b64_json;
    if (!imageBase64) return res.status(500).json({ error: 'API 未返回图片数据' });

    res.json({ image: `data:image/png;base64,${imageBase64}` });
  } catch (err) {
    console.error('[服务器错误]', err);
    res.status(500).json({ error: '服务器内部错误: ' + err.message });
  }
});

// ⚠️ 关键区别：不使用 app.listen()，而是导出 app
module.exports = app;