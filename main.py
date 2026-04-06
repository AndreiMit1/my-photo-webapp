import asyncio
import sqlite3
import random
import urllib.parse
import json
import re

import os
import re
import subprocess
import threading
import time

import httpx
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext

import socket
import aiohttp
from aiogram.client.session.aiohttp import AiohttpSession

from aiogram.types import ReplyKeyboardRemove
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.exceptions import TelegramBadRequest

from rapidfuzz import process, fuzz
import pymorphy3

from dotenv import load_dotenv
load_dotenv()

API_TOKEN = os.getenv("BOT_TOKEN", "")
if not API_TOKEN:
    raise RuntimeError("BOT_TOKEN is empty. Put it into .env")

BASE_WEBAPP_URL = None


TRYCF_RE = re.compile(r"(https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com)")

def start_cloudflared_and_get_url(local_url: str = "http://127.0.0.1:3000") -> str:
    """
    Запускает cloudflared и возвращает публичный https url вида https://xxx.trycloudflare.com
    Требует установленный cloudflared в системе.
    """
    proc = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", local_url, "--no-autoupdate"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    deadline = time.time() + 25  # ждать до 25 секунд
    url = None

    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            continue
        m = TRYCF_RE.search(line)
        if m:
            url = m.group(1)
            break

    if not url:
        proc.terminate()
        raise RuntimeError("Не удалось получить trycloudflare URL из cloudflared")

    # Оставляем процесс жить (туннель должен работать постоянно)
    return url


# OTP service (локально)
# OTP service (локально)
OTP_SERVICE_BASE = "http://127.0.0.1:8001"

bot = None
dp = Dispatcher()

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


# =========================
#   FSM состояния
# =========================
class Auth(StatesGroup):
    waiting_full_name = State()
    waiting_org = State()
    waiting_faculty = State()         
    waiting_degree = State()
    waiting_course = State()
    waiting_gpa_quantile = State()
    waiting_gpa_mathstat = State()
    waiting_gpa_econometrics = State()
    waiting_gpa_ml = State()

    consent = State()
    waiting_nickname = State()
    waiting_email = State()
    waiting_code = State()


