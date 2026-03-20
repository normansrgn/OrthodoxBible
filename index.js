require('dotenv').config();
const schedule = require('node-schedule');
const { Telegraf, Markup } = require('telegraf');
const { session } = require('telegraf');
const fs = require('fs');
const { createCanvas, registerFont } = require('canvas');
const path = require('path');
const https = require('https');

function getMoscowParts(date = new Date()) {
    // Используем реальный часовой пояс, без ручного "+3 часа"
    const dtf = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long'
    });
    const parts = dtf.formatToParts(date);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        weekday: map.weekday
    };
}

function toMoscowNoonDate(year, month, day) {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    // Полдень по Москве, чтобы исключить пограничные эффекты около полуночи
    return new Date(`${year}-${mm}-${dd}T12:00:00+03:00`);
}

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


if (!token) {
    console.error('❌ Переменная окружения BOT_TOKEN не установлена. Укажите токен бота в BOT_TOKEN.');
    process.exit(1);
}

const bot = new Telegraf(token);
bot.use(session());
const DATA_FILE = './users_data.json';
const { checkGistAccess, loadDbFromGist, saveDbToGist } = require('./gistDb');

// --- БАЗА ДАННЫХ ---
let db = {};
let gistOk = false;
let gistSaveTimer = null;
let gistSaveInFlight = false;
let gistSaveQueued = false;
let lastDBLoadLogAt = 0;
let dbInitPromise = null;
const loadDB = () => {
    if (fs.existsSync(DATA_FILE)) {
        try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { db = {}; }
    } else {
        db = {};
    }
};

const saveDB = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

function logDBLoaded(reason) {
    // анти-спам: не чаще 1 раза в 60 секунд
    const now = Date.now();
    if (now - lastDBLoadLogAt < 60_000) return;
    lastDBLoadLogAt = now;

    const userCount = Object.keys(db).filter((k) => k !== '__groups').length;
    const groupCount =
        db.__groups && typeof db.__groups === 'object'
            ? Object.keys(db.__groups).length
            : 0;
    console.log(`📦 DB loaded (${reason}): users=${userCount}, groups=${groupCount}`);
}

function logDBLoadedForce(reason) {
    // без анти-спама, чтобы было видно итог после загрузки с Gist
    const userCount = Object.keys(db).filter((k) => k !== '__groups').length;
    const groupCount =
        db.__groups && typeof db.__groups === 'object'
            ? Object.keys(db.__groups).length
            : 0;
    console.log(`📦 DB loaded (${reason}): users=${userCount}, groups=${groupCount}`);
}

function scheduleGistSave(reason = 'update') {
    if (!gistOk) return;
    if (gistSaveTimer) clearTimeout(gistSaveTimer);
    gistSaveTimer = setTimeout(async () => {
        gistSaveTimer = null;
        if (gistSaveInFlight) {
            gistSaveQueued = true;
            return;
        }
        gistSaveInFlight = true;
        try {
            await saveDbToGist(db);
            console.log(`☁️ Gist saved (${reason})`);
        } catch (e) {
            console.error('❌ Ошибка сохранения в Gist:', e?.message || e);
            gistOk = false; // чтобы не спамить ошибками
        } finally {
            gistSaveInFlight = false;
            if (gistSaveQueued) {
                gistSaveQueued = false;
                scheduleGistSave('queued');
            }
        }
    }, 1500);
}

const ensureUserProfile = (from) => {
    if (!from || !from.id) return;
    const id = from.id;
    if (!db[id]) {
        db[id] = { bookmark: null, isSearching: false };
    }
    const user = db[id];
    // сохраняем базовую информацию о пользователе для админки
    if (from.first_name) user.first_name = from.first_name;
    if (from.last_name) user.last_name = from.last_name;
    if (from.username) user.username = from.username;
};

const initUser = (id) => {
    if (!db[id]) db[id] = { bookmark: null, isSearching: false };
};

