# AR(1) Forecast Game - Telegram WebApp + Bot + OTP Email

Проект состоит из 3 частей:

1) **Front (Next.js)** — папка `new_ui/`  
2) **Telegram bot (aiogram)** — файл `main.py`  
3) **OTP email service (FastAPI)** — папка `otp_service/` (файл `otp_service/app.py`)

## Требования

- Node.js 18+ (или 20+)
- `cloudflared` (для временного публичного URL через trycloudflare)
- SQLite 

## Структура

- `main.py` - Telegram bot
- `results.db` - база результатов (будет создаваться автоматически при первом запуске)
- `requirements.txt` - зависимости Python (бот + сервис)
- `otp_service/app.py` — OTP сервис
- `otp_service/otp.db` — база OTP (будет создаваться автоматически при первом запуске)
- `new_ui/` — фронт

## Secrets / .env


- `./.env` - вводим токен бота
- `./otp_service/.env' - написать разработчике - даск все явки и пароли


## 1 запуск: подготовка (1 раз)

Открываем терминал и идём в корень проекта (там где `main.py`):

```bash
cd ~/my-photo-webapp
```

## 1.1 Создаём один общий venv для всего Python (1 раз)

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

## 2) Фронт (Next.js) — установка (1 раз)

cd new_ui
npm install

## 3) Запуск (каждый раз) - нужно 3 терминала

1 терминал 

cd ~/my-photo-webapp/new_ui
npm run dev

2 терминал 

cd ~/my-photo-webapp
source .venv/bin/activate
python -m uvicorn otp_service.app:app --host 127.0.0.1 --port 8001

3 терминал

cd ~/my-photo-webapp
source .venv/bin/activate
python main.py

