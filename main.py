import asyncio
import sqlite3
import random
import urllib.parse
import json

from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo

API_TOKEN = "8592559811:AAH29ce0hb8CQCuT7E_EIY64Nwoi5CILQX8"  # 🔹 вставь сюда токен бота
BASE_WEBAPP_URL = "https://my-photo-webapp.pages.dev/code.html"  # 🔹 твой Cloudflare Pages URL

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
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                phi REAL,
                step INTEGER,
                t INTEGER,
                y_pred REAL,
                y_true REAL,
                up INTEGER,
                extra_steps INTEGER,
                step_size INTEGER
        )
    """)
    db.commit()
    db.close()
    print("База данных создана")


def save_results(user_id: int, payload: dict):
    with sqlite3.connect("results.db") as db:
        cursor = db.cursor()

        phi = payload["phi"]
        extra_steps = payload["extra_steps"]
        step_size = payload["step_size"]

        for p in payload["predictions"]:
            cursor.execute("""
                INSERT INTO results (
                    user_id, phi, step, t, y_pred, y_true, up, extra_steps, step_size
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                phi,
                p["step"],
                p["t"],
                p["y_pred"],
                p["y_true"],
                int(p["up"]),
                extra_steps,
                step_size
            ))

# =========================
#   WEBAPP-КНОПКА
# =========================

def build_webapp_url(user_id: int) -> str:
    """
    Собираем URL для мини-аппа:
    - phi: параметр AR(1), если захочешь использовать его в будущем
    - uid: id пользователя
    - v: случайное число, чтобы Телега не кэшировала старую страницу
    """
    phi = random.choice([0.3, 0.5, 0.7])
    extra_steps = random.choice([10, 20])
    v = random.randint(0, 10**9)
    params = urllib.parse.urlencode({"phi": phi, "uid": user_id, "v": v, "extra_steps": extra_steps})
    return f"{BASE_WEBAPP_URL}?{params}"


def get_webapp_keyboard(user_id: int) -> ReplyKeyboardMarkup:
    url = build_webapp_url(user_id)
    button = KeyboardButton(
        text="Открыть график",
        web_app=WebAppInfo(url=url),
    )
    return ReplyKeyboardMarkup(
        keyboard=[[button]],
        resize_keyboard=True,
    )


# =========================
#   ХЭНДЛЕРЫ
# =========================

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    user_id = message.from_user.id
    await message.answer(
        "Нажми кнопку, чтобы открыть мини-приложение с графиком",
        reply_markup=get_webapp_keyboard(user_id),
    )


@dp.message(F.web_app_data)
async def web_app_data_handler(message: types.Message):
    user_id = message.from_user.id

    payload = json.loads(message.web_app_data.data)

    save_results(user_id, payload)

    await message.answer(
        f"Результаты сохранены ✅\n"

    )


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




