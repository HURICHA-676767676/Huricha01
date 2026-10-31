const { readFileSync } = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const elements = new Map();
function element() {
  return { value: '', textContent: '', disabled: false, classList: {add(){}, remove(){}},
    addEventListener(){}, append(){}, appendChild(){}, replaceChildren(){}, querySelectorAll(){return []}, style: {}, dataset: {}, focus(){} };
}
const context = vm.createContext({
  state: {subject: '数学', sessionId: 's1', messages: [], isProcessing: false},
  $: id => {if(!elements.has(id)) elements.set(id, element()); return elements.get(id)},
  document: {createElement: element}, costDisplay: element(), sendBtn: element(), evalBtn: element(),
  saveHistory(){}, buildStudentPrompt(){return '学生'+context.learningStudentDirective()},
  buildHistoryPayload(){return context.state.messages}, setTimeout, URL, Blob, console,
});
vm.runInContext(readFileSync(require('path').join(__dirname, '..', 'learning.js'), 'utf8'), context);
vm.runInContext(readFileSync(require('path').join(__dirname, '..', 'quiz.js'), 'utf8'), context);
const evaluate = code => vm.runInContext(code, context);
function fixture() {
  evaluate(`state.learning = emptyLearning(); state.usage = emptyUsage(); state.messages = [{role:'user', text:'讲解通分'}]; state.learning.goals.push({id:'g1', title:'分数', misconception:'分母直接相加', question:'1/2+1/3？解释理由', expected:'REFERENCE_ONLY_7d23', status:'not_taught', taughtTurns:[]}); state.learning.activeId='g1';`);
}
(async () => {
  fixture();
  let requests = [];
  context.callAI = async (...args) => {requests.push(args); return ''};
  await context.checkUnderstanding('g1');
  assert.equal(requests.length, 0, '未讲解不能检验');
  context.recordTeachingTurn(0);
  assert.equal(context.state.learning.goals[0].status, 'practicing');
  context.callAI = async (...args) => {
    requests.push(args);
    return requests.length === 1 ? '通分后是5/6。' : JSON.stringify({pass:true,reason:'结果及理由正确',evidence:'通分后是5/6。'});
  };
  await context.checkUnderstanding('g1');
  assert.equal(requests.length, 2);
  assert(!JSON.stringify(requests[0]).includes('REFERENCE_ONLY_7d23'), '学生不能收到参考答案');
  assert(JSON.stringify(requests[1]).includes('REFERENCE_ONLY_7d23'));
  assert.equal(context.state.learning.goals[0].status, 'verified');
  assert.equal(context.state.isProcessing, false);
  context.recordTeachingTurn(0);
  assert.equal(context.state.learning.goals[0].status, 'practicing', '新讲解需重新检验');
  for (const result of [
    {raw:JSON.stringify({pass:false,reason:'理由不充分',evidence:'5/6'}), status:'needs_work'},
    {raw:'not-json',status:'practicing'},
    {raw:JSON.stringify({pass:'true',reason:'对',evidence:'5/6'}),status:'practicing'},
    {raw:JSON.stringify({pass:true,reason:'对',evidence:'并未说过的证据'}),status:'practicing'}
  ]) {
    fixture(); context.recordTeachingTurn(0); let count=0;
    context.callAI = async () => ++count===1 ? '5/6' : result.raw;
    await context.checkUnderstanding('g1');
    assert.equal(context.state.learning.goals[0].status, result.status);
    assert.equal(context.state.isProcessing, false);
  }
  fixture(); context.recordTeachingTurn(0);
  context.callAI = async () => {throw new Error('API unavailable')};
  await context.checkUnderstanding('g1');
  assert.equal(context.state.learning.checks[0].status,'incomplete');
  assert.equal(context.state.isProcessing,false);
  context.recordUsage({prompt_tokens:1000,completion_tokens:200},{inputPrice:2,outputPrice:8});
  assert.equal(context.state.usage.amount,0.0036);
  context.recordUsage(undefined,{inputPrice:2,outputPrice:8});
  context.recordUsage({prompt_tokens:100,completion_tokens:20},{inputPrice:null,outputPrice:null});
  assert.equal(context.state.usage.unknown,1); assert.equal(context.state.usage.unpriced,1);
  context.resetLessonProgress();
  assert.equal(context.state.learning.goals[0].status,'not_taught');
  assert.equal(context.state.learning.checks.length,0);
  console.log('PASS: teaching prerequisite, reference isolation, valid/failed/malformed verification, API failure recovery, recheck, usage, persona reset.');
})().catch(e=>{console.error(e);process.exitCode=1});