# =========================
#   БАЗА ДАННЫХ
# =========================
def init_db():
    with sqlite3.connect("results.db") as db:
        cursor = db.cursor()

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
          user_id INTEGER PRIMARY KEY,
          created_at INTEGER NOT NULL,

          full_name TEXT,

          org_raw TEXT,
          org_norm TEXT,
          org_cluster_id INTEGER,

          faculty_raw TEXT,
          faculty_norm TEXT,
          faculty_cluster_id INTEGER,

          degree TEXT,
          course TEXT,

          gpa_quantile TEXT,
          gpa_mathstat TEXT,
          gpa_econometrics TEXT,
          gpa_ml TEXT,

          wants_raffle INTEGER NOT NULL DEFAULT 0,
          wants_leaderboard INTEGER NOT NULL DEFAULT 0,

          nickname TEXT UNIQUE,
          email TEXT,
          verified_at INTEGER
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS submissions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL,
            email        TEXT,
            created_at   INTEGER NOT NULL,
            phi          REAL,
            total_score  INTEGER,
            avg_score    INTEGER,
            payload_json TEXT NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS org_clusters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canon_text TEXT NOT NULL,
            sample_raw TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS faculty_clusters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canon_text TEXT NOT NULL,
            sample_raw TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """)

        db.commit()

    print("База данных создана")


MORPH = pymorphy3.MorphAnalyzer()

RU_STOPWORDS = {
    "факультет","фак","ф-т","школа","институт","университет","академия","колледж",
    "кафедра","департамент","отделение","программа","направление",
    "им","имени","г","город","филиал","в","на","по","и","the","of"
}

def clean_ru(s: str) -> str:
    s = (s or "").strip().lower().replace("ё", "е")
    s = re.sub(r"[\(\)\[\]\{\},;:!?\.\-_/\\]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def lemmatize_ru(s: str) -> str:
    s = clean_ru(s)
    if not s:
        return ""
    tokens = []
    for w in s.split():
        # убираем совсем короткие мусорные штуки
        if len(w) <= 1:
            continue
        # лемматизация
        p = MORPH.parse(w)[0]
        lemma = p.normal_form
        if lemma in RU_STOPWORDS:
            continue
        tokens.append(lemma)
    return " ".join(tokens)

def get_or_create_org_cluster(org_raw: str, threshold: int = 88) -> tuple[int, str]:
    """
    Возвращает (cluster_id, org_norm).
    org_norm — лемматизированная строка (по-русски).
    threshold — насколько строго “слипать” похожие строки.
    """
    org_norm = lemmatize_ru(org_raw)
    if not org_norm:
        # отдельный кластер для пустого/непонятного
        org_norm = "unknown"

    with sqlite3.connect("results.db") as db:
        cur = db.cursor()

        # забираем все существующие кластеры (для маленького масштаба это ок)
        cur.execute("SELECT id, canon_text FROM org_clusters")
        rows = cur.fetchall()

        if rows:
            choices = [r[1] for r in rows]            # canon_text
            id_by_text = {r[1]: r[0] for r in rows}   # canon_text -> id

            best = process.extractOne(org_norm, choices, scorer=fuzz.token_set_ratio)
            if best and best[1] >= threshold:
                return id_by_text[best[0]], org_norm

        # если не нашли похожий — создаём новый кластер
        now = int(time.time())
        cur.execute(
            "INSERT INTO org_clusters (canon_text, sample_raw, created_at) VALUES (?, ?, ?)",
            (org_norm, org_raw[:300], now),
        )
        db.commit()
        return cur.lastrowid, org_norm
    

def get_or_create_faculty_cluster(faculty_raw: str, threshold: int = 88) -> tuple[int, str]:
    """
    Возвращает (cluster_id, faculty_norm).
    faculty_norm — лемматизированная строка (по-русски).
    """
    faculty_norm = lemmatize_ru(faculty_raw)
    if not faculty_norm:
        faculty_norm = "unknown"

    with sqlite3.connect("results.db") as db:
        cur = db.cursor()

        cur.execute("SELECT id, canon_text FROM faculty_clusters")
        rows = cur.fetchall()

        if rows:
            choices = [r[1] for r in rows]
            id_by_text = {r[1]: r[0] for r in rows}

            best = process.extractOne(faculty_norm, choices, scorer=fuzz.token_set_ratio)
            if best and best[1] >= threshold:
                return id_by_text[best[0]], faculty_norm

        now = int(time.time())
        cur.execute(
            "INSERT INTO faculty_clusters (canon_text, sample_raw, created_at) VALUES (?, ?, ?)",
            (faculty_norm, faculty_raw[:300], now),
        )
        db.commit()
        return cur.lastrowid, faculty_norm


def upsert_user_profile(user_id: int, data: dict):
    now = int(time.time())
    with sqlite3.connect("results.db") as db:
        cur = db.cursor()
        cur.execute("""
            INSERT INTO users (
              user_id, created_at,
              full_name,

              org_raw, org_norm, org_cluster_id,
              faculty_raw, faculty_norm, faculty_cluster_id,

              degree, course,
              gpa_quantile, gpa_mathstat, gpa_econometrics, gpa_ml
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              full_name=excluded.full_name,

              org_raw=excluded.org_raw,
              org_norm=excluded.org_norm,
              org_cluster_id=excluded.org_cluster_id,

              faculty_raw=excluded.faculty_raw,
              faculty_norm=excluded.faculty_norm,
              faculty_cluster_id=excluded.faculty_cluster_id,

              degree=excluded.degree,
              course=excluded.course,
              gpa_quantile=excluded.gpa_quantile,
              gpa_mathstat=excluded.gpa_mathstat,
              gpa_econometrics=excluded.gpa_econometrics,
              gpa_ml=excluded.gpa_ml
        """, (
            user_id, now,
            data.get("full_name"),

            data.get("org_raw"),
            data.get("org_norm"),
            data.get("org_cluster_id"),

            data.get("faculty_raw"),
            data.get("faculty_norm"),
            data.get("faculty_cluster_id"),

            data.get("degree"),
            data.get("course"),
            data.get("gpa_quantile"),
            data.get("gpa_mathstat"),
            data.get("gpa_econometrics"),
            data.get("gpa_ml"),
        ))
        db.commit()

def get_user_email(user_id: int) -> str | None:
    with sqlite3.connect("results.db") as db:
        cur = db.cursor()
        cur.execute("SELECT email FROM users WHERE user_id=?", (user_id,))
        row = cur.fetchone()
        return row[0] if row else None


def save_results(user_id: int, payload: dict):
    with sqlite3.connect("results.db") as db:
        cursor = db.cursor()

        email = get_user_email(user_id)

        phi = payload.get("phi")
        total_score = payload.get("totalScore")
        avg_score = payload.get("avgScore")

        cursor.execute("""
            INSERT INTO submissions (user_id, email, created_at, phi, total_score, avg_score, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            email,
            int(time.time()),
            float(phi) if phi is not None else None,
            int(total_score) if total_score is not None else None,
            int(avg_score) if avg_score is not None else None,
            json.dumps(payload, ensure_ascii=False),
        ))

        db.commit()


