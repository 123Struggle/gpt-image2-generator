
const axios = require('axios');

module.exports = async (req, res) => {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  const { prompt, size, quality } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: '请输入描述文字' });
  }

  try {
    const response = await axios.post(
      'https://model.mllight.com/v1/chat/completions',
      {
        model: 'gpt-image-1',
        messages: [{ role: 'user', content: prompt }],
        size: size || '1024x1024',
        quality: quality || 'standard'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MODELVERSE_API_KEY}`
        },
        timeout: 120000
      }
    );

    const content = response.data.choices[0].message.content;
    
    // 提取图片 URL 或 base64
    let imageData;
    if (content.includes('http')) {
      const urlMatch = content.match(/https?:\/\/[^\s"]+/);
      imageData = urlMatch ? urlMatch[0] : null;
    } else {
      imageData = `data:image/png;base64,${content}`;
    }

    if (!imageData) {
      throw new Error('无法解析返回的图片');
    }

    return res.status(200).json({ image: imageData });
  } catch (error) {
    console.error('生成错误:', error.message);
    return res.status(500).json({ error: error.message || '生成图片失败' });
  }
};
