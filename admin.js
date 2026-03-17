

const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const ADMIN_IDS = [481356531]; 
const DB_PATH = path.resolve(__dirname, 'users_data.json');

const STYLE = {
    header: '<b>┌───────────────────┐</b>',
    footer: '<b>└───────────────────┘</b>',
    sep: '<b>├───────────────────┤</b>',
    bullet: '<b>📍</b>'
};

function isAdmin(ctx) {
    return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

function getDb() {
    try {
        return fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : {};
    } catch (e) { return {}; }
}

function adminPanel(bot) {
    

    const sendMain = async (ctx, edit = false) => {
        const db = getDb();
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
        const db = getDb();
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
            await ctx.replyWithDocument({ source: DB_PATH, filename: 'users_database.json' }, {
                caption: `<b>📂 ПОЛНЫЙ СПИСОК ПАСТВЫ</b>\nВсего записей: <code>${Object.keys(getDb()).length}</code>`,
                parse_mode: 'HTML'
            });
        } catch (e) {
            await ctx.reply('❌ Ошибка при чтении файла БД.');
        }
    });


    bot.action(['admin_stats', 'admin_refresh'], async (ctx) => {
        if (!isAdmin(ctx)) return;
        const db = getDb();
        const stats = fs.statSync(DB_PATH);
        const text = `${STYLE.header}\n` +
                     `<b>    📊 АНАЛИТИКА БАЗЫ</b>\n` +
                     `${STYLE.sep}\n` +
                     `${STYLE.bullet} Всего душ: <b>${Object.keys(db).length}</b>\n` +
                     `${STYLE.bullet} Вес данных: <b>${(stats.size / 1024).toFixed(2)} KB</b>\n` +
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
        const text = ctx.session?.broadcast_payload;
        const ids = Object.keys(getDb());
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