require('dotenv').config();
const schedule = require('node-schedule');
const { Telegraf, Markup } = require('telegraf');
const { session } = require('telegraf');
const fs = require('fs');
const { createCanvas, registerFont } = require('canvas');
const path = require('path');
const https = require('https');

// --- Octokit initialization (moved to top) ---
let octokit;
let GITHUB_TOKEN_OK = false;
let GIST_ID_OK = false;

async function checkOctokitAndGist() {
    const token = process.env.GITHUB_TOKEN;
    const gistId = process.env.GIST_ID;
    if (!token) {
        console.error('❌ Переменная окружения GITHUB_TOKEN не установлена. Укажите токен GitHub в GITHUB_TOKEN.');
        return false;
    }
    if (!gistId) {
        console.error('❌ Переменная окружения GIST_ID не установлена. Укажите ID Gist в GIST_ID.');
        return false;
    }
    const { Octokit } = await import('@octokit/rest');
    octokit = new Octokit({ auth: token });
    // Проверим доступ к Gist
    try {
        await octokit.gists.get({ gist_id: gistId });
        GITHUB_TOKEN_OK = true;
        GIST_ID_OK = true;
        return true;
    } catch (e) {
        if (e.status === 404) {
            console.error('❌ Указанный GIST_ID не найден или недоступен для этого токена.');
        } else if (e.status === 401 || e.status === 403) {
            console.error('❌ Недостаточно прав для доступа к Gist. Проверьте GITHUB_TOKEN.');
        } else {
            console.error('❌ Ошибка при проверке Gist:', e.message);
        }
        GITHUB_TOKEN_OK = false;
        GIST_ID_OK = false;
        return false;
    }
}

(async () => {
    const ok = await checkOctokitAndGist();
    if (!ok) {
        console.error('❌ Бот не может работать без доступа к Gist. Проверьте настройки и перезапустите.');
        process.exit(1);
    }
    await loadDBFromGist();
    // The rest of your startup code (moved from previous IIFE)...
    bot.telegram.deleteWebhook().then(() => {
        bot.launch().then(async () => {
            console.log('☦️ Бот запущен');
            await runScheduledTasksNow();
        });
    });
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
})();



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


if (!token) {
    console.error('❌ Переменная окружения BOT_TOKEN не установлена. Укажите токен бота в BOT_TOKEN.');
    process.exit(1);
}


// Helper: check if chat is private
function isPrivate(ctx) {
    return ctx.chat && ctx.chat.type === 'private';
}


const bot = new Telegraf(token);

// Welcome message when bot is added to a group
bot.on('new_chat_members', async (ctx) => {
    try {
        const botId = ctx.botInfo.id;

        const isBotAdded = ctx.message.new_chat_members.some(member => member.id === botId);
        if (!isBotAdded) return;

        const text =
            `☦️ <b>Мир вашему дому, братия и сестры!</b>\n\n` +
            `Благодарю за приглашение в этот чат.\n\n` +
            `Я — православный помощник, созданный для:\n` +
            `• чтения Священного Писания 📖\n` +
            `• молитвенного правила 🙏\n` +
            `• церковного календаря 📅\n\n` +
            `🕊 <i>Для полноценного использования откройте меня в личных сообщениях.</i>\n\n` +
            `Да благословит вас Господь!`;

        await ctx.replyWithHTML(text, {
            reply_markup: { remove_keyboard: true }
        });
    } catch (e) {
        console.error('Group welcome error:', e);
    }
});

// Global middleware: stricter group handling (warn only on text commands, allow service/non-text events)
bot.use(async (ctx, next) => {
    // allow service events (bot added, etc.)
    if (ctx.message && ctx.message.new_chat_members) {
        return next();
    }

    // allow non-text events (prevents false triggers)
    if (!ctx.message || !ctx.message.text) {
        return next();
    }

    // block ONLY text commands in groups
    if (!isPrivate(ctx)) {
        try {
            await ctx.reply('⚠️ Используйте бота в личных сообщениях', { remove_keyboard: true });
        } catch (e) {}
        return;
    }

    return next();
});

// 📌 Сохраняем все чаты (личка + группы)
bot.on('my_chat_member', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!db[chatId]) {
        db[chatId] = { bookmark: null, isSearching: false, isGroup: ctx.chat.type !== 'private' };
        await saveDBToGist();
        console.log('✅ Чат добавлен:', chatId, ctx.chat.type);
    }
});

const GIST_ID = process.env.GIST_ID;
const GIST_FILE = 'users_data.json'; // Ensure this matches the filename in your Gist exactly!

let db = {}; // локальная копия базы



const initUser = async (id) => {
    if (!db[id]) {
        db[id] = { bookmark: null, isSearching: false };
        await saveDBToGist();
    }
};

