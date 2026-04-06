from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.schemas import ProfileCreate, EmailAttach, ResultSave
from backend.db import (
    init_db,
    upsert_user_profile,
    attach_email_to_user,
    save_results,
    get_leaderboard,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # потом сузишь
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/profile/create")
def profile_create(data: ProfileCreate):
    user_id, participant_id = upsert_user_profile(data.model_dump())
    return {
        "ok": True,
        "user_id": user_id,
        "participant_id": participant_id,
    }


@app.post("/user/attach-email")
def user_attach_email(data: EmailAttach):
    attach_email_to_user(data.user_id, data.email)
    return {"ok": True}


@app.post("/results/save")
def results_save(data: ResultSave):
    save_results(data.user_id, data.payload)
    return {"ok": True}


@app.get("/leaderboard")
def leaderboard(limit: int = 50):
    items = get_leaderboard(limit=limit)
    for i, row in enumerate(items, start=1):
        row["rank"] = i
    return {"items": items}

from backend.schemas import ProfileCreate, EmailAttach, ResultSave, RewardSave
from backend.db import (
    init_db,
    upsert_user_profile,
    attach_email_to_user,
    save_results,
    get_leaderboard,
    save_reward_request,
)

@app.post("/reward/save")
def reward_save(data: RewardSave):
    save_reward_request(data.model_dump())
    return {"ok": True}

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.schemas import ProfileCreate, EmailAttach, ResultSave, RewardSave
from backend.db import (
    init_db,
    upsert_user_profile,
    attach_email_to_user,
    save_results,
    save_reward_request,
    get_leaderboard,
    get_university_groups,
    get_faculty_groups,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/profile/create")
def profile_create(data: ProfileCreate):
    user_id, participant_id = upsert_user_profile(data.model_dump())
    return {
        "ok": True,
        "user_id": user_id,
        "participant_id": participant_id,
    }


@app.post("/user/attach-email")
def user_attach_email(data: EmailAttach):
    attach_email_to_user(data.user_id, data.email)
    return {"ok": True}


@app.post("/results/save")
def results_save(data: ResultSave):
    save_results(data.user_id, data.payload)
    return {"ok": True}


@app.post("/reward/save")
def reward_save(data: RewardSave):
    save_reward_request(data.model_dump())
    return {"ok": True}


@app.get("/leaderboard")
def leaderboard(
    limit: int = 50,
    org_cluster_id: int | None = Query(default=None),
    faculty_cluster_id: int | None = Query(default=None),
):
    items = get_leaderboard(
        limit=limit,
        org_cluster_id=org_cluster_id,
        faculty_cluster_id=faculty_cluster_id,
    )
    return {"items": items}


@app.get("/leaderboard/universities")
def leaderboard_universities():
    return {"items": get_university_groups()}


@app.get("/leaderboard/faculties")
def leaderboard_faculties():
    return {"items": get_faculty_groups()}