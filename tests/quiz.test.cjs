const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function element() { return { value: '', textContent: '', disabled: false, dataset: {}, classList:{add(){},remove(){}}, addEventListener(){}, append(){}, appendChild(){}, replaceChildren(){}, querySelectorAll(){return []}, style:{}, focus(){} }; }
let settings = {model:'Student-A', examinerModel:'Examiner-B',apiUrl:'https://example.test/v1/chat/completions'};
const context = vm.createContext({
    state:{subject:'数学',sessionId:'s1',difficulty:'normal',preStudy:false,messages:[],isProcessing:false},
    $: id => {if(!elements.has(id))elements.set(id,element());return elements.get(id)},
    document:{createElement:element}, costDisplay:element(),sendBtn:element(),evalBtn:element(),
    saveHistory(){},addSystemNote(){},loadSettings(){return settings},
    buildStudentPrompt(){return 'student-role'+context.learningStudentDirective()},
    buildHistoryPayload(){return context.state.messages},setTimeout,URL,Blob,console
});
for(const name of ['learning.js','quiz.js']) vm.runInContext(readFileSync(join(__dirname,'..',name),'utf8'),context);
const run = code => vm.runInContext(code,context);
const ids=['concept','procedure','correction','transfer','boundary'];
const paper={before:ids.map(id=>({id,question:'前测_'+id,reference:'SECRET_REFERENCE_'+id,rubric:'SECRET_RUBRIC_'+id})),after:ids.map(id=>({id,question:'课后_'+id,reference:'SECRET_POST_'+id,rubric:'SECRET_POST_RUBRIC_'+id}))};
const answers={answers:ids.map(id=>({id,answer:'学生理由_'+id}))};
function grades(pass){return {grades:ids.map(id=>({id,pass,reason:'可核对理由',evidence:'学生理由_'+id}))};}
function fixture(){
    settings={model:'Student-A',examinerModel:'Examiner-B',apiUrl:'https://example.test/v1/chat/completions'};
    run(`state.learning=emptyLearning();state.usage=emptyUsage();state.messages=[];state.learning.goals.push({id:'g1',title:'分数加法',misconception:'分母直接相加',question:'',expected:'SECRET_TEACHER_REFERENCE',status:'not_taught',taughtTurns:[]});state.learning.activeId='g1';`);
}
function mockSequence(sequence){
    const requests=[];
    context.callAI=async (...args)=>{
        requests.push(args);
        assert(sequence.length,'意外的额外模型调用');
        const next=sequence.shift(); if(next instanceof Error)throw next;
        return typeof next==='string'?next:JSON.stringify(next);
    };
    return requests;
}
(async()=>{
    fixture();
    assert.throws(()=>context.validateExamPaper(JSON.stringify({...paper,before:paper.before.slice(0,4)})));
    assert.throws(()=>context.validateExamPaper(JSON.stringify({...paper,after:paper.before})));
    assert.throws(()=>context.validateExamAnswers(JSON.stringify({answers:answers.answers.slice(0,4)})));
    const forged=grades(true);forged.grades[0].evidence='编造证据';
    assert.throws(()=>context.validateExamGrades(JSON.stringify(forged),answers.answers));
    let requests=mockSequence([paper,answers,grades(false)]);
    await context.runFiveQuestionExam('g1','before');
    assert.equal(requests.length,3);
    assert.equal(requests[0][2].examiner,true);assert(!requests[1][2].examiner);assert.equal(requests[2][2].examiner,true);
    assert(!JSON.stringify(requests[1]).includes('SECRET_'),'前测不得泄漏参考或评分标准');
    assert.equal(context.state.learning.goals[0].exam.runs[0].score,0);
    assert.equal(context.state.learning.goals[0].status,'not_taught','前测不能算教学后通过');
    requests=mockSequence([]); await context.runFiveQuestionExam('g1','before');assert.equal(requests.length,0,'成功前测不重复收费');
    context.state.messages.push({role:'user',text:'这是老师的真实讲解'});context.recordTeachingTurn(0);
    requests=mockSequence([answers,grades(true)]);
    await context.runFiveQuestionExam('g1','after');
    assert.equal(requests.length,2);assert(!JSON.stringify(requests[0]).includes('SECRET_'),'后测不得泄漏参考');
    assert(JSON.stringify(requests[0]).includes('老师的真实讲解'),'后测要收到教学历史');
    let comparison=context.examComparison(context.state.learning.goals[0]);assert.equal(comparison.comparable,true);assert.equal(comparison.delta,5);
    assert.equal(context.state.learning.goals[0].status,'verified');
    settings.model='Changed-A';comparison=context.sameExamConfig(context.state.learning.goals[0].exam.runs[0].config,context.examConfig());assert.equal(comparison,false);
    requests=mockSequence([answers,grades(true)]);await context.runFiveQuestionExam('g1','after');assert.equal(context.examComparison(context.state.learning.goals[0]).comparable,false,'换模型不比较增益');
    requests=mockSequence([answers,forged]);await context.runFiveQuestionExam('g1','after');
    assert.equal(context.latestExamRun(context.state.learning.goals[0].exam,'after'),null,'失败后不能显示旧的通过结果');
    assert.equal(context.state.learning.goals[0].status,'practicing');assert.equal(context.state.isProcessing,false);
    fixture();context.state.messages.push({role:'user',text:'已经讲过'});context.recordTeachingTurn(0);
    requests=mockSequence([]);await context.runFiveQuestionExam('g1','before');assert.equal(requests.length,0,'讲过以后不能补前测');
    requests=mockSequence([paper,answers,grades(true)]);await context.runFiveQuestionExam('g1','after');
    assert.equal(context.state.learning.goals[0].exam.missingBaseline,true);assert.equal(context.examComparison(context.state.learning.goals[0]).comparable,false);
    requests=mockSequence([new Error('offline')]);await context.runFiveQuestionExam('g1','after');assert.equal(context.state.isProcessing,false);assert.equal(context.latestExamRun(context.state.learning.goals[0].exam,'after'),null);
    context.resetLessonProgress();assert.equal(context.state.learning.goals[0].exam,undefined);
    console.log('PASS: five dimensions, paired forms, 3+2 call budget, A/B request isolation, preconditions, comparison validity, malformed results, failure recovery and reset.');
})().catch(error=>{console.error(error);process.exitCode=1});
