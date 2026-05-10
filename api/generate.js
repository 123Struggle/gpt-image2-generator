const https = require('https');
const FormData = require('form-data');

const API_BASE = 'https://api.modelverse.cn/v1';

function postMultipart(apiUrl, authKey, fields) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(apiUrl);
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
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
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('请求超时（120秒），请尝试使用低质量或中等质量'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  const { prompt, size = '1024x1024', quality = 'high' } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: '请输入描述文字' });
  }

  const API_KEY = process.env.MODELVERSE_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API Key 未配置' });
  }

  try {
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
      return res.status(result.status).json({ error: `API 返回错误: ${result.status}`, detail: result.data });
    }

    const imageBase64 = result.data.data && result.data.data[0] && result.data.data[0].b64_json;

    if (!imageBase64) {
      return res.status(500).json({ error: 'API 未返回图片数据', detail: result.data });
    }

    return res.status(200).json({ image: `data:image/png;base64,${imageBase64}` });
  } catch (error) {
    console.error('生成错误:', error.message);
    return res.status(500).json({ error: error.message || '生成图片失败' });
  }
};
