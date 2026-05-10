const https = require('https');
const FormData = require('form-data');

const API_BASE = 'https://api.modelverse.cn/v1';

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

// 解析 multipart/form-data 请求体
function parseMultipartBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) {
        return reject(new Error('无法解析 multipart boundary'));
      }
      const boundary = boundaryMatch[1];
      const parts = buffer.toString('binary').split('--' + boundary);
      const fields = {};
      let file = null;

      for (const part of parts) {
        if (!part.includes('Content-Disposition')) continue;
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const header = part.substring(0, headerEnd);
        const body = part.substring(headerEnd + 4);
        const nameMatch = header.match(/name="([^"]+)"/);
        if (!nameMatch) continue;
        const name = nameMatch[1];

        if (header.includes('filename=')) {
          const filenameMatch = header.match(/filename="([^"]+)"/);
          const mimeMatch = header.match(/Content-Type:\s*(.+)/i);
          file = {
            name: name,
            filename: filenameMatch ? filenameMatch[1] : 'upload.png',
            mimetype: mimeMatch ? mimeMatch[1].trim() : 'image/png',
            buffer: Buffer.from(body.replace(/\r\n$/, ''), 'binary'),
          };
        } else {
          fields[name] = body.replace(/\r\n$/, '').trim();
        }
      }
      resolve({ fields, file });
    });
    req.on('error', reject);
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

  const API_KEY = process.env.MODELVERSE_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API Key 未配置' });
  }

  try {
    const { fields, file } = await parseMultipartBody(req);

    if (!fields.prompt) {
      return res.status(400).json({ error: '请输入编辑描述' });
    }
    if (!file) {
      return res.status(400).json({ error: '请上传一张图片' });
    }

    const result = await postMultipart(
      `${API_BASE}/images/edits`,
      API_KEY,
      {
        model: 'gpt-image-2',
        prompt: fields.prompt,
        n: '1',
        size: fields.size || '1024x1024',
        quality: fields.quality || 'high',
        output_format: 'png',
        output_compression: '100',
      },
      [{
        name: 'image',
        buffer: file.buffer,
        filename: file.filename,
        mimetype: file.mimetype,
      }]
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
    console.error('编辑错误:', error.message);
    return res.status(500).json({ error: error.message || '编辑图片失败' });
  }
};