async function initDbFromGistOrLocal() {
    // Всегда пытаемся взять БД из Gist (источник правды)
    try {
        gistOk = await checkGistAccess();
        if (gistOk) {
            const remote = await loadDbFromGist();
            if (remote && typeof remote === 'object') {
                db = remote;
                saveDB(); // локальный кэш на крайний случай
                console.log('☁️ Gist loaded: local cache updated');
                logDBLoadedForce('gist');
                return;
            }
        }
        // Если Gist недоступен/пуст — fallback на локальный файл
        console.warn('⚠️ Gist недоступен, fallback на локальный users_data.json');
        gistOk = false;
        loadDB();
        logDBLoadedForce('local_fallback');
    } catch (e) {
        console.error('⚠️ Ошибка инициализации БД из Gist, fallback на локальный файл:', e?.message || e);
        gistOk = false;
        loadDB();
        logDBLoadedForce('local_fallback');
    }
}

// Запускаем инициализацию БД сразу (и дальше будем await-ить перед обработкой апдейтов)
dbInitPromise = initDbFromGistOrLocal();

// --- ОТСЛЕЖИВАНИЕ ГРУПП И ПОЛЬЗОВАТЕЛЕЙ ---
bot.use(async (ctx, next) => {
    try {
        if (dbInitPromise) {
            await dbInitPromise;
        }
        loadDB();
        logDBLoaded('update');
        if (ctx.from) {
            ensureUserProfile(ctx.from);
        }
        if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
            if (!db.__groups || typeof db.__groups !== 'object') {
                db.__groups = {};
            }
            const chatId = ctx.chat.id;
            if (!db.__groups[chatId]) {
                db.__groups[chatId] = {
                    title: ctx.chat.title || 'Группа',
                    type: ctx.chat.type,
                    members: {}
                };
            } else {
                // обновляем название, если оно изменилось
                if (ctx.chat.title) {
                    db.__groups[chatId].title = ctx.chat.title;
                }
            }
            if (ctx.from && ctx.from.id) {
                const uid = ctx.from.id;
                const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || null;
                db.__groups[chatId].members[uid] = {
                    name,
                    username: ctx.from.username || null
                };
            }
        }
        saveDB();
        scheduleGistSave('ctx_update');
    } catch (e) {
        // игнорируем ошибки логирования групп
    }
    // В группах/каналах не показываем "нижние кнопки" (reply keyboard) и вообще не обрабатываем команды/меню.
    // Разрешаем только сервисные апдейты (например, добавление/удаление бота), чтобы учёт групп работал.
    const isServiceUpdate = ctx.updateType === 'my_chat_member' || ctx.updateType === 'chat_member';
    const isPrivateChat = ctx.chat?.type === 'private';
    if (!isPrivateChat && !isServiceUpdate) return;

    return next();
});

// --- ЛОГ: ДОБАВЛЕНИЕ БОТА В ГРУППУ ---
bot.on('my_chat_member', async (ctx) => {
    try {
        const upd = ctx.myChatMember;
        if (!upd || !ctx.chat) return;
        const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
        if (!isGroup) return;

        const oldStatus = upd.old_chat_member?.status;
        const newStatus = upd.new_chat_member?.status;
        const isMemberFlag = upd.new_chat_member?.is_member;

        // Telegram иногда добавляет бота как restricted (с is_member=true).
        const isNowInChat =
            ['member', 'administrator'].includes(newStatus) ||
            (newStatus === 'restricted' && isMemberFlag === true);

        const wasOutOfChat =
            !oldStatus || ['left', 'kicked'].includes(oldStatus) ||
            (oldStatus === 'restricted' && upd.old_chat_member?.is_member === false);

        const becameMember = isNowInChat && wasOutOfChat;

        if (!becameMember) return;

        // Обновляем локальную БД групп и ставим флаг приветствия (чтобы не дублировать)
        try {
            loadDB();
            if (!db.__groups || typeof db.__groups !== 'object') db.__groups = {};
            const chatId = String(ctx.chat.id);
            if (!db.__groups[chatId]) {
                db.__groups[chatId] = { title: ctx.chat.title || 'Группа', type: ctx.chat.type, members: {} };
            }
            db.__groups[chatId].title = ctx.chat.title || db.__groups[chatId].title || 'Группа';
            db.__groups[chatId].type = ctx.chat.type || db.__groups[chatId].type;
            const now = Date.now();
            const alreadyWelcomedRecently =
                db.__groups[chatId].welcomeSentAt && now - db.__groups[chatId].welcomeSentAt < 60_000;
            if (!alreadyWelcomedRecently) {
                db.__groups[chatId].welcomeSentAt = now;
            }
            saveDB();
            scheduleGistSave('group_join');

            if (!alreadyWelcomedRecently) {
                const text =
                    `☦️ <b>Мир вашему дому, братия и сестры!</b>\n\n` +
                    `Благодарю за приглашение в этот чат.\n\n` +
                    `Я — православный помощник, созданный для:\n` +
                    `• чтения Священного Писания 📖\n` +
                    `• молитвенного правила 🙏\n` +
                    `• церковного календаря 📅\n\n` +
                    `🕊 Для полноценного использования откройте меня в личных сообщениях.\n\n` +
                    `Да благословит вас Господь!`;

                await ctx.replyWithHTML(text).catch(() => {});
            }
        } catch (e) {
            console.error('❌ Ошибка приветствия в группе:', e?.message || e);
        }

        console.log(
            '➕ Bot added/returned to group:',
            ctx.chat.title,
            'id',
            ctx.chat.id,
            'by',
            ctx.from?.id,
            ctx.from?.username ? `(@${ctx.from.username})` : ''
        );
    } catch (e) {
        // ignore
    }
});

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

