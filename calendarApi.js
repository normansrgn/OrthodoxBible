const express = require("express");
const app = express();

// ============================
// 🕊 ПАСХА (можешь заменить или считать отдельно)
// ============================
const PASCHA_2026 = new Date("2026-04-12");

// ============================
// 📆 ФИКСИРОВАННЫЕ ПРАЗДНИКИ (упрощённый набор)
// ============================
const FIXED_FEASTS = {
  "01-07": "Рождество Христово",
  "01-19": "Крещение Господне",
  "04-07": "Благовещение Пресвятой Богородицы",
  "08-19": "Преображение Господне",
  "09-21": "Рождество Пресвятой Богородицы",
  "09-27": "Воздвижение Креста Господня",
  "12-04": "Введение во храм Пресвятой Богородицы",
  "12-25": "Рождество Христово (старый стиль)"
};

// ============================
// 🕯 СВЯТЫЕ ДНЯ (база — расширяешь как хочешь)
// ============================
const SAINTS = {
  "04-24": [
    "Сщмч. Антипа, епископ Пергамский",
    "Прп. Фармуфий Египетский",
    "Мчч. Прокесса и Мартиниана"
  ],
  "04-25": [
    "Св. ап. и евангелист Марк"
  ]
};

// ============================
// 🔧 УТИЛИТЫ
// ============================
function formatMD(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}-${d}`;
}

function diffDays(date1, date2) {
  return Math.floor((date1 - date2) / (1000 * 60 * 60 * 24));
}

// ============================
// 🎵 ГЛАС (1–8 цикл)
// ============================
function getTone(week) {
  if (week <= 0) return null;
  return ((week - 1) % 8) + 1;
}

// ============================
// 📜 СЕДМИЦА ПО ПАСХЕ
// ============================
function getWeekAfterPascha(date) {
  const days = diffDays(date, PASCHA_2026);
  if (days < 0) return null;
  return Math.floor(days / 7) + 1;
}

// ============================
// 🥗 ПОСТ
// ============================
function getFasting(date) {
  const days = diffDays(date, PASCHA_2026);

  if (days >= 0 && days <= 6) {
    return "Поста нет (Светлая седмица)";
  }

  return "Поста нет (Пасхальный период)";
}

// ============================
// 🕯 СВЯТЫЕ ДНЯ
// ============================
function getSaints(date) {
  const key = formatMD(date);
  return SAINTS[key] || [];
}

// ============================
// 🎉 ПРАЗДНИКИ
// ============================
function getFeast(date) {
  const key = formatMD(date);
  return FIXED_FEASTS[key] || null;
}

// ============================
// 📅 КАЛЕНДАРЬ ОДНОГО ДНЯ
// ============================
app.get("/day", (req, res) => {
  const date = req.query.date ? new Date(req.query.date) : new Date();

  const week = getWeekAfterPascha(date);
  const tone = getTone(week);

  res.json({
    date: date.toISOString().split("T")[0],

    sedmica: week ? `${week}-я седмица по Пасхе` : "До Пасхи",
    tone: tone ? `${tone}-й глас` : "Нет гласа",

    fasting: getFasting(date),

    feast: getFeast(date),
    saints: getSaints(date)
  });
});

// ============================
// 📆 КАЛЕНДАРЬ МЕСЯЦА
// ============================
app.get("/month", (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month) - 1;

  const days = [];

  const date = new Date(year, month, 1);

  while (date.getMonth() === month) {
    const week = getWeekAfterPascha(date);
    const tone = getTone(week);

    days.push({
      date: date.toISOString().split("T")[0],
      feast: getFeast(date),
      saints: getSaints(date),
      sedmica: week ? `${week}-я седмица` : null,
      tone: tone ? `${tone}-й глас` : null,
      fasting: getFasting(date)
    });

    date.setDate(date.getDate() + 1);
  }

  res.json({
    month: month + 1,
    year,
    days
  });
});

// ============================
app.listen(3000, () => {
  console.log("🕊 Orthodox Calendar API running on port 3000");
});