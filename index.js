const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const cron = require('node-cron');

// ВСТАВЬ СВОЙ ТОКЕН СЮДА
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- РАБОТА С ПОЛЬЗОВАТЕЛЯМИ И ГРУППАМИ ---
const USERS_FILE = './users.json';
let subscribers = new Set();

// Загрузка базы подписчиков
if (fs.existsSync(USERS_FILE)) {
    try {
        const content = fs.readFileSync(USERS_FILE, 'utf8').trim();
        if (content) {
            const data = JSON.parse(content);
            subscribers = new Set(data);
        }
    } catch (e) {
        console.log("⚠️ База пользователей пуста или создается...");
        subscribers = new Set();
    }
}

const saveSubscribers = () => {
    fs.writeFileSync(USERS_FILE, JSON.stringify([...subscribers]));
};

// --- ДАННЫЕ БИБЛИИ ---
const BIBLE_BOOKS = {
    1: "Бытие", 2: "Исход", 3: "Левит", 4: "Числа", 5: "Второзаконие",
    6: "Иисус Навин", 7: "Судьи", 8: "Руфь", 9: "1-я Царств", 10: "2-я Царств",
    11: "3-я Царств", 12: "4-я Царств", 13: "1-я Паралипоменон", 14: "2-я Паралипоменон",
    15: "Ездра", 16: "Неемия", 17: "Есфирь", 18: "Иов", 19: "Псалтирь",
    20: "Притчи", 21: "Екклесиаст", 22: "Песнь Песней", 23: "Исаия", 24: "Иеремия",
    25: "Плач Иеремии", 26: "Иезекииль", 27: "Даниил", 28: "Осия", 29: "Иоиль",
    30: "Амос", 31: "Авдий", 32: "Иона", 33: "Михей", 34: "Наум",
    35: "Аввакум", 36: "Софония", 37: "Аггей", 38: "Захария", 39: "Малахия",
    40: "От Матфея", 41: "От Марка", 42: "От Луки", 43: "От Иоанна",
    44: "Деяния", 45: "Иакова", 46: "1-е Петра", 47: "2-е Петра",
    48: "1-е Иоанна", 49: "2-е Иоанна", 50: "3-е Иоанна", 51: "Иуды",
    52: "К Римлянам", 53: "1-е Коринфянам", 54: "2-е Коринфянам", 55: "К Галатам",
    56: "К Ефесянам", 57: "К Филиппийцам", 58: "К Колоссянам", 59: "1-е Фессалоникийцам",
    60: "2-е Фессалоникийцам", 61: "1-е Тимофею", 62: "2-е Тимофею", 63: "К Титу",
    64: "К Филимону", 65: "К Евреям", 66: "Откровение"
};

let bibleData;
try {
    bibleData = JSON.parse(fs.readFileSync('./bible.json', 'utf8')).Books;
    console.log(`✅ Библия загружена.`);
} catch (e) {
    console.error("❌ Ошибка загрузки bible.json!");
    process.exit();
}

const getBookName = (id) => BIBLE_BOOKS[id] || `Книга ${id}`;

// Функция получения рандомного стиха
function getRandomVerse() {
    const randomBook = bibleData[Math.floor(Math.random() * bibleData.length)];
    const randomChapter = randomBook.Chapters[Math.floor(Math.random() * randomBook.Chapters.length)];
    const randomVerse = randomChapter.Verses[Math.floor(Math.random() * randomChapter.Verses.length)];
    return {
        text: randomVerse.Text,
        ref: `${getBookName(randomBook.BookId)} ${randomChapter.ChapterId}:${randomVerse.VerseId}`,
        link: `read_${randomBook.BookId}_${randomChapter.ChapterId}`
    };
}

// --- ФУНКЦИЯ РАССЫЛКИ ---
async function sendDailyVerse() {
    console.log('📢 Запуск рассылки в 23:53...');
    const verse = getRandomVerse();
    const message = `<b>СТИХ ДНЯ</b>\n\n<blockquote>${verse.text}</blockquote>\n\n📖 ${verse.ref}`;

    for (const chatId of subscribers) {
        try {
            await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
        } catch (e) {
            if (e.description && e.description.includes('blocked')) {
                subscribers.delete(chatId);
                saveSubscribers();
            }
        }
    }
}

