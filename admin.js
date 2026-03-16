const fs = require('fs');
const { Markup } = require('telegraf');

const ADMIN_ID = 481356531; 
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
    const getBar = (v, t) => {
        const full = Math.round((v / t) * 10) || 0;
        return '<code>' + '☩'.repeat(full) + '┈'.repeat(10 - full) + '</code>';
    };

    const generateMainDash = () => {
        const ids = Object.keys(db).filter(k => !['actionsHistory', 'settings'].includes(k));
        const total = ids.length;
        const active = ids.filter(id => (db[id].messagesCount || 0) > 15).length;
        const banned = ids.filter(id => db[id].isBlocked).length;

        return `
<b>☦️ ЦЕРКОВНОЕ УПРАВЛЕНИЕ ☦️</b>
<i>«Где двое или трое собраны во имя Мое...»</i>
────────────────────────
🕒 <b>Время:</b> <code>${new Date().toLocaleTimeString('ru-RU')}</code>

<b>📈 ДУХОВНЫЙ РОСТ (Активность):</b>
<code>[ ▃▅▇█▇▆▅▃ ]</code> <i>Благолепно</i>

<b>👥 ПАСТВА (Юзеры):</b>
├ Всего душ:  <code>${total}</code>
├ В запрете:  <code>${banned}</code>
└ Ревностные: ${getBar(active, total)} <b>${Math.round((active/total)*100 || 0)}%</b>

<b>📦 ХРАНИЛИЩЕ (БД):</b>
└ Состояние:  🟢 <b>Упорядочено</b>
────────────────────────
<i>Выберите службу для исполнения:</i>
        `.trim();
    };

    const mainKeyboard = () => Markup.inlineKeyboard([
        [Markup.button.callback('📜 Список прихожан', 'list_0')],
        [Markup.button.callback('🔍 Поиск чада', 'menu_search'), Markup.button.callback('📢 Глас (Рассылка)', 'menu_broadcast')],
        [Markup.button.callback('📥 Свиток JSON', 'menu_backup'), Markup.button.callback('📊 Свиток CSV', 'menu_csv')],
        [Markup.button.callback('🔄 Обновить', 'menu_dash'), Markup.button.callback('🚪 Выйти', 'start_over')]
    ]);

    async function sendAdminMenu(ctx) {
        await ctx.replyWithHTML(generateMainDash(), mainKeyboard());
    }

    bot.on('callback_query', async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("Доступ закрыт!");
        const data = ctx.callbackQuery.data;

        try {
            await ctx.answerCbQuery().catch(() => {});

            if (data === 'menu_dash') {
                return await ctx.editMessageText(generateMainDash(), { parse_mode: 'HTML', reply_markup: mainKeyboard().reply_markup });
            }

            // --- ИНТЕРАКТИВНЫЙ СПИСОК ПРИХОЖАН ---
            if (data.startsWith('list_')) {
                const page = parseInt(data.split('_')[1]);
                const ids = Object.keys(db)
                    .filter(k => !['actionsHistory', 'settings'].includes(k))
                    .sort((a,b) => (db[b].messagesCount || 0) - (db[a].messagesCount || 0));
                
                const pageSize = 7;
                const totalPages = Math.ceil(ids.length / pageSize);
                const currentIds = ids.slice(page * pageSize, (page + 1) * pageSize);

                const buttons = currentIds.map(id => [
                    Markup.button.callback(`${db[id].isBlocked ? '❌' : '☦︎'} ${db[id].name || 'Аноним'} (${db[id].messagesCount || 0})`, `user_${id}`)
                ]);

                const nav = [];
                if (page > 0) nav.push(Markup.button.callback('⇠ Назад', `list_${page - 1}`));
                nav.push(Markup.button.callback(`${page + 1} из ${totalPages}`, 'ignore'));
                if (page < totalPages - 1) nav.push(Markup.button.callback('Вперед ⇢', `list_${page + 1}`));
                
                buttons.push(nav);
                buttons.push([Markup.button.callback('🔙 Вернуться в притвор', 'menu_dash')]);

                return await ctx.editMessageText(`<b>📜 КНИГА ПРИХОЖАН</b>\n<i>Нажмите на имя для вразумления или управления:</i>`, {
                    parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(buttons).reply_markup
                });
            }

            // --- КАРТОЧКА ЮЗЕРА ---
            if (data.startsWith('user_')) {
                const uid = data.split('_')[1];
                const u = db[uid];
                const info = `
<b>☦︎ КАРТОЧКА ПРИХОЖАНИНА</b>
──────────────────
🆔 <b>ID:</b> <code>${uid}</code>
👤 <b>Имя:</b> <code>${u.name || 'Скрыто'}</code>
🌐 <b>Ник:</b> @${u.username || 'не указан'}
💬 <b>Трудов (смс):</b> <code>${u.messagesCount || 0}</code>
🔴 <b>Статус:</b> ${u.isBlocked ? 'В запрете (Бан)' : 'В добром здравии'}
──────────────────`;
                return await ctx.editMessageText(info, {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('✉️ Личное поучение', `msg_${uid}`)],
                        [Markup.button.callback(u.isBlocked ? '🔓 Снять запрет' : '🚫 Наложить запрет', `tgl_${uid}`)],
                        [Markup.button.callback('⬅️ К списку', 'list_0')]
                    ]).reply_markup
                });
            }

            // --- ЛИЧНОЕ СООБЩЕНИЕ ---
            if (data.startsWith('msg_')) {
                const uid = data.split('_')[1];
                await ctx.reply(`✍️ <b>Письмо для ${db[uid].name}:</b>\nВведите текст сообщения для отправки прихожанину в личку.`, { parse_mode: 'HTML' });
                bot.once('message', async (mCtx) => {
                    try {
                        await bot.telegram.sendMessage(uid, `<b>✉️ Сообщение от администрации:</b>\n\n${mCtx.text}`, { parse_mode: 'HTML' });
                        await mCtx.reply("✅ Послание доставлено!");
                    } catch (e) { await mCtx.reply("❌ Не удалось доставить (возможно, бот заблокирован)."); }
                });
            }

            if (data.startsWith('tgl_')) {
                const uid = data.split('_')[1];
                db[uid].isBlocked = !db[uid].isBlocked;
                saveDB();
                return await ctx.answerCbQuery("Статус изменен");
            }

            // Рассылка
            if (data === 'menu_broadcast') {
                await ctx.reply("📢 <b>ГЛАС АДМИНИСТРАЦИИ</b>\nПришлите весть для всей паствы:", { parse_mode: 'HTML' });
                bot.once('message', async (mCtx) => {
                    const ids = Object.keys(db).filter(id => !db[id].isBlocked && id.length > 5);
                    let ok = 0;
                    for(let id of ids) { try { await bot.telegram.copyMessage(id, mCtx.chat.id, mCtx.message.message_id); ok++; } catch(e){} }
                    await mCtx.reply(`☦︎ Весть разнесена ${ok} прихожанам.`);
                });
            }

            // CSV
            if (data === 'menu_csv') {
                let csv = "\ufeffID;Имя;Активность\n";
                Object.keys(db).forEach(id => { if(db[id].name) csv += `${id};${db[id].name};${db[id].messagesCount}\n` });
                fs.writeFileSync('./pastva.csv', csv);
                await ctx.replyWithDocument({ source: './pastva.csv' });
            }

            // Backup
            if (data === 'menu_backup') {
                fs.writeFileSync('./backup.json', JSON.stringify(db, null, 2));
                await ctx.replyWithDocument({ source: './backup.json' });
            }

        } catch (e) {
            if (!e.description?.includes('message is not modified')) console.error(e);
        }
    });

    bot.on('text', async (ctx, next) => {
        const uid = ctx.from.id;
        if (!db[uid]) {
            db[uid] = { name: ctx.from.first_name, username: ctx.from.username, messagesCount: 0, isBlocked: false };
            if (uid !== ADMIN_ID) bot.telegram.sendMessage(ADMIN_ID, `🔔 <b>Колокольный звон!</b>\nНовый прихожанин: <b>${ctx.from.first_name}</b>`, {parse_mode:'HTML'}).catch(()=>{});
        }
        if (db[uid].isBlocked && uid !== ADMIN_ID) return;
        db[uid].messagesCount++;
        saveDB();
        if (ctx.message.text === '/admin' && uid === ADMIN_ID) return sendAdminMenu(ctx);
        await next();
    });

    return { sendAdminMenu }; 
}

module.exports = admin;