// Локальный массив с примерами памятей святых (можно расширить)
const ORTHODOX_CALENDAR = [
    // Пример: 7 января, Рождество Христово
    { month: 1, day: 7, saints: ['Рождество Господа Бога и Спаса нашего Иисуса Христа'] },
    { month: 1, day: 19, saints: ['Святое Богоявление (Крещение Господне)'] },
    { month: 4, day: 7, saints: ['Благовещение Пресвятой Богородицы'] },
    { month: 8, day: 19, saints: ['Преображение Господне'] },
    { month: 8, day: 28, saints: ['Успение Пресвятой Богородицы'] },
    { month: 9, day: 21, saints: ['Рождество Пресвятой Богородицы'] },
    { month: 9, day: 27, saints: ['Воздвижение Честного и Животворящего Креста Господня'] },
    { month: 12, day: 4, saints: ['Введение во храм Пресвятой Богородицы'] },
    // ... можно добавить больше памятей
];

// Вычисление даты Пасхи (православная Пасха, алгоритм для Юлианского календаря, сдвиг на 13 дней для Григорианского)
function getOrthodoxPaschaDate(year) {
    // Алгоритм Остроградского (Meeus/Jones/Butcher)
    const a = year % 19;
    const b = year % 4;
    const c = year % 7;
    const d = (19 * a + 15) % 30;
    const e = (2 * b + 4 * c + 6 * d + 6) % 7;
    const julianPascha = new Date(Date.UTC(year, 2, 22 + d + e)); // март (2) + дни
    // Переводим в григорианский календарь (добавляем 13 дней для XXI века)
    julianPascha.setUTCDate(julianPascha.getUTCDate() + 13);
    return new Date(julianPascha.getUTCFullYear(), julianPascha.getUTCMonth(), julianPascha.getUTCDate());
}

// Определение дня недели
const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

