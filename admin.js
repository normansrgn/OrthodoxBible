const fs = require('fs');
const { Markup } = require('telegraf');

const ADMIN_ID = 481356531; // <-- твой Telegram ID
const DATA_FILE = './users_data.json';

let db = {};
const loadDB = () => {
    if (fs.existsSync(DATA_FILE)) {
        try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { db = {}; }
    }
};
const saveDB = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
loadDB();

function admin(bot) {

    // Форматирование больших чисел с разделителями
    const formatNumber = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // Генерация красивой статистики с эмодзи и структурой
    const generateStatsText = () => {
        const totalUsers = Object.keys(db).length;
        const totalMessages = Object.values(db).reduce((sum, u) => sum + (u.messagesCount || 0), 0);
        const activeUsers = Object.values(db).filter(u => (u.messagesCount || 0) > 0).length;
        const inactiveUsers = totalUsers - activeUsers;
        const avgMessages = totalUsers ? (totalMessages / totalUsers).toFixed(2) : '0.00';

        const mostActiveEntry = Object.entries(db).sort((a,b) => (b[1].messagesCount||0) - (a[1].messagesCount||0))[0];
        const topUser = mostActiveEntry 
            ? `<b>${mostActiveEntry[1].name}</b> (<code>${mostActiveEntry[0]}</code>) — <b>${formatNumber(mostActiveEntry[1].messagesCount)}</b> сообщений`
            : 'Нет данных';

        const text = `
<b>📊 Расширенная статистика админ-панели</b>

👥 <b>Пользователей всего:</b> <code>${formatNumber(totalUsers)}</code>
💬 <b>Сообщений всего:</b> <code>${formatNumber(totalMessages)}</code>
🔥 <b>Активных пользователей:</b> <code>${formatNumber(activeUsers)}</code>
❄️ <b>Неактивных пользователей:</b> <code>${formatNumber(inactiveUsers)}</code>
📈 <b>Среднее сообщений на пользователя:</b> <code>${avgMessages}</code>

🏆 <b>Самый активный пользователь:</b>
${topUser}
        `.trim();

        return text;
    };

    // Создание красивой клавиатуры с разделением по категориям
    const createAdminKeyboard = () => {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('📤 Рассылка всем', 'admin_sendall'),
                Markup.button.callback('📨 Сообщение пользователю', 'admin_senduser')
            ],
            [
                Markup.button.callback('🧾 Просмотр пользователей', 'admin_list'),
                Markup.button.callback('📊 Статистика активности', 'admin_stats')
            ],
            [
                Markup.button.callback('💾 Резервная копия', 'admin_backup'),
                Markup.button.callback('🗑 Очистить базу', 'admin_clear')
            ],
            [
                Markup.button.callback('🏠 Главное меню', 'start_over')
            ]
        ], { columns: 2 });
    };

    async function sendAdminMenu(ctx) {
        const usersCount = Object.keys(db).length;
        const messagesCount = Object.values(db).reduce((sum, u) => sum + (u.messagesCount || 0), 0);
        const activeUsers = Object.values(db).filter(u => (u.messagesCount || 0) > 0).length;
        const mostActive = Object.entries(db).sort((a,b) => (b[1].messagesCount||0) - (a[1].messagesCount||0))[0];
        const topUser = mostActive ? `${mostActive[1].name} (${mostActive[0]}) — ${mostActive[1].messagesCount} сообщений` : 'Нет данных';

        const text = `<b>🛠️ Админ-панель</b>\n\n` +
                     `👥 Пользователи: <b>${formatNumber(usersCount)}</b>\n` +
                     `✉️ Сообщений всего: <b>${formatNumber(messagesCount)}</b>\n` +
                     `🔥 Активных пользователей: <b>${formatNumber(activeUsers)}</b>\n` +
                     `🏆 Самый активный: ${topUser}\n\n` +
                     `<i>Выберите действие ниже:</i>`;

        await ctx.replyWithHTML(text, createAdminKeyboard());
    }

    // --- /admin ---
    bot.on('text', async (ctx, next) => {
        // Сохраняем имя и username
        if (!db[ctx.from.id]) db[ctx.from.id] = {};
        db[ctx.from.id].name = ctx.from.first_name || db[ctx.from.id]?.name || 'неизвестно';
        db[ctx.from.id].username = ctx.from.username || db[ctx.from.id]?.username || 'неизвестно';
        db[ctx.from.id].messagesCount = (db[ctx.from.id].messagesCount || 0) + 1;
        saveDB();

        if (ctx.message.text === '/admin') {
            if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Доступ запрещён");
            return sendAdminMenu(ctx);
        }
        next && next();
    });

    // --- Рассылка всем ---
    bot.action('admin_sendall', async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("❌ Доступ запрещён", { show_alert: true });
        await ctx.reply("📤 Введите сообщение для рассылки всем пользователям:");
        const handler = async (msgCtx) => {
            if (msgCtx.from.id !== ADMIN_ID) return;
            const message = msgCtx.message.text;
            let sent = 0;
            for (const id of Object.keys(db)) {
                try { await bot.telegram.sendMessage(id, message, { parse_mode: 'HTML' }); sent++; } catch(e) {}
            }
            await msgCtx.reply(`✅ Рассылка выполнена\nОтправлено пользователям: ${formatNumber(sent)}`);
            bot.off('text', handler);
        };
        bot.on('text', handler);
        await ctx.answerCbQuery();
    });

    // --- Сообщение конкретному пользователю ---
    bot.action('admin_senduser', async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("❌ Доступ запрещён", { show_alert: true });
        await ctx.reply("📨 Введите ID пользователя:");
        let step = 1;
        let targetId;
        const handler = async (msgCtx) => {
            if (msgCtx.from.id !== ADMIN_ID) return;
            if (step === 1) { 
                targetId = msgCtx.message.text.trim();
                if (!db[targetId]) { await msgCtx.reply("❌ Пользователь не найден"); bot.off('text', handler); return; }
                await msgCtx.reply(`✉️ Введите сообщение для пользователя <code>${targetId}</code>:`, { parse_mode: 'HTML' });
                step = 2;
            } else {
                const message = msgCtx.message.text;
                try { 
                    await bot.telegram.sendMessage(targetId, message, { parse_mode: 'HTML' }); 
                    await msgCtx.reply("✅ Сообщение отправлено"); 
                } catch(e) { 
                    await msgCtx.reply("❌ Ошибка отправки"); 
                }
                bot.off('text', handler);
            }
        };
        bot.on('text', handler);
        await ctx.answerCbQuery();
    });

    // --- Просмотр пользователей ---
    bot.action('admin_list', async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("❌ Доступ запрещён", { show_alert: true });
        let text = `<b>👥 Пользователи базы данных</b>\n\n`;
        if (!Object.keys(db).length) {
            text += '📭 База пуста.';
        } else {
            Object.entries(db).forEach(([id, data], idx) => {
                const name = data?.name || 'неизвестно';
                const username = data?.username ? '@'+data.username : 'неизвестно';
                const messages = data?.messagesCount || 0;
                text += `\u{1F4DD} <b>${idx+1}.</b> <b>ID:</b> <code>${id}</code>\n` +
                        `   👤 <b>Имя:</b> ${name}\n` +
                        `   🔗 <b>Username:</b> ${username}\n` +
                        `   ✉️ <b>Сообщений:</b> ${formatNumber(messages)}\n\n`;
            });
        }
        await ctx.replyWithHTML(text, Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Главное меню', 'start_over')]
        ]));
        await ctx.answerCbQuery();
    });

    // --- Статистика активности ---
    bot.action('admin_stats', async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("❌ Доступ запрещён", { show_alert: true });
        const text = generateStatsText();

        await ctx.replyWithHTML(text, Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Главное меню', 'start_over')]
        ]));
        await ctx.answerCbQuery();
    });

    // --- Резервное копирование ---
    bot.action('admin_backup', async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("❌ Доступ запрещён", { show_alert: true });
        const backupFile = `backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
        try {
            fs.copyFileSync(DATA_FILE, backupFile);
            await ctx.reply(`💾 Резервная копия успешно создана:\n<code>${backupFile}</code>`, { parse_mode: 'HTML' });
        } catch (e) {
            await ctx.reply("❌ Ошибка при создании резервной копии");
        }
        await ctx.answerCbQuery();
    });

    // --- Очистка базы ---
    bot.action('admin_clear', async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("❌ Доступ запрещён", { show_alert: true });
        db = {}; saveDB();
        await ctx.reply("🗑 База пользователей успешно очищена.");
        await ctx.answerCbQuery();
    });

    return { sendAdminMenu };
}

module.exports = admin;