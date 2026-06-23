const express = require("express");
const app = express();

// ============================
// 🕊 ПАСХА (можешь заменить или считать отдельно)
// ============================
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

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// ============================
// 🎵 ГЛАС (1–8 цикл)
// ============================
function getTone(week) {
  if (week <= 0) return null;
  return ((week + 5) % 8) + 1;
}

// ============================
// 📜 СЕДМИЦА ПО ПАСХЕ
// ============================
function getWeekAfterPascha(date) {
  const pascha = getOrthodoxPaschaDate(date.getFullYear());
  const pentecost = addDays(pascha, 49);
  const days = diffDays(date, pentecost);
  if (days < 0) return null;
  return Math.floor(days / 7) + 1;
}

// ============================
// 🥗 ПОСТ
// ============================
function getFasting(date) {
  const pascha = getOrthodoxPaschaDate(date.getFullYear());
  const pentecost = addDays(pascha, 49);
  const apostlesFastStart = addDays(pentecost, 8);
  const apostlesFastEnd = new Date(date.getFullYear(), 6, 12);

  if (date >= apostlesFastStart && date <= apostlesFastEnd) {
    return "Апостольский пост";
  }

  const daysAfterPascha = diffDays(date, pascha);
  if (daysAfterPascha >= 0 && daysAfterPascha <= 6) {
    return "Поста нет (Светлая седмица)";
  }

  return "Поста нет";
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

    sedmica: week ? `${week}-я седмица по Пятидесятнице` : "До Пятидесятницы",
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
      sedmica: week ? `${week}-я седмица по Пятидесятнице` : null,
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
