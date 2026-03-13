const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const { createCanvas, registerFont } = require('canvas');
const path = require('path');

// --- НАСТРОЙКА ШРИФТА ---
const fontPath = path.resolve(__dirname, 'fonts', 'Izhitsa.ttf');

if (fs.existsSync(fontPath)) {
    try {
        registerFont(fontPath, { family: 'OrthodoxFont' });
        console.log('✅ Шрифт Izhitsa успешно загружен');
    } catch (err) {
        console.error('❌ Ошибка при регистрации шрифта:', err);
    }
} else {
    console.error('❌ ФАЙЛ ШРИФТА НЕ НАЙДЕН!');
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
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const dayW = now.getDay();
    const pascha = getOrthodoxPascha(y);
    const diff = Math.floor((now - pascha) / 86400000);
    
    // Исправлено: добавлены обратные кавычки для шаблонной строки
    const azLink = `https://azbyka.ru/days/${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    let fast = "Поста нет (мясоед) 🍖";
    let event = "Рядовой день";

    if (diff >= -48 && diff < 0) { 
        event = "Великий пост 🏺"; 
        fast = "Святая Четыредесятница"; 
    }
    else if (diff === 0) { 
        event = "✨ ПАСХА ХРИСТОВА ✨"; 
        fast = "Поста нет"; 
    }
    else if (diff > 0 && diff <= 7) { 
        event = "Светлая седмица 🕊"; 
        fast = "Сплошная седмица"; 
    }
    else if (dayW === 3 || dayW === 5) { 
        fast = "Постный день (среда/пятница) 🥣"; 
    }

    return {
        // Исправлено: весь текст обернут в обратные кавычки
        text: `<b>📅 ЦЕРКОВНЫЙ КАЛЕНДАРЬ</b>\n` +
              `<i>${now.toLocaleDateString('ru-RU')} (нового стиля)</i>\n` +
              `────────────────────\n\n` +
              `<b>🕯 Событие:</b> ${event}\n` +
              `<b>🥗 Трапеза:</b> ${fast}\n\n` +
              `Сегодня Церковь молитвенно чтит память многих святых и подвижников веры.\n\n` +
              `📖 <a href="${azLink}">Жития, иконы и чтения на Азбуке</a>`,
        link: azLink
    };
}

async function createVerseCard(text, ref) {
    const canvas = createCanvas(1080, 1080);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FDFBF7';
    ctx.fillRect(0, 0, 1080, 1080);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 2;
    ctx.strokeRect(80, 80, 920, 920);
    const s = 20;
    const padding = 80;
    const size = 920;
    ctx.lineWidth = 4;
    const corners = [[padding, padding], [padding + size, padding], [padding, padding + size], [padding + size, padding + size]];
    corners.forEach(([x, y]) => {
        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
    });
    const cleanText = text.replace(/[«»""'']/g, '').trim();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let fontSize = cleanText.length > 200 ? 45 : 55;
    ctx.font = `${fontSize}px "OrthodoxFont"`;
    ctx.fillStyle = '#2C2C2C';
    const wrapText = (t, maxWidth) => {
        let words = t.split(' '), lines = [], line = '';
        words.forEach(w => { if (ctx.measureText(line + w).width < maxWidth) line += w + ' '; else { lines.push(line.trim()); line = w + ' '; } });
        lines.push(line.trim()); return lines;
    };
    const lines = wrapText(cleanText, 800);
    const lineHeight = fontSize * 1.5;
    const totalHeight = lines.length * lineHeight;
    let startY = 540 - (totalHeight / 2);
    lines.forEach((line, i) => { ctx.fillText(line, 540, startY + (i * lineHeight)); });
    const lineY = startY + totalHeight + 40;
    ctx.beginPath(); ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 1; ctx.moveTo(490, lineY); ctx.lineTo(590, lineY); ctx.stroke();
    ctx.fillStyle = '#8B7355'; ctx.font = 'italic 40px "OrthodoxFont"';
    ctx.fillText(ref.toUpperCase(), 540, lineY + 80);
    return canvas.toBuffer();
}

// --- КЛАВИАТУРЫ ---
const mainReplyMenu = Markup.keyboard([
    ['Чтение писания', 'Стих дня'],
    ['Календарь', 'Молитвослов'],
    ['Псалтирь', 'Закладка'],
    ['Поиск']
]).resize();

async function sendChapter(ctx, bId, cId, isEdit = true) {
    const book = bibleData.find(x => x.BookId === bId);
    const chapter = book?.Chapters.find(x => x.ChapterId === cId);
    if (!chapter) return;
    initUser(ctx.from.id);
    db[ctx.from.id].bookmark = { bId, cId }; saveDB();
    const text = `<b>☦️ ${getBookName(bId)}, Гл. ${cId}</b>\n━━━━━━━━━━━━━━━━\n\n` +
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
    initUser(ctx.chat.id); 
    saveDB();
    const name = ctx.from.first_name || 'друг';
    const welcomeText = `<b>Мир дому твоему, ${name}! ☦️</b>\n\n` +
        `Добро пожаловать в <b>«Святую Библию»</b>.\n\n` +
        `Этот бот поможет тебе всегда иметь под рукой Слово Божье, молитвы и церковный календарь.`;
    
    ctx.replyWithHTML(welcomeText, mainReplyMenu);
});

bot.hears('Чтение писания', (ctx) => {
    ctx.replyWithHTML(`<b>📚 СВЯЩЕННОЕ ПИСАНИЕ</b>\n\nВыберите раздел:`, Markup.inlineKeyboard([[Markup.button.callback('📜 Ветхий Завет', 'test_old'), Markup.button.callback('📖 Новый Завет', 'test_new')]]));
});

bot.hears('Календарь', (ctx) => {
    const cal = getDetailedCalendar();
    ctx.replyWithHTML(cal.text, Markup.inlineKeyboard([
        [Markup.button.webApp('☦️ Открыть Азбуку Веры', cal.link)],
        [Markup.button.callback('🏠 В главное меню', 'start_over')]
    ]));
});

bot.hears('Молитвослов', (ctx) => {
    const text = `<b>❖ ПРАВОСЛАВНЫЙ МОЛИТВОСЛОВ ❖</b>\n` +
        `<i>Духовный щит и утешение души</i>\n` +
        `────────────────────\n\n` +
        `◈ <b>ОСНОВНЫЕ ПРАВИЛА</b>\n` +
        `╰ <a href="https://azbyka.ru/molitvoslov/molitvy-utrennie.html">Утреннее правило</a>\n` +
        `╰ <a href="https://azbyka.ru/molitvoslov/molitvy-na-son-gryadushhim.html">Молитвы на сон грядущим</a>\n\n` +
        `◈ <b>ТАИНСТВА</b>\n` +
        `╰ <a href="https://azbyka.ru/molitvoslov/posledovanie-ko-svyatomu-prichashheniyu.html">Ко Святому Причащению</a>\n` +
        `╰ <a href="https://azbyka.ru/molitvoslov/blagodarstvennye-molitvy-po-svyatom-prichashhenii.html">Благодарственные молитвы</a>\n\n` +
        `────────────────────\n` +
        `📖 <a href="https://azbyka.ru/molitvoslov/"><b>ПОЛНЫЙ СБОРНИК МОЛИТВ</b></a>`;

    ctx.replyWithHTML(text, {
        link_preview_options: {
            url: 'https://azbyka.ru/molitvoslov/',
            is_disabled: false,
            prefer_large_media: true
        },
        ...Markup.inlineKeyboard([
            [Markup.button.webApp('☦️ Читать полный молитвослов', 'https://azbyka.ru/molitvoslov/')],
            [Markup.button.callback('🏠 В главное меню', 'start_over')]
        ])
    });
});

bot.hears('Стих дня', (ctx) => {
    if (!bibleData.length) return;
    const b = bibleData[Math.floor(Math.random() * bibleData.length)];
    const c = b.Chapters[Math.floor(Math.random() * b.Chapters.length)];
    const v = c.Verses[Math.floor(Math.random() * c.Verses.length)];
    const ref = `${getBookName(b.BookId)} ${c.ChapterId}:${v.VerseId}`;
    ctx.replyWithHTML(`<b>ДУХОВНОЕ НАСТАВЛЕНИЕ</b>\n\n<blockquote>${v.Text}</blockquote>\n\n📍 <b>${ref}</b>`, Markup.inlineKeyboard([[Markup.button.callback('🖼 Создать открытку', `pic_${b.BookId}_${c.ChapterId}_${v.VerseId}`)], [Markup.button.callback('📖 К главе', `read_new_${b.BookId}_${c.ChapterId}`)]]));
});

bot.hears('Псалтирь', (ctx) => {
    const buttons = PSALMS_CATEGORIES.map((cat, idx) => [Markup.button.callback(cat.name, `ps_cat_${idx}`)]);
    ctx.replyWithHTML(`<b>Псалтирь на всякую потребу</b>`, Markup.inlineKeyboard(buttons));
});

bot.hears('Закладка', (ctx) => {
    const b = db[ctx.chat.id]?.bookmark;
    if (b) return sendChapter(ctx, b.bId, b.cId, false);
    ctx.replyWithHTML(`<b>🔖 Закладок пока нет.</b>`);
});

bot.hears('Поиск', (ctx) => {
    const searchText = `<b>🔎 ПОИСК ПО СВЯЩЕННОМУ ПИСАНИЮ</b>\n` +
        `<i>«Исследуйте Писания...» (Ин. 5:39)</i>\n` +
        `────────────────────\n\n` +
        `Введите ключевое слово или фразу, которую вы хотите найти в Библии.\n\n` +
        `<b>Например:</b> <i>любовь, вера, заповедь</i>\n\n` +
        `🕊 <b>Просто отправьте слово в ответ на это сообщение:</b>`;

    ctx.replyWithHTML(searchText, Markup.inlineKeyboard([
        [Markup.button.callback('🏠 В главное меню', 'start_over')]
    ]));
});

bot.on('text', async (ctx) => {
    const q = ctx.message.text.toLowerCase();
    // Проверка, что это не команда из меню (чтобы поиск не срабатывал на нажатие кнопок)
    const menuButtons = ['Чтение писания', 'Стих дня', 'Календарь', 'Молитвослов', 'Псалтирь', 'Закладка', 'Поиск'];
    if (menuButtons.includes(ctx.message.text)) return;

    if (q.length < 3) return ctx.replyWithHTML("🕊 <b>Введите минимум 3 символа для поиска.</b>");

    let results = [];
    outer: for (const b of bibleData) {
        for (const c of b.Chapters) {
            for (const v of c.Verses) {
                if (v.Text.toLowerCase().includes(q)) {
                    results.push({
                        bId: b.BookId,
                        cId: c.ChapterId,
                        vId: v.VerseId,
                        ref: `${getBookName(b.BookId)} ${c.ChapterId}:${v.VerseId}`,
                        text: v.Text
                    });
                }
                if (results.length >= 5) break outer;
            }
        }
    }

    if (!results.length) return ctx.replyWithHTML("🕊 <b>Ничего не найдено. Попробуйте другое слово.</b>");

    let responseText = `🔎 <b>РЕЗУЛЬТАТЫ ПОИСКА</b>\n`;
    responseText += `<i>Найдено совпадений: ${results.length}</i>\n`;
    responseText += `────────────────────\n\n`;

    const buttons = [];
    results.forEach((res, index) => {
        const itemNumber = index + 1;
        responseText += `<b>${itemNumber}. ${res.ref}</b>\n`;
        responseText += `<blockquote>${res.text}</blockquote>\n`;
        
        // Оставляем только кнопку "Читать"
        buttons.push([
            Markup.button.callback(`📖 Читать ${res.ref}`, `read_new_${res.bId}_${res.cId}`)
        ]);
    });

    await ctx.replyWithHTML(responseText, Markup.inlineKeyboard(buttons));
});

// --- CALLBACK ACTIONS ---
bot.action(/ps_cat_(\d+)/, (ctx) => {
    const cat = PSALMS_CATEGORIES[+ctx.match[1]];
    const buttons = cat.psalms.map(p => Markup.button.callback(`Псалом ${p}`, `read_new_19_${p}`));
    const rows = []; while (buttons.length) rows.push(buttons.splice(0, 3));
    rows.push([Markup.button.callback('⬅️ Назад', 'back_to_ps_cats')]);
    ctx.editMessageText(`<b>${cat.name}</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});

bot.action('back_to_ps_cats', (ctx) => {
    const buttons = PSALMS_CATEGORIES.map((cat, idx) => [Markup.button.callback(cat.name, `ps_cat_${idx}`)]);
    ctx.editMessageText(`<b>Выберите категорию:</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action('start_over', (ctx) => { ctx.editMessageText('<b>📚 РАЗДЕЛЫ</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📜 Ветхий Завет', 'test_old'), Markup.button.callback('📖 Новый Завет', 'test_new')]]) }).catch(() => { }); });

bot.action(/test_(old|new)/, (ctx) => {
    const books = bibleData.filter(b => ctx.match[1] === 'new' ? b.BookId >= 40 : b.BookId <= 39);
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
    const v = book.Chapters.find(c => c.ChapterId === cId).Verses.find(v => v.VerseId === vId);
    const buf = await createVerseCard(v.Text, `${getBookName(bId)} ${cId}:${vId}`);
    ctx.replyWithPhoto({ source: buf }, { caption: `☦️ <b>${getBookName(bId)} ${cId}:${vId}</b>`, parse_mode: 'HTML' });
});

bot.launch().then(() => console.log('☦️ Бот запущен'));