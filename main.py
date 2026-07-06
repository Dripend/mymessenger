from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pathlib import Path
from datetime import datetime, timedelta
from pydantic import BaseModel
import logging
import bcrypt
from jose import jwt, JWTError

from database import init_db, get_session
import crud

SECRET_KEY = "change-me-in-production-use-openssl-rand-hex-32"
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    pwd_bytes = plain.encode('utf-8')[:72]
    return bcrypt.checkpw(pwd_bytes, hashed.encode('utf-8'))


def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


class AuthRequest(BaseModel):
    username: str
    password: str


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Мессенджер")

static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")

connected_users: dict[WebSocket, str] = {}
room_members: dict[str, set[WebSocket]] = {}
username_to_ws: dict[str, WebSocket] = {}


@app.on_event("startup")
def startup():
    init_db()
    logger.info("✅ База данных инициализирована")
    with get_session() as session:
        room = crud.get_room(session, "general")
        if not room:
            crud.create_room(session, "general", "Общий чат", "room", "system")
            logger.info("✅ Создана комната 'Общий чат'")


@app.post("/api/register")
def register(data: AuthRequest):
    username = data.username.strip()
    if len(username) < 2 or len(username) > 20:
        raise HTTPException(400, "Имя должно быть от 2 до 20 символов")
    if len(data.password) < 4:
        raise HTTPException(400, "Пароль должен быть не короче 4 символов")
    
    with get_session() as session:
        if crud.get_user(session, username):
            raise HTTPException(409, "Пользователь уже существует")
        hashed = hash_password(data.password)
        crud.create_user(session, username, hashed)
    
    token = create_token(username)
    logger.info(f"✅ Регистрация: {username}")
    return {"token": token, "username": username}


@app.post("/api/login")
def login(data: AuthRequest):
    username = data.username.strip()
    
    with get_session() as session:
        user = crud.get_user(session, username)
        if not user or not verify_password(data.password, user.hashed_password):
            raise HTTPException(401, "Неверное имя или пароль")
    
    token = create_token(username)
    logger.info(f"✅ Вход: {username}")
    return {"token": token, "username": username}


@app.get("/", response_class=HTMLResponse)
def index():
    return (static_dir / "index.html").read_text(encoding="utf-8")