// Массовая рассылка сообщения всем пользователям и группам из db
async function broadcastMessage(message) {
    await loadDBFromGist();
    await ensureAllChatsInDB();
    const ids = Object.keys(db);
    for (const id of ids) {
        try {
            await bot.telegram.sendMessage(id, message, { parse_mode: 'HTML', disable_web_page_preview: true });
        } catch (e) { console.error('Ошибка рассылки для', id, e.message); }
    }
}

async function loadDBFromGist() {
    // Проверяем валидность токена и Gist перед загрузкой
    if (!octokit || !GITHUB_TOKEN_OK || !GIST_ID_OK) {
        console.error('❌ Нет доступа к Gist или токену. DB не загружена.');
        db = {};
        return;
    }
    try {
        const res = await octokit.gists.get({ gist_id: GIST_ID });
        let fileContent = '{}';
        // Check if file exists in gist
        if (res.data.files && res.data.files[GIST_FILE]) {
            fileContent = res.data.files[GIST_FILE].content;
        } else {
            // File does not exist in Gist, create it with empty object
            await octokit.gists.update({
                gist_id: GIST_ID,
                files: { [GIST_FILE]: { content: '{}' } }
            });
            fileContent = '{}';
            console.log(`✅ Файл ${GIST_FILE} создан в Gist`);
        }
        db = JSON.parse(fileContent);
        console.log('✅ DB загружена с Gist');
    } catch (e) {
        // If gist not found or file not found, try to create file
        if (e.status === 404) {
            try {
                await octokit.gists.update({
                    gist_id: GIST_ID,
                    files: { [GIST_FILE]: { content: '{}' } }
                });
                db = {};
                console.log(`✅ Файл ${GIST_FILE} автоматически создан в Gist`);
            } catch (err) {
                console.error('❌ Ошибка создания файла в Gist:', err.message);
                db = {};
            }
        } else {
            console.error('❌ Ошибка загрузки DB с Gist:', e.message);
            db = {};
        }
    }
}

async function saveDBToGist() {
    // Проверяем валидность токена и Gist перед сохранением
    if (!octokit || !GITHUB_TOKEN_OK || !GIST_ID_OK) {
        console.error('❌ Нет доступа к Gist или токену. Сохранение DB не выполняется.');
        return;
    }
    try {
        const content = JSON.stringify(db, null, 2);
        // First, get the gist and check if file exists
        let gist;
        try {
            gist = await octokit.gists.get({ gist_id: GIST_ID });
        } catch (e) {
            gist = null;
        }
        let files = {};
        if (gist && gist.data.files && gist.data.files[GIST_FILE]) {
            // File exists, update as usual
            files[GIST_FILE] = { content };
        } else {
            // File does not exist, create it with {} if db is empty, else with current db
            files[GIST_FILE] = { content: content || '{}' };
        }
        await octokit.gists.update({
            gist_id: GIST_ID,
            files
        });
        console.log('✅ DB сохранена на Gist');
    } catch (e) {
        // If file not found, attempt to create it
        if (e.status === 404) {
            try {
                await octokit.gists.update({
                    gist_id: GIST_ID,
                    files: { [GIST_FILE]: { content: '{}' } }
                });
                console.log(`✅ Файл ${GIST_FILE} автоматически создан в Gist`);
            } catch (err) {
                console.error('❌ Ошибка создания файла в Gist:', err.message);
            }
        } else {
            console.error('❌ Ошибка сохранения DB на Gist:', e.message);
        }
    }
}

// Ensure all chats from updates are tracked in db
async function ensureAllChatsInDB() {
    try {
        const updates = await bot.telegram.getUpdates();
        updates.forEach(u => {
            if (u.my_chat_member && u.my_chat_member.chat) {
                const chatId = String(u.my_chat_member.chat.id);
                if (!db[chatId]) {
                    db[chatId] = {
                        bookmark: null,
                        isSearching: false,
                        isGroup: u.my_chat_member.chat.type !== 'private'
                    };
                }
            }
        });
        await saveDBToGist();
    } catch (e) {
        console.error('Ошибка ensureAllChatsInDB:', e);
    }
}



// -- END of moved IIFE, rest of the code continues as before --


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


function getInterpretationLink(bId, cId) {
    const name = getBookName(Number(bId)).trim();

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


    if (bId === 19) {
        return `https://azbyka.ru/otechnik/Lopuhin/tolkovaja_biblija_19/${cId}`;
    }

    return `https://azbyka.ru/otechnik/Lopuhin/tolkovaja_biblija_${bookNum}/${cId}`;
}


function getOrthodoxPascha(year) {
    const a = year % 19, b = year % 4, c = year % 7;
    const d = (19 * a + 15) % 30;
    const e = (2 * b + 4 * c + 6 * d + 6) % 7;
    const f = d + e;
    return f <= 9 ? new Date(year, 3, 22 + f + 13) : new Date(year, 4, f - 9 + 13);
}