# =========================
#   WEBAPP
# =========================
def build_webapp_url(user_id: int) -> str:
    if not BASE_WEBAPP_URL:
        raise RuntimeError("BASE_WEBAPP_URL ещё не готов")

    base = BASE_WEBAPP_URL.strip().rstrip("/")
    phi = random.choice([0.3, 0.5, 0.7])
    v = random.randint(0, 10**9)
    params = urllib.parse.urlencode({"phi": phi, "uid": user_id, "v": v})
    return f"{base}/?{params}"


def get_webapp_keyboard(user_id: int) -> ReplyKeyboardMarkup:
    url = build_webapp_url(user_id)
    button = KeyboardButton(text="Открыть график", web_app=WebAppInfo(url=url))
    return ReplyKeyboardMarkup(keyboard=[[button]], resize_keyboard=True)


# =========================
#   OTP helpers (через сервис)
# =========================
def is_valid_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email.strip().lower()))


async def otp_request(user_id: int, email: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"{OTP_SERVICE_BASE}/otp/request",
            json={"user_id": user_id, "email": email},
        )
    if r.status_code != 200:
        # пробуем показать человеку понятную ошибку
        try:
            detail = r.json().get("detail")
        except Exception:
            detail = r.text
        raise RuntimeError(f"OTP request failed: {r.status_code} {detail}")
    return r.json()


async def otp_verify(user_id: int, email: str, code: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"{OTP_SERVICE_BASE}/otp/verify",
            json={"user_id": user_id, "email": email, "code": code},
        )
    if r.status_code != 200:
        try:
            detail = r.json().get("detail")
        except Exception:
            detail = r.text
        raise RuntimeError(f"OTP verify failed: {r.status_code} {detail}")
    return r.json()

def upsert_user_email(user_id: int, email: str):
    now = int(time.time())
    with sqlite3.connect("results.db") as db:
        cur = db.cursor()
        cur.execute("""
            INSERT INTO users (user_id, created_at, email, verified_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                email=excluded.email,
                verified_at=excluded.verified_at
        """, (user_id, now, email, now))
        db.commit()

async def otp_mark_used(user_id: int) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(
            f"{OTP_SERVICE_BASE}/otp/mark_used",
            json={"user_id": user_id},
        )


def degree_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Бакалавр", callback_data="deg_bach"),
            InlineKeyboardButton(text="Магистр", callback_data="deg_mast"),
            InlineKeyboardButton(text="Аспирант", callback_data="deg_phd"),
        ],
        [InlineKeyboardButton(text="Другое", callback_data="deg_other")]
    ])

def consent_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Да, хочу", callback_data="consent_yes"),
        InlineKeyboardButton(text="Нет", callback_data="consent_no"),
    ]])

def course_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="1", callback_data="course_1"),
            InlineKeyboardButton(text="2", callback_data="course_2"),
            InlineKeyboardButton(text="3", callback_data="course_3"),
            InlineKeyboardButton(text="4", callback_data="course_4"),
        ],
        [
            InlineKeyboardButton(text="5", callback_data="course_5"),
            InlineKeyboardButton(text="6", callback_data="course_6"),
            InlineKeyboardButton(text="Выпускник", callback_data="course_grad"),
        ],
        [InlineKeyboardButton(text="Другое", callback_data="course_other")],
    ])

