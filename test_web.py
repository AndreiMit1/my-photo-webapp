import asyncio
from aiogram import Bot, Dispatcher, types

API_TOKEN = ""

bot = Bot(token=API_TOKEN)
dp = Dispatcher()


@dp.message(lambda m: m.web_app_data)
async def web_app_data_handler(message: types.Message):
    data = message.web_app_data.data
    print("Получено значение:", data) 
    await message.answer(f"Ты нажал: {data}")

async def main():
    print("Бот запустился и слушает события...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