const ORTHODOX_CALENDAR = [

    { month: 1, day: 7, saints: ['Рождество Господа Бога и Спаса нашего Иисуса Христа'] },
    { month: 1, day: 19, saints: ['Святое Богоявление (Крещение Господне)'] },
    { month: 4, day: 7, saints: ['Благовещение Пресвятой Богородицы'] },
    { month: 8, day: 19, saints: ['Преображение Господне'] },
    { month: 8, day: 28, saints: ['Успение Пресвятой Богородицы'] },
    { month: 9, day: 21, saints: ['Рождество Пресвятой Богородицы'] },
    { month: 9, day: 27, saints: ['Воздвижение Честного и Животворящего Креста Господня'] },
    { month: 12, day: 4, saints: ['Введение во храм Пресвятой Богородицы'] },

];


function getOrthodoxPaschaDate(year) {

    const a = year % 19;
    const b = year % 4;
    const c = year % 7;
    const d = (19 * a + 15) % 30;
    const e = (2 * b + 4 * c + 6 * d + 6) % 7;
    const julianPascha = new Date(Date.UTC(year, 2, 22 + d + e)); 

    julianPascha.setUTCDate(julianPascha.getUTCDate() + 13);
    return new Date(julianPascha.getUTCFullYear(), julianPascha.getUTCMonth(), julianPascha.getUTCDate());
}


const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];


function getFastingInfo(date, paschaDate) {

    const greatLentStart = new Date(paschaDate);
    greatLentStart.setDate(greatLentStart.getDate() - 48);
    const greatLentEnd = new Date(paschaDate);
    greatLentEnd.setDate(greatLentEnd.getDate() - 2); 


    const pentecost = new Date(paschaDate);
    pentecost.setDate(paschaDate.getDate() + 49);
    const petrovPostStart = new Date(pentecost);
    petrovPostStart.setDate(pentecost.getDate() + 1);
    const petrovPostEnd = new Date(date.getFullYear(), 6, 12); 


    const uspenskyPostStart = new Date(date.getFullYear(), 7, 14);
    const uspenskyPostEnd = new Date(date.getFullYear(), 7, 27);


    const christmasFastStart = new Date(date.getFullYear(), 10, 28);
    const christmasFastEnd = new Date(date.getFullYear() + 1, 0, 6);


    const svjatkiStart = new Date(date.getFullYear(), 0, 7);
    const svjatkiEnd = new Date(date.getFullYear(), 0, 17);
    const maslenitsaStart = new Date(paschaDate);
    maslenitsaStart.setDate(paschaDate.getDate() - 49);
    const maslenitsaEnd = new Date(paschaDate);
    maslenitsaEnd.setDate(paschaDate.getDate() - 42);
    const radonitsaStart = new Date(paschaDate);
    radonitsaStart.setDate(paschaDate.getDate() + 8);
    const radonitsaEnd = new Date(paschaDate);
    radonitsaEnd.setDate(paschaDate.getDate() + 14);


    let fastType = '';
    let fastText = '';
    let period = '';
    let week = '';


    if (
        date.getDate() === paschaDate.getDate() &&
        date.getMonth() === paschaDate.getMonth()
    ) {
        period = 'Светлое Христово Воскресение (Пасха)';
        week = 'Светлая седмица';
        fastType = 'Поста нет';
        fastText = 'Пасха – поста нет';
        return { period, week, fastType, fastText };
    }


    const svWeekStart = new Date(paschaDate);
    const svWeekEnd = new Date(paschaDate);
    svWeekEnd.setDate(paschaDate.getDate() + 6);
    if (date >= svWeekStart && date <= svWeekEnd) {
        period = 'Светлая седмица';
        week = 'Светлая седмица';
        fastType = 'Поста нет';
        fastText = 'Пасха – поста нет';
        return { period, week, fastType, fastText };
    }


    if (date >= greatLentStart && date <= greatLentEnd) {
        period = 'Великий пост';

        const daysFromStart = Math.floor((date - greatLentStart) / (1000 * 60 * 60 * 24));
        const sedmitsaNum = Math.floor(daysFromStart / 7) + 1;
        week = `${sedmitsaNum}-я седмица Великого поста`;

        if (date.getDay() === 0) {
            fastType = 'Послабление в пище (воскресенье)';
            fastText = 'Разрешается растительное масло, вино';
        } else if (date.getDay() === 6) {
            fastType = 'Строгий пост (суббота)';
            fastText = 'Разрешается растительное масло, вино';
        } else {
            fastType = 'Строгий пост';
            fastText = 'Пища без масла';
        }
        return { period, week, fastType, fastText };
    }


    if (petrovPostStart <= date && date <= petrovPostEnd) {
        period = 'Петров пост';

        const daysFromStart = Math.floor((date - petrovPostStart) / (1000 * 60 * 60 * 24));
        const sedmitsaNum = Math.floor(daysFromStart / 7) + 1;
        week = `${sedmitsaNum}-я седмица Петрова поста`;

        if (date.getDay() === 0 || date.getDay() === 6) {
            fastType = 'Послабление в пище (сб/вс)';
            fastText = 'Разрешается рыба, растительное масло, вино';
        } else {
            fastType = 'Пост';
            fastText = 'Пища без мяса, молока, яиц';
        }
        return { period, week, fastType, fastText };
    }


    if (uspenskyPostStart <= date && date <= uspenskyPostEnd) {
        period = 'Успенский пост';
        const daysFromStart = Math.floor((date - uspenskyPostStart) / (1000 * 60 * 60 * 24));
        const sedmitsaNum = Math.floor(daysFromStart / 7) + 1;
        week = `${sedmitsaNum}-я седмица Успенского поста`;
        if (date.getDay() === 0 || date.getDay() === 6) {
            fastType = 'Послабление в пище (сб/вс)';
            fastText = 'Разрешается растительное масло';
        } else {
            fastType = 'Строгий пост';
            fastText = 'Пища без масла';
        }
        return { period, week, fastType, fastText };
    }


    if ((date >= christmasFastStart && date.getMonth() === 10) || (date <= christmasFastEnd && date.getMonth() === 0)) {
        period = 'Рождественский пост';

        let start = new Date(date.getFullYear(), 10, 28);
        if (date.getMonth() === 0) start = new Date(date.getFullYear() - 1, 10, 28);
        const daysFromStart = Math.floor((date - start) / (1000 * 60 * 60 * 24));
        const sedmitsaNum = Math.floor(daysFromStart / 7) + 1;
        week = `${sedmitsaNum}-я седмица Рождественского поста`;
        if (date.getDay() === 0 || date.getDay() === 6) {
            fastType = 'Послабление в пище (сб/вс)';
            fastText = 'Разрешается рыба, растительное масло, вино';
        } else {
            fastType = 'Пост';
            fastText = 'Пища без мяса, молока, яиц';
        }
        return { period, week, fastType, fastText };
    }


    if ((date >= svjatkiStart && date <= svjatkiEnd) ||
        (date >= maslenitsaStart && date <= maslenitsaEnd) ||
        (date >= radonitsaStart && date <= radonitsaEnd)) {
        period = 'Сплошная седмица';
        week = 'Нет поста';
        fastType = 'Поста нет';
        fastText = 'Поста нет';
        return { period, week, fastType, fastText };
    }


    if (date.getDay() === 3 || date.getDay() === 5) { 
        period = 'Обычный день';
        week = 'Постный день';
        fastType = 'Пост (среда/пятница)';
        fastText = 'Пища без мяса, молока, яиц';
        return { period, week, fastType, fastText };
    }


    period = 'Обычный день';
    week = 'Нет поста';
    fastType = 'Поста нет';
    fastText = 'Поста нет';
    return { period, week, fastType, fastText };
}


