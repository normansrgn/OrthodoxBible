const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { loadDbFromGist } = require('./gistDb');

const ADMIN_IDS = [481356531];

const STYLE = {
    header: '<b>┌───────────────────┐</b>',
    footer: '<b>└───────────────────┘</b>',
    sep: '<b>├───────────────────┤</b>',
    bullet: '<b>📍</b>'
};

const DB_PATH = path.resolve(__dirname, 'users_data.json');
let db = {};

function loadDBLocal() {
    try {
        if (fs.existsSync(DB_PATH)) {
            db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        } else {
            db = {};
        }
    } catch (e) {
        db = {};
    }
}

async function loadDB() {
    // 1) пробуем Gist, если настроено
    const hasGistConfig = !!(process.env.GIST_ID && process.env.GITHUB_TOKEN);
    if (hasGistConfig) {
        try {
            const remote = await loadDbFromGist();
            if (remote && typeof remote === 'object') {
                db = remote;
                return;
            }
        } catch (e) {
            // упали на Gist — идём в локальный файл
        }
    }
    // 2) fallback на локальный файл
    loadDBLocal();
}

function getUsers() {
    return Object.entries(db)
        .filter(([id]) => {
            if (id === '__groups') return false;
            // user_id у Telegram всегда положительный, отрицательные — это чаты/группы (старые записи)
            if (String(id).startsWith('-')) return false;
            return true;
        });
}

function getGroups() {
    return db.__groups && typeof db.__groups === 'object'
        ? db.__groups
        : {};
}

