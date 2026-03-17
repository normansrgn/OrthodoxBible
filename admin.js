const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ADMIN_IDS = [481356531]; 

const STYLE = {
    header: '<b>┌───────────────────┐</b>',
    footer: '<b>└───────────────────┘</b>',
    sep: '<b>├───────────────────┤</b>',
    bullet: '<b>📍</b>'
};

const GIST_ID = 'YOUR_GIST_ID_HERE'; // <-- Replace with your actual Gist ID
const GIST_FILENAME = 'users_data.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Set your GitHub token in env variables

let db = {};

async function saveDBToGist() {
    if (!GITHUB_TOKEN) throw new Error('GitHub token not set');
    const url = `https://api.github.com/gists/${GIST_ID}`;
    const body = {
        files: {
            [GIST_FILENAME]: {
                content: JSON.stringify(db, null, 2)
            }
        }
    };
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        throw new Error('Failed to save to Gist');
    }
    return true;
}

async function loadDBFromGist() {
    const url = `https://api.github.com/gists/${GIST_ID}`;
    const headers = {
        'Accept': 'application/vnd.github.v3+json'
    };
    if (GITHUB_TOKEN) {
        headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error('Failed to fetch Gist');
        const gist = await res.json();
        const fileContent = gist.files[GIST_FILENAME]?.content;
        if (!fileContent) {
            db = {};
        } else {
            db = JSON.parse(fileContent);
        }
        // Check if there are any real users besides the test user
        const testId = ADMIN_IDS[0];
        const realUsersExist = Object.keys(db).some(id => id !== String(testId));
        if (Object.keys(db).length === 0 || !realUsersExist) {
            if (!db[testId]) {
                db[testId] = {
                    name: 'Тестовый пользователь',
                    username: 'testuser'
                };
                await saveDBToGist();
            }
        }
        return db;
    } catch (e) {
        return {};
    }
}

