const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function el() {
  return { children: [], value: '', textContent: '', style: {}, disabled: false,
    classList: { add() {} }, attributes: {}, events: {},
    append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); },
    replaceChildren() { this.children = []; }, setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(k, v) { this.events[k] = v; }, focus() {}, showModal() { this.open = true; }, close() { this.open = false; } };
}
const elements = new Map();
let calls = 0, saved;
const state = { learning: { goals: [], activeId: null }, messages: [], isProcessing: false };
const context = vm.createContext({ state, document: { createElement: el, body: el() },
  $: id => { if (!elements.has(id)) elements.set(id, el()); return elements.get(id); },
  currentGoal: () => state.learning.goals.find(g => g.id === state.learning.activeId),
  latestExamRun: (exam, phase) => [...(exam?.runs || [])].reverse().find(r => r.phase === phase && r.status === 'complete'),
  startSession(s) { state.subject = s.name; state.learning = { goals: [], activeId: null }; state.messages = []; },
  saveHistory() { saved = JSON.parse(JSON.stringify(state.learning)); }, renderLearningPanel() {},
  callAI() { calls++; throw Error('Offline actions must not call AI'); }, confirm: () => true,
  msgInput: el(), autoGrow() {}, console,
});
vm.runInContext(readFileSync(join(__dirname, '..', 'studio.js'), 'utf8'), context);
context.startStudioLesson('fractions');
assert.equal(state.subject, '数学');
assert.equal(state.learning.goals.length, 1);
let goal = state.learning.goals[0];
assert.equal(goal.taughtTurns.length, 0, 'template must not count as teaching or invalidate baseline');
assert.equal(context.studioStage(goal), 1);
goal.exam = { runs: [{ phase: 'before', status: 'complete', taughtCount: 0 }] };
assert.equal(context.studioStage(goal), 2, 'completed baseline should lead to teaching');
goal.taughtTurns.push(0);
goal.exam.runs.push({ phase: 'after', status: 'complete', taughtCount: 1 });
assert.equal(context.studioStage(goal), 3);
goal.taughtTurns.push(1);
assert.equal(context.studioStage(goal), 2, 'new teaching requires another check');
const f = context.studioFraction(2, 3, 1, 4);
assert.equal(f.numerator, 11); assert.equal(f.denominator, 12);
goal.studio.notes = 'TEACHER_PRIVATE'; context.studioSave();
state.learning = saved;
assert.equal(context.studioData(context.currentGoal()).notes, 'TEACHER_PRIVATE');
assert(!JSON.stringify(state.messages).includes('TEACHER_PRIVATE'), 'notes are never teaching messages');
context.startStudioLesson('probability');
goal = context.currentGoal();
const board = el(); context.renderStudioProbability(board, goal.studio);
function buttons(node) { return [node, ...node.children.flatMap(buttons)].filter(n => n.events.click); }
const find = text => buttons(board).find(b => b.textContent === text);
assert.equal(find('把这组观察放入讲解草稿 →').disabled, true);
find('掷 60 次').events.click();
assert.equal(goal.studio.rolls, 60);
assert(goal.studio.hits >= 0 && goal.studio.hits <= 60);
find('把这组观察放入讲解草稿 →').events.click();
assert(context.msgInput.value.includes('60 次'));
assert.equal(state.messages.length, 0, 'draft must not be auto-sent');
goal.studio.rolls = 6000; const hits = goal.studio.hits;
find('掷 60 次').events.click();
assert.equal(goal.studio.rolls, 6000); assert.equal(goal.studio.hits, hits);
find('重置实验').events.click();
assert.equal(goal.studio.rolls, 0); assert.equal(goal.studio.hits, 0);
assert.equal(calls, 0);
console.log('PASS: offline templates, baseline eligibility, route transitions, note persistence/isolation, fraction arithmetic, simulation cap/reset and draft-only handoff.');
