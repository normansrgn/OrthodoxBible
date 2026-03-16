/**
 * Модуль админ-панели для OrthodoxBible.
 * Экспортирует функцию adminPanel(bot), которая регистрирует команду /admin и обработчики callback для админки.
 * Не создает новый экземпляр Telegraf, использует переданный bot.
 */

const { Markup } = require('telegraf');

// Здесь можно указать id или username админов
const ADMIN_IDS = [
    481356531, // пример: замените на свой Telegram user id
    // ...добавьте других админов
];

/**
 * Проверка, является ли пользователь админом
 */
function isAdmin(ctx) {
    if (!ctx.from) return false;
    // По id или username
    return (
        ADMIN_IDS.includes(ctx.from.id) ||
        (ctx.from.username && ['your_admin_username'].includes(ctx.from.username))
    );
}

/**
 * Основная функция для подключения админ-панели к боту
 * @param {Telegraf} bot
 */
function adminPanel(bot) {
    // Команда /admin
    bot.command('admin', async (ctx) => {
        if (!isAdmin(ctx)) {
            return ctx.reply('⛔️ Доступ запрещён. Только для администраторов.');
        }
        await ctx.replyWithHTML(
            '<b>⚙️ Админ-панель</b>\n\nВыберите действие:',
            Markup.inlineKeyboard([
                [Markup.button.callback('📊 Статистика', 'admin_stats')],
                [Markup.button.callback('📨 Рассылка', 'admin_broadcast')],
                [Markup.button.callback('❌ Закрыть', 'admin_close')],
            ])
        );
    });

    // Callback: Статистика
    bot.action('admin_stats', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
        // Пример: статистика пользователей
        let userCount = 0;
        try {
            // Попробуем загрузить users_data.json
            const fs = require('fs');
            const path = require('path');
            const dbPath = path.resolve(__dirname, 'users_data.json');
            if (fs.existsSync(dbPath)) {
                const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                userCount = Object.keys(db).length;
            }
        } catch (e) {
            userCount = 0;
        }
        await ctx.editMessageText(
            `<b>📊 Статистика</b>\n\nПользователей в базе: <b>${userCount}</b>`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Назад', 'admin_back')],
                    [Markup.button.callback('❌ Закрыть', 'admin_close')],
                ]),
            }
        );
    });

    // Callback: Рассылка - шаг 1 (ввод текста)
    bot.action('admin_broadcast', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
        await ctx.editMessageText(
            '<b>📨 Рассылка</b>\n\nОтправьте текст сообщения для рассылки всем пользователям.\n\n<i>Можно использовать HTML-разметку.</i>',
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Назад', 'admin_back')],
                    [Markup.button.callback('❌ Закрыть', 'admin_close')],
                ]),
            }
        );
        // Включаем режим ожидания текста рассылки
        ctx.session = ctx.session || {};
        ctx.session.admin_broadcast_mode = true;
    });

    // Callback: Закрыть админку
    bot.action('admin_close', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
        await ctx.editMessageText('Админ-панель закрыта.', { parse_mode: 'HTML' }).catch(() => {});
    });

    // Callback: Назад к главному меню админки
    bot.action('admin_back', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
        await ctx.editMessageText(
            '<b>⚙️ Админ-панель</b>\n\nВыберите действие:',
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📊 Статистика', 'admin_stats')],
                    [Markup.button.callback('📨 Рассылка', 'admin_broadcast')],
                    [Markup.button.callback('❌ Закрыть', 'admin_close')],
                ]),
            }
        );
    });

    // Обработка текста рассылки (только для админов и если был выбран режим рассылки)
    bot.on('text', async (ctx, next) => {
        // Проверяем, что это не команда/кнопка, не из обычных пользователей, и что включён режим рассылки
        if (!isAdmin(ctx) || !ctx.session || !ctx.session.admin_broadcast_mode) {
            return next();
        }
        const text = ctx.message.text;
        // Подтверждение рассылки
        ctx.session.admin_broadcast_text = text;
        ctx.session.admin_broadcast_mode = false;
        await ctx.replyWithHTML(
            `<b>Подтвердите рассылку:</b>\n\n${text}`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Подтвердить', 'admin_broadcast_send')],
                [Markup.button.callback('❌ Отмена', 'admin_broadcast_cancel')],
            ])
        );
    });

    // Callback: Отмена рассылки
    bot.action('admin_broadcast_cancel', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
        ctx.session = ctx.session || {};
        ctx.session.admin_broadcast_text = null;
        ctx.session.admin_broadcast_mode = false;
        await ctx.editMessageText('Рассылка отменена.', { parse_mode: 'HTML' }).catch(() => {});
    });

    // Callback: Отправить рассылку
    bot.action('admin_broadcast_send', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
        ctx.session = ctx.session || {};
        const text = ctx.session.admin_broadcast_text;
        if (!text) {
            await ctx.editMessageText('Нет текста для рассылки.', { parse_mode: 'HTML' }).catch(() => {});
            return;
        }
        // Загружаем список пользователей
        let userIds = [];
        try {
            const fs = require('fs');
            const path = require('path');
            const dbPath = path.resolve(__dirname, 'users_data.json');
            if (fs.existsSync(dbPath)) {
                const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                userIds = Object.keys(db);
            }
        } catch (e) {
            userIds = [];
        }
        let sent = 0;
        for (const id of userIds) {
            try {
                await bot.telegram.sendMessage(id, text, { parse_mode: 'HTML', disable_web_page_preview: true });
                sent++;
            } catch (e) {
                // игнорируем ошибки отправки отдельным пользователям
            }
        }
        await ctx.editMessageText(
            `Рассылка завершена.\n\nСообщение отправлено <b>${sent}</b> пользователям.`,
            { parse_mode: 'HTML' }
        );
        ctx.session.admin_broadcast_text = null;
        ctx.session.admin_broadcast_mode = false;
    });
}

module.exports = adminPanel;