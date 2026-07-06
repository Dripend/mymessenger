from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

DATABASE_URL = "sqlite+aiosqlite:///./messenger.db"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=func.now())


class Room(Base):
    __tablename__ = "rooms"
    id = Column(String(100), primary_key=True)
    name = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False)
    owner_username = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=func.now())


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(100), ForeignKey("rooms.id"), nullable=False, index=True)
    username = Column(String(50), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())


# 🔥 НОВАЯ МОДЕЛЬ: Личные сообщения
class PrivateMessage(Base):
    __tablename__ = "private_messages"
    id = Column(Integer, primary_key=True, index=True)
    from_user = Column(String(50), nullable=False, index=True)
    to_user = Column(String(50), nullable=False, index=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session