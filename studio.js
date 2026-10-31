/* 本地备课与互动白板：不调用模型；参考标准和私人笔记不会自动发给学生。 */
const STUDIO_TEMPLATES = [
    { id: 'fractions', emoji: '◒', subject: '数学', title: '为什么分母不能直接相加？',
      intro: '拖动分数条，把“同样大小的一份”讲清楚。', goal: '异分母分数相加',
      misconception: '以为分子相加、分母也直接相加',
      question: '计算 2/3 + 1/4，并说明为什么要先通分。',
      expected: '分母表示把同一个整体等分的份数。异分母分数相加，要先通分，使分数单位相同，再将分子相加、分母不变；例如 2/3+1/4=8/12+3/12=11/12。这里比较的两个整体必须相同。',
      prompts: ['先让学生说说分母代表什么，暂时不纠正。', '调整分数条：两条代表同样大小的整体，每一份一样大吗？', '用通分解释为什么能相加，再让学生换一组数独立讲理由。'] },
    { id: 'probability', emoji: '⚄', subject: '数学', title: '扔得越多，就一定越准吗？',
      intro: '掷骰子、看波动，区分理论概率与实验频率。', goal: '理论概率与实验频率',
      misconception: '以为短期频率必须等于概率，或次数增加时误差一定逐步减小',
      question: '一枚公平骰子掷了 12 次，出现 6 点有 4 次。这能说明它不公平吗？解释理由。',
      expected: '公平六面骰子各点数理论概率是 1/6。实验频率是事件出现次数除以试验次数；短期会随机波动。独立重复试验增多时频率趋于稳定的概率意义，不保证每增加一次误差都缩小。少量试验中偏离 1/6 不能单凭该结果断定骰子不公平；不能预测下一次具体点数。',
      prompts: ['先请学生预测：60 次中一定会有 10 次出现 6 吗？', '运行 60 次实验，比较蓝色频率条与理论概率。', '再追加 60 次：误差变大还是变小？请学生解释随机波动。'] }
];
function studioNode(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
}
function studioButton(text, action, className = '') {
    const b = studioNode('button', text, className); b.type = 'button'; b.addEventListener('click', action); return b;
}
function studioTemplate(id) { return STUDIO_TEMPLATES.find(t => t.id === id); }
function studioData(goal) {
    if (!goal.studio) goal.studio = { kind: 'fractions', a: 1, b: 2, c: 1, d: 3, rolls: 0, hits: 0, notes: '' };
    return goal.studio;
}
function studioGcd(a, b) { return b ? studioGcd(b, a % b) : a; }
function studioFraction(a, b, c, d) {
    const denominator = b * d / studioGcd(b, d);
    const left = a * (denominator / b), right = c * (denominator / d);
    return { denominator, left, right, numerator: left + right };
}
function studioStage(goal) {
    if (!goal) return 0;
    if (!goal.taughtTurns?.length) return latestExamRun(goal.exam, 'before') ? 2 : 1;
    const after = latestExamRun(goal.exam, 'after');
    return after && after.taughtCount === goal.taughtTurns.length ? 3 : 2;
}
function startStudioLesson(id) {
    const t = studioTemplate(id);
    if (!t || state.isProcessing) return;
    if (state.subject && state.messages.some(m => m.role === 'user') && !confirm('开始一节模板新课？当前课程可从历史记录恢复。')) return;
    startSession({ name: t.subject, emoji: '📐' }, t.title);
    const goal = { id: 'goal_' + Date.now(), title: t.goal, misconception: t.misconception,
        question: t.question, expected: t.expected, status: 'not_taught', taughtTurns: [],
        studio: { kind: t.id, templateId: t.id, a: 1, b: 2, c: 1, d: 3, rolls: 0, hits: 0, notes: '' } };
    state.learning.goals.push(goal); state.learning.activeId = goal.id;
    $('goalForm').open = false; saveHistory(); renderLearningPanel(); openStudio();
}
function renderStudioProgress() {
    const route = $('studioRoute'); route.replaceChildren();
    $('studioOpen').disabled = state.isProcessing;
    if (!state.subject) return;
    const goal = currentGoal(), stage = studioStage(goal);
    ['① 定目标', '② 做前测', '③ 讲解与实验', '④ 检验与反思'].forEach((label, i) => {
        const b = studioButton(label, () => {
            if (i === 0) { $('goalForm').open = true; $('goalTitle').focus(); }
            if (i === 1 || i === 3) $('examWorkspace').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (i === 2) openStudio();
        });
        if (i === stage) { b.classList.add('current'); b.setAttribute('aria-current', 'step'); }
        b.disabled = state.isProcessing; route.appendChild(b);
    });
    const hint = studioNode('p', !goal ? '先添加一个目标，或用互动备课中的模板开课。' :
        stage === 1 ? '建议先做五题前测；你也可以直接讲解，课后将标注“无前测”。' :
        stage === 2 ? '用白板举例或反问，再查看下方五题检验。' :
        '查看五个维度的作答证据，再到备课台记录下次如何改进。', 'studio-route-hint');
    route.appendChild(hint);
    if ($('studioDialog')?.open) renderStudio();
}
let studioReturnFocus = null;
function openStudio() {
    if (state.isProcessing) return;
    studioReturnFocus = document.activeElement; renderStudio(); $('studioDialog').showModal();
}
function studioSave() { saveHistory(); }
function studioDraft(text) {
    if (state.isProcessing) return;
    if (msgInput.value.trim() && !confirm('用当前白板观察替换尚未发送的草稿？')) return;
    msgInput.value = text; autoGrow(); $('studioDialog').close(); msgInput.focus();
}
function renderStudio() {
    const host = $('studioBody'); host.replaceChildren();
    const goal = state.subject ? currentGoal() : null;
    if (!goal) {
        host.appendChild(studioNode('p', '选择一个模板，自动带入目标、常见误区与参考标准。开课、操作白板都不调用模型。', 'studio-muted'));
        const cards = studioNode('div', undefined, 'studio-template-grid');
        appendStudioCards(cards); host.appendChild(cards); return;
    }
    const data = studioData(goal), template = studioTemplate(data.templateId);
    const grid = studioNode('div', undefined, 'studio-workspace');
    const plan = studioNode('section', undefined, 'studio-plan');
    plan.appendChild(studioNode('span', 'TEACHING NOTES', 'studio-eyebrow'));
    plan.appendChild(studioNode('h3', goal.title));
    plan.appendChild(studioNode('p', '初始误区：' + (goal.misconception || '尚未设置'), 'studio-muted'));
    const list = studioNode('ol');
    (template?.prompts || ['先请学生解释已有想法。', '用一个具体例子，追问“为什么”。', '换一个情境，让学生独立解释。']).forEach(p => list.appendChild(studioNode('li', p)));
    plan.appendChild(list);
    const label = studioNode('label', '课后反思（仅供教师，不自动发给学生）');
    const notes = studioNode('textarea'); notes.id = 'studioNotes'; notes.maxLength = 2500;
    notes.value = data.notes || ''; notes.placeholder = '哪句追问暴露了误区？下一轮想换什么例子？';
    notes.addEventListener('input', () => { data.notes = notes.value; studioSave(); });
    label.appendChild(notes); plan.appendChild(label);
    plan.appendChild(studioNode('p', '笔记、白板状态随本课历史保存，也包含在学习记录导出中。', 'studio-muted'));
    const board = studioNode('section', undefined, 'studio-board');
    const chooser = studioNode('div', undefined, 'studio-board-tabs');
    STUDIO_TEMPLATES.forEach(t => {
        const b = studioButton((t.id === 'fractions' ? '◒ 分数条' : '⚄ 概率实验'), () => { data.kind = t.id; studioSave(); renderStudio(); });
        b.setAttribute('aria-pressed', String(data.kind === t.id)); chooser.appendChild(b);
    });
    board.appendChild(chooser);
    if (data.kind === 'probability') renderStudioProbability(board, data); else renderStudioFractions(board, data);
    grid.append(plan, board); host.appendChild(grid);
}
function studioSlider(parent, label, min, max, value, change) {
    const wrap = studioNode('label', undefined, 'studio-slider');
    const text = studioNode('span', label + ' ' + value);
    const input = studioNode('input'); input.type = 'range'; input.min = min; input.max = max; input.step = 1; input.value = value;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => { text.textContent = label + ' ' + input.value; change(Number(input.value)); });
    wrap.append(text, input); parent.appendChild(wrap); return input;
}
function studioStrip(parent, parts, filled, label, className = '') {
    const row = studioNode('div', undefined, 'studio-strip-row'); row.appendChild(studioNode('span', label));
    const bar = studioNode('div', undefined, 'studio-strip ' + className);
    bar.style.gridTemplateColumns = `repeat(${parts}, 1fr)`;
    for (let i = 0; i < parts; i++) bar.appendChild(studioNode('i', undefined, i < filled ? 'filled' : ''));
    bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${label}：${parts} 等份中取 ${filled} 份`);
    row.appendChild(bar); parent.appendChild(row);
}
function renderStudioFractions(board, data) {
    board.appendChild(studioNode('h3', '同一个整体，不同大小的“份”'));
    board.appendChild(studioNode('p', '两条等长分数条都代表 1 个整体。拖动后观察通分前后的单位。', 'studio-muted'));
    const controls = studioNode('div', undefined, 'studio-fraction-controls'); board.appendChild(controls);
    const view = studioNode('div', undefined, 'studio-fraction-view');
    const output = studioNode('p', undefined, 'studio-equation'); output.setAttribute('aria-live', 'polite');
    const update = () => {
        view.replaceChildren(); const f = studioFraction(data.a, data.b, data.c, data.d);
        studioStrip(view, data.b, data.a, `${data.a}/${data.b}`);
        studioStrip(view, data.d, data.c, `${data.c}/${data.d}`, 'coral');
        view.appendChild(studioNode('p', `通分后，每一小格都是 1/${f.denominator}`, 'studio-muted'));
        studioStrip(view, f.denominator, f.left, `${f.left}/${f.denominator}`);
        studioStrip(view, f.denominator, f.right, `${f.right}/${f.denominator}`, 'coral');
        output.textContent = `${data.a}/${data.b} + ${data.c}/${data.d} = ${f.left}/${f.denominator} + ${f.right}/${f.denominator} = ${f.numerator}/${f.denominator}`;
    };
    [['a','b','第一条'], ['c','d','第二条']].forEach(([n, d, title]) => {
        const group = studioNode('div'); controls.appendChild(group);
        const numerator = studioSlider(group, title + '分子', 0, data[d], data[n], v => { data[n] = v; update(); studioSave(); });
        studioSlider(group, title + '分母', 2, 8, data[d], v => {
            data[d] = v; data[n] = Math.min(data[n], v); numerator.max = v; numerator.value = data[n];
            numerator.previousSibling.textContent = title + '分子 ' + data[n]; update(); studioSave();
        });
    });
    board.append(view, output); update();
    board.appendChild(studioButton('把这组观察放入讲解草稿 →', () => {
        studioDraft(`我们来看两条同样长的分数条：第一条取 ${data.a}/${data.b}，第二条取 ${data.c}/${data.d}。请先解释两条中每一份的大小是否相同。你会怎样把它们变成相同大小的份，再求和？请说出理由。`);
    }, 'studio-primary'));
    board.appendChild(studioNode('p', '只填入草稿，你可以修改后再发送。白板数值不会自动进入考试请求。', 'studio-muted'));
}
function renderStudioProbability(board, data) {
    board.appendChild(studioNode('h3', '公平骰子：出现 6 点的机会'));
    board.appendChild(studioNode('p', '用浏览器伪随机数模拟独立掷公平六面骰子。每次增加 60 次，最多累计 6000 次。', 'studio-muted'));
    const result = studioNode('div'); result.setAttribute('aria-live', 'polite');
    const more = studioButton('掷 60 次', () => {
        if (data.rolls >= 6000) return;
        for (let i = 0; i < 60; i++) if (Math.floor(Math.random() * 6) === 5) data.hits++;
        data.rolls += 60; update(); studioSave();
    }, 'studio-primary');
    let draft;
    const update = () => {
        more.disabled = data.rolls >= 6000;
        if (draft) draft.disabled = !data.rolls;
        const frequency = data.rolls ? data.hits / data.rolls : 0;
        result.replaceChildren();
        result.appendChild(studioNode('p', `${data.rolls} 次试验 · ${data.hits} 次出现 6`, 'studio-equation'));
        [['理论概率', 1/6, ''], ['实验频率', frequency, 'coral']].forEach(([label, value, color]) => {
            result.appendChild(studioNode('p', `${label}：${label === '实验频率' && !data.rolls ? '尚未试验' : (value * 100).toFixed(1) + '%'}`, 'studio-muted'));
            const track = studioNode('div', undefined, 'studio-frequency');
            const fill = studioNode('div', undefined, color); fill.style.width = (value * 100) + '%'; track.appendChild(fill); result.appendChild(track);
        });
    };
    board.appendChild(result); const actions = studioNode('div', undefined, 'studio-board-tabs');
    actions.append(more, studioButton('重置实验', () => { data.rolls = 0; data.hits = 0; update(); studioSave(); })); board.appendChild(actions); update();
    board.appendChild(studioNode('p', '频率可能上下波动；增加次数并不保证每一步都更接近 1/6。这个模拟也不能检验一枚真实骰子。', 'studio-muted'));
    draft = studioButton('把这组观察放入讲解草稿 →', () => {
        if (!data.rolls) return;
        studioDraft(`我们模拟掷公平骰子 ${data.rolls} 次，其中 ${data.hits} 次出现 6，频率约 ${(100 * data.hits / data.rolls).toFixed(1)}%。请解释这个频率与理论概率 1/6 有什么区别。再增加 60 次，频率一定会更接近 1/6 吗？为什么？`);
    });
    draft.disabled = !data.rolls; board.appendChild(draft);
}
function appendStudioCards(host) {
    STUDIO_TEMPLATES.forEach(t => {
        const card = studioNode('article', undefined, 'studio-template');
        card.appendChild(studioNode('span', t.emoji, 'studio-template-icon'));
        card.appendChild(studioNode('h4', t.title)); card.appendChild(studioNode('p', t.intro));
        card.appendChild(studioButton('用此模板开课 ↗', () => startStudioLesson(t.id)));
        host.appendChild(card);
    });
}
const studioDialog = studioNode('dialog', undefined, 'studio-dialog'); studioDialog.id = 'studioDialog';
studioDialog.setAttribute('aria-labelledby', 'studioDialogTitle');
const studioHead = studioNode('header');
const studioTitle = studioNode('h2', '互动备课台'); studioTitle.id = 'studioDialogTitle';
studioHead.append(studioTitle, studioButton('关闭', () => studioDialog.close()));
const studioBody = studioNode('div'); studioBody.id = 'studioBody';
const studioFooter = studioNode('footer');
studioFooter.appendChild(studioNode('span', '设计借鉴：'));
[['DeepTutor', 'https://github.com/HKUDS/DeepTutor'], ['OpenMAIC', 'https://github.com/THU-MAIC/OpenMAIC']].forEach(([name, url]) => {
    const a = studioNode('a', name); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; studioFooter.appendChild(a);
});
studioFooter.appendChild(studioNode('span', '· 本地互动练习；AI 作答仍需自行配置模型。'));
studioDialog.append(studioHead, studioBody, studioFooter); document.body.appendChild(studioDialog);
studioDialog.addEventListener('close', () => studioReturnFocus?.focus());
$('studioOpen').addEventListener('click', openStudio);
appendStudioCards($('studioTemplates'));
renderStudioProgress();
