// ============================================================
// app.js - 前端 JavaScript（运行在浏览器里）
// ============================================================
// 这个文件负责：
// 1. 处理用户的点击、输入等操作
// 2. 把用户输入发送给后端服务器
// 3. 接收后端返回的图片并显示
// ============================================================

// ---- 获取页面上的元素 ----
const tabs = document.querySelectorAll('.tab');           // 所有标签按钮
const panels = document.querySelectorAll('.panel');       // 所有面板
const genBtn = document.getElementById('gen-btn');         // "生成图片"按钮
const editBtn = document.getElementById('edit-btn');       // "开始编辑"按钮
const uploadArea = document.getElementById('upload-area'); // 上传区域
const editFile = document.getElementById('edit-file');     // 文件输入框
const editPreview = document.getElementById('edit-preview'); // 预览图片
const result = document.getElementById('result');          // 结果区域
const resultImg = document.getElementById('result-img');  // 结果图片
const downloadBtn = document.getElementById('download-btn'); // 下载按钮
const regenerateBtn = document.getElementById('regenerate-btn'); // 重新生成按钮
const loading = document.getElementById('loading');        // 加载动画
const errorMsg = document.getElementById('error-msg');     // 错误提示

// ---- 标签切换功能 ----
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // 移除所有 active 类
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    // 给当前点击的标签和对应面板加上 active 类
    tab.classList.add('active');
    const targetPanel = document.getElementById(`panel-${tab.dataset.tab}`);
    targetPanel.classList.add('active');
  });
});

// ---- 文件上传 ----
// 点击上传区域时，触发文件选择框
uploadArea.addEventListener('click', () => editFile.click());

// 拖拽上传
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    editFile.files = e.dataTransfer.files;  // 把文件赋给 input
    showPreview(file);
  }
});

// 选择文件后显示预览
editFile.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    showPreview(e.target.files[0]);
  }
});

function showPreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    editPreview.src = e.target.result;
    editPreview.style.display = 'block';
    document.getElementById('upload-text').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// ---- 工具函数 ----
function showLoading(msg) {
  loading.querySelector('p').textContent = msg || '正在生成中，请稍候...';
  loading.style.display = 'block';
  result.style.display = 'none';
  errorMsg.style.display = 'none';
}

function hideLoading() {
  loading.style.display = 'none';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function hideError() {
  errorMsg.style.display = 'none';
}

// ---- 文生图 ----
genBtn.addEventListener('click', async () => {
  const prompt = document.getElementById('gen-prompt').value.trim();
  const size = document.getElementById('gen-size').value;
  const quality = document.getElementById('gen-quality').value;

  if (!prompt) {
    showError('请输入描述文字');
    return;
  }

  genBtn.disabled = true;
  showLoading('正在生成图片，请稍候...');

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, size, quality }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '生成失败');
    }

    // 显示生成的图片
    resultImg.src = data.image;
    downloadBtn.href = data.image;
    result.style.display = 'block';
    hideError();
  } catch (err) {
    showError(err.message);
  } finally {
    hideLoading();
    genBtn.disabled = false;
  }
});

// ---- 图片编辑 ----
editBtn.addEventListener('click', async () => {
  const file = editFile.files[0];
  const prompt = document.getElementById('edit-prompt').value.trim();
  const size = document.getElementById('edit-size').value;
  const quality = document.getElementById('edit-quality').value;

  if (!file) {
    showError('请先上传一张图片');
    return;
  }
  if (!prompt) {
    showError('请输入编辑描述');
    return;
  }

  editBtn.disabled = true;
  showLoading('正在编辑图片，请稍候...');

  try {
    // 构建 FormData（用于上传文件）
    const formData = new FormData();
    formData.append('image', file);
    formData.append('prompt', prompt);
    formData.append('size', size);
    formData.append('quality', quality);

    const response = await fetch('/api/edit', {
      method: 'POST',
      body: formData,  // 不手动设置 Content-Type，浏览器会自动加 boundary
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '编辑失败');
    }

    resultImg.src = data.image;
    downloadBtn.href = data.image;
    result.style.display = 'block';
    hideError();
  } catch (err) {
    showError(err.message);
  } finally {
    hideLoading();
    editBtn.disabled = false;
  }
});

// ---- 重新生成（滚动到顶部）----
regenerateBtn.addEventListener('click', () => {
  result.style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
