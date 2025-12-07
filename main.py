import asyncio
import sqlite3
import random
import urllib.parse

from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo

API_TOKEN = "8289052007:AAHNUl-TnZcCXf65pT6gqnyQH5c3-JKzHfs"  # 🔹 вставь сюда токен бота
BASE_WEBAPP_URL = "https://mybot-1wt.pages.dev/code.html"  # 🔹 твой Cloudflare Pages URL

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
            user_id    INTEGER,
            price_up   INTEGER,
            price_down INTEGER
        )
    """)
    db.commit()
    db.close()
    print("база данных создана")


def insert_result(user_id: int, choice: str):
    db = sqlite3.connect("results.db")
    cursor = db.cursor()

    if choice == "1":
        price_up, price_down = 1, 0
    elif choice == "0":
        price_up, price_down = 0, 1
    else:
        db.close()
        return

    cursor.execute(
        "INSERT INTO results (user_id, price_up, price_down) VALUES (?, ?, ?)",
        (user_id, price_up, price_down),
    )
    db.commit()
    db.close()
    print(user_id, price_up, price_down)


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
    v = random.randint(0, 10**9)
    params = urllib.parse.urlencode({"phi": phi, "uid": user_id, "v": v})
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
    data = message.web_app_data.data  # "0" или "1"
    user_id = message.from_user.id
    print("Получено значение:", data)

    insert_result(user_id, data)
    await message.answer(f"Ты нажал: {data}")


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