function isAdmin(ctx) {
    return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

function formatUser(user, id) {
    const name =
        user.name ||
        [user.first_name, user.last_name].filter(Boolean).join(' ') ||
        'Странник';
    const username = user.username ? `(@${user.username})` : '';
    return `${name} ${username}\n└ <code>${id}</code>`;
}

function clampPage(page, pageCount) {
    const p = Number.isFinite(page) ? page : 0;
    if (p < 0) return 0;
    if (p >= pageCount) return Math.max(0, pageCount - 1);
    return p;
}

function renderUsersPage(entries, page, limit) {
    const total = entries.length;
    const pageCount = Math.max(1, Math.ceil(total / limit));
    const p = clampPage(page, pageCount);
    const start = p * limit;
    const slice = entries.slice(start, start + limit);

    const list = slice
        .map(([id, info], i) => `<b>${start + i + 1}.</b> ${formatUser(info, id)}`)
        .join('\n\n');

    const text =
        `${STYLE.header}\n` +
        `<b>    👥 СПИСОК ПОЛЬЗОВАТЕЛЕЙ</b>\n` +
        `${STYLE.sep}\n` +
        `${list || '<i>База пуста</i>'}\n` +
        `${STYLE.sep}\n` +
        `📄 <i>Страница ${p + 1}/${pageCount}. Всего: ${total}</i>\n` +
        `${STYLE.footer}`;

    return { text, page: p, pageCount };
}

function adminPanel(bot) {
    const sendMain = async (ctx, edit = false) => {
        await loadDB();
        const users = getUsers();
        const groups = getGroups();

        const userCount = users.length;
        const groupCount = Object.keys(groups).length;

        const text =
            `${STYLE.header}\n` +
            `<b>    ⛪️ ГЛАВНЫЙ СОБОР</b>\n` +
            `${STYLE.sep}\n` +
            `<b>Статус:</b> <code>Активен 🟢</code>\n` +
            `<b>Паства:</b> <code>${userCount} душ</code>\n` +
            `<b>Группы:</b> <code>${groupCount}</code>\n` +
            `${STYLE.sep}\n` +
            `<i>Управление системой:</i>\n` +
            `${STYLE.footer}`;

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('👥 Прихожане', 'admin_users'),
                Markup.button.callback('👥 Группы', 'admin_groups')
            ],
            [
                Markup.button.callback('📊 Статы', 'admin_stats'),
                Markup.button.callback('📨 Вещание', 'admin_broadcast')
            ],
            [Markup.button.callback('📥 Скачать базу', 'admin_download')],
            [
                Markup.button.callback('🔄 Обновить', 'admin_refresh'),
                Markup.button.callback('❌ Выход', 'admin_close')
            ]
        ]);

        if (edit) {
            return ctx
                .editMessageText(text, { parse_mode: 'HTML', ...keyboard })
                .catch(() => {});
        }
        return ctx.replyWithHTML(text, keyboard);
    };

    // Команда /admin — всегда открывает панель, чтобы она точно срабатывала
   bot.command('admin', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('⛔️ У тебя нет доступа');
    }

    return sendMain(ctx);
});

    bot.action('admin_users', async (ctx) => {
        if (!isAdmin(ctx)) return;
        await loadDB();
        const entries = getUsers().reverse();
        const limit = 15;
        const { text, page, pageCount } = renderUsersPage(entries, 0, limit);

        const nav = [];
        if (pageCount > 1) {
            nav.push(Markup.button.callback('⬅️', `admin_users_page_${page - 1}`));
            nav.push(Markup.button.callback('➡️', `admin_users_page_${page + 1}`));
        }

        await ctx
            .editMessageText(text, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    nav.length ? nav : [],
                    [Markup.button.callback('📥 Скачать JSON', 'admin_download')],
                    [Markup.button.callback('⬅️ Назад в меню', 'admin_back')]
                ].filter((row) => row.length))
            })
            .catch(() => ctx.answerCbQuery('Ошибка отображения'));
    });

    bot.action(/admin_users_page_(\-?\d+)/, async (ctx) => {
        if (!isAdmin(ctx)) return;
        await loadDB();
        const entries = getUsers().reverse();
        const limit = 15;
        const requestedPage = Number(ctx.match[1]);
        const { text, page, pageCount } = renderUsersPage(entries, requestedPage, limit);

        const nav = [];
        if (pageCount > 1) {
            nav.push(Markup.button.callback('⬅️', `admin_users_page_${page - 1}`));
            nav.push(Markup.button.callback('➡️', `admin_users_page_${page + 1}`));
        }

        await ctx
            .editMessageText(text, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    nav.length ? nav : [],
                    [Markup.button.callback('📥 Скачать JSON', 'admin_download')],
                    [Markup.button.callback('⬅️ Назад в меню', 'admin_back')]
                ].filter((row) => row.length))
            })
            .catch(() => {});
    });

    bot.action('admin_groups', async (ctx) => {
        if (!isAdmin(ctx)) return;
        await loadDB();
        const groups = getGroups();
        
        // Получаем всех пользователей из БД (ключи - это ID пользователей)
        const allUserIds = Object.keys(db).filter(k => k !== '__groups');
        
        const entries = Object.entries(groups);
        if (!entries.length) {
            return ctx
                .editMessageText(
                    `${STYLE.header}\n<b>👥 ГРУППЫ</b>\n${STYLE.sep}\n<i>Бот ещё ни в одной группе.</i>\n${STYLE.footer}`,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('⬅️ Назад в меню', 'admin_back')]
                        ])
                    }
                )
                .catch(() => {});
        }

        const parts = entries.map(([chatId, info], index) => {
            const title = info.title || 'Без названия';
            const type = info.type || 'group';
            const groupMembers = info.members || {};
            const memberIds = Object.keys(groupMembers);
            
            // Фильтруем только тех участников, которые ЕСТЬ в БД пользователей
            const membersInDB = memberIds
                .filter(uid => allUserIds.includes(uid))
                .map((uid, i) => {
                    // Приоритет: данные из БД пользователя > данные из members группы
                    const userFromDB = db[uid];
                    const memberFromGroup = groupMembers[uid];
                    
                    const name = userFromDB?.name || 
                        [userFromDB?.first_name, userFromDB?.last_name].filter(Boolean).join(' ') ||
                        memberFromGroup?.name ||
                        'Неизвестный';
                    const username = userFromDB?.username || memberFromGroup?.username;
                    const usernameStr = username ? `(@${username})` : '';
                    
                    return `<i>${i + 1}.</i> ${name} ${usernameStr} — <code>${uid}</code>`;
                })
                .join('\n') || '<i>Нет пользователей из базы</i>';
            
            const membersInDBCount = memberIds.filter(uid => allUserIds.includes(uid)).length;
            const totalMembers = memberIds.length;

            return (
                `<b>${index + 1}. ${title}</b>\n` +
                `└ <code>ID: ${chatId}</code>\n` +
                `└ Тип: <code>${type}</code>\n` +
                `└ Участники в БД: <b>${membersInDBCount}</b> / ${totalMembers}\n` +
                `${membersInDB}`
            );
        });

        const totalGroups = entries.length;
        const totalMembersInDB = new Set(
            entries.flatMap(([, info]) => Object.keys(info.members || {}))
        ).size;

        const text =
            `${STYLE.header}\n` +
            `<b>    👥 ГРУППЫ С БОТОМ</b>\n` +
            `${STYLE.sep}\n` +
            `<b>Всего групп:</b> <code>${totalGroups}</code>\n` +
            `<b>Участников (уник.):</b> <code>${totalMembersInDB}</code>\n` +
            `${STYLE.sep}\n` +
            parts.join(`\n\n${STYLE.sep}\n`) +
            `\n${STYLE.footer}`;

        await ctx
            .editMessageText(text, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Назад в меню', 'admin_back')]
                ])
            })
            .catch(() => {});
    });

    bot.action('admin_download', async (ctx) => {
        if (!isAdmin(ctx)) return;
        await ctx.answerCbQuery('Подготовка выписки...');
        try {
            await loadDB();
            const tmpPath = path.resolve(__dirname, 'tmp_users_data.json');
            fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
            await ctx.replyWithDocument(
                { source: tmpPath, filename: 'users_database.json' },
                {
                    caption: `<b>📂 ПОЛНЫЙ СПИСОК ПАСТВЫ</b>\nВсего записей: <code>${
                        getUsers().length
                    }</code>`,
                    parse_mode: 'HTML'
                }
            );
            fs.unlinkSync(tmpPath);
        } catch (e) {
            await ctx.reply('❌ Ошибка при чтении файла БД.');
        }
    });

    bot.action(['admin_stats', 'admin_refresh'], async (ctx) => {
        if (!isAdmin(ctx)) return;
        await loadDB();
        const json = JSON.stringify(db);
        const size = Buffer.byteLength(json, 'utf8');
        const userCount = getUsers().length;
        const groupCount = Object.keys(getGroups()).length;

        const text =
            `${STYLE.header}\n` +
            `<b>    📊 АНАЛИТИКА БАЗЫ</b>\n` +
            `${STYLE.sep}\n` +
            `${STYLE.bullet} Всего душ: <b>${userCount}</b>\n` +
            `${STYLE.bullet} Групп: <b>${groupCount}</b>\n` +
            `${STYLE.bullet} Вес данных: <b>${(size / 1024).toFixed(2)} KB</b>\n` +
            `${STYLE.bullet} Последний вход: <b>${new Date().toLocaleTimeString()}</b>\n` +
            `${STYLE.sep}\n` +
            `<i>Данные актуальны.</i>\n` +
            `${STYLE.footer}`;

        await ctx
            .editMessageText(text, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Обновить', 'admin_refresh')],
                    [Markup.button.callback('⬅️ Назад', 'admin_back')]
                ])
            })
            .catch(() => {});
    });

    bot.action('admin_broadcast', async (ctx) => {
        if (!isAdmin(ctx)) return;
        await ctx.editMessageText(
            `📢 <b>РЕЖИМ ВЕЩАНИЯ</b>\n\nВведите текст сообщения для всех пользователей.\n\n<i>Отмена — кнопка ниже.</i>`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🚫 Отмена', 'admin_back')]
                ])
            }
        );
        ctx.session = { admin_mode: 'broadcast' };
    });

    bot.on('text', async (ctx, next) => {
        if (!isAdmin(ctx) || !ctx.session?.admin_mode) return next();
        const mode = ctx.session.admin_mode;
        const input = ctx.message.text;

        if (mode === 'broadcast' || mode === 'test') {
            const preview = `🔔 <b>ОПОВЕЩЕНИЕ</b>\n${STYLE.sep}\n${input}\n${STYLE.sep}`;
            if (mode === 'test') {
                ctx.session.admin_mode = null;
                return ctx.replyWithHTML(
                    `🧪 <b>ВИД:</b>\n\n${preview}`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ В меню', 'admin_back')]
                    ])
                );
            }
            ctx.session.broadcast_payload = preview;
            await ctx.replyWithHTML(
                `<b>⚠️ ПОДТВЕРДИТЕ:</b>\n\n${preview}`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '🚀 Начать рассылку',
                            'admin_send_confirm'
                        )
                    ],
                    [Markup.button.callback('❌ Отмена', 'admin_back')]
                ])
            );
        }
    });

    bot.action('admin_send_confirm', async (ctx) => {
        if (!isAdmin(ctx)) return;
        const text = ctx.session?.broadcast_payload;
        const users = getUsers();
        const ids = users.map(([id]) => id);
        await ctx.editMessageText('⌛ <b>Вещание начато...</b>', {
            parse_mode: 'HTML'
        });
        let count = 0;
        for (const id of ids) {
            try {
                await bot.telegram.sendMessage(id, text, {
                    parse_mode: 'HTML'
                });
                count++;
                await new Promise((r) => setTimeout(r, 40));
            } catch (e) {
                // ignore
            }
        }
        await ctx.replyWithHTML(
            `✅ <b>ГОТОВО!</b>\nДоставлено: <b>${count}</b>`,
            Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ В меню', 'admin_back')]
            ])
        );
        ctx.session = null;
    });

    bot.action('admin_test', (ctx) => {
        ctx.session = { admin_mode: 'test' };
        ctx.editMessageText('🧪 Отправьте текст для проверки...', {
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Назад', 'admin_back')]
            ])
        });
    });

    bot.action('admin_back', (ctx) => {
        ctx.session = null;
        sendMain(ctx, true);
    });
    bot.action('admin_close', (ctx) =>
        ctx.editMessageText('🛰 <b>Связь завершена.</b>', { parse_mode: 'HTML' })
    );
}

module.exports = adminPanel;