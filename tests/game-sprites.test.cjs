const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
new vm.Script(main); // 检查整个内联脚本语法。
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function element() {
  return { children: [], style: {}, events: {}, value: '', src: 'assets/normal.png',
    classList: { adds: 0, add() { this.adds++; }, remove() {}, toggle() {} },
    getAttribute(key) { return this[key]; }, addEventListener(k, fn) { this.events[k] = fn; },
    focus() {}, appendChild(child) { this.children.push(child); } };
}
(async () => {
  const pending = new Map(), image = element();
  const sprite = vm.createContext({ $: () => image,
    Image: class { set src(value) { pending.set(value, this); } } });
  vm.runInContext(fs.readFileSync(path.join(root, 'sprites.js'), 'utf8'), sprite);
  const first = sprite.setSprite('thinking');
  const last = sprite.setSprite('surprise');
  pending.get('assets/surprise.png').onload(); await last;
  pending.get('assets/thinking.png').onload(); await first;
  assert.equal(image.src, 'assets/surprise.png', 'slow old image must not overwrite latest reaction');
  const bobs = image.classList.adds;
  await sprite.setSprite('surprise');
  assert.equal(image.classList.adds, bobs, 'same image must not restart bob');
  const failed = sprite.setSprite('win'); pending.get('assets/win.png').onerror(); await flush();
  pending.get('assets/normal.png').onload(); await failed;
  assert.equal(image.src, 'assets/normal.png', 'failed image falls back to a loaded normal image');
  const names = vm.runInContext('Object.keys(GAME_SPRITES)', sprite);
  assert(!names.includes('surprised')); assert(names.includes('surprise'));

  const elements = new Map(), timers = [], reactions = [], lines = [];
  const c = vm.createContext({
    $: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    document: { querySelectorAll: () => [], createElement: element },
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.cancelled = true; }, clearInterval() {},
    setSprite: name => reactions.push(name), console,
  });
  const game = main.slice(main.indexOf('let customSubjectContext'), main.indexOf('/* ==================== 初始化'));
  vm.runInContext(game, c);
  const evaluate = text => vm.runInContext(text, c);
  let releaseSpeech;
  c.typeText = text => { lines.push(text); return text === 'QUIP' ? new Promise(resolve => { releaseSpeech = resolve; }) : Promise.resolve(); };
  c.xiaoyaSpeak = c.xiaoyaSpeakEx = async () => 'QUIP';
  for (const isEx of [false, true]) {
    evaluate(`clearGTimers(); G.roundId++; G.master='16'; G.phase='buzz'; G.playerScore=0; G.aiScore=0; G.question={isEx:${isEx},question:'test',answer:'A',options:['A','B','C','D']};`);
    c.aiBuzz(); await flush();
    assert.equal(evaluate('G.aiStage'), 'speaking');
    const before = lines.length, reactionCount = reactions.length;
    timers.filter(t => t.ms === 2000 && !t.cancelled).forEach(t => t.fn());
    assert.equal(lines.length, before, 'thinking timer must not replace answer text');
    assert.equal(reactions.length, reactionCount, 'thinking timer must not replace speaking expression');
    releaseSpeech(); await flush();
    assert.equal(evaluate('G.aiStage'), 'judging');
    timers.filter(t => t.ms === 1200 && !t.cancelled).forEach(t => t.fn());
    assert.equal(reactions.at(-1), 'win');
  }
  let releaseAnswer;
  c.xiaoyaSpeak = () => new Promise(resolve => { releaseAnswer = resolve; });
  evaluate("clearGTimers(); G.roundId++; G.phase='buzz'; G.question={answer:'A',options:['A','B','C','D']};");
  c.aiBuzz();
  timers.filter(t => t.ms === 2000 && !t.cancelled).forEach(t => t.fn());
  assert.equal(reactions.at(-1), 'thinking', 'slow model should show thinking while waiting');
  evaluate("G.roundId++; G.phase='aiAnswer'; G.question={answer:'B'};");
  const count = reactions.length; releaseAnswer('OLD_ANSWER'); await flush();
  assert.equal(reactions.length, count, 'previous round response must not change the new round sprite');
  evaluate("G.phase='aiAnswer'; G.question={answer:'A'};"); c.resolveAiAnswer('B', false, true);
  assert.equal(reactions.at(-1), 'surprise');
  evaluate("G.phase='aiAnswer';"); c.resolveAiAnswerEx(false, true);
  assert.equal(reactions.at(-1), 'surprise');
  evaluate("G.phase='playerAnswer'; G.steal=false;"); c.playerAnswer('B');
  assert.equal(reactions.at(-1), 'handup', 'player mistake must not trigger premature victory');
  evaluate("G.phase='playerAnswer'; G.steal=true;"); c.playerAnswer('B');
  assert.equal(evaluate('G.phase'), 'done', 'both players wrong must finish, not give AI another turn');
  console.log('PASS: sprite load races/fallback, no repeated bob, fast/slow MCQ and EX turns, stale round responses, valid surprise asset and no premature celebration.');
})().catch(error => { console.error(error); process.exitCode = 1; });