function getOldStyleDate(date) {
    const oldDate = new Date(date);
    oldDate.setDate(date.getDate() - 13);
    return oldDate;
}


function getSaintsForDate(month, day) {
    const found = ORTHODOX_CALENDAR.find(x => x.month === month && x.day === day);
    return found ? found.saints : [];
}


const cheerio = require('cheerio'); 

async function getDetailedCalendar() {

    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekday = WEEKDAYS[now.getDay()];
    const azLink = `https://azbyka.ru/days/${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    let saints = [];
    try {
        const data = await new Promise((resolve, reject) => {
            const url = `https://azbyka.ru/days/widgets/presentations.json?prevNextLinks=1&image=0&date=${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
                let raw = '';
                res.on('data', chunk => raw += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(raw));
                    } catch (e) { resolve(null); }
                });
            }).on('error', () => resolve(null));
        });
        if (data && data.presentations) {

            const $ = cheerio.load(data.presentations, { decodeEntities: false });
            const arr = [];

            $('img, table, tbody, tr, td, th, style, script, iframe, object, embed, form, input, button, video, audio, figure, figcaption').remove();

            $('a').each((i, el) => {

                const name = $(el).text().trim();
                const href = $(el).attr('href');
                if (name) {

                    if (href && /^https?:\/\/azbyka\.ru/.test(href)) {
                        arr.push(`• <a href="${href}">${name}</a>`);
                    } else if (href && href.startsWith('/')) {
                        arr.push(`• <a href="https://azbyka.ru${href}">${name}</a>`);
                    } else {
                        arr.push(`• ${name}`);
                    }
                }
            });
            if (arr.length) saints = arr;
        }
    } catch (e) {
        saints = [];
    }

    if (!saints.length) {
        saints = getSaintsForDate(month, day).map(s => `• ${s}`);
    }

    const oldStyle = getOldStyleDate(now);

    const fasting = getFastingInfo(now, getOrthodoxPaschaDate(year));

    let text = `<b>📅 ЦЕРКОВНЫЙ КАЛЕНДАРЬ</b>\n`;
    text += `<i>Старый стиль: ${oldStyle.getDate()}.${String(oldStyle.getMonth() + 1).padStart(2, '0')}, Новый стиль: ${day}.${String(month).padStart(2, '0')} (${weekday})</i>\n`;
    text += `────────────────────\n\n`;
    text += `<b>📜 Седмица и период:</b> ${fasting.week}\n`;
    text += `<b>Период:</b> ${fasting.period}\n`;
    text += `<b>🥗 Пост / Трапеза:</b> ${fasting.fastType} (${fasting.fastText})\n\n`;

    if (saints.length) {
        text += `<b>🕯 Святые дня:</b>\n${saints.join('\n')}\n\n`;
    } else {
        text += `<b>🕯 Святые дня:</b> информация отсутствует\n\n`;
    }
    text += `📖 <a href="${azLink}">Жития, иконы и чтения дня</a>`;
    return { text, link: azLink };
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


