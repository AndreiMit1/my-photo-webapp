import asyncio
import sqlite3
import random
import urllib.parse
import json

from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo

API_TOKEN = "8592559811:AAH29ce0hb8CQCuT7E_EIY64Nwoi5CILQX8"
BASE_WEBAPP_URL = "https://my-photo-webapp.pages.dev/code.html"

bot = Bot(token=API_TOKEN)
dp = Dispatcher()


# =========================
#   БАЗА ДАННЫХ
# =========================

def init_db():
    db = sqlite3.connect("results.db")
    cursor = db.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS results (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER,
            phi       REAL,
            round     INTEGER,
            horizon   INTEGER,
            t         INTEGER,
            y_pred    REAL,
            y_true    REAL
        )
    """)
    db.commit()
    db.close()
    print("База данных создана")


def save_results(user_id: int, payload: dict):
    with sqlite3.connect("results.db") as db:
        cursor = db.cursor()
        phi = payload["phi"]
        for p in payload["predictions"]:
            cursor.execute("""
                INSERT INTO results (user_id, phi, round, horizon, t, y_pred, y_true)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                phi,
                p["round"],
                p["horizon"],
                p["t"],
                p["y_pred"],
                p["y_true"],
            ))


# =========================
#   WEBAPP-КНОПКА
# =========================

def build_webapp_url(user_id: int) -> str:
    phi = random.choice([0.3, 0.5, 0.7])
    v   = random.randint(0, 10**9)
    params = urllib.parse.urlencode({"phi": phi, "uid": user_id, "v": v})
    return f"{BASE_WEBAPP_URL}?{params}"


def get_webapp_keyboard(user_id: int) -> ReplyKeyboardMarkup:
    url    = build_webapp_url(user_id)
    button = KeyboardButton(text="Открыть график", web_app=WebAppInfo(url=url))
    return ReplyKeyboardMarkup(keyboard=[[button]], resize_keyboard=True)


# =========================
#   ХЭНДЛЕРЫ
# =========================

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer(
        "Нажми кнопку, чтобы открыть мини-приложение с графиком.\n"
        "Тебе нужно будет сделать прогнозы на горизонты 1, 2, 3, 6, 9, 12 шагов — "
        "и так 5 раундов.",
        reply_markup=get_webapp_keyboard(message.from_user.id),
    )


@dp.message(F.web_app_data)
async def web_app_data_handler(message: types.Message):
    user_id = message.from_user.id
    payload = json.loads(message.web_app_data.data)

    save_results(user_id, payload)

    total = len(payload["predictions"])
    rounds = payload.get("total_rounds", 5)
    horizons = payload.get("horizons", [1, 2, 3, 6, 9, 12])

    # Считаем MAE по горизонтам
    mae_by_h = {}
    for p in payload["predictions"]:
        h = p["horizon"]
        err = abs(p["y_pred"] - p["y_true"])
        mae_by_h.setdefault(h, []).append(err)

    lines = [f"Результаты сохранены ✅  ({total} прогнозов, {rounds} раундов)\n"]
    lines.append("MAE по горизонтам:")
    for h in horizons:
        errs = mae_by_h.get(h, [])
        if errs:
            mae = sum(errs) / len(errs)
            lines.append(f"  h={h:>2}: {mae:.3f}")

    await message.answer("\n".join(lines))


# =========================
#   ЗАПУСК БОТА
# =========================

async def main():
    print("Бот запустился...")
    init_db()
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
