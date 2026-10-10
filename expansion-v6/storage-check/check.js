(function () {
  'use strict';
  const scope = window.DewkeepersCanaryScope;
  const bridge = window.__dewkeepersProgressV6;
  scope.observeBridge(bridge);
  const ids = ['prepare', 'verify', 'reload', 'duplicate', 'abort', 'arm', 'cas', 'download'];
  const ui = Object.fromEntries([...ids, 'run', 'database', 'role', 'status', 'armed', 'results', 'report', 'second-tab'].map(id => [id, document.getElementById(id)]));
  const params = new URLSearchParams(location.hash.slice(1));
  const state = { run: '', role: params.get('role') === 'B' ? 'B' : 'A', latest: null, armed: null, busy: false, request: 0, results: [], page: randomHex(), started: new Date().toISOString() };
  function randomHex() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join(''); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function payload(revision, writer, transaction) {
    return JSON.stringify({ probe: 'dewkeepers-v6-canary', schema: 1, revision, writer, transaction, synthetic: { seed: 314159, stage: 1, hearts: 4, blessing: 'sapling' } });
  }
  const A = payload(1, 'prepare', 'fixed-A');
  const B = payload(2, 'prepare', 'fixed-B');
  const C = role => payload(3, role, 'fixed-CAS-' + role);
  function validPair(value) {
    return (value.current === B && value.backup === A) ||
      ((value.current === C('A') || value.current === C('B')) && value.backup === B);
  }
  function samePair(a, b) { return a.current === b.current && a.backup === b.backup; }
  function report() {
    return {
      diagnostic: 'Dewkeepers v6 isolated browser storage check', format: 1,
      runtimeCommit: '8a05d0c2f7087eb7bf84d0ee12b2182b198476aa',
      productionScriptSha256: '91c976d739e9527757fea288ef0f04c23ee9acce46fa504e297a304393943199',
      pageInstance: state.page, started: state.started, role: state.role,
      navigationType: performance.getEntriesByType('navigation')[0]?.type || 'not reported',
      origin: location.origin, pathname: location.pathname,
      results: state.results, lastRead: state.latest, scope: scope.report(),
      limits: ['No game data accessed', 'Synthetic canary only; no deletion', 'Bridge JS bytes unchanged; IndexedDB dependency and reply observation wrapped', 'CAS compares current bytes as production does; not a second CAS on backup', 'Audited fixed page, not a sandbox against additional hostile same-origin scripts', 'Not a Godot UI, quota, private-mode, eviction, browser restart or power-loss acceptance result']
    };
  }
  function render() {
    ui.run.textContent = state.run || '尚未创建';
    ui.database.textContent = scope.report().database || '尚未打开';
    ui.role.textContent = state.role;
    for (const id of ids) ui[id].disabled = state.busy;
    ui.prepare.disabled = state.busy || Boolean(state.run);
    for (const id of ['verify', 'reload']) ui[id].disabled = state.busy || !state.run;
    for (const id of ['duplicate', 'abort']) ui[id].disabled = state.busy || !state.latest;
    ui.arm.disabled = state.busy || !state.run || (state.latest && state.latest.current !== B);
    ui.cas.disabled = state.busy || !state.armed;
    ui['second-tab'].setAttribute('aria-disabled', String(!state.run || state.busy));
    if (state.run) {
      const link = new URL(location.href);
      link.hash = new URLSearchParams({ run: state.run, role: 'B' }).toString();
      ui['second-tab'].href = link.href;
    }
    ui.armed.textContent = state.armed ? '已锁定 revision 2。此基线不会随只读验证更新。候选：' + state.role : '尚未锁定基线。';
    ui.report.textContent = JSON.stringify(report(), null, 2);
  }
  function result(label, status, details) {
    const value = { label, status, details, time: new Date().toISOString() };
    state.results.push(value);
    const item = document.createElement('li');
    item.className = status;
    item.textContent = (status === 'pass' ? '通过 · ' : '未通过 · ') + label + '：' + details;
    ui.results.appendChild(item);
  }
  function status(text, failed) { ui.status.textContent = text; ui.status.dataset.state = failed ? 'fail' : 'normal'; }
  async function request(operation, expected, candidate, previous, options = {}) {
    const id = state.page + '-' + (++state.request);
    scope.permit(id, { mode: operation === 'load' && !options.create ? 'read' : 'write', create: options.create, abortAfterFirstPut: options.abortAfterFirstPut });
    bridge.request(id, operation, expected || '', candidate || '', previous || '');
    const response = await new Promise(resolve => {
      const poll = () => {
        const raw = scope.take(id);
        if (raw) resolve(JSON.parse(raw));
        else setTimeout(poll, 20);
      };
      poll();
    });
    scope.confirmReply(id, response);
    return { id, response, transaction: scope.transaction(id) };
  }
  async function read() {
    const { response } = await request('load');
    assert(!response.error, '只读打开失败：' + response.error + '。若样本已被清理，不会自动重建。');
    assert(validPair(response), '样本未完成、内容不符或已变化；保留原值，停止写测试。');
    state.latest = response;
    return response;
  }
  function action(id, label, run) {
    ui[id].addEventListener('click', async event => {
      if (!event.isTrusted || state.busy || ui[id].disabled) return;
      state.busy = true; status(label + '…'); render();
      try { await run(); status(label + '完成。可查看本页结果与报告。'); }
      catch (error) { result(label, 'fail', error.message); status(label + '未通过：' + error.message, true); }
      finally { state.busy = false; render(); }
    });
  }
  action('prepare', '创建并提交样本', async () => {
    assert(!state.run, '本 run 已存在，不能再次初始化。');
    state.run = randomHex(); scope.setRun(state.run);
    const url = new URL(location.href);
    url.hash = new URLSearchParams({ run: state.run, role: state.role }).toString();
    history.replaceState(null, '', url.href);
    const initial = await request('load', '', '', '', { create: true });
    assert(!initial.response.error && initial.response.current === '' && initial.response.backup === '', '新随机库初始化失败；不继续写入。');
    const first = await request('commit', '', A, '');
    assert(!first.response.error && first.response.current === A, '第一次事务未提交：' + first.response.error);
    const second = await request('commit', A, B, A);
    assert(!second.response.error && second.response.current === B, '第二次事务未提交：' + second.response.error);
    const value = await read();
    assert(value.current === B && value.backup === A, 'A → B 后当前与备份不一致。');
    result('A → B + backup', 'pass', '两个提交均在原生 transaction complete 后收到成功；current=B / backup=A。请刷新后只读验证。');
  });
  action('verify', '只读验证', async () => {
    const value = await read();
    result('只读回读', 'pass', 'current revision ' + JSON.parse(value.current).revision + ' 与 backup 精确匹配固定样本。页面实例 ' + state.page + '。');
  });
  action('duplicate', '精确重复提交', async () => {
    const before = await read();
    const check = await request('commit', before.backup, before.current, before.backup);
    assert(!check.response.error && check.response.duplicate === true, '未确认 duplicate。');
    assert(check.transaction && check.transaction.puts === 0, '重复请求不应发出任何 put。');
    assert(samePair(before, await read()), '重复提交改变了 current 或 backup。');
    result('精确重复提交', 'pass', 'duplicate=true，零 put，current / backup 原始字节保持一致。');
  });
  action('abort', '事务中止与回滚', async () => {
    const before = await read();
    const revision = JSON.parse(before.current).revision;
    const check = await request('commit', before.current, payload(revision + 1, 'abort-test', 'must-not-commit'), before.current, { abortAfterFirstPut: true });
    assert(check.response.error && check.transaction && check.transaction.terminal === 'abort', '未观察到失败与真实事务 abort。');
    assert(scope.report().events.some(e => e.kind === 'first-put-success-then-injected-abort' && e.id === check.id), '未观察到首个 put 成功后的中止注入。');
    assert(samePair(before, await read()), '中止事务后 current 或 backup 被改变。');
    result('事务中止与回滚', 'pass', '首个 put 请求成功后 abort；bridge 返回 ' + check.response.error + '；两个槽均保持原字节。');
  });
  action('arm', '锁定 CAS 基线', async () => {
    const before = await read();
    assert(before.current === B, 'CAS 只从 revision 2 运行一次；当前结果已提交。');
    state.armed = { current: before.current, backup: before.backup };
    result('锁定 CAS 基线', 'pass', '角色 ' + state.role + ' 只读锁定 revision 2；请确认另一标签也锁定同一基线。');
  });
  action('cas', '提交 CAS 候选', async () => {
    assert(state.armed, '请先锁定本标签基线。');
    const baseline = state.armed;
    state.armed = null;
    const candidate = C(state.role);
    const check = await request('commit', baseline.current, candidate, baseline.current);
    const after = await read();
    if (check.response.error === 'conflict') {
      assert(check.transaction.puts === 0 && after.current !== candidate && after.current !== baseline.current, '冲突结果不符合另一标签已提交的状态。');
      result('CAS conflict', 'pass', '本标签旧基线被拒绝，零 put；已回读另一角色的 revision 3，backup=B。');
    } else {
      assert(!check.response.error && !check.response.duplicate && check.response.current === candidate && after.current === candidate && after.backup === B, 'CAS 提交未得到预期的新 revision 3：' + check.response.error);
      result('CAS commit', 'pass', '角色 ' + state.role + ' 提交 revision 3；另一标签须单独确认 conflict 与相同回读。');
    }
  });
  ui.reload.addEventListener('click', event => { if (event.isTrusted && !state.busy && state.run) location.reload(); });
  ui['second-tab'].addEventListener('click', event => { if (!event.isTrusted || !state.run || state.busy) event.preventDefault(); });
  ui.download.addEventListener('click', event => {
    if (!event.isTrusted || state.busy) return;
    const blob = new Blob([JSON.stringify(report(), null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'dewkeepers-canary-' + state.role + '-' + state.page + '.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  if (window.top !== window) {
    state.busy = true;
    status('请直接打开本页地址；嵌入页面内不会启用任何存储动作。', true);
    render();
    return;
  }
  const run = params.get('run');
  if (run) {
    if (/^[a-f0-9]{32}$/.test(run)) {
      state.run = run; scope.setRun(run);
      status('已识别已有 run；页面尚未打开数据库。点击「只读验证」或「锁定基线」才读取。');
    } else {
      state.busy = true; status('运行编号格式无效；为安全起见，本页不打开数据库。请使用原始诊断地址重新开始。', true);
    }
  }
  render();
})();
