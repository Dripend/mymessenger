from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from database import User, Room, Message, PrivateMessage
from typing import Optional


# === Пользователи ===

async def create_user(session: AsyncSession, username: str, hashed_password: str) -> User:
    user = User(username=username, hashed_password=hashed_password)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def get_user(session: AsyncSession, username: str) -> Optional[User]:
    result = await session.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_all_users(session: AsyncSession) -> list[User]:
    result = await session.execute(select(User))
    return result.scalars().all()


# === Комнаты ===

async def create_room(session: AsyncSession, room_id: str, name: str, room_type: str, owner: str) -> Room:
    room = Room(id=room_id, name=name, type=room_type, owner_username=owner)
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


async def get_all_rooms(session: AsyncSession) -> list[Room]:
    result = await session.execute(select(Room))
    return result.scalars().all()


async def get_room(session: AsyncSession, room_id: str) -> Optional[Room]:
    result = await session.execute(select(Room).where(Room.id == room_id))
    return result.scalar_one_or_none()


# === Сообщения в комнатах ===

async def save_message(session: AsyncSession, room_id: str, username: str, text: str) -> Message:
    msg = Message(room_id=room_id, username=username, text=text)
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return msg


async def get_room_history(session: AsyncSession, room_id: str, limit: int = 100) -> list[Message]:
    result = await session.execute(
        select(Message)
        .where(Message.room_id == room_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    return list(reversed(messages))


# 🔥 === Личные сообщения ===

async def save_private_message(session: AsyncSession, from_user: str, to_user: str, text: str) -> PrivateMessage:
    msg = PrivateMessage(from_user=from_user, to_user=to_user, text=text)
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return msg


async def get_private_history(session: AsyncSession, user1: str, user2: str, limit: int = 100) -> list[PrivateMessage]:
    """Получить историю переписки между двумя пользователями."""
    result = await session.execute(
        select(PrivateMessage)
        .where(
            or_(
                and_(PrivateMessage.from_user == user1, PrivateMessage.to_user == user2),
                and_(PrivateMessage.from_user == user2, PrivateMessage.to_user == user1),
            )
        )
        .order_by(PrivateMessage.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    return list(reversed(messages))


async def get_conversations(session: AsyncSession, username: str) -> list[dict]:
    """Получить список пользователей, с которыми была переписка."""
    result = await session.execute(
        select(PrivateMessage)
        .where(
            or_(PrivateMessage.from_user == username, PrivateMessage.to_user == username)
        )
        .order_by(PrivateMessage.created_at.desc())
    )
    messages = result.scalars().all()

    # Собираем уникальных собеседников с датой последнего сообщения
    conversations = {}
    for msg in messages:
        other = msg.to_user if msg.from_user == username else msg.from_user
        if other not in conversations:
            conversations[other] = msg.created_at

    return [{"username": u, "last_message": t} for u, t in conversations.items()]