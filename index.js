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

// const token = process.env.BOT_TOKEN || '7989837189:AAGSlt1TUg4grwfuzOKavKWSjr1mKwYCxnA';


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

const BIBLE_BOOKS = { 1: "Бытие", 2: "Исход", 3: "Левит", 4: "Числа", 5: "Второзаконие", 6: "Иисус Навин", 7: "Судьи", 8: "Руфь", 9: "1-я Царств", 10: "2-я Царств", 11: "3-я Царств", 12: "4-я Царств", 13: "1-я Паралипоменон", 14: "2-я Паралипоменон", 15: "Ездра", 16: "Неемия", 17: "Есфирь", 18: "Иов", 19: "Псалтирь", 20: "Притчи", 21: "Екклесиаст", 22: "Песнь Песней", 23: "Исаия", 24: "Иеремия", 25: "Плач Иеремии", 26: "Иезекииль", 27: "Даниил", 28: "Осия", 29: "Иоиль", 30: "Амос", 31: "Авдий", 32: "Иона", 33: "Михей", 34: "Наум", 35: "Аввакум", 36: "Софония", 37: "Аггей", 38: "Захария", 39: "Малахия", 40: "От Матфея", 41: "От Марка", 42: "От Луки", 43: "От Иоанна", 44: "Деяния", 45: "К Римлянам", 46: "1-е Коринфянам ", 47: "2-е Коринфянам", 48: "К Галатам", 49: "К Ефесянам", 50: "К Филиппийцам", 51: "К Колосянам", 52: "1-е Фессалоникийцам", 53: "2-е Фессалоникийцам", 54: "1-е Тимофею ", 55: "2-е Тимофею", 56: "К Титу", 57: "К Филимону", 58: "К Евреям", 59: "Иакова", 60: "1-е Петра", 61: "2-е Петра", 62: "1-е Иоанна", 63: "2-е Иоанна", 64: "3-е Иоанна", 65: "Иуды", 66: "Откровение" };
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

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Функция для генерации ссылок на толкования (Ekzeget.ru)
function getInterpretationLink(bId, cId) {
    const name = getBookName(Number(bId)).trim();

    // Ветхий Завет на сайте Лопухина имеет номера 01–39
    let bookNum = null;

    if (Number(bId) <= 39) {
        bookNum = String(bId).padStart(2, '0');
    } else {
        const ntMap = {
            'От Матфея': '51',
            'От Марка': '52',
            'От Луки': '53',
            'От Иоанна': '54',
            'Деяния': '55',

            'Иакова': '56',
            '1-е Петра': '57',
            '2-е Петра': '58',
            '1-е Иоанна': '59',
            '2-е Иоанна': '60',
            '3-е Иоанна': '61',
            'Иуды': '62',

            'К Римлянам': '63',
            '1-е Коринфянам': '64',
            '2-е Коринфянам': '65',
            'К Галатам': '66',
            'К Ефесянам': '67',
            'К Филиппийцам': '68',
            'К Колосянам': '69',
            '1-е Фессалоникийцам': '70',
            '2-е Фессалоникийцам': '71',
            '1-е Тимофею': '72',
            '2-е Тимофею': '73',
            'К Титу': '74',
            'К Филимону': '75',
            'К Евреям': '76',
            'Откровение': '77'
        };

        bookNum = ntMap[name];
    }

    if (!bookNum) {
        return "https://azbyka.ru/otechnik/Lopuhin/tolkovaja_biblija/";
    }

    // Обработка: Псалтирь на сайте имеет другую структуру ссылок, 
    // но для большинства книг работает формат ниже:
    if (bId === 19) {
        return `https://azbyka.ru/otechnik/Lopuhin/tolkovaja_biblija_19/${cId}`;
    }

    return `https://azbyka.ru/otechnik/Lopuhin/tolkovaja_biblija_${bookNum}/${cId}`;
}

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
    const azLink = `https://azbyka.ru/days/${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    let fast = "Поста нет (мясоед) 🍖";
    let event = "Рядовой день";

    if (diff >= -48 && diff < 0) { event = "Великий пост 🏺"; fast = "Святая Четыредесятница"; }
    else if (diff === 0) { event = "✨ ПАСХА ХРИСТОВА ✨"; fast = "Поста нет"; }
    else if (diff > 0 && diff <= 7) { event = "Светлая седмица 🕊"; fast = "Сплошная седмица"; }
    else if (dayW === 3 || dayW === 5) { fast = "Постный день (среда/пятница) 🥣"; }

    return {
        text: `<b>📅 ЦЕРКОВНЫЙ КАЛЕНДАРЬ</b>\n` +
            `<i>${now.toLocaleDateString('ru-RU')} (нового стиля)</i>\n` +
            `────────────────────\n\n` +
            `<b>🕯 Событие:</b> ${event}\n` +
            `<b>🥗 Трапеза:</b> ${fast}\n\n` +
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
    ['📖 Библия', '📜 Закон Божий'], // Добавили кнопку в первый ряд
    ['Молитвослов', 'Календарь'],
    ['Поиск']
]).resize();

const bibleMenu = Markup.keyboard([
    ['Чтение писания', 'Случайный стих'],
    ['Псалтирь', 'Закладка'],
    ['⬅️ Главное меню']
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

    const kb = Markup.inlineKeyboard([
        nav,
        [Markup.button.url('🎓 Толкования святых отцов', getInterpretationLink(bId, cId))],
        [Markup.button.callback('🏠 К разделам', 'start_over')]
    ]);

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

bot.hears('📜 Закон Божий', (ctx) => {
    const text = `<b>❖ ЗАКОН БОЖИЙ ❖</b>\n` +
        `<i>Основы веры и путь к спасению</i>\n` +
        `────────────────────\n\n` +
        `◈ <b>ВЕРОУЧЕНИЕ</b>\n` +
        `╰ <a href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/1">О вере и добродетели</a>\n` +
        `╰ <a href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/2">О Боге и Его свойствах</a>\n\n` +
        `◈ <b>СВЯЩЕННАЯ ИСТОРИЯ</b>\n` +
        `╰ <a href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/12">Ветхий Завет</a>\n` +
        `╰ <a href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/30">Новый Завет</a>\n\n` +
        `◈ <b>БОГОСЛУЖЕНИЕ</b>\n` +
        `╰ <a href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/44">Устройство храма</a>\n` +
        `╰ <a href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/49">Таинства Церкви</a>\n\n` +
        `────────────────────\n` +
        `📖 <a href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/"><b>ПОЛНЫЙ УЧЕБНИК СЕР. СЛОБОДСКОГО</b></a>`;

    ctx.replyWithHTML(text, {
        link_preview_options: {
            url: 'https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/',
            is_disabled: false,
            prefer_large_media: true
        },
        ...Markup.inlineKeyboard([
            [Markup.button.url('☦️ Читать полный Закон Божий', 'https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/')],
            [Markup.button.callback('🏠 В главное меню', 'start_over')]
        ])
    });
});

