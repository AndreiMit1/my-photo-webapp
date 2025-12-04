import asyncio
import sqlite3
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
import numpy as np
import matplotlib.pyplot as plt
import random

API_TOKEN = ""

bot = Bot(token=API_TOKEN)
dp = Dispatcher()

#генерация графика
def generating_plot():
    n = 100
    phi = random.choice([0.3, 0.5, 0.7])
    sigma = 0.5
    epsilon = np.random.normal(0, sigma, n)
    X = np.zeros(n)
    X[0] = epsilon[0]
    
    for t in range(1, n):
        X[t] = phi * X[t-1] + epsilon[t]

    plt.figure(figsize=(19.2, 10.8), dpi=100)
    plt.plot(X)
    plt.text(0.02, 0.98, "p=" + str(phi), fontsize=24)
    plt.savefig('ar1_process.png')
    plt.close()


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
    
#кнопка запуска апп и генерация графика
def get_webapp_keyboard():
    generating_plot()
    button = KeyboardButton(text="Открыть график", web_app=WebAppInfo(url="https://andreimit1.github.io/my-photo-webapp/code.html"))
    return ReplyKeyboardMarkup(keyboard=[[button]], resize_keyboard=True) 


@dp.message(Command("start"))  
async def cmd_start(message: types.Message):
    await message.answer(
        "Нажми кнопку, чтобы открыть мини-приложение + график сгенерирован",
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