@app.websocket("/ws")
def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    username = decode_token(token)
    if not username:
        ws.close(code=4001)
        return
    
    with get_session() as session:
        if not crud.get_user(session, username):
            ws.close(code=4001)
            return
    
    ws.accept()
    connected_users[ws] = username
    username_to_ws[username] = ws
    current_room_id: str | None = None
    current_private_with: str | None = None
    logger.info(f"🔌 Подключён: {username}")

    try:
        with get_session() as session:
            rooms = crud.get_all_rooms(session)
            users = crud.get_all_users(session)
            conversations = crud.get_conversations(session, username)
        
        ws.send_json({
            "type": "room_list",
            "data": [{"id": r.id, "name": r.name, "type": r.type} for r in rooms]
        })
        ws.send_json({
            "type": "user_list",
            "data": [
                {
                    "username": u.username,
                    "is_online": u.username in username_to_ws,
                    "has_conversation": any(c["username"] == u.username for c in conversations)
                }
                for u in users if u.username != username
            ]
        })

        while True:
            data = ws.receive_json()
            msg_type = data.get("type")
            logger.info(f"📨 [{username}] {msg_type}")

            if msg_type == "join_room":
                room_id = data.get("room_id")
                current_private_with = None
                
                with get_session() as session:
                    room = crud.get_room(session, room_id)
                    if room:
                        if current_room_id and current_room_id in room_members:
                            room_members[current_room_id].discard(ws)
                        current_room_id = room_id
                        if room_id not in room_members:
                            room_members[room_id] = set()
                        room_members[room_id].add(ws)
                        
                        history = crud.get_room_history(session, room_id)
                        history_data = [
                            {"user": m.username, "text": m.text, "time": m.created_at.strftime("%H:%M")}
                            for m in history
                        ]
                        ws.send_json({
                            "type": "room_joined",
                            "data": {
                                "id": room.id, "name": room.name,
                                "room_type": room.type,
                                "is_owner": room.owner_username == username,
                                "history": history_data
                            }
                        })

            elif msg_type == "create_room":
                room_name = data.get("name", "").strip()[:50]
                room_type = data.get("roomType", "room")
                if room_type not in ("room", "channel"):
                    room_type = "room"
                if not room_name:
                    continue
                room_id = f"room_{int(datetime.now().timestamp())}"
                
                with get_session() as session:
                    crud.create_room(session, room_id, room_name, room_type, username)
                
                for conn in list(connected_users.keys()):
                    try:
                        conn.send_json({
                            "type": "room_created",
                            "data": {"id": room_id, "name": room_name, "type": room_type}
                        })
                    except:
                        pass
                
                if current_room_id and current_room_id in room_members:
                    room_members[current_room_id].discard(ws)
                current_room_id = room_id
                current_private_with = None
                if room_id not in room_members:
                    room_members[room_id] = set()
                room_members[room_id].add(ws)
                ws.send_json({
                    "type": "room_joined",
                    "data": {"id": room_id, "name": room_name, "room_type": room_type, "is_owner": True, "history": []}
                })

            elif msg_type == "message":
                if not current_room_id:
                    continue
                with get_session() as session:
                    room = crud.get_room(session, current_room_id)
                    if not room:
                        continue
                    if room.type == "channel" and room.owner_username != username:
                        ws.send_json({"type": "error", "text": "Только владелец канала может писать"})
                        continue
                    text = data.get("text", "").strip()[:500]
                    if not text:
                        continue
                    crud.save_message(session, current_room_id, username, text)
                
                msg = {
                    "type": "message", "user": username, "text": text,
                    "time": datetime.now().strftime("%H:%M"),
                    "room_id": current_room_id
                }
                if current_room_id in room_members:
                    for member in room_members[current_room_id].copy():
                        try:
                            member.send_json(msg)
                        except:
                            room_members[current_room_id].discard(member)

            elif msg_type == "open_private":
                target = data.get("username")
                if not target or target == username:
                    continue
                
                if current_room_id and current_room_id in room_members:
                    room_members[current_room_id].discard(ws)
                current_room_id = None
                current_private_with = target
                
                with get_session() as session:
                    target_user = crud.get_user(session, target)
                    if not target_user:
                        ws.send_json({"type": "error", "text": "Пользователь не найден"})
                        continue
                    
                    history = crud.get_private_history(session, username, target)
                    history_data = [
                        {
                            "from": m.from_user,
                            "to": m.to_user,
                            "text": m.text,
                            "time": m.created_at.strftime("%H:%M")
                        }
                        for m in history
                    ]
                    ws.send_json({
                        "type": "private_opened",
                        "data": {
                            "username": target,
                            "is_online": target in username_to_ws,
                            "history": history_data
                        }
                    })

            elif msg_type == "private_message":
                target = data.get("to")
                text = data.get("text", "").strip()[:500]
                if not target or not text or target == username:
                    continue
                
                with get_session() as session:
                    target_user = crud.get_user(session, target)
                    if not target_user:
                        ws.send_json({"type": "error", "text": "Получатель не найден"})
                        continue
                    crud.save_private_message(session, username, target, text)
                
                msg = {
                    "type": "private_message",
                    "from": username,
                    "to": target,
                    "text": text,
                    "time": datetime.now().strftime("%H:%M")
                }
                ws.send_json(msg)
                if target in username_to_ws:
                    try:
                        username_to_ws[target].send_json(msg)
                    except:
                        pass

            elif msg_type == "typing":
                if current_room_id and current_room_id in room_members:
                    for member in room_members[current_room_id].copy():
                        if member != ws:
                            try:
                                member.send_json({
                                    "type": "typing", "user": username,
                                    "room_id": current_room_id
                                })
                            except:
                                room_members[current_room_id].discard(member)

    except WebSocketDisconnect:
        logger.info(f"🔌 Отключился: {username}")
        if current_room_id and current_room_id in room_members:
            room_members[current_room_id].discard(ws)
        connected_users.pop(ws, None)
        username_to_ws.pop(username, None)
        
        for conn in list(connected_users.keys()):
            try:
                conn.send_json({
                    "type": "user_offline",
                    "data": {"username": username}
                })
            except:
                pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