def gpa_kb(prefix: str) -> InlineKeyboardMarkup:
    # prefix: "gpa", "ms", "ec", "ml"
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Топ 5%", callback_data=f"{prefix}_top5"),
            InlineKeyboardButton(text="Топ 10%", callback_data=f"{prefix}_top10"),
        ],
        [
            InlineKeyboardButton(text="Топ 25%", callback_data=f"{prefix}_top25"),
            InlineKeyboardButton(text="50%+", callback_data=f"{prefix}_50p"),
        ],
        [InlineKeyboardButton(text="Не знаю", callback_data=f"{prefix}_unk")],
    ])


# =========================
#   ХЭНДЛЕРЫ
# =========================

@dp.message(Command("start"))
async def cmd_start(message: types.Message, state: FSMContext):
    await state.clear()
    await state.set_state(Auth.waiting_full_name)
    await message.answer("Привет! Давай заполним короткую анкету.\n\n Введи ФИО:")

@dp.message(Auth.waiting_full_name)
async def handle_full_name(message: types.Message, state: FSMContext):
    full_name = message.text.strip()
    if len(full_name) < 3:
        await message.answer("ФИО слишком короткое. Введи нормально, пожалуйста")
        return

    await state.update_data(full_name=full_name)
    await state.set_state(Auth.waiting_org)
    await message.answer("Вуз / место работы:")

@dp.message(Auth.waiting_org)
async def handle_org(message: types.Message, state: FSMContext):
    org_raw = message.text.strip()
    if len(org_raw) < 2:
        await message.answer("Слишком коротко. Напиши вуз/место работы ещё раз.")
        return

    cluster_id, org_norm = get_or_create_org_cluster(org_raw)
    await state.update_data(org_raw=org_raw, org_norm=org_norm, org_cluster_id=cluster_id)

    await state.set_state(Auth.waiting_faculty)
    await message.answer("Теперь факультет / подразделение:")

@dp.message(Auth.waiting_faculty)
async def handle_faculty(message: types.Message, state: FSMContext):
    faculty_raw = message.text.strip()
    if len(faculty_raw) < 2:
        await message.answer("Слишком коротко. Напиши ещё раз.")
        return

    cluster_id, faculty_norm = get_or_create_faculty_cluster(faculty_raw)
    await state.update_data(
        faculty_raw=faculty_raw,
        faculty_norm=faculty_norm,
        faculty_cluster_id=cluster_id
    )

    await state.set_state(Auth.waiting_degree)
    await message.answer("Степень:", reply_markup=degree_kb())

@dp.callback_query(F.data.in_({"deg_bach", "deg_mast", "deg_phd", "deg_other"}))
async def on_degree(call: types.CallbackQuery, state: FSMContext):
    mapping = {
        "deg_bach": "bachelor",
        "deg_mast": "master",
        "deg_phd": "phd",
        "deg_other": "other",
    }
    degree = mapping[call.data]

    await state.update_data(degree=degree)
    await call.answer()
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    await state.set_state(Auth.waiting_course)
    await call.message.answer("Курс / год обучения:", reply_markup=course_kb())

@dp.callback_query(F.data.in_({
    "course_1","course_2","course_3","course_4","course_5","course_6",
    "course_grad","course_other"
}))
async def on_course(call: types.CallbackQuery, state: FSMContext):
    mapping = {
        "course_1": "1",
        "course_2": "2",
        "course_3": "3",
        "course_4": "4",
        "course_5": "5",
        "course_6": "6",
        "course_grad": "graduate",
        "course_other": "other",
    }
    course = mapping[call.data]

    await state.update_data(course=course)
    await call.answer()
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    await state.set_state(Auth.waiting_gpa_quantile)
    await call.message.answer("Твой общий GPA (примерно). Выбери квантиль:", reply_markup=gpa_kb("gpa"))



@dp.callback_query(F.data.in_({"gpa_top5","gpa_top10","gpa_top25","gpa_50p","gpa_unk"}))
async def on_gpa_quantile(call: types.CallbackQuery, state: FSMContext):
    mapping = {
        "gpa_top5": "top5",
        "gpa_top10": "top10",
        "gpa_top25": "top25",
        "gpa_50p": "50p",
        "gpa_unk": "unknown",
    }
    await state.update_data(gpa_quantile=mapping[call.data])

    await call.answer()
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    await state.set_state(Auth.waiting_gpa_mathstat)
    await call.message.answer("GPA по матстату (примерно). Выбери квантиль:", reply_markup=gpa_kb("ms"))

