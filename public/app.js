// ===== App State =====
const state = {
  recipients: [],
  history: [],
  historyLimit: 50,
  historyTotal: 0,
};

// ===== Navigation =====
document.getElementById('mainNav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  e.preventDefault();

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  item.classList.add('active');
  const tab = item.dataset.tab;
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab === 'recipients') loadRecipients();
  else if (tab === 'dashboard') loadDashboard();
  else if (tab === 'history') loadHistory(true);
  else if (tab === 'settings') loadSettings();
  else if (tab === 'quotes') loadQuotes();
});

// ===== API Helper =====
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ===== Toast =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

// ===== Modal Helper =====
function openModal(title, bodyHtml, actionsHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalActions').innerHTML = actionsHtml;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ===== Dashboard =====
async function loadDashboard() {
  try {
    const status = await api('GET', '/api/status');
    document.getElementById('statRecipients').textContent = status.recipientCount;
    document.getElementById('statActive').textContent = status.activeRecipientCount;
    document.getElementById('statSent').textContent = status.totalQuotesSent;

    // Quote stat: total + dynamic breakdown
    document.getElementById('statQuotes').innerHTML = `${status.totalQuotes} <span style="font-size:12px;color:var(--gray-400)">(+${status.dynamicQuotes||0}动态)</span>`;

    // Email method display
    const emailEl = document.getElementById('statSmtp');
    if (status.emailMethod === 'brevo') {
      emailEl.textContent = '✅ Brevo API';
      emailEl.style.fontSize = '16px';
    } else if (status.emailMethod === false) {
      emailEl.textContent = '❌ 未配置';
    }

    document.getElementById('statLastSend').textContent = status.lastSendTime
      ? new Date(status.lastSendTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      : '暂无记录';

    // Schedule table
    const tbody = document.getElementById('scheduleBody');
    tbody.innerHTML = '';
    if (!status.sendTimes || status.sendTimes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--gray-400)">暂无定时任务</td></tr>';
    } else {
      for (const st of status.sendTimes) {
        const hour = parseInt(st.time);
        const label = hour < 12 ? '🌅 早上' : hour < 14 ? '☀️ 中午' : '🌇 傍晚';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${st.time}</strong></td>
          <td>${label}</td>
          <td>${status.nextSendTime ? new Date(status.nextSendTime).toLocaleString('zh-CN', { timeZone: status.timezone || 'Asia/Shanghai' }) : '待定'}</td>
        `;
        tbody.appendChild(tr);
      }
    }

    // Status dot
    const dot = document.getElementById('statusDot');
    dot.className = 'status-dot ' + (status.emailMethod ? 'online' : 'offline');
    document.getElementById('statusText').textContent = status.emailMethod === 'brevo' ? 'Brevo 运行中' : '邮件未配置';
  } catch (err) {
    showToast('加载仪表盘失败: ' + err.message, 'error');
  }
}

// ===== Recipients =====
async function loadRecipients() {
  try {
    const recipients = await api('GET', '/api/recipients');
    state.recipients = recipients;
    const tbody = document.getElementById('recipientBody');
    tbody.innerHTML = '';

    if (recipients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:32px;">暂无收件人，点击右上角添加</td></tr>';
      return;
    }

    for (const r of recipients) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.id}</td>
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td>${escapeHtml(r.email)}</td>
        <td><span class="badge ${r.active ? 'badge-success' : 'badge-warning'}">${r.active ? '活跃' : '停用'}</span></td>
        <td>${formatDate(r.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editRecipient(${r.id})">编辑</button>
          <button class="btn btn-sm btn-danger-outline" onclick="deleteRecipient(${r.id})">删除</button>
          <button class="btn btn-sm btn-outline" onclick="testSendRecipient(${r.id})">📧 测试</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  } catch (err) {
    showToast('加载收件人失败: ' + err.message, 'error');
  }
}

function showAddRecipient() {
  openModal(
    '添加收件人',
    `
      <div class="form-group">
        <label>姓名</label>
        <input type="text" id="rName" placeholder="请输入姓名" />
      </div>
      <div class="form-group">
        <label>邮箱</label>
        <input type="email" id="rEmail" placeholder="请输入邮箱地址" />
      </div>
    `,
    `
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveNewRecipient()">保存</button>
    `
  );
}

async function saveNewRecipient() {
  const name = document.getElementById('rName').value.trim();
  const email = document.getElementById('rEmail').value.trim();
  if (!name || !email) { showToast('请填写完整信息', 'error'); return; }
  try {
    await api('POST', '/api/recipients', { name, email });
    closeModal();
    showToast('添加成功', 'success');
    loadRecipients();
    loadDashboard();
  } catch (err) {
    showToast('添加失败: ' + err.message, 'error');
  }
}

async function editRecipient(id) {
  const r = state.recipients.find(x => x.id === id);
  if (!r) return;
  openModal(
    '编辑收件人',
    `
      <div class="form-group">
        <label>姓名</label>
        <input type="text" id="rName" value="${escapeHtml(r.name)}" />
      </div>
      <div class="form-group">
        <label>邮箱</label>
        <input type="email" id="rEmail" value="${escapeHtml(r.email)}" />
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" id="rActive" ${r.active ? 'checked' : ''} />
          启用发送
        </label>
      </div>
    `,
    `<button class="btn btn-outline" onclick="closeModal()">取消</button>
     <button class="btn btn-primary" onclick="saveEditRecipient(${id})">保存</button>`
  );
}

async function saveEditRecipient(id) {
  const name = document.getElementById('rName').value.trim();
  const email = document.getElementById('rEmail').value.trim();
  const active = document.getElementById('rActive').checked;
  if (!name || !email) { showToast('请填写完整信息', 'error'); return; }
  try {
    await api('PUT', `/api/recipients/${id}`, { name, email, active });
    closeModal();
    showToast('更新成功', 'success');
    loadRecipients();
    loadDashboard();
  } catch (err) {
    showToast('更新失败: ' + err.message, 'error');
  }
}

async function deleteRecipient(id) {
  if (!confirm('确定要删除此收件人吗？')) return;
  try {
    await api('DELETE', `/api/recipients/${id}`);
    showToast('删除成功', 'success');
    loadRecipients();
    loadDashboard();
  } catch (err) {
    showToast('删除失败: ' + err.message, 'error');
  }
}

async function testSendRecipient(id) {
  try {
    await api('POST', '/api/test-send', { recipient_id: id });
    showToast('测试邮件已发送 📬', 'success');
  } catch (err) {
    showToast('发送失败: ' + err.message, 'error');
  }
}

// ===== Test Send (Dashboard) =====
async function testSend() {
  const recipients = state.recipients.length
    ? state.recipients
    : await api('GET', '/api/recipients');
  if (recipients.length === 0) { showToast('没有收件人可发送', 'error'); return; }

  openModal(
    '发送测试邮件',
    `
      <div class="form-group">
        <label>选择收件人</label>
        <select class="select-recipient" id="testRecipient">
          ${recipients.map(r => `<option value="${r.id}">${escapeHtml(r.name)} (${escapeHtml(r.email)})</option>`).join('')}
        </select>
      </div>
    `,
    `<button class="btn btn-outline" onclick="closeModal()">取消</button>
     <button class="btn btn-primary" onclick="doTestSend()">发送测试</button>`
  );
}

async function doTestSend() {
  const id = parseInt(document.getElementById('testRecipient').value, 10);
  try {
    await api('POST', '/api/test-send', { recipient_id: id });
    closeModal();
    showToast('测试邮件已发送 📬', 'success');
  } catch (err) {
    showToast('发送失败: ' + err.message, 'error');
  }
}

async function sendNow() {
  if (!confirm('立即向所有活跃收件人发送每日心语？')) return;
  try {
    await api('POST', '/api/send-now');
    showToast('发送任务已触发 🚀', 'success');
    setTimeout(loadDashboard, 2000);
  } catch (err) {
    showToast('发送失败: ' + err.message, 'error');
  }
}

async function restartScheduler() {
  try {
    await api('POST', '/api/scheduler/restart');
    showToast('定时器已重启', 'success');
    loadDashboard();
  } catch (err) {
    showToast('重启失败: ' + err.message, 'error');
  }
}

async function resetQuotes() {
  if (!confirm('确定要重置所有发送记录吗？语录将重新开始轮换。')) return;
  try {
    await api('POST', '/api/reset-quotes');
    showToast('发送记录已重置', 'success');
    loadDashboard();
  } catch (err) {
    showToast('重置失败: ' + err.message, 'error');
  }
}

async function fetchFreshQuotes() {
  try {
    const result = await api('POST', '/api/fetch-quotes');
    showToast(result.message, 'success');
    loadDashboard();
    loadQuotes();
  } catch (err) {
    showToast('获取语录失败: ' + err.message, 'error');
  }
}

// ===== Settings =====
async function loadSettings() {
  try {
    const s = await api('GET', '/api/settings');

    // Brevo
    document.getElementById('brevo_api_key').value = s.brevo_api_key || '';
    document.getElementById('brevo_sender_name').value = s.brevo_sender_name || '每日心语';
    document.getElementById('brevo_sender_email').value = s.brevo_sender_email || '';

    // SMTP (fallback)
    document.getElementById('smtp_host').value = s.smtp_host || '';
    document.getElementById('smtp_port').value = s.smtp_port || '';
    document.getElementById('smtp_user').value = s.smtp_user || '';
    document.getElementById('smtp_pass').value = s.smtp_pass || '';
    document.getElementById('smtp_from').value = s.smtp_from || '';

    // Schedule
    document.getElementById('send_times').value = s.send_times || '08:00,17:00';
    document.getElementById('timezone').value = s.timezone || 'Asia/Shanghai';
  } catch (err) {
    showToast('加载设置失败: ' + err.message, 'error');
  }
}

async function saveSettings() {
  const settings = {
    // Brevo
    brevo_api_key: document.getElementById('brevo_api_key').value.trim(),
    brevo_sender_name: document.getElementById('brevo_sender_name').value.trim(),
    brevo_sender_email: document.getElementById('brevo_sender_email').value.trim(),
    // SMTP
    smtp_host: document.getElementById('smtp_host').value.trim(),
    smtp_port: document.getElementById('smtp_port').value.trim(),
    smtp_user: document.getElementById('smtp_user').value.trim(),
    smtp_pass: document.getElementById('smtp_pass').value,
    smtp_from: document.getElementById('smtp_from').value.trim(),
    // Schedule
    send_times: document.getElementById('send_times').value.trim(),
    timezone: document.getElementById('timezone').value,
  };

  try {
    await api('PUT', '/api/settings', settings);
    document.getElementById('settingsMessage').textContent = '✅ 设置已保存并生效';
    showToast('设置已保存', 'success');
    loadDashboard();
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
}

async function verifyBrevo() {
  const btn = document.getElementById('verifyBrevoBtn');
  btn.disabled = true;
  btn.textContent = '验证中...';
  try {
    const result = await api('GET', '/api/brevo/verify');
    showToast(result.message, result.valid ? 'success' : 'error');
    if (!result.valid) {
      // Suggest fixes
      setTimeout(() => {
        if (result.message.includes('API key')) {
          showToast('💡 请检查 Brevo API Key 是否正确填写', 'info');
        } else if (result.message.includes('发件人')) {
          showToast('💡 请在 Brevo 后台 → 发件人管理 中验证该邮箱', 'info');
        }
      }, 100);
    }
  } catch (err) {
    showToast('验证失败: ' + err.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = '验证 Brevo 配置';
}

// ===== History =====
async function loadHistory(reset = false) {
  if (reset) { state.historyLimit = 50; state.historyTotal = 0; }

  try {
    const result = await api('GET', `/api/history?limit=${state.historyLimit}&offset=0`);
    state.history = result.data;
    state.historyTotal = result.total;

    document.getElementById('historyCount').textContent = `共 ${state.historyTotal} 条`;
    const tbody = document.getElementById('historyBody');
    tbody.innerHTML = '';

    if (state.history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:32px;">暂无发送记录</td></tr>';
      return;
    }

    for (const h of state.history) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="white-space:nowrap">${formatDate(h.sent_at)}</td>
        <td>${escapeHtml(h.recipient_name)}</td>
        <td style="font-size:12px;color:var(--gray-500)">${escapeHtml(h.recipient_email)}</td>
        <td class="truncate" title="${escapeHtml(h.quote_content)}">${escapeHtml(truncate(h.quote_content, 50))}</td>
        <td><span class="badge badge-info">${h.send_time}</span></td>
        <td><span class="badge ${h.status === 'success' ? 'badge-success' : 'badge-danger'}">${h.status === 'success' ? '✅ 成功' : '❌ 失败'}</span></td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('loadMoreWrap').style.display =
      state.history.length < state.historyTotal ? 'block' : 'none';
  } catch (err) {
    showToast('加载历史失败: ' + err.message, 'error');
  }
}

async function loadMoreHistory() {
  state.historyLimit += 50;
  await loadHistory(false);
}

// ===== Quotes =====
async function loadQuotes() {
  try {
    const info = await api('GET', '/api/quotes');
    document.getElementById('qTotal').textContent = info.total;
    document.getElementById('qBuiltIn').textContent = info.builtIn;
    document.getElementById('qDynamic').textContent = info.dynamic || 0;
    document.getElementById('qCustom').textContent = info.custom;
    document.getElementById('customQuoteCount').textContent = `${info.custom} 条`;
  } catch (err) {
    showToast('加载名言信息失败: ' + err.message, 'error');
  }
}

async function addQuote() {
  const content = document.getElementById('newQuoteContent').value.trim();
  const author = document.getElementById('newQuoteAuthor').value.trim() || '佚名';
  if (!content) { showToast('请输入名言内容', 'error'); return; }

  try {
    await api('POST', '/api/quotes', { content, author });
    document.getElementById('newQuoteContent').value = '';
    document.getElementById('newQuoteAuthor').value = '';
    showToast('名言已添加', 'success');
    loadQuotes();
    loadDashboard();
  } catch (err) {
    showToast('添加失败: ' + err.message, 'error');
  }
}

// ===== Utilities =====
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, n) {
  return str && str.length > n ? str.slice(0, n) + '...' : str;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  });
}

// ===== Init =====
loadDashboard();
loadRecipients();