// Определение седмицы, постов, трапезы и периода
function getFastingInfo(date, paschaDate) {
    // Великий пост: за 48 дней до Пасхи (Чистый понедельник), 7 недель
    const greatLentStart = new Date(paschaDate);
    greatLentStart.setDate(greatLentStart.getDate() - 48);
    const greatLentEnd = new Date(paschaDate);
    greatLentEnd.setDate(greatLentEnd.getDate() - 2); // до Великой субботы

    // Строгий пост: среда и пятница (кроме сплошных седмиц и праздничных дней)
    // Петров пост: от понедельника через неделю после Троицы до 12 июля (Петра и Павла)
    const pentecost = new Date(paschaDate);
    pentecost.setDate(paschaDate.getDate() + 49);
    const petrovPostStart = new Date(pentecost);
    petrovPostStart.setDate(pentecost.getDate() + 1);
    const petrovPostEnd = new Date(date.getFullYear(), 6, 12); // 12 июля

    // Успенский пост: 14–27 августа
    const uspenskyPostStart = new Date(date.getFullYear(), 7, 14);
    const uspenskyPostEnd = new Date(date.getFullYear(), 7, 27);

    // Рождественский пост: 28 ноября – 6 января
    const christmasFastStart = new Date(date.getFullYear(), 10, 28);
    const christmasFastEnd = new Date(date.getFullYear() + 1, 0, 6);

    // Сплошные седмицы (нет поста)
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

    // Проверки
    let fastType = '';
    let fastText = '';
    let period = '';
    let week = '';

    // Пасха
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

    // Светлая седмица
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

    // Великий пост
    if (date >= greatLentStart && date <= greatLentEnd) {
        period = 'Великий пост';
        // Номер седмицы Великого поста
        const daysFromStart = Math.floor((date - greatLentStart) / (1000 * 60 * 60 * 24));
        const sedmitsaNum = Math.floor(daysFromStart / 7) + 1;
        week = `${sedmitsaNum}-я седмица Великого поста`;
        // Постная трапеза
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

    // Петров пост
    if (petrovPostStart <= date && date <= petrovPostEnd) {
        period = 'Петров пост';
        // Считаем седмицу от начала поста
        const daysFromStart = Math.floor((date - petrovPostStart) / (1000 * 60 * 60 * 24));
        const sedmitsaNum = Math.floor(daysFromStart / 7) + 1;
        week = `${sedmitsaNum}-я седмица Петрова поста`;
        // Постная трапеза
        if (date.getDay() === 0 || date.getDay() === 6) {
            fastType = 'Послабление в пище (сб/вс)';
            fastText = 'Разрешается рыба, растительное масло, вино';
        } else {
            fastType = 'Пост';
            fastText = 'Пища без мяса, молока, яиц';
        }
        return { period, week, fastType, fastText };
    }

    // Успенский пост
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

    // Рождественский пост
    if ((date >= christmasFastStart && date.getMonth() === 10) || (date <= christmasFastEnd && date.getMonth() === 0)) {
        period = 'Рождественский пост';
        // Номер седмицы считаем с 28 ноября
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

    // Сплошные седмицы
    if ((date >= svjatkiStart && date <= svjatkiEnd) ||
        (date >= maslenitsaStart && date <= maslenitsaEnd) ||
        (date >= radonitsaStart && date <= radonitsaEnd)) {
        period = 'Сплошная седмица';
        week = 'Нет поста';
        fastType = 'Поста нет';
        fastText = 'Поста нет';
        return { period, week, fastType, fastText };
    }

    // Обычные дни: пост по средам и пятницам
    if (date.getDay() === 3 || date.getDay() === 5) { // среда (3), пятница (5)
        period = 'Обычный день';
        week = 'Постный день';
        fastType = 'Пост (среда/пятница)';
        fastText = 'Пища без мяса, молока, яиц';
        return { period, week, fastType, fastText };
    }

    // Обычный день, нет поста
    period = 'Обычный день';
    week = 'Нет поста';
    fastType = 'Поста нет';
    fastText = 'Поста нет';
    return { period, week, fastType, fastText };
}

// Старый стиль (юлианский календарь)
function getOldStyleDate(date) {
    const oldDate = new Date(date);
    oldDate.setDate(date.getDate() - 13);
    return oldDate;
}

// Получить список святых дня из массива ORTHODOX_CALENDAR (локальный fallback)
function getSaintsForDate(month, day) {
    const found = ORTHODOX_CALENDAR.find(x => x.month === month && x.day === day);
    return found ? found.saints : [];
}

// Главная функция календаря
const cheerio = require('cheerio'); // не забудьте npm install cheerio

// Исправленная функция для получения календаря с корректным парсом "Святые дня"
async function getDetailedCalendar() {
    const p = getMoscowParts(new Date());
    const year = p.year;
    const month = p.month;
    const day = p.day;
    const weekday = p.weekday
        ? p.weekday[0].toUpperCase() + p.weekday.slice(1)
        : WEEKDAYS[new Date().getDay()];
    const now = toMoscowNoonDate(year, month, day);
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
            // Парсим только список святых, удаляя запрещённые теги Telegram
            // Оставляем только <a>, <b>, <i>, <u>, <s>, <code>, <pre>, <span>
            // (но используем только <a> для святых)
            const $ = cheerio.load(data.presentations, { decodeEntities: false });
            const arr = [];
            // Удаляем фото, таблицы, картинки и запрещённые теги
            $('img, table, tbody, tr, td, th, style, script, iframe, object, embed, form, input, button, video, audio, figure, figcaption').remove();
            // Собираем только <a> с именами святых
            $('a').each((i, el) => {
                // Проверяем, что ссылка не пуста и текст не пустой
                const name = $(el).text().trim();
                const href = $(el).attr('href');
                if (name) {
                    // Только ссылки на жития (azbyka.ru) или просто имя
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
    // Если API не вернул данные, используем локальный fallback
    if (!saints.length) {
        saints = getSaintsForDate(month, day).map(s => `• ${s}`);
    }
    // Старый стиль
    const oldStyle = getOldStyleDate(now);
    // Пост, седмица, период — локальные вычисления
    const fasting = getFastingInfo(now, getOrthodoxPaschaDate(year));
    // Формируем текст
    let text = `<b>📅 ЦЕРКОВНЫЙ КАЛЕНДАРЬ</b>\n`;
    text += `<i>Старый стиль: ${oldStyle.getDate()}.${String(oldStyle.getMonth() + 1).padStart(2, '0')}, Новый стиль: ${day}.${String(month).padStart(2, '0')} (${weekday})</i>\n`;
    text += `────────────────────\n\n`;
    text += `<b>📜 Седмица и период:</b> ${fasting.week}\n`;
    text += `<b>Период:</b> ${fasting.period}\n`;
    text += `<b>🥗 Пост / Трапеза:</b> ${fasting.fastType} (${fasting.fastText})\n\n`;
    // Святые дня
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
    loadDB();
    console.log(
        '▶️ /start from',
        ctx.from?.id,
        ctx.from?.username ? `(@${ctx.from.username})` : '',
        'chat',
        ctx.chat?.id,
        ctx.chat?.type
    );
    ensureUserProfile(ctx.from);
    // Всегда храним пользователей по их user id, а не по chat id
    initUser(ctx.from.id);
    saveDB();
    scheduleGistSave('start');
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

// --- Динамический календарь с кнопками Вчера/Завтра ---
bot.hears('Календарь', async (ctx) => {
    await sendDynamicCalendar(ctx);
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

    // --- ПРИОРИТЕТ КАК В YOUVERSION ---
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

    // защита от обрыва мысли
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

    await ctx.replyWithHTML(
        `<b>☦️ ДУХОВНОЕ НАСТАВЛЕНИЕ</b>\n\n<blockquote>${text}</blockquote>\n\n📍 <b>${ref}</b>`,
        Markup.inlineKeyboard([

            [Markup.button.callback('📖 Открыть главу', `read_${book.BookId}_${chapter.ChapterId}`)]
        ])
    );

});

bot.hears('Псалтирь', (ctx) => {
    const buttons = PSALMS_CATEGORIES.map((cat, idx) => [Markup.button.callback(cat.name, `ps_cat_${idx}`)]);
    ctx.replyWithHTML(`<b>Псалтирь на всякую потребу</b>`, Markup.inlineKeyboard(buttons));
});

bot.hears('Закладка', (ctx) => {
    const b = db[ctx.from.id]?.bookmark;
    if (b) return sendChapter(ctx, b.bId, b.cId, false);
    ctx.replyWithHTML(`<b>🔖 Закладок пока нет.</b>`);
});

bot.hears('Поиск', (ctx) => {
    loadDB();
    ensureUserProfile(ctx.from);
    initUser(ctx.from.id);
    db[ctx.from.id].isSearching = true;
    saveDB();
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

// --- ОБРАБОТКА ТЕКСТА ДЛЯ ПОИСКА ---
bot.on('text', async (ctx, next) => {
    // Проверяем, что это не меню
    const menuButtons = ['📖 Библия', '📜 Закон Божий', 'Молитвослов', 'Календарь', 'Поиск', 'Чтение писания', 'Случайный стих', 'Псалтирь', 'Закладка', '⬅️ Главное меню'];
    if (menuButtons.includes(ctx.message.text)) {
        return next();
    }

    loadDB();
    ensureUserProfile(ctx.from);
    initUser(ctx.from.id);
    // Если пользователь НЕ в режиме поиска, пропускаем дальше
    if (!db[ctx.from.id].isSearching) {
        return next();
    }

    // Сохраняем введённый запрос для последующего поиска
    db[ctx.from.id].lastSearchQuery = ctx.message.text;
    saveDB();

    // Просим пользователя нажать кнопку "Поиск"
    await ctx.replyWithHTML("🔎 <b>Теперь нажмите кнопку «Поиск» ниже для выполнения поиска.</b>",
        Markup.inlineKeyboard([
            [Markup.button.callback('🔎 Поиск', 'do_bible_search')],
            [Markup.button.callback('🏠 В главное меню', 'start_over')]
        ])
    );

    return next();
});

// --- КНОПКА "ПОИСК" ДЛЯ ЗАПУСКА ПОИСКА В БИБЛИИ ---
bot.action('do_bible_search', async (ctx) => {
    const userId = ctx.from.id;
    loadDB();
    ensureUserProfile(ctx.from);
    initUser(userId);
    // Проверяем, был ли введён запрос
    const q = db[userId].lastSearchQuery ? db[userId].lastSearchQuery.trim().toLowerCase() : '';
    if (!q || q.length < 3) {
        db[userId].isSearching = false;
        saveDB();
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
    saveDB();

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

bot.telegram.deleteWebhook().then(() => {
    bot.launch().then(async () => {
        console.log('☦️ Бот запущен');
        // Тестовый однократный запуск задач при старте
        await runScheduledTasksNow();
    });
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


// ⏰ Каждый день в 10:00 по Москве
schedule.scheduleJob(
    { tz: 'Europe/Moscow', hour: 14, minute: 0 },
    sendDailyCalendarToGroups
);

// --- SCHEDULED TASKS ---
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

/**
 * Отправляет мысль дня свт. Феофана Затворника всем пользователям из базы.
 * Получает HTML от API, разворачивает все теги кроме разрешённых (<a>, <b>, <i>, <u>, <s>, <code>, <pre>),
 * декодирует HTML entities, формирует сообщение с заголовком, датой и содержимым блока <blockquote>,
 * и отправляет всем пользователям.
 */
async function sendTheophanMessage() {
    // 1. Формируем дату и URL API
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const url = `https://azbyka.ru/days/api/thoughts-st-theophan/${dateStr}.json`;

    // 2. Получаем мысль дня через API
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

    // 3. Если мысли нет — ничего не отправляем
    if (!apiData || !apiData.text || typeof apiData.text !== 'string' || !apiData.text.trim()) {
        return;
    }

    // 4. Декодируем HTML entities
    const he = require('he');
    let htmlText = he.decode(apiData.text);

    // 5. Очищаем HTML
    const cheerio = require('cheerio');
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

    const message =
        `<b>Мысль дня от святителя Феофана Затворника</b>\n\n` +
        `<blockquote>${blockContent}</blockquote>`;

    // 6. Рассылаем ВСЕМ пользователям И группам из базы
    const allIds = [];
    
    // Добавляем пользователей (числовые id)
    for (const key of Object.keys(db)) {
        if (key !== '__groups' && !isNaN(Number(key))) {
            allIds.push(Number(key));
        }
    }
    
    // Добавляем группы (chat id могут быть отрицательными)
    if (db.__groups && typeof db.__groups === 'object') {
        for (const groupId of Object.keys(db.__groups)) {
            const numId = Number(groupId);
            if (!isNaN(numId)) {
                allIds.push(numId);
            }
        }
    }
    
    // Убираем дубликаты
    const uniqueIds = [...new Set(allIds)];
    
    console.log(`📤 Отправка мысли дня ${uniqueIds.length} получателям...`);
    
    // Отправляем с паузой
    for (const id of uniqueIds) {
        try {
            await bot.telegram.sendMessage(id, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            await new Promise(r => setTimeout(r, 200)); // пауза 200мс
        } catch (e) {
            // Игнорируем ошибки отправки (бот заблокирован, чат удален и т.д.)
        }
    }
    
    console.log('✅ Мысль дня отправлена всем получателям');
}

// Каждый день в 11:00 по серверному времени
schedule.scheduleJob('40 12 * * *', sendTheophanMessage);


// Динамический календарь с кнопками «Вчера»/«Завтра»
// Новый обработчик календаря: показывает только один день, безопасная обработка ошибок, кнопки для навигации
bot.hears('Календарь', async (ctx) => {
    await sendDynamicCalendar(ctx);
});

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

async function sendDynamicCalendar(ctx, dateObj, isEdit = false, showButtons = true) {
    // Используем московское время по умолчанию (Europe/Moscow)
    if (!dateObj) {
        dateObj = new Date();
    }
    const p = getMoscowParts(dateObj);
    const year = p.year;
    const month = String(p.month).padStart(2, '0');
    const day = String(p.day).padStart(2, '0');
    const weekday = p.weekday
        ? p.weekday[0].toUpperCase() + p.weekday.slice(1)
        : WEEKDAYS[dateObj.getDay()];
    const azLink = `https://azbyka.ru/days/${year}-${month}-${day}`;

    // Получаем святых дня через API (безопасно)
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

    if (!saints.length) saints = getSaintsForDate(p.month, p.day).map(s => `• ${s}`);

    const moscowNoon = toMoscowNoonDate(year, Number(month), Number(day));
    const oldStyle = getOldStyleDate(moscowNoon);
    const fasting = getFastingInfo(moscowNoon, getOrthodoxPaschaDate(year));

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

    // ВАЖНО: кнопки создаем ТОЛЬКО если showButtons === true
    let kb = null;
    if (showButtons === true) {
        const prevDate = new Date(moscowNoon);
        prevDate.setDate(prevDate.getDate() - 1);
        const nextDate = new Date(moscowNoon);
        nextDate.setDate(nextDate.getDate() + 1);
        const prevP = getMoscowParts(prevDate);
        const nextP = getMoscowParts(nextDate);
        const prevStr = `${prevP.year}-${String(prevP.month).padStart(2, '0')}-${String(prevP.day).padStart(2, '0')}`;
        const nextStr = `${nextP.year}-${String(nextP.month).padStart(2, '0')}-${String(nextP.day).padStart(2, '0')}`;
        kb = Markup.inlineKeyboard([
            [
                Markup.button.callback('⬅️ Вчера', `calendar_prev_${year}-${month}-${day}`),
                Markup.button.callback('Завтра ➡️', `calendar_next_${year}-${month}-${day}`)
            ],
            [Markup.button.url('☦️ Открыть Азбуку Веры', azLink)],
            [Markup.button.callback('🏠 В главное меню', 'start_over')]
        ]);
    }

    try {
        if (isEdit && ctx.editMessageText) {
            // Если редактируем сообщение
            if (kb) {
                await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
            } else {
                await ctx.editMessageText(text, { parse_mode: 'HTML' });
            }
        } else {
            // Если отправляем новое сообщение
            if (kb) {
                await ctx.replyWithHTML(text, kb);
            } else {
                await ctx.replyWithHTML(text);
            }
        }
    } catch (e) {
        try { 
            if (!kb) {
                await ctx.replyWithHTML(text);
            } else {
                await ctx.reply('Произошла ошибка при отправке календаря.');
            }
        } catch {}
    }
}

// Универсальная безопасная функция массовой рассылки с паузой между отправками (200 мс)
async function safeMassSend(bot, ids, sendFunc, pauseMs = 200) {
    for (const id of ids) {
        try {
            await sendFunc(id);
        } catch (e) {
            // Можно логировать ошибку отправки пользователю
        }
        await new Promise(r => setTimeout(r, pauseMs));
    }
}



// --- ПОДКЛЮЧЕНИЕ АДМИН-ПАНЕЛИ ---
const adminPanel = require('./admin');
adminPanel(bot);


async function sendDailyCalendarToGroups() {
    console.log('📅 Началась рассылка календаря в группы...');
    // обновляем список всех чатов из Gist (если доступно), без падения джобы
    if (gistOk) {
        try {
            const remote = await loadDbFromGist();
            if (remote && typeof remote === 'object') {
                db = remote;
                saveDB(); // обновим локальный кэш
                logDBLoadedForce('gist_refresh');
            }
        } catch (e) {
            console.warn('⚠️ Не удалось обновить БД из Gist перед рассылкой:', e?.message || e);
        }
    } else {
        // на случай если Gist недоступен — убеждаемся, что локальная БД загружена
        loadDB();
    }
    const groups = db.__groups && typeof db.__groups === 'object' ? db.__groups : {};
    const ids = Object.keys(groups);
    for (const id of ids) {
        try {
            const date = new Date();
            // Создаем объект-эмулятор контекста с нужными методами
            const mockCtx = {
                chat: { id: id },
                replyWithHTML: async (text, extra) => {
                    await bot.telegram.sendMessage(id, text, {
                        parse_mode: 'HTML',
                        ...extra
                    });
                },
                editMessageText: null, // для групп не нужно
                reply: async (text) => {
                    await bot.telegram.sendMessage(id, text);
                }
            };
            // ВАЖНО: передаем false как 4-й параметр (showButtons)
            await sendDynamicCalendar(mockCtx, date, false, false);
        } catch (e) {
            console.log('❌ Ошибка отправки в группу:', id, e?.message || e);
        }
    }
    console.log('✅ Календарь отправлен всем группам');
}