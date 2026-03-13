


const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const { createCanvas, registerFont } = require('canvas');
const path = require('path');

// РЕГИСТРАЦИЯ ШРИФТА (Путь к файлу fonts/Izhitsa.ttf)
try {
    registerFont(path.join(__dirname, 'fonts', 'Izhitsa.ttf'), { family: 'OrthodoxFont' });
    console.log('✅ Шрифт успешно зарегистрирован');
} catch (e) {
    console.error('❌ Ошибка загрузки шрифта. Проверь наличие папки fonts и файла Izhitsa.ttf');
}
const token = process.env.BOT_TOKEN;


const bot = new Telegraf(token);
const DATA_FILE = './users_data.json';

// --- БАЗА ДАННЫХ ---
let db = {};
const loadDB = () => {
    if (fs.existsSync(DATA_FILE)) {
        try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { db = {}; }
    }
};
const saveDB = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
const initUser = (id) => { if (!db[id]) db[id] = { bookmark: null }; };
loadDB();

// --- ДАННЫЕ БИБЛИИ ---
let bibleData = [];
try {
    bibleData = JSON.parse(fs.readFileSync('./bible.json', 'utf8')).Books;
} catch (e) {
    console.error("Ошибка загрузки bible.json");
}

const BIBLE_BOOKS = { 1: "Бытие", 2: "Исход", 3: "Левит", 4: "Числа", 5: "Второзаконие", 6: "Иисус Навин", 7: "Судьи", 8: "Руфь", 9: "1-я Царств", 10: "2-я Царств", 11: "3-я Царств", 12: "4-я Царств", 13: "1-я Паралипоменон", 14: "2-я Паралипоменон", 15: "Ездра", 16: "Неемия", 17: "Есфирь", 18: "Иов", 19: "Псалтирь", 20: "Притчи", 21: "Екклесиаст", 22: "Песнь Песней", 23: "Исаия", 24: "Иеремия", 25: "Плач Иеремии", 26: "Иезекииль", 27: "Даниил", 28: "Осия", 29: "Иоиль", 30: "Амос", 31: "Авдий", 32: "Иона", 33: "Михей", 34: "Наум", 35: "Аввакум", 36: "Софония", 37: "Аггей", 38: "Захария", 39: "Малахия", 40: "От Матфея", 41: "От Марка", 42: "От Луки", 43: "От Иоанна", 44: "Деяния", 45: "Иакова", 46: "1-е Петра", 47: "2-е Петра", 48: "1-е Иоанна", 49: "2-е Иоанна", 50: "3-е Иоанна", 51: "Иуды", 52: "К Римлянам", 53: "1-е Коринфянам", 54: "2-е Коринфянам", 55: "К Галатам", 56: "К Ефесянам", 57: "К Филиппийцам", 58: "К Колоссянам", 59: "1-е Фессалоникийцам", 60: "2-е Фессалоникийцам", 61: "1-е Тимофею", 62: "2-е Тимофею", 63: "К Титу", 64: "К Филимону", 65: "К Евреям", 66: "Откровение" };
const getBookName = (id) => BIBLE_BOOKS[id] || `Книга ${id}`;

// --- КАТЕГОРИИ ПСАЛТИРИ ---
const PSALMS_CATEGORIES = [
    { name: 'Благодарение', psalms: [33, 65, 102, 117, 145, 149] },
    { name: 'В скорби и унынии', psalms: [26, 36, 39, 41, 56, 101] },
    { name: 'О защите от врагов', psalms: [3, 26, 34, 58, 90, 142] },
    { name: 'Покаянные', psalms: [31, 37, 50, 87, 142] },
    { name: 'В болезнях', psalms: [6, 29, 36, 40, 102] },
    { name: 'О семье', psalms: [126, 127] },
    { name: 'В нуждах житейских', psalms: [36, 51, 62, 111] },
    { name: 'О мире душевном', psalms: [22, 26, 36, 61] }
];

// --- КАЛЕНДАРЬ ---
function getOrthodoxPascha(year) {
    const a = year % 19, b = year % 4, c = year % 7;
    const d = (19 * a + 15) % 30;
    const e = (2 * b + 4 * c + 6 * d + 6) % 7;
    const f = d + e;
    return f <= 9 ? new Date(year, 3, 22 + f + 13) : new Date(year, 4, f - 9 + 13);
}

