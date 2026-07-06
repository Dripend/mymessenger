from sqlalchemy.orm import Session
from database import User, Room, Message, PrivateMessage
from sqlalchemy import or_, and_
from typing import Optional


# === Пользователи ===

def create_user(session: Session, username: str, hashed_password: str) -> User:
    user = User(username=username, hashed_password=hashed_password)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def get_user(session: Session, username: str) -> Optional[User]:
    return session.query(User).filter(User.username == username).first()


def get_all_users(session: Session) -> list[User]:
    return session.query(User).all()


# === Комнаты ===

def create_room(session: Session, room_id: str, name: str, room_type: str, owner: str) -> Room:
    room = Room(id=room_id, name=name, type=room_type, owner_username=owner)
    session.add(room)
    session.commit()
    session.refresh(room)
    return room


def get_all_rooms(session: Session) -> list[Room]:
    return session.query(Room).all()


def get_room(session: Session, room_id: str) -> Optional[Room]:
    return session.query(Room).filter(Room.id == room_id).first()


# === Сообщения в комнатах ===

def save_message(session: Session, room_id: str, username: str, text: str) -> Message:
    msg = Message(room_id=room_id, username=username, text=text)
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return msg


def get_room_history(session: Session, room_id: str, limit: int = 100) -> list[Message]:
    messages = session.query(Message)\
        .filter(Message.room_id == room_id)\
        .order_by(Message.created_at.desc())\
        .limit(limit)\
        .all()
    return list(reversed(messages))


# === Личные сообщения ===

def save_private_message(session: Session, from_user: str, to_user: str, text: str) -> PrivateMessage:
    msg = PrivateMessage(from_user=from_user, to_user=to_user, text=text)
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return msg


def get_private_history(session: Session, user1: str, user2: str, limit: int = 100) -> list[PrivateMessage]:
    messages = session.query(PrivateMessage)\
        .filter(
            or_(
                and_(PrivateMessage.from_user == user1, PrivateMessage.to_user == user2),
                and_(PrivateMessage.from_user == user2, PrivateMessage.to_user == user1)
            )
        )\
        .order_by(PrivateMessage.created_at.desc())\
        .limit(limit)\
        .all()
    return list(reversed(messages))


def get_conversations(session: Session, username: str) -> list[dict]:
    messages = session.query(PrivateMessage)\
        .filter(
            or_(PrivateMessage.from_user == username, PrivateMessage.to_user == username)
        )\
        .order_by(PrivateMessage.created_at.desc())\
        .all()
    
    conversations = {}
    for msg in messages:
        other = msg.to_user if msg.from_user == username else msg.from_user
        if other not in conversations:
            conversations[other] = msg.created_at
    
    return [{"username": u, "last_message": t} for u, t in conversations.items()]
