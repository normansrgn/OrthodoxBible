

const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const cron = require('node-cron');

const token = process.env.BOT_TOKEN;

const bot = new Telegraf(token);

// --- БАЗА ДАННЫХ ---
const DATA_FILE = './users_data.json';
let db = {}; 

const loadDB = () => {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const content = fs.readFileSync(DATA_FILE, 'utf8').trim();
            db = content ? JSON.parse(content) : {};
        } catch (e) { db = {}; }
    }
};
const saveDB = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
const initUser = (id) => { if (!db[id]) db[id] = { favorites: [] }; };

loadDB();

// --- ДАННЫЕ БИБЛИИ ---
const BIBLE_BOOKS = {
    1: "Бытие", 2: "Исход", 3: "Левит", 4: "Числа", 5: "Второзаконие", 6: "Иисус Навин", 7: "Судьи", 8: "Руфь", 9: "1-я Царств", 10: "2-я Царств", 11: "3-я Царств", 12: "4-я Царств", 13: "1-я Паралипоменон", 14: "2-я Паралипоменон", 15: "Ездра", 16: "Неемия", 17: "Есфирь", 18: "Иов", 19: "Псалтирь", 20: "Притчи", 21: "Екклесиаст", 22: "Песнь Песней", 23: "Исаия", 24: "Иеремия", 25: "Плач Иеремии", 26: "Иезекииль", 27: "Даниил", 28: "Осия", 29: "Иоиль", 30: "Амос", 31: "Авдий", 32: "Иона", 33: "Михей", 34: "Наум", 35: "Аввакум", 36: "Софония", 37: "Аггей", 38: "Захария", 39: "Малахия", 40: "От Матфея", 41: "От Марка", 42: "От Луки", 43: "От Иоанна", 44: "Деяния", 45: "Иакова", 46: "1-е Петра", 47: "2-е Петра", 48: "1-е Иоанна", 49: "2-е Иоанна", 50: "3-е Иоанна", 51: "Иуды", 52: "К Римлянам", 53: "1-е Коринфянам", 54: "2-е Коринфянам", 55: "К Галатам", 56: "К Ефесянам", 57: "К Филиппийцам", 58: "К Колоссянам", 59: "1-е Фессалоникийцам", 60: "2-е Фессалоникийцам", 61: "1-е Тимофею", 62: "2-е Тимофею", 63: "К Титу", 64: "К Филимону", 65: "К Евреям", 66: "Откровение"
};

const bibleData = JSON.parse(fs.readFileSync('./bible.json', 'utf8')).Books;
const getBookName = (id) => BIBLE_BOOKS[id] || `Книга ${id}`;

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function getRandomVerse() {
    const b = bibleData[Math.floor(Math.random() * bibleData.length)];
    const c = b.Chapters[Math.floor(Math.random() * b.Chapters.length)];
    const v = c.Verses[Math.floor(Math.random() * c.Verses.length)];
    return { text: v.Text, ref: `${getBookName(b.BookId)} ${c.ChapterId}:${v.VerseId}`, bId: b.BookId, cId: c.ChapterId, vId: v.VerseId };
}

// --- РАССЫЛКА (23:53) ---
cron.schedule('05 12 * * *', () => {
    const v = getRandomVerse();
    const msg = `<b>✨ ДУХОВНОЕ НАСТАВЛЕНИЕ ✨</b>\n\n<blockquote>${v.text}</blockquote>\n\n📖 ${v.ref}`;
    const kb = Markup.inlineKeyboard([[Markup.button.callback('⭐ В избранное', `fav_${v.bId}_${v.cId}_${v.vId}`)]]);
    Object.keys(db).forEach(id => bot.telegram.sendMessage(id, msg, { parse_mode: 'HTML', ...kb }).catch(() => {}));
}, { timezone: "Europe/Moscow" });

// --- МЕНЮ ---
const mainMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('📜 Ветхий Завет', 'test_old'), Markup.button.callback('📖 Новый Завет', 'test_new')],
    [Markup.button.callback('🎲 Случайный стих', 'random_verse'), Markup.button.callback('⭐ Избранное', 'show_favs')],
    [Markup.button.callback('🔍 Помощь', 'search_help')]
]);

bot.start((ctx) => {
    initUser(ctx.chat.id); saveDB();
    if (ctx.chat.type === 'private') {
        return ctx.replyWithHTML(`<b>Мир дому твоему!</b> ☦️\n\nИспользуйте меню или пишите слово для поиска.`, mainMenu());
    }
});

// --- ЛОГИКА ИЗБРАННОГО ---
bot.action(/fav_(\d+)_(\d+)_(\d+)/, (ctx) => {
    const [_, bId, cId, vId] = ctx.match.map(Number);
    initUser(ctx.from.id);
    const book = bibleData.find(b => b.BookId === bId);
    const vText = book.Chapters.find(c => c.ChapterId === cId).Verses.find(v => v.VerseId === vId).Text;
    const ref = `${getBookName(bId)} ${cId}:${vId}`;

    if (db[ctx.from.id].favorites.some(f => f.ref === ref)) return ctx.answerCbQuery('Уже в избранном ⭐');
    db[ctx.from.id].favorites.push({ ref, text: vText, bId, cId });
    saveDB();
    ctx.answerCbQuery('Добавлено в избранное! ⭐');
});