// --- НАВИГАЦИЯ МЕНЮ ---
bot.hears('📖 Библия', (ctx) => {
    const text =
        `<b>📖 СВЯЩЕННОЕ ПИСАНИЕ</b>\n` +
        `«Слово Твоё — светильник ноге моей и свет стезе моей» (Пс. 118:105)\n\n` +
        `Библия — это богодухновенное Писание, через которое Господь открывает людям Свою волю.\n\n` +
        `Здесь вы можете:\n` +
        `• читать книги Ветхого и Нового Завета\n` +
        `• открыть случайный стих для духовного наставления\n` +
        `• читать Псалтирь по жизненным нуждам\n` +
        `• сохранить место чтения в закладку\n\n` +
        `Выберите нужный раздел ниже.`;

    ctx.replyWithHTML(text, bibleMenu);
});

bot.hears('⬅️ Главное меню', (ctx) => {
    ctx.reply('🏠 Главное меню', mainReplyMenu);
});

bot.hears('Чтение писания', (ctx) => {
    ctx.replyWithHTML(`<b>📚 СВЯЩЕННОЕ ПИСАНИЕ</b>\n\nВыберите раздел:`, Markup.inlineKeyboard([[Markup.button.callback('📜 Ветхий Завет', 'test_old'), Markup.button.callback('📖 Новый Завет', 'test_new')]]));
});

bot.hears('Календарь', (ctx) => {
    const cal = getDetailedCalendar();
    ctx.replyWithHTML(cal.text, Markup.inlineKeyboard([
        [Markup.button.url('☦️ Открыть Азбуку Веры', cal.link)],
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
            [Markup.button.url('☦️ Читать полный молитвослов', 'https://azbyka.ru/molitvoslov/')],
            [Markup.button.callback('🏠 В главное меню', 'start_over')]
        ])
    });
});

bot.hears('Случайный стих', (ctx) => {
    if (!bibleData.length) return;

    // 70% вероятность взять Новый Завет
    const useNT = Math.random() < 0.7;
    const filteredBooks = bibleData.filter(b => useNT ? b.BookId >= 40 : b.BookId <= 39);

    const b = filteredBooks[Math.floor(Math.random() * filteredBooks.length)];
    const c = b.Chapters[Math.floor(Math.random() * b.Chapters.length)];
    const startIndex = Math.floor(Math.random() * c.Verses.length);

    // Собираем 1–3 стиха, чтобы получилось цельное высказывание
    let verses = [];
    for (let i = startIndex; i < c.Verses.length && verses.length < 3; i++) {
        verses.push(c.Verses[i]);

        const txt = c.Verses[i].Text.trim();
        if (txt.endsWith('.') || txt.endsWith('!') || txt.endsWith('?')) break;
    }

    const text = verses.map(v => v.Text).join(' ');

    const firstVerse = verses[0].VerseId;
    const lastVerse = verses[verses.length - 1].VerseId;

    const ref = firstVerse === lastVerse
        ? `${getBookName(b.BookId)} ${c.ChapterId}:${firstVerse}`
        : `${getBookName(b.BookId)} ${c.ChapterId}:${firstVerse}-${lastVerse}`;

    ctx.replyWithHTML(
        `<b>☦️ ДУХОВНОЕ НАСТАВЛЕНИЕ </b>\n\n<blockquote>${text}</blockquote>\n\n📍 <b>${ref}</b>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🖼 Создать открытку', `pic_${b.BookId}_${c.ChapterId}_${firstVerse}`)],
            [Markup.button.callback('📖 Открыть главу', `read_${b.BookId}_${c.ChapterId}`)]
        ])
    );
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
    const menuButtons = ['📖 Библия', '📜 Закон Божий', '🙏 Молитвы', '📅 Календарь', '🔎 Поиск', 'Чтение писания', 'Случайный стих', 'Псалтирь', 'Закладка', '⬅️ Главное меню'];
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
        buttons.push([Markup.button.callback(`📖 Читать ${res.ref}`, `read_new_${res.bId}_${res.cId}`)]);
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

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));