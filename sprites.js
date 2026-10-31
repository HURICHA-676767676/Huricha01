/* 立绘只从已知资源中选取；先加载再切换，旧请求不能覆盖新表情。 */
const GAME_SPRITES = {
    normal: '平静听题', handup: '举手抢答', thinking: '思考中',
    confused: '困惑与不甘', surprise: '答错后惊讶', win: '答对后得意', lose: '整局失利'
};
const gameSpriteCache = new Map();
let gameSpriteRequest = 0;
function loadGameSprite(name) {
    if (!gameSpriteCache.has(name)) {
        const pending = new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('立绘加载失败：' + name));
            image.src = `assets/${name}.png`;
        });
        gameSpriteCache.set(name, pending);
        pending.catch(() => { if (gameSpriteCache.get(name) === pending) gameSpriteCache.delete(name); });
    }
    return gameSpriteCache.get(name);
}
function preloadGameSprites() {
    // 仅在真正开始挑战后预加载，不增加讲课首页的图片流量。
    return Promise.allSettled(Object.keys(GAME_SPRITES).map(loadGameSprite));
}
async function setSprite(name) {
    if (!Object.hasOwn(GAME_SPRITES, name)) name = 'normal';
    const request = ++gameSpriteRequest;
    const el = $('spriteImg');
    const apply = selected => {
        if (request !== gameSpriteRequest) return;
        el.alt = '小雅 · ' + GAME_SPRITES[selected];
        const target = `assets/${selected}.png`;
        if (el.getAttribute('src') === target) return; // 同图不重复跳动
        el.src = target;
        el.classList.remove('bob');
        void el.offsetWidth;
        el.classList.add('bob');
    };
    try {
        await loadGameSprite(name);
        apply(name);
    } catch {
        if (request !== gameSpriteRequest || name === 'normal') return;
        try { await loadGameSprite('normal'); apply('normal'); }
        catch { /* 网络不可用时保留上一张正常图片，不替换成破图。 */ }
    }
}
