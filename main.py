from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pathlib import Path
from datetime import datetime, timedelta
from pydantic import BaseModel
import logging
import bcrypt
from jose import jwt, JWTError

from database import init_db, get_session
import crud

SECRET_KEY = "change-me-in-production"
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.delete("/api/messages/{message_id}")
def delete_message(message_id: int, token: str = Query(...)):
    username = decode_token(token)
    if not username:
        raise HTTPException(401, "Не авторизован")
    
    with get_session() as session:
        if crud.delete_message(session, message_id, username):
            return {"status": "ok", "type": "room"}
        if crud.delete_private_message(session, message_id, username):
            return {"status": "ok", "type": "private"}
    
    raise HTTPException(404, "Сообщение не найдено или вы не автор")


@app.get("/", response_class=HTMLResponse)
def index():
    return (static_dir / "index.html").read_text(encoding="utf-8")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    await ws.accept()
    
    username = decode_token(token)
    if not username:
        await ws.close(code=4001)
        return
    
    def check_user():
        with get_session() as session:
            return crud.get_user(session, username)
    
    user = await run_in_threadpool(check_user)
    if not user:
        await ws.close(code=4001)
        return
    
    connected_users[ws] = username
    username_to_ws[username] = ws
    current_room_id: str | None = None
    current_private_with: str | None = None
    logger.info(f"🔌 Подключён: {username}")

    try:
        def load_initial():
            with get_session() as session:
                rooms = crud.get_all_rooms(session)
                users = crud.get_all_users(session)
                conversations = crud.get_conversations(session, username)
                
                rooms_data = [{"id": r.id, "name": r.name, "type": r.type} for r in rooms]
                users_data = [
                    {
                        "username": u.username,
                        "is_online": u.username in username_to_ws,
                    }
                    for u in users if u.username != username
                ]
                return rooms_data, users_data
        
        rooms_data, users_data = await run_in_threadpool(load_initial)
        
        await ws.send_json({"type": "room_list", "data": rooms_data})
        await ws.send_json({"type": "user_list", "data": users_data})

        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")
            logger.info(f"📨 [{username}] {msg_type}")

            if msg_type == "join_room":
                room_id = data.get("room_id")
                current_private_with = None
                
                def load_room():
                    with get_session() as session:
                        room = crud.get_room(session, room_id)
                        if not room:
                            return None
                        history = crud.get_room_history(session, room_id)
                        return {
                            "id": room.id,
                            "name": room.name,
                            "room_type": room.type,
                            "is_owner": room.owner_username == username,
                            "history": [
                                {"user": m.username, "text": m.text, "time": m.created_at.strftime("%H:%M"), "id": m.id}
                                for m in history
                            ]
                        }
                
                room_data = await run_in_threadpool(load_room)
                if room_data:
                    if current_room_id and current_room_id in room_members:
                        room_members[current_room_id].discard(ws)
                    current_room_id = room_id
                    if room_id not in room_members:
                        room_members[room_id] = set()
                    room_members[room_id].add(ws)
                    await ws.send_json({"type": "room_joined", "data": room_data})

            elif msg_type == "create_room":
                room_name = data.get("name", "").strip()[:50]
                room_type = data.get("roomType", "room")
                if room_type not in ("room", "channel"):
                    room_type = "room"
                if not room_name:
                    continue
                room_id = f"room_{int(datetime.now().timestamp())}"
                
                def create_room_db():
                    with get_session() as session:
                        crud.create_room(session, room_id, room_name, room_type, username)
                
                await run_in_threadpool(create_room_db)
                
                for conn in list(connected_users.keys()):
                    try:
                        await conn.send_json({
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
                
                await ws.send_json({
                    "type": "room_joined",
                    "data": {"id": room_id, "name": room_name, "room_type": room_type, "is_owner": True, "history": []}
                })

            elif msg_type == "message":
                if not current_room_id:
                    continue
                
                def save_msg():
                    with get_session() as session:
                        room = crud.get_room(session, current_room_id)
                        if not room:
                            return None, None, None
                        if room.type == "channel" and room.owner_username != username:
                            return "error", "Только владелец канала может писать", None
                        text = data.get("text", "").strip()[:500]
                        if not text:
                            return None, None, None
                        saved_msg = crud.save_message(session, current_room_id, username, text)
                        return "ok", text, saved_msg.id
                
                status, result, msg_id = await run_in_threadpool(save_msg)
                if status == "error":
                    await ws.send_json({"type": "error", "text": result})
                    continue
                if status != "ok":
                    continue
                
                msg = {
                    "type": "message", "user": username, "text": result,
                    "time": datetime.now().strftime("%H:%M"),
                    "room_id": current_room_id,
                    "id": msg_id
                }
                if current_room_id in room_members:
                    for member in room_members[current_room_id].copy():
                        try:
                            await member.send_json(msg)
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
                
                def load_private():
                    with get_session() as session:
                        target_user = crud.get_user(session, target)
                        if not target_user:
                            return None
                        history = crud.get_private_history(session, username, target)
                        return {
                            "username": target,
                            "is_online": target in username_to_ws,
                            "history": [
                                {
                                    "from": m.from_user,
                                    "to": m.to_user,
                                    "text": m.text,
                                    "time": m.created_at.strftime("%H:%M"),
                                    "id": m.id
                                }
                                for m in history
                            ]
                        }
                
                private_data = await run_in_threadpool(load_private)
                if not private_data:
                    await ws.send_json({"type": "error", "text": "Пользователь не найден"})
                    continue
                await ws.send_json({"type": "private_opened", "data": private_data})

            elif msg_type == "private_message":
                target = data.get("to")
                text = data.get("text", "").strip()[:500]
                if not target or not text or target == username:
                    continue
                
                def send_private():
                    with get_session() as session:
                        target_user = crud.get_user(session, target)
                        if not target_user:
                            return False, None
                        saved_msg = crud.save_private_message(session, username, target, text)
                        return True, saved_msg.id
                
                success, msg_id = await run_in_threadpool(send_private)
                if not success:
                    await ws.send_json({"type": "error", "text": "Получатель не найден"})
                    continue
                
                msg = {
                    "type": "private_message",
                    "from": username,
                    "to": target,
                    "text": text,
                    "time": datetime.now().strftime("%H:%M"),
                    "id": msg_id
                }
                await ws.send_json(msg)
                if target in username_to_ws:
                    try:
                        await username_to_ws[target].send_json(msg)
                    except:
                        pass

            elif msg_type == "delete_message":
                message_id = data.get("id")
                if not message_id:
                    continue
                
                def do_delete():
                    with get_session() as session:
                        if crud.delete_message(session, message_id, username):
                            return "room"
                        if crud.delete_private_message(session, message_id, username):
                            return "private"
                        return None
                
                result = await run_in_threadpool(do_delete)
                if result:
                    delete_event = {
                        "type": "message_deleted",
                        "id": message_id,
                        "deleted_by": username
                    }
                    
                    if result == "room" and current_room_id in room_members:
                        for member in room_members[current_room_id].copy():
                            try:
                                await member.send_json(delete_event)
                            except:
                                room_members[current_room_id].discard(member)
                    else:
                        await ws.send_json(delete_event)
                        if current_private_with and current_private_with in username_to_ws:
                            try:
                                await username_to_ws[current_private_with].send_json(delete_event)
                            except:
                                pass

            elif msg_type == "typing":
                if current_room_id and current_room_id in room_members:
                    for member in room_members[current_room_id].copy():
                        if member != ws:
                            try:
                                await member.send_json({
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
                await conn.send_json({
                    "type": "user_offline",
                    "data": {"username": username}
                })
            except:
                pass


if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
