const form = document.querySelector('#generateForm');
const promptInput = document.querySelector('#prompt');
const modelInput = document.querySelector('#model');
const sizeInput = document.querySelector('#size');
const qualityInput = document.querySelector('#quality');
const countInput = document.querySelector('#count');
const generateButton = document.querySelector('#generateButton');
const statusEl = document.querySelector('#status');
const resultsGrid = document.querySelector('#resultsGrid');
const editPanel = document.querySelector('#editPanel');
const modeLabel = document.querySelector('#modeLabel');
const imageInput = document.querySelector('#imageInput');
const imagePreview = document.querySelector('#imagePreview');
const clearImageButton = document.querySelector('#clearImage');
const clearResultsButton = document.querySelector('#clearResults');
const randomPromptButton = document.querySelector('#randomPrompt');
const sidebarToggle = document.querySelector('#sidebarToggle');
const promptGallery = document.querySelector('#promptGallery');

const prompts = [
  {
    title: '月球橘猫',
    text: '一只穿着宇航服的橘猫，站在月球表面，背景是地球，写实风格'
  },
  {
    title: '复古饮料海报',
    text: '一张 90 年代复古汽水广告，玻璃瓶上有水珠，夏日下午阳光，商业摄影'
  },
  {
    title: '未来城市',
    text: '日落时分的未来城市天际线，霓虹灯、空中列车、干净的电影感构图'
  },
  {
    title: '珠宝静物',
    text: '一枚祖母绿戒指放在黑色丝绒上，微距摄影，柔和高光，奢侈品广告'
  },
  {
    title: '儿童绘本',
    text: '温暖的儿童绘本插画，一间会发光的树屋，夜晚森林，细腻水彩质感'
  },
  {
    title: '电商主图',
    text: '白底电商产品图，一台极简咖啡机，干净阴影，真实材质，高清商业摄影'
  }
];

let mode = 'generate';

function setStatus(message, type = 'idle') {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', type === 'error');
}

function setMode(nextMode) {
  mode = nextMode;
  const isEdit = mode === 'edit';
  editPanel.hidden = !isEdit;
  modeLabel.textContent = isEdit ? '图生图' : '文生图';

  document.querySelectorAll('[data-mode-button]').forEach((button) => {
    button.classList.toggle('active', button.dataset.modeButton === mode);
  });

  countInput.max = isEdit ? '10' : '4';
  if (Number(countInput.value) > Number(countInput.max)) {
    countInput.value = countInput.max;
  }
}

function imageSrc(item) {
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
}

function renderResults(payload) {
  const items = payload.data || [];
  if (!items.length) {
    setStatus('接口没有返回图片，请调整提示词后再试。', 'error');
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => {
    const src = imageSrc(item);
    if (!src) return;

    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <img src="${src}" alt="AI 生成结果 ${index + 1}" loading="lazy" />
      <footer>
        <small>${payload.model || modelInput.value}</small>
        <a href="${src}" target="_blank" rel="noreferrer">打开</a>
      </footer>
    `;
    fragment.prepend(card);
  });

  resultsGrid.prepend(fragment);
  setStatus(`生成完成，返回 ${items.length} 张图片。`);
}

function requestBody() {
  return {
    model: modelInput.value,
    prompt: promptInput.value.trim(),
    n: Number(countInput.value || 1),
    size: sizeInput.value,
    quality: qualityInput.value,
    response_format: 'url'
  };
}

async function generateImage() {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus('请先输入提示词。', 'error');
    promptInput.focus();
    return;
  }

  generateButton.disabled = true;
  generateButton.querySelector('span').textContent = '生成中';
  setStatus('正在提交给小鸡聚合AI，图片任务可能需要 60-90 秒。');

  try {
    let response;

    if (mode === 'edit') {
      if (!imageInput.files?.[0]) {
        throw new Error('图生图模式需要先上传参考图。');
      }

      const formData = new FormData();
      const body = requestBody();
      Object.entries(body).forEach(([key, value]) => formData.set(key, String(value)));
      formData.set('image', imageInput.files[0]);

      response = await fetch('/api/images/edits', {
        method: 'POST',
        body: formData
      });
    } else {
      response = await fetch('/api/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody())
      });
    }

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || '生成失败，请稍后重试。');
    }

    renderResults(payload);
  } catch (error) {
    setStatus(error.message || '生成失败，请稍后重试。', 'error');
  } finally {
    generateButton.disabled = false;
    generateButton.querySelector('span').textContent = '生成';
  }
}

function renderGallery() {
  promptGallery.innerHTML = '';
  prompts.forEach((item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'prompt-card';
    card.innerHTML = `<strong>${item.title}</strong><p>${item.text}</p>`;
    card.addEventListener('click', () => {
      promptInput.value = item.text;
      promptInput.focus();
    });
    promptGallery.append(card);
  });
}

document.querySelectorAll('[data-mode-button]').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.modeButton));
});

document.querySelectorAll('[data-model-shortcut]').forEach((button) => {
  button.addEventListener('click', () => {
    modelInput.value = button.dataset.modelShortcut;
  });
});

imageInput.addEventListener('change', () => {
  const file = imageInput.files?.[0];
  if (!file) {
    imagePreview.hidden = true;
    return;
  }

  const url = URL.createObjectURL(file);
  imagePreview.querySelector('img').src = url;
  imagePreview.hidden = false;
});

clearImageButton.addEventListener('click', () => {
  imageInput.value = '';
  imagePreview.hidden = true;
  imagePreview.querySelector('img').removeAttribute('src');
});

clearResultsButton.addEventListener('click', () => {
  resultsGrid.innerHTML = '';
  setStatus('结果已清空，可以开始新的生成。');
});

randomPromptButton.addEventListener('click', () => {
  const item = prompts[Math.floor(Math.random() * prompts.length)];
  promptInput.value = item.text;
  promptInput.focus();
});

sidebarToggle.addEventListener('click', () => {
  document.body.classList.toggle('sidebar-open');
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  generateImage();
});

renderGallery();
setMode('generate');