function getDetailedCalendar() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const dayW = now.getDay();
    const pascha = getOrthodoxPascha(y);
    const diff = Math.floor((now - pascha) / 86400000);
    const azLink = `https://azbyka.ru/days/${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    let fast = "Поста нет (мясоед) 🍖";
    let event = "Рядовой день";
    if (diff >= -48 && diff < 0) { event = "Великий пост 🏺"; fast = "Святая Четыредесятница"; }
    else if (diff === 0) { event = "✨ ПАСХА ХРИСТОВА ✨"; fast = "Поста нет"; }
    else if (diff > 0 && diff <= 7) { event = "Светлая седмица 🕊"; fast = "Сплошная седмица"; }
    else if (dayW === 3 || dayW === 5) { fast = "Постный день (среда/пятница) 🥣"; }

    return {
        text: `<b>📅 ЦЕРКОВНЫЙ КАЛЕНДАРЬ</b>\n<i>${now.toLocaleDateString('ru-RU')}</i>\n────────────────────\n\n<b>🕯 Событие:</b> ${event}\n<b>🥗 Трапеза:</b> ${fast}\n\n📖 <a href="${azLink}">Жития и чтения на Азбуке</a>`,
        link: azLink
    };
}

// --- ИСПРАВЛЕННЫЕ ОТКРЫТКИ ---
async function createVerseCard(text, ref) {
    const canvas = createCanvas(1080, 1080);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
    grad.addColorStop(0, '#1a1a1a'); grad.addColorStop(1, '#2c2c2c');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
    ctx.strokeStyle = '#c5a059'; ctx.lineWidth = 20; ctx.strokeRect(50, 50, 980, 980);

    // Используем зарегистрированный шрифт OrthodoxFont
    ctx.fillStyle = '#f4e7d3';
    ctx.textAlign = 'center';
    ctx.font = '50px OrthodoxFont'; // Размер чуть больше для красоты

    const wrapText = (t) => {
        let words = t.split(' '), lines = [], line = '';
        words.forEach(w => { if (ctx.measureText(line + w).width < 850) line += w + ' '; else { lines.push(line); line = w + ' '; } });
        lines.push(line); return lines;
    };
    const lines = wrapText(`«${text}»`);
    const startY = 540 - (lines.length * 40);
    lines.forEach((l, i) => ctx.fillText(l, 540, startY + (i * 85))); // Увеличил межстрочный интервал

    ctx.fillStyle = '#c5a059';
    ctx.font = 'bold 55px OrthodoxFont';
    ctx.fillText(ref.toUpperCase(), 540, startY + (lines.length * 85) + 120);
    return canvas.toBuffer();
}

// --- КЛАВИАТУРЫ ---
const mainReplyMenu = Markup.keyboard([
    ['📖 Читать Слово', '🎲 Стих дня'],
    ['📅 Календарь', '🙏 Молитвослов'],
    ['📂 Псалтирь на потребу', '🔖 Закладка'],
    ['🔍 Поиск']
]).resize();

async function sendChapter(ctx, bId, cId, isEdit = true) {
    const book = bibleData.find(x => x.BookId === bId);
    const chapter = book?.Chapters.find(x => x.ChapterId === cId);
    if (!chapter) return;
    initUser(ctx.from.id);
    db[ctx.from.id].bookmark = { bId, cId }; saveDB();
    const text = `<b>☦️ ${getBookName(bId)}, Гл. ${cId}</b>\n🕊━━━━━━━━━━━━━━━━🕊\n\n` +
        chapter.Verses.map(v => `<b>${v.VerseId}</b> ${v.Text}`).join('\n\n');
    const nav = [];
    if (cId > 1) nav.push(Markup.button.callback('⬅️ Пред.', `read_${bId}_${cId - 1}`));
    nav.push(Markup.button.callback('📜 К главам', `bk_${bId}`));
    if (cId < book.Chapters.length) nav.push(Markup.button.callback('След. ➡️', `read_${bId}_${cId + 1}`));
    const kb = Markup.inlineKeyboard([nav, [Markup.button.callback('🏠 К разделам', 'start_over')]]);
    const final = text.substring(0, 4090);
    try { if (isEdit) await ctx.editMessageText(final, { parse_mode: 'HTML', ...kb }); else await ctx.replyWithHTML(final, kb); } catch (e) { await ctx.replyWithHTML(final, kb); }
}

// --- ОБРАБОТЧИКИ ---
bot.start((ctx) => {
    initUser(ctx.chat.id); saveDB();
    const name = ctx.from.first_name || 'друг';
    const welcomeText = `<b>Мир дому твоему, ${name}! ☦️</b>\n\nДобро пожаловать в <b>«Святую Библию»</b>.\n\nЭтот бот поможет тебе всегда иметь под рукой Слово Божье, молитвы и церковный календарь.\n\n<blockquote>«Слово Твое — светильник ноге моей и свет стезе моей» (Пс. 118:105)</blockquote>`;
    ctx.replyWithHTML(welcomeText, mainReplyMenu);
});

bot.hears('📖 Читать Слово', (ctx) => {
    ctx.replyWithHTML(`<b>📚 СВЯЩЕННОЕ ПИСАНИЕ</b>\n\nВыберите раздел:`, Markup.inlineKeyboard([[Markup.button.callback('📜 Ветхий Завет', 'test_old'), Markup.button.callback('📖 Новый Завет', 'test_new')]]));
});

bot.hears('📅 Календарь', (ctx) => {
    const cal = getDetailedCalendar();
    ctx.replyWithHTML(cal.text, Markup.inlineKeyboard([[Markup.button.webApp('☦️ Открыть Азбуку Веры', cal.link)]]));
});

bot.hears('🙏 Молитвослов', (ctx) => {
    ctx.replyWithHTML(`<b>❖ ПРАВОСЛАВНЫЙ МОЛИТВОСЛОВ ❖</b>`, Markup.inlineKeyboard([[Markup.button.webApp('☦︎ Читать молитвослов', 'https://azbyka.ru/molitvoslov/')]]));
});

bot.hears('🎲 Стих дня', (ctx) => {
    if (!bibleData.length) return;
    const b = bibleData[Math.floor(Math.random() * bibleData.length)];
    const c = b.Chapters[Math.floor(Math.random() * b.Chapters.length)];
    const v = c.Verses[Math.floor(Math.random() * c.Verses.length)];
    const ref = `${getBookName(b.BookId)} ${c.ChapterId}:${v.VerseId}`;
    ctx.replyWithHTML(`<b>🎲 ДУХОВНОЕ НАСТАВЛЕНИЕ</b>\n\n<blockquote>${v.Text}</blockquote>\n\n📍 <b>${ref}</b>`, Markup.inlineKeyboard([[Markup.button.callback('🖼 Создать открытку', `pic_${b.BookId}_${c.ChapterId}_${v.VerseId}`)], [Markup.button.callback('📖 К главе', `read_new_${b.BookId}_${c.ChapterId}`)]]));
});

bot.hears('📂 Псалтирь на потребу', (ctx) => {
    const buttons = PSALMS_CATEGORIES.map((cat, idx) => [Markup.button.callback(cat.name, `ps_cat_${idx}`)]);
    ctx.replyWithHTML(`<b>Псалтирь на всякую потребу</b>`, Markup.inlineKeyboard(buttons));
});

bot.hears('🔖 Закладка', (ctx) => {
    const b = db[ctx.chat.id]?.bookmark;
    if (b) return sendChapter(ctx, b.bId, b.cId, false);
    ctx.replyWithHTML(`<b>🔖 Закладок пока нет.</b>`);
});

bot.hears('🔍 Поиск', (ctx) => ctx.replyWithHTML(`<b>🔎 ПОИСК</b>\n\nВведите фразу для поиска:`));

bot.on('text', (ctx) => {
    const q = ctx.message.text.toLowerCase(); if (q.length < 3) return;
    let results = [];
    outer: for (const b of bibleData) for (const c of b.Chapters) for (const v of c.Verses) { if (v.Text.toLowerCase().includes(q)) { results.push({ bId: b.BookId, cId: c.ChapterId, ref: `${getBookName(b.BookId)} ${c.ChapterId}:${v.VerseId}`, text: v.Text }); } if (results.length >= 5) break outer; }
    if (!results.length) return ctx.replyWithHTML("🕊 <b>Ничего не найдено.</b>");
    let txt = `🔎 <b>РЕЗУЛЬТАТЫ:</b>\n\n`;
    let btns = results.map((r, i) => { txt += `<b>${i + 1}. ${r.ref}</b>\n${r.text}\n\n`; return Markup.button.callback(`${i + 1} 📖`, `read_new_${r.bId}_${r.cId}`); });
    ctx.replyWithHTML(txt, Markup.inlineKeyboard([btns]));
});

// --- CALLBACK ACTIONS (БЕЗ ИЗМЕНЕНИЙ) ---
bot.action(/ps_cat_(\d+)/, (ctx) => {
    const catIdx = +ctx.match[1];
    const cat = PSALMS_CATEGORIES[catIdx];
    const buttons = cat.psalms.map(p => Markup.button.callback(`Псалом ${p}`, `read_new_19_${p}`));
    const rows = []; while (buttons.length) rows.push(buttons.splice(0, 3));
    rows.push([Markup.button.callback('← Назад', 'back_to_ps_cats')]);
    ctx.editMessageText(`<b>${cat.name}</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});