@dp.callback_query(F.data.in_({"ms_top5","ms_top10","ms_top25","ms_50p","ms_unk"}))
async def on_gpa_mathstat(call: types.CallbackQuery, state: FSMContext):
    mapping = {
        "ms_top5": "top5",
        "ms_top10": "top10",
        "ms_top25": "top25",
        "ms_50p": "50p",
        "ms_unk": "unknown",
    }
    await state.update_data(gpa_mathstat=mapping[call.data])

    await call.answer()
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    await state.set_state(Auth.waiting_gpa_econometrics)
    await call.message.answer("GPA по эконометрике (примерно). Выбери квантиль:", reply_markup=gpa_kb("ec"))

@dp.callback_query(F.data.in_({"ec_top5","ec_top10","ec_top25","ec_50p","ec_unk"}))
async def on_gpa_econometrics(call: types.CallbackQuery, state: FSMContext):
    mapping = {
        "ec_top5": "top5",
        "ec_top10": "top10",
        "ec_top25": "top25",
        "ec_50p": "50p",
        "ec_unk": "unknown",
    }
    await state.update_data(gpa_econometrics=mapping[call.data])

    await call.answer()
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    await state.set_state(Auth.waiting_gpa_ml)
    await call.message.answer("GPA по ML (примерно). Выбери квантиль:", reply_markup=gpa_kb("ml"))

@dp.callback_query(F.data.in_({"ml_top5","ml_top10","ml_top25","ml_50p","ml_unk"}))
async def on_gpa_ml(call: types.CallbackQuery, state: FSMContext):
    mapping = {
        "ml_top5": "top5",
        "ml_top10": "top10",
        "ml_top25": "top25",
        "ml_50p": "50p",
        "ml_unk": "unknown",
    }
    await state.update_data(gpa_ml=mapping[call.data])

    
    data = await state.get_data()
    upsert_user_profile(call.from_user.id, data)

    await call.answer()
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    await state.set_state(Auth.consent)
    await call.message.answer(
        "Хочешь участвовать в розыгрыше и попасть в рейтинг?",
        reply_markup=consent_kb(),
    )

NICK_RE = re.compile(r"^[a-zA-Z0-9_]{3,16}$")



@dp.callback_query(F.data.in_({"consent_yes", "consent_no"}))
async def on_consent(call: types.CallbackQuery, state: FSMContext):
    wants = call.data == "consent_yes"
    upsert_user_consent(call.from_user.id, wants)

    await call.answer()
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    await state.set_state(Auth.waiting_nickname)
    await call.message.answer(
        "Придумай никнейм (3–16 символов, латиница/цифры/_). Например: аноним_007"
    )

@dp.message(Auth.waiting_email)
async def handle_email(message: types.Message, state: FSMContext):
    email = message.text.strip().lower()

    if not is_valid_email(email):
        await message.answer("Похоже, это не email. Введи, пожалуйста, ещё раз.")
        return

    # пробуем отправить код
    try:
        resp = await otp_request(message.from_user.id, email)
    except Exception as e:
        msg = str(e)
        if "403" in msg and "already participated" in msg:
            await message.answer("Этот email уже участвовал в эксперименте - повторно пройти нельзя.")
            return

        await message.answer(f"Не получилось отправить письмо\n{e}")
        return

    await state.update_data(email=email)
    await state.set_state(Auth.waiting_code)

    expires_in = resp.get("expires_in", 600)
    await message.answer(
        f"Код отправлен на {email}\n"
        f"Введи 6 цифр (код живёт {expires_in//60} минут)."
    )


def upsert_user_consent(user_id: int, wants: bool):
    with sqlite3.connect("results.db") as db:
        cur = db.cursor()
        cur.execute("""
            INSERT INTO users (user_id, created_at, wants_raffle, wants_leaderboard)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              wants_raffle=excluded.wants_raffle,
              wants_leaderboard=excluded.wants_leaderboard
        """, (user_id, int(time.time()), int(wants), int(wants)))
        db.commit()

