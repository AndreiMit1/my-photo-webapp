import asyncio
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo

API_TOKEN = ""

bot = Bot(token=API_TOKEN)
dp = Dispatcher()

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
    print("Получено значение:", data)
    await message.answer(f"Ты нажал: {data}")


async def main():
    print("Бот запустился...")
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