bot.action('back_to_ps_cats', (ctx) => {
    const buttons = PSALMS_CATEGORIES.map((cat, idx) => [Markup.button.callback(cat.name, `ps_cat_${idx}`)]);
    ctx.editMessageText(`<b>Выберите категорию:</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action('start_over', (ctx) => { ctx.editMessageText('<b>📚 РАЗДЕЛЫ</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📜 Ветхий Завет', 'test_old'), Markup.button.callback('📖 Новый Завет', 'test_new')]]) }).catch(() => { }); });

bot.action(/test_(old|new)/, (ctx) => {
    const type = ctx.match[1];
    const books = bibleData.filter(b => type === 'new' ? b.BookId >= 40 : b.BookId <= 39);
    const rows = [];
    for (let i = 0; i < books.length; i += 2) {
        let row = [Markup.button.callback(getBookName(books[i].BookId), `bk_${books[i].BookId}`)];
        if (books[i + 1]) row.push(Markup.button.callback(getBookName(books[i + 1].BookId), `bk_${books[i + 1].BookId}`));
        rows.push(row);
    }
    rows.push([Markup.button.callback('⬅️ Назад', 'start_over')]);
    ctx.editMessageText("<b>ВЫБЕРИТЕ КНИГУ:</b>", { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});

bot.action(/bk_(\d+)/, (ctx) => {
    const bId = +ctx.match[1], b = bibleData.find(x => x.BookId === bId);
    const btns = b.Chapters.map(c => Markup.button.callback(`${c.ChapterId}`, `read_${bId}_${c.ChapterId}`));
    const rows = []; while (btns.length) rows.push(btns.splice(0, 6));
    rows.push([Markup.button.callback('⬅️ К списку', bId >= 40 ? 'test_new' : 'test_old')]);
    ctx.editMessageText(`<b>📖 ${getBookName(bId)}</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});

bot.action(/read_(\d+)_(\d+)/, (ctx) => sendChapter(ctx, +ctx.match[1], +ctx.match[2], true));
bot.action(/read_new_(\d+)_(\d+)/, (ctx) => sendChapter(ctx, +ctx.match[1], +ctx.match[2], false));

bot.action(/pic_(\d+)_(\d+)_(\d+)/, async (ctx) => {
    const [_, bId, cId, vId] = ctx.match.map(Number);
    const book = bibleData.find(b => b.BookId === bId);
    if (!book) return;
    const v = book.Chapters.find(c => c.ChapterId === cId).Verses.find(v => v.VerseId === vId);
    const buf = await createVerseCard(v.Text, `${getBookName(bId)} ${cId}:${vId}`);
    ctx.replyWithPhoto({ source: buf }, { caption: `☦️ <b>${getBookName(bId)} ${cId}:${vId}</b>`, parse_mode: 'HTML' });
});

// Настройка команд меню
bot.telegram.setMyCommands([
    { command: 'start', description: '🏠 Главное меню' },
    { command: 'bible', description: '📖 Читать Библию' },
    { command: 'calendar', description: '📅 Календарь' }
]);

bot.launch().then(() => console.log('☦️ Бот запущен'));

// Мягкое выключение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));