// --- РАСПИСАНИЕ (23:53 по МСК) ---
cron.schedule('00 12 * * *', () => sendDailyVerse(), { timezone: "Europe/Moscow" });

// --- ГЛАВНОЕ МЕНЮ (Личка) ---
const mainMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('📜 Ветхий Завет', 'test_old'), Markup.button.callback('📖 Новый Завет', 'test_new')],
    [Markup.button.callback('🎲 Случайный стих', 'random_verse'), Markup.button.callback('🔍 Инфо', 'search_help')]
]);

// --- ПРИВЕТСТВИЕ: ЛИЧКА ---
bot.start((ctx) => {
    if (ctx.chat.type === 'private') {
        subscribers.add(ctx.chat.id);
        saveSubscribers();
        const welcome = `<b>Мир дому твоему, ${ctx.from.first_name}!</b> ☦️\n\n` +
            `Добро пожаловать в приложение для чтения Священного Писания.\n\n` +
            `<i>«Исследуйте Писания, ибо вы думаете чрез них иметь жизнь вечную» (Ин. 5:39)</i>`;
        return ctx.replyWithHTML(welcome, mainMenu());
    }
});

// --- ПРИВЕТСТВИЕ: ГРУППА ---
bot.on('new_chat_members', (ctx) => {
    const isBotAdded = ctx.message.new_chat_members.some(member => member.id === ctx.botInfo.id);
    if (isBotAdded) {
        subscribers.add(ctx.chat.id);
        saveSubscribers();
        const groupWelcome = `<b>Мир вашему дому!</b> ☦️\n\n` +
            `Я — бот для чтения Священного Писания. Буду присылать в этот чат ` +
            `духовные наставления по расписанию.\n\n` +
            `Пусть Слово Божье пребывает с вами!`;
        return ctx.replyWithHTML(groupWelcome);
    }
});

// --- ПОИСК (КОМПАКТНЫЙ 2 В РЯД) ---
bot.on('text', (ctx) => {
    if (ctx.chat.type !== 'private') return; // В группах не спамим поиском
    const query = ctx.message.text.toLowerCase();
    if (query.length < 3) return ctx.reply("Введите хотя бы 3 символа.");

    let results = [];
    for (const book of bibleData) {
        for (const chapter of book.Chapters) {
            for (const verse of chapter.Verses) {
                if (verse.Text.toLowerCase().includes(query)) {
                    results.push({
                        ref: `${getBookName(book.BookId)} ${chapter.ChapterId}:${verse.VerseId}`,
                        link: `read_${book.BookId}_${chapter.ChapterId}`,
                        text: verse.Text
                    });
                }
                if (results.length >= 10) break;
            }
            if (results.length >= 10) break;
        }
        if (results.length >= 10) break;
    }

    if (results.length === 0) return ctx.reply("Ничего не найдено.");

    let response = `<b>🔍 Поиск "${ctx.message.text}":</b>\n\n`;
    const buttons = [];
    results.forEach((res, i) => {
        response += `📍 <b>${res.ref}</b>: <i>"${res.text.substring(0, 60)}..."</i>\n\n`;
        const btn = Markup.button.callback(res.ref, res.link);
        if (i % 2 === 0) buttons.push([btn]); else buttons[buttons.length - 1].push(btn);
    });

    ctx.replyWithHTML(response, Markup.inlineKeyboard(buttons));
});

// --- СЛУЧАЙНЫЙ СТИХ (КНОПКА) ---
bot.action('random_verse', (ctx) => {
    const verse = getRandomVerse();
    const message = `<b>🎲 Случайный стих</b>\n\n<blockquote>${verse.text}</blockquote>\n\n📖 <b>${verse.ref}</b>`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Еще один 🎲', 'random_verse')],
        [Markup.button.callback('Читать главу 📖', verse.link), Markup.button.callback('🏠 Меню', 'start_over')]
    ]);
    return ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard }).catch(() => ctx.replyWithHTML(message, keyboard));
});