const mainReplyMenu = Markup.keyboard([
    ['📖 Библия', '📜 Закон Божий'], 
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
    // Используем initUser для chat.id (в группах) или from.id (в личке)
    const uid = String(ctx.from?.id ?? ctx.chat?.id);
    await initUser(uid);
    db[uid].bookmark = { bId, cId };
    await saveDBToGist();
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


bot.start(async (ctx) => {
    const chatId = String(ctx.chat.id);

    initUser(chatId);

    if (!isPrivate(ctx)) {
        // В группе — ничего не показываем, можно только прислать календарь
        const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
        await sendDynamicCalendar({
            replyWithHTML: (text) => bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' })
        }, now);
        return;
    }
    // Личная беседа — показываем приветствие и кнопки
    const name = ctx.from.first_name || 'друг';
    const welcomeText = `<b>Мир дому твоему, ${name}! ☦️</b>\n\n` +
        `Добро пожаловать в <b>«Святую Библию»</b>.\n\n` +
        `Этот бот поможет тебе всегда иметь под рукой Слово Божье, молитвы и церковный календарь.`;

    await ctx.replyWithHTML(welcomeText, mainReplyMenu);
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

    if (!isPrivate(ctx)) {
        return ctx.reply(text, { remove_keyboard: true });
    }
    ctx.replyWithHTML(text, bibleMenu);
});

bot.hears('⬅️ Главное меню', (ctx) => {
    if (!isPrivate(ctx)) {
        return ctx.reply('🏠 Главное меню', { remove_keyboard: true });
    }
    ctx.reply('🏠 Главное меню', mainReplyMenu);
});

bot.hears('Чтение писания', (ctx) => {
    if (!isPrivate(ctx)) {
        return ctx.reply('📚 СВЯЩЕННОЕ ПИСАНИЕ\n\nВыберите раздел:', { remove_keyboard: true });
    }
    ctx.replyWithHTML(`<b>📚 СВЯЩЕННОЕ ПИСАНИЕ</b>\n\nВыберите раздел:`, Markup.inlineKeyboard([[Markup.button.callback('📜 Ветхий Завет', 'test_old'), Markup.button.callback('📖 Новый Завет', 'test_new')]]));
});


bot.hears('Календарь', async (ctx) => {
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await sendDynamicCalendar(ctx, now);
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

bot.hears('Случайный стих', async (ctx) => {
    if (!bibleData.length) return;

    const gospels = bibleData.filter(b => b.BookId >= 40 && b.BookId <= 43);
    const psalms = bibleData.filter(b => b.BookId === 19);
    const proverbs = bibleData.filter(b => b.BookId === 20);
    const epistles = bibleData.filter(b => b.BookId >= 44 && b.BookId <= 65);
    const oldTestament = bibleData.filter(b => b.BookId <= 39 && b.BookId !== 19 && b.BookId !== 20);

    let book;
    const r = Math.random();

    if (r < 0.45) {
        book = gospels[Math.floor(Math.random() * gospels.length)];
    }
    else if (r < 0.65) {
        book = psalms[0];
    }
    else if (r < 0.80) {
        book = proverbs[0];
    }
    else if (r < 0.92) {
        book = epistles[Math.floor(Math.random() * epistles.length)];
    }
    else {
        book = oldTestament[Math.floor(Math.random() * oldTestament.length)];
    }

    const chapter = book.Chapters[Math.floor(Math.random() * book.Chapters.length)];

    let startIndex = Math.floor(Math.random() * chapter.Verses.length);

    if (startIndex > 0) {
        const prev = chapter.Verses[startIndex].Text.trim()[0];
        if (prev === prev.toLowerCase()) startIndex--;
    }

    const verses = [];

    for (let i = startIndex; i < chapter.Verses.length; i++) {

        const v = chapter.Verses[i];
        verses.push(v);

        const text = v.Text.trim();

        if (
            verses.length >= 3 &&
            (text.endsWith('.') || text.endsWith('!') || text.endsWith('?'))
        ) {
            break;
        }

        if (verses.length >= 6) break;
    }

    const text = verses.map(v => v.Text).join(' ');

    const first = verses[0].VerseId;
    const last = verses[verses.length - 1].VerseId;

    const ref =
        first === last
            ? `${getBookName(book.BookId)} ${chapter.ChapterId}:${first}`
            : `${getBookName(book.BookId)} ${chapter.ChapterId}:${first}-${last}`;

    if (!isPrivate(ctx)) {
        return ctx.reply('☦️ ДУХОВНОЕ НАСТАВЛЕНИЕ', { remove_keyboard: true });
    }
    await ctx.replyWithHTML(
        `<b>☦️ ДУХОВНОЕ НАСТАВЛЕНИЕ</b>\n\n<blockquote>${text}</blockquote>\n\n📍 <b>${ref}</b>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🖼 Создать открытку', `pic_${book.BookId}_${chapter.ChapterId}_${first}`)],
            [Markup.button.callback('📖 Открыть главу', `read_${book.BookId}_${chapter.ChapterId}`)]
        ])
    );
});

bot.hears('Псалтирь', (ctx) => {
    const buttons = PSALMS_CATEGORIES.map((cat, idx) => [Markup.button.callback(cat.name, `ps_cat_${idx}`)]);
    if (!isPrivate(ctx)) {
        return ctx.reply('Псалтирь на всякую потребу', { remove_keyboard: true });
    }
    ctx.replyWithHTML(`<b>Псалтирь на всякую потребу</b>`, Markup.inlineKeyboard(buttons));
});

bot.hears('Закладка', async (ctx) => {
    if (!isPrivate(ctx)) {
        return ctx.reply('🔖 Закладок пока нет.', { remove_keyboard: true });
    }
    await initUser(ctx.chat.id);
    const b = db[ctx.chat.id]?.bookmark;
    if (b) return sendChapter(ctx, b.bId, b.cId, false);
    ctx.replyWithHTML(`<b>🔖 Закладок пока нет.</b>`);
});

bot.hears('Поиск', async (ctx) => {
    if (!isPrivate(ctx)) {
        return ctx.reply('🔎 ПОИСК ПО СВЯЩЕННОМУ ПИСАНИЮ', { remove_keyboard: true });
    }
    await initUser(ctx.from.id);
    db[ctx.from.id].isSearching = true;
    await saveDBToGist();
    const searchText = `<b>🔎 ПОИСК ПО СВЯЩЕННОМУ ПИСАНИЮ</b>\n` +
        `<i>«Исследуйте Писания...» (Ин. 5:39)</i>\n` +
        `────────────────────\n\n` +
        `Введите ключевое слово или фразу, которую вы хотите найти в Библии.\n\n` +
        `<b>Например:</b> <i>любовь, вера, заповедь</i>\n\n` +
        `🕊 <b>Введите слово и нажмите кнопку «Поиск» ниже:</b>`;

    ctx.replyWithHTML(searchText, Markup.inlineKeyboard([
        [Markup.button.callback('🔎 Поиск', 'do_bible_search')],
        [Markup.button.callback('🏠 В главное меню', 'start_over')]
    ]));
});


bot.on('text', async (ctx, next) => {
    // Only handle in private chats
    if (!isPrivate(ctx)) return;
    const menuButtons = ['📖 Библия', '📜 Закон Божий', 'Молитвослов', 'Календарь', 'Поиск', 'Чтение писания', 'Случайный стих', 'Псалтирь', 'Закладка', '⬅️ Главное меню'];
    const text = ctx.message?.text || '';
    if (menuButtons.includes(text)) return next();

    if (text.startsWith('/')) return next();

    await initUser(ctx.from.id);
    if (!db[ctx.from.id].isSearching) return next();
    db[ctx.from.id].lastSearchQuery = text;
    await saveDBToGist();

    await ctx.replyWithHTML("🔎 <b>Теперь нажмите кнопку «Поиск» ниже для выполнения поиска.</b>",
        Markup.inlineKeyboard([
            [Markup.button.callback('🔎 Поиск', 'do_bible_search')],
            [Markup.button.callback('🏠 В главное меню', 'start_over')]
        ])
    );
});


bot.action('do_bible_search', async (ctx) => {
    const userId = ctx.from.id;
    await initUser(userId);
    const q = db[userId].lastSearchQuery ? db[userId].lastSearchQuery.trim().toLowerCase() : '';
    if (!q || q.length < 3) {
        db[userId].isSearching = false;
        await saveDBToGist();
        if (!isPrivate(ctx)) {
            return ctx.reply("🕊 Введите минимум 3 символа для поиска.", { remove_keyboard: true });
        }
        return ctx.replyWithHTML("🕊 <b>Введите минимум 3 символа для поиска.</b>");
    }
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
    db[userId].isSearching = false;
    db[userId].lastSearchQuery = '';
    await saveDBToGist();
    if (!results.length) {
        if (!isPrivate(ctx)) {
            return ctx.reply("🕊 Ничего не найдено. Попробуйте другое слово.", { remove_keyboard: true });
        }
        return ctx.replyWithHTML("🕊 <b>Ничего не найдено. Попробуйте другое слово.</b>");
    }
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
    if (!isPrivate(ctx)) {
        return ctx.reply("🔎 РЕЗУЛЬТАТЫ ПОИСКА", { remove_keyboard: true });
    }
    await ctx.replyWithHTML(responseText, Markup.inlineKeyboard(buttons));
});


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


const adminPanel = require('./admin');
adminPanel(bot);


bot.command('admin', (ctx, next) => {
    console.log(`[ADMIN] /admin команда вызвана пользователем:`, ctx.from);
    return next();
});


// ⏰ Каждый день в 10:00 по Москве
schedule.scheduleJob(
    { tz: 'Europe/Moscow', hour: 10, minute: 0 },
    sendDailyCalendarToGroups
);

// (The above launch code is now inside the IIFE at the top)

async function runScheduledTasksNow() {
    console.log('▶️ Запуск всех отложенных задач сразу после старта бота для проверки…');
    try {
        await sendTheophanMessage();
        console.log('✅ sendTheophanMessage отработала (если был текст на сегодня).');
    } catch (e) {
        console.error('❌ Ошибка в sendTheophanMessage при ручном запуске:', e);
    }

    try {
        await sendDailyNewsMessage();
        console.log('✅ sendDailyNewsMessage отработала (если новости были получены).');
    } catch (e) {
        console.error('❌ Ошибка в sendDailyNewsMessage при ручном запуске:', e);
    }

    try {
        await sendHolidayReminderMessage();
        console.log('✅ sendHolidayReminderMessage отработала (если были праздники/святые).');
    } catch (e) {
        console.error('❌ Ошибка в sendHolidayReminderMessage при ручном запуске:', e);
    }

    console.log('⏹ Ручной запуск всех отложенных задач завершён.');
}


async function sendTheophanMessage() {
    // Ensure all chats from updates are present in db before sending
    await loadDBFromGist(); // обновляем список всех чатов
    await ensureAllChatsInDB();

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const url = `https://azbyka.ru/days/api/thoughts-st-theophan/${dateStr}.json`;

    let apiData = null;
    await new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    apiData = null;
                    return resolve();
                }
                try {
                    apiData = JSON.parse(raw);
                } catch (e) {
                    apiData = null;
                }
                resolve();
            });
        }).on('error', () => resolve());
    });

    if (!apiData || !apiData.text || typeof apiData.text !== 'string' || !apiData.text.trim()) {
        return;
    }

    const he = require('he');
    let htmlText = he.decode(apiData.text);
    const allowedTags = ['a', 'b', 'i', 'u', 's', 'code', 'pre'];

    const $ = cheerio.load(`<div>${htmlText}</div>`, { decodeEntities: false });

    function cleanNode(el) {
        if (el.type === 'text') {
            return el.data;
        }
        if (el.type === 'tag' && allowedTags.includes(el.name)) {
            let inner = '';
            if (el.children && el.children.length) {
                inner = el.children.map(child => cleanNode(child)).join('');
            }
            if (el.name === 'a' && el.attribs && el.attribs.href) {
                let href = el.attribs.href.replace(/"/g, '&quot;');
                return `<a href="${href}">${inner}</a>`;
            }
            return `<${el.name}>${inner}</${el.name}>`;
        }
        if (el.children && el.children.length) {
            return el.children.map(child => cleanNode(child)).join('');
        }
        return '';
    }

    let blockContent = '';
    const block = $('blockquote').first();
    if (block.length) {
        blockContent = block.contents().map((_, el) => cleanNode(el)).get().join('');
    } else {
        blockContent = $('div').contents().map((_, el) => cleanNode(el)).get().join('');
    }
    blockContent = blockContent.replace(/\n{3,}/g, '\n\n').trim();

    const text =
        `<b>Мысль дня от свтятого Феофана Затворника</b>\n\n` +
        `<blockquote>${blockContent}</blockquote>`;

    // Send to all chats in db (no filtering for group/private)
    for (const id of Object.keys(db)) {
        try {
            await bot.telegram.sendMessage(id, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } catch (e) {
            console.error('Ошибка отправки мысли дня:', id, e.message);
        }
    }
}

// Запуск "мысли дня" по московскому времени 12:34
const { DateTime } = require('luxon');
schedule.scheduleJob(
    { tz: 'Europe/Moscow', hour: 20, minute: 21
    , second: 0 },
    sendTheophanMessage
);





// (SECOND occurrence deleted)

bot.action(/calendar_(prev|next)_(\d{4}-\d{2}-\d{2})/, async (ctx) => {
    try {
        let dateStr = ctx.match[2];
        let date = new Date(dateStr);
        if (ctx.match[1] === 'prev') date.setDate(date.getDate() - 1);
        else date.setDate(date.getDate() + 1);
        await sendDynamicCalendar(ctx, date, true);
    } catch (e) {
        try { await ctx.reply('Произошла ошибка при загрузке календаря. Попробуйте позже.'); } catch {}
    }
});

async function sendDynamicCalendar(ctx, dateObj, isEdit = false) {

    if (!dateObj) {
        dateObj = new Date(Date.now() + 3 * 60 * 60 * 1000);
    }
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const weekday = WEEKDAYS[dateObj.getDay()];
    const azLink = `https://azbyka.ru/days/${year}-${month}-${day}`;


    let saints = [];
    try {
        const data = await new Promise((resolve) => {
            const url = `https://azbyka.ru/days/widgets/presentations.json?prevNextLinks=1&image=0&date=${year}-${month}-${day}`;
            https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
                let raw = '';
                res.on('data', chunk => raw += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(raw)); } catch (e) { resolve(null); }
                });
            }).on('error', () => resolve(null));
        });
        if (data && data.presentations) {
            const $ = cheerio.load(data.presentations, { decodeEntities: false });
            const arr = [];
            $('img, table, tbody, tr, td, th, style, script, iframe, object, embed, form, input, button, video, audio, figure, figcaption').remove();
            $('a').each((i, el) => {
                const name = $(el).text().trim();
                const href = $(el).attr('href');
                if (name) {
                    if (href && /^https?:\/\/azbyka\.ru/.test(href)) arr.push(`• <a href="${href}">${name}</a>`);
                    else if (href && href.startsWith('/')) arr.push(`• <a href="https://azbyka.ru${href}">${name}</a>`);
                    else arr.push(`• ${name}`);
                }
            });
            if (arr.length) saints = arr;
        }
    } catch (e) { saints = []; }

    if (!saints.length) saints = getSaintsForDate(dateObj.getMonth() + 1, dateObj.getDate()).map(s => `• ${s}`);

    const oldStyle = getOldStyleDate(dateObj);
    const fasting = getFastingInfo(dateObj, getOrthodoxPaschaDate(year));

    let text = `<b>📅 ЦЕРКОВНЫЙ КАЛЕНДАРЬ</b>\n`;
    text += `<i>Старый стиль: ${oldStyle.getDate()}.${String(oldStyle.getMonth() + 1).padStart(2, '0')}, Новый стиль: ${day}.${month} (${weekday})</i>\n`;
    text += `────────────────────\n\n`;
    text += `<b>📜 Седмица и период:</b> ${fasting.week}\n`;
    text += `<b>Период:</b> ${fasting.period}\n`;
    text += `<b>🥗 Пост / Трапеза:</b> ${fasting.fastType} (${fasting.fastText})\n\n`;
    if (saints.length) {
        text += `<b>🕯 Святые дня:</b>\n${saints.join('\n')}\n\n`;
    } else {
        text += `<b>🕯 Святые дня:</b> информация отсутствует\n\n`;
    }
    text += `📖 <a href="${azLink}">Жития, иконы и чтения дня</a>`;


    const prevDate = new Date(dateObj);
    prevDate.setDate(dateObj.getDate() - 1);
    const nextDate = new Date(dateObj);
    nextDate.setDate(dateObj.getDate() + 1);
    const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
    const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
    const kb = Markup.inlineKeyboard([
        [
            Markup.button.callback('⬅️ Вчера', `calendar_prev_${prevStr}`),
            Markup.button.callback('Завтра ➡️', `calendar_next_${nextStr}`)
        ],
        [Markup.button.url('☦️ Открыть Азбуку Веры', azLink)],
        [Markup.button.callback('🏠 В главное меню', 'start_over')]
    ]);

    try {
        if (isEdit && ctx.editMessageText) {
            await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
        } else {
            await ctx.replyWithHTML(text, kb);
        }
    } catch (e) {
        try { await ctx.reply('Произошла ошибка при отправке календаря.'); } catch {}
    }
}


async function safeMassSend(bot, ids, sendFunc, pauseMs = 200) {
    for (const id of ids) {
        try {
            await sendFunc(id);
        } catch (e) {

        }
        await new Promise(r => setTimeout(r, pauseMs));
    }
}


async function sendDailyCalendarToGroups() {
    console.log('📅 Началась рассылка календаря в группы...');
    await loadDBFromGist(); // обновляем список всех чатов
    await ensureAllChatsInDB();
    const ids = Object.keys(db);
    for (const id of ids) {
        try {
            // отправляем только в группы
            if (!db[id]?.isGroup) continue;
            const date = new Date(Date.now() + 3 * 60 * 60 * 1000);
            // Отправляем календарь без кнопок (extra)
            await sendDynamicCalendar({
                replyWithHTML: (text) => bot.telegram.sendMessage(id, text, {
                    parse_mode: 'HTML'
                })
            }, date);
        } catch (e) {
            console.log('❌ Ошибка отправки в:', id, e);
        }
    }
    console.log('✅ Календарь отправлен всем группам');
}