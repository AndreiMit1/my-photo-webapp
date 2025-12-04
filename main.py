import asyncio
import sqlite3
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo

API_TOKEN = ""

bot = Bot(token=API_TOKEN)
dp = Dispatcher()


#SQL:
def init_db():
    db = sqlite3.connect("results.db")
    cursor = db.cursor()
    cursor.execute("""CREATE TABLE IF NOT EXISTS results (user_id INTEGER, price_up INTEGER,price_down INTEGER)""")
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
    cursor.execute("""INSERT INTO results (user_id, price_up, price_down) VALUES (?, ?, ?)""",(user_id, price_up, price_down))
    db.commit()
    db.close()
    print(user_id, price_up, price_down)
    
def get_webapp_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="Открыть график",
                    web_app=WebAppInfo(
                        url="https://andreimit1.github.io/my-photo-webapp/code.html"  
                    ),
                )
            ]
        ],
        resize_keyboard=True,
    )


@dp.message(Command("start"))  
async def cmd_start(message: types.Message):
    await message.answer(
        "Нажми кнопку, чтобы открыть мини-приложение",
        reply_markup=get_webapp_keyboard()
    )


@dp.message(F.web_app_data)     
async def web_app_data_handler(message: types.Message):
    data = message.web_app_data.data
    user_id = message.from_user.id
    print("Получено значение:", data)

   
    insert_result(user_id, data)
    await message.answer(f"Ты нажал: {data}")


async def main():
    print("Бот запустился...")
    init_db()
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())



