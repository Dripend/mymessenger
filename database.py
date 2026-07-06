from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.sql import func
from contextlib import contextmanager

DATABASE_URL = "sqlite:///./messenger.db"

engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

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


class PrivateMessage(Base):
    __tablename__ = "private_messages"
    id = Column(Integer, primary_key=True, index=True)
    from_user = Column(String(50), nullable=False, index=True)
    to_user = Column(String(50), nullable=False, index=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())


def init_db():
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_session():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()
