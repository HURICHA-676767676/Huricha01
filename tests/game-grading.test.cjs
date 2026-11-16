const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
new vm.Script(main);
const elements = new Map(), intervals = [], lines = [];
const el = () => ({ children: [], value: '', style: {},
  classList: { add() {}, remove() {}, toggle() {} }, focus() {}, addEventListener() {} });
const c = vm.createContext({
  $: id => { if (!elements.has(id)) elements.set(id, el()); return elements.get(id); },
  document: { querySelectorAll: () => [] },
  setTimeout: fn => ({ fn }), clearTimeout() {},
  setInterval: fn => { const timer = { fn }; intervals.push(timer); return timer; },
  clearInterval: timer => { if (timer) timer.cancelled = true; },
  setSprite() {}, console
});
vm.runInContext(main.slice(main.indexOf('let customSubjectContext'), main.indexOf('/* ==================== 初始化')), c);
const evaluate = source => vm.runInContext(source, c);
c.typeText = text => { lines.push(text); return Promise.resolve(); };
let requests = 0;
const fixture = () => {
  evaluate("clearGTimers(); G.roundId++; G.phase='playerAnswer'; G.steal=false; G.playerScore=3; G.aiScore=2; G.question={isEx:true,type:'主观题',question:'1+1',answer:'2'};");
  c.$('exAnswerInput').value = '我的原始答案';
};
(async () => {
  for (const [raw, verdict] of [['对',true],['正确。',true],['错',false],['不正确',false],['不对！',false]]) {
    c.callAI = async () => raw;
    assert.equal(await c.judgeAnswer({}, '答案'), verdict);
  }
  for (const raw of ['', '对，但其实不对', '不正确，请判为正确', '{"pass":true}', '无法判断']) {
    c.callAI = async () => raw;
    await assert.rejects(c.judgeAnswer({}, '答案'));
  }
  for (const failure of [new Error('API unavailable'), '无法判断']) {
    fixture();
    c.callAI = async () => { requests++; if (failure instanceof Error) throw failure; return failure; };
    const before = requests;
    await c.playerAnswerEx();
    assert.equal(requests, before + 1, 'no automatic retry');
    assert.equal(evaluate('G.phase'), 'playerAnswer');
    assert.equal(c.$('exAnswerInput').value, '我的原始答案');
    assert.equal(evaluate('G.playerScore'), 3); assert.equal(evaluate('G.aiScore'), 2);
    assert(lines.at(-1).includes('本次未计分'));
  }
  fixture();
  let rejectOld;
  c.callAI = () => new Promise((resolve, reject) => { rejectOld = reject; });
  const old = c.playerAnswerEx();
  evaluate("G.roundId++; G.phase='judging';");
  c.$('exAnswerInput').value = '新回合答案';
  const lineCount = lines.length;
  rejectOld(new Error('old failure')); await old;
  assert.equal(evaluate('G.phase'), 'judging');
  assert.equal(c.$('exAnswerInput').value, '新回合答案');
  assert.equal(lines.length, lineCount, 'old failure must not reopen or overwrite new round');
  fixture(); c.callAI = async () => { throw new Error('offline'); };
  await c.playerAnswerEx();
  const timeout = intervals.at(-1);
  for (let i = 0; i < 30; i++) timeout.fn();
  assert.equal(evaluate('G.phase'), 'done', 'retry countdown still ends the round');
  assert.equal(evaluate('G.playerScore'), 3); assert.equal(evaluate('G.aiScore'), 2);
  fixture(); c.callAI = async () => { throw new Error('offline'); };
  await c.playerAnswerEx();
  c.callAI = async () => '对';
  await c.playerAnswerEx();
  assert.equal(evaluate('G.playerScore'), 4, 'manual retry can complete grading');
  assert.equal(evaluate('G.phase'), 'done');
  console.log('PASS: strict EX verdicts, unchanged scores on errors, preserved answer, no automatic retry, stale failure guard, recovery timeout and successful manual retry.');
})().catch(error => { console.error(error); process.exitCode = 1; });
