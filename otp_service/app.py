# otp_service/app.py
import os
import re
import time
import sqlite3
import secrets
import hashlib
from email.message import EmailMessage

import aiosmtplib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from dotenv import load_dotenv
load_dotenv()

# =========================
#   НАСТРОЙКИ (заполни)
# =========================
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")  # для Gmail нужен App Password
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)

OTP_TTL_SECONDS = 10 * 60
OTP_LENGTH = 6
OTP_MAX_ATTEMPTS = 5
OTP_MIN_RESEND_SECONDS = 60

import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("OTP_DB_PATH", os.path.join(BASE_DIR, "otp.db"))

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


# =========================
#   БАЗА
# =========================
def init_db():
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS email_otp (
                user_id       INTEGER PRIMARY KEY,
                email         TEXT NOT NULL,
                code_hash     TEXT NOT NULL,
                expires_at    INTEGER NOT NULL,
                attempts      INTEGER NOT NULL DEFAULT 0,
                last_sent_at  INTEGER NOT NULL DEFAULT 0,
                verified      INTEGER NOT NULL DEFAULT 0
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS used_emails (
                email   TEXT PRIMARY KEY,
                used_at INTEGER NOT NULL
            )
        """)

        db.commit()


def get_row(user_id: int):
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("""
            SELECT email, code_hash, expires_at, attempts, last_sent_at, verified
            FROM email_otp WHERE user_id=?
        """, (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        return {
            "email": row[0],
            "code_hash": row[1],
            "expires_at": row[2],
            "attempts": row[3],
            "last_sent_at": row[4],
            "verified": bool(row[5]),
        }


def upsert_code(user_id: int, email: str, code_hash: str, expires_at: int):
    now = int(time.time())
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("""
            INSERT INTO email_otp (user_id, email, code_hash, expires_at, attempts, last_sent_at, verified)
            VALUES (?, ?, ?, ?, 0, ?, 0)
            ON CONFLICT(user_id) DO UPDATE SET
                email=excluded.email,
                code_hash=excluded.code_hash,
                expires_at=excluded.expires_at,
                attempts=0,
                last_sent_at=excluded.last_sent_at,
                verified=0
        """, (user_id, email, code_hash, expires_at, now))
        db.commit()


def inc_attempts(user_id: int):
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("UPDATE email_otp SET attempts = attempts + 1 WHERE user_id=?", (user_id,))
        db.commit()


def mark_verified(user_id: int):
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("UPDATE email_otp SET verified=1 WHERE user_id=?", (user_id,))
        db.commit()


# =========================
#   OTP логика
# =========================
def is_valid_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email.strip().lower()))


def generate_code() -> str:
    n = secrets.randbelow(10 ** OTP_LENGTH)
    return str(n).zfill(OTP_LENGTH)


def hash_code(user_id: int, code: str) -> str:
    s = f"{user_id}:{code}".encode("utf-8")
    return hashlib.sha256(s).hexdigest()


async def send_email(to_email: str, code: str):
    if not SMTP_USER or not SMTP_PASS or not FROM_EMAIL:
        raise RuntimeError("SMTP credentials are not set (SMTP_USER/SMTP_PASS/FROM_EMAIL).")

    msg = EmailMessage()
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = "Your login code (valid 10 minutes)"
    msg.set_content(
        f"Your one-time code: {code}\n\n"
        f"It is valid for 10 minutes.\n"
        f"If you didn't request this, ignore the message."
    )

    await aiosmtplib.send(
        msg,
        hostname=SMTP_HOST,
        port=SMTP_PORT,
        start_tls=True,
        username=SMTP_USER,
        password=SMTP_PASS,
    )


# =========================
#   API
# =========================
app = FastAPI(title="Email OTP Service")

class OtpRequest(BaseModel):
    user_id: int
    email: str

class OtpVerify(BaseModel):
    user_id: int
    email: str
    code: str

@app.on_event("startup")
def _startup():
    init_db()


@app.post("/otp/request")
async def otp_request(body: OtpRequest):
    email = body.email.strip().lower()
    if not is_valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email")

    # запрет повторного участия по email
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("SELECT 1 FROM used_emails WHERE email=?", (email,))
        if cur.fetchone():
            raise HTTPException(status_code=403, detail="This email has already participated")

    row = get_row(body.user_id)
    now = int(time.time())
    if row and (now - row["last_sent_at"] < OTP_MIN_RESEND_SECONDS):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")

    code = generate_code()
    expires_at = now + OTP_TTL_SECONDS
    code_hash = hash_code(body.user_id, code)

    upsert_code(body.user_id, email, code_hash, expires_at)

    try:
        await send_email(email, code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {type(e).__name__}")

    return {"ok": True, "expires_in": OTP_TTL_SECONDS}

def invalidate_otp(user_id: int):
    # делаем код одноразовым: после успешной верификации он больше не годится
    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute("""
            UPDATE email_otp
            SET code_hash='', expires_at=0, attempts=0
            WHERE user_id=?
        """, (user_id,))
        db.commit()


@app.post("/otp/verify")
async def otp_verify(body: OtpVerify):
    email = body.email.strip().lower()
    code = body.code.strip()

    row = get_row(body.user_id)
    if not row:
        raise HTTPException(status_code=400, detail="No OTP requested")

    if row["email"] != email:
        raise HTTPException(status_code=400, detail="Email mismatch")

    now = int(time.time())
    if now > row["expires_at"]:
        raise HTTPException(status_code=400, detail="Code expired")

    if row["attempts"] >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts")

    if hash_code(body.user_id, code) != row["code_hash"]:
        inc_attempts(body.user_id)
        raise HTTPException(status_code=400, detail="Invalid code")

    # успех
    mark_verified(body.user_id)
    invalidate_otp(body.user_id)  # <- ключевое: код больше не работает

    return {"ok": True, "verified": True}

class MarkUsed(BaseModel):
    user_id: int

@app.post("/otp/mark_used")
def mark_used(body: MarkUsed):
    row = get_row(body.user_id)
    if not row:
        raise HTTPException(status_code=400, detail="No OTP row for this user")

    email = row["email"].strip().lower()

    with sqlite3.connect(DB_PATH) as db:
        cur = db.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO used_emails(email, used_at) VALUES(?, ?)",
            (email, int(time.time()))
        )
        db.commit()

    return {"ok": True}