bot.action('show_favs', (ctx) => {
    initUser(ctx.from.id);
    const favs = db[ctx.from.id].favorites;
    if (!favs || favs.length === 0) return ctx.editMessageText("Ваш список избранного пуст.", mainMenu());

    const buttons = favs.map((f, i) => [
        Markup.button.callback(`${f.ref}`, `view_fav_${i}`),
        Markup.button.callback('❌', `del_fav_${i}`)
    ]);
    buttons.push([Markup.button.callback('🏠 Меню', 'start_over')]);
    ctx.editMessageText("<b>⭐ Ваше избранное:</b>", { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/view_fav_(\d+)/, (ctx) => {
    const idx = parseInt(ctx.match[1]);
    const fav = db[ctx.from.id].favorites[idx];
    if (!fav) return ctx.answerCbQuery('Не найдено');
    
    const text = `<b>⭐ Избранный стих</b>\n\n<blockquote>${fav.text}</blockquote>\n\n📖 <b>${fav.ref}</b>`;
    const kb = Markup.inlineKeyboard([
        // [Markup.button.callback('📖 Читать всю главу', `read_${fav.bId}_${fav.chId}`)],
        [Markup.button.callback('⬅️ Назад', 'show_favs')]
    ]);
    ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
});

bot.action(/del_fav_(\d+)/, (ctx) => {
    db[ctx.from.id].favorites.splice(parseInt(ctx.match[1]), 1);
    saveDB(); ctx.answerCbQuery('Удалено');
    return ctx.editMessageText("Стих удален.", Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к списку', 'show_favs')]]));
});

// --- ЧТЕНИЕ ГЛАВ (Исправленный переход) ---
bot.action(/read_(\d+)_(\d+)/, async (ctx) => {
    const bId = parseInt(ctx.match[1]);
    const cId = parseInt(ctx.match[2]);
    
    const book = bibleData.find(bk => bk.BookId === bId);
    if (!book) return ctx.answerCbQuery('Книга не найдена');
    
    const chapter = book.Chapters.find(ch => ch.ChapterId === cId);
    if (!chapter) return ctx.answerCbQuery('Глава не найдена');

    const header = `<b>☦️ ${getBookName(bId)}, Гл. ${cId}</b>\n\n`;
    const body = chapter.Verses.map(v => `<b>${v.VerseId}</b> ${v.Text}`).join('\n');
    
    const nav = [];
    if (cId > 1) nav.push(Markup.button.callback('⬅️', `read_${bId}_${cId-1}`));
    if (cId < book.Chapters.length) nav.push(Markup.button.callback('➡️', `read_${bId}_${cId+1}`));
    
    const kb = Markup.inlineKeyboard([
        nav, 
        [Markup.button.callback('📜 К главам', `bk_${bId}`), Markup.button.callback('🏠 Меню', 'start_over')]
    ]);

    try {
        await ctx.editMessageText((header + body).substring(0, 4090), { parse_mode: 'HTML', ...kb });
    } catch (e) {
        // Если сообщение слишком длинное или идентичное
        await ctx.replyWithHTML((header + body).substring(0, 4090), kb);
    }
});

// --- ОСТАЛЬНАЯ НАВИГАЦИЯ ---
bot.action('random_verse', (ctx) => {
    const v = getRandomVerse();
    const text = `<b>🎲 Случайный стих</b>\n\n<blockquote>${v.text}</blockquote>\n\n📖 <b>${v.ref}</b>`;
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('Еще один 🎲', 'random_verse'), Markup.button.callback('⭐ В избранное', `fav_${v.bId}_${v.cId}_${v.vId}`)],
        [Markup.button.callback('📖 Читать главу', `read_${v.bId}_${v.cId}`)],
        [Markup.button.callback('🏠 Меню', 'start_over')]
    ]);
    ctx.editMessageText(text, { parse_mode: 'HTML', ...kb }).catch(() => ctx.replyWithHTML(text, kb));
});

bot.action(/test_(old|new)/, (ctx) => {
    const isNew = ctx.match[1] === 'new';
    const books = bibleData.filter(b => isNew ? b.BookId >= 40 : b.BookId <= 39);
    const btn = [];
    for (let i = 0; i < books.length; i += 2) {
        let row = [Markup.button.callback(getBookName(books[i].BookId), `bk_${books[i].BookId}`)];
        if (books[i+1]) row.push(Markup.button.callback(getBookName(books[i+1].BookId), `bk_${books[i+1].BookId}`));
        btn.push(row);
    }
    btn.push([Markup.button.callback('🏠 Меню', 'start_over')]);
    ctx.editMessageText("Выберите книгу:", { parse_mode: 'HTML', ...Markup.inlineKeyboard(btn) });
});

bot.action(/bk_(\d+)/, (ctx) => {
    const bId = parseInt(ctx.match[1]);
    const b = bibleData.find(bk => bk.BookId === bId);
    const btn = b.Chapters.map(c => Markup.button.callback(`${c.ChapterId}`, `read_${bId}_${c.ChapterId}`));
    const rows = []; while(btn.length) rows.push(btn.splice(0, 5));
    rows.push([Markup.button.callback('⬅️ Назад', bId >= 40 ? 'test_new' : 'test_old')]);
    ctx.editMessageText(`<b>${getBookName(bId)}</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});

bot.action('start_over', (ctx) => ctx.editMessageText('Выберите раздел:', { parse_mode: 'HTML', ...mainMenu() }));
bot.action('search_help', (ctx) => ctx.editMessageText("Просто напишите слово для поиска или используйте меню.", mainMenu()));

bot.launch().then(() => console.log('☦️ Бот запущен! Все переходы исправлены.'));