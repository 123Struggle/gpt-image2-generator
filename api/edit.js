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

  // 注意：Vercel 需要配置 body parser 才能处理 FormData
  // 如果编辑功能暂时不用，可以先返回错误提示
  return res.status(200).json({ 
    error: '图片编辑功能正在开发中，请先使用文生图功能' 
  });
};