function isAdmin(ctx) {
    return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

function adminPanel(bot) {
    

    const sendMain = async (ctx, edit = false) => {
        await loadDBFromGist();
        const count = Object.keys(db).length;
        const text = `${STYLE.header}\n` +
                     `<b>    ⛪️ ГЛАВНЫЙ СОБОР</b>\n` +
                     `${STYLE.sep}\n` +
                     `<b>Статус:</b> <code>Активен 🟢</code>\n` +
                     `<b>Паства:</b> <code>${count} душ</code>\n` +
                     `${STYLE.sep}\n` +
                     `<i>Управление системой:</i>\n` +
                     `${STYLE.footer}`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('👥 Прихожане', 'admin_users'), Markup.button.callback('📊 Статы', 'admin_stats')],
            [Markup.button.callback('📨 Вещание', 'admin_broadcast'), Markup.button.callback('🧪 Тест', 'admin_test')],
            [Markup.button.callback('📥 Скачать базу', 'admin_download')],
            [Markup.button.callback('🔄 Обновить', 'admin_refresh'), Markup.button.callback('❌ Выход', 'admin_close')]
        ]);

        if (edit) return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(() => {});
        return ctx.replyWithHTML(text, keyboard);
    };

    bot.command('admin', (ctx) => isAdmin(ctx) ? sendMain(ctx) : null);


    bot.action('admin_users', async (ctx) => {
        if (!isAdmin(ctx)) return;
        await loadDBFromGist();
        const entries = Object.entries(db).reverse();
        const total = entries.length;
        

        const limit = 25;
        const visibleEntries = entries.slice(0, limit);

        let userList = visibleEntries.map(([id, info], i) => {
            const name = info.name || info.first_name || 'Странник';
            const username = info.username ? `(@${info.username})` : '';
            return `<b>${i+1}.</b> ${name} ${username}\n└ <code>${id}</code>`;
        }).join('\n\n');

        let warning = total > limit 
            ? `\n${STYLE.sep}\n⚠️ <i>Показаны последние ${limit}. Всего в базе ${total}. Используйте «Скачать базу» для полного списка.</i>` 
            : `\n${STYLE.sep}\n<i>Список из ${total} прихожан.</i>`;

        const text = `${STYLE.header}\n` +
                     `<b>    👥 СПИСОК ПОЛЬЗОВАТЕЛЕЙ</b>\n` +
                     `${STYLE.sep}\n` +
                     `${userList || '<i>База пуста</i>'}` +
                     `${warning}\n` +
                     `${STYLE.footer}`;

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📥 Скачать весь файл', 'admin_download')],
                [Markup.button.callback('⬅️ Назад в меню', 'admin_back')]
            ])
        }).catch(e => ctx.answerCbQuery('Ошибка отображения'));
    });


    bot.action('admin_download', async (ctx) => {
        if (!isAdmin(ctx)) return;
        await ctx.answerCbQuery('Подготовка выписки...');
        try {
            await loadDBFromGist();
            // Create a temporary file with db content to send
            const tmpPath = path.resolve(__dirname, 'tmp_users_data.json');
            fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
            await ctx.replyWithDocument({ source: tmpPath, filename: 'users_database.json' }, {
                caption: `<b>📂 ПОЛНЫЙ СПИСОК ПАСТВЫ</b>\nВсего записей: <code>${Object.keys(db).length}</code>`,
                parse_mode: 'HTML'
            });
            fs.unlinkSync(tmpPath);
        } catch (e) {
            await ctx.reply('❌ Ошибка при чтении файла БД.');
        }
    });


    bot.action(['admin_stats', 'admin_refresh'], async (ctx) => {
        if (!isAdmin(ctx)) return;
        await loadDBFromGist();
        // Approximate size of db content string in bytes
        const size = Buffer.byteLength(JSON.stringify(db), 'utf8');
        const text = `${STYLE.header}\n` +
                     `<b>    📊 АНАЛИТИКА БАЗЫ</b>\n` +
                     `${STYLE.sep}\n` +
                     `${STYLE.bullet} Всего душ: <b>${Object.keys(db).length}</b>\n` +
                     `${STYLE.bullet} Вес данных: <b>${(size / 1024).toFixed(2)} KB</b>\n` +
                     `${STYLE.bullet} Последний вход: <b>${new Date().toLocaleTimeString()}</b>\n` +
                     `${STYLE.sep}\n` +
                     `<i>Данные актуальны.</i>\n` +
                     `${STYLE.footer}`;

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Обновить', 'admin_refresh')], [Markup.button.callback('⬅️ Назад', 'admin_back')]])
        }).catch(() => {});
    });


    bot.action('admin_broadcast', async (ctx) => {
        if (!isAdmin(ctx)) return;
        await ctx.editMessageText(
            `📢 <b>РЕЖИМ ВЕЩАНИЯ</b>\n\nВведите текст сообщения для всех пользователей.\n\n<i>Отмена — кнопка ниже.</i>`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🚫 Отмена', 'admin_back')]]) }
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
                return ctx.replyWithHTML(`🧪 <b>ВИД:</b>\n\n${preview}`, Markup.inlineKeyboard([[Markup.button.callback('⬅️ В меню', 'admin_back')]]));
            }
            ctx.session.broadcast_payload = preview;
            await ctx.replyWithHTML(`<b>⚠️ ПОДТВЕРДИТЕ:</b>\n\n${preview}`, Markup.inlineKeyboard([
                [Markup.button.callback('🚀 Начать рассылку', 'admin_send_confirm')],
                [Markup.button.callback('❌ Отмена', 'admin_back')]
            ]));
        }
    });

    bot.action('admin_send_confirm', async (ctx) => {
        if (!isAdmin(ctx)) return;
        const text = ctx.session?.broadcast_payload;
        await loadDBFromGist();
        const ids = Object.keys(db);
        await ctx.editMessageText('⌛ <b>Вещание начато...</b>', { parse_mode: 'HTML' });
        let count = 0;
        for (const id of ids) {
            try {
                await bot.telegram.sendMessage(id, text, { parse_mode: 'HTML' });
                count++;
                await new Promise(r => setTimeout(r, 40)); 
            } catch (e) {}
        }
        await ctx.replyWithHTML(`✅ <b>ГОТОВО!</b>\nДоставлено: <b>${count}</b>`, Markup.inlineKeyboard([[Markup.button.callback('⬅️ В меню', 'admin_back')]]));
        ctx.session = null;
    });

    bot.action('admin_test', (ctx) => {
        ctx.session = { admin_mode: 'test' };
        ctx.editMessageText('🧪 Отправьте текст для проверки...', { ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_back')]]) });
    });

    bot.action('admin_back', (ctx) => { ctx.session = null; sendMain(ctx, true); });
    bot.action('admin_close', (ctx) => ctx.editMessageText('🛰 <b>Связь завершена.</b>', { parse_mode: 'HTML' }));
}

module.exports = adminPanel;