// --- ВЫБОР ЗАВЕТА ---
bot.action(/test_(old|new)/, (ctx) => {
    const isNew = ctx.match[1] === 'new';
    const books = bibleData.filter(b => isNew ? b.BookId >= 40 : b.BookId <= 39);
    const buttons = [];
    for (let i = 0; i < books.length; i += 2) {
        const row = [Markup.button.callback(getBookName(books[i].BookId), `bk_${books[i].BookId}`)];
        if (books[i + 1]) row.push(Markup.button.callback(getBookName(books[i + 1].BookId), `bk_${books[i + 1].BookId}`));
        buttons.push(row);
    }
    buttons.push([Markup.button.callback('⬅️ В начало', 'start_over')]);
    return ctx.editMessageText("<b>Выберите книгу:</b>", { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

// --- ВЫБОР ГЛАВЫ ---
bot.action(/bk_(\d+)/, (ctx) => {
    const bookId = parseInt(ctx.match[1]);
    const book = bibleData.find(b => b.BookId === bookId);
    const buttons = book.Chapters.map(ch => Markup.button.callback(`${ch.ChapterId}`, `read_${bookId}_${ch.ChapterId}`));
    const rows = []; while (buttons.length) rows.push(buttons.splice(0, 5));
    rows.push([Markup.button.callback('⬅️ Назад', bookId >= 40 ? 'test_new' : 'test_old')]);
    return ctx.editMessageText(`<b>${getBookName(bookId)}</b>\nВыберите главу:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});

// --- ЧТЕНИЕ И ПЕРЕЛИСТЫВАНИЕ ---
bot.action(/read_(\d+)_(\d+)/, async (ctx) => {
    const bookId = parseInt(ctx.match[1]);
    const chId = parseInt(ctx.match[2]);
    const bookIndex = bibleData.findIndex(b => b.BookId === bookId);
    const book = bibleData[bookIndex];
    const chapter = book.Chapters.find(ch => ch.ChapterId === chId);

    const header = `<b>☦️ ${getBookName(bookId)}, Глава ${chId}</b>\n\n`;
    const body = chapter.Verses.map(v => `<b>${v.VerseId}</b> ${v.Text}`).join('\n');

    const navRow = [];
    if (chId > 1) {
        navRow.push(Markup.button.callback('⬅️ Назад', `read_${bookId}_${chId - 1}`));
    } else if (bookIndex > 0) {
        const prevB = bibleData[bookIndex - 1];
        const lastCh = prevB.Chapters[prevB.Chapters.length - 1].ChapterId;
        navRow.push(Markup.button.callback('⬅️ Пред. книга', `read_${prevB.BookId}_${lastCh}`));
    }

    if (chId < book.Chapters.length) {
        navRow.push(Markup.button.callback('Вперед ➡️', `read_${bookId}_${chId + 1}`));
    } else if (bookIndex < bibleData.length - 1) {
        navRow.push(Markup.button.callback('След. книга ➡️', `read_${bibleData[bookIndex + 1].BookId}_1`));
    }

    const keyboard = Markup.inlineKeyboard([
        navRow,
        [Markup.button.callback('📜 К главам', `bk_${bookId}`), Markup.button.callback('🏠 Меню', 'start_over')]
    ]);

    try {
        await ctx.editMessageText((header + body).substring(0, 4090), { parse_mode: 'HTML', ...keyboard });
    } catch (e) {
        await ctx.replyWithHTML((header + body).substring(0, 4090), keyboard);
    }
    return ctx.answerCbQuery();
});

bot.action('start_over', (ctx) => ctx.editMessageText('Выберите раздел:', { parse_mode: 'HTML', ...mainMenu() }));
bot.action('search_help', (ctx) => ctx.editMessageText("Просто напишите любое слово в чат, чтобы найти стихи из Библии.", { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('Назад', 'start_over')]]) }));

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ПОИСКА ID КНИГИ ПО НАЗВАНИЮ ---
function findBookIdByName(name) {
    const searchName = name.toLowerCase().trim();
    for (const [id, bookName] of Object.entries(BIBLE_BOOKS)) {
        if (bookName.toLowerCase() === searchName || bookName.toLowerCase().includes(searchName)) {
            return parseInt(id);
        }
    }
    return null;
}

// --- ИНЛАЙН-ПОИСК (@bot запрос) ---
bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    if (query.length < 2) return ctx.answerInlineQuery([]);

    // Регулярное выражение для формата "Книга Глава:Стих" или "Книга Глава:Стих-Стих"
    // Группа 1: Название книги, Группа 2: Глава, Группа 3: Начальный стих, Группа 4: Конечный стих (опционально)
    const regex = /^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/i;
    const match = query.match(regex);

    let results = [];

    if (match) {
        // --- ПОИСК ПО КОНКРЕТНОЙ ССЫЛКЕ ---
        const bookNameQuery = match[1];
        const chapterId = parseInt(match[2]);
        const startVerse = parseInt(match[3]);
        const endVerse = match[4] ? parseInt(match[4]) : startVerse;

        const bookId = findBookIdByName(bookNameQuery);
        const book = bibleData.find(b => b.BookId === bookId);

        if (book) {
            const chapter = book.Chapters.find(ch => ch.ChapterId === chapterId);
            if (chapter) {
                // Выбираем нужные стихи
                const selectedVerses = chapter.Verses.filter(v => v.VerseId >= startVerse && v.VerseId <= endVerse);

                if (selectedVerses.length > 0) {
                    const bookTitle = getBookName(book.BookId);
                    const rangeLabel = startVerse === endVerse ? startVerse : `${startVerse}-${endVerse}`;
                    const fullRef = `${bookTitle} ${chapterId}:${rangeLabel}`;

                    // Собираем текст всех выбранных стихов
                    const fullText = selectedVerses.map(v => (startVerse === endVerse ? v.Text : `<b>${v.VerseId}</b> ${v.Text}`)).join('\n');

                    results.push({
                        type: 'article',
                        id: `ref_${bookId}_${chapterId}_${startVerse}_${endVerse}`,
                        title: fullRef,
                        description: selectedVerses[0].Text.substring(0, 100) + '...',
                        input_message_content: {
                            message_text: `<b>${fullRef}</b>\n\n<blockquote>${fullText}</blockquote>`,
                            parse_mode: 'HTML'
                        },
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.url('Читать всю главу 📖', `https://t.me/${ctx.botInfo.username}?start=read_${bookId}_${chapterId}`)]
                        ])
                    });
                }
            }
        }
    } else {
        // --- ОБЫЧНЫЙ ПОИСК ПО СЛОВУ (если формат ссылки не подошел) ---
        const wordQuery = query.toLowerCase();
        let count = 0;
        for (const book of bibleData) {
            for (const chapter of book.Chapters) {
                for (const verse of chapter.Verses) {
                    if (verse.Text.toLowerCase().includes(wordQuery)) {
                        const ref = `${getBookName(book.BookId)} ${chapter.ChapterId}:${verse.VerseId}`;
                        results.push({
                            type: 'article',
                            id: `word_${book.BookId}_${chapter.ChapterId}_${verse.VerseId}`,
                            title: ref,
                            description: verse.Text.substring(0, 100),
                            input_message_content: {
                                message_text: `<b>${ref}</b>\n\n<blockquote>${verse.Text}</blockquote>`,
                                parse_mode: 'HTML'
                            },
                            reply_markup: Markup.inlineKeyboard([
                                [Markup.button.url('Читать главу 📖', `https://t.me/${ctx.botInfo.username}?start=read_${book.BookId}_${chapter.ChapterId}`)]
                            ])
                        });
                        count++;
                    }
                    if (count >= 20) break;
                }
                if (count >= 20) break;
            }
            if (count >= 20) break;
        }
    }

    return ctx.answerInlineQuery(results);
});

bot.launch().then(() => console.log('☦️ Бот запущен! Рассылка настроена на 23:53.'));