def nickname_exists(nick: str) -> bool:
    with sqlite3.connect("results.db") as db:
        cur = db.cursor()
        cur.execute("SELECT 1 FROM users WHERE nickname=?", (nick,))
        return cur.fetchone() is not None

def set_user_nickname(user_id: int, nick: str):
    with sqlite3.connect("results.db") as db:
        cur = db.cursor()
        cur.execute("UPDATE users SET nickname=? WHERE user_id=?", (nick, user_id))
        db.commit()

@dp.message(Auth.waiting_code)
async def handle_code(message: types.Message, state: FSMContext):
    code = message.text.strip()
    data = await state.get_data()
    email = data.get("email")

    if not email:
        await state.set_state(Auth.waiting_email)
        await message.answer("Потерял email! Введи почту ещё раз.")
        return

    if not code.isdigit() or len(code) != 6:
        await message.answer("Код должен быть из 6 цифр. Введи ещё раз.")
        return

    try:
        await otp_verify(message.from_user.id, email, code)
    except Exception as e:
        msg = str(e)
        if "Code expired" in msg:
            await state.set_state(Auth.waiting_email)
            await message.answer("Код истёк. Введи email ещё раз - я пришлю новый код.")
            return
        if "Invalid code" in msg:
            await message.answer("Неверный код. Попробуй ещё раз.")
            return
        if "Too many attempts" in msg:
            await state.set_state(Auth.waiting_email)
            await message.answer("Слишком много попыток. Введи email ещё раз - я пришлю новый код.")
            return

        await message.answer(f"Не получилось проверить код\n{e}")
        return

    upsert_user_email(message.from_user.id, email)

    await state.clear()
    await message.answer(
        "Готово! Доступ открыт. Жми кнопку внизу",
        reply_markup=get_webapp_keyboard(message.from_user.id),
    )



@dp.message(F.web_app_data)
async def web_app_data_handler(message: types.Message):
    user_id = message.from_user.id
    raw = message.web_app_data.data

    try:
        payload = json.loads(raw)
    except Exception:
        print("WEBAPP DATA NOT JSON:", raw)
        await message.answer("Спасибо за прохождение!")
        return

    if not isinstance(payload, dict):
        print("WEBAPP DATA NOT DICT:", payload)
        await message.answer("Спасибо за прохождение!")
        return

    # сохраняем любой payload (новый формат: totalScore/avgScore/rounds)
    save_results(user_id, payload)

    # помечаем email used (если ты это уже добавила)
    try:
        await otp_mark_used(user_id)
    except Exception as e:
        print("otp_mark_used failed:", e)

    await message.answer(
        "Спасибо за прохождение!",
        reply_markup=ReplyKeyboardRemove()
    )

@dp.message(Auth.waiting_nickname)
async def handle_nickname(message: types.Message, state: FSMContext):
    nick = message.text.strip()

    if not NICK_RE.match(nick):
        await message.answer("Ник должен быть 3–16 символов: латиница, цифры или _. Попробуй ещё раз.")
        return

    if nickname_exists(nick):
        await message.answer("Этот ник уже занят. Придумай другой.")
        return

    try:
        set_user_nickname(message.from_user.id, nick)
    except sqlite3.IntegrityError:
        await message.answer("Этот ник только что заняли. Придумай другой.")
        return

    await state.set_state(Auth.waiting_email)
    await message.answer("Теперь введи email — я пришлю одноразовый код (10 минут).")

# =========================
#   ЗАПУСК БОТА
# =========================
async def main():
    global BASE_WEBAPP_URL, bot

    print("Бот запустился...")
    init_db()

    BASE_WEBAPP_URL = "https://wicked-chicken-stick.loca.lt"
    print("PUBLIC WEBAPP URL:", BASE_WEBAPP_URL)

    session = AiohttpSession(timeout=60)
    bot = Bot(token=API_TOKEN, session=session)

    try:
        await bot.delete_webhook(drop_pending_updates=True)
    except Exception as e:
        print("delete_webhook failed:", e)

    try:
        await dp.start_polling(bot)
    except Exception as e:
        print("start_polling failed:", e)

if __name__ == "__main__":
    asyncio.run(main())