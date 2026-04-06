from pydantic import BaseModel
from typing import Any


class ProfileCreate(BaseModel):
    full_name: str
    org_raw: str
    faculty_raw: str
    degree: str
    course: str
    gpa_quantile: str
    gpa_mathstat: str
    gpa_econometrics: str
    gpa_ml: str
    wants_raffle: bool = False
    wants_leaderboard: bool = False
    email: str = ""


class EmailAttach(BaseModel):
    user_id: int
    email: str


class ResultSave(BaseModel):
    user_id: int
    payload: dict[str, Any]

from pydantic import BaseModel
from typing import Any


class ProfileCreate(BaseModel):
    full_name: str
    org_raw: str
    faculty_raw: str
    degree: str
    course: str
    gpa_quantile: str
    gpa_mathstat: str
    gpa_econometrics: str
    gpa_ml: str
    wants_raffle: bool = False
    wants_leaderboard: bool = False
    email: str = ""


class EmailAttach(BaseModel):
    user_id: int
    email: str


class ResultSave(BaseModel):
    user_id: int
    payload: dict[str, Any]


class RewardSave(BaseModel):
    user_id: int
    amount_rub: int
    full_name: str
    bank_name: str
    payout_phone: str
    consent_personal